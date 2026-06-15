-- =============================================================
-- seed-maintenance.sql  —  [DEMO] 大樓維修 — 太古城屋苑外牆及機電保養
-- =============================================================
-- A deep, realistic demo seed for a 大樓維修 (occupied-building maintenance)
-- project: 外牆檢驗 → 搭棚 → 批盪/防水修補 → 重新油漆, plus 機電保養
-- (電梯 / 水泵 / 消防 / 發電機). Zones are by 座數 (Block A/B/C) and 系統.
--
-- IDEMPOTENT: wrapped in one transaction, every insert ON CONFLICT DO NOTHING
-- against a FIXED uuid/pk. Safe to re-run. Author-only; NOT executed here.
--
-- All member user_ids are resolved BY PHONE inside the SQL (never hardcoded):
--   admin 60000099 | PM 60001001 (assigned_pm) | MC engineer 60001003
--   general_foreman 60001002 | subcontractor 60001005
--   subcontractor_worker 60001006 | safety_officer 60000004
-- password for all personas: test1234 (set elsewhere, in auth).
--
-- FIXED project UUID: d0000004-0004-0004-0004-000000000004
-- Progress-item / SI / VO / PTW / etc. UUIDs use the d0…04 family so they
-- are stable across re-runs and referenceable later in the file.
-- =============================================================

begin;

-- ── 0. Project ────────────────────────────────────────────────
-- maintenance type → unlocks unit_status (defect register) + checklist modes.
-- zones by 座數 / 系統. ai_enabled = true. created_by = admin 60000099.
insert into projects (id, name, zones, assigned_pm_ids, created_by, project_type, ai_enabled, created_at)
values (
  'd0000004-0004-0004-0004-000000000004',
  '[DEMO] 大樓維修 — 太古城屋苑外牆及機電保養',
  jsonb_build_array(
    jsonb_build_object('id','z-blka', 'name','A座 (海景閣)'),
    jsonb_build_object('id','z-blkb', 'name','B座 (山景閣)'),
    jsonb_build_object('id','z-blkc', 'name','C座 (園景閣)'),
    jsonb_build_object('id','z-podium','name','平台 / 公共地方'),
    jsonb_build_object('id','z-mep',  'name','機電系統 (電梯/水泵/消防/發電機)')
  ),
  array[(select id from user_profiles where phone = '60001001')],
  (select id from user_profiles where phone = '60000099'),
  'maintenance',
  true,
  now() - interval '40 days'
)
on conflict (id) do nothing;

-- ── 1. Project members (all approved) ─────────────────────────
-- role-appropriate rows; approved_by = admin, approved_at = now().
insert into project_members (id, user_id, project_id, role, status, applied_at, approved_by, approved_at)
values
  ('d0000004-0001-0001-0001-000000000001',
   (select id from user_profiles where phone='60001001'),
   'd0000004-0004-0004-0004-000000000004', 'pm', 'approved',
   now() - interval '40 days', (select id from user_profiles where phone='60000099'), now() - interval '40 days'),
  ('d0000004-0001-0001-0001-000000000002',
   (select id from user_profiles where phone='60001003'),
   'd0000004-0004-0004-0004-000000000004', 'main_contractor', 'approved',
   now() - interval '39 days', (select id from user_profiles where phone='60000099'), now() - interval '39 days'),
  ('d0000004-0001-0001-0001-000000000003',
   (select id from user_profiles where phone='60001002'),
   'd0000004-0004-0004-0004-000000000004', 'general_foreman', 'approved',
   now() - interval '39 days', (select id from user_profiles where phone='60000099'), now() - interval '39 days'),
  ('d0000004-0001-0001-0001-000000000004',
   (select id from user_profiles where phone='60001005'),
   'd0000004-0004-0004-0004-000000000004', 'subcontractor', 'approved',
   now() - interval '38 days', (select id from user_profiles where phone='60001001'), now() - interval '38 days'),
  ('d0000004-0001-0001-0001-000000000005',
   (select id from user_profiles where phone='60001006'),
   'd0000004-0004-0004-0004-000000000004', 'subcontractor_worker', 'approved',
   now() - interval '37 days', (select id from user_profiles where phone='60001005'), now() - interval '37 days'),
  ('d0000004-0001-0001-0001-000000000006',
   (select id from user_profiles where phone='60000004'),
   'd0000004-0004-0004-0004-000000000004', 'safety_officer', 'approved',
   now() - interval '38 days', (select id from user_profiles where phone='60000099'), now() - interval '38 days')
on conflict (id) do nothing;

-- =============================================================
-- 2. PROGRESS TREE  (大項 → 中項 → 細項)
-- =============================================================
-- Tracking modes are mixed:
--   * 外牆批盪/防水修補 細項 → unit_status (per-flat defect register; 5-state)
--   * 搭棚 / 油漆 細項        → floors (per-floor checklist)
--   * 外牆檢驗 細項           → checklist
--   * 機電保養 細項           → percentage / quantity
-- planned_progress/actual_progress on leaves; parents roll up client-side
-- so we leave parents at conservative values (the app recomputes).
-- last_updated_by = the foreman/subcon who last touched it.
--
-- Helper note: status values ∈ (not-started,in-progress,completed,delayed,blocked).

-- ── 大項 A · 外牆翻新工程 (level 1) ───────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a00-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', null,
   'A', '外牆翻新工程', null, 1,
   (now() - interval '35 days')::date, (now() + interval '60 days')::date,
   55, 42, 'in-progress', '太古城A/B/C三座外牆全面翻新；現代化棚架階段',
   'percentage', 'external', 'civil',
   (select id from user_profiles where phone='60001002'), now() - interval '2 days', now() - interval '35 days')
on conflict (id) do nothing;

-- ── 中項 A.1 · 外牆檢驗及測試 (level 2, checklist 細項) ────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a10-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a00-0000-0000-000000000001',
   'A.1', '外牆檢驗及測試', null, 2,
   (now() - interval '35 days')::date, (now() - interval '10 days')::date,
   100, 100, 'completed', '強制驗窗 + 外牆滲水/石屎剝落檢驗 (敲擊測試)',
   'percentage', (select id from user_profiles where phone='60001003'), now() - interval '11 days', now() - interval '35 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a11-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a10-0000-0000-000000000001',
   'A.1.1', 'A座外牆敲擊測試 (石屎剝落)', 'z-blka', 3,
   (now() - interval '35 days')::date, (now() - interval '28 days')::date,
   100, 100, 'completed', '逐層敲擊；3/F、12/F發現空鼓，已標記',
   'checklist',
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F"]'::jsonb,
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F"]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001005'), now() - interval '28 days', now() - interval '35 days'),
  ('d0000004-0a11-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a10-0000-0000-000000000001',
   'A.1.2', 'B/C座外牆敲擊測試', 'z-blkb', 3,
   (now() - interval '27 days')::date, (now() - interval '12 days')::date,
   100, 100, 'completed', 'B/C座完成；C座東面滲水較嚴重',
   'checklist',
   '["B-低層","B-高層","C-低層","C-高層"]'::jsonb,
   '["B-低層","B-高層","C-低層","C-高層"]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001005'), now() - interval '12 days', now() - interval '27 days')
