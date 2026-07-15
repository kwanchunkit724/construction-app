-- =============================================================
-- seed-big-site.sql  —  [DEMO] 大型新建大樓 — 觀塘商住發展項目
-- =============================================================
-- DEEP demo seed for a 大地盤 / 新建大樓 (multi-tower 商住發展).
-- Idempotent: wrapped in one transaction; every insert is
-- ON CONFLICT (pk) DO NOTHING. Fixed UUIDs are used for every row
-- referenced later. Members resolved BY PHONE (no hardcoded user
-- UUIDs). Re-running this file is a no-op.
--
-- Fixed project UUID: d0000001-0001-0001-0001-000000000001
--
-- Module switches: NOT seeded — the module system defaults to all-on
-- (absence of a project_modules row = enabled, see v59), so the demo
-- project already has every surface live.
--
-- NOTE on generated/server-only columns deliberately NOT set by hand:
--   * materials.status         — GENERATED column (qty-driven). Never inserted.
--   * variation_orders.total_amount_cents — server-only (sync_vo_total trigger);
--     we insert the vo_version first (recompute_vo_totals fills the payload total),
--     then point current_version_id at it so the trigger copies the total.
--   * site_instructions / variation_orders / permits_to_work .current_version_id —
--     set AFTER the *_versions row exists (deferred-FK + lock-guard ordering).
-- =============================================================

begin;

-- ── 0. Project (fixed UUID) ───────────────────────────────────
insert into projects (id, name, zones, assigned_pm_ids, created_by, project_type, ai_enabled)
values (
  'd0000001-0001-0001-0001-000000000001',
  '[DEMO] 大型新建大樓 — 觀塘商住發展項目',
  '[
    {"id":"z-t1","name":"第1座 (T1)"},
    {"id":"z-t2","name":"第2座 (T2)"},
    {"id":"z-t3","name":"第3座 (T3)"},
    {"id":"z-podium","name":"平台 (Podium)"},
    {"id":"z-basement","name":"地庫 (Basement B1/B2)"},
    {"id":"z-external","name":"外圍 / 道路渠務"}
  ]'::jsonb,
  array[(select id from user_profiles where phone = '60001001')],
  (select id from user_profiles where phone = '60000099'),
  'general',
  true
)
on conflict (id) do nothing;

-- ── 1. Project members (all approved) ─────────────────────────
-- PM, main_contractor (engineer), general_foreman, subcontractor,
-- subcontractor_worker, safety_officer. approved_by = admin.
insert into project_members (id, user_id, project_id, role, status, applied_at, approved_by, approved_at)
values
  ('d0000001-0002-0001-0001-000000000001',
   (select id from user_profiles where phone = '60001001'),
   'd0000001-0001-0001-0001-000000000001', 'pm', 'approved',
   now() - interval '120 days', (select id from user_profiles where phone = '60000099'), now() - interval '119 days'),
  ('d0000001-0002-0001-0001-000000000002',
   (select id from user_profiles where phone = '60001003'),
   'd0000001-0001-0001-0001-000000000001', 'main_contractor', 'approved',
   now() - interval '118 days', (select id from user_profiles where phone = '60000099'), now() - interval '117 days'),
  ('d0000001-0002-0001-0001-000000000003',
   (select id from user_profiles where phone = '60001002'),
   'd0000001-0001-0001-0001-000000000001', 'main_contractor', 'approved',
   now() - interval '118 days', (select id from user_profiles where phone = '60000099'), now() - interval '117 days'),
  ('d0000001-0002-0001-0001-000000000004',
   (select id from user_profiles where phone = '60001005'),
   'd0000001-0001-0001-0001-000000000001', 'subcontractor', 'approved',
   now() - interval '110 days', (select id from user_profiles where phone = '60001001'), now() - interval '109 days'),
  ('d0000001-0002-0001-0001-000000000005',
   (select id from user_profiles where phone = '60001006'),
   'd0000001-0001-0001-0001-000000000001', 'subcontractor_worker', 'approved',
   now() - interval '100 days', (select id from user_profiles where phone = '60001005'), now() - interval '99 days'),
  ('d0000001-0002-0001-0001-000000000006',
   (select id from user_profiles where phone = '60000004'),
   'd0000001-0001-0001-0001-000000000001', 'safety_officer', 'approved',
   now() - interval '115 days', (select id from user_profiles where phone = '60000099'), now() - interval '114 days')
on conflict (id) do nothing;

-- =============================================================
-- 2. PROGRESS TREE  (大項 L1 → 中項 L2 → 細項 L3)
-- =============================================================
-- 8 大項 (土方/樁基/地庫/上蓋/外牆幕牆/機電/裝修/測試調試) sequenced
-- across the build. Codes A.x / A.x.y. Varied tracking_mode +
-- status + actual_progress. Top-level items carry category_domain /
-- category_stream tags (children inherit by walking up, client-side).
--
-- Fixed-UUID convention for progress rows:
--   d0000001-0003-<grp>-<lvl>-0000000000<seq>
-- =============================================================

-- ── A. 土方開挖 (Excavation) — COMPLETED ──────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, blocked_reason,
   floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'A','土方開挖工程','z-basement',1,
   date '2025-09-01', date '2025-11-15', 100, 100, 'completed',
   'percentage', null, 0, null, null,
   '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '整體開挖完成，已交付樁基隊伍',
   'building','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '210 days', now() - interval '290 days'),

  ('d0000001-0003-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0001-0001-000000000001',
   'A.1','場地清理及圍板','z-external',2,
   date '2025-09-01', date '2025-09-20', 100, 100, 'completed',
   'percentage', null, 0, null, null,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'圍板及大閘安裝完成',
   null,null,(select id from user_profiles where phone='60001002'), now() - interval '270 days', now() - interval '290 days'),

  ('d0000001-0003-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0001-0001-000000000001',
   'A.2','大型開挖 (至 B2 標高)','z-basement',2,
   date '2025-09-20', date '2025-11-10', 100, 100, 'completed',
   'quantity', 42000, 42000, 'm³', null,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'土方外運完成 42000m³',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '218 days', now() - interval '270 days'),

  ('d0000001-0003-0001-0004-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0001-0001-000000000001',
   'A.3','支撐及護土牆 (ELS)','z-basement',2,
   date '2025-09-25', date '2025-11-15', 100, 100, 'completed',
   'percentage', null, 0, null, null,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'鋼板樁及橫撐已拆',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '210 days', now() - interval '268 days')
on conflict (id) do nothing;

