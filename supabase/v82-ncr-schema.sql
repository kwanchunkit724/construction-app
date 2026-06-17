-- =============================================================
-- v82-ncr-schema.sql   (不符合事項報告 / 糾正措施 — NCR / CAR)
-- =============================================================
-- A Non-Conformity Report (NCR) with its Corrective Action Request (CAR) is the
-- formal quality artifact that ISO 9001 / DWSS quality control hangs off: work
-- that fails a spec / drawing / standard is RAISED, routed to the responsible
-- party who submits a root-cause + corrective + preventive action, then VERIFIED
-- and CLOSED. This is distinct from a site 問題 (issue) — it carries the
-- spec reference, severity, the three quality actions, a target close date, and
-- an explicit verified close-out for dispute survival.
--
-- State machine (all transitions are SECURITY DEFINER RPCs so the gate cannot be
-- bypassed by a direct UPDATE):
--   open ── submit_ncr_corrective ──▶ corrective_submitted ── close_ncr ──▶ closed
--    ▲                                        │                               │
--    └──────────── reopen_ncr ◀───────────────┴──── reopen_ncr ◀─────────────┘
--   open / corrective_submitted ── void_ncr ──▶ void   (raiser or admin)
--
-- Additive — ONE new table + RPCs only (CLAUDE.md: new tables only). The 'ncr'
-- module key defaults ON (absence = enabled).
--
-- NOTE on the table name: a throwaway *simulation* table already squats the
-- name `ncrs` (all-text columns, project_id default 'PROJ001', admin-read-only,
-- seeded by the daily-sim harness — not a real feature). To avoid clobbering it
-- (CLAUDE.md: never destructive on existing data) the real production table is
-- named `ncr_reports`. The module key / route / UI remain "ncr".
-- =============================================================

create table if not exists ncr_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,                              -- NCR-001 (per-project serial)
  title text not null,
  description text not null,                         -- the non-conformity
  location text,
  spec_ref text,                                     -- clause / drawing / standard breached
  severity text not null default 'major'
    check (severity in ('minor','major','critical')),
  responsible_party text,                            -- 分判 / 判頭 / trade responsible
  status text not null default 'open'
    check (status in ('open','corrective_submitted','closed','void')),
  raised_by uuid not null references user_profiles(id) on delete restrict,
  target_close_date date,
  -- CAR fields — filled by the responsible party during the corrective phase.
  root_cause text,
  corrective_action text,
  preventive_action text,
  corrective_by uuid references user_profiles(id) on delete restrict,
  corrective_at timestamptz,
  -- Verified close-out.
  closed_by uuid references user_profiles(id) on delete restrict,
  closed_at timestamptz,
  photos text[] not null default '{}',               -- issue-photos bucket paths
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ncr_project_status
  on ncr_reports (project_id, status, created_at desc);

create or replace function public.touch_ncr_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_ncr_touch on ncr_reports;
create trigger trg_ncr_touch before update on ncr_reports
  for each row execute function public.touch_ncr_updated_at();

alter table ncr_reports enable row level security;

-- SELECT: any project viewer, module-gated.
drop policy if exists ncr_select on ncr_reports;
create policy ncr_select on ncr_reports for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'ncr')
  );

-- INSERT (raise): editors, authoring as themselves, module on.
drop policy if exists ncr_insert on ncr_reports;
create policy ncr_insert on ncr_reports for insert to authenticated
  with check (
    raised_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'ncr')
  );

