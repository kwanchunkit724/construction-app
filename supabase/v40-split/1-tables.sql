-- =============================================================
-- v40-split/1-tables.sql — documents register tables (§1.1–1.3)
-- =============================================================
-- documents, document_versions, document_events, document_counters.
-- New tables only — drawings / drawing_versions are untouched.
-- All actor columns reference user_profiles(id) ON DELETE SET NULL so
-- account deletion is never blocked (Apple compliance; v20 note).
-- Deferred current_version_id FK follows the v8-drawings.sql pattern.
-- Leaf-only trigger reuses the assert_progress_item_is_leaf shape from
-- v8-drawings.sql:66-80 but is NULL-tolerant (project-level docs).
-- =============================================================

-- ── 0. Idempotent re-run guard (NB1 — destructive-drop removed) ─
-- The original draft did `drop table ... cascade` here "because these new
-- tables never carried live data before v40". That is ONLY true on the
-- very first apply. Once this is live, `documents` holds real native rows
-- (legacy_drawing_id IS NULL) plus their versions/events — a re-run of the
-- drop+recreate would silently destroy live evidence. So:
--   * tables are created with `create table if not exists` below (first-run
--     creation still works);
--   * here we REFUSE to drop+recreate if any NATIVE document already exists,
--     raising instead of nuking data. Pure-backfill data (every row has
--     legacy_drawing_id set) is reconstructible from drawings via split 6,
--     so we still don't drop tables for it either — we just no-op.
-- The function/trigger are `create or replace`-able further down, so they
-- need no drop here.
do $$
begin
  if to_regclass('public.documents') is not null then
    if exists (select 1 from documents where legacy_drawing_id is null) then
      raise exception
        'refusing to re-run v40-split/1-tables.sql: documents already contains native rows (legacy_drawing_id is null). Drop+recreate would destroy live data. Inspect/migrate manually.';
    end if;
    -- Tables exist but hold only backfill mirrors (or are empty): the
    -- `create table if not exists` statements below are no-ops; nothing to do.
  end if;
end $$;

-- ── 1. documents — the register header (§1.1) ─────────────────
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  progress_item_id uuid references progress_items(id) on delete set null, -- NULL = project-level doc
  document_type text not null check (document_type in
    ('material_submission','method_statement','drawing','inspection','other')),
  title text not null,
  doc_number text,                       -- 'MAT-001' / 'MS-003' / 'DWG-012' — per-project sequence
  current_version_id uuid,               -- FK added after document_versions exists (v8 pattern)
  created_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  legacy_drawing_id uuid                  -- set on rows mirrored/backfilled from drawings
);

-- ── 2. document_versions — revisions + workflow/audit (§1.2) ──
create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no int not null,
  revision_label text,                   -- ≤16 chars, 'Rev A'; defaults to v{n} in app
  bucket_id text not null default 'project-docs'
    check (bucket_id in ('project-docs','project-drawings')),
  file_path text not null,               -- {project_id}/{document_id}/v{n}/{filename}
  thumb_path text,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null,
  status text not null default 'submitted' check (status in
    ('draft','submitted','approved','rejected','superseded','withdrawn')),
  submitted_by uuid references user_profiles(id) on delete set null,
  submitted_at timestamptz default now(),
  reviewed_by uuid references user_profiles(id) on delete set null,   -- approver/rejecter
  reviewed_at timestamptz,
  review_note text,                      -- rejection reason / approval comment
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  legacy_drawing_version_id uuid,
  unique (document_id, version_no)
);

-- Deferred FK (v8 pattern) — documents.current_version_id added once
-- document_versions exists. ON DELETE SET NULL so a version delete
-- (never client-driven) can't dangle the header. Guarded so the now-
-- idempotent re-run (tables created `if not exists`) does not error on an
-- already-present constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_current_version_fk'
  ) then
    alter table documents add constraint documents_current_version_fk
      foreign key (current_version_id) references document_versions(id) on delete set null;
  end if;
end $$;

-- ── 3. document_events — append-only audit trail (§1.3) ───────
create table if not exists document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  event_type text not null check (event_type in
    ('created','version_uploaded','submitted','approved','rejected','superseded','withdrawn','migrated')),
  actor_id uuid references user_profiles(id) on delete set null,
  note text,
  created_at timestamptz default now()
);

-- ── 4. document_counters — per-project per-type sequence (§1.4) ─
-- Backs next_document_number with a row lock (v11-next-progress-code
-- idea). PK (project_id, document_type) so a single row is locked per
-- (project, type) — negligible contention at this scale (risk #3).
create table if not exists document_counters (
  project_id uuid not null references projects(id) on delete cascade,
  document_type text not null check (document_type in
    ('material_submission','method_statement','drawing','inspection','other')),
  next_no int not null default 1 check (next_no >= 1),
  primary key (project_id, document_type)
);

-- ── 5. Leaf-only trigger (NULL-tolerant; v8 shape) ────────────
-- documents.progress_item_id may be NULL (project-level doc). When set,
-- it must point at a LEAF progress item (no children) — same rule as
-- drawings, reusing the assert_progress_item_is_leaf shape but tolerant
-- of NULL so project-wide method statements/contracts are allowed.
create or replace function assert_document_progress_item_is_leaf()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- B4: legacy-mirrored rows (backfill split 6 / sync trigger split 7) carry
  -- the drawing's leaf_item_id verbatim and must never be re-validated here —
  -- the drawings table already enforced its own leaf rule, and re-checking
  -- would (a) abort the single-tx backfill if any historical drawing now sits
  -- on a since-parented item, and (b) break live v1.3 drawing writes flowing
  -- through the sync trigger. So bypass entirely when this is a legacy row.
  if new.legacy_drawing_id is not null then
    return new;
  end if;

  -- Only enforce the leaf rule when a NON-legacy row actually sets or changes
  -- progress_item_id. An UPDATE that leaves progress_item_id untouched (e.g. a
  -- title/current_version_id edit) must not re-pay the leaf check.
  if tg_op = 'UPDATE' and new.progress_item_id is not distinct from old.progress_item_id then
    return new;
  end if;

  if new.progress_item_id is not null
     and exists (select 1 from progress_items where parent_id = new.progress_item_id) then
    raise exception 'documents can only attach to leaf progress items';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_leaf_only on documents;
create trigger documents_leaf_only
  before insert or update on documents
  for each row execute function assert_document_progress_item_is_leaf();

-- ── 6. Indexes (§1.5) ─────────────────────────────────────────
create index if not exists idx_documents_project on documents(project_id);
create index if not exists idx_documents_progress_item on documents(progress_item_id);
create index if not exists idx_documents_project_type on documents(project_id, document_type);
create index if not exists idx_document_versions_document on document_versions(document_id);
create index if not exists idx_document_versions_status on document_versions(status);
-- supporting index for event-timeline fetch in the detail view
create index if not exists idx_document_events_document on document_events(document_id);

-- =============================================================
-- End of v40-split/1-tables.sql
-- =============================================================