on conflict (id) do nothing;

-- ── 中項 A.2 · 搭棚工程 (level 2, floors 細項) ────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a20-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a00-0000-0000-000000000001',
   'A.2', '搭棚工程 (竹棚 + 金屬棚)', null, 2,
   (now() - interval '20 days')::date, (now() + interval '5 days')::date,
   80, 70, 'in-progress', '三座圍封式棚架；A座完成，B座進行中',
   'percentage', (select id from user_profiles where phone='60001002'), now() - interval '1 day', now() - interval '20 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a21-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a20-0000-0000-000000000001',
   'A.2.1', 'A座圍封棚架', 'z-blka', 3,
   (now() - interval '20 days')::date, (now() - interval '8 days')::date,
   100, 100, 'completed', 'A座25層棚架全部搭妥並通過棚紙檢查',
   'floors',
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F","天台"]'::jsonb,
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F","天台"]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001006'), now() - interval '8 days', now() - interval '20 days'),
  ('d0000004-0a21-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a20-0000-0000-000000000001',
   'A.2.2', 'B座圍封棚架', 'z-blkb', 3,
   (now() - interval '10 days')::date, (now() + interval '5 days')::date,
   75, 50, 'in-progress', 'B座搭至12/F；上層待天氣許可',
   'floors',
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F","天台"]'::jsonb,
   '["1-5/F","6-10/F"]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001006'), now() - interval '1 day', now() - interval '10 days'),
  ('d0000004-0a21-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a20-0000-0000-000000000001',
   'A.2.3', 'C座圍封棚架', 'z-blkc', 3,
   (now() + interval '2 days')::date, (now() + interval '18 days')::date,
   0, 0, 'not-started', '待B座完成後調動棚工',
   'floors',
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F","天台"]'::jsonb,
   '[]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001005'), now() - interval '10 days', now() - interval '10 days')
on conflict (id) do nothing;

-- ── 中項 A.3 · 批盪 / 防水修補 (level 2, unit_status 細項) ─────
-- unit_status = MWIS-style defect register: each flat label is a 5-state cell
-- (unprocessed→fixing→fixed→to_inspect→signed_off). label_status carries the
-- per-label state map; floors_completed mirrors the signed_off labels; the
-- client materialises actual_progress = round(signed_off/total*100).
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a30-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a00-0000-0000-000000000001',
   'A.3', '批盪 / 防水修補', null, 2,
   (now() - interval '12 days')::date, (now() + interval '35 days')::date,
   40, 28, 'in-progress', '修補石屎剝落、補批盪、外牆防水',
   'percentage', (select id from user_profiles where phone='60001002'), now() - interval '1 day', now() - interval '12 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed, label_status,
   assigned_to, delegated_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a31-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a30-0000-0000-000000000001',
   'A.3.1', 'A座石屎剝落修補 (按單位)', 'z-blka', 3,
   (now() - interval '12 days')::date, (now() + interval '12 days')::date,
   50, 50, 'in-progress', '逐戶外牆剝落修補；按單位狀態追蹤',
   'unit_status',
   '["3/F-A","3/F-B","8/F-C","12/F-A","12/F-D","18/F-B","22/F-A","25/F-C"]'::jsonb,
   '["3/F-A","3/F-B","8/F-C","12/F-A"]'::jsonb,
   jsonb_build_object(
     '3/F-A','signed_off','3/F-B','signed_off','8/F-C','signed_off','12/F-A','signed_off',
     '12/F-D','to_inspect','18/F-B','fixing','22/F-A','fixing','25/F-C','unprocessed'),
   array[(select id from user_profiles where phone='60001005')],
   array[(select id from user_profiles where phone='60001006')],
   (select id from user_profiles where phone='60001006'), now() - interval '1 day', now() - interval '12 days'),
  ('d0000004-0a31-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a30-0000-0000-000000000001',
   'A.3.2', 'C座外牆防水注漿', 'z-blkc', 3,
   (now() - interval '4 days')::date, (now() + interval '20 days')::date,
   20, 0, 'delayed', 'C座東面滲水嚴重；棚架未到位，落後計劃',
   'unit_status',
   '["C-2/F-A","C-5/F-B","C-9/F-C","C-14/F-A","C-20/F-D"]'::jsonb,
   '[]'::jsonb,
   jsonb_build_object(
     'C-2/F-A','unprocessed','C-5/F-B','unprocessed','C-9/F-C','unprocessed',
     'C-14/F-A','unprocessed','C-20/F-D','unprocessed'),
   array[(select id from user_profiles where phone='60001005')],
   '{}'::uuid[],
   (select id from user_profiles where phone='60001005'), now() - interval '4 days', now() - interval '4 days')
on conflict (id) do nothing;

-- ── 中項 A.4 · 外牆重新油漆 (level 2, floors 細項) ────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a40-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a00-0000-0000-000000000001',
   'A.4', '外牆重新油漆 (外牆漆 + 防水塗層)', null, 2,
   (now() + interval '10 days')::date, (now() + interval '55 days')::date,
   0, 0, 'not-started', '待批盪修補完成後施工',
   'percentage', (select id from user_profiles where phone='60001002'), now() - interval '5 days', now() - interval '12 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0a41-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0a40-0000-0000-000000000001',
   'A.4.1', 'A座外牆油漆', 'z-blka', 3,
   (now() + interval '10 days')::date, (now() + interval '28 days')::date,
   0, 0, 'not-started', '底油 + 兩度面油',
   'floors',
   '["1-5/F","6-10/F","11-15/F","16-20/F","21-25/F"]'::jsonb, '[]'::jsonb,
   array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001005'), now() - interval '12 days', now() - interval '12 days')
on conflict (id) do nothing;

-- ── 大項 B · 機電系統保養 (level 1, percentage) ───────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b00-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', null,
   'B', '機電系統保養', 'z-mep', 1,
   (now() - interval '30 days')::date, (now() + interval '50 days')::date,
   50, 45, 'in-progress', '電梯 / 水泵 / 消防 / 發電機定期法定保養',
   'percentage', 'building', 'bs',
   (select id from user_profiles where phone='60001003'), now() - interval '2 days', now() - interval '30 days')
