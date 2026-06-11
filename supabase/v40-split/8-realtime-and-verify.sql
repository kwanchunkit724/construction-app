-- =============================================================
-- v40-split/8-realtime-and-verify.sql — realtime + EXECUTE verification
-- =============================================================
-- Publish documents + document_versions to supabase_realtime so the
-- DocumentsContext channel refetches on change. document_events is NOT
-- published (fetched on demand in the detail view, §1.5).
--
-- Wrapped in DO blocks because `alter publication ... add table` errors if
-- the table is already a member (so a plain statement would break re-runs).
-- =============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table documents;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'document_versions'
  ) then
    alter publication supabase_realtime add table document_versions;
  end if;
end $$;

-- =============================================================
-- POST-APPLY VERIFICATION — verify by EXECUTION, not by reading source.
-- Run these after applying split files 1–8 in order.
-- =============================================================
--
-- ── A. Objects exist ─────────────────────────────────────────
--   select table_name from information_schema.tables
--    where table_name in
--      ('documents','document_versions','document_events','document_counters');
--      -- expect 4 rows
--
--   select proname from pg_proc where proname in
--     ('can_upload_document','can_review_document','next_document_number',
--      'supersede_document_version','review_document_version',
--      'withdraw_document_version','log_document_event',
--      'apply_document_supersede_side_effects',
--      'get_files_enabled','set_files_enabled',
--      'assert_document_progress_item_is_leaf',
--      'sync_drawing_to_document','sync_drawing_version_to_document_version');
--      -- expect 13 rows
--      -- (NB5: apply_document_supersede_side_effects was missing from this
--      --  list; the B3-ii guard_document_version_write trigger fn is also new
--      --  but is verified via pg_trigger below, not counted here.)
--
--   select id, public from storage.buckets where id = 'project-docs';   -- public=false
--
--   select tablename from pg_publication_tables
--    where pubname='supabase_realtime'
--      and tablename in ('documents','document_versions');               -- expect 2 rows
--
-- ── B. Feature flag ──────────────────────────────────────────
--   select get_files_enabled();                       -- expect false at ship
--   -- as admin:  select set_files_enabled(true);      -- expect true; flips app_config
--   -- as non-admin: select set_files_enabled(true);   -- expect ERROR '只有系統管理員...'
--
-- ── C. Upload-gate parity (per-project membership; run as each persona) ─
--   -- 判頭 (approved subcontractor member) on a project:
--   select can_upload_document('<subcon_uid>','<project_id>');  -- expect true
--   select can_upload_drawing ('<subcon_uid>','<project_id>');  -- expect false (D-25)
--   -- → so via REST: insert documents(document_type='material_submission') OK,
--   --   insert documents(document_type='drawing') → RLS denied for the 判頭.
--   -- worker / owner member: can_upload_document → false (read-only).
--   -- non-member: SELECT on documents returns 0 rows (can_view_project false).
--
-- ── D. Numbering counter ─────────────────────────────────────
--   -- as an uploader:
--   select next_document_number('<project_id>','material_submission');  -- 'MAT-001'
--   select next_document_number('<project_id>','material_submission');  -- 'MAT-002'
--   select next_document_number('<project_id>','method_statement');     -- 'MS-001'
--   select next_no from document_counters
--    where project_id='<project_id>' and document_type='material_submission'; -- 3
--   -- as a NON-uploader: next_document_number(...) → ERROR '沒有權限...'
--
-- ── E. Submission workflow (submit → reject → resubmit → approve) ─
--   -- 1. create header + first version via supersede RPC (version_no=1):
--   select supersede_document_version('<doc_id>',1,'project-docs',
--     '<project_id>/<doc_id>/v1/a.pdf',null,'application/pdf',1024,'Rev A','<uploader_uid>');
--   select status from document_versions where document_id='<doc_id>'; -- 'submitted'
--   -- 2. self-review must fail (uploader = reviewer, non-admin):
--   --    select review_document_version('<v1_id>','approve');   → ERROR '不可審批自己...'
--   -- 3. reject WITHOUT note must fail:
--   --    select review_document_version('<v1_id>','reject');    → ERROR '...必須填寫原因'
--   -- 4. a DIFFERENT reviewer rejects WITH note:
--   select review_document_version('<v1_id>','reject','色板不符');  -- OK
--   select status, review_note from document_versions where id='<v1_id>'; -- rejected
--   -- 5. uploader resubmits Rev B (version_no=2) → v1 becomes superseded:
--   select supersede_document_version('<doc_id>',2,'project-docs',
--     '<project_id>/<doc_id>/v2/b.pdf',null,'application/pdf',2048,'Rev B','<uploader_uid>');
--   select version_no, status from document_versions
--    where document_id='<doc_id>' order by version_no;  -- v1 superseded, v2 submitted
--   -- 6. reviewer approves v2:
--   select review_document_version('<v2_id>','approve','OK');  -- OK
--   select current_version_id from documents where id='<doc_id>'; -- = v2_id
--   -- 7. full audit trail:
--   select event_type, actor_id, note, created_at from document_events
--    where document_id='<doc_id>' order by created_at;
--      -- expect: version_uploaded, submitted, rejected, version_uploaded,
--      --         submitted, approved (+ 'migrated' if backfilled)
--
-- ── F. Withdraw + current-pointer rebind ─────────────────────
--   -- withdraw the current version as its uploader:
--   select withdraw_document_version('<current_v_id>');  -- OK
--   select current_version_id from documents where id='<doc_id>';
--      -- expect rebound to highest non-withdrawn version (or NULL if none)
--   -- withdraw as a stranger (not uploader/admin) → ERROR '只有上載者或管理員...'
--
-- ── G. Backfill + sync-trigger parity (§4.2 / §4.3) ──────────
--   -- every legacy drawing now has a mirror document with the SAME id:
--   select count(*) from drawings d
--    where not exists (select 1 from documents dd where dd.id=d.id); -- expect 0
--   select count(*) from drawing_versions v
--    where not exists (select 1 from document_versions dv where dv.id=v.id); -- 0
--   -- live-write parity: insert a fresh drawing (old path) and assert the
--   -- mirror appears with status 'approved' and bucket 'project-drawings':
--   --   insert into drawings(...);  insert into drawing_versions(... status 'current');
--   select dv.status, dv.bucket_id from document_versions dv
--    where dv.legacy_drawing_version_id = '<new_drawing_version_id>';
--      -- expect ('approved','project-drawings')
--   -- supersede via legacy RPC, assert mirror flips to 'superseded':
--   --   select supersede_drawing_version(...);
--   select status from document_versions where legacy_drawing_version_id='<old_v_id>';
--      -- expect 'superseded'
--
-- ── H. Storage path probe ────────────────────────────────────
--   -- as an uploader, createSignedUrl on '<project_id>/<doc_id>/v1/a.pdf'
--   --   in bucket project-docs succeeds; a non-member 403s on read.
-- =============================================================
-- End of v40-split/8-realtime-and-verify.sql  (end of v40 set)
-- =============================================================
