-- ============================================================
-- v21-project-members-peers.sql
-- ============================================================
-- iOS testing (2026-05-27) surfaced: AssignmentModal's 指派 picker
-- empty for 老總 / engineer / foreman / 判頭. Root cause —
-- `project_members` SELECT policies only let admins, PMs, and the
-- user themselves read rows. So a non-PM supervisor can't see other
-- approved members of the same project → candidate list empty.
--
-- FIX: add a SELECT policy that lets any approved member of a project
-- read all approved-member rows for that project. SECURITY DEFINER
-- helper breaks the self-referential recursion (project_members SELECT
-- policy can't query project_members directly).
-- ============================================================

create or replace function is_approved_member_of_project(p_project uuid)
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
    select 1 from project_members
    where project_id = p_project
      and user_id = auth.uid()
      and status = 'approved'
  ) into result;
  return result;
end;
$$;
grant execute on function is_approved_member_of_project(uuid) to authenticated;

drop policy if exists "Approved members read project peers" on project_members;
create policy "Approved members read project peers" on project_members
  for select using (
    is_approved_member_of_project(project_members.project_id)
  );
