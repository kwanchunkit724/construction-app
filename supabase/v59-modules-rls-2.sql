-- =============================================================
-- v59-modules-rls-2.sql   (Module system Phase 2 — RLS group 2 + existing-flag fold-in)
-- =============================================================
-- Foundation: v59-modules-schema.sql created project_modules +
-- project_module_enabled(p_project_id, p_module_key) → boolean, with the
-- backwards-compatible default "absence = enabled". This migration folds that
-- per-project switch into the RLS of the feature tables in GROUP 2, plus
-- documents how it composes with the three PRE-EXISTING feature flags
-- (ptw_enabled / files_enabled / ai_*_enabled).
--
-- METHOD (mirrors group 1 / 2D): for each gated table we DROP the existing
-- policy verbatim and RECREATE it with ONE extra conjunct —
--     and project_module_enabled(<project_id col>, '<module key>')
-- — added to its USING (reads) and, where it makes sense, its WITH CHECK
-- (writes). Nothing else about the policy changes. Because the helper
-- coalesces an absent row to TRUE, every live project keeps byte-identical
-- behaviour (all modules on) until an admin explicitly disables one — so this
-- is purely additive and safe to run while live iOS clients are connected.
--
-- WHY GATE SELECT *and* INSERT (not just SELECT): hiding the UI surface is the
-- client-side ModuleGate's job. The RLS conjunct is defence-in-depth — once an
-- admin disables a module for a project, a hand-rolled REST call must ALSO be
-- unable to read OR create rows for that surface. We add the conjunct to:
--   * every SELECT policy (the row disappears from reads), and
--   * every INSERT/UPDATE write policy whose surface is fully owned by the
--     module (so a disabled module is also write-frozen).
-- We do NOT touch DELETE policies: letting an admin still clean up rows of a
-- module they just disabled is the safer default (no data gets stranded as
-- un-deletable). Reads/inserts being gated is enough to "hide" the surface.
--
-- TABLES TOUCHED in this file (module key in parens):
--   project_weather_claims  ('weather')   -- weather_events is TERRITORY-WIDE → NOT gated
--   documents               ('documents')
--   document_versions       ('documents')  -- via join to documents.project_id
--   document_events         ('documents')  -- via join to documents.project_id
--   document_counters       ('documents')
--   materials               ('materials')
--   contacts                ('contacts')
--   events                  ('timetable')  -- the timetable surface is the events table
--   dailies                 ('dailies')
--   equipment_register      ('equipment')
--   form_instances          ('equipment')
--   form_signoffs           ('equipment')  -- SELECT only (insert already RPC-only)
--   equipment_scans         ('equipment')  -- SELECT only (insert already RPC-only)
--   user_credentials        — NOT gated (user-owned, cross-project; see note E4)
--   form_templates          — NOT gated (shared reference data, not per-project)
--
-- FOLD-IN of the three PRE-EXISTING flags (documented +, for AI, enforced):
--   * 'ptw'        module ANDs with the existing app_config.ptw_enabled flag.
--   * 'documents'  module ANDs with the existing app_config.files_enabled flag.
--   * 'assistant'  module ANDs with the existing AI flags (app_config
--                  .ai_assistant_enabled global + projects.ai_enabled per
--                  project) — enforced here by extending ai_enabled_for_project.
-- See the "EXISTING-FLAG FOLD-IN" section near the bottom for the full story.
--
-- NOTE ON 'si' / 'vo' / 'issues' / 'progress' / 'ptw': those feature tables are
-- in RLS group 1 (handled by the 2D agent) or are core (progress, never
-- disableable). This file is group 2 only.
-- Idempotent: every policy is drop-if-exists + create. Re-runnable.
-- =============================================================