on conflict (id) do nothing;

-- ── 中項 B.1 · 電梯保養 ───────────────────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b10-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b00-0000-0000-000000000001',
   'B.1', '電梯系統保養', 'z-mep', 2,
   (now() - interval '30 days')::date, (now() + interval '50 days')::date,
   50, 50, 'in-progress', '6部升降機；EMSD註冊承辦商月檢',
   'percentage', (select id from user_profiles where phone='60001003'), now() - interval '2 days', now() - interval '30 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, qty_total, qty_done, qty_unit,
   assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b11-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b10-0000-0000-000000000001',
   'B.1.1', '升降機月檢 (6部)', 'z-mep', 3,
   (now() - interval '30 days')::date, (now() + interval '50 days')::date,
   50, 50, 'in-progress', '本月已檢3部，餘3部排期中',
   'quantity', 6, 3, '部',
   array[(select id from user_profiles where phone='60001003')],
   (select id from user_profiles where phone='60001003'), now() - interval '2 days', now() - interval '30 days')
on conflict (id) do nothing;

-- ── 中項 B.2 · 水泵房保養 (percentage 細項) ───────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b20-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b00-0000-0000-000000000001',
   'B.2', '供水及水泵保養', 'z-mep', 2,
   (now() - interval '25 days')::date, (now() + interval '40 days')::date,
   60, 60, 'in-progress', '食水 / 沖廁水泵 + 水缸清洗',
   'percentage', (select id from user_profiles where phone='60001003'), now() - interval '6 days', now() - interval '25 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b21-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b20-0000-0000-000000000001',
   'B.2.1', '食水缸清洗及水質測試', 'z-mep', 3,
   (now() - interval '25 days')::date, (now() - interval '18 days')::date,
   100, 100, 'completed', '三座食水缸已清洗，水質測試合格',
   'percentage', array[(select id from user_profiles where phone='60001003')],
   (select id from user_profiles where phone='60001003'), now() - interval '18 days', now() - interval '25 days'),
  ('d0000004-0b21-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b20-0000-0000-000000000001',
   'B.2.2', '消防泵測試及保養', 'z-mep', 3,
   (now() - interval '10 days')::date, (now() + interval '20 days')::date,
   40, 20, 'in-progress', '消防泵年檢；FSD表格待簽',
   'percentage', array[(select id from user_profiles where phone='60001003')],
   (select id from user_profiles where phone='60001003'), now() - interval '6 days', now() - interval '10 days')
on conflict (id) do nothing;

-- ── 中項 B.3 · 消防系統保養 (blocked 細項) ────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b30-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b00-0000-0000-000000000001',
   'B.3', '消防系統保養 (FS)', 'z-mep', 2,
   (now() - interval '15 days')::date, (now() + interval '30 days')::date,
   35, 15, 'blocked', '花灑系統 / 火警鐘 / 滅火筒年檢',
   'percentage', (select id from user_profiles where phone='60001003'), now() - interval '3 days', now() - interval '15 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, blocked_reason, assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b31-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b30-0000-0000-000000000001',
   'B.3.1', '花灑系統測試', 'z-mep', 3,
   (now() - interval '15 days')::date, (now() + interval '10 days')::date,
   60, 15, 'blocked', '須先關閉供水；待業主立案法團批准停水時段',
   'percentage', '待法團批准停水安排，未能進行加壓測試',
   array[(select id from user_profiles where phone='60001003')],
   (select id from user_profiles where phone='60001003'), now() - interval '3 days', now() - interval '15 days')
on conflict (id) do nothing;

-- ── 中項 B.4 · 後備發電機保養 (percentage 細項) ───────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b40-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b00-0000-0000-000000000001',
   'B.4', '後備發電機保養', 'z-mep', 2,
   (now() - interval '8 days')::date, (now() + interval '25 days')::date,
   30, 30, 'in-progress', '柴油發電機定期試機 + 換油',
   'percentage', (select id from user_profiles where phone='60001003'), now() - interval '8 days', now() - interval '8 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0b41-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0b40-0000-0000-000000000001',
   'B.4.1', '發電機每月試機 + 負載測試', 'z-mep', 3,
   (now() - interval '8 days')::date, (now() + interval '25 days')::date,
   30, 30, 'in-progress', '已完成空載試機，待安排負載測試',
   'percentage', array[(select id from user_profiles where phone='60001003')],
   (select id from user_profiles where phone='60001003'), now() - interval '8 days', now() - interval '8 days')
on conflict (id) do nothing;

-- ── 大項 C · 公共地方維修 (level 1, percentage) ───────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, category_domain, category_stream,
   last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0c00-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', null,
   'C', '公共地方維修', 'z-podium', 1,
   (now() - interval '18 days')::date, (now() + interval '30 days')::date,
   45, 35, 'in-progress', '大堂 / 平台 / 走廊翻新及防漏',
   'percentage', 'building', 'civil',
   (select id from user_profiles where phone='60001002'), now() - interval '2 days', now() - interval '18 days')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, assigned_to, last_updated_by, last_updated_at, created_at)
