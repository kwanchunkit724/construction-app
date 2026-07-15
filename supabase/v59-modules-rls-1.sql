-- =============================================================
-- v59-modules-rls-1.sql   (Module gating — group 1: issues, si, vo, ptw)
-- =============================================================
-- Phase 2 of the module system. Adds a per-project module switch to the
-- RLS of the issues / SI / VO / PTW feature tables, so an admin can hide a
-- whole module's data for one project. Built on the Phase-1 helper:
--
--   public.project_module_enabled(p_project_id uuid, p_module_key text) -> boolean
--   (v59-modules-schema.sql; coalesce-absent => true)
--
-- SAFETY — ADDITIVE + BACKWARDS-COMPATIBLE:
--   Each policy below is re-created VERBATIM from its current definition,
--   with EXACTLY ONE new conjunct appended:
--       and project_module_enabled(<table>.project_id, '<module_key>')
--   Because project_module_enabled defaults to TRUE when no override row
--   exists, every live project keeps byte-identical access until an admin
--   explicitly disables the module. No existing condition is removed or
--   relaxed; we only ADD a gate.
--
-- Idempotent: drop policy if exists + create policy, matching the existing
-- policy NAMES and bodies (the only delta is the added conjunct). Re-runnable.
--
-- Module-key map:
--   issues, issue_comments                      -> 'issues'
--   site_instructions, si_versions, protest_comments -> 'si'
--   variation_orders, vo_versions               -> 'vo'
--   permits_to_work, permit_versions,
--     permit_workers, permit_signoffs, permit_scans -> 'ptw'
--
-- For child tables (comments, versions, workers, signoffs, scans, protests)
-- the project is reached through the parent row's project_id; the gate is
-- added inside the same parent EXISTS subquery that already scopes the row.
--
-- Current policy bodies sourced from (latest definition wins):
--   issues / issue_comments : v4-issues-schema.sql, v4-fix-issue-update-rls.sql
--   si tables               : v9-si-schema.sql
--   vo tables               : v9-vo-schema.sql, v28-vo-optional-si.sql (INSERT)
--   ptw tables              : v10-ptw-schema.sql
-- Server-only INSERT policies (with check (false): permit_signoffs,
-- permit_scans) are intentionally NOT re-created — they grant no client
-- write, so a module gate would be inert. Their SELECT is gated below.
-- =============================================================

-- =============================================================
-- issues  (module_key = 'issues')
-- =============================================================

-- SELECT — v4-issues-schema.sql:78
drop policy if exists "Members view issues in their projects" on issues;
create policy "Members view issues in their projects"
  on issues for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(issues.project_id, 'issues')
  );

-- INSERT — v4-issues-schema.sql:82
drop policy if exists "Members create issues in their projects" on issues;
create policy "Members create issues in their projects"
  on issues for insert to authenticated
  with check (
    can_view_project(auth.uid(), project_id)
    and reporter_id = auth.uid()
    and project_module_enabled(issues.project_id, 'issues')
  );

-- =============================================================
-- issue_comments  (module_key = 'issues' via parent issue's project)
-- =============================================================

-- SELECT — v4-issues-schema.sql:102
drop policy if exists "Members view comments in their issues" on issue_comments;
create policy "Members view comments in their issues"
  on issue_comments for select to authenticated
  using (exists (
    select 1 from issues
    where id = issue_comments.issue_id
      and can_view_project(auth.uid(), project_id)
      and project_module_enabled(issues.project_id, 'issues')
  ));

-- INSERT — v4-issues-schema.sql:110
drop policy if exists "Members add comments to their issues" on issue_comments;
create policy "Members add comments to their issues"
  on issue_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from issues
      where id = issue_comments.issue_id
        and can_view_project(auth.uid(), project_id)
        and project_module_enabled(issues.project_id, 'issues')
    )
  );

-- =============================================================
-- site_instructions  (module_key = 'si')
-- =============================================================

-- SELECT — v9-si-schema.sql:102
drop policy if exists "Members view SI" on site_instructions;
create policy "Members view SI"
  on site_instructions for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(site_instructions.project_id, 'si')
  );

-- INSERT — v9-si-schema.sql:106
drop policy if exists "Submitter creates SI" on site_instructions;
create policy "Submitter creates SI"
  on site_instructions for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and project_module_enabled(site_instructions.project_id, 'si')
  );