-- ── B. 樁基工程 (Piling / Foundation) — COMPLETED ─────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit,
   floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0002-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'B','樁基及樁帽工程','z-basement',1,
   date '2025-11-01', date '2026-01-31', 100, 100, 'completed',
   'percentage', null, 0, null,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'大口徑鑽孔樁及樁帽全部完成',
   'building','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '140 days', now() - interval '230 days'),

  ('d0000001-0003-0002-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0002-0001-000000000001',
   'B.1','大口徑鑽孔樁 (Bored Pile)','z-basement',2,
   date '2025-11-01', date '2026-01-10', 100, 100, 'completed',
   'quantity', 96, 96, '支','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'96 支樁全部完成並通過完整性測試',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '155 days', now() - interval '230 days'),

  ('d0000001-0003-0002-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0002-0001-000000000001',
   'B.2','樁帽及地基樑','z-basement',2,
   date '2026-01-05', date '2026-01-31', 100, 100, 'completed',
   'percentage', null, 0, null,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'樁帽混凝土完成',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '140 days', now() - interval '210 days')
on conflict (id) do nothing;

-- ── C. 地庫結構 (Basement structure) — COMPLETED / IN-PROGRESS ─
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0003-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'C','地庫結構工程','z-basement',1,
   date '2026-01-15', date '2026-04-30', 100, 92, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'B2/B1 結構基本完成，餘平台轉換層收尾',
   'building','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '8 days', now() - interval '200 days'),

  ('d0000001-0003-0003-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0001-000000000001',
   'C.1','B2 結構板及柱牆','z-basement',2,
   date '2026-01-15', date '2026-03-01', 100, 100, 'completed',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'B2 結構完成',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '95 days', now() - interval '200 days'),

  ('d0000001-0003-0003-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0001-000000000001',
   'C.2','B1 結構板及柱牆','z-basement',2,
   date '2026-03-01', date '2026-04-10', 100, 100, 'completed',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'B1 結構完成',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '60 days', now() - interval '190 days'),

  ('d0000001-0003-0003-0004-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0001-000000000001',
   'C.3','平台轉換層 (Transfer Plate)','z-podium',2,
   date '2026-04-05', date '2026-05-15', 95, 70, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'大量鋼筋綁紮中，泵送混凝土分段進行',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '3 days', now() - interval '120 days'),

  ('d0000001-0003-0003-0005-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0001-000000000001',
   'C.4','地庫防水及保護層','z-basement',2,
   date '2026-04-15', date '2026-05-20', 60, 40, 'delayed',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'防水落後 — 等待結構交底面乾透',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '2 days', now() - interval '100 days')
on conflict (id) do nothing;

-- ── D. 上蓋結構 (Superstructure, per-floor) — IN-PROGRESS ──────
-- D itself percentage; children use FLOOR tracking_mode (逐層).
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0004-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'D','上蓋結構工程','z-podium',1,
   date '2026-05-01', date '2026-12-20', 35, 28, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'三座同步起樓，T1 最快',
   'building','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '1 days', now() - interval '90 days')
on conflict (id) do nothing;

-- D.1 第1座 (T1) — floors, partially done
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0004-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0001-000000000001',
   'D.1','第1座 (T1) 標準層結構','z-t1',2,
   date '2026-05-01', date '2026-10-31', 50, 45, 'in-progress',
   'floors',
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F","9/F","10/F","11/F","12/F","15/F","16/F","17/F","18/F","19/F","20/F","21/F","22/F","23/F"]'::jsonb,
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F","9/F"]'::jsonb,
   '{}'::jsonb,'T1 起到 9/F，每層約 6 日一層',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '1 days', now() - interval '45 days'),

  ('d0000001-0003-0004-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0001-000000000001',
   'D.2','第2座 (T2) 標準層結構','z-t2',2,
   date '2026-05-20', date '2026-11-30', 35, 25, 'in-progress',
   'floors',
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F","9/F","10/F","11/F","12/F","15/F","16/F","17/F","18/F","19/F","20/F","21/F","22/F","23/F"]'::jsonb,
   '["1/F","2/F","3/F","5/F","6/F"]'::jsonb,
   '{}'::jsonb,'T2 起到 6/F',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '4 days', now() - interval '40 days'),

  ('d0000001-0003-0004-0004-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0001-000000000001',
   'D.3','第3座 (T3) 標準層結構','z-t3',2,
   date '2026-06-10', date '2026-12-20', 20, 10, 'in-progress',
   'floors',
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F","9/F","10/F","11/F","12/F","15/F","16/F","17/F","18/F","19/F","20/F","21/F","22/F","23/F"]'::jsonb,
   '["1/F","2/F"]'::jsonb,
   '{}'::jsonb,'T3 剛起 2/F',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '5 days', now() - interval '35 days'),

  ('d0000001-0003-0004-0005-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0001-000000000001',
   'D.4','平台層商場結構','z-podium',2,
   date '2026-05-01', date '2026-07-31', 70, 55, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'平台大跨度樑柱施工中',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '2 days', now() - interval '45 days'),

  ('d0000001-0003-0004-0006-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0001-000000000001',
   'D.5','後加鋼結構天幕','z-podium',2,
   date '2026-11-01', date '2026-12-15', 0, 0, 'blocked',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'被 SI-002 設計變更阻塞 — 等待新天幕圖則',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '6 days', now() - interval '30 days')
on conflict (id) do nothing;

-- ── E. 外牆 / 幕牆 (Facade / Curtain wall) — NOT-STARTED/IN-PROG ─
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, qty_total, qty_done, qty_unit, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0005-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'E','外牆及幕牆工程','z-external',1,
   date '2026-08-01', date '2027-03-31', 5, 3, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'樣板間已批，T1 低層起鋪',
   'external','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '7 days', now() - interval '60 days'),

  ('d0000001-0003-0005-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0001-000000000001',
   'E.1','單元式幕牆 (Unitised CW)','z-t1',2,
   date '2026-08-01', date '2027-01-31', 8, 5, 'in-progress',
   'quantity','[]'::jsonb,'[]'::jsonb,'{}'::jsonb, 1840, 92, '塊','T1 已掛 92 塊幕牆板',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '7 days', now() - interval '55 days'),

  ('d0000001-0003-0005-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0001-000000000001',
   'E.2','外牆批盪及油漆','z-external',2,
   date '2026-10-01', date '2027-03-15', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'待結構封頂後展開',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '50 days'),

  ('d0000001-0003-0005-0004-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0001-000000000001',
   'E.3','鋁窗及玻璃欄河','z-t2',2,
   date '2026-11-01', date '2027-02-28', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'已落單，等到貨',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '48 days')
on conflict (id) do nothing;

-- ── F. 機電 E&M — IN-PROGRESS / NOT-STARTED (category_stream=bs) ─
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0006-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'F','機電工程 (E&M / 屋宇裝備)','z-podium',1,
   date '2026-06-01', date '2027-04-30', 15, 12, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'各 E&M 分判進場，地庫機房先行',
   'building','bs',
   (select id from user_profiles where phone='60001003'), now() - interval '5 days', now() - interval '70 days'),

  ('d0000001-0003-0006-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0001-000000000001',
   'F.1','電力裝置及電纜槽 (Electrical)','z-basement',2,
   date '2026-06-01', date '2027-02-28', 20, 18, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'地庫主電纜槽鋪設中',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '5 days', now() - interval '68 days'),

  ('d0000001-0003-0006-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0001-000000000001',
   'F.2','給排水及消防 (P&D / Fire Services)','z-basement',2,
   date '2026-06-15', date '2027-03-15', 18, 14, 'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'消防水缸及泵房安裝中',
   null,null,(select id from user_profiles where phone='60001005'), now() - interval '6 days', now() - interval '66 days'),

  ('d0000001-0003-0006-0004-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0001-000000000001',
   'F.3','通風及空調 (HVAC)','z-podium',2,
   date '2026-09-01', date '2027-04-15', 5, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'AHU 機組生產中',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '20 days', now() - interval '60 days'),

  ('d0000001-0003-0006-0005-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0001-000000000001',
   'F.4','升降機及自動梯 (Lift / Escalator)','z-t1',2,
   date '2026-12-01', date '2027-04-30', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'升降機井道結構交付後安裝',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '20 days', now() - interval '58 days')
