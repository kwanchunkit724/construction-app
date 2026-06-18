-- =============================================================
-- v85-module-gate-consistency.sql
--   (Low-severity consistency fix: add module gate to UPDATE
--    policies of cleansing_inspections and ncr_reports)
-- =============================================================
-- Adversarial review (2026-06-18) noted that the UPDATE policies on
-- cleansing_inspections (v81) and ncr_reports (v82) were missing the
-- project_module_enabled() conjunct that the SELECT + INSERT policies
-- (and all equivalent tables — see v59-modules-rls-2.sql §1 'weather',
-- §3 'materials') carry. Without it an editor could UPDATE a row even
-- after an admin disables the cleansing or ncr module for that project.
--
-- FIX: re-create both UPDATE policies VERBATIM from their originals
-- (v81:76-84 for cleansing_update; v82:91-100 for ncr_update) plus ONE
-- additional conjunct — `and project_module_enabled(project_id,'<key>')`
-- — appended to BOTH the USING and WITH CHECK clauses, matching the
-- established pattern (see pwc_update / materials_update in v59).
--
-- Convention: DELETE policies are intentionally NOT module-gated so an
-- admin can still clean up rows of a disabled surface (same rationale
-- as v59 header). This file does not touch DELETE, RPCs, or triggers.
--
-- Idempotent: drop policy if exists + create. Re-runnable while live.
-- =============================================================


-- =============================================================
-- 1. cleansing_inspections → cleansing_update  (key: 'cleansing')
-- -------------------------------------------------------------
-- Original policy (v81-cleansing-schema.sql:75-84): allows the author
-- to edit their own unverified record OR an admin to edit any record.
-- Added: `and project_module_enabled(project_id,'cleansing')` to both
-- USING and WITH CHECK so the surface is write-frozen when the module
-- is off, consistent with SELECT + INSERT already being gated.
-- =============================================================
drop policy if exists cleansing_update on cleansing_inspections;
create policy cleansing_update on cleansing_inspections for update to authenticated
  using (
    (
      (created_by = auth.uid() and verified_at is null)
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and project_module_enabled(project_id, 'cleansing')
  )
  with check (
    (
      (created_by = auth.uid() and verified_at is null)
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and project_module_enabled(project_id, 'cleansing')
  );


-- =============================================================
-- 2. ncr_reports → ncr_update  (key: 'ncr')
-- -------------------------------------------------------------
-- Original policy (v82-ncr-schema.sql:91-100): allows the raiser to
-- edit the descriptive fields while the NCR is still 'open', OR an
-- admin to always edit. Added: `and project_module_enabled(project_id,
-- 'ncr')` to both USING and WITH CHECK for write-freeze parity.
-- Note: stateful transitions (submit_ncr_corrective, close_ncr,
-- reopen_ncr, void_ncr) are SECURITY DEFINER and bypass this policy —
-- they continue to work regardless of the module flag.
-- =============================================================
drop policy if exists ncr_update on ncr_reports;
create policy ncr_update on ncr_reports for update to authenticated
  using (
    (
      (raised_by = auth.uid() and status = 'open')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and project_module_enabled(project_id, 'ncr')
  )
  with check (
    (
      (raised_by = auth.uid() and status = 'open')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and project_module_enabled(project_id, 'ncr')
  );


-- =============================================================
-- Post-apply verification (execute, not source):
--
--   -- Policy presence — both recreated (4 policies each table):
--   select tablename, policyname, cmd
--     from pg_policies
--    where tablename in ('cleansing_inspections', 'ncr_reports')
--    order by tablename, cmd;
--   -- cleansing_inspections: cleansing_select, cleansing_insert,
--   --                         cleansing_update, cleansing_delete  (4)
--   -- ncr_reports:           ncr_select, ncr_insert,
--   --                         ncr_update, ncr_delete              (4)
--
--   -- Module-gate enforcement: disable a module, confirm UPDATE is blocked.
--   --   (as admin) select set_project_module('<P>'::uuid, 'cleansing', false);
--   --   (as an editor who is also the record author):
--   --     update cleansing_inspections set notes='test' where project_id='<P>'; -> 0 rows (gated)
--   --   re-enable: select set_project_module('<P>'::uuid, 'cleansing', true);
--   --     update cleansing_inspections set notes='test' where project_id='<P>'; -> 1 row
--
--   --   (as admin) select set_project_module('<P>'::uuid, 'ncr', false);
--   --   (as raiser of an open ncr_report in <P>):
--   --     update ncr_reports set title='test' where project_id='<P>'; -> 0 rows (gated)
--   --   re-enable: select set_project_module('<P>'::uuid, 'ncr', true);
--   --     update ncr_reports set title='test' where project_id='<P>'; -> 1 row
--
--   -- DELETE policies unchanged — admin can still delete while module is off.
-- =============================================================