-- =============================================================
-- si_versions  (module_key = 'si' via parent SI's project)
-- =============================================================

-- SELECT — v9-si-schema.sql:130
drop policy if exists "Members view versions" on si_versions;
create policy "Members view versions"
  on si_versions for select to authenticated
  using (
    exists (
      select 1 from site_instructions s
       where s.id = si_id
         and can_view_project(auth.uid(), s.project_id)
         and project_module_enabled(s.project_id, 'si')
    )
  );

-- INSERT — v9-si-schema.sql:149
drop policy if exists "Creator inserts versions when draft or revision" on si_versions;
create policy "Creator inserts versions when draft or revision"
  on si_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (
      select 1 from site_instructions s
       where s.id = si_id
         and s.created_by = auth.uid()
         and s.status in ('draft','revision_requested')
         and s.locked_at is null
         and project_module_enabled(s.project_id, 'si')
    )
  );

-- =============================================================
-- protest_comments  (module_key = 'si' via parent SI's project)
-- =============================================================

-- SELECT — v9-si-schema.sql:164
drop policy if exists "Members view protest" on protest_comments;
create policy "Members view protest"
  on protest_comments for select to authenticated
  using (
    exists (
      select 1 from site_instructions s
       where s.id = si_id
         and can_view_project(auth.uid(), s.project_id)
         and project_module_enabled(s.project_id, 'si')
    )
  );

-- INSERT — v9-si-schema.sql:173
drop policy if exists "Insert protest only when locked" on protest_comments;
create policy "Insert protest only when locked"
  on protest_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from site_instructions s
       where s.id = si_id
         and s.status = 'locked'
         and can_view_project(auth.uid(), s.project_id)
         and project_module_enabled(s.project_id, 'si')
    )
  );

-- =============================================================
-- variation_orders  (module_key = 'vo')
-- =============================================================

-- SELECT — v9-vo-schema.sql:235
drop policy if exists "Members view VO" on variation_orders;
create policy "Members view VO"
  on variation_orders for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(variation_orders.project_id, 'vo')
  );

-- INSERT — v28-vo-optional-si.sql:35 (latest; relaxed standalone-VO form)
drop policy if exists "Creator inserts draft VO" on variation_orders;
create policy "Creator inserts draft VO"
  on variation_orders for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and project_module_enabled(variation_orders.project_id, 'vo')
    and (
      -- standalone VO: just needs project edit rights
      (si_id is null and can_edit_project_progress(auth.uid(), project_id))
      -- SI-linked VO: cited SI must be locked and in this project
      or exists (
        select 1 from site_instructions s
         where s.id = si_id
           and s.project_id = project_id
           and s.status = 'locked'
           and s.locked_at is not null
           and can_edit_project_progress(auth.uid(), s.project_id)
      )
    )
  );

-- =============================================================
-- vo_versions  (module_key = 'vo' via parent VO's project)
-- =============================================================

-- SELECT — v9-vo-schema.sql:275
drop policy if exists "Members view VO versions" on vo_versions;
create policy "Members view VO versions"
  on vo_versions for select to authenticated
  using (
    exists (
      select 1 from variation_orders v
       where v.id = vo_id
         and can_view_project(auth.uid(), v.project_id)
         and project_module_enabled(v.project_id, 'vo')
    )
  );

-- INSERT — v9-vo-schema.sql:287
drop policy if exists "Creator inserts VO version when not locked" on vo_versions;
create policy "Creator inserts VO version when not locked"
  on vo_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (
      select 1 from variation_orders v
       where v.id = vo_id
         and v.created_by = auth.uid()
         and v.status in ('draft','revision_requested')
         and v.locked_at is null
         and project_module_enabled(v.project_id, 'vo')
    )
  );

-- =============================================================
-- permits_to_work  (module_key = 'ptw')
-- =============================================================

-- SELECT — v10-ptw-schema.sql:167
drop policy if exists "Members view PTW" on permits_to_work;
create policy "Members view PTW"
  on permits_to_work for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(permits_to_work.project_id, 'ptw')
  );

-- INSERT — v10-ptw-schema.sql:172
drop policy if exists "Creator inserts draft PTW" on permits_to_work;
create policy "Creator inserts draft PTW"
  on permits_to_work for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(permits_to_work.project_id, 'ptw')
  );

