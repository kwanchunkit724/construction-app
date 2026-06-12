-- =============================================================
-- v55-equipment-forms-schema.sql   (Feature: 地盤表格管理 + 手機簽署, F1)
-- =============================================================
-- Per the Fable design (.planning/ai-form-2026/FORM-SIGNING-PLAN.md §2). Additive
-- only — no change to live tables. Reuses the PTW pattern verbatim:
--   equipment_register + form_instances + form_signoffs (append-only, RPC-only
--   insert via record_form_signoff, mirroring permit_signoffs / record_ptw_signoff),
--   user_credentials (generalises the v48 green-card precedent), equipment_scans.
-- Tamper-evident (v51 audit_ledger trigger attached to all new tables) + identity-
-- bound (assert_step_up('form_signoff'), inherits the v54 rollout flag). Signing
-- needs a verified, in-date credential matching the template.
-- ALSO fixes a real bug: v51's watch-list named 'ptw_versions' (does not exist) —
-- the real table is 'permit_versions', so permit-version edits were UNAUDITED.
-- This migration adds 'permit_versions' to the audit loop.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- ── app_config flags / secret (ship dark; mirrors ptw_enabled / ptw_qr_secret) ─
alter table app_config add column if not exists forms_enabled boolean not null default false;
alter table app_config add column if not exists equipment_qr_secret text;

-- ── 1) Form template registry (seeded, admin-editable) ─────────
create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_zh text not null,
  slang_zh text,
  statutory_ref text,
  equipment_kind text not null,
  frequency_days int,
  remind_before_days int not null default 3,
  required_credential text not null,
  checklist jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

-- ── 2) Equipment / plant register ─────────────────────────────
create table if not exists equipment_register (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,
  ref_no text not null,
  name_zh text not null,
  brand_model text,
  serial_no text,
  location_zh text,
  photo_path text,
  status text not null default 'active' check (status in ('active','idle','offsite','retired')),
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, ref_no)
);

-- ── 3) Form instance = recurring requirement (equipment × template) ─
create table if not exists form_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  equipment_id uuid references equipment_register(id) on delete cascade,
  template_id uuid not null references form_templates(id) on delete restrict,
  location_zh text,
  assigned_signer_id uuid references user_profiles(id),
  last_signoff_id uuid,             -- deferred (PTW current_version_id pattern): plain uuid, no circular FK
  valid_until timestamptz,
  suspended boolean not null default false,
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (equipment_id, template_id)
);

-- ── 4) Sign-off events (append-only; the e-signature record) ───
create table if not exists form_signoffs (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references form_instances(id) on delete cascade,
  project_id uuid not null,
  result text not null check (result in ('pass','pass_with_remarks','fail')),
  payload jsonb not null default '{}'::jsonb,
  signed_by uuid not null references user_profiles(id) on delete restrict,
  signed_at timestamptz not null default now(),
  valid_until timestamptz,
  signature_b64 text not null,
  credential_id uuid,
  credential_snapshot jsonb,
  pdf_path text
);

-- ── 5) Qualified-person credentials (generalises v48 green card) ─
create table if not exists user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  credential_type text not null,
  cert_name_zh text not null,
  cert_no text,
  issuer text,
  valid_from date,
  valid_until date,
  doc_path text,
  verified_by uuid references user_profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── 6) Scan audit (mirror permit_scans) ───────────────────────
create table if not exists equipment_scans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment_register(id) on delete cascade,
  scanned_by uuid not null references user_profiles(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  jwt_payload_snapshot jsonb not null
);

create index if not exists idx_equipment_register_project on equipment_register(project_id);
create index if not exists idx_form_instances_project on form_instances(project_id);
create index if not exists idx_form_instances_validuntil on form_instances(valid_until);
create index if not exists idx_form_signoffs_instance on form_signoffs(instance_id);
create index if not exists idx_form_signoffs_project on form_signoffs(project_id);
create index if not exists idx_user_credentials_user on user_credentials(user_id);