-- =============================================================
-- 1. weather  →  project_weather_claims          (key: 'weather')
-- -------------------------------------------------------------
-- weather_events is the TERRITORY-WIDE objective-fact table (T8/黑雨/rainfall
-- days for the whole of HK, service-role written). It is NOT project-scoped and
-- is deliberately LEFT UNGATED — disabling a project's weather module must not
-- erase the shared HKO record other projects rely on. Only the per-project EOT
-- claim rows (project_weather_claims) follow the module switch.
-- Original policies: v58-weather-record.sql:52-63.
-- =============================================================
drop policy if exists pwc_select on project_weather_claims;
create policy pwc_select on project_weather_claims for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'weather')
  );

drop policy if exists pwc_insert on project_weather_claims;
create policy pwc_insert on project_weather_claims for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and recorded_by = auth.uid()
    and project_module_enabled(project_id, 'weather')
  );

drop policy if exists pwc_update on project_weather_claims;
create policy pwc_update on project_weather_claims for update to authenticated
  using (
    can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'weather')
  );
-- pwc_delete left UNCHANGED (see header: deletes are never module-gated).


-- =============================================================
-- 2. documents  →  documents / document_versions / document_events /
--                  document_counters               (key: 'documents')
-- -------------------------------------------------------------
-- Original policies: v40-split/3-helpers-and-rls.sql:83-173. The three child
-- tables resolve project_id by joining the parent documents row, so the
-- conjunct rides INSIDE the existing exists() against documents d.
--
-- FOLD-IN: this module ANDs with the existing app_config.files_enabled flag.
-- files_enabled is a GLOBAL kill-switch read client-side by FilesGate via
-- get_files_enabled() (v40-split/2). The new 'documents' module is the
-- PER-PROJECT switch. Effective visibility = files_enabled (global, gates the
-- whole route for everyone) AND module 'documents' (per project). They compose
-- by AND with no conflict: the global flag stays the master on/off for the
-- feature; the module lets an admin hide 文件 on a single project while the
-- feature is globally live. We add ONLY the per-project module conjunct to RLS
-- here; the global files_enabled gate remains where it is (the FilesGate
-- route + get_files_enabled RPC) — no behavioural change to it.
-- =============================================================

-- documents (header) — project_id is a direct column.
drop policy if exists "Members view documents" on documents;
create policy "Members view documents"
  on documents for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'documents')
  );

drop policy if exists "Editors insert documents" on documents;
create policy "Editors insert documents"
  on documents for insert to authenticated
  with check (
    can_upload_document(auth.uid(), project_id)
    and (document_type <> 'drawing' or can_upload_drawing(auth.uid(), project_id))
    and project_module_enabled(project_id, 'documents')
  );
-- "Creators or reviewers edit documents" (UPDATE) left UNCHANGED: it is the
-- title/metadata edit + review-bookkeeping path; freezing edits on a disabled
-- module would strand in-flight review state. Reads + new inserts being gated
-- is enough to hide the surface (matches the delete-policy reasoning).

-- document_versions — project via join to documents.project_id.
drop policy if exists "Members view document versions" on document_versions;
create policy "Members view document versions"
  on document_versions for select to authenticated
  using (exists (
    select 1 from documents d
    where d.id = document_versions.document_id
      and can_view_project(auth.uid(), d.project_id)
      and project_module_enabled(d.project_id, 'documents')
  ));

drop policy if exists "Editors insert document versions" on document_versions;
create policy "Editors insert document versions"
  on document_versions for insert to authenticated
  with check (exists (
    select 1 from documents d
    where d.id = document_versions.document_id
      and can_upload_document(auth.uid(), d.project_id)
      and (d.document_type <> 'drawing' or can_upload_drawing(auth.uid(), d.project_id))
      and project_module_enabled(d.project_id, 'documents')
  ));
-- (document_versions has NO update/delete policy by design — review/withdraw go
--  through SECURITY DEFINER RPCs + the guard trigger; nothing to gate here.)

