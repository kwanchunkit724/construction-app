-- =============================================================
-- seed-test-auth.sql — creates auth.users rows for Playwright suites
-- =============================================================
-- Pairs with seed-phase2.sql + seed-phase3.sql which only insert
-- {id, email} into auth.users (no password) — login fails without
-- this extra rig.
--
-- Creates 5 phone-as-email accounts with password 'test1234', plus
-- a matching auth.identities row so the email/password provider works.
-- All inserts ON CONFLICT DO NOTHING — re-runs are safe and never
-- overwrite an existing account's password.
-- =============================================================

do $$
declare
  v_ids uuid[] := array[
    '11110001-0001-0001-0001-000000000001',
    '11110002-0002-0002-0002-000000000002',
    '11110003-0003-0003-0003-000000000003',
    '11110004-0004-0004-0004-000000000004',
    '11110099-0099-0099-0099-000000000099'
  ];
  v_emails text[] := array[
    '60000001@phone.local',
    '60000002@phone.local',
    '60000003@phone.local',
    '60000004@phone.local',
    '60000099@phone.local'
  ];
  v_pw text := extensions.crypt('test1234', extensions.gen_salt('bf'));
  i int;
begin
  for i in 1..array_length(v_ids,1) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin, is_anonymous,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_ids[i], 'authenticated', 'authenticated',
      v_emails[i], v_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb, now(), now(), false, false,
      '', '', '', '', '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      v_ids[i]::text, v_ids[i],
      jsonb_build_object('sub', v_ids[i]::text, 'email', v_emails[i], 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;
  end loop;
end$$;

select id, email, email_confirmed_at is not null as confirmed
from auth.users
where email like '60000%'
order by email;