values
  ('d0000004-0c10-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0c00-0000-0000-000000000001',
   'C.1', '大堂雲石地台翻新', 'z-podium', 2,
   (now() - interval '18 days')::date, (now() - interval '3 days')::date,
   100, 100, 'completed', '三座大堂雲石打磨拋光完成',
   'percentage', array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001005'), now() - interval '3 days', now() - interval '18 days'),
  ('d0000004-0c10-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'd0000004-0c00-0000-0000-000000000001',
   'C.2', '平台花園防水重做', 'z-podium', 2,
   (now() - interval '6 days')::date, (now() + interval '30 days')::date,
   25, 10, 'in-progress', '平台滲水至停車場頂板；鑿開重做防水',
   'percentage', array[(select id from user_profiles where phone='60001005')],
   (select id from user_profiles where phone='60001002'), now() - interval '2 days', now() - interval '6 days')
on conflict (id) do nothing;

-- =============================================================
-- 3. ISSUES (報修) + comments  — varied status
-- =============================================================
-- issue_no is trigger-owned (do NOT set). current_handler_role/status per schema.
-- escalation chain: subcontractor_worker → subcontractor → main_contractor → pm.

insert into issues
  (id, project_id, reporter_id, reporter_role, title, description, photos,
   current_handler_role, status, location, resolved_by, resolved_at, created_at, updated_at)
values
  -- open, reported by worker, sitting at subcontractor
  ('d0000004-1001-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001006'), 'subcontractor_worker',
   'B座8樓棚架護網鬆脫', 'B座8/F東面棚架圍封網有一幅鬆脫，大風時拍打牆身，有安全隱患。',
   '[]'::jsonb, 'subcontractor', 'open', 'B座 8/F 東面',
   null, null, now() - interval '2 days', now() - interval '2 days'),
  -- open, escalated to main_contractor
  ('d0000004-1001-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001005'), 'subcontractor',
   'C座外牆滲水較預期嚴重', 'C座東面14/F以上多戶反映落雨滲水，現場檢查發現批盪剝落範圍比招標時大，需要追加注漿。',
   '[]'::jsonb, 'main_contractor', 'open', 'C座 14/F 以上',
   null, null, now() - interval '4 days', now() - interval '3 days'),
  -- open, at pm (raised by general_foreman)
  ('d0000004-1001-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001002'), 'general_foreman',
   '消防泵房停水安排未獲法團批准', '花灑系統加壓測試需停水4小時，已去信法團兩次未獲回覆，影響B.3進度。',
   '[]'::jsonb, 'pm', 'open', '地庫消防泵房',
   null, null, now() - interval '3 days', now() - interval '1 day'),
  -- resolved
  ('d0000004-1001-0000-0000-000000000004',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001006'), 'subcontractor_worker',
   'A座大堂雲石有裂紋', 'A座大堂近電梯口雲石地台有一條約30cm裂紋。',
   '[]'::jsonb, 'subcontractor', 'resolved', 'A座大堂',
   (select id from user_profiles where phone='60001005'), now() - interval '2 days',
   now() - interval '8 days', now() - interval '2 days')
on conflict (id) do nothing;

insert into issue_comments
  (id, issue_id, author_id, action, body, from_role, to_role, created_at)
values
  ('d0000004-1c01-0000-0000-000000000001',
   'd0000004-1001-0000-0000-000000000001',
   (select id from user_profiles where phone='60001006'), 'reported',
   '已即時用扎帶臨時固定，但建議盡快正式維修。', null, null, now() - interval '2 days'),
  ('d0000004-1c01-0000-0000-000000000002',
   'd0000004-1001-0000-0000-000000000002',
   (select id from user_profiles where phone='60001005'), 'escalated',
   '超出原合約範圍，需主承建商評估追加費用。', 'subcontractor', 'main_contractor', now() - interval '3 days'),
  ('d0000004-1c01-0000-0000-000000000003',
   'd0000004-1001-0000-0000-000000000002',
   (select id from user_profiles where phone='60001003'), 'commented',
   '已安排現場覆檢，初步估計需開SI走變更程序。', null, null, now() - interval '2 days'),
  ('d0000004-1c01-0000-0000-000000000004',
   'd0000004-1001-0000-0000-000000000004',
   (select id from user_profiles where phone='60001005'), 'resolved',
   '已用雲石膠修補並重新拋光，裂紋已處理。', null, null, now() - interval '2 days')
on conflict (id) do nothing;

-- =============================================================
-- 4. SITE INSTRUCTION (SI) + si_versions
-- =============================================================
-- One locked SI (so its child VO can be submitted) + one in-review SI.
-- chain_snapshot frozen at submit; created_by = MC engineer 60001003.
--
-- APPLY-ORDER FIX: si_current_version_fk (v9-si-schema.sql) is an IMMEDIATE
-- FK and si_lock_guard (BEFORE INSERT on si_versions) REJECTS a version whose
-- parent SI is already locked. So the header is inserted FIRST with
-- current_version_id = NULL and locked_at = NULL (status downgraded to
-- 'in_review' for the SI-001 header so it is internally consistent while
-- unlocked), THEN the si_versions rows are inserted, THEN an UPDATE wires the
-- current_version_id pointers and re-locks SI-001. Idempotent: on re-run the
-- ON CONFLICT inserts no-op and the UPDATE just re-asserts the same values.

insert into site_instructions
  (id, project_id, number, current_version_id, chain_snapshot, current_step,
   status, created_by, created_at, submitted_at, locked_at)
values
  ('d0000004-5100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'SI-001',
   null,
   jsonb_build_array(
     jsonb_build_object('step_order',0,'required_role','main_contractor','optional_user_id',null),
     jsonb_build_object('step_order',1,'required_role','pm','optional_user_id',null)
   ),
   2, 'in_review',
   (select id from user_profiles where phone='60001003'),
   now() - interval '6 days', now() - interval '6 days', null),
  ('d0000004-5100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'SI-002',
   null,
   jsonb_build_array(
     jsonb_build_object('step_order',0,'required_role','main_contractor','optional_user_id',null),
     jsonb_build_object('step_order',1,'required_role','pm','optional_user_id',null)
   ),
   0, 'in_review',
   (select id from user_profiles where phone='60001003'),
   now() - interval '2 days', now() - interval '2 days', null)
on conflict (id) do nothing;

insert into si_versions (id, si_id, version_no, payload, edits_by, created_at)
values
  ('d0000004-51b0-0000-0000-000000000001',
   'd0000004-5100-0000-0000-000000000001', 1,
   jsonb_build_object(
     'title','C座外牆額外注漿防水',
     'description','C座東面14/F以上滲水範圍較招標圖則為大，指示承建商就額外批盪剝落範圍進行環氧樹脂注漿及防水修補，按實測面積計算。',
     'drawing_version_ids', '[]'::jsonb,
     'photo_paths', '[]'::jsonb,
     'voice_path', null, 'lat', 22.2855, 'lng', 114.2169, 'accuracy_m', 8),
   (select id from user_profiles where phone='60001003'), now() - interval '6 days'),
  ('d0000004-51b0-0000-0000-000000000002',
   'd0000004-5100-0000-0000-000000000002', 1,
   jsonb_build_object(
     'title','平台花園防水層重做範圍擴大',
     'description','平台滲水已影響停車場頂板，指示將防水重做範圍由原招標的東半部擴展至整個平台花園。',
     'drawing_version_ids', '[]'::jsonb,
     'photo_paths', '[]'::jsonb,
     'voice_path', null, 'lat', 22.2856, 'lng', 114.2170, 'accuracy_m', 10),
   (select id from user_profiles where phone='60001003'), now() - interval '2 days')
on conflict (id) do nothing;

-- Wire current_version_id (FK now satisfiable) + re-lock SI-001 AFTER its
-- version exists (si_lock_guard only blocks version INSERT, not this UPDATE).
update site_instructions
   set current_version_id = 'd0000004-51b0-0000-0000-000000000001',
       status = 'locked',
       locked_at = now() - interval '3 days'
 where id = 'd0000004-5100-0000-0000-000000000001';
