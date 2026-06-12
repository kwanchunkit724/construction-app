-- =============================================================
-- v55c-equipment-qr.sql   (Forms feature F3 — QR layer)
-- =============================================================
-- Per-equipment QR: a laminated tag on each machine/scaffold; scan opens that
-- equipment's forms to view status / sign. Mirrors the PTW JWT pattern
-- (mint_ptw_jwt / verify_ptw_jwt, v10) over app_config.equipment_qr_secret.
-- KEY DIFFERENCE from PTW: the token is LONG-LIVED (12 months) because it is
-- printed and affixed — it authenticates the TAG (which equipment), never the
-- validity (validity is always read LIVE in verify). Managers mint (to print);
-- any member may scan (login-gated, audited to equipment_scans). Idempotent.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

-- Seed the QR signing secret once (32+ bytes hex), mirroring ptw_qr_secret.
update app_config
   set equipment_qr_secret = encode(extensions.gen_random_bytes(32), 'hex')
 where id = 1 and (equipment_qr_secret is null or length(equipment_qr_secret) < 32);

-- mint_equipment_jwt — manager mints a signed long-lived tag token to print.
create or replace function mint_equipment_jwt(p_equipment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_eq equipment_register%rowtype; v_secret text; v_payload json;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  select * into v_eq from equipment_register where id = p_equipment_id;
  if v_eq.id is null then raise exception '找不到機械'; end if;
  if not can_edit_project_progress(auth.uid(), v_eq.project_id) then
    raise exception '沒有權限產生 QR';
  end if;
  select equipment_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'equipment_qr_secret 未設定';
  end if;
  v_payload := json_build_object(
    'equipment_id', v_eq.id::text,
    'project_id',   v_eq.project_id::text,
    'ref_no',       v_eq.ref_no,
    'kind',         v_eq.kind,
    'iat', extract(epoch from now())::bigint,
    'exp', extract(epoch from now() + interval '365 days')::bigint   -- 12-month tag refresh hygiene
  );
  return extensions.sign(v_payload, v_secret);
end; $$;
revoke all on function mint_equipment_jwt(uuid) from public;
grant execute on function mint_equipment_jwt(uuid) to authenticated;

-- verify_equipment_jwt — any member scans a tag → live status of its forms.
create or replace function verify_equipment_jwt(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_secret text; v_payload jsonb; v_valid boolean;
  v_eq_id uuid; v_eq equipment_register%rowtype; v_inst jsonb;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select equipment_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null then raise exception 'equipment QR 未設定'; end if;

  select payload::jsonb, valid into v_payload, v_valid from extensions.verify(p_token, v_secret);
  if not coalesce(v_valid, false) then raise exception 'QR 無效'; end if;
  if (v_payload->>'exp')::bigint < extract(epoch from now())::bigint then
    raise exception 'QR 已過期，請重新列印';
  end if;

  v_eq_id := (v_payload->>'equipment_id')::uuid;
  select * into v_eq from equipment_register where id = v_eq_id;
  -- login + project-membership gated (C2 mitigation: no anonymous scan).
  if v_eq.id is null or not can_view_project(v_uid, v_eq.project_id) then
    raise exception '你冇權查看呢部機械';
  end if;

  insert into equipment_scans (equipment_id, scanned_by, jwt_payload_snapshot)
    values (v_eq_id, v_uid, v_payload);

  select coalesce(jsonb_agg(jsonb_build_object(
    'instance_id', fi.id, 'template_code', ft.code, 'template_name', ft.name_zh,
    'valid_until', fi.valid_until, 'suspended', fi.suspended,
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
    'equipment_id', v_eq.id, 'ref_no', v_eq.ref_no, 'name_zh', v_eq.name_zh,
    'kind', v_eq.kind, 'location_zh', v_eq.location_zh, 'instances', v_inst);
end; $$;
grant execute on function verify_equipment_jwt(text) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- as a manager PM: select mint_equipment_jwt('<equipment_id>') -> a JWT string.
--   -- as a non-manager: -> raise 沒有權限產生 QR.
--   -- select verify_equipment_jwt('<that token>') -> { equipment + instances[] }; writes equipment_scans.
--   -- a tampered token -> raise QR 無效.
-- =============================================================
