-- ============================================================
-- v30-applicant-visibility.sql
-- ============================================================
-- BW-10 — Approver approves blind.
--
-- PendingApprovalCard (src/pages/Projects.tsx) renders an applicant's
-- name / phone / company for each pending project_members row the
-- current user is allowed to approve. It fetched those fields via a
-- direct `user_profiles` SELECT.
--
-- v17-user-profiles-rls-hardening.sql narrowed the user_profiles
-- SELECT policy to: self / shares_project_with / is_pm_of_applicant.
-- A brand-new applicant who shares NO approved project with the
-- approver does not match:
--   * Admin approver  — matches none of the three predicates at all.
--   * Subcontractor approver of a pending worker — shares_project_with
--     requires the OTHER side to be `approved`, but the applicant is
--     still `pending`, so it fails too.
-- Result: the card shows 載入中… / ? forever and the approver clicks
-- 批准 / 拒絕 without seeing who they are actioning.
--
-- FIX: a SECURITY DEFINER RPC that returns id/name/phone/company for
-- users with a PENDING project_members row on a given project, but
-- ONLY when the caller is authorised to approve on that project. The
-- authorisation mirrors the UI `pendingForMe` predicate exactly:
--   1. global admin, OR
--   2. an assigned PM of the project, OR
--   3. an approved subcontractor on the project (sees pending workers).
--
-- Idempotent (drop-if-exists). Additive only — no policy/table changes.
-- ============================================================

drop function if exists admin_or_pm_list_applicants(uuid);

create or replace function admin_or_pm_list_applicants(p_project_id uuid)
returns table (
  id uuid,
  name text,
  phone text,
  company text
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  authorised boolean;
begin
  -- Mirror the UI `pendingForMe` approver predicate (Projects.tsx).
  select (
    -- 1. global admin sees all pending applications
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.global_role = 'admin'
    )
    -- 2. assigned PM of this project
    or exists (
      select 1 from projects p
      where p.id = p_project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
    -- 3. approved subcontractor on this project (approves pending workers)
    or exists (
      select 1 from project_members me
      where me.project_id = p_project_id
        and me.user_id = auth.uid()
        and me.role = 'subcontractor'
        and me.status = 'approved'
    )
  ) into authorised;

  if not authorised then
    return;
  end if;

  return query
    select up.id, up.name, up.phone, up.company
    from project_members m
    join user_profiles up on up.id = m.user_id
    where m.project_id = p_project_id
      and m.status = 'pending';
end;
$$;

grant execute on function admin_or_pm_list_applicants(uuid) to authenticated;