update site_instructions
   set current_version_id = 'd0000004-51b0-0000-0000-000000000002'
 where id = 'd0000004-5100-0000-0000-000000000002';

-- =============================================================
-- 5. VARIATION ORDER (VO) + vo_versions   (HKD)
-- =============================================================
-- VO-001 is tied to the locked SI-001 (one VO per SI). approved.
-- vo_versions: recompute_vo_totals trigger overwrites subtotal/total from
-- quantity * unit_price_cents, so the values below are internally consistent
-- (the trigger will recompute to the same numbers either way).
-- total ≈ HKD 285,000 → 28,500,000 cents.

-- APPLY-ORDER FIX: vo_current_version_fk (v9-vo-schema.sql) is an IMMEDIATE FK.
-- Insert the header with current_version_id = NULL (total_amount_cents left as
-- the authoritative figure; recompute_vo_totals on the version insert and
-- sync_vo_total on the UPDATE below both yield the same 28,500,000), then the
-- version, then UPDATE current_version_id (which fires sync_vo_total to copy the
-- server-recomputed total from the version payload). VO-001 locked_at is NULL so
-- vo_lock_guard never fires.
insert into variation_orders
  (id, si_id, project_id, number, current_version_id, total_amount_cents,
   chain_snapshot, current_step, status, created_by, created_at, submitted_at, locked_at)
values
  ('d0000004-6100-0000-0000-000000000001',
   'd0000004-5100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'VO-001',
   null,
   28500000,
   jsonb_build_array(
     jsonb_build_object('step_order',0,'required_role','main_contractor','optional_user_id',null),
     jsonb_build_object('step_order',1,'required_role','pm','optional_user_id',null)
   ),
   2, 'approved',
   (select id from user_profiles where phone='60001005'),
   now() - interval '2 days', now() - interval '2 days', null)
on conflict (id) do nothing;

insert into vo_versions (id, vo_id, version_no, payload, edits_by, created_at)
values
  ('d0000004-61b0-0000-0000-000000000001',
   'd0000004-6100-0000-0000-000000000001', 1,
   jsonb_build_object(
     'description','因應 SI-001 C座外牆額外注漿防水，按實測面積計算之追加費用 (人工 + 物料)。',
     'line_items', jsonb_build_array(
       jsonb_build_object('category','labour','description','環氧樹脂注漿人工 (棚上施工)',
         'quantity',120,'unit','㎡','unit_price_cents',95000,'subtotal_cents',11400000,
         'progress_leaf_item_id','d0000004-0a31-0000-0000-000000000002'),
       jsonb_build_object('category','material','description','環氧樹脂注漿料 + 防水塗層',
         'quantity',120,'unit','㎡','unit_price_cents',110000,'subtotal_cents',13200000,
         'progress_leaf_item_id','d0000004-0a31-0000-0000-000000000002'),
       jsonb_build_object('category','preliminaries','description','棚架調動及防護',
         'quantity',1,'unit','項','unit_price_cents',3900000,'subtotal_cents',3900000,
         'progress_leaf_item_id',null)
     ),
     'total_amount_cents', 28500000),
   (select id from user_profiles where phone='60001005'), now() - interval '2 days')
on conflict (id) do nothing;

-- Wire current_version_id now the version exists (sync_vo_total copies the
-- server-side total from the version payload into total_amount_cents).
update variation_orders
   set current_version_id = 'd0000004-61b0-0000-0000-000000000001'
 where id = 'd0000004-6100-0000-0000-000000000001';

-- =============================================================
-- 6. PERMIT TO WORK (PTW) + version + workers
-- =============================================================
-- An ACTIVE work_at_height permit for the 棚上批盪/油漆 work (occupied building,
-- height work is the daily reality). chain_snapshot includes safety_officer.
--
-- APPLY-ORDER FIX: ptw_current_version_fk (v10-ptw-schema.sql) is an IMMEDIATE
-- FK and ptw_lock_guard (BEFORE INSERT on permit_versions) REJECTS a version
-- whose parent PTW is already locked. So the header is inserted FIRST with
-- current_version_id = NULL, status = 'in_review', and locked_at/activated_at =
-- NULL, THEN the permit_versions row is inserted, THEN an UPDATE wires
-- current_version_id and restores the active+locked state. Idempotent.

insert into permits_to_work
  (id, project_id, number, ptw_type, current_version_id, chain_snapshot, current_step,
   status, created_by, created_at, submitted_at, activated_at, expires_at, locked_at)
values
  ('d0000004-7100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'PTW-001', 'work_at_height',
   null,
   jsonb_build_array(
     jsonb_build_object('step_order',0,'required_role','main_contractor','optional_user_id',null),
     jsonb_build_object('step_order',1,'required_role','safety_officer','optional_user_id',null)
   ),
   2, 'in_review',
   (select id from user_profiles where phone='60001005'),
   now() - interval '1 day', now() - interval '1 day', null,
   ((date_trunc('day', now() at time zone 'Asia/Hong_Kong') + interval '23 hours 59 minutes') at time zone 'Asia/Hong_Kong'),
   null)
on conflict (id) do nothing;

insert into permit_versions (id, ptw_id, version_no, payload, edits_by, created_at)
values
  ('d0000004-71b0-0000-0000-000000000001',
   'd0000004-7100-0000-0000-000000000001', 1,
   jsonb_build_object(
     'description','B座外牆棚上批盪及防水修補高處工作 (1/F 至 12/F)。',
     'checklist', jsonb_build_array(
       jsonb_build_object('key','harness','label_zh','已佩戴全身式安全帶並扣於獨立救生繩','required',true,'value',true),
       jsonb_build_object('key','scaffold_tag','label_zh','棚架已掛綠色合格牌 (棚紙有效)','required',true,'value',true),
       jsonb_build_object('key','toe_board','label_zh','工作台踢腳板及護欄齊備','required',true,'value',true),
       jsonb_build_object('key','weather','label_zh','天氣良好，無風球/暴雨警告','required',true,'value',true),
       jsonb_build_object('key','tool_tether','label_zh','工具已繫繩防墮','required',true,'value',true)
     ),
     'ppe_photo_paths', '[]'::jsonb,
     'scene_photo_paths', '[]'::jsonb,
     'drawing_version_ids', '[]'::jsonb,
     'lat', 22.2855, 'lng', 114.2169, 'accuracy_m', 7),
   (select id from user_profiles where phone='60001005'), now() - interval '1 day')