-- document_events — project via join to documents.project_id (SELECT only;
-- rows are written exclusively by the security-definer log_document_event).
drop policy if exists "Members view document events" on document_events;
create policy "Members view document events"
  on document_events for select to authenticated
  using (exists (
    select 1 from documents d
    where d.id = document_events.document_id
      and can_view_project(auth.uid(), d.project_id)
      and project_module_enabled(d.project_id, 'documents')
  ));

-- document_counters — project_id is a direct column (SELECT only; writes happen
-- inside next_document_number, definer).
drop policy if exists "Members view document counters" on document_counters;
create policy "Members view document counters"
  on document_counters for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'documents')
  );


-- =============================================================
-- 3. materials  →  materials                       (key: 'materials')
-- -------------------------------------------------------------
-- Original policies: v11-materials-schema.sql:68-127. These policies do NOT
-- carry an explicit `to authenticated` clause — we preserve that shape exactly
-- and only add the module conjunct. project_id is a direct column.
-- =============================================================
drop policy if exists materials_select on materials;
create policy materials_select on materials for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(materials.project_id, 'materials')
  );

drop policy if exists materials_insert on materials;
create policy materials_insert on materials for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
    and project_module_enabled(materials.project_id, 'materials')
  );

drop policy if exists materials_update on materials;
create policy materials_update on materials for update
  using (
    exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
    and project_module_enabled(materials.project_id, 'materials')
  )
  with check (
    exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
    and project_module_enabled(materials.project_id, 'materials')
  );
-- materials_delete left UNCHANGED (see header: deletes are never module-gated).


-- =============================================================
-- 4. contacts  →  contacts                         (key: 'contacts')
-- -------------------------------------------------------------
-- Original policies: v11-contacts-schema.sql:43-92. No `to authenticated`
-- clause in the originals — preserved. project_id is a direct column.
-- =============================================================
drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = contacts.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(contacts.project_id, 'contacts')
  );

drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
    and exists (
      select 1 from project_members pm
      where pm.project_id = contacts.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(contacts.project_id, 'contacts')
  );
-- contacts_update / contacts_delete left UNCHANGED: they are admin/pm-only
-- curation paths and the surface is hidden once SELECT is gated.


-- =============================================================
-- 5. timetable  →  events                          (key: 'timetable')
-- -------------------------------------------------------------
-- The 行事曆 / timetable surface is backed by the events table (the calendar
-- RPC unions events + material arrivals + progress completions, but the only
-- table the timetable module OWNS is events — materials/progress have their own
-- modules). Original policies: v11-events-schema.sql:47-84. project_id direct.
-- =============================================================
drop policy if exists events_select on events;
create policy events_select on events for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = events.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(events.project_id, 'timetable')
  );

drop policy if exists events_insert on events;
create policy events_insert on events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = events.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor')
    )
    and project_module_enabled(events.project_id, 'timetable')
  );
-- events_update / events_delete left UNCHANGED (deletes never gated; update is
-- creator/admin curation, hidden once SELECT is gated).


-- =============================================================
-- 6. dailies  →  dailies                           (key: 'dailies')
-- -------------------------------------------------------------
-- Original policies: v11-dailies-schema.sql:53-100. project_id direct. The
-- update/delete policies additionally carry the "same HKT day" edit window —
-- we keep that and AND the module conjunct onto SELECT + INSERT (the surface
-- gates). project_id direct.
-- =============================================================
drop policy if exists dailies_select on dailies;
create policy dailies_select on dailies for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(dailies.project_id, 'dailies')
  );

drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and up.global_role = 'main_contractor'
        and up.sub_role in ('foreman','engineer')
    )
    and exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
    and project_module_enabled(dailies.project_id, 'dailies')
  );
-- dailies_update / dailies_delete left UNCHANGED: same-HKT-day self-edit window;
-- surface hidden once SELECT is gated, deletes never gated.