-- ============================================================
-- RLS (copies the PTW v10 posture)
-- ============================================================
alter table form_templates    enable row level security;
alter table equipment_register enable row level security;
alter table form_instances    enable row level security;
alter table form_signoffs     enable row level security;
alter table user_credentials  enable row level security;
alter table equipment_scans   enable row level security;

-- form_templates: readable by any authenticated user (shared reference data); writes admin-only via RPC/dashboard.
drop policy if exists form_templates_select on form_templates;
create policy form_templates_select on form_templates for select to authenticated using (true);
drop policy if exists form_templates_admin_write on form_templates;
create policy form_templates_admin_write on form_templates for all to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin'))
  with check (exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin'));

-- equipment_register: members read; editors (pm/main_contractor/safety_officer) write.
drop policy if exists equipment_select on equipment_register;
create policy equipment_select on equipment_register for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists equipment_write on equipment_register;
create policy equipment_write on equipment_register for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and exists (select 1 from project_members m where m.project_id = equipment_register.project_id
                  and m.user_id = auth.uid() and m.status = 'approved'
                  and m.role in ('pm','main_contractor','safety_officer'))
  );
drop policy if exists equipment_update on equipment_register;
create policy equipment_update on equipment_register for update to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));

-- form_instances: members read; editors write.
drop policy if exists form_instances_select on form_instances;
create policy form_instances_select on form_instances for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists form_instances_write on form_instances;
create policy form_instances_write on form_instances for insert to authenticated
  with check (can_edit_project_progress(auth.uid(), project_id));
drop policy if exists form_instances_update on form_instances;
create policy form_instances_update on form_instances for update to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));

-- form_signoffs: members read; INSERT RPC-only (record_form_signoff).
drop policy if exists form_signoffs_select on form_signoffs;
create policy form_signoffs_select on form_signoffs for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists form_signoffs_no_direct_insert on form_signoffs;
create policy form_signoffs_no_direct_insert on form_signoffs for insert to authenticated
  with check (false);

-- user_credentials: owner manages own; co-members may read (eligibility visibility).
drop policy if exists user_credentials_select on user_credentials;
create policy user_credentials_select on user_credentials for select to authenticated
  using (user_id = auth.uid() or shares_project_with(user_id));
drop policy if exists user_credentials_own_insert on user_credentials;
create policy user_credentials_own_insert on user_credentials for insert to authenticated
  with check (user_id = auth.uid());
-- Owner may edit own rows EXCEPT verified_by/verified_at (set only by verify_user_credential RPC).
drop policy if exists user_credentials_own_update on user_credentials;
create policy user_credentials_own_update on user_credentials for update to authenticated
  using (user_id = auth.uid());

-- equipment_scans: members read (via equipment join); INSERT RPC-only.
drop policy if exists equipment_scans_select on equipment_scans;
create policy equipment_scans_select on equipment_scans for select to authenticated
  using (exists (select 1 from equipment_register e
                 where e.id = equipment_scans.equipment_id
                   and can_view_project(auth.uid(), e.project_id)));
drop policy if exists equipment_scans_no_direct_insert on equipment_scans;
create policy equipment_scans_no_direct_insert on equipment_scans for insert to authenticated
  with check (false);

-- A BEFORE-UPDATE guard so an owner cannot self-verify their own credential
-- (verified_by/at are set only by the verify_user_credential RPC, which flags it).
create or replace function guard_credential_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- definer RPC / service
  if coalesce(current_setting('app.credential_verify', true), 'off') = 'on' then
    return new;                                             -- sanctioned RPC path
  end if;
  -- non-sanctioned update: pin the verification columns to their OLD values
  if new.verified_by is distinct from old.verified_by then new.verified_by := old.verified_by; end if;
  if new.verified_at is distinct from old.verified_at then new.verified_at := old.verified_at; end if;
  return new;
end; $$;
drop trigger if exists trg_guard_credential_verify on user_credentials;
create trigger trg_guard_credential_verify before update on user_credentials
  for each row execute function guard_credential_verify();