on conflict (id) do nothing;

-- Wire current_version_id + restore active/locked state AFTER the version
-- exists (ptw_lock_guard only blocks version INSERT, not this UPDATE).
update permits_to_work
   set current_version_id = 'd0000004-71b0-0000-0000-000000000001',
       status = 'active',
       activated_at = now() - interval '8 hours',
       locked_at = now() - interval '8 hours'
 where id = 'd0000004-7100-0000-0000-000000000001';

insert into permit_workers (id, ptw_id, worker_name, worker_phone, worker_photo_path, created_at)
values
  ('d0000004-71c0-0000-0000-000000000001',
   'd0000004-7100-0000-0000-000000000001', '陳大文', '60001006', null, now() - interval '1 day'),
  ('d0000004-71c0-0000-0000-000000000002',
   'd0000004-7100-0000-0000-000000000001', '李志強', '60001007', null, now() - interval '1 day'),
  ('d0000004-71c0-0000-0000-000000000003',
   'd0000004-7100-0000-0000-000000000001', '黃師傅 (棚工)', null, null, now() - interval '1 day')
on conflict (id) do nothing;

-- =============================================================
-- 7. MATERIALS  — varied status (status is a GENERATED column; never insert it)
-- =============================================================
-- requested_by references auth.users(id) = user_profiles.id (same uuid).
-- "late" is derived at read time (requested + past planned_arrival_at).

insert into materials
  (id, project_id, name, unit, qty_needed, qty_arrived, item_ids,
   requested_by, planned_arrival_at, arrived_at, notes, created_at, updated_at)
values
  -- arrived (qty_arrived >= qty_needed → 'arrived')
  ('d0000004-8100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', '外牆專用防水塗料 (灰色)', '桶', 40, 40,
   array['d0000004-0a31-0000-0000-000000000001'::uuid],
   (select id from user_profiles where phone='60001005'),
   now() - interval '5 days', now() - interval '5 days', '已全數到貨並入倉', now() - interval '8 days', now() - interval '5 days'),
  -- partial (0 < qty_arrived < qty_needed → 'partial')
  ('d0000004-8100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', '環氧樹脂注漿料', '支', 200, 80,
   array['d0000004-0a31-0000-0000-000000000002'::uuid],
   (select id from user_profiles where phone='60001005'),
   now() - interval '1 day', null, '首批80支到貨，餘下排期下週', now() - interval '4 days', now() - interval '1 day'),
  -- requested, future arrival ('requested')
  ('d0000004-8100-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004', '外牆面油 (米白色)', '桶', 60, 0,
   array['d0000004-0a41-0000-0000-000000000001'::uuid],
   (select id from user_profiles where phone='60001005'),
   now() + interval '7 days', null, '待A座油漆開工前到貨', now() - interval '2 days', now() - interval '2 days'),
  -- overdue / late (requested + planned_arrival_at in the past, qty_arrived=0)
  ('d0000004-8100-0000-0000-000000000004',
   'd0000004-0004-0004-0004-000000000004', '竹枝 + 篾條 (補棚)', '紮', 30, 0,
   array['d0000004-0a21-0000-0000-000000000002'::uuid],
   (select id from user_profiles where phone='60001005'),
   now() - interval '2 days', null, '供應商延誤；B座棚架等料', now() - interval '6 days', now() - interval '6 days')
on conflict (id) do nothing;

-- =============================================================
-- 8. DAILIES (site logs)  — foreman/engineer only (global_role main_contractor)
-- =============================================================
-- user_id references auth.users(id). weather check-constrained.
-- v45 manpower/plant jsonb + weather_am/pm + warning_signals.

insert into dailies
  (id, project_id, user_id, date, weather, progress_item_ids, freeform_items, notes,
   manpower, plant, weather_am, weather_pm, warning_signals, created_at, updated_at)
values
  ('d0000004-9100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001003'),
   (now() - interval '2 days')::date, '晴',
   (array['d0000004-0a21-0000-0000-000000000002'::uuid,'d0000004-0a31-0000-0000-000000000001'::uuid]),
   (array['B座搭棚至10/F','A座3-12樓批盪修補']),
   'B座棚架進度理想；A座批盪修補按計劃。食水缸清洗完成驗水合格。',
   jsonb_build_array(jsonb_build_object('trade','棚工','count',6),
                     jsonb_build_object('trade','泥水','count',8),
                     jsonb_build_object('trade','雜工','count',4)),
   jsonb_build_array(jsonb_build_object('type','吊船','count',2)),
   '晴','晴','{}'::text[], now() - interval '2 days', now() - interval '2 days'),
  ('d0000004-9100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001003'),
   (now() - interval '1 day')::date, '雨',
   array['d0000004-0a31-0000-0000-000000000001'::uuid],
   (array['下午雨停工兩小時','發電機空載試機']),
   '上午黃雨，棚上工作暫停;下午復工。發電機試機正常。',
   jsonb_build_array(jsonb_build_object('trade','泥水','count',6),
                     jsonb_build_object('trade','機電','count',3)),
   jsonb_build_array(jsonb_build_object('type','發電機','count',1)),
   '雨','陰', array['黃雨']::text[], now() - interval '1 day', now() - interval '1 day'),
  ('d0000004-9100-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004',
   (select id from user_profiles where phone='60001003'),
   (now() at time zone 'Asia/Hong_Kong')::date, '陰',
   array['d0000004-0a21-0000-0000-000000000002'::uuid],
   (array['B座棚架續搭','消防泵房等法團停水批准']),
   '今日陰天適合棚上工作。消防系統測試仍待法團批准停水。',
   jsonb_build_array(jsonb_build_object('trade','棚工','count',6),
                     jsonb_build_object('trade','泥水','count',8)),
   jsonb_build_array(jsonb_build_object('type','吊船','count',2)),
   '陰','陰','{}'::text[], now(), now())
on conflict (id) do nothing;

-- =============================================================
-- 9. WEATHER  — territory events + per-project EOT claims
-- =============================================================
-- weather_events are territory-wide (service-role written in prod; seeded here
-- for the demo). project_weather_claims tie to those dates; recorded_by = PM.

