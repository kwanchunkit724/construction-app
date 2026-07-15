-- =============================================================
-- v34-realworld-sim-fixes.sql — 4 backend fixes from the real-workflow simulation
-- =============================================================
-- Idempotent. Apply on prod.
-- =============================================================

-- ── 1) P0: PTW QR is completely dead ─────────────────────────
-- mint_ptw_jwt(uuid) was `revoke all ... from public` (v10:333) and NEVER
-- granted to authenticated, so the client supabase.rpc('mint_ptw_jwt') call
-- (PtwDetail) returns permission-denied and no QR ever renders → the
-- inspector / fire-watch scan loop can never start. The function is SECURITY
-- DEFINER, enforces status='active' + non-null expiry, and reads the signing
-- secret server-side (never returns it), so granting execute is safe.
grant execute on function mint_ptw_jwt(uuid) to authenticated;

-- ── 2) P1: 行事曆 leaks every progress item to assigned-only workers ──
-- get_timetable's 'completion' union branch SELECTed EVERY progress_items row
-- in the project (code/title/進度), bypassing the v27 per-item contributor
-- visibility. A worker assigned one leaf could enumerate the whole site. Narrow
-- the completion branch to: admin / project supervisor (can_manage) / or the
-- viewer is assigned/delegated on that item. Material + event sources stay
-- project-wide (their own tables already expose project-wide reads).
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
      -- v34: contributors only see completion markers for items assigned to them.
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

-- ── 3) P1: delegated worker's progress tick saved but audit-history denied ──
-- progress_items UPDATE allows assigned_to/delegated_to (v15), so a worker's
-- tick saves; but the progress_history INSERT policy still gated on
-- can_edit_project_progress (which excludes worker + ignores assignment), so
-- the history row was silently RLS-denied → audit gaps for exactly the
-- contributor updates that matter most for disputes. Re-gate on
-- can_update_progress_item (admin/PM/supervisor OR assigned/delegated).
drop policy if exists "Editors insert progress history" on progress_history;
create policy "Assignees or managers insert progress history"
  on progress_history for insert to authenticated
  with check (
    exists (
      select 1 from progress_items pi
      where pi.id = item_id
        and can_update_progress_item(auth.uid(), pi.id)
    )
  );

-- ── 4) P1: 工地主任 (general_foreman) 加物料 INSERT rejected ──
-- Client shows 加物料 for general_foreman, but materials_insert allowlisted only
-- admin/pm/main_contractor/subcontractor (v16 fixed UPDATE/DELETE via
-- is_material_supervisor but never re-created INSERT). Add general_foreman so
-- client + server agree (general_foreman is already a materials supervisor for
-- UPDATE/DELETE).
drop policy if exists materials_insert on materials;
create policy materials_insert on materials for insert to authenticated
  with check (
    requested_by = auth.uid()
    and (
      user_is_admin()
      or exists (
        select 1 from project_members pm
        join user_profiles up on up.id = pm.user_id
        where pm.project_id = materials.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and up.global_role in ('admin','pm','main_contractor','subcontractor','general_foreman')
      )
    )
  );
