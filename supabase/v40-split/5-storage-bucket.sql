-- =============================================================
-- v40-split/5-storage-bucket.sql — PRIVATE bucket project-docs (§2.1)
-- =============================================================
-- Instantiates v8-private-bucket-template.sql exactly like
-- v9-si-vo-storage-bucket.sql did. New uploads land in project-docs;
-- migrated drawings keep their blobs in project-drawings (never moved —
-- their document_versions.bucket_id='project-drawings').
--
-- Path scheme:
--   {project_id}/{document_id}/v{version_no}/{filename}
--   {project_id}/{document_id}/v{version_no}/thumb.jpg
-- → (storage.foldername(name))[1] = project_id
--
-- Two policies (SELECT + INSERT). NO update / delete policies —
-- document blobs are IMMORTAL evidence per template §4.
-- =============================================================

-- ── 1. PRIVATE bucket creation ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('project-docs', 'project-docs', false)
on conflict (id) do nothing;

-- ── 2. storage.objects RLS (idempotent drop-then-create) ──────
drop policy if exists "Members read docs" on storage.objects;
drop policy if exists "Editors upload docs" on storage.objects;

create policy "Members read docs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-docs'
    and can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- can_upload_document accepts: admin + assigned_pm + approved member with
-- role in (pm, general_foreman, main_contractor, subcontractor). 判頭 IS
-- allowed to upload (MAT/MS/INS are the subcontractor's instrument). The
-- per-row drawing-type carve-out (D-25) lives on the TABLE policies, not
-- here — storage can't see document_type, and the table INSERT policy
-- already blocks a 判頭 from creating a drawing-type document/version.
create policy "Editors upload docs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-docs'
    and can_upload_document(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- NO update / delete policies on storage.objects — document blobs are
-- IMMORTAL evidence. Bucket realtime is NOT published.

-- =============================================================
-- End of v40-split/5-storage-bucket.sql
-- =============================================================
