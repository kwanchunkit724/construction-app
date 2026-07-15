-- =============================================================
-- v64-module-ripple-fixes.sql   (post-update audit — module-system ripple)
-- =============================================================
-- The v59 module system added `and project_module_enabled(project_id,'<key>')`
-- to 11 feature tables' RLS. Three ripple bugs the audit found:
--
--  1. ADMIN LOCKOUT. project_module_enabled has NO admin bypass, but ModuleGate
--     (src/components/ModuleGate.tsx) lets global_role='admin' INTO a
--     disabled-module route so they can manage it. Result: the admin reaches the
--     page but every RLS read returns 0 rows — they cannot actually see/manage
--     the data of a module they switched off. Fix: admins always pass the gate
--     (data layer now agrees with ModuleGate). Fixes PTW/SI/VO/all 11 tables at
--     once. Additive for non-admins (unchanged); only widens admin visibility,
--     which is already total via can_view_project's admin branch.
--
--  2. get_timetable LEAK. get_timetable (v34) is SECURITY DEFINER and reads the
--     materials table DIRECTLY, bypassing RLS — so material rows still appear in
--     the 行事曆 even when the 'materials' module is disabled for the project.
--     Fix: add the module conjunct to the material union branch. (The 'event'
--     branch needs none — the timetable route itself is module-gated, and
--     progress is core.)
--
--  3. MEMORY GRAPH module-parity. v62 made memory_recall / graph_neighbors obey
--     per-user PROGRESS visibility, but NOT the module switches: issue/document/
--     contact notes are still recalled by the AI even when that module is off for
--     the project. Fix: filter those entity types by their module (mirrors v62's
--     progress approach). progress = core (already visibility-filtered);
--     'project' notes = the project shell (never module-gated).
--
-- NOTE: the 'assistant' module gate on ai_enabled_for_project was ALREADY added
-- in v59-modules-rls-2.sql (467-473) — no change needed here.
-- Idempotent (create or replace). No table/data change. Apply on prod.
-- =============================================================

-- ── 1. project_module_enabled — admins always pass ───────────────────────────
create or replace function public.project_module_enabled(p_project_id uuid, p_module_key text)
returns boolean language sql security definer stable set search_path = public as $$
  -- v64: admins bypass the per-project module gate (they manage the switches;
  -- ModuleGate already routes them in, so the data layer must agree). For
  -- everyone else: absence = enabled (backwards-compat, v59).
  select
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or coalesce(
      (select enabled from project_modules where project_id = p_project_id and module_key = p_module_key),
      true
    );
$$;
grant execute on function public.project_module_enabled(uuid, text) to authenticated;