on conflict (id) do nothing;

-- ── G. 室內裝修 (Interior fit-out) — NOT-STARTED ──────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0007-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'G','室內裝修工程','z-t1',1,
   date '2026-11-01', date '2027-06-30', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'示範單位先行，待結構及機電到位',
   'building','civil',
   (select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '40 days'),

  ('d0000001-0003-0007-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0007-0001-000000000001',
   'G.1','住宅單位批盪 / 砌磚','z-t1',2,
   date '2026-11-01', date '2027-04-30', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '40 days'),

  ('d0000001-0003-0007-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0007-0001-000000000001',
   'G.2','公用地方雲石 / 地台','z-podium',2,
   date '2027-01-01', date '2027-06-30', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '38 days')
on conflict (id) do nothing;

-- ── H. 測試調試及交付 (T&C / Handover) — NOT-STARTED ──────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, notes,
   category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000001-0003-0008-0001-000000000001','d0000001-0001-0001-0001-000000000001', null,
   'H','測試、調試及交付','z-podium',1,
   date '2027-04-01', date '2027-08-31', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'OP / 入伙紙申請前的整體 T&C',
   'building','bs',
   (select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '35 days'),

  ('d0000001-0003-0008-0002-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0008-0001-000000000001',
   'H.1','機電系統聯合測試 (Integrated T&C)','z-basement',2,
   date '2027-04-01', date '2027-07-15', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'',
   null,null,(select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '35 days'),

  ('d0000001-0003-0008-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0008-0001-000000000001',
   'H.2','政府部門驗收 (FSD / WSD / BD)','z-podium',2,
   date '2027-07-01', date '2027-08-31', 0, 0, 'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'',
   null,null,(select id from user_profiles where phone='60001001'), now() - interval '30 days', now() - interval '33 days')
on conflict (id) do nothing;

-- ── L3 細項 (detailed sub-items under 中項) ───────────────────
-- Deepens the tree to 大項→中項→細項 across the live trades so the demo
-- shows a realistic HKSMM-style breakdown. parent_id points at the L2
-- 中項 created above. UUID group segment 0020.. (no collision with 0001-0008).
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, label_status, qty_total, qty_done, qty_unit, notes,
   last_updated_by, last_updated_at, created_at)
