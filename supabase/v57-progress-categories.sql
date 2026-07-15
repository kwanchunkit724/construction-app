-- =============================================================
-- v57-progress-categories.sql   (Progress-table 2-axis categorization)
-- =============================================================
-- Splits the single flat progress tree into category-scoped views, per the
-- HKSMM5 trade structure. Two nullable tags on each 大項 (top-level item):
--   category_domain  — 大樓 (building/superstructure) vs 外圍 (external/site works)
--   category_stream  — 土建 (civil/building works) vs 屋宇裝備 BS (E&M services)
-- Additive + backwards-compatible: existing rows stay NULL and render under
-- 「未分類」 until a manager tags them. No RLS change — the category is set through
-- the normal manager-gated progress_items UPDATE (CreateItem/EditItem modals).
-- The tags live on the TOP-LEVEL item (parent_id IS NULL); children inherit the
-- view by walking up to their root (done client-side).
-- =============================================================

alter table progress_items
  add column if not exists category_domain text
    check (category_domain in ('building', 'external')),
  add column if not exists category_stream text
    check (category_stream in ('civil', 'bs'));

-- speed the per-(domain,stream) filtered tree fetch
create index if not exists idx_progress_items_category
  on progress_items (project_id, category_domain, category_stream);

-- =============================================================
-- Post-apply verification (execute, not source):
--   select column_name from information_schema.columns
--     where table_name='progress_items' and column_name in ('category_domain','category_stream');  -> 2 rows
--   -- a manager UPDATE setting category_domain='building' succeeds; a bad value
--   -- (category_domain='foo') is rejected by the check constraint.
-- =============================================================
