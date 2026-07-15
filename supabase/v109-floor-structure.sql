-- =============================================================
-- v109-floor-structure.sql   (進度表 #5 — 樓層/翼結構, E6/E7 as decided)
-- =============================================================
-- Floors become first-class DISPLAY nodes in the existing progress tree —
-- NOT a parallel schema. A floor is an ordinary progress_items row tagged
-- node_kind='floor' (a 翼 grouping node would be node_kind='zone'); every
-- rollup / RLS / export path is untouched because nothing reads node_kind
-- except the UI (icon/badge + wizard/range targeting).
--
-- E6 free tree: node_kind is a LABEL, not an enforced hierarchy — sites
-- without 翼 put floors at the root of a 分區; sites with 翼 nest them.
-- E7 opt-in: node_kind is NULL on every existing row → 舊 project renders
-- exactly as today; only the 總樓層設定 wizard (or a future manual tag)
-- writes it. NO backfill migration, ever.
--
-- sort_order fixes floor ordering (B2 < B1 < G/F < 1/F … < R/F) independent
-- of code strings. projects.floor_preset remembers the wizard's inputs for
-- re-use (nullable; not load-bearing).
-- =============================================================

alter table progress_items add column if not exists node_kind text
  check (node_kind is null or node_kind in ('building','zone','floor','task'));
alter table progress_items add column if not exists sort_order integer;
alter table projects add column if not exists floor_preset jsonb;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select column_name from information_schema.columns
--     where table_name='progress_items' and column_name in ('node_kind','sort_order'); -> 2
--   select column_name from information_schema.columns
--     where table_name='projects' and column_name='floor_preset';                      -> 1
--   -- existing rows: node_kind IS NULL everywhere → app renders unchanged.
--   insert ... node_kind='corridor' -> CHECK violation (bad label rejected).
-- =============================================================