-- ── 2. get_timetable — material branch obeys the 'materials' module ───────────
-- Verbatim v34 body + ONE added conjunct on the material branch (line marked v64).
create or replace function get_timetable(
  p_project_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  source text,
  ref_id uuid,
  occurs_at timestamptz,
  title text,
  meta jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not user_is_admin() and not exists (
    select 1 from project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'not a member of this project';
  end if;

  return query
    select
      'material'::text as source,
      m.id as ref_id,
      coalesce(m.arrived_at, m.planned_arrival_at) as occurs_at,
      ('物料: ' || m.name || ' ' || m.qty_needed::text || ' ' || m.unit) as title,
      jsonb_build_object(
        'status', m.status,
        'qty_needed', m.qty_needed,
        'qty_arrived', m.qty_arrived,
        'item_ids', m.item_ids,
        'requested_by', m.requested_by
      ) as meta
    from materials m
    where m.project_id = p_project_id
      and coalesce(m.arrived_at, m.planned_arrival_at) between p_from and p_to
      and project_module_enabled(m.project_id, 'materials')   -- v64: don't leak materials when its module is off

    union all

    select
      'completion'::text,
      pi.id,
      (pi.planned_end::timestamp at time zone 'Asia/Hong_Kong') + interval '12 hours',
      ('完工: ' || pi.code || ' ' || pi.title),
      jsonb_build_object(
        'status', pi.status,
        'actual_progress', pi.actual_progress,
        'planned_progress', pi.planned_progress,
        'zone_id', pi.zone_id
      )
    from progress_items pi
    where pi.project_id = p_project_id
      and pi.planned_end is not null
      and (pi.planned_end::timestamp at time zone 'Asia/Hong_Kong') + interval '12 hours'
          between p_from and p_to
      and (
        user_is_admin()
        or can_manage_project_progress(auth.uid(), p_project_id)
        or auth.uid() = any(pi.assigned_to)
        or auth.uid() = any(pi.delegated_to)
      )

    union all

    select
      'event'::text,
      e.id,
      e.starts_at,
      e.title,
      jsonb_build_object(
        'description', e.description,
        'location', e.location,
        'ends_at', e.ends_at,
        'event_type', e.event_type,
        'created_by', e.created_by
      )
    from events e
    where e.project_id = p_project_id
      and e.starts_at between p_from and p_to

    order by 3;
end;
$$;
revoke all on function get_timetable(uuid, timestamptz, timestamptz) from public;
grant execute on function get_timetable(uuid, timestamptz, timestamptz) to authenticated;

-- ── 3a. memory_recall — issue/document/contact notes obey their module ────────
create or replace function memory_recall(p_project_id uuid, p_query text default null)
returns setof memory_notes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pat text := '%' || coalesce(p_query, '') || '%';
begin
  if not can_view_project(v_uid, p_project_id) then
    raise exception '無權限查看此項目的記憶圖譜';
  end if;

  return query
  select *
  from memory_notes m
  where m.project_id = p_project_id
    -- v62: progress notes obey per-user item visibility.
    and (m.entity_type <> 'progress'
         or m.entity_id in (select gv.id from get_visible_progress_items(p_project_id) gv))
    -- v64: issue/document/contact notes obey their per-project module switch.
    and (m.entity_type not in ('issue', 'document', 'contact')
         or project_module_enabled(m.project_id,
              case m.entity_type
                when 'issue' then 'issues'
                when 'document' then 'documents'
                when 'contact' then 'contacts'
              end))
    and (
      p_query is null
      or m.title ilike v_pat
      or m.summary ilike v_pat
      or exists (select 1 from unnest(m.tags) t where t ilike v_pat)
    )
  order by m.source_updated_at desc nulls last, m.updated_at desc
  limit 60;
end;
$$;
revoke all on function memory_recall(uuid, text) from public;
grant execute on function memory_recall(uuid, text) to authenticated;

-- ── 3b. graph_neighbors — same module-parity on focus + neighbours ────────────
create or replace function graph_neighbors(p_note_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_etype text;
  v_eid uuid;
  v_focus jsonb;
  v_neighbors jsonb;
begin
  select project_id, entity_type, entity_id into v_project, v_etype, v_eid
    from memory_notes where id = p_note_id;
  if v_project is null then
    raise exception '找不到記憶節點';
  end if;
  if not can_view_project(v_uid, v_project) then
    raise exception '無權限查看此項目的記憶圖譜';
  end if;
  -- v62: hide a progress focus the caller can't see.
  if v_etype = 'progress'
     and not exists (select 1 from get_visible_progress_items(v_project) gv where gv.id = v_eid) then
    raise exception '無權限查看此記憶節點';
  end if;
  -- v64: hide a focus whose module is off for this project.
  if v_etype in ('issue', 'document', 'contact')
     and not project_module_enabled(v_project,
           case v_etype when 'issue' then 'issues' when 'document' then 'documents' when 'contact' then 'contacts' end) then
    raise exception '無權限查看此記憶節點';
  end if;

  select to_jsonb(f) into v_focus
  from (select id, entity_type, title, summary from memory_notes where id = p_note_id) f;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_neighbors
  from (
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.to_note
    where l.from_note = p_note_id
      and (n.entity_type <> 'progress'
           or n.entity_id in (select gv.id from get_visible_progress_items(v_project) gv))
      and (n.entity_type not in ('issue', 'document', 'contact')
           or project_module_enabled(v_project,
                case n.entity_type when 'issue' then 'issues' when 'document' then 'documents' when 'contact' then 'contacts' end))
    union
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.from_note
    where l.to_note = p_note_id
      and (n.entity_type <> 'progress'
           or n.entity_id in (select gv.id from get_visible_progress_items(v_project) gv))
      and (n.entity_type not in ('issue', 'document', 'contact')
           or project_module_enabled(v_project,
                case n.entity_type when 'issue' then 'issues' when 'document' then 'documents' when 'contact' then 'contacts' end))
    limit 60
  ) x;

  return jsonb_build_object('note', v_focus, 'neighbors', v_neighbors);
end;
$$;
revoke all on function graph_neighbors(uuid) from public;
grant execute on function graph_neighbors(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- (1) admin bypass: as an admin on a project with 'materials' OFF →
--   --     select project_module_enabled('<P>'::uuid,'materials');  -> t  (admin)
--   --     as a non-admin member of <P> with materials OFF          -> f
--   -- (2) timetable: with materials OFF, get_timetable returns NO 'material' rows
--   --     for a non-admin; admin still sees them.
--   -- (3) memory: as a non-admin member with 'issues' OFF,
--   --     select count(*) from memory_recall('<P>'::uuid,null) where entity_type='issue'; -> 0
--   --     admin -> unchanged.
-- =============================================================
