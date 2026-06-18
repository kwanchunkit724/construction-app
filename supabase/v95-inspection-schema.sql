-- =============================================================
-- v95-inspection-schema.sql   (巡查 — recurring site inspection, manual-round MVP)
-- =============================================================
-- The 管工's anti-drop-off engine: a 巡查 round sweeps a set of floors/units for a
-- category (漏水 / 清潔 / 安全 / 其他). Each floor gets ONE mark (pass/fail/na) with
-- a photo + note; a 'fail' mark spawns a 即時問題 snag (v93 is_quick, floor-tagged)
-- linked back. Coverage = floors_marked / floors_total drives the "今日巡查 N/M 層"
-- bar. The issues table stays the single audit record; this layer just tracks the
-- sweep. MVP = manual one-shot round (recurrence cron + streak DEFERRED).
--
-- Mirrors the RISC (v89) shape with the review lessons baked in:
--   * BEFORE INSERT guards force the clean initial state (no forged status/actor).
--   * every policy + RPC carries project_module_enabled(..,'inspection').
--   * state transitions go through SECURITY DEFINER RPCs.
-- Two tables only (round carries its own floor set — no separate template table
-- until recurrence lands). New module 'inspection' defaults ON. Additive. zh-HK.
-- =============================================================

-- ── rounds ────────────────────────────────────────────────────────────────────
create table if not exists inspection_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  category text not null default 'other'
    check (category in ('leak','cleanliness','safety','defect','other')),
  floor_labels text[] not null default '{}',         -- the set to sweep, e.g. {G,1,2,…,30}
  status text not null default 'open'
    check (status in ('open','done','cancelled')),
  notes text,
  opened_by uuid not null references user_profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inspection_rounds_project on inspection_rounds (project_id, status, created_at desc);

-- ── marks (one per floor per round) ─────────────────────────────────────────────
create table if not exists inspection_marks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references inspection_rounds(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,  -- denormalised for RLS
  floor_label text not null,
  result text not null check (result in ('pass','fail','na')),
  note text,
  photos text[] not null default '{}',
  linked_issue_id uuid references issues(id) on delete set null,        -- the snag a 'fail' spawned
  marked_by uuid not null references user_profiles(id) on delete restrict,
  marked_at timestamptz not null default now(),
  unique (round_id, floor_label)
);
create index if not exists idx_inspection_marks_round on inspection_marks (round_id);

-- ── touch updated_at on rounds ──────────────────────────────────────────────────
create or replace function public.touch_inspection_round_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_inspection_round_touch on inspection_rounds;
create trigger trg_inspection_round_touch before update on inspection_rounds
  for each row execute function public.touch_inspection_round_updated_at();

-- ── insert guards (review lesson: clean initial state, server-stamped time) ──────
create or replace function public.guard_inspection_round_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.status := 'open';
    new.opened_at := now();
    new.closed_at := null;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_inspection_round_guard_insert on inspection_rounds;
create trigger trg_inspection_round_guard_insert before insert on inspection_rounds
  for each row execute function public.guard_inspection_round_insert();

create or replace function public.guard_inspection_mark_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_round_project uuid; v_round_status text;
begin
  if auth.uid() is not null then
    -- the mark's project must match its round's project (no cross-project mark)
    select project_id, status into v_round_project, v_round_status
      from inspection_rounds where id = new.round_id;
    if v_round_project is null then raise exception '找不到巡查'; end if;
    if v_round_project <> new.project_id then raise exception '巡查與項目不符'; end if;
    if v_round_status <> 'open' then raise exception '此巡查已結束，不可再標記'; end if;
    new.marked_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_inspection_mark_guard_insert on inspection_marks;
create trigger trg_inspection_mark_guard_insert before insert on inspection_marks
  for each row execute function public.guard_inspection_mark_insert();

-- ── RLS ──────────────────────────────────────────────────────────────────────────
alter table inspection_rounds enable row level security;
alter table inspection_marks  enable row level security;

drop policy if exists inspection_rounds_select on inspection_rounds;
create policy inspection_rounds_select on inspection_rounds for select to authenticated
  using (can_view_project(auth.uid(), project_id) and project_module_enabled(project_id, 'inspection'));

drop policy if exists inspection_rounds_insert on inspection_rounds;
create policy inspection_rounds_insert on inspection_rounds for insert to authenticated
  with check (
    opened_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'inspection')
  );

