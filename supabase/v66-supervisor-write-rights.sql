-- =============================================================
-- v66-supervisor-write-rights.sql   (bug-fix: server RLS to match widened client gates)
-- =============================================================
-- The SIMULATION-REPORT bug fixes widened the CLIENT gates so on-site supervisors
-- (general_foreman 老總 + safety_officer 安全主任) can act where they previously
-- couldn't. Without matching server RLS those roles would now SEE the action
-- buttons but the Supabase mutation would be rejected. This migration brings the
-- server policies in line. All changes only WIDEN (add roles / supervisory
-- branches) — no existing grant is removed; module conjuncts are preserved.
-- Idempotent (drop+create). Apply on prod.
-- =============================================================

-- ── 1. issues UPDATE — safety_officer + general_foreman may act ───────────────
-- Was: admin OR has_role_in_project(current_handler_role) OR reporter (v4:87-93).
-- Add: an approved member of THIS project whose membership role is safety_officer
-- or general_foreman can escalate/resolve/reopen ANY issue (matches client
-- canActOnIssue). Updates are not module-gated, so no module conjunct here.
drop policy if exists "Admin or current handler updates issues" on issues;
create policy "Admin or current handler updates issues"
  on issues for update to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or has_role_in_project(auth.uid(), project_id, current_handler_role)
    or reporter_id = auth.uid()
    or exists (
      select 1 from project_members pm
      where pm.project_id = issues.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and pm.role in ('safety_officer', 'general_foreman')
    )
  );

-- ── 2. dailies INSERT — project supervisors (membership role), not only a ─────
--     main_contractor with foreman/engineer sub_role.
-- Was (v11/v59): global_role='main_contractor' AND sub_role in (foreman,engineer)
-- AND approved member AND module. Now: admin OR assigned-PM OR approved member
-- with MEMBERSHIP role in (pm, general_foreman, main_contractor). Keeps own-row +
-- the 'dailies' module gate. Matches client canAuthorDaily.
drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert to authenticated
  with check (
    user_id = auth.uid()
    and project_module_enabled(project_id, 'dailies')
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (select 1 from projects p where p.id = dailies.project_id and auth.uid() = any(p.assigned_pm_ids))
      or exists (
        select 1 from project_members pm
        where pm.project_id = dailies.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and pm.role in ('pm', 'general_foreman', 'main_contractor')
      )
    )
  );

-- ── 3. materials INSERT + UPDATE — membership role + include general_foreman ──
-- Was (v59): approved member whose GLOBAL role in (admin,pm,main_contractor,
-- subcontractor) — omits general_foreman and keys on global not membership role,
-- contradicting the unified client gate. Switch to per-project MEMBERSHIP role in
-- (pm, main_contractor, general_foreman, subcontractor). Keeps the 'materials'
-- module gate. (admin still passes via membership 'pm'/global — add an explicit
-- admin OR for safety.)
drop policy if exists materials_insert on materials;
create policy materials_insert on materials for insert to authenticated
  with check (
    requested_by = auth.uid()
    and project_module_enabled(materials.project_id, 'materials')
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (
        select 1 from project_members pm
        where pm.project_id = materials.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and pm.role in ('pm', 'main_contractor', 'general_foreman', 'subcontractor')
      )
    )
  );

drop policy if exists materials_update on materials;
create policy materials_update on materials for update to authenticated
  using (
    project_module_enabled(materials.project_id, 'materials')
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (
        select 1 from project_members pm
        where pm.project_id = materials.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and pm.role in ('pm', 'main_contractor', 'general_foreman', 'subcontractor')
      )
    )
  )
  with check (
    project_module_enabled(materials.project_id, 'materials')
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (
        select 1 from project_members pm
        where pm.project_id = materials.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and pm.role in ('pm', 'main_contractor', 'general_foreman', 'subcontractor')
      )
    )
  );

-- =============================================================
-- Verify (execute): the three tables' write policies now mention general_foreman
--   select tablename, policyname, pg_get_expr(polqual, polrelid) using_expr,
--          pg_get_expr(polwithcheck, polrelid) check_expr
--     from pg_policy join pg_class on pg_class.oid = polrelid
--    where relname in ('issues','dailies','materials');
-- =============================================================
