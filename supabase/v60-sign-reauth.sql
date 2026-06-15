-- =============================================================
-- v60-sign-reauth.sql   (Signature non-repudiation #9 — 本人 proof for 勞工處)
-- =============================================================
-- GOAL: prove a signature was placed by 本人 (the actual account holder) so it
-- stands up to a 勞工處 dispute. APPROACH: require a PASSWORD RE-AUTH at the
-- moment of signing (re-enter the login password → proof of presence; no TOTP
-- enrollment, no lockout), gated by a rollout flag (OFF by default so the live
-- App-Store / web / Android clients are unaffected until the re-auth UI ships).
-- PLUS an exportable signature-proof certificate (get_signature_proof) that
-- bundles signer identity + credential + tamper-evidence (v51 audit_ledger) into
-- one human-readable attestation.
--
-- Builds on:
--   * v54-step-up-rollout-flag.sql  — the get/set/assert flag pattern MIRRORED here
--   * v53-step-up-enforce-rpcs.sql  — record_ptw_signoff CURRENT body (re-wired)
--   * v55-equipment-forms-schema.sql — record_form_signoff CURRENT body (re-wired),
--                                      form_signoffs + form_instances + form_templates
--   * v51-audit-ledger-tamper-evidence.sql — audit_ledger + verify_integrity
--   * v10-ptw-schema.sql            — permit_signoffs + permits_to_work + approvals
--
-- The re-auth grant is a SEPARATE axis from the v52/v54 step-up grant: step-up is
-- a TOTP/AAL2 elevation (high-risk approvals/role-changes); sign-reauth is a
-- fresh-password proof bound to the SIGNING moment specifically. Both gates can
-- be on at once (a signoff RPC asserts step-up THEN sign-reauth). The grant table
-- is written ONLY by the verify-sign-password Edge Function (service role), never
-- by a client — mirroring how step_up_grants is minted only after AAL2.
--
-- NOTE on identity column: user identity is on user_profiles.name (NOT
-- "full_name" — that column does not exist in this schema; see v2-schema.sql).
-- Phone is derived from the synthetic-email login (auth.users.email is
-- <digits>@phone.local; see src/lib/phone.ts) by stripping '@phone.local'.
--
-- Additive only. No destructive change to live tables. Idempotent. zh-HK. ASI.
-- =============================================================

-- ── 1. sign_reauth_grants — fresh-password proof, service-role-written ─────────
-- One row per user; upserted by the Edge Function on a correct password re-entry,
-- expiry = now + 5 min. assert_sign_reauth() reads it. RLS: the owner may SEE
-- their own grant (so the client can show "已驗證，5 分鐘內有效"); there is NO
-- insert/update/delete policy, so under RLS only the service role can write it.
create table if not exists sign_reauth_grants (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table sign_reauth_grants enable row level security;

drop policy if exists sign_reauth_grants_select_own on sign_reauth_grants;
create policy sign_reauth_grants_select_own on sign_reauth_grants
  for select to authenticated
  using (user_id = auth.uid());
-- NO insert / update / delete policy → only the service role (RLS-bypassing)
-- writes this table, exactly like step_up_grants is minted server-side.

-- ── 2. Rollout flag (mirror v54 step_up_enforced) ──────────────────────────────
alter table app_config add column if not exists sign_reauth_enforced boolean not null default false;

-- ── 3. assert_sign_reauth — the gate (mirror v54 assert_step_up) ──────────────
-- No-op while the flag is OFF so the existing (pre-reauth) clients keep signing
-- exactly as before. When ON: require a non-expired sign_reauth_grants row.
create or replace function assert_sign_reauth()
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  -- Rollout gate: until the re-auth UI is live on all clients, this is a no-op
  -- so existing clients are not blocked from signing.
  if not coalesce((select sign_reauth_enforced from app_config where id = 1), false) then
    return;
  end if;

  if v_uid is null then raise exception '未登入'; end if;
  if not exists (
    select 1 from sign_reauth_grants g
    where g.user_id = v_uid
      and g.expires_at > now()
  ) then
    raise exception '簽名前需要重新輸入密碼確認身份 (re-auth required)';
  end if;
end;
$$;
revoke all on function assert_sign_reauth() from public;
grant execute on function assert_sign_reauth() to authenticated;

-- ── 4. get / set flag (mirror v54 get/set_step_up_enforced exactly) ───────────
create or replace function get_sign_reauth_enforced()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select sign_reauth_enforced from app_config where id = 1), false) $$;
grant execute on function get_sign_reauth_enforced() to authenticated;

