-- =============================================================
-- v10-split/1-pgjwt-poc.sql — Phase 3 Plan 03-01 spike Task 2
-- =============================================================
-- Proof-of-concept: install pgjwt extension + verify sign/verify
-- round-trip using a throwaway secret. NOT the production secret.
--
-- After PoC passes, the real secret lands in app_config.ptw_qr_secret
-- as part of Plan 03-02 (PTW schema). This file only proves the
-- extension is installable on Supabase + the API shape we want.
--
-- pgjwt docs: https://github.com/michelp/pgjwt
-- Supabase confirms pgjwt is available in extensions schema.
-- =============================================================

-- IMPORTANT: pgjwt 0.2.0 on Supabase requires an explicit DROP+CREATE
-- (not `create if not exists`). Confirmed via pg_available_extensions:
-- 0.2.0 was available but the IF-NOT-EXISTS form was a silent no-op.
drop extension if exists pgjwt;
create extension pgjwt with schema extensions;

-- Smoke: sign + verify a JWT round-trip.
-- pgjwt 0.2.0 sign(payload json, secret text) — algorithm hard-coded HS256.
-- verify(token text, secret text) returns table(header json, payload json, valid boolean).
do $$
declare
  v_secret text := 'transient-test-secret-not-for-production-' || gen_random_uuid()::text;
  v_payload json := json_build_object(
    'permit_id', gen_random_uuid()::text,
    'iat', extract(epoch from now())::bigint,
    'exp', extract(epoch from (now() + interval '8 hours'))::bigint,
    'type', 'hot_work'
  );
  v_token text;
  v_decoded jsonb;
  v_valid boolean;
begin
  v_token := extensions.sign(v_payload, v_secret);
  raise notice 'JWT length: %, preview: %...', length(v_token), substring(v_token from 1 for 40);

  select payload::jsonb, valid into v_decoded, v_valid
    from extensions.verify(v_token, v_secret);

  if not coalesce(v_valid, false) then
    raise exception 'pgjwt verify FAILED — round-trip broken';
  end if;
  if v_decoded->>'type' <> 'hot_work' then
    raise exception 'pgjwt payload corruption: % expected hot_work', v_decoded->>'type';
  end if;
  raise notice 'pgjwt PoC OK — round-trip preserved payload';
end $$;

-- =============================================================
-- Post-apply verification:
--   select extname, extversion from pg_extension where extname='pgjwt';
--   -- expect: 1 row
--
--   -- Function presence (in extensions schema):
--   select proname from pg_proc p
--     join pg_namespace n on p.pronamespace = n.oid
--    where n.nspname='extensions' and proname in ('sign','verify');
--   -- expect: at least 2 rows
-- =============================================================
