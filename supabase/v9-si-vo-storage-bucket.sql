-- =============================================================
-- v9-si-vo-storage-bucket.sql — INF-02 instantiation for Phase 2
-- =============================================================
-- Mirrors v8-private-bucket-template.sql + v8-drawings.sql storage
-- pattern. Introduces a new PRIVATE bucket `project-si-vo` for SI
-- photos + voice memos and VO attachments.
--
-- Path scheme:
--   {project_id}/si/{si_id}/v{n}/photos/{filename}
--   {project_id}/si/{si_id}/v{n}/voice.m4a
--   {project_id}/vo/{vo_id}/v{n}/attachments/{filename}
--
-- Two policies (SELECT + INSERT). NO update / delete policies —
-- SI/VO blobs are IMMORTAL evidence per template §4.
-- =============================================================

-- ── 1. PRIVATE bucket creation ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('project-si-vo', 'project-si-vo', false)
on conflict (id) do nothing;

-- ── 2. storage.objects RLS (idempotent drop-then-create) ──────
drop policy if exists "Members read si-vo" on storage.objects;
drop policy if exists "Editors upload si-vo" on storage.objects;

create policy "Members read si-vo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-si-vo'
    and can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- can_edit_project_progress accepts: admin + assigned_pm + approved
-- member with role in (pm, main_contractor, subcontractor).
-- Subcontractor IS allowed to upload SI photos/voice (SI is the
-- subcon's instrument — the whole reason this bucket exists).
-- This intentionally differs from v8-drawings.sql which uses
-- can_upload_drawing (excludes subcontractor per D-25).
create policy "Editors upload si-vo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-si-vo'
    and can_edit_project_progress(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- NO update / delete policies on storage.objects — SI/VO blobs are
-- IMMORTAL evidence. Bucket realtime is NOT published.

-- =============================================================
-- End of v9-si-vo-storage-bucket.sql
-- Post-apply verification:
--   select id, public from storage.buckets where id='project-si-vo';
--   select policyname from pg_policies
--     where tablename='objects' and schemaname='storage'
--       and policyname like '%si-vo%';
-- =============================================================