-- =============================================================
-- 7. equipment  →  equipment_register / form_instances /
--                  form_signoffs / equipment_scans (key: 'equipment')
-- -------------------------------------------------------------
-- The 機械 / 表格 surface. Original policies: v55-equipment-forms-schema.sql:
-- 138-192. equipment_register / form_instances carry project_id directly;
-- form_signoffs carries project_id directly too (denormalised). equipment_scans
-- resolves project via the equipment_register join. form_templates is shared
-- reference data (NOT project-scoped) and is intentionally NOT gated.
-- user_credentials is user-owned and cross-project (a worker's green card is not
-- a property of any one project) — NOT gated (see note E4).
-- =============================================================

-- equipment_register — project_id direct.
drop policy if exists equipment_select on equipment_register;
create policy equipment_select on equipment_register for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'equipment')
  );

drop policy if exists equipment_write on equipment_register;
create policy equipment_write on equipment_register for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and exists (select 1 from project_members m where m.project_id = equipment_register.project_id
                  and m.user_id = auth.uid() and m.status = 'approved'
                  and m.role in ('pm','main_contractor','safety_officer'))
    and project_module_enabled(project_id, 'equipment')
  );
-- equipment_update left UNCHANGED (surface hidden once SELECT + INSERT gated).

-- form_instances — project_id direct.
drop policy if exists form_instances_select on form_instances;
create policy form_instances_select on form_instances for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'equipment')
  );

drop policy if exists form_instances_write on form_instances;
create policy form_instances_write on form_instances for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and project_module_enabled(project_id, 'equipment')
  );
-- form_instances_update left UNCHANGED.

-- form_signoffs — project_id direct (denormalised). SELECT-only gate; insert is
-- already RPC-only (with check(false)), so the surface freeze happens at SELECT.
drop policy if exists form_signoffs_select on form_signoffs;
create policy form_signoffs_select on form_signoffs for select to authenticated
  using (
    can_view_project(auth.uid(), project_id)
    and project_module_enabled(project_id, 'equipment')
  );

-- equipment_scans — project via equipment_register join. SELECT-only gate
-- (insert is RPC-only with check(false)).
drop policy if exists equipment_scans_select on equipment_scans;
create policy equipment_scans_select on equipment_scans for select to authenticated
  using (exists (select 1 from equipment_register e
                 where e.id = equipment_scans.equipment_id
                   and can_view_project(auth.uid(), e.project_id)
                   and project_module_enabled(e.project_id, 'equipment')));


-- =============================================================
-- EXISTING-FLAG FOLD-IN — how the new module switches relate to the three
-- pre-existing feature flags. (1) PTW + (2) documents are DOCUMENTED only here
-- (their global flag stays where it is; the module conjunct lives in the
-- corresponding table RLS — documents above in §2; PTW in RLS group 1 / 2D).
-- (3) the assistant is ENFORCED here by extending ai_enabled_for_project.
-- =============================================================

-- ── (1) 'ptw'  ⇆  app_config.ptw_enabled ─────────────────────────────────────
-- ptw_enabled (v10-ptw-schema.sql:75) is the GLOBAL App-Store-gating kill-switch
-- read client-side by PtwGate via get_ptw_enabled(); it has never had an RLS
-- conjunct (the permits_to_work policies gate only on can_view_project /
-- can_edit_project_progress). The new 'ptw' module is the PER-PROJECT switch and
-- its RLS conjunct lives on permits_to_work in RLS GROUP 1 (2D agent), NOT here.
-- Composition is AND: a PTW is visible iff ptw_enabled (global) is true AND the
-- 'ptw' module is enabled for that project. No change to ptw_enabled itself.

-- ── (2) 'documents'  ⇆  app_config.files_enabled ─────────────────────────────
-- Documented in §2 above. files_enabled (v40-split/2) = global master switch
-- (FilesGate route + get_files_enabled()). 'documents' module = per-project
-- switch (RLS conjunct added in §2). Effective = files_enabled AND module. No
-- change to files_enabled itself.