-- opener edits descriptive fields while open; admin always. Status transitions go
-- through close_inspection_round / cancel_inspection_round.
drop policy if exists inspection_rounds_update on inspection_rounds;
create policy inspection_rounds_update on inspection_rounds for update to authenticated
  using (
    ((opened_by = auth.uid() and status = 'open')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'inspection')
  )
  with check (
    ((opened_by = auth.uid() and status = 'open')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'inspection')
  );

drop policy if exists inspection_rounds_delete on inspection_rounds;
create policy inspection_rounds_delete on inspection_rounds for delete to authenticated
  using (
    (opened_by = auth.uid() and status = 'open')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

drop policy if exists inspection_marks_select on inspection_marks;
create policy inspection_marks_select on inspection_marks for select to authenticated
  using (can_view_project(auth.uid(), project_id) and project_module_enabled(project_id, 'inspection'));

drop policy if exists inspection_marks_insert on inspection_marks;
create policy inspection_marks_insert on inspection_marks for insert to authenticated
  with check (
    marked_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'inspection')
  );

-- a marker may correct their own mark, admin always (module-gated).
drop policy if exists inspection_marks_update on inspection_marks;
create policy inspection_marks_update on inspection_marks for update to authenticated
  using (
    (marked_by = auth.uid()
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'inspection')
  )
  with check (
    (marked_by = auth.uid()
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'inspection')
  );

drop policy if exists inspection_marks_delete on inspection_marks;
create policy inspection_marks_delete on inspection_marks for delete to authenticated
  using (
    (marked_by = auth.uid()
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'inspection')
  );

-- ── transitions ───────────────────────────────────────────────────────────────
create or replace function public.close_inspection_round(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_opener uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status, opened_by into v_project, v_status, v_opener
    from inspection_rounds where id = p_id;
  if v_project is null then raise exception '找不到巡查'; end if;
  if not project_module_enabled(v_project, 'inspection') then raise exception '巡查模組未啟用'; end if;
  if not (v_opener = v_uid or exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')) then
    raise exception '只有開立人或管理員可以結束巡查';
  end if;
  if v_status <> 'open' then raise exception '此巡查並非進行中'; end if;
  update inspection_rounds set status = 'done', closed_at = now() where id = p_id;
end;
$$;
grant execute on function public.close_inspection_round(uuid) to authenticated;

create or replace function public.cancel_inspection_round(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_opener uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status, opened_by into v_project, v_status, v_opener
    from inspection_rounds where id = p_id;
  if v_project is null then raise exception '找不到巡查'; end if;
  if not project_module_enabled(v_project, 'inspection') then raise exception '巡查模組未啟用'; end if;
  if not (v_opener = v_uid or exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')) then
    raise exception '只有開立人或管理員可以取消巡查';
  end if;
  if v_status <> 'open' then raise exception '此巡查並非進行中'; end if;
  update inspection_rounds set status = 'cancelled', closed_at = now() where id = p_id;
end;
$$;
grant execute on function public.cancel_inspection_round(uuid) to authenticated;

-- ── coverage (one round-trip for the list; avoids N+1 on mobile) ────────────────
create or replace function public.get_inspection_coverage(p_project_id uuid)
returns table (round_id uuid, total int, marked int, failed int)
language sql security definer stable set search_path = public as $$
  select r.id,
         coalesce(array_length(r.floor_labels, 1), 0) as total,
         count(distinct m.floor_label)::int as marked,
         count(*) filter (where m.result = 'fail')::int as failed
  from inspection_rounds r
  left join inspection_marks m on m.round_id = r.id
  where r.project_id = p_project_id
    and can_view_project(auth.uid(), p_project_id)
    and project_module_enabled(p_project_id, 'inspection')
  group by r.id, r.floor_labels;
$$;
grant execute on function public.get_inspection_coverage(uuid) to authenticated;

-- ── module catalogue: + 'inspection' (keeps all 18 prior keys → 19) ─────────────
create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key, coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing'),('ncr'),('risc'),('labour'),('controlled_docs'),('inspection')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select to_regclass('public.inspection_rounds') is not null
--      and to_regclass('public.inspection_marks')  is not null;               -> t
--   select count(*) = 19 from get_project_modules('<project-id>'::uuid);       -> t
--   select count(*) from pg_policies where tablename in ('inspection_rounds','inspection_marks'); -> 8
--   select count(*) from pg_trigger where tgname in
--     ('trg_inspection_round_touch','trg_inspection_round_guard_insert','trg_inspection_mark_guard_insert'); -> 3
--   -- insert a mark on a 'done' round -> RAISES '此巡查已結束，不可再標記'.
--   -- get_inspection_coverage returns (total, marked, failed) per round.
-- =============================================================
