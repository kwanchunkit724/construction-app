-- =============================================================
-- Construction App v2 — Phase 3.5: Floor mode + Assignment + History
-- Run this in Supabase Dashboard → SQL Editor
-- Idempotent: safe to re-run.
-- =============================================================

-- ── Add columns to progress_items (idempotent) ───────────────
alter table progress_items
  add column if not exists tracking_mode text not null default 'percentage'
    check (tracking_mode in ('percentage', 'floors')),
  add column if not exists floor_labels jsonb not null default '[]'::jsonb,
  add column if not exists floors_completed jsonb not null default '[]'::jsonb,
  add column if not exists assigned_to uuid[] not null default '{}'::uuid[],
  add column if not exists delegated_to uuid[] not null default '{}'::uuid[];

-- ── progress_history ─────────────────────────────────────────
drop table if exists progress_history cascade;

create table progress_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references progress_items(id) on delete cascade,
  actual_progress int not null,
  floors_completed jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_by uuid references user_profiles(id),
  created_at timestamptz default now()
);

create index idx_progress_history_item on progress_history(item_id);

alter table progress_history enable row level security;

create policy "Members view progress history"
  on progress_history for select to authenticated
  using (exists (
    select 1 from progress_items pi
    where pi.id = item_id and can_view_project(auth.uid(), pi.project_id)
  ));

create policy "Editors insert progress history"
  on progress_history for insert to authenticated
  with check (exists (
    select 1 from progress_items pi
    where pi.id = item_id and can_edit_project_progress(auth.uid(), pi.project_id)
  ));

alter publication supabase_realtime add table progress_history;