values
  -- C.3 轉換層 細項
  ('d0000001-0003-0020-0003-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0004-000000000001',
   'C.3.1','轉換層底模及支撐','z-podium',3, date '2026-04-05', date '2026-04-20', 100,100,'completed',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'重型支撐架已搭妥',
   (select id from user_profiles where phone='60001005'), now() - interval '20 days', now() - interval '110 days'),
  ('d0000001-0003-0020-0003-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0004-000000000001',
   'C.3.2','轉換層鋼筋綁紮','z-podium',3, date '2026-04-18', date '2026-05-08', 95,80,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'雙層密筋，綁紮 80%',
   (select id from user_profiles where phone='60001005'), now() - interval '3 days', now() - interval '95 days'),
  ('d0000001-0003-0020-0003-000000000003','d0000001-0001-0001-0001-000000000001','d0000001-0003-0003-0004-000000000001',
   'C.3.3','轉換層混凝土澆築','z-podium',3, date '2026-05-05', date '2026-05-15', 60,30,'in-progress',
   'quantity','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,850,255,'m³','分三段泵送，已澆 255m³',
   (select id from user_profiles where phone='60001005'), now() - interval '2 days', now() - interval '90 days'),

  -- D.1 第1座 細項 (per-trade within tower)
  ('d0000001-0003-0020-0011-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0002-000000000001',
   'D.1.1','T1 柱牆鋼筋及模板','z-t1',3, date '2026-05-01', date '2026-10-15', 50,46,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'隨樓層推進',
   (select id from user_profiles where phone='60001005'), now() - interval '1 days', now() - interval '45 days'),
  ('d0000001-0003-0020-0011-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0002-000000000001',
   'D.1.2','T1 樓板混凝土','z-t1',3, date '2026-05-03', date '2026-10-20', 48,44,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'每層樓板澆築',
   (select id from user_profiles where phone='60001005'), now() - interval '1 days', now() - interval '45 days'),
  ('d0000001-0003-0020-0011-000000000003','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0002-000000000001',
   'D.1.3','T1 砌磚及間牆','z-t1',3, date '2026-07-01', date '2026-11-30', 25,15,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'低層開始砌磚',
   (select id from user_profiles where phone='60001005'), now() - interval '4 days', now() - interval '30 days'),

  -- D.4 平台層商場 細項
  ('d0000001-0003-0020-0014-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0005-000000000001',
   'D.4.1','平台大跨度轉換樑','z-podium',3, date '2026-05-01', date '2026-06-30', 80,62,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'後張預應力樑施工',
   (select id from user_profiles where phone='60001005'), now() - interval '2 days', now() - interval '45 days'),
  ('d0000001-0003-0020-0014-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0004-0005-000000000001',
   'D.4.2','平台商場樓板','z-podium',3, date '2026-06-01', date '2026-07-31', 55,40,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'',
   (select id from user_profiles where phone='60001005'), now() - interval '2 days', now() - interval '44 days'),

  -- E.1 幕牆 細項 (unit_status defect-register style demo)
  ('d0000001-0003-0020-0021-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0002-000000000001',
   'E.1.1','幕牆樣板間驗收','z-t1',3, date '2026-07-15', date '2026-07-31', 100,100,'completed',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'業主 + 顧問已簽板',
   (select id from user_profiles where phone='60001003'), now() - interval '20 days', now() - interval '55 days'),
  ('d0000001-0003-0020-0021-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0002-000000000001',
   'E.1.2','T1 幕牆掛板 (低層)','z-t1',3, date '2026-08-01', date '2026-11-30', 10,5,'in-progress',
   'quantity','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,920,92,'塊','3/F 以下掛板進行中',
   (select id from user_profiles where phone='60001005'), now() - interval '7 days', now() - interval '54 days'),
  ('d0000001-0003-0020-0021-000000000003','d0000001-0001-0001-0001-000000000001','d0000001-0003-0005-0002-000000000001',
   'E.1.3','幕牆防水及打膠','z-t1',3, date '2026-08-15', date '2026-12-31', 5,2,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'隨掛板跟進打膠',
   (select id from user_profiles where phone='60001005'), now() - interval '7 days', now() - interval '50 days'),

  -- F.1 電力 細項
  ('d0000001-0003-0020-0031-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0002-000000000001',
   'F.1.1','地庫主電纜槽 (Cable tray)','z-basement',3, date '2026-06-01', date '2026-10-31', 30,25,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'B2/B1 主幹線槽',
   (select id from user_profiles where phone='60001005'), now() - interval '5 days', now() - interval '68 days'),
  ('d0000001-0003-0020-0031-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0002-000000000001',
   'F.1.2','高低壓配電房 (LV/HV Room)','z-basement',3, date '2026-08-01', date '2027-01-31', 10,5,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'等中電供電申請',
   (select id from user_profiles where phone='60001005'), now() - interval '5 days', now() - interval '60 days'),

  -- F.2 給排水及消防 細項
  ('d0000001-0003-0020-0032-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0003-000000000001',
   'F.2.1','消防水缸及泵房','z-basement',3, date '2026-06-15', date '2026-12-31', 20,15,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'泵組未到 (見物料延誤)',
   (select id from user_profiles where phone='60001005'), now() - interval '6 days', now() - interval '66 days'),
  ('d0000001-0003-0020-0032-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0006-0003-000000000001',
   'F.2.2','地庫排水及隔油池','z-basement',3, date '2026-07-01', date '2026-11-30', 15,10,'in-progress',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'',
   (select id from user_profiles where phone='60001005'), now() - interval '6 days', now() - interval '60 days'),

  -- G.1 住宅裝修 細項
  ('d0000001-0003-0020-0041-000000000001','d0000001-0001-0001-0001-000000000001','d0000001-0003-0007-0002-000000000001',
   'G.1.1','示範單位裝修','z-t1',3, date '2026-11-01', date '2026-12-31', 0,0,'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'示範單位優先',
   (select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '40 days'),
  ('d0000001-0003-0020-0041-000000000002','d0000001-0001-0001-0001-000000000001','d0000001-0003-0007-0002-000000000001',
   'G.1.2','住宅單位地台批盪','z-t1',3, date '2026-12-01', date '2027-04-30', 0,0,'not-started',
   'percentage','[]'::jsonb,'[]'::jsonb,'{}'::jsonb,null,0,null,'',
   (select id from user_profiles where phone='60001003'), now() - interval '30 days', now() - interval '40 days')
on conflict (id) do nothing;

-- ── Progress history (a few ticks on live items) ──────────────
insert into progress_history (id, item_id, actual_progress, floors_completed, qty_done, notes, updated_by, created_at)
values
  ('d0000001-0009-0001-0001-000000000001','d0000001-0003-0004-0002-000000000001', 42,
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F"]'::jsonb, null, 'T1 起到 8/F',
   (select id from user_profiles where phone='60001005'), now() - interval '8 days'),
  ('d0000001-0009-0001-0002-000000000001','d0000001-0003-0004-0002-000000000001', 45,
   '["1/F","2/F","3/F","5/F","6/F","7/F","8/F","9/F"]'::jsonb, null, 'T1 起到 9/F',
   (select id from user_profiles where phone='60001005'), now() - interval '1 days'),
  ('d0000001-0009-0001-0003-000000000001','d0000001-0003-0005-0002-000000000001', 5,
   '[]'::jsonb, 92, 'T1 幕牆掛到 92 塊',
   (select id from user_profiles where phone='60001005'), now() - interval '7 days'),
  ('d0000001-0009-0001-0004-000000000001','d0000001-0003-0003-0004-000000000001', 70,
   '[]'::jsonb, null, '轉換層鋼筋綁紮 70%',
   (select id from user_profiles where phone='60001003'), now() - interval '3 days')
on conflict (id) do nothing;

-- =============================================================
-- 3. ISSUES (+ comments) — varied open / escalated / resolved
-- =============================================================
insert into issues
  (id, project_id, reporter_id, reporter_role, title, description, photos,
   current_handler_role, status, location, resolved_by, resolved_at, created_at, updated_at)
values
  -- (a) OPEN — worker → subcontractor handler
  ('d0000001-0004-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001006'),'subcontractor_worker',
   'T2 6/F 鋼筋間距不符圖則','東面大樑底層主筋間距過大，懷疑漏綁，請即查','[]'::jsonb,
   'subcontractor','open','T2 6/F 東面', null, null, now() - interval '2 days', now() - interval '2 days'),

  -- (b) OPEN — escalated to main_contractor
  ('d0000001-0004-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001005'),'subcontractor',
   '轉換層泵車泵管堵塞','C.3 轉換層下午泵送中途堵管，已停工清理，恐影響連續澆築','[]'::jsonb,
   'main_contractor','open','平台轉換層', null, null, now() - interval '3 days', now() - interval '3 days'),

  -- (c) OPEN — escalated to PM (safety)
  ('d0000001-0004-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60000004'),'safety_officer',
   '塔吊司機證即將到期','2 號塔吊司機操作證下月到期，需即時安排續證/替更','[]'::jsonb,
   'pm','open','T2 塔吊', null, null, now() - interval '1 days', now() - interval '1 days'),

  -- (d) RESOLVED
  ('d0000001-0004-0001-0004-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001006'),'subcontractor_worker',
   'B1 機房積水','B1 消防泵房地台有積水，影響電工施工','[]'::jsonb,
   'subcontractor','resolved','B1 消防泵房',
   (select id from user_profiles where phone='60001005'), now() - interval '6 days', now() - interval '9 days', now() - interval '6 days'),

  -- (e) RESOLVED — was escalated to PM then closed
  ('d0000001-0004-0001-0005-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001002'),'main_contractor',
   '相鄰地盤投訴揚塵','東面相鄰住宅投訴開挖揚塵，需加強灑水及洗車','[]'::jsonb,
   'pm','resolved','地盤大閘',
   (select id from user_profiles where phone='60001001'), now() - interval '20 days', now() - interval '25 days', now() - interval '20 days')
on conflict (id) do nothing;

insert into issue_comments (id, issue_id, author_id, action, body, from_role, to_role, created_at)
values
  ('d0000001-0004-0002-0001-000000000001','d0000001-0004-0001-0001-000000000001',
   (select id from user_profiles where phone='60001006'),'reported','發現 T2 6/F 鋼筋間距問題',null,'subcontractor', now() - interval '2 days'),
  ('d0000001-0004-0002-0002-000000000001','d0000001-0004-0001-0001-000000000001',
   (select id from user_profiles where phone='60001005'),'commented','已通知紮鐵班長即時複查，下午回覆',null,null, now() - interval '2 days' + interval '3 hours'),

  ('d0000001-0004-0002-0003-000000000001','d0000001-0004-0001-0002-000000000001',
   (select id from user_profiles where phone='60001005'),'reported','泵管堵塞停工',null,'subcontractor', now() - interval '3 days'),
  ('d0000001-0004-0002-0004-000000000001','d0000001-0004-0001-0002-000000000001',
   (select id from user_profiles where phone='60001005'),'escalated','清管後仍未順，升級總承建商安排候備泵車','subcontractor','main_contractor', now() - interval '3 days' + interval '1 hours'),

  ('d0000001-0004-0002-0005-000000000001','d0000001-0004-0001-0004-000000000001',
   (select id from user_profiles where phone='60001006'),'reported','機房積水',null,'subcontractor', now() - interval '9 days'),
  ('d0000001-0004-0002-0006-000000000001','d0000001-0004-0001-0004-000000000001',
   (select id from user_profiles where phone='60001005'),'resolved','已加裝臨時抽水泵並引去集水井，乾爽可施工',null,null, now() - interval '6 days'),

  ('d0000001-0004-0002-0007-000000000001','d0000001-0004-0001-0005-000000000001',
   (select id from user_profiles where phone='60001001'),'resolved','已增設兩部灑水車及自動洗車槽，相鄰投訴已撤回',null,null, now() - interval '20 days')