insert into weather_events (id, hkt_date, kind, station, evidence, created_at)
values
  ('d0000004-a100-0000-0000-000000000001',
   (now() - interval '1 day')::date, 'amber_rain', null,
   jsonb_build_object('code','WRAINA','issued', to_char(now() - interval '1 day' - interval '2 hours','YYYY-MM-DD"T"HH24:MI'),
                      'cancelled', to_char(now() - interval '1 day','YYYY-MM-DD"T"HH24:MI')),
   now() - interval '1 day'),
  ('d0000004-a100-0000-0000-000000000002',
   (now() - interval '9 days')::date, 'black_rain', null,
   jsonb_build_object('code','WRAINB','issued', to_char(now() - interval '9 days','YYYY-MM-DD"T"HH24:MI')),
   now() - interval '9 days'),
  ('d0000004-a100-0000-0000-000000000003',
   (now() - interval '9 days')::date, 'rainfall_20mm', 'TC',
   jsonb_build_object('mm', 78, 'station','太古'),
   now() - interval '9 days')
on conflict (hkt_date, kind, station) do nothing;

insert into project_weather_claims
  (id, project_id, hkt_date, trigger, on_critical_path, ready_to_work, tidy_days, claim_days, note,
   recorded_by, created_at, updated_at)
values
  ('d0000004-a200-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', (now() - interval '9 days')::date,
   '黑雨 + 雨量 78mm', true, true, 0.5, 1,
   '黑雨警告全日生效，棚上高處工作須停止，外牆批盪受阻；雨後須清理及檢查棚架方可復工。',
   (select id from user_profiles where phone='60001001'), now() - interval '8 days', now() - interval '8 days'),
  ('d0000004-a200-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', (now() - interval '1 day')::date,
   '黃雨', false, true, 0, 0.25,
   '上午黃雨，棚上工作暫停約兩小時，非關鍵路徑，只申請半日工時影響。',
   (select id from user_profiles where phone='60001001'), now() - interval '1 day', now() - interval '1 day')
on conflict (project_id, hkt_date) do nothing;

-- =============================================================
-- 10. EQUIPMENT register + form_instances  (法定表格 — heavy for 維修)
-- =============================================================
-- equipment_register.created_by → user_profiles(id). form_instances reference a
-- seeded template by code (v55 seeds CSSR-F5 棚紙, SWP-WEEKLY 吊船週檢 …).
-- last_signoff_id / valid_until left null/seeded (sign-offs are RPC-only; we
-- only seed the recurring REQUIREMENT rows, so the dashboard shows due forms).

insert into equipment_register
  (id, project_id, kind, ref_no, name_zh, brand_model, serial_no, location_zh, photo_path, status,
   created_by, created_at)
values
  ('d0000004-b100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', 'scaffold', 'EQ-001',
   'B座圍封式金屬棚架', '門式鋼管棚', 'SCAF-B-2026', 'B座外牆', null, 'active',
   (select id from user_profiles where phone='60001003'), now() - interval '10 days'),
  ('d0000004-b100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'swp', 'EQ-002',
   '吊船 (Gondola) 1號', 'Sky Climber SC-1500', 'GND-2026-01', 'A座天台', null, 'active',
   (select id from user_profiles where phone='60001003'), now() - interval '9 days'),
  ('d0000004-b100-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004', 'lifting_appliance', 'EQ-003',
   '物料吊運捲揚機', 'CM Lodestar 1T', 'HOIST-2026-03', 'B座地面卸料區', null, 'idle',
   (select id from user_profiles where phone='60001003'), now() - interval '7 days')
on conflict (id) do nothing;

insert into form_instances
  (id, project_id, equipment_id, template_id, location_zh, assigned_signer_id,
   last_signoff_id, valid_until, suspended, created_by, created_at)
values
  -- 棚架 Form 5 週檢 (CSSR-F5): expiring soon → drives dashboard 'expiring'
  ('d0000004-b200-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004',
   'd0000004-b100-0000-0000-000000000001',
   (select id from form_templates where code = 'CSSR-F5'),
   'B座外牆', (select id from user_profiles where phone='60000004'),
   null, now() + interval '2 days', false,
   (select id from user_profiles where phone='60001003'), now() - interval '10 days'),
  -- 吊船週檢 (SWP-WEEKLY): overdue → drives dashboard 'expired'
  ('d0000004-b200-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004',
   'd0000004-b100-0000-0000-000000000002',
   (select id from form_templates where code = 'SWP-WEEKLY'),
   'A座天台', (select id from user_profiles where phone='60000004'),
   null, now() - interval '1 day', false,
   (select id from user_profiles where phone='60001003'), now() - interval '9 days'),
  -- 吊機週檢 (LALG-F1): never signed → 'missing'
  ('d0000004-b200-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004',
   'd0000004-b100-0000-0000-000000000003',
   (select id from form_templates where code = 'LALG-F1'),
   'B座地面卸料區', (select id from user_profiles where phone='60000004'),
   null, null, false,
   (select id from user_profiles where phone='60001003'), now() - interval '7 days')
on conflict (id) do nothing;

-- =============================================================
-- 11. CONTACTS (trade directory)  — admin/pm write; created_by = PM
-- =============================================================
insert into contacts (id, project_id, name, trade, phone, notes, created_by, created_at, updated_at)
values
  ('d0000004-c100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', '陳師傅 (註冊棚廠)', '棚架', '69001234',
   'B/C座棚架；持有效棚紙', (select id from user_profiles where phone='60001001'), now() - interval '20 days', now() - interval '20 days'),
  ('d0000004-c100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', '永泰防水工程', '防水', '52887766',
   '外牆注漿 + 平台防水專隊', (select id from user_profiles where phone='60001001'), now() - interval '18 days', now() - interval '18 days'),
  ('d0000004-c100-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004', '安泰機電 (EMSD註冊)', '機電', '61234567',
   '電梯/水泵/發電機保養承辦商', (select id from user_profiles where phone='60001001'), now() - interval '16 days', now() - interval '16 days'),
  ('d0000004-c100-0000-0000-000000000004',
   'd0000004-0004-0004-0004-000000000004', '太古城業主立案法團 (管理處)', '法團', '25670000',
   '停水/停電安排審批；公共地方協調', (select id from user_profiles where phone='60001001'), now() - interval '15 days', now() - interval '15 days')
on conflict (id) do nothing;

