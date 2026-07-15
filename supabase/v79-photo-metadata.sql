-- =============================================================
-- v79-photo-metadata.sql
-- =============================================================
-- B2 (DWSS §3.3.3): capture date/time + GPS metadata for site photos at the
-- moment of capture, stored alongside the photo. DWSS wants photo evidence to
-- carry verifiable WGS84 GPS + timestamp. CK already compresses photos
-- (image-compress.ts ~300-600KB) but persisted NO metadata.
--
-- This adds an APPEND-ONLY photo_metadata table keyed by (bucket, photo_path).
-- Stores WGS84 lat/lng + accuracy + capture timestamp. (HK80 Grid conversion is
-- a verified follow-up — done client-side at export, not stored here, to avoid
-- shipping unverified geodetic math on a compliance feature.)
--
-- Immutable: SELECT + INSERT only (no UPDATE/DELETE policy or grant) so a
-- recorded photo location cannot be silently altered — matching the app's
-- tamper-evident posture. Best-effort: a missing/denied GPS stores NULL coords;
-- recording never blocks the parent record (issue/PTW/etc.).
--
-- Additive + idempotent. RLS gates by project membership (can_view_project).
-- =============================================================

create table if not exists photo_metadata (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bucket text not null,
  photo_path text not null,
  captured_at timestamptz not null,
  gps_lat numeric(9,6),
  gps_lng numeric(9,6),
  gps_accuracy_m integer,
  uploaded_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, photo_path)
);

create index if not exists idx_photo_metadata_project on photo_metadata(project_id);

alter table photo_metadata enable row level security;

-- Members of the project may read photo metadata.
drop policy if exists photo_metadata_select on photo_metadata;
create policy photo_metadata_select on photo_metadata for select to authenticated
  using (can_view_project(auth.uid(), project_id));

-- A project member may record metadata for their own uploads. No UPDATE/DELETE
-- policy => rows are immutable once written (tamper-evident).
drop policy if exists photo_metadata_insert on photo_metadata;
create policy photo_metadata_insert on photo_metadata for insert to authenticated
  with check (can_view_project(auth.uid(), project_id) and uploaded_by = auth.uid());

grant select, insert on photo_metadata to authenticated;

-- Verify (execute): table + policies exist; an inserted row by a project member
-- is readable; UPDATE/DELETE by anyone is rejected (no policy).
