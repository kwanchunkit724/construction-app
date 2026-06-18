-- =============================================================
-- v89-risc-schema.sql   (申請檢查 / 驗收 — Request for Inspection, RISC-lite)
-- =============================================================
-- DWSS-aligned next-tier module. A contractor RAISES a request that work is ready
-- for inspection (rebar / formwork / concreting / … / completion); an inspector
-- (RE / clerk-of-works / PM / main contractor) responds PASS or FAIL with a
-- comment, signed + timestamped + attributable. Mirrors the NCR (v82/v84) shape,
-- with the review lessons baked in from the start:
--   * BEFORE INSERT guard forces the clean initial state (status='submitted',
--     no inspected_*/result) → no forged-passed-record at INSERT (review HIGH).
--   * UPDATE policy carries the module gate (review v85 consistency).
--   * verdict transition is a SECURITY DEFINER RPC (gate can't be bypassed).
-- Additive; new table only. 'risc' module defaults ON. zh-HK. ASI.
-- =============================================================

create table if not exists risc_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,                              -- RISC-001
  title text not null,
  work_type text not null default 'other'
    check (work_type in ('rebar','formwork','concreting','masonry','waterproofing',
                         'finishes','mep','drainage','completion','other')),
  location text,
  spec_ref text,                                     -- drawing / clause being inspected against
  proposed_at timestamptz,                           -- when work is ready / proposed inspection time
  description text,
  status text not null default 'submitted'
    check (status in ('submitted','passed','failed','cancelled')),
  raised_by uuid not null references user_profiles(id) on delete restrict,
  result_comment text,
  inspected_by uuid references user_profiles(id) on delete restrict,
  inspected_at timestamptz,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_risc_project_status on risc_requests (project_id, status, created_at desc);

create or replace function public.touch_risc_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_risc_touch on risc_requests;
create trigger trg_risc_touch before update on risc_requests
  for each row execute function public.touch_risc_updated_at();

-- BEFORE INSERT guard (review lesson): an authenticated client can never self-set
-- the inspection outcome at insert. Only inspect_risc() sets those (via UPDATE).
create or replace function public.guard_risc_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.status := 'submitted';
    new.inspected_by := null;
    new.inspected_at := null;
    new.result_comment := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_risc_guard_insert on risc_requests;
create trigger trg_risc_guard_insert before insert on risc_requests
  for each row execute function public.guard_risc_insert();

alter table risc_requests enable row level security;

drop policy if exists risc_select on risc_requests;
create policy risc_select on risc_requests for select to authenticated
  using (can_view_project(auth.uid(), project_id) and project_module_enabled(project_id, 'risc'));

drop policy if exists risc_insert on risc_requests;
create policy risc_insert on risc_requests for insert to authenticated
  with check (
    raised_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'risc')
  );

-- UPDATE: raiser may edit the descriptive fields WHILE STILL 'submitted'; admin
-- always. Module-gated (review v85). Inspection verdict goes through inspect_risc.
drop policy if exists risc_update on risc_requests;
create policy risc_update on risc_requests for update to authenticated
  using (
    ((raised_by = auth.uid() and status = 'submitted')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'risc')
  )
  with check (
    ((raised_by = auth.uid() and status = 'submitted')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    and project_module_enabled(project_id, 'risc')
  );

drop policy if exists risc_delete on risc_requests;
create policy risc_delete on risc_requests for delete to authenticated
  using (
    (raised_by = auth.uid() and status = 'submitted')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

create or replace function public.next_risc_number(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_seq_name text := 'risc_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'RISC-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function public.next_risc_number(uuid) to authenticated;

-- Inspector verdict. Gate: admin / assigned PM / approved pm|main_contractor.
-- submitted → passed|failed; stamps inspected_by/at + comment.
create or replace function public.inspect_risc(p_id uuid, p_result text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_result not in ('pass','fail') then raise exception '無效結果'; end if;
  select project_id, status into v_project, v_status from risc_requests where id = p_id;
  if v_project is null then raise exception '找不到檢查申請'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then
    raise exception '只有管理員 / PM / 總承建商可以檢查驗收';
  end if;
  if v_status <> 'submitted' then raise exception '此申請並非待檢查狀態'; end if;
  update risc_requests
     set status = case when p_result = 'pass' then 'passed' else 'failed' end,
         inspected_by = v_uid, inspected_at = now(), result_comment = p_comment
   where id = p_id;
end;
$$;
grant execute on function public.inspect_risc(uuid, text, text) to authenticated;

-- Cancel (raiser or admin, before a verdict).
create or replace function public.cancel_risc(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_raiser uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select status, raised_by into v_status, v_raiser from risc_requests where id = p_id;
  if v_raiser is null then raise exception '找不到檢查申請'; end if;
  if not (v_raiser = v_uid or exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')) then
    raise exception '只有提出人或管理員可以取消';
  end if;
  if v_status <> 'submitted' then raise exception '已檢查的申請不可取消'; end if;
  update risc_requests set status = 'cancelled' where id = p_id;
end;
$$;
grant execute on function public.cancel_risc(uuid) to authenticated;

-- Extend the module catalogue with 'risc' (keeps cleansing + ncr).
create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key, coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing'),('ncr'),('risc')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.risc_requests') is not null;                 -> t
--   select count(*) = 16 from get_project_modules('<project-id>'::uuid);     -> t (14 + ncr + risc)
--   select next_risc_number('<project-id>'::uuid);                          -> 'RISC-001'
--   select count(*) from pg_policies where tablename='risc_requests';        -> 4
--   select count(*) from pg_trigger where tgname in ('trg_risc_touch','trg_risc_guard_insert'); -> 2
--   select count(*) from pg_proc where proname in ('next_risc_number','inspect_risc','cancel_risc'); -> 3
--   -- forgery blocked: authed insert with status='passed',inspected_by=<pm> -> lands status='submitted', inspected_by NULL.
-- =============================================================