on conflict (id) do nothing;

-- =============================================================
-- 4. APPROVAL CHAIN config (si / vo / ptw) — required by submit_* RPCs
-- =============================================================
-- subcontractor → main_contractor → pm  for si/vo;
-- ptw adds safety_officer before pm.
-- The projects AFTER-INSERT trigger (trg_seed_default_chain) already seeds a
-- default chain on project insert; delete it first so this explicit chain wins
-- (delete-then-insert — avoids the unique (project_id,doc_type,step_order) clash).
delete from approval_chain_steps where project_id = 'd0000001-0001-0001-0001-000000000001';
insert into approval_chain_steps (id, project_id, doc_type, step_order, required_role, optional_user_id)
values
  ('d0000001-0005-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001','si',0,'main_contractor',null),
  ('d0000001-0005-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001','si',1,'pm',null),
  ('d0000001-0005-0002-0001-000000000001','d0000001-0001-0001-0001-000000000001','vo',0,'main_contractor',null),
  ('d0000001-0005-0002-0002-000000000001','d0000001-0001-0001-0001-000000000001','vo',1,'pm',null),
  ('d0000001-0005-0003-0001-000000000001','d0000001-0001-0001-0001-000000000001','ptw',0,'main_contractor',null),
  ('d0000001-0005-0003-0002-000000000001','d0000001-0001-0001-0001-000000000001','ptw',1,'safety_officer',null),
  ('d0000001-0005-0003-0003-000000000001','d0000001-0001-0001-0001-000000000001','ptw',2,'pm',null)
on conflict (id) do nothing;

-- =============================================================
-- 5. SITE INSTRUCTIONS (SI) — one locked, one in-review
-- =============================================================
-- SI rows: insert as draft first (created_by, status default), then the
-- version (lock_guard checks parent.locked_at — still null), then update
-- the header to point current_version_id + final status (+ locked_at).
insert into site_instructions
  (id, project_id, number, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, locked_at)
values
  ('d0000001-0006-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   'SI-001', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001003'), now() - interval '40 days', null, null),
  ('d0000001-0006-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   'SI-002', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001003'), now() - interval '12 days', null, null)
on conflict (id) do nothing;

insert into si_versions (id, si_id, version_no, payload, edits_by, created_at)
values
  ('d0000001-0006-0002-0001-000000000001','d0000001-0006-0001-0001-000000000001',1,
   '{"title":"地庫機房增設防水托盤","description":"按駐地盤工程師指示，B1 消防泵房及變電房須加設不鏽鋼防水托盤及排水溝，以防漏水波及機電設備。","drawing_version_ids":[],"photo_paths":[],"lat":22.3107,"lng":114.2255,"accuracy_m":8}'::jsonb,
   (select id from user_profiles where phone='60001003'), now() - interval '40 days'),
  ('d0000001-0006-0002-0002-000000000001','d0000001-0006-0001-0002-000000000001',1,
   '{"title":"平台天幕鋼結構設計變更","description":"業主要求將平台後加鋼結構天幕由直身改為弧形，需重出結構圖則並重新評估荷載，相關上蓋 D.5 工序暫停。","drawing_version_ids":[],"photo_paths":[],"lat":22.3107,"lng":114.2255,"accuracy_m":10}'::jsonb,
   (select id from user_profiles where phone='60001003'), now() - interval '12 days')
on conflict (id) do nothing;

-- SI-001 → locked (approved + closed chain); SI-002 → in_review.
update site_instructions
   set current_version_id = 'd0000001-0006-0002-0001-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 2,
       status = 'locked',
       submitted_at = now() - interval '39 days',
       locked_at = now() - interval '35 days'
 where id = 'd0000001-0006-0001-0001-000000000001'
   and locked_at is null;

update site_instructions
   set current_version_id = 'd0000001-0006-0002-0002-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 1,
       status = 'in_review',
       submitted_at = now() - interval '11 days'
 where id = 'd0000001-0006-0001-0002-000000000001'
   and status = 'draft';

-- =============================================================
-- 6. VARIATION ORDERS (VO) — one approved/locked, one in-review (HKD)
-- =============================================================
-- VO hangs off a LOCKED SI (SI-001). Insert VO draft (current_version_id
-- null so sync_vo_total no-ops), then vo_versions (recompute_vo_totals
-- rewrites payload total from line items), then point header at it
-- (sync_vo_total copies total_amount_cents) + final status/locked_at.
insert into variation_orders
  (id, si_id, project_id, number, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, locked_at)
values
  ('d0000001-0007-0001-0001-000000000001','d0000001-0006-0001-0001-000000000001',
   'd0000001-0001-0001-0001-000000000001','VO-001', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001003'), now() - interval '34 days', null, null),
  ('d0000001-0007-0001-0002-000000000001', null,
   'd0000001-0001-0001-0001-000000000001','VO-002', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001003'), now() - interval '9 days', null, null)
on conflict (id) do nothing;

-- vo_versions: recompute_vo_totals will set subtotal_cents + total. Amounts in HKD cents.
insert into vo_versions (id, vo_id, version_no, payload, edits_by, created_at)
values
  ('d0000001-0007-0002-0001-000000000001','d0000001-0007-0001-0001-000000000001',1,
   '{"description":"地庫機房防水托盤增設 (SI-001 衍生)","line_items":[
       {"category":"不鏽鋼工程","description":"316 不鏽鋼防水托盤連排水溝","quantity":2,"unit":"套","unit_price_cents":4850000,"progress_leaf_item_id":null},
       {"category":"防水","description":"機房地台額外聚氨酯防水","quantity":180,"unit":"m²","unit_price_cents":48000,"progress_leaf_item_id":null}
     ],"total_amount_cents":0}'::jsonb,
   (select id from user_profiles where phone='60001003'), now() - interval '34 days'),
  ('d0000001-0007-0002-0002-000000000001','d0000001-0007-0001-0002-000000000001',1,
   '{"description":"平台弧形天幕鋼結構變更 (SI-002 衍生，初步報價)","line_items":[
       {"category":"鋼結構","description":"弧形天幕鋼構件加工及安裝","quantity":38,"unit":"噸","unit_price_cents":2680000,"progress_leaf_item_id":null},
       {"category":"設計","description":"結構重新設計及荷載核算","quantity":1,"unit":"項","unit_price_cents":18500000,"progress_leaf_item_id":null}
     ],"total_amount_cents":0}'::jsonb,
   (select id from user_profiles where phone='60001003'), now() - interval '9 days')
on conflict (id) do nothing;

-- VO-001 → locked/approved; VO-002 → in_review.
update variation_orders
   set current_version_id = 'd0000001-0007-0002-0001-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 2,
       status = 'locked',
       submitted_at = now() - interval '33 days',
       locked_at = now() - interval '28 days'
 where id = 'd0000001-0007-0001-0001-000000000001'
   and locked_at is null;

