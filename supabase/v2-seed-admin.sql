-- =============================================================
-- v2 Seed: Hardcode admin user
-- Run AFTER v2-schema.sql
-- Creates: phone 91234567, password admin1234
-- Re-running this script is safe (it'll skip the auth.users row if it
-- already exists and just upsert the profile).
-- =============================================================

do $$
declare
  admin_id uuid;
  admin_email text := '91234567@phone.local';
begin
  -- Check if the auth user already exists
  select id into admin_id from auth.users where email = admin_email limit 1;

  -- If not, create it
  if admin_id is null then
    admin_id := gen_random_uuid();
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role, instance_id
    )
    values (
      admin_id,
      admin_email,
      crypt('admin1234', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      'authenticated',
      'authenticated',
      '00000000-0000-0000-0000-000000000000'
    );
  end if;

  -- Upsert the user_profiles row
  insert into user_profiles (id, phone, name, global_role, company)
  values (admin_id, '91234567', '系統管理員', 'admin', '系統')
  on conflict (id) do update set
    phone = excluded.phone,
    name = excluded.name,
    global_role = excluded.global_role,
    company = excluded.company;
end $$;