create or replace function set_sign_reauth_enforced(p_on boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin') then
    raise exception '只有管理員可以設定';
  end if;
  update app_config set sign_reauth_enforced = p_on where id = 1;
end;
$$;
revoke all on function set_sign_reauth_enforced(boolean) from public;
grant execute on function set_sign_reauth_enforced(boolean) to authenticated;

-- ── 5. RE-WIRE record_ptw_signoff(uuid, text) ─────────────────────────────────
-- Re-created VERBATIM from v53-step-up-enforce-rpcs.sql (its current body),
-- inserting ONE line `perform assert_sign_reauth();` AFTER the existing
-- authorization/permission checks (the '找不到對應嘅簽核紀錄' gate AND the
-- already-present v53 assert_step_up) and BEFORE the permit_signoffs insert.
-- Signature, security definer, search_path and grants preserved.
create or replace function record_ptw_signoff(
  p_ptw_id uuid,
  p_signature_b64 text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_approval_id uuid;
  v_signoff_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_signature_b64 is null or length(p_signature_b64) < 100 then
    raise exception '需要簽名';
  end if;
  select a.id
    into v_approval_id
    from approvals a
   where a.doc_type = 'ptw'
     and a.doc_id = p_ptw_id
     and a.actor_id = v_uid
     and not exists (select 1 from permit_signoffs s where s.approval_id = a.id)
   order by a.created_at desc
   limit 1;
  if v_approval_id is null then
    raise exception '找不到對應嘅簽核紀錄 — 請先批准呢張工作許可證';
  end if;
  -- v53 step-up: authorization (owns an unsigned approval) passed; require MFA grant before signing.
  perform assert_step_up('approval');
  -- v60 sign-reauth: require a fresh-password proof bound to THIS signing moment (non-repudiation).
  perform assert_sign_reauth();
  insert into permit_signoffs (approval_id, ptw_id, signature_b64)
  values (v_approval_id, p_ptw_id, p_signature_b64)
  returning id into v_signoff_id;
  return v_signoff_id;
end;
$$;
revoke all on function record_ptw_signoff(uuid, text) from public;
grant execute on function record_ptw_signoff(uuid, text) to authenticated;

-- ── 6. RE-WIRE record_form_signoff(uuid, text, jsonb, text) ───────────────────
-- Re-created VERBATIM from v55-equipment-forms-schema.sql (its current body),
-- inserting ONE line `perform assert_sign_reauth();` AFTER the existing
-- auth/permission checks (the '沒有權限' can_view_project gate, the already-present
-- v55 assert_step_up, AND the credential gate) and BEFORE the form_signoffs
-- insert. Signature, security definer, search_path and grants preserved.
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

  -- v60 sign-reauth: all auth + credential checks passed; require a fresh-password
  -- proof bound to THIS signing moment (non-repudiation) before the e-signature commit.
  perform assert_sign_reauth();

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

-- ── 7. get_signature_proof — the 本人 proof certificate (data layer) ───────────
-- Resolves a single signoff (ptw or form) into a self-contained proof object:
-- WHO signed (verified account identity + derived phone + project role), WHICH
-- credential backed it, WHAT was signed, WHEN, the re-auth method/posture, and
-- the tamper-evidence anchor (the audit_ledger head row for this signoff +
-- whole-chain integrity). Gated: caller must can_view_project on the signoff's
-- project, else raises. Definer (reads auth.users for the phone derivation).
create or replace function get_signature_proof(p_kind text, p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_signer uuid;
  v_signed_at timestamptz;
  v_credential jsonb := null;
  v_what jsonb;
  v_ledger_table text;
  v_signer_name text;
  v_signer_phone text;
  v_signer_role text;
  v_seq bigint;
  v_hash text;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_kind not in ('ptw','form') then raise exception '未知簽名類型: %', p_kind; end if;

  if p_kind = 'ptw' then
    -- permit_signoffs (id) -> approvals (approval_id) -> permits_to_work -> project.
    select pw.project_id, a.actor_id, ps.created_at,
           jsonb_build_object('kind', 'ptw', 'doc_id', pw.id, 'doc_number', pw.number,
                              'ptw_type', pw.ptw_type, 'project_id', pw.project_id, 'project', p.name)
      into v_project, v_signer, v_signed_at, v_what
      from permit_signoffs ps
      join approvals a on a.id = ps.approval_id
      join permits_to_work pw on pw.id = a.doc_id
      join projects p on p.id = pw.project_id
     where ps.id = p_id;
    if v_project is null then raise exception '找不到簽名紀錄'; end if;
    v_ledger_table := 'permit_signoffs';
  else
    -- form_signoffs (id) -> form_instances -> form_templates; signer = signed_by;
    -- credential from credential_snapshot.
    select fs.project_id, fs.signed_by, fs.signed_at, fs.credential_snapshot,
           jsonb_build_object('kind', 'form', 'doc_id', fs.id, 'doc_number', ft.code,
                              'template', ft.name_zh, 'result', fs.result,
                              'project_id', fs.project_id, 'project', p.name)
      into v_project, v_signer, v_signed_at, v_credential, v_what
      from form_signoffs fs
      join form_instances fi on fi.id = fs.instance_id
      join form_templates ft on ft.id = fi.template_id
      join projects p on p.id = fs.project_id
     where fs.id = p_id;
    if v_project is null then raise exception '找不到簽名紀錄'; end if;
    v_ledger_table := 'form_signoffs';
  end if;

  -- Gate AFTER resolving the project (so a not-found id and an unauthorised id are
  -- both handled; an unauthorised caller gets a permission error, not data).
  if not can_view_project(v_uid, v_project) then
    raise exception '你冇權查看呢個簽名證明';
  end if;

  -- Signer identity: name from user_profiles, phone derived from the synthetic
  -- login email (strip '@phone.local'), project role from the approved membership.
  select up.name into v_signer_name from user_profiles up where up.id = v_signer;
  select split_part(u.email, '@', 1) into v_signer_phone
    from auth.users u where u.id = v_signer and u.email like '%@phone.local';
  select m.role into v_signer_role
    from project_members m
   where m.project_id = v_project and m.user_id = v_signer and m.status = 'approved'
   limit 1;

  -- Tamper-evidence anchor: the head audit_ledger row for THIS signoff row.
  select al.seq, encode(al.hash, 'hex')
    into v_seq, v_hash
    from audit_ledger al
   where al.table_name = v_ledger_table
     and al.row_pk = p_id::text
   order by al.seq desc
   limit 1;

  return jsonb_build_object(
    'signer', jsonb_build_object(
      'name', v_signer_name,
      'phone', v_signer_phone,
      'role', v_signer_role
    ),
    'credential', v_credential,
    'what_signed', v_what,
    'signed_at', v_signed_at,
    'signature_present', true,
    'reauth', jsonb_build_object(
      'enforced', get_sign_reauth_enforced(),
      'method', 'password'
    ),
    'tamper_evidence', jsonb_build_object(
      'table', v_ledger_table,
      'ledger_seq', v_seq,
      'ledger_hash', v_hash,
      'integrity', verify_integrity(0)
    ),
    'attestation_zh',
      '本簽名由已驗證帳戶 ' || coalesce(v_signer_name, '（未知）')
      || '（電話 ' || coalesce(v_signer_phone, '未提供') || '）於 '
      || coalesce(to_char(v_signed_at at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI'), '未知時間')
      || '（香港時間）簽署，並以雜湊鏈防篡改記錄（帳本序號 '
      || coalesce(v_seq::text, '未記錄') || '）。'
  );
end;
$$;
revoke all on function get_signature_proof(text, uuid) from public;
grant execute on function get_signature_proof(text, uuid) to authenticated;

comment on function get_signature_proof(text, uuid) is
  'v60 signature non-repudiation proof. p_kind in (ptw|form). Gated to can_view_project on the signoff project. Returns signer identity (name/phone/role), credential snapshot, what_signed, signed_at, reauth posture (password method + enforced flag), tamper-evidence (audit_ledger head row + verify_integrity), and a zh-HK attestation sentence. Powers SignatureProofCard + 匯出簽名證明 (PDF).';

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- 1. objects present:
--   --   select column_name from information_schema.columns
--   --    where table_name='app_config' and column_name='sign_reauth_enforced';   -- 1 row
--   --   select to_regclass('public.sign_reauth_grants');                          -- not null
--   --   select proname from pg_proc where proname in
--   --    ('assert_sign_reauth','get_sign_reauth_enforced','set_sign_reauth_enforced',
--   --     'get_signature_proof','record_ptw_signoff','record_form_signoff');       -- 6 rows
--   -- 2. flag OFF by default -> select get_sign_reauth_enforced();  -> false
--   --    so record_ptw_signoff / record_form_signoff behave EXACTLY as before
--   --    (assert_sign_reauth returns immediately; live clients unaffected).
--   -- 3. RLS: a member cannot directly insert/update sign_reauth_grants
--   --    (no write policy); they CAN select only their own row.
--   -- 4. After the verify-sign-password Edge Function upserts a grant and
--   --    select set_sign_reauth_enforced(true):
--   --      record_ptw_signoff(<ptw>, <sig>) WITHOUT a fresh grant ->
--   --        raise '簽名前需要重新輸入密碼確認身份 (re-auth required)'
--   --      with a non-expired grant -> succeeds.
--   -- 5. get_signature_proof('ptw', <permit_signoffs.id>) and
--   --    get_signature_proof('form', <form_signoffs.id>) as a project member ->
--   --    jsonb with signer/credential/what_signed/tamper_evidence/attestation_zh;
--   --    as a non-member -> raise 你冇權查看呢個簽名證明.
-- =============================================================