-- =============================================================
-- 12. EVENTS (timetable)  — admin/pm/main_contractor; created_by
-- =============================================================
insert into events (id, project_id, title, description, starts_at, ends_at, location, event_type, created_by, created_at, updated_at)
values
  ('d0000004-d100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', '法團 + 顧問外牆進度會議',
   '匯報外牆翻新進度、C座追加注漿 (SI-001/VO-001) 及消防停水安排。',
   now() + interval '2 days' + interval '10 hours', now() + interval '2 days' + interval '11 hours 30 minutes',
   '太古城會所會議室', 'meeting',
   (select id from user_profiles where phone='60001001'), now() - interval '3 days', now() - interval '3 days'),
  ('d0000004-d100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', 'B座棚架完成後安全檢查',
   '勞工處承建商代表 + 安全主任聯合驗收 B座圍封棚架。',
   now() + interval '6 days' + interval '9 hours', now() + interval '6 days' + interval '11 hours',
   'B座外牆', 'inspection',
   (select id from user_profiles where phone='60001002'), now() - interval '2 days', now() - interval '2 days'),
  ('d0000004-d100-0000-0000-000000000003',
   'd0000004-0004-0004-0004-000000000004', '外牆翻新工程中期里程碑 (50%)',
   '目標完成三座搭棚 + A座批盪修補。',
   now() + interval '15 days' + interval '9 hours', null,
   '全盤', 'milestone',
   (select id from user_profiles where phone='60001001'), now() - interval '2 days', now() - interval '2 days')
on conflict (id) do nothing;

-- =============================================================
-- 13. DOCUMENTS + document_versions  (register; method statement + drawing)
-- =============================================================
-- documents.created_by / version actor cols → user_profiles(id) ON DELETE SET NULL.
-- bucket_id ∈ (project-docs, project-drawings); mime/status check-constrained.
-- A project-level method statement (approved) + a project-level drawing (submitted).
-- Both progress_item_id = NULL (project-level): the documents_leaf_only trigger
-- only rejects a NON-null progress_item_id that points at a parent item.
--
-- APPLY-ORDER FIX: documents_current_version_fk (v40-split/1-tables.sql) is an
-- IMMEDIATE FK. Insert headers with current_version_id = NULL, then the
-- document_versions rows, then UPDATE the pointers. Idempotent.

insert into documents
  (id, project_id, progress_item_id, document_type, title, doc_number,
   current_version_id, created_by, created_at, updated_at)
values
  ('d0000004-e100-0000-0000-000000000001',
   'd0000004-0004-0004-0004-000000000004', null, 'method_statement',
   '外牆批盪修補施工方法說明書', 'MS-001',
   null,
   (select id from user_profiles where phone='60001003'), now() - interval '14 days', now() - interval '10 days'),
  ('d0000004-e100-0000-0000-000000000002',
   'd0000004-0004-0004-0004-000000000004', null,
   'drawing', 'C座外牆滲水修補範圍圖', 'DWG-001',
   null,
   (select id from user_profiles where phone='60001003'), now() - interval '5 days', now() - interval '5 days')
on conflict (id) do nothing;

insert into document_versions
  (id, document_id, version_no, revision_label, bucket_id, file_path, thumb_path,
   mime_type, size_bytes, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
values
  ('d0000004-e1b0-0000-0000-000000000001',
   'd0000004-e100-0000-0000-000000000001', 1, 'Rev A', 'project-docs',
   'd0000004-0004-0004-0004-000000000004/d0000004-e100-0000-0000-000000000001/v1/method-statement-batdong.pdf',
   null, 'application/pdf', 842000, 'approved',
   (select id from user_profiles where phone='60001003'), now() - interval '14 days',
   (select id from user_profiles where phone='60001001'), now() - interval '10 days', '已批准，按此施工'),
  ('d0000004-e1b0-0000-0000-000000000002',
   'd0000004-e100-0000-0000-000000000002', 1, 'Rev A', 'project-drawings',
   'd0000004-0004-0004-0004-000000000004/d0000004-e100-0000-0000-000000000002/v1/c-block-waterproof-zone.pdf',
   null, 'application/pdf', 1560000, 'submitted',
   (select id from user_profiles where phone='60001003'), now() - interval '5 days',
   null, null, null)
on conflict (id) do nothing;

-- Wire documents.current_version_id now the versions exist (FK satisfiable).
update documents
   set current_version_id = 'd0000004-e1b0-0000-0000-000000000001'
 where id = 'd0000004-e100-0000-0000-000000000001';
update documents
   set current_version_id = 'd0000004-e1b0-0000-0000-000000000002'
 where id = 'd0000004-e100-0000-0000-000000000002';

insert into document_events (id, document_id, version_id, event_type, actor_id, note, created_at)
values
  ('d0000004-e1e0-0000-0000-000000000001',
   'd0000004-e100-0000-0000-000000000001', 'd0000004-e1b0-0000-0000-000000000001', 'created',
   (select id from user_profiles where phone='60001003'), '建立施工方法說明書', now() - interval '14 days'),
  ('d0000004-e1e0-0000-0000-000000000002',
   'd0000004-e100-0000-0000-000000000001', 'd0000004-e1b0-0000-0000-000000000001', 'approved',
   (select id from user_profiles where phone='60001001'), 'PM 批准', now() - interval '10 days'),
  ('d0000004-e1e0-0000-0000-000000000003',
   'd0000004-e100-0000-0000-000000000002', 'd0000004-e1b0-0000-0000-000000000002', 'submitted',
   (select id from user_profiles where phone='60001003'), '提交C座修補範圍圖待批', now() - interval '5 days')
on conflict (id) do nothing;

commit;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select name, project_type, ai_enabled, array_length(assigned_pm_ids,1)
--     from projects where id='d0000004-0004-0004-0004-000000000004';        -- maintenance,t,1
--   select count(*) from project_members
--     where project_id='d0000004-0004-0004-0004-000000000004' and status='approved';  -- 6
--   select level, count(*) from progress_items
--     where project_id='d0000004-0004-0004-0004-000000000004' group by level order by 1;
--   select tracking_mode, count(*) from progress_items
--     where project_id='d0000004-0004-0004-0004-000000000004' group by 1;   -- mixed modes
--   select status, count(*) from issues
--     where project_id='d0000004-0004-0004-0004-000000000004' group by 1;   -- open + resolved
--   select number, status from site_instructions
--     where project_id='d0000004-0004-0004-0004-000000000004';              -- SI-001 locked, SI-002 in_review
--   select number, status, total_amount_cents from variation_orders
--     where project_id='d0000004-0004-0004-0004-000000000004';              -- VO-001 approved 28500000
--   select number, ptw_type, status from permits_to_work
--     where project_id='d0000004-0004-0004-0004-000000000004';              -- PTW-001 work_at_height active
--   select name, status from materials
--     where project_id='d0000004-0004-0004-0004-000000000004' order by created_at;  -- arrived/partial/requested
--   select date, weather from dailies
--     where project_id='d0000004-0004-0004-0004-000000000004' order by date;        -- 3 logs
--   select get_forms_dashboard('d0000004-0004-0004-0004-000000000004');     -- counts: expiring/expired/missing
-- =============================================================