update variation_orders
   set current_version_id = 'd0000001-0007-0002-0002-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 1,
       status = 'in_review',
       submitted_at = now() - interval '8 days'
 where id = 'd0000001-0007-0001-0002-000000000001'
   and status = 'draft';

-- Approvals audit ledger rows for the locked SI-001 / VO-001 chain.
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
values
  ('d0000001-0008-0001-0001-000000000001','si','d0000001-0006-0001-0001-000000000001',0,'approve',
   (select id from user_profiles where phone='60001003'), null, now() - interval '38 days'),
  ('d0000001-0008-0001-0002-000000000001','si','d0000001-0006-0001-0001-000000000001',1,'approve',
   (select id from user_profiles where phone='60001001'), null, now() - interval '35 days'),
  ('d0000001-0008-0001-0003-000000000001','vo','d0000001-0007-0001-0001-000000000001',0,'approve',
   (select id from user_profiles where phone='60001003'), null, now() - interval '31 days'),
  ('d0000001-0008-0001-0004-000000000001','vo','d0000001-0007-0001-0001-000000000001',1,'approve',
   (select id from user_profiles where phone='60001001'), null, now() - interval '28 days')
on conflict (id) do nothing;

-- =============================================================
-- 7. PERMIT TO WORK (PTW) — one active 動火證 (hot work) + version + workers
-- =============================================================
-- Insert draft, then version (lock_guard reads locked_at = null), then
-- promote to active (set chain_snapshot/current_version_id/locked_at).
insert into permits_to_work
  (id, project_id, number, ptw_type, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, activated_at, expires_at, fire_watch_started_at, locked_at)
values
  ('d0000001-000a-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   'PTW-001','hot_work', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001005'), now() - interval '1 days', null, null, null, null, null),
  ('d0000001-000a-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   'PTW-002','lifting', null, null, 0, 'draft',
   (select id from user_profiles where phone='60001005'), now() - interval '2 days', null, null, null, null, null)
on conflict (id) do nothing;

insert into permit_versions (id, ptw_id, version_no, payload, edits_by, created_at)
values
  ('d0000001-000a-0002-0001-000000000001','d0000001-000a-0001-0001-000000000001',1,
   '{"work_description":"B1 消防喉管燒焊接駁","location":"B1 消防泵房","work_at":"08:30-12:00","precautions":["滅火筒x2","防火氈","30 分鐘火警監察"],"workers_count":2}'::jsonb,
   (select id from user_profiles where phone='60001005'), now() - interval '1 days'),
  ('d0000001-000a-0002-0002-000000000001','d0000001-000a-0001-0002-000000000001',1,
   '{"work_description":"T1 9/F 預製樓梯吊運安裝","location":"T1 9/F","work_at":"09:00-11:00","precautions":["封鎖吊運範圍","指揮員在場","風速監測"],"workers_count":4}'::jsonb,
   (select id from user_profiles where phone='60001005'), now() - interval '2 days')
on conflict (id) do nothing;

insert into permit_workers (id, ptw_id, worker_name, worker_phone, worker_photo_path, created_at)
values
  ('d0000001-000a-0003-0001-000000000001','d0000001-000a-0001-0001-000000000001','陳大文','60001006',null, now() - interval '1 days'),
  ('d0000001-000a-0003-0002-000000000001','d0000001-000a-0001-0001-000000000001','李志強','60001007',null, now() - interval '1 days'),
  ('d0000001-000a-0003-0003-000000000001','d0000001-000a-0001-0002-000000000001','黃師傅','60001006',null, now() - interval '2 days')
on conflict (id) do nothing;

-- PTW-001 → active hot_work (fire-watch running, expires end of today HKT).
update permits_to_work
   set current_version_id = 'd0000001-000a-0002-0001-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"safety_officer","optional_user_id":null},{"step_order":2,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 3,
       status = 'active',
       submitted_at = now() - interval '20 hours',
       activated_at = now() - interval '5 hours',
       expires_at = (date_trunc('day', now() at time zone 'Asia/Hong_Kong') + interval '23 hours 59 minutes') at time zone 'Asia/Hong_Kong',
       fire_watch_started_at = null,
       locked_at = now() - interval '5 hours'
 where id = 'd0000001-000a-0001-0001-000000000001'
   and status = 'draft';

-- PTW-002 → in_review (waiting on safety officer step).
update permits_to_work
   set current_version_id = 'd0000001-000a-0002-0002-000000000001',
       chain_snapshot = '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"safety_officer","optional_user_id":null},{"step_order":2,"required_role":"pm","optional_user_id":null}]'::jsonb,
       current_step = 1,
       status = 'in_review',
       submitted_at = now() - interval '30 hours'
 where id = 'd0000001-000a-0001-0002-000000000001'
   and status = 'draft';

-- Approvals for PTW-001 (MC + safety officer signed; PTW activated).
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
values
  ('d0000001-0008-0002-0001-000000000001','ptw','d0000001-000a-0001-0001-000000000001',0,'approve',
   (select id from user_profiles where phone='60001003'), null, now() - interval '12 hours'),
  ('d0000001-0008-0002-0002-000000000001','ptw','d0000001-000a-0001-0001-000000000001',1,'approve',
   (select id from user_profiles where phone='60000004'), null, now() - interval '8 hours'),
  ('d0000001-0008-0002-0003-000000000001','ptw','d0000001-000a-0001-0001-000000000001',2,'approve',
   (select id from user_profiles where phone='60001001'), null, now() - interval '5 hours')
on conflict (id) do nothing;

-- =============================================================
-- 8. MATERIALS — varied state (arrived / partial / requested / overdue)
-- =============================================================
-- status is GENERATED (qty-driven) — NOT inserted. "overdue" is derived
-- client-side from a past planned_arrival_at with qty_arrived < needed.
insert into materials
  (id, project_id, name, unit, qty_needed, qty_arrived, item_ids, requested_by,
   planned_arrival_at, arrived_at, notes, created_at, updated_at)
values
  -- arrived
  ('d0000001-000b-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   'T40 螺紋鋼筋','噸',120,120, array['d0000001-0003-0004-0002-000000000001']::uuid[],
   (select id from user_profiles where phone='60001005'),
   now() - interval '10 days', now() - interval '10 days', 'T1 標準層用，全數到齊', now() - interval '14 days', now() - interval '10 days'),
  -- partial
  ('d0000001-000b-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   'C45 預拌混凝土','m³',850,520, array['d0000001-0003-0003-0004-000000000001']::uuid[],
   (select id from user_profiles where phone='60001005'),
   now() - interval '1 days', null, '轉換層分段澆築，已到 520m³', now() - interval '5 days', now() - interval '1 days'),
  -- requested (future)
  ('d0000001-000b-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001',
   '單元式幕牆板 (T1 低層)','塊',1840,92, array['d0000001-0003-0005-0002-000000000001']::uuid[],
   (select id from user_profiles where phone='60001005'),
   now() + interval '12 days', null, '工廠分批生產，首批 92 塊已到', now() - interval '20 days', now() - interval '7 days'),
  -- overdue (planned in the past, nothing arrived)
  ('d0000001-000b-0001-0004-000000000001','d0000001-0001-0001-0001-000000000001',
   '消防泵組 (1450 L/min)','套',2,0, array['d0000001-0003-0006-0003-000000000001']::uuid[],
   (select id from user_profiles where phone='60001005'),
   now() - interval '4 days', null, '供應商延誤，已催 — 影響消防 T&C', now() - interval '30 days', now() - interval '4 days'),
  -- requested (future, big order)
  ('d0000001-000b-0001-0005-000000000001','d0000001-0001-0001-0001-000000000001',
   'AHU 空調機組','台',8,0, array['d0000001-0003-0006-0004-000000000001']::uuid[],
   (select id from user_profiles where phone='60001003'),
   now() + interval '45 days', null, '長交貨期設備，已預訂', now() - interval '25 days', now() - interval '25 days')
