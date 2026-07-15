-- ============================================================
-- v31-applicant-pii-fix.sql
-- ============================================================
-- SECURITY FIX for v30-applicant-visibility.sql.
--
-- v30 `admin_or_pm_list_applicants` authorises three kinds of caller:
--   1. global admin,
--   2. assigned PM of the project,
--   3. approved subcontractor on the project.
-- ...but then returns EVERY pending project_members row, scoped only by
-- status = 'pending'. An approved subcontractor may only ever approve
-- pending `subcontractor_worker` rows, yet the RPC handed them the
-- name / phone / company of EVERY pending applicant on the project
-- (other subcontractors, main_contractor staff, owners, etc.). That is
-- a PII leak — the subcontractor sees people they cannot action.
--
-- FIX: split authorisation into `is_privileged` (admin OR assigned PM)
-- vs the approved-subcontractor branch, then filter the returned rows:
--   * privileged callers (admin / assigned PM) → ALL pending applicants,
--   * subcontractor-only callers → ONLY pending role = 'subcontractor_worker'.
--
-- This mirrors the UI `pendingForMe` approver predicate exactly: a
-- subcontractor's approve button only ever targets pending workers.
--
-- Idempotent (drop-if-exists + create or replace). Additive only — no
-- policy/table changes. Keeps SECURITY DEFINER + row_security = off and
-- the execute grant to authenticated.
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
  is_privileged boolean;
  is_sub_approver boolean;
begin
  -- Privileged callers see ALL pending applicants:
  --   1. global admin, OR
  --   2. assigned PM of this project.
  select (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.global_role = 'admin'
    )
    or exists (
      select 1 from projects p
      where p.id = p_project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  ) into is_privileged;

  -- Approved subcontractor on this project — may approve pending workers
  -- only, so is restricted to role = 'subcontractor_worker' rows below.
  select exists (
    select 1 from project_members me
    where me.project_id = p_project_id
      and me.user_id = auth.uid()
      and me.role = 'subcontractor'
      and me.status = 'approved'
  ) into is_sub_approver;

  if not (is_privileged or is_sub_approver) then
    return;
  end if;

  return query
    select up.id, up.name, up.phone, up.company
    from project_members m
    join user_profiles up on up.id = m.user_id
    where m.project_id = p_project_id
      and m.status = 'pending'
      and (is_privileged or m.role = 'subcontractor_worker');
end;
$$;

grant execute on function admin_or_pm_list_applicants(uuid) to authenticated;
