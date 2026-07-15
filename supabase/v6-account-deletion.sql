-- =============================================================
-- v6 — Account Deletion (Apple Guideline 5.1.1(v) compliance)
-- Adds an RPC the user can invoke to delete their own account.
-- Hard-deletes auth.users row; ON DELETE CASCADE removes
-- user_profiles, project_members, etc.
-- Authored content (issues, progress entries) keeps the user_id
-- pointer dangling — handled by setting refs to NULL via FK actions
-- where appropriate (see ALTER statements below).
-- Run this once in Supabase Dashboard → SQL Editor.
-- =============================================================

-- 1. Loosen FKs on authored content so cascade-delete from auth.users
--    nulls out the author rather than wiping historical records.
--    This preserves the audit trail with author = NULL.

do $$
begin
  -- projects.created_by → user_profiles(id): set null
  if exists (select 1 from information_schema.table_constraints
             where table_name = 'projects' and constraint_name = 'projects_created_by_fkey') then
    alter table projects drop constraint projects_created_by_fkey;
  end if;
  alter table projects
    add constraint projects_created_by_fkey
    foreign key (created_by) references user_profiles(id) on delete set null;

  -- project_members.approved_by → set null
  if exists (select 1 from information_schema.table_constraints
             where table_name = 'project_members' and constraint_name = 'project_members_approved_by_fkey') then
    alter table project_members drop constraint project_members_approved_by_fkey;
  end if;
  alter table project_members
    add constraint project_members_approved_by_fkey
    foreign key (approved_by) references user_profiles(id) on delete set null;
end $$;

-- 2. RPC: delete_my_account()
--    Runs as definer (postgres) so it can DELETE FROM auth.users.
--    Uses auth.uid() to identify the caller — cannot be abused to
--    delete other users.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete the auth user. ON DELETE CASCADE on user_profiles.id
  -- removes the profile and all dependents (project_members, etc.)
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Allows the authenticated user to permanently delete their own account. Deletes auth.users row; cascade removes user_profiles, project_members, push subscriptions. Authored projects/approvals have their author reference set to NULL to preserve historical records.';
