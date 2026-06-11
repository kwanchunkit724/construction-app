-- =============================================================
-- v40-split/7-sync-triggers.sql — one-direction dual-write sync (§4.3)
-- =============================================================
-- During the dual-write window, old iOS v1.3 clients keep writing
-- drawings / drawing_versions and calling supersede_drawing_version.
-- These SECURITY DEFINER AFTER triggers mirror those writes FORWARD into
-- documents / document_versions so new clients (which read only the
-- register) see every drawing.
--
-- ONE DIRECTION ONLY — there is no trigger on documents/document_versions
-- writing back to drawings, so there is NO recursion risk. The status map
-- matches split 6 (current→approved / superseded→superseded /
-- withdrawn→withdrawn). All upserts are id-preserving + idempotent
-- (on conflict (id) do update), so they compose cleanly with the backfill
-- and with re-running this file.
-- =============================================================

-- ── 0. Idempotent drops ───────────────────────────────────────
drop trigger if exists trg_sync_drawing_to_document on drawings;
drop trigger if exists trg_sync_drawing_version_to_document_version on drawing_versions;
drop function if exists sync_drawing_to_document() cascade;
drop function if exists sync_drawing_version_to_document_version() cascade;

-- ── 1. drawings → documents (INSERT + UPDATE) ─────────────────
create or replace function sync_drawing_to_document()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into documents (
    id, project_id, progress_item_id, document_type, title,
    current_version_id, created_by, created_at, updated_at, legacy_drawing_id
  )
  values (
    new.id, new.project_id, new.leaf_item_id, 'drawing', new.title,
    new.current_version_id, new.created_by, new.created_at, new.updated_at, new.id
  )
  on conflict (id) do update
    set title              = excluded.title,
        progress_item_id   = excluded.progress_item_id,
        current_version_id = excluded.current_version_id,
        updated_at         = excluded.updated_at;
  return null;  -- AFTER trigger
end;
$$;

create trigger trg_sync_drawing_to_document
  after insert or update on drawings
  for each row execute function sync_drawing_to_document();

-- ── 2. drawing_versions → document_versions (INSERT + UPDATE) ──
create or replace function sync_drawing_version_to_document_version()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  v_status := case new.status
    when 'current'    then 'approved'
    when 'superseded' then 'superseded'
    when 'withdrawn'  then 'withdrawn'
    else 'approved'
  end;

  -- B5: defensively ensure the parent header exists BEFORE inserting the
  -- version. document_versions.document_id is `not null references
  -- documents(id)`, so if a drawing_version arrives before its header mirror
  -- (e.g. apply order put split 7 ahead of the split 6 backfill, or an old
  -- client supersedes a drawing whose header was created in the same legacy
  -- transaction and the drawings→documents trigger hasn't committed its row
  -- into THIS trigger's snapshot), the version upsert would hit an FK
  -- violation and the old client's supersede_drawing_version would fail. We
  -- reconstruct the header straight from the drawings row, id-preserving and
  -- idempotent (on conflict do nothing — never clobbers a real header).
  insert into documents (
    id, project_id, progress_item_id, document_type, title,
    created_by, created_at, updated_at, legacy_drawing_id
  )
  select d.id, d.project_id, d.leaf_item_id, 'drawing', d.title,
         d.created_by, d.created_at, d.updated_at, d.id
    from drawings d
   where d.id = new.drawing_id
  on conflict (id) do nothing;

  insert into document_versions (
    id, document_id, version_no, revision_label, bucket_id,
    file_path, thumb_path, mime_type, size_bytes, status,
    submitted_by, submitted_at, superseded_at, withdrawn_at, legacy_drawing_version_id
  )
  values (
    new.id, new.drawing_id, new.version_no, new.revision_label, 'project-drawings',
    new.file_path, new.thumb_path, new.mime_type, new.size_bytes, v_status,
    new.uploaded_by, new.uploaded_at, new.superseded_at, new.withdrawn_at, new.id
  )
  on conflict (id) do update
    set status        = excluded.status,
        superseded_at = excluded.superseded_at,
        withdrawn_at  = excluded.withdrawn_at,
        revision_label = excluded.revision_label;
  return null;  -- AFTER trigger
end;
$$;

create trigger trg_sync_drawing_version_to_document_version
  after insert or update on drawing_versions
  for each row execute function sync_drawing_version_to_document_version();

-- NOTE: file_path / mime_type / size_bytes are intentionally NOT updated
-- on conflict — a legacy version row never mutates those after insert
-- (blobs are immortal), and pinning them on UPDATE avoids accidentally
-- rewriting a migrated row's pointer. Only the workflow/status columns
-- propagate, matching the §4.3 "propagate current/superseded/withdrawn".

-- =============================================================
-- End of v40-split/7-sync-triggers.sql
-- =============================================================
