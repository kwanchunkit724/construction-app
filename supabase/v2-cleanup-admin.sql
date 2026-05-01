-- =============================================================
-- v2 Cleanup: Delete the broken admin user (and all related rows)
-- Run this BEFORE signing up the admin via the app.
-- =============================================================

do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = '91234567@phone.local' limit 1;
  if admin_id is not null then
    delete from user_profiles where id = admin_id;
    delete from auth.identities where user_id = admin_id;
    delete from auth.users where id = admin_id;
  end if;
end $$;
