-- =============================================================
-- v2 Fix: Add missing auth.identities row for admin user
-- Supabase requires both auth.users AND auth.identities for login.
-- Re-running is safe.
-- =============================================================

do $$
declare
  admin_id uuid;
  admin_email text := '91234567@phone.local';
begin
  select id into admin_id from auth.users where email = admin_email limit 1;

  if admin_id is null then
    raise exception 'Admin auth.users row not found. Run v2-seed-admin.sql first.';
  end if;

  -- Insert identity row if missing
  if not exists (
    select 1 from auth.identities
    where user_id = admin_id and provider = 'email'
  ) then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true),
      'email',
      admin_id::text,
      now(), now(), now()
    );
  end if;
end $$;
