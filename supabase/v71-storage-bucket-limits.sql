-- =============================================================
-- v71-storage-bucket-limits.sql   (Final-upgrade Tier 1.4 — free-tier durability)
-- =============================================================
-- DEFECT: NONE of the 4 storage buckets has a server-side file_size_limit or
-- allowed_mime_types (grep across supabase/ returns zero). Size/MIME enforcement
-- is client-JS-only, so a stale/cached native build, a direct REST upload, or an
-- SDK change can push arbitrary objects toward the Supabase Free 1GB cliff. This
-- is the durable backstop the freeze relies on: it survives a frozen/stale client
-- untouched (CLAUDE.md: drawings + permit photos will dominate the 1GB tier).
--
-- file_size_limit is bytes. allowed_mime_types is text[] (NULL = allow all).
-- Sizes are deliberately tight for a 1GB tier. MIME allowlists are set ONLY where
-- the upload type is unambiguous (images / pdf) to avoid breaking a legitimate
-- upload in a frozen system; project-docs keeps mime open (size-limit only)
-- because the Documents module may carry office formats — its allowlist is a
-- Wave-3 task to set once the client accept-types are confirmed.
-- Idempotent (plain UPDATE). Backwards-compatible.
-- =============================================================

-- issue-photos: phone snapshots only. 10 MB, images.
update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'issue-photos';

-- project-drawings: drawings + markups. 25 MB to match the client cap
-- (DrawingsContext.tsx:21 MAX_BYTES = 25*1024*1024 — a 20-25MB drawing passes
-- client validation, so a 20MB bucket cap would 413 it). images + pdf.
update storage.buckets
   set file_size_limit = 26214400,  -- 25 MB (matches client MAX_BYTES)
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
 where id = 'project-drawings';

-- project-si-vo: SI/VO attachments include photos, signed pdf AND voice notes
-- (src/lib/si.ts:47 uploads audio/m4a — and Capacitor/browsers label m4a variously
-- as audio/mp4 / audio/x-m4a / audio/aac). Enumerating audio MIME is fragile and a
-- wrong guess breaks a live feature in a frozen window, so this bucket is
-- SIZE-ONLY (no MIME allowlist), like project-docs. 20 MB.
update storage.buckets
   set file_size_limit = 20971520  -- 20 MB
 where id = 'project-si-vo';

-- project-docs: documents (may include office formats). Size cap only; leave
-- allowed_mime_types open so no legitimate upload breaks in the frozen window.
update storage.buckets
   set file_size_limit = 20971520  -- 20 MB
 where id = 'project-docs';

-- =============================================================
-- Verify (EXECUTE, not source):
--   select id, file_size_limit, allowed_mime_types from storage.buckets
--   where id in ('issue-photos','project-drawings','project-si-vo','project-docs');
--   -- then attempt (via REST) a 15 MB image to issue-photos -> REJECTED (413/exceeds),
--   --   and an application/x-msdownload (.exe) to issue-photos -> REJECTED (mime).
-- =============================================================
