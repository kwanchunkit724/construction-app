-- =============================================================
-- v100-issue-progress-link.sql   (item #4: link a 問題 to a 進度表 item)
-- =============================================================
-- An issue (or snag) can optionally reference the progress item it relates to,
-- so 管工 can jump from a problem straight to the affected 工序. Additive, nullable;
-- the existing issues RLS (can_view_project AND reporter_id = auth.uid()) is
-- unchanged — the client picker only offers items from the same project, and a
-- stray link is harmless metadata (ON DELETE SET NULL if the item is removed).
-- =============================================================

alter table issues
  add column if not exists progress_item_id uuid references progress_items(id) on delete set null;

create index if not exists idx_issues_progress_item
  on issues (progress_item_id) where progress_item_id is not null;

-- =============================================================
-- Verify: select count(*) from information_schema.columns
--   where table_name='issues' and column_name='progress_item_id';   -> 1
-- =============================================================
