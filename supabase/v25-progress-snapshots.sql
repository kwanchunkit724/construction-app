-- =============================================================
-- v25-progress-snapshots.sql — period-over-period 本期 Δ baseline
-- =============================================================
-- Stores a point-in-time copy of every leaf item's actual_progress
-- keyed by a report `period`, so a progress report can show
-- "本期 +X%" (this period's movement) instead of only a snapshot.
--
-- Backwards compatible: NEW table only, no change to progress_items
-- or user_profiles. RLS mirrors progress_items (view = members,
-- write = progress editors) via the existing helper functions.
-- Run AFTER v3-progress-schema.sql (defines progress_items + helpers).
-- =============================================================

create table if not exists progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  item_id uuid not null references progress_items(id) on delete cascade,
  actual_progress int not null,
  period text not null,                       -- e.g. 2026-W23 / 6月第一週 / 2026-06-08
  captured_at timestamptz not null default now(),
  captured_by uuid references user_profiles(id)
);

-- one row per (project, item, period) — re-exporting the same period upserts.
create unique index if not exists uq_progress_snapshots_item_period
  on progress_snapshots(project_id, item_id, period);
create index if not exists idx_progress_snapshots_project_captured
  on progress_snapshots(project_id, captured_at desc);

alter table progress_snapshots enable row level security;

create policy "Members can view snapshots"
  on progress_snapshots for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Editors can insert snapshots"
  on progress_snapshots for insert to authenticated
  with check (can_edit_project_progress(auth.uid(), project_id));

create policy "Editors can update snapshots"
  on progress_snapshots for update to authenticated
  using (can_edit_project_progress(auth.uid(), project_id))
  with check (can_edit_project_progress(auth.uid(), project_id));
