-- =============================================================
-- v2 Fix: Eliminate infinite recursion in RLS policies
-- The original policies on project_members reference project_members
-- itself (subcontractor reading workers), causing infinite recursion.
-- Fix: extract checks into SECURITY DEFINER functions that bypass RLS.
-- =============================================================

-- Drop recursive policies
drop policy if exists "Subcontractor reads workers in own project" on project_members;
drop policy if exists "Subcontractor approves workers" on project_members;
drop policy if exists "Approved members read joined projects" on projects;
drop policy if exists "PM reads project memberships" on project_members;
drop policy if exists "PM approves memberships" on project_members;
drop policy if exists "PM reads assigned projects" on projects;

-- Helper: is the user an approved subcontractor in this project?
create or replace function is_approved_subcontractor_in_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where user_id = p_user_id
      and project_id = p_project_id
      and role = 'subcontractor'
      and status = 'approved'
  );
$$;

-- Helper: is the user an approved member of this project?
create or replace function is_approved_member_of_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where user_id = p_user_id
      and project_id = p_project_id
      and status = 'approved'
  );
$$;

-- Helper: is the user PM of this project?
create or replace function is_pm_of_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from projects
    where id = p_project_id
      and p_user_id = any(assigned_pm_ids)
  );
$$;

-- ── Recreate non-recursive policies ──────────────────────────

create policy "Approved members read joined projects"
  on projects for select to authenticated
  using (is_approved_member_of_project(auth.uid(), id));

create policy "PM reads assigned projects"
  on projects for select to authenticated
  using (is_pm_of_project(auth.uid(), id));

create policy "PM reads project memberships"
  on project_members for select to authenticated
  using (is_pm_of_project(auth.uid(), project_id));

create policy "PM approves memberships"
  on project_members for update to authenticated
  using (is_pm_of_project(auth.uid(), project_id));

create policy "Subcontractor reads workers in own project"
  on project_members for select to authenticated
  using (is_approved_subcontractor_in_project(auth.uid(), project_id));

create policy "Subcontractor approves workers"
  on project_members for update to authenticated
  using (
    role = 'subcontractor_worker'
    and is_approved_subcontractor_in_project(auth.uid(), project_id)
  );