-- =============================================================
-- permit_versions  (module_key = 'ptw' via parent permit's project)
-- =============================================================

-- SELECT — v10-ptw-schema.sql:193
drop policy if exists "Members view PTW versions" on permit_versions;
create policy "Members view PTW versions"
  on permit_versions for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and can_view_project(auth.uid(), p.project_id)
               and project_module_enabled(p.project_id, 'ptw'))
  );

-- INSERT — v10-ptw-schema.sql:201
drop policy if exists "Creator inserts version when draft or revision" on permit_versions;
create policy "Creator inserts version when draft or revision"
  on permit_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (select 1 from permits_to_work p
                 where p.id = ptw_id
                   and p.created_by = auth.uid()
                   and p.status in ('draft','revision_requested')
                   and p.locked_at is null
                   and project_module_enabled(p.project_id, 'ptw'))
  );

-- =============================================================
-- permit_workers  (module_key = 'ptw' via parent permit's project)
-- =============================================================

-- SELECT — v10-ptw-schema.sql:213
drop policy if exists "Members view permit workers" on permit_workers;
create policy "Members view permit workers"
  on permit_workers for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and can_view_project(auth.uid(), p.project_id)
               and project_module_enabled(p.project_id, 'ptw'))
  );

-- INSERT — v10-ptw-schema.sql:221
drop policy if exists "Creator manages workers when draft or revision" on permit_workers;
create policy "Creator manages workers when draft or revision"
  on permit_workers for insert to authenticated
  with check (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and p.created_by = auth.uid()
               and p.status in ('draft','revision_requested')
               and project_module_enabled(p.project_id, 'ptw'))
  );

-- =============================================================
-- permit_signoffs  (module_key = 'ptw' via parent permit's project)
--   SELECT only — INSERT is server-only (with check (false)); left untouched.
-- =============================================================

-- SELECT — v10-ptw-schema.sql:231
drop policy if exists "Members view signoffs" on permit_signoffs;
create policy "Members view signoffs"
  on permit_signoffs for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and can_view_project(auth.uid(), p.project_id)
               and project_module_enabled(p.project_id, 'ptw'))
  );

-- =============================================================
-- permit_scans  (module_key = 'ptw' via parent permit's project)
--   SELECT only — INSERT is server-only (with check (false)); left untouched.
-- =============================================================

-- SELECT — v10-ptw-schema.sql:244
drop policy if exists "Members view PTW scans" on permit_scans;
create policy "Members view PTW scans"
  on permit_scans for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and can_view_project(auth.uid(), p.project_id)
               and project_module_enabled(p.project_id, 'ptw'))
  );

-- =============================================================
-- Post-apply verification (execute, not source):
--
-- 1. Every gated policy still exists with the added conjunct present in its
--    qual / with_check expression:
--      select tablename, policyname, cmd
--        from pg_policies
--       where schemaname = 'public'
--         and tablename in ('issues','issue_comments','site_instructions',
--           'si_versions','protest_comments','variation_orders','vo_versions',
--           'permits_to_work','permit_versions','permit_workers',
--           'permit_signoffs','permit_scans')
--       order by tablename, policyname;
--      -- spot-check one body contains the gate:
--      select qual from pg_policies
--       where tablename='issues' and policyname='Members view issues in their projects';
--      -- expect: ... project_module_enabled(... 'issues') ...
--
-- 2. BACKWARDS-COMPAT — with NO override rows, all access is unchanged.
--    For any live project P with issues/SI/VO/PTW rows, a member who could
--    read them before still reads the same count:
--      select project_module_enabled('<P>'::uuid, 'issues');  -> t  (absence=enabled)
--      select count(*) from issues where project_id='<P>'::uuid;  -- unchanged for a member
--
-- 3. GATE BITES — as an admin, disable a module for project P, then a member
--    sees zero rows of that module (RLS now filters them):
--      select set_project_module('<P>'::uuid, 'issues', false);   -- as admin
--      -- as a project member: select count(*) from issues where project_id='<P>'::uuid;  -> 0
--      -- re-enable restores visibility:
--      select set_project_module('<P>'::uuid, 'issues', true);    -- as admin
--
-- 4. CORE never gated here — 'progress' is untouched by this migration.
-- =============================================================