on conflict (id) do nothing;

-- =============================================================
-- 9. DAILIES (daily site logs) — 管工/工程師, last few days
-- =============================================================
-- Authors must be main_contractor with sub_role foreman/engineer
-- (60001002 general_foreman, 60001003 engineer). One log per
-- (project,user,date). weather legacy col required.
insert into dailies
  (id, project_id, user_id, date, weather, progress_item_ids, freeform_items,
   notes, manpower, plant, weather_am, weather_pm, warning_signals, created_at, updated_at)
values
  ('d0000001-000c-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001002'),
   (now() at time zone 'Asia/Hong_Kong')::date - 2, '晴',
   array['d0000001-0003-0004-0002-000000000001','d0000001-0003-0003-0004-000000000001']::uuid[],
   array['T1 9/F 模板安裝','轉換層鋼筋綁紮']::text[],
   '天氣良好，三座結構同步推進，無安全事故。',
   '[{"trade":"紮鐵","count":42},{"trade":"模板","count":28},{"trade":"混凝土","count":15}]'::jsonb,
   '[{"type":"塔吊","count":3},{"type":"混凝土泵車","count":2}]'::jsonb,
   '晴','晴', '{}'::text[], now() - interval '2 days', now() - interval '2 days'),

  ('d0000001-000c-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001003'),
   (now() at time zone 'Asia/Hong_Kong')::date - 1, '陰',
   array['d0000001-0003-0006-0002-000000000001','d0000001-0003-0006-0003-000000000001']::uuid[],
   array['地庫主電纜槽鋪設','消防泵房安裝']::text[],
   '下午有微雨，地庫機電工程繼續，幕牆 T1 掛板暫停一小時。',
   '[{"trade":"電工","count":18},{"trade":"水喉","count":12},{"trade":"棚架","count":8}]'::jsonb,
   '[{"type":"塔吊","count":3},{"type":"吊船","count":2}]'::jsonb,
   '陰','雨', '{}'::text[], now() - interval '1 days', now() - interval '1 days'),

  ('d0000001-000c-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001002'),
   (now() at time zone 'Asia/Hong_Kong')::date, '熱',
   array['d0000001-0003-0004-0003-000000000001']::uuid[],
   array['T2 7/F 起模','派發防暑物資']::text[],
   '酷熱天氣警告生效，已調整工時並增設遮蔭休息區及補水站。',
   '[{"trade":"紮鐵","count":38},{"trade":"模板","count":24}]'::jsonb,
   '[{"type":"塔吊","count":3}]'::jsonb,
   '熱','熱', '{酷熱天氣警告}'::text[], now(), now())
on conflict (id) do nothing;

-- =============================================================
-- 10. EVENTS (timetable) — meeting / inspection / milestone
-- =============================================================
insert into events
  (id, project_id, title, description, starts_at, ends_at, location, event_type, created_by, created_at, updated_at)
values
  ('d0000001-000d-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   '每週地盤協調會議','三座進度檢討 + 機電介面協調', now() + interval '2 days' + interval '9 hours', now() + interval '2 days' + interval '11 hours',
   '地盤辦公室會議室','meeting',(select id from user_profiles where phone='60001001'), now() - interval '3 days', now() - interval '3 days'),
  ('d0000001-000d-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   '勞工處塔吊例行檢查','TC 2 號塔吊年度法定檢驗', now() + interval '5 days' + interval '10 hours', now() + interval '5 days' + interval '12 hours',
   'T2 塔吊','inspection',(select id from user_profiles where phone='60000004'), now() - interval '2 days', now() - interval '2 days'),
  ('d0000001-000d-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001',
   'T1 結構封頂','T1 第一座結構到頂里程碑', now() + interval '90 days', null,
   'T1','milestone',(select id from user_profiles where phone='60001001'), now() - interval '10 days', now() - interval '10 days')
on conflict (id) do nothing;

