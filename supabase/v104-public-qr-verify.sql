-- =============================================================
-- v104-public-qr-verify.sql
-- =============================================================
-- PUBLIC QR verification: anyone (no login, no membership) can scan a PTW or
-- equipment QR and see a minimal authenticity/validity page. The server-signed
-- JWT (mint_ptw_jwt / mint_equipment_jwt, secret never leaves the server) is the
-- security: only the server could have produced a valid token, so showing the
-- token's own permit/equipment is safe. These functions deliberately expose the
-- MINIMAL set (no site internals, no worker names, no photos/notes):
--   PTW       -> number, type, issued/valid times, live status, valid flag
--   equipment -> ref_no, name, kind, each statutory form's status + valid_until
--
-- Distinct from verify_ptw_jwt / verify_equipment_jwt (member-only, richer, used
-- by the in-app scan). Granted to anon + authenticated. SECURITY DEFINER so the
-- curated reads bypass RLS. Scan audit is best-effort with a NULL actor.
-- Idempotent.
-- =============================================================

-- ── PTW public verify ────────────────────────────────────────
create or replace function verify_ptw_public(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_secret text; v_payload jsonb; v_valid boolean;
  v_permit_id uuid; v_p permits_to_work%rowtype; v_live_valid boolean;
begin
  select ptw_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null then raise exception 'PTW QR 未設定'; end if;

  select payload::jsonb, valid into v_payload, v_valid from extensions.verify(p_token, v_secret);
  if not coalesce(v_valid, false) then raise exception 'QR 無效'; end if;

  v_permit_id := (v_payload->>'permit_id')::uuid;
  select * into v_p from permits_to_work where id = v_permit_id;
  if v_p.id is null then raise exception '找不到此工作許可證'; end if;

  -- live validity: only an active, not-yet-expired permit counts as valid now
  v_live_valid := (v_p.status = 'active'
                   and (v_p.expires_at is null or v_p.expires_at > now()));

  -- best-effort anonymous scan audit (never block verification)
  begin
    insert into permit_scans (ptw_id, scanned_by, jwt_payload_snapshot)
      values (v_permit_id, null, v_payload);
  exception when others then null; end;

  return jsonb_build_object(
    'kind', 'ptw',
    'number', v_p.number,
    'ptw_type', v_p.ptw_type,
    'status', v_p.status,
    'issued_at', to_jsonb((v_payload->>'iat')::bigint),
    'expires_at', v_p.expires_at,
    'valid', v_live_valid
  );
end; $$;
revoke all on function verify_ptw_public(text) from public;
grant execute on function verify_ptw_public(text) to anon, authenticated;

-- ── Equipment public verify ──────────────────────────────────
create or replace function verify_equipment_public(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_secret text; v_payload jsonb; v_valid boolean;
  v_eq_id uuid; v_eq equipment_register%rowtype; v_inst jsonb;
begin
  select equipment_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null then raise exception 'equipment QR 未設定'; end if;

  select payload::jsonb, valid into v_payload, v_valid from extensions.verify(p_token, v_secret);
  if not coalesce(v_valid, false) then raise exception 'QR 無效'; end if;

  v_eq_id := (v_payload->>'equipment_id')::uuid;
  select * into v_eq from equipment_register where id = v_eq_id;
  if v_eq.id is null then raise exception '找不到此機械'; end if;

  begin
    insert into equipment_scans (equipment_id, scanned_by, jwt_payload_snapshot)
      values (v_eq_id, null, v_payload);
  exception when others then null; end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'template_code', ft.code, 'template_name', ft.name_zh,
    'valid_until', fi.valid_until,
    'status', case
      when fi.suspended then 'suspended'
      when fi.valid_until is null then 'missing'
      when fi.valid_until < now() then 'expired'
      when fi.valid_until <= now() + (ft.remind_before_days || ' days')::interval then 'expiring'
      else 'valid' end)
    order by fi.valid_until nulls first), '[]'::jsonb) into v_inst
   from form_instances fi join form_templates ft on ft.id = fi.template_id
   where fi.equipment_id = v_eq_id;

  return jsonb_build_object(
    'kind', 'equipment',
    'ref_no', v_eq.ref_no, 'name_zh', v_eq.name_zh, 'equipment_kind', v_eq.kind,
    'instances', v_inst
  );
end; $$;
revoke all on function verify_equipment_public(text) from public;
grant execute on function verify_equipment_public(text) to anon, authenticated;

-- =============================================================
-- Verify (execute): select verify_ptw_public('<token>') as anon -> minimal jsonb;
-- tampered token -> 'QR 無效'. Confirm no site-internal fields leak.
-- =============================================================
