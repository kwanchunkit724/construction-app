-- ============================================================
-- v17-user-profiles-rls-hardening.sql
-- ============================================================
-- TWO P0 holes discovered by persona-sim round 2 (何判頭, 2026-05-26):
--
-- BUG 1 — Self-promotion to admin.
--   v2-schema.sql:73-75 granted any authenticated user UPDATE on
--   their own user_profiles row with no `with check` and no column
--   restriction. A subcontractor PATCH'd global_role='admin' and
--   received HTTP 200 — then renamed projects, reassigned PMs, read
--   every user's PII. Total system takeover from a single REST call.
--
-- BUG 2 — Global PII read.
--   SELECT on user_profiles was unrestricted to authenticated users
--   in v2-schema. Subcontractor pulled 25 users' phone/role and 11
--   OneSignal IDs in two calls. Reconnaissance + phishing exposure.
--
-- FIX:
--   1. BEFORE UPDATE trigger on user_profiles that reverts
--      global_role / sub_role / phone / id to OLD values unless
--      caller is admin (or service role with auth.uid()=null).
--      Self-editable columns (name, company, onesignal_id) still
--      flow through normally.
--   2. Narrow SELECT to: self / project teammate / PM-of-applicant.
--      Admin direct-table read deferred to admin_list_user_profiles()
--      / admin_get_user_profile() SECURITY DEFINER RPCs so the policy
--      itself never has to recurse through user_profiles.
--   3. Admin role mutation via admin_update_user_role() RPC instead
--      of direct UPDATE (which is policy-gated to auth.uid()=id).
-- ============================================================

-- 1. Write gate trigger ---------------------------------------------------

create or replace function enforce_user_profile_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  -- Service role (no JWT) bypass — used by SECURITY DEFINER RPCs
  -- and admin tools that manage profiles legitimately.
  if auth.uid() is null then
    return new;
  end if;

  select (global_role = 'admin') into is_admin
  from user_profiles
  where user_profiles.id = auth.uid();

  if is_admin then
    return new;
  end if;

  if new.global_role is distinct from old.global_role then
    new.global_role := old.global_role;
  end if;
  if new.sub_role is distinct from old.sub_role then
    new.sub_role := old.sub_role;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := old.phone;
  end if;
  if new.id is distinct from old.id then
    new.id := old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_profile_write_gate on user_profiles;
create trigger trg_enforce_user_profile_write_gate
  before update on user_profiles
  for each row execute function enforce_user_profile_write_gate();

-- 2. SELECT helpers (SECURITY DEFINER + row_security off so the policy
--    never recurses through user_profiles or project_members RLS) -------

create or replace function shares_project_with(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result boolean;
begin
  select exists (
    select 1
    from project_members me
    join project_members them
      on them.project_id = me.project_id
     and them.status = 'approved'
    where me.user_id = auth.uid()
      and me.status = 'approved'
      and them.user_id = p_user
  ) into result;
  return result;
end;
$$;
grant execute on function shares_project_with(uuid) to authenticated;

create or replace function is_pm_of_applicant(p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result boolean;
begin
  select exists (
    select 1
    from projects p
    join project_members pm
      on pm.project_id = p.id and pm.user_id = p_target
    where auth.uid() = any(p.assigned_pm_ids)
  ) into result;
  return result;
end;
$$;
grant execute on function is_pm_of_applicant(uuid) to authenticated;

-- 3. SELECT policy --------------------------------------------------------

drop policy if exists "Anyone authenticated can read profiles" on user_profiles;
drop policy if exists "Users can view all profiles" on user_profiles;
drop policy if exists user_profiles_select on user_profiles;

create policy user_profiles_select on user_profiles for select
  using (
    user_profiles.id = auth.uid()
    or shares_project_with(user_profiles.id)
    or is_pm_of_applicant(user_profiles.id)
  );

-- 4. Admin RPCs (bypass SELECT/UPDATE narrowing) --------------------------

create or replace function admin_list_user_profiles()
returns setof user_profiles
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from user_profiles
    where user_profiles.id = auth.uid()
      and user_profiles.global_role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
  return query select * from user_profiles order by created_at desc;
end;
$$;
grant execute on function admin_list_user_profiles() to authenticated;

create or replace function admin_get_user_profile(p_user uuid)
returns setof user_profiles
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from user_profiles
    where user_profiles.id = auth.uid()
      and user_profiles.global_role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
  return query select * from user_profiles where user_profiles.id = p_user;
end;
$$;
grant execute on function admin_get_user_profile(uuid) to authenticated;

create or replace function admin_update_user_role(
  p_target uuid,
  p_global_role text,
  p_sub_role text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from user_profiles
    where user_profiles.id = auth.uid()
      and user_profiles.global_role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
  update user_profiles
  set global_role = p_global_role,
      sub_role = nullif(p_sub_role, '')::text
  where user_profiles.id = p_target;
end;
$$;
grant execute on function admin_update_user_role(uuid, text, text) to authenticated;
