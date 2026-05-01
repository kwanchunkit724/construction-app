-- =============================================================
-- v2 Seed: Hardcode admin user
-- Run AFTER v2-schema.sql
-- Creates: phone 91234567, password admin1234
-- =============================================================

-- Step 1: Create the auth user
-- Note: We use a fake email derived from phone so Supabase auth works
-- without SMS provider. The app converts phone <-> email transparently.

do $$
declare
  admin_id uuid;
begin
  -- Insert auth user (skip if exists)
  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    aud, role, instance_id
  )
  values (
    gen_random_uuid(),
    '91234567@phone.local',
    crypt('admin1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    'authenticated',
    'authenticated',
    '00000000-0000-0000-0000-000000000000'
  )
  on conflict (email) do nothing
  returning id into admin_id;

  -- If user already existed, fetch their id
  if admin_id is null then
    select id into admin_id from auth.users where email = '91234567@phone.local';
  end if;

  -- Insert / update user profile
  insert into user_profiles (id, phone, name, global_role, company)
  values (admin_id, '91234567', '系統管理員', 'admin', '系統')
  on conflict (id) do update set
    phone = excluded.phone,
    name = excluded.name,
    global_role = excluded.global_role,
    company = excluded.company;
end $$;
