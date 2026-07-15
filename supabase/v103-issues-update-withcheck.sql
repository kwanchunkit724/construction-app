-- =============================================================
-- v103-issues-update-withcheck.sql
-- =============================================================
-- Stage-B finding (2026-06-22, confirmed live): the current handler could not
-- ESCALATE an issue. The "Admin or current handler updates issues" UPDATE policy
-- had no explicit WITH CHECK, so Postgres reuses the USING expression as the
-- new-row check. escalateIssue (IssuesContext.tsx:240) does a direct
-- .from('issues').update({current_handler_role: next}); after the handler
-- changes, the actor no longer satisfies has_role_in_project(..., NEW handler),
-- so WITH CHECK fails → "new row violates row-level security policy". Net: only
-- admin / reporter / safety_officer / general_foreman could escalate; the
-- current handler (the role the chain expects to escalate) could not — yet the
-- client shows them the 升級 button.
--
-- FIX: keep USING (gates WHO may touch the row) and add an explicit
-- WITH CHECK (true). Integrity of WHAT may change is already enforced by the
-- BEFORE UPDATE guard enforce_issue_write_gate (v69/v93): it constrains
-- current_handler_role transitions to the legal ladder, pins
-- reporter_id/reporter_role/project_id/created_at/issue_no to OLD for non-admin,
-- and forces resolved_by = self. So WITH CHECK (true) is safe — the trigger, not
-- the policy's new-row re-check, is the authority on row content.
--
-- Backwards compatible: only LOOSENS the new-row check (restores the intended
-- escalation path); existing resolve/reopen/comment flows unaffected. Idempotent.
-- =============================================================

drop policy if exists "Admin or current handler updates issues" on issues;
create policy "Admin or current handler updates issues" on issues for update
  using (
    (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
    or has_role_in_project(auth.uid(), project_id, current_handler_role)
    or (reporter_id = auth.uid())
    or (exists (
      select 1 from project_members pm
      where pm.project_id = issues.project_id and pm.user_id = auth.uid()
        and pm.status = 'approved' and pm.role = any (array['safety_officer','general_foreman'])
    ))
  )
  with check (true);

-- =============================================================
-- Verify (execute, as each user via jwt.claims):
--   工程師(handler=main_contractor) update handler->pm      -> ALLOW (was denied)
--   工程師 update handler->subcontractor (illegal jump)      -> DENY (v69 guard raises)
--   非 admin update set reporter_id=<other>                  -> DENY (v69 guard pins)
--   工人 update an issue they neither handle nor reported    -> DENY (USING)
-- =============================================================
