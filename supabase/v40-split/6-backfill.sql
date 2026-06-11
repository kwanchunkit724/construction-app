-- =============================================================
-- v40-split/6-backfill.sql — id-preserving drawings backfill (§4.2)
-- =============================================================
-- Copies existing drawings/drawing_versions into the documents register
-- in a SINGLE transaction, PRESERVING UUIDs (documents.id = drawings.id,
-- document_versions.id = drawing_versions.id). This is what keeps
-- SiPayload.drawing_version_ids (src/types.ts) resolvable against the new
-- table with zero payload rewrite (constraint 0.2-1).
--
-- Blobs are NOT copied/moved — migrated versions keep bucket_id =
-- 'project-drawings' and the byte-identical file_path (constraint 0.2-3;
-- the migration adds ZERO storage). Status map:
--   current → approved   (drawings had no review cycle; current = operative)
--   superseded → superseded
--   withdrawn → withdrawn
-- All inserts are `on conflict do nothing` so re-running (or racing the
-- sync trigger, split 7) is safe and idempotent.
-- =============================================================

begin;

-- ── 1. Headers (id preserved) ─────────────────────────────────
insert into documents (
  id, project_id, progress_item_id, document_type, title,
  created_by, created_at, updated_at, legacy_drawing_id
)
select d.id, d.project_id, d.leaf_item_id, 'drawing', d.title,
       d.created_by, d.created_at, d.updated_at, d.id
from drawings d
on conflict (id) do nothing;

-- ── 2. Versions (id preserved; blobs stay in project-drawings) ─
insert into document_versions (
  id, document_id, version_no, revision_label, bucket_id,
  file_path, thumb_path, mime_type, size_bytes, status,
  submitted_by, submitted_at, superseded_at, withdrawn_at, legacy_drawing_version_id
)
select v.id, v.drawing_id, v.version_no, v.revision_label, 'project-drawings',
       v.file_path, v.thumb_path, v.mime_type, v.size_bytes,
       case v.status
         when 'current'    then 'approved'
         when 'superseded' then 'superseded'
         when 'withdrawn'  then 'withdrawn'
         else 'approved'   -- defensive: any unexpected legacy value → operative
       end,
       v.uploaded_by, v.uploaded_at, v.superseded_at, v.withdrawn_at, v.id
from drawing_versions v
on conflict (id) do nothing;

-- ── 3. Current pointers (only for freshly-inserted rows) ──────
-- Restricted to legacy-origin documents so we never clobber a pointer a
-- native document already owns; safe on re-run.
update documents dd
   set current_version_id = d.current_version_id,
       updated_at = greatest(dd.updated_at, d.updated_at)
  from drawings d
 where d.id = dd.id
   and dd.legacy_drawing_id = d.id;

-- ── 4. One 'migrated' event per backfilled document ───────────
-- actor_id = the drawing's creator (NULL-safe). Insert only if this
-- document has no 'migrated' event yet (idempotent on re-run).
insert into document_events (document_id, version_id, event_type, actor_id, note)
select dd.id, dd.current_version_id, 'migrated', dd.created_by, 'migrated from drawings'
from documents dd
where dd.legacy_drawing_id is not null
  and not exists (
    select 1 from document_events e
    where e.document_id = dd.id and e.event_type = 'migrated'
  );

commit;

-- =============================================================
-- End of v40-split/6-backfill.sql
-- =============================================================