-- ── (3) 'assistant'  ⇆  ai_assistant_enabled (global) + projects.ai_enabled ──
-- ENFORCED here. ai_enabled_for_project (v56-ai-assistant.sql:183-188) is the
-- single gate the AI Edge Function calls first AND the gate the client hook
-- useAiAssistantEnabled() reads to decide whether to show the 助理. Today it is:
--     ai_assistant_enabled (global)  AND  projects.ai_enabled (per-project pilot)
--     AND can_view_project(...)
-- We extend it to ALSO require the 'assistant' module — so disabling the
-- assistant module for a project hides the AI everywhere it matters (UI hook +
-- Edge-Function entry) in ONE place, transparently to both callers. Additive:
-- project_module_enabled defaults TRUE, so every project where the AI is already
-- enabled keeps it until an admin flips the module off. We REPLACE the function
-- body verbatim plus the one new conjunct; the signature / grants are unchanged.
create or replace function ai_enabled_for_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ai_assistant_enabled from app_config where id = 1), false)
     and coalesce((select ai_enabled from projects where id = p_project_id), false)
     and can_view_project(auth.uid(), p_project_id)
     and project_module_enabled(p_project_id, 'assistant');
$$;
revoke all on function ai_enabled_for_project(uuid) from public;
grant execute on function ai_enabled_for_project(uuid) to authenticated;

-- NOTE (E4): user_credentials + form_templates are NOT module-gated.
--   * form_templates — global shared reference data (statutory checklists), not
--     keyed by project; gating it per-project is meaningless.
--   * user_credentials — a worker's qualification (green card / competent-person
--     cert) belongs to the PERSON across every project, not to one project's
--     equipment module. Hiding it when a single project disables 機械 would
--     break credential checks on OTHER projects where equipment is still on.
--   Both are intentionally left as-is.


-- =============================================================
-- Post-apply verification (execute, not source). Pick a project id <P> and an
-- admin session.
--
--  -- baseline: every gated module reads enabled before any override
--     select project_module_enabled('<P>'::uuid, 'materials');     -> t (absence)
--
--  -- disable one module, confirm the conjunct now hides the surface:
--     select set_project_module('<P>'::uuid, 'materials', false);   -- as admin
--     -- as a member of <P>: select count(*) from materials where project_id='<P>'; -> 0 rows
--     -- as a member of <P>: insert into materials(...) for <P>      -> RLS denied
--     -- re-enable: select set_project_module('<P>'::uuid, 'materials', true);
--     -- as a member of <P>: rows reappear; insert allowed again.
--
--  -- weather: project_weather_claims follows the switch, weather_events does NOT
--     select set_project_module('<P>'::uuid, 'weather', false);
--     -- select count(*) from project_weather_claims where project_id='<P>'; -> 0
--     -- select count(*) from weather_events;  -> UNCHANGED (territory-wide, ungated)
--
--  -- documents fold-in: both the global files_enabled AND the module must be on
--     -- select get_files_enabled();  (global)   AND
--     -- select project_module_enabled('<P>'::uuid,'documents'); (per project)
--     select set_project_module('<P>'::uuid, 'documents', false);
--     -- documents / document_versions / document_events / document_counters all
--     --   stop returning rows for <P>; new inserts denied.
--
--  -- assistant fold-in: the module now AND's into the AI gate
--     select ai_enabled_for_project('<P>'::uuid);  -- t only if global+project+module all on
--     select set_project_module('<P>'::uuid, 'assistant', false);
--     select ai_enabled_for_project('<P>'::uuid);  -> f  (module off)
--     select set_project_module('<P>'::uuid, 'assistant', true);
--     select ai_enabled_for_project('<P>'::uuid);  -> back to prior value
--
--  -- policy presence sanity (all recreated, none dropped-without-recreate):
--     select tablename, policyname from pg_policies
--      where tablename in ('project_weather_claims','documents','document_versions',
--        'document_events','document_counters','materials','contacts','events',
--        'dailies','equipment_register','form_instances','form_signoffs',
--        'equipment_scans')
--      order by tablename, policyname;
-- =============================================================