-- =============================================================
-- 11. CONTACTS — project address book (admin/PM curated)
-- =============================================================
insert into contacts (id, project_id, name, trade, phone, notes, created_by, created_at, updated_at)
values
  ('d0000001-000e-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   '強記紮鐵','紮鐵','61112222','T1/T2 標準層紮鐵判頭',(select id from user_profiles where phone='60001001'), now() - interval '60 days', now() - interval '60 days'),
  ('d0000001-000e-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   '永盛機電','機電 (E&M)','62223333','地庫機房總分判',(select id from user_profiles where phone='60001001'), now() - interval '55 days', now() - interval '55 days'),
  ('d0000001-000e-0001-0003-000000000001','d0000001-0001-0001-0001-000000000001',
   '城建混凝土','預拌混凝土','63334444','C45 混凝土供應，叫車熱線',(select id from user_profiles where phone='60001001'), now() - interval '50 days', now() - interval '50 days'),
  ('d0000001-000e-0001-0004-000000000001','d0000001-0001-0001-0001-000000000001',
   '高空幕牆工程','幕牆','64445555','單元式幕牆安裝專隊',(select id from user_profiles where phone='60001001'), now() - interval '40 days', now() - interval '40 days')
on conflict (id) do nothing;

-- =============================================================
-- 12. DOCUMENTS (+ versions) — method statement + material submission
-- =============================================================
-- documents.progress_item_id may be NULL (project-level) or a LEAF.
-- We attach to leaf items / leave NULL; current_version_id set after the
-- version row exists (deferred FK). doc counters bumped for tidiness.
insert into documents
  (id, project_id, progress_item_id, document_type, title, doc_number,
   current_version_id, created_by, created_at, updated_at, legacy_drawing_id)
values
  ('d0000001-000f-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   null,'method_statement','轉換層混凝土澆築施工方案','MS-001',
   null,(select id from user_profiles where phone='60001003'), now() - interval '20 days', now() - interval '20 days', null),
  ('d0000001-000f-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   null,'material_submission','單元式幕牆物料報批','MAT-001',
   null,(select id from user_profiles where phone='60001005'), now() - interval '15 days', now() - interval '15 days', null)
on conflict (id) do nothing;

insert into document_versions
  (id, document_id, version_no, revision_label, bucket_id, file_path, thumb_path,
   mime_type, size_bytes, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
values
  ('d0000001-000f-0002-0001-000000000001','d0000001-000f-0001-0001-000000000001',1,'Rev A','project-docs',
   'd0000001-0001-0001-0001-000000000001/d0000001-000f-0001-0001-000000000001/v1/transfer-plate-ms-revA.pdf',null,
   'application/pdf',2456789,'approved',
   (select id from user_profiles where phone='60001003'), now() - interval '20 days',
   (select id from user_profiles where phone='60001001'), now() - interval '18 days','已批，按方案分段澆築'),
  ('d0000001-000f-0002-0002-000000000001','d0000001-000f-0001-0002-000000000001',1,'Rev A','project-docs',
   'd0000001-0001-0001-0001-000000000001/d0000001-000f-0001-0002-000000000001/v1/curtain-wall-submission-revA.pdf',null,
   'application/pdf',5123456,'submitted',
   (select id from user_profiles where phone='60001005'), now() - interval '15 days', null, null, null)
on conflict (id) do nothing;

update documents set current_version_id = 'd0000001-000f-0002-0001-000000000001'
 where id = 'd0000001-000f-0001-0001-000000000001' and current_version_id is null;
update documents set current_version_id = 'd0000001-000f-0002-0002-000000000001'
 where id = 'd0000001-000f-0001-0002-000000000001' and current_version_id is null;

insert into document_events (id, document_id, version_id, event_type, actor_id, note, created_at)
values
  ('d0000001-000f-0003-0001-000000000001','d0000001-000f-0001-0001-000000000001','d0000001-000f-0002-0001-000000000001','approved',
   (select id from user_profiles where phone='60001001'),'駐地盤工程師批核', now() - interval '18 days'),
  ('d0000001-000f-0003-0002-000000000001','d0000001-000f-0001-0002-000000000001','d0000001-000f-0002-0002-000000000001','submitted',
   (select id from user_profiles where phone='60001005'),'幕牆物料樣板連測試報告', now() - interval '15 days')
on conflict (id) do nothing;

insert into document_counters (project_id, document_type, next_no)
values
  ('d0000001-0001-0001-0001-000000000001','method_statement',2),
  ('d0000001-0001-0001-0001-000000000001','material_submission',2)
on conflict (project_id, document_type) do nothing;

-- =============================================================
-- 13. EQUIPMENT REGISTER (+ form instances) — plant + statutory forms
-- =============================================================
insert into equipment_register
  (id, project_id, kind, ref_no, name_zh, brand_model, serial_no, location_zh, photo_path, status, created_by, created_at)
values
  ('d0000001-0010-0001-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   'lifting_appliance','EQ-001','2 號塔式起重機','Liebherr 200 EC-H','LBR-200-7781','T2 核心筒旁',null,'active',
   (select id from user_profiles where phone='60001003'), now() - interval '50 days'),
  ('d0000001-0010-0001-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   'scaffold','EQ-002','T1 外牆棚架','金屬棚架系統',null,'T1 外圍',null,'active',
   (select id from user_profiles where phone='60001003'), now() - interval '30 days')
on conflict (id) do nothing;

-- form_instances: equipment × template. Reference seeded templates by code.
-- LALG-F1 (吊機週檢) for the tower crane; CSSR-F5 (棚紙) for the scaffold.
insert into form_instances
  (id, project_id, equipment_id, template_id, location_zh, assigned_signer_id,
   last_signoff_id, valid_until, suspended, created_by, created_at)
values
  ('d0000001-0010-0002-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   'd0000001-0010-0001-0001-000000000001',
   (select id from form_templates where code='LALG-F1'),
   'T2 核心筒旁',(select id from user_profiles where phone='60000004'),
   null, now() + interval '3 days', false,
   (select id from user_profiles where phone='60001003'), now() - interval '50 days'),
  ('d0000001-0010-0002-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   'd0000001-0010-0001-0002-000000000001',
   (select id from form_templates where code='CSSR-F5'),
   'T1 外圍',(select id from user_profiles where phone='60000004'),
   null, now() - interval '2 days', false,
   (select id from user_profiles where phone='60001003'), now() - interval '30 days')
on conflict (id) do nothing;

-- =============================================================
-- 14. WEATHER — territory weather_events + project EOT claims
-- =============================================================
-- weather_events are territory-wide objective facts (normally written by
-- the service-role sync). Seed a couple of recent extreme-weather days.
insert into weather_events (id, hkt_date, kind, station, evidence, created_at)
values
  ('d0000001-0011-0001-0001-000000000001',
   (now() at time zone 'Asia/Hong_Kong')::date - 7, 'black_rain', null,
   '{"warning":"WRAINB","issued":"05:40","cancelled":"09:15"}'::jsonb, now() - interval '7 days'),
  ('d0000001-0011-0001-0002-000000000001',
   (now() at time zone 'Asia/Hong_Kong')::date - 7, 'rainfall_20mm', 'N05',
   '{"mm":78,"station":"觀塘"}'::jsonb, now() - interval '7 days'),
  ('d0000001-0011-0001-0003-000000000001',
   (now() at time zone 'Asia/Hong_Kong')::date - 18, 't8', null,
   '{"warning":"TC8NE","issued":"前一日 22:10","cancelled":"翌日 11:20"}'::jsonb, now() - interval '18 days')
on conflict (id) do nothing;

-- project_weather_claims: per-project EOT claim rows (manager-recorded).
insert into project_weather_claims
  (id, project_id, hkt_date, trigger, on_critical_path, ready_to_work, tidy_days, claim_days, note, recorded_by, created_at, updated_at)
values
  ('d0000001-0011-0002-0001-000000000001','d0000001-0001-0001-0001-000000000001',
   (now() at time zone 'Asia/Hong_Kong')::date - 7, '黑雨 + 雨量 78mm',
   true, true, 0.5, 1, '黑雨下午發出，全盤停工；翌日清理積水半日。轉換層澆築受影響（關鍵路徑）。',
   (select id from user_profiles where phone='60001001'), now() - interval '6 days', now() - interval '6 days'),
  ('d0000001-0011-0002-0002-000000000001','d0000001-0001-0001-0001-000000000001',
   (now() at time zone 'Asia/Hong_Kong')::date - 18, '八號風球',
   true, true, 1, 1, '八號風球懸掛逾 13 小時，全日停工並拆卸塔吊吊臂風阻，翌日復工前安全檢查。',
   (select id from user_profiles where phone='60001001'), now() - interval '17 days', now() - interval '17 days')
on conflict (id) do nothing;

commit;

-- =============================================================
-- Post-apply verification (execute, not source) — sample queries:
--   select name, project_type, ai_enabled from projects where id='d0000001-0001-0001-0001-000000000001';
--   select count(*) from project_members where project_id='d0000001-0001-0001-0001-000000000001';  -> 6
--   select count(*), count(*) filter (where parent_id is null) as top
--     from progress_items where project_id='d0000001-0001-0001-0001-000000000001';
--   select tracking_mode, count(*) from progress_items
--     where project_id='d0000001-0001-0001-0001-000000000001' group by 1;
--   select status, count(*) from issues where project_id='d0000001-0001-0001-0001-000000000001' group by 1;
--   select number, status, total_amount_cents from variation_orders
--     where project_id='d0000001-0001-0001-0001-000000000001';  -- totals filled by sync_vo_total
--   select number, status, ptw_type from permits_to_work where project_id='d0000001-0001-0001-0001-000000000001';
--   select name, status from materials where project_id='d0000001-0001-0001-0001-000000000001';
-- =============================================================