-- UPDATE: only the raiser may edit the descriptive fields WHILE STILL OPEN
-- (typo fixes before anyone responds); admin may always correct the record. All
-- stateful transitions go through the SECURITY DEFINER RPCs below, which bypass
-- this policy — so status/CAR/close fields can never be forged by a direct write.
drop policy if exists ncr_update on ncr_reports;
create policy ncr_update on ncr_reports for update to authenticated
  using (
    (raised_by = auth.uid() and status = 'open')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  )
  with check (
    (raised_by = auth.uid() and status = 'open')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

-- DELETE: raiser while open, or admin.
drop policy if exists ncr_delete on ncr_reports;
create policy ncr_delete on ncr_reports for delete to authenticated
  using (
    (raised_by = auth.uid() and status = 'open')
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

-- Per-project serial → NCR-001.
create or replace function public.next_ncr_number(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_seq_name text := 'ncr_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'NCR-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function public.next_ncr_number(uuid) to authenticated;

-- Editor gate (mirrors can_edit_project_progress) — kept inline for the RPCs.
-- Submit the corrective action (CAR). Any project editor may respond. open →
-- corrective_submitted; stamps corrective_by/at.
create or replace function public.submit_ncr_corrective(
  p_id uuid, p_root_cause text, p_corrective_action text, p_preventive_action text
) returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  if not can_edit_project_progress(v_uid, v_project) then
    raise exception '沒有權限提交糾正措施';
  end if;
  if v_status <> 'open' then raise exception 'NCR 並非待糾正狀態'; end if;
  if coalesce(trim(p_corrective_action), '') = '' then raise exception '請填寫糾正措施'; end if;
  update ncr_reports
     set root_cause = p_root_cause,
         corrective_action = p_corrective_action,
         preventive_action = p_preventive_action,
         corrective_by = v_uid, corrective_at = now(),
         status = 'corrective_submitted'
   where id = p_id;
end;
$$;
grant execute on function public.submit_ncr_corrective(uuid, text, text, text) to authenticated;

-- Verify + close. Gate: admin / assigned PM / approved pm|main_contractor.
-- corrective_submitted → closed; stamps closed_by/at.
create or replace function public.close_ncr(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then
    raise exception '只有管理員 / PM / 總承建商可以核實關閉 NCR';
  end if;
  if v_status <> 'corrective_submitted' then raise exception 'NCR 並非待核實狀態'; end if;
  update ncr_reports set closed_by = v_uid, closed_at = now(), status = 'closed' where id = p_id;
end;
$$;
grant execute on function public.close_ncr(uuid) to authenticated;

-- Reopen a submitted/closed NCR back to open (corrective rejected). Same
-- verifier gate. Clears the close stamps; keeps the prior CAR text for history.
create or replace function public.reopen_ncr(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then
    raise exception '只有管理員 / PM / 總承建商可以重開 NCR';
  end if;
  if v_status not in ('corrective_submitted','closed') then raise exception 'NCR 狀態不可重開'; end if;
  update ncr_reports set status = 'open', closed_by = null, closed_at = null where id = p_id;
end;
$$;
grant execute on function public.reopen_ncr(uuid) to authenticated;

-- Void (cancel) — raiser or admin, before close.
create or replace function public.void_ncr(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_raiser uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status, raised_by into v_project, v_status, v_raiser from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  if not (
    v_raiser = v_uid
    or exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
  ) then
    raise exception '只有提出人或管理員可以作廢 NCR';
  end if;
  if v_status = 'closed' then raise exception '已關閉的 NCR 不可作廢'; end if;
  update ncr_reports set status = 'void' where id = p_id;
end;
$$;
grant execute on function public.void_ncr(uuid) to authenticated;

-- Extend the module catalogue RPC with 'ncr' (and keep 'cleansing' from v81).
create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key,
         coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing'),('ncr')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.ncr_reports') is not null;                          -> t
--   select count(*) = 15 from get_project_modules('<project-id>'::uuid);     -> t (13 + cleansing + ncr)
--   select project_module_enabled('<project-id>'::uuid, 'ncr');             -> t
--   select next_ncr_number('<project-id>'::uuid);                           -> 'NCR-001'
--   select count(*) from pg_policies where tablename='ncr_reports';                -> 4
--   select count(*) from pg_proc where proname in
--     ('next_ncr_number','submit_ncr_corrective','close_ncr','reopen_ncr','void_ncr','touch_ncr_updated_at'); -> 6
-- =============================================================