-- ============================================================
-- RPCs (SECURITY DEFINER)
-- ============================================================

-- per-project equipment ref (mirror next_ptw_number) → 'EQ-001'
create table if not exists equipment_counters (
  project_id uuid primary key references projects(id) on delete cascade,
  next_no int not null default 1 check (next_no >= 1)
);
alter table equipment_counters enable row level security;  -- no policies; written only in the definer RPC

create or replace function next_equipment_ref(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  if not can_edit_project_progress(auth.uid(), p_project_id) then
    raise exception '沒有權限';
  end if;
  insert into equipment_counters (project_id) values (p_project_id) on conflict do nothing;
  select next_no into v_n from equipment_counters where project_id = p_project_id for update;
  update equipment_counters set next_no = v_n + 1 where project_id = p_project_id;
  return 'EQ-' || lpad(v_n::text, 3, '0');
end; $$;
grant execute on function next_equipment_ref(uuid) to authenticated;

-- record_form_signoff — the e-signature commit (mirrors record_ptw_signoff).
create or replace function record_form_signoff(
  p_instance_id uuid, p_result text, p_payload jsonb, p_signature_b64 text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_inst form_instances%rowtype;
  v_tmpl form_templates%rowtype;
  v_cred user_credentials%rowtype;
  v_valid_until timestamptz;
  v_id uuid;
  v_recip uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_result not in ('pass','pass_with_remarks','fail') then raise exception '無效結果'; end if;
  if p_signature_b64 is null or length(p_signature_b64) < 100 then raise exception '需要簽名'; end if;

  select * into v_inst from form_instances where id = p_instance_id;
  if v_inst.id is null then raise exception '找不到表格項目'; end if;
  if not can_view_project(v_uid, v_inst.project_id) then raise exception '沒有權限'; end if;

  select * into v_tmpl from form_templates where id = v_inst.template_id;

  -- step-up (no-op until step_up_enforced flips on, v54)
  perform assert_step_up('form_signoff');

  -- credential gate: signer must hold a verified, in-date credential matching the template.
  select * into v_cred from user_credentials c
   where c.user_id = v_uid
     and c.credential_type = v_tmpl.required_credential
     and c.verified_at is not null
     and (c.valid_until is null or c.valid_until >= current_date)
   order by c.valid_until desc nulls last
   limit 1;
  if v_cred.id is null then
    raise exception '你未有有效的合資格人士證明（需要 %）', v_tmpl.required_credential;
  end if;

  v_valid_until := case when v_tmpl.frequency_days is not null
                        then now() + (v_tmpl.frequency_days || ' days')::interval else null end;

  insert into form_signoffs (instance_id, project_id, result, payload, signed_by, valid_until,
                             signature_b64, credential_id, credential_snapshot)
  values (p_instance_id, v_inst.project_id, p_result, coalesce(p_payload,'{}'::jsonb), v_uid, v_valid_until,
          p_signature_b64, v_cred.id,
          jsonb_build_object('type', v_cred.credential_type, 'cert_no', v_cred.cert_no, 'valid_until', v_cred.valid_until))
  returning id into v_id;

  update form_instances
     set last_signoff_id = v_id,
         valid_until = v_valid_until,
         suspended = (p_result = 'fail')
   where id = p_instance_id;

  -- On fail: best-effort notify safety officers + assigned PMs (never break the signoff).
  if p_result = 'fail' then
    begin
      for v_recip in
        select unnest(assigned_pm_ids) from projects where id = v_inst.project_id
        union
        select active_role_holders(v_inst.project_id, 'safety_officer')
      loop
        if v_recip is not null and v_recip is distinct from v_uid then
          perform push_dispatcher(v_recip, jsonb_build_object(
            'heading_zh', '表格不合格 — 已停用',
            'content_zh', coalesce(v_tmpl.name_zh,'表格') || ' 檢查不合格，相關機械已標記停用',
            'deep_link', '/project/' || v_inst.project_id::text || '/equipment'));
        end if;
      end loop;
    exception when others then null;  -- push failure must not roll back the sign-off
    end;
  end if;

  return v_id;
end; $$;
revoke all on function record_form_signoff(uuid, text, jsonb, text) from public;
grant execute on function record_form_signoff(uuid, text, jsonb, text) to authenticated;

-- verify_user_credential — admin / assigned PM / safety_officer vouches (step-up gated).
create or replace function verify_user_credential(p_credential_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_priv boolean;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  select user_id into v_target from user_credentials where id = p_credential_id;
  if v_target is null then raise exception '找不到證書'; end if;

  -- privileged = admin OR (assigned PM / safety_officer of a project shared with the target)
  select (
    exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin')
    or exists (
      select 1 from project_members me
      join project_members them on them.project_id = me.project_id
      where me.user_id = auth.uid() and me.status = 'approved' and me.role in ('pm','safety_officer')
        and them.user_id = v_target and them.status = 'approved')
    or exists (
      select 1 from projects p join project_members them on them.project_id = p.id
      where auth.uid() = any(p.assigned_pm_ids) and them.user_id = v_target and them.status = 'approved')
  ) into v_priv;
  if not v_priv then raise exception '只有管理員 / PM / 安全主任可核實證書'; end if;

  perform assert_step_up('membership');  -- identity vouching is high-risk

  perform set_config('app.credential_verify', 'on', true);
  update user_credentials set verified_by = auth.uid(), verified_at = now() where id = p_credential_id;
end; $$;
revoke all on function verify_user_credential(uuid) from public;
grant execute on function verify_user_credential(uuid) to authenticated;

-- get_forms_dashboard — one round-trip counts + per-equipment rows for the boss view.
create or replace function get_forms_dashboard(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_counts jsonb; v_rows jsonb;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  if not can_view_project(auth.uid(), p_project_id) then raise exception '沒有權限'; end if;

  with inst as (
    select fi.*, ft.name_zh as tmpl_name, ft.remind_before_days, ft.code as tmpl_code,
           case
             when fi.suspended then 'suspended'
             when fi.valid_until is null then 'missing'
             when fi.valid_until < now() then 'expired'
             when fi.valid_until <= now() + (ft.remind_before_days || ' days')::interval then 'expiring'
             else 'valid'
           end as status
    from form_instances fi
    join form_templates ft on ft.id = fi.template_id
    where fi.project_id = p_project_id
  )
  select jsonb_build_object(
    'valid',    count(*) filter (where status = 'valid'),
    'expiring', count(*) filter (where status = 'expiring'),
    'expired',  count(*) filter (where status = 'expired'),
    'missing',  count(*) filter (where status = 'missing'),
    'suspended',count(*) filter (where status = 'suspended')
  ) into v_counts from inst;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instance_id', i.id, 'equipment_id', i.equipment_id, 'template_code', i.tmpl_code,
    'template_name', i.tmpl_name, 'equipment_name', e.name_zh, 'location', coalesce(i.location_zh, e.location_zh),
    'status', i.status, 'valid_until', i.valid_until, 'suspended', i.suspended
  ) order by (i.status='suspended') desc, (i.status='expired') desc, i.valid_until nulls first), '[]'::jsonb)
  into v_rows
  from inst i left join equipment_register e on e.id = i.equipment_id;

  return jsonb_build_object('counts', coalesce(v_counts,'{}'::jsonb), 'rows', v_rows);
end; $$;
grant execute on function get_forms_dashboard(uuid) to authenticated;

-- ============================================================
-- Tamper-evidence: extend the v51 audit watch-list + FIX permit_versions bug.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'approvals','site_instructions','si_versions','variation_orders','vo_versions',
    'permits_to_work','permit_versions','permit_signoffs',   -- permit_versions = the v51 typo fix
    'documents','document_versions','document_events',
    'progress_history','project_members','user_profiles',
    'equipment_register','form_instances','form_signoffs','user_credentials'  -- new forms tables
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_audit_ledger on %I', t);
      execute format('create trigger trg_audit_ledger after insert or update or delete on %I for each row execute function audit_ledger_append()', t);
    end if;
  end loop;
end$$;

-- ============================================================
-- Seed the v1 templates (admin-editable data; weekly forms remind T-1).
-- ============================================================
insert into form_templates (code, name_zh, slang_zh, statutory_ref, equipment_kind, frequency_days, remind_before_days, required_credential, checklist) values
 ('CSSR-F5','棚架檢查報告 (Form 5)','棚紙','Cap 59I Part VA reg 38A','scaffold',14,3,'competent_person',
   '[{"key":"ties","label_zh":"連牆/ 拉結穩固","required":true},{"key":"footing","label_zh":"地基 / 底座平穩","required":true},{"key":"platform","label_zh":"工作台板齊全無破損","required":true},{"key":"guardrail","label_zh":"護欄 / 踢腳板齊備","required":true},{"key":"access","label_zh":"上落통道安全","required":true}]'::jsonb),
 ('CSSR-F4','挖掘工程檢查 (Form 4)','掘地紙','Cap 59I reg 39(2)','excavation',7,1,'competent_person',
   '[{"key":"shoring","label_zh":"支撐 / 護土穩固","required":true},{"key":"water","label_zh":"積水 / 滲水情況","required":true},{"key":"edge","label_zh":"邊坡 / 堆料距離","required":true},{"key":"access","label_zh":"出入安全","required":true}]'::jsonb),
 ('LALG-F1','起重機械每週檢查 (LALG Form 1)','吊機週檢','Cap 59J reg','lifting_appliance',7,1,'competent_person',
   '[{"key":"wire","label_zh":"鋼絲繩 / 吊鏈狀況","required":true},{"key":"brake","label_zh":"制動 / 限位裝置","required":true},{"key":"hook","label_zh":"吊鈎 / 安全扣","required":true},{"key":"controls","label_zh":"操作裝置正常","required":true}]'::jsonb),
 ('LALG-F5','起重機械十二個月徹底檢驗 (LALG Form 5)','年檢','Cap 59J reg 6','lifting_appliance',365,14,'competent_examiner',
   '[{"key":"thorough","label_zh":"徹底檢驗完成","required":true},{"key":"loadtest","label_zh":"負荷測試 (如適用)","required":false},{"key":"defects","label_zh":"缺陷 / 跟進事項","required":false}]'::jsonb),
 ('SWP-WEEKLY','吊船每週檢查','吊船週檢','Cap 59AC','swp',7,1,'competent_person',
   '[{"key":"ropes","label_zh":"懸吊 / 安全鋼絲繩","required":true},{"key":"platform","label_zh":"工作台結構","required":true},{"key":"safety","label_zh":"安全裝置 / 防墜","required":true}]'::jsonb),
 ('SWP-6M','吊船六個月徹底檢驗','吊船半年檢','Cap 59AC','swp',180,14,'rpe',
   '[{"key":"thorough","label_zh":"徹底檢驗 + 負荷測試","required":true},{"key":"cert","label_zh":"檢驗證書編號","required":false}]'::jsonb)
on conflict (code) do nothing;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- objects: select count(*) from form_templates;  -> 6
--   -- denial: direct insert into form_signoffs as a member -> RLS with check(false) blocks.
--   -- record_form_signoff as an UNcredentialed signer -> raise 你未有有效的合資格人士證明.
--   -- record_form_signoff as a credentialed signer -> ok; form_instances.valid_until updated;
--   --   verify_integrity() still intact (audit trigger logged it).
--   -- get_forms_dashboard(project) -> counts + rows.
--   -- permit_versions now in the audit loop: select tgname from pg_trigger
--   --   where tgrelid='permit_versions'::regclass and tgname='trg_audit_ledger'; -> 1 row.
-- =============================================================
