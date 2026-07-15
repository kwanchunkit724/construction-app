-- =============================================================
-- v81-cleansing-schema.sql   (清潔檢查 — Cleansing Inspection, DWSS 模組 ④)
-- =============================================================
-- DEVB TC(W) No. 2/2023 Annex A lists a "Cleansing" record among the statutory
-- site modules of a Digital Works Supervision System: a dated, signed
-- site-cleanliness inspection with a checklist, photos and a verifier. CK
-- already carries the evidence spine these records hang off — per-project
-- serials (next_*_number), append-only photo_metadata (v79), the tamper-evident
-- audit_ledger, and module switches (v59). This migration adds the cleansing
-- record on top of that spine: a numbered (CLEAN-001), dated, checklisted,
-- photo-able inspection that an editor records and a manager verifies.
--
-- Additive — ONE new table + its RPCs only; no change to any existing table
-- (CLAUDE.md: new tables only, never destructive on live data). The new
-- 'cleansing' module key defaults ON (absence = enabled), so existing projects
-- gain the surface without any backfill.
-- =============================================================

create table if not exists cleansing_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,                            -- CLEAN-001 (per-project serial)
  inspected_on date not null,
  frequency text not null default 'daily'
    check (frequency in ('daily','weekly','ad_hoc')),
  area text not null,                              -- 檢查範圍 (e.g. 3/F 走廊, 地盤出入口)
  checklist jsonb not null default '[]'::jsonb,    -- [{label, status:'pass'|'fail'|'na', remark}]
  result text not null default 'pass'
    check (result in ('pass','pass_with_remarks','fail')),
  notes text,
  photos text[] not null default '{}',             -- issue-photos bucket storage paths
  created_by uuid not null references user_profiles(id) on delete restrict,
  verified_by uuid references user_profiles(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cleansing_project_date
  on cleansing_inspections (project_id, inspected_on desc);

-- updated_at touch trigger (self-contained — does not depend on a shared fn).
create or replace function public.touch_cleansing_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_cleansing_touch on cleansing_inspections;
create trigger trg_cleansing_touch before update on cleansing_inspections
  for each row execute function public.touch_cleansing_updated_at();

alter table cleansing_inspections enable row level security;

-- SELECT: any project viewer, module-gated (hidden when an admin turns the
-- cleansing module OFF for the project).
drop policy if exists cleansing_select on cleansing_inspections;
create policy cleansing_select on cleansing_inspections for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'cleansing')
  );

-- INSERT: editors (admin / assigned PM / approved pm|main_contractor|subcontractor —
-- the can_edit_project_progress gate), authoring as themselves, module on.
drop policy if exists cleansing_insert on cleansing_inspections;
create policy cleansing_insert on cleansing_inspections for insert to authenticated
  with check (
    created_by = auth.uid()
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'cleansing')
  );

-- UPDATE: the author may edit their own record WHILE IT IS NOT YET VERIFIED.
-- Once verified the record locks (verify is a one-way, attributable close-out).
-- verify_cleansing() is SECURITY DEFINER and sets verified_* outside this policy.
-- Admin may always edit (correction of record).
drop policy if exists cleansing_update on cleansing_inspections;
create policy cleansing_update on cleansing_inspections for update to authenticated
  using (
    (created_by = auth.uid() and verified_at is null)
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  )
  with check (
    (created_by = auth.uid() and verified_at is null)
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

-- DELETE: author (pre-verify) or admin.
drop policy if exists cleansing_delete on cleansing_inspections;
create policy cleansing_delete on cleansing_inspections for delete to authenticated
  using (
    (created_by = auth.uid() and verified_at is null)
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

-- Per-project serial → CLEAN-001 (mirrors next_ptw_number's sequence-per-project
-- pattern). One sequence per project, created lazily on first use.
create or replace function public.next_cleansing_number(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_seq_name text := 'cleansing_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'CLEAN-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function public.next_cleansing_number(uuid) to authenticated;

-- Manager verification (one-way close-out). Gate: admin / assigned PM / approved
-- pm|main_contractor|safety_officer. SECURITY DEFINER so it can stamp verified_*
-- (the UPDATE policy locks the row to the author pre-verify). Idempotent — a
-- second call on an already-verified row is a no-op (where verified_at is null).
create or replace function public.verify_cleansing(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id into v_project from cleansing_inspections where id = p_id;
  if v_project is null then raise exception '找不到清潔檢查記錄'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor','safety_officer'))
  ) then
    raise exception '只有管理員 / PM / 總承建商 / 安全主任可以核實清潔檢查';
  end if;
  update cleansing_inspections
     set verified_by = v_uid, verified_at = now()
   where id = p_id and verified_at is null;
end;
$$;
grant execute on function public.verify_cleansing(uuid) to authenticated;

-- Extend the module catalogue RPC with the new 'cleansing' key so the admin
-- toggle (AdminProjectModules) and ModulesContext see its effective state.
-- (project_module_enabled already coalesces absence to true, so the surface is
-- ON for every project until an admin flips it.)
create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key,
         coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.cleansing_inspections') is not null;            -> t
--   select count(*) = 14 from get_project_modules('<project-id>'::uuid);       -> t (13 + cleansing)
--   select project_module_enabled('<project-id>'::uuid, 'cleansing');          -> t (absence = on)
--   select next_cleansing_number('<project-id>'::uuid);                        -> 'CLEAN-001'
--   select next_cleansing_number('<project-id>'::uuid);                        -> 'CLEAN-002'
--   -- RLS: a non-member select returns 0 rows; an editor insert (created_by=self) succeeds;
--   -- verify_cleansing as a non-manager raises; as a PM stamps verified_by/at.
-- =============================================================
