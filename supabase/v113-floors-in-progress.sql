-- v113: 進行中 half-state for guided 進度表 floor cells
-- Additive only — safe for live users. Applied 2026-07-17 via
-- `supabase db query --linked` and verified by execution.
alter table progress_items
  add column if not exists floors_in_progress jsonb not null default '[]'::jsonb;
