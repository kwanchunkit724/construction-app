-- =============================================================
-- v4 Fix: Issue UPDATE policy WITH CHECK
-- The previous policy only had `using` which checks the OLD row.
-- On escalate, current_handler_role changes (e.g. subcontractor -> main_contractor).
-- Without an explicit `with check`, PostgreSQL re-applies `using` to the NEW row,
-- which fails because the user is NOT the new handler role.
-- Fix: trust the `using` clause for authorization, allow any new row.
-- =============================================================

drop policy if exists "Admin or current handler updates issues" on issues;

create policy "Admin or current handler updates issues"
  on issues for update to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or has_role_in_project(auth.uid(), project_id, current_handler_role)
    or reporter_id = auth.uid()
  )
  with check (true);
