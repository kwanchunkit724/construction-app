-- =============================================================
-- v33-applicant-rpc-ambiguous-id-fix.sql
-- =============================================================
-- BUG: admin_or_pm_list_applicants() threw at RUNTIME for EVERY caller:
--   ERROR 42702: column reference "id" is ambiguous
-- The function `returns table (id uuid, name text, phone text, company text)`,
-- so `id` is an OUT (PL/pgSQL) variable. The v31 rewrite referenced the admin
-- check column UNqualified — `select 1 from user_profiles where id = auth.uid()`
-- — which Postgres can't disambiguate between the OUT param `id` and
-- user_profiles.id, so it raised every time. Result: PendingApprovalCard's RPC
-- always errored → "無法載入申請人資料" → approvers could not see who they were
-- approving (the exact BW-10 symptom the RPC was meant to cure).
--
-- (The earlier "verify" only checked the function SOURCE text contained the
-- PII filter; it never EXECUTED the function, so the ambiguity slipped through.)
--
-- FIX: alias user_profiles as `up` and qualify every column in the body so no
-- unqualified name collides with an OUT param. Behaviour is otherwise identical
-- to v31 (admin / assigned-PM see all pending; approved subcontractor sees only
-- pending subcontractor_worker rows). Idempotent (create or replace).
-- =============================================================

create or replace function admin_or_pm_list_applicants(p_project_id uuid)
returns table (id uuid, name text, phone text, company text)
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
  select (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid() and up.global_role = 'admin'
    )
    or exists (
      select 1 from projects p
      where p.id = p_project_id and auth.uid() = any(p.assigned_pm_ids)
    )
  ) into is_privileged;

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
