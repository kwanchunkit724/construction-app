-- =============================================================
-- seed-drainage.sql  —  [DEMO] 渠務工程 — 沙田地下雨水及污水渠更換
-- =============================================================
-- Idempotent demo seed for a 渠務 / 地下管線 project. Linear by 路段 /
-- manhole (沙井) zones. Deep progress tree (大項→中項→細項) with varied
-- tracking_mode (percentage / quantity / floors-as-checklist), varied
-- status + actual_progress, plus a baseline across EVERY module:
-- issues (+comments), SI (+version), VO (+version), PTW (+version+workers),
-- materials, dailies, weather claims, equipment (+form instance), contacts,
-- documents (+versions), timetable events, approval-chain steps.
--
-- ALL personas resolved BY PHONE (never hardcoded UUIDs). Fixed project
-- UUID + fixed row UUIDs so the whole file is re-runnable: every insert
-- carries ON CONFLICT (pk) DO NOTHING and the project insert + member
-- inserts + chain steps are NOT-EXISTS / ON-CONFLICT guarded.
--
-- Apply via Supabase SQL Editor (or psql). Verify by EXECUTION.
-- =============================================================

begin;

-- ── 0. Project ───────────────────────────────────────────────
-- Fixed UUID. created_by = admin(60000099), assigned_pm = PM(60001001).
-- project_type = 'drainage'. ai_enabled = true. zones = the 路段/沙井 list.
insert into projects (id, name, zones, assigned_pm_ids, created_by, project_type, ai_enabled)
values (
  'd0000003-0003-0003-0003-000000000003',
  '[DEMO] 渠務工程 — 沙田地下雨水及污水渠更換',
  '["源禾路 CH0-CH120","源禾路 CH120-CH260","大涌橋路 CH0-CH180","沙井 MH1","沙井 MH2","沙井 MH3","沙井 MH4","接駁室 BOX-A"]'::jsonb,
  array[(select id from user_profiles where phone = '60001001')],
  (select id from user_profiles where phone = '60000099'),
  'drainage',
  true
)
on conflict (id) do update
  set name = excluded.name,
      zones = excluded.zones,
      assigned_pm_ids = excluded.assigned_pm_ids,
      project_type = excluded.project_type,
      ai_enabled = true;

-- ── 1. Project members (all approved) ────────────────────────
-- PM / main_contractor / general_foreman / subcontractor /
-- subcontractor_worker / safety_officer. approved_by = admin.
insert into project_members (id, user_id, project_id, role, status, approved_by, approved_at)
select v.id, up.id, 'd0000003-0003-0003-0003-000000000003', v.role, 'approved',
       (select id from user_profiles where phone = '60000099'), now()
from (values
  ('d1000003-0001-0001-0001-000000000001'::uuid, '60001001', 'pm'),
  ('d1000003-0001-0001-0001-000000000002'::uuid, '60001003', 'main_contractor'),
  ('d1000003-0001-0001-0001-000000000003'::uuid, '60001002', 'general_foreman'),
  ('d1000003-0001-0001-0001-000000000004'::uuid, '60001005', 'subcontractor'),
  ('d1000003-0001-0001-0001-000000000005'::uuid, '60001006', 'subcontractor_worker'),
  ('d1000003-0001-0001-0001-000000000006'::uuid, '60000004', 'safety_officer')
) as v(id, phone, role)
join user_profiles up on up.phone = v.phone
on conflict (user_id, project_id) do update
  set role = excluded.role, status = 'approved', approved_at = now();

-- ── 2. Approval-chain steps (idempotent; the projects AFTER-INSERT
--       trigger seeds these on first insert, but a re-run with ON
--       CONFLICT DO NOTHING skips the insert + the trigger, so guard
--       explicitly at step granularity). SI [mc→pm], VO [mc→pm→owner],
--       PTW [safety_officer→main_contractor]. ───────────────────
delete from approval_chain_steps where project_id = 'd0000003-0003-0003-0003-000000000003';
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select 'd0000003-0003-0003-0003-000000000003'::uuid, s.doc_type, s.step_order, s.required_role
from (values
  ('si', 0, 'main_contractor'),
  ('si', 1, 'pm'),
  ('vo', 0, 'main_contractor'),
  ('vo', 1, 'pm'),
  ('vo', 2, 'owner'),
  ('ptw', 0, 'safety_officer'),
  ('ptw', 1, 'main_contractor')
) as s(doc_type, step_order, required_role)
where not exists (
  select 1 from approval_chain_steps c
  where c.project_id = 'd0000003-0003-0003-0003-000000000003'::uuid
    and c.doc_type = s.doc_type and c.step_order = s.step_order
);

-- ============================================================
-- 3. PROGRESS TREE  (大項→中項→細項, parent_id chain, level 1/2/3)
-- ============================================================
-- 8 大項 (lifecycle stages) → 中項 by 路段/沙井 → 細項 細部工序.
-- VARIED tracking_mode: percentage / quantity (渠管米數) / floors
-- (used as a labelled checklist of manholes). VARIED status +
-- actual_progress: completed / in-progress / delayed / blocked /
-- not-started. planned_start/planned_end span 2026-03 → 2026-09.
-- All authored by general_foreman(60001002) as last_updated_by.
-- code scheme: A..H top-level; A.1, A.1.1 etc.

-- helper note: floors_completed / floor_labels are jsonb arrays;
-- qty_* are numeric. category on TOP-LEVEL items only.

-- ── A. 交通改道 (Temporary Traffic Arrangement) — civil/external ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('a0000003-0000-0000-0000-0000000000a0','d0000003-0003-0003-0003-000000000003',null,
 'A','交通改道 (臨時交通管理計劃 TTM)','源禾路 CH0-CH260',1,
 '2026-03-02','2026-03-20',100,100,'completed',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 'TTM 已獲運輸署批准並落實。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('a0000003-0000-0000-0000-0000000000a1','d0000003-0003-0003-0003-000000000003','a0000003-0000-0000-0000-0000000000a0',
 'A.1','放置水馬及交通標誌','源禾路 CH0-CH260',2,
 '2026-03-02','2026-03-08',100,100,'completed',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '雙程改單程，夜間封路。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('a0000003-0000-0000-0000-0000000000a2','d0000003-0003-0003-0003-000000000003','a0000003-0000-0000-0000-0000000000a0',
 'A.2','行人通道及臨時行人板','源禾路 CH0-CH260',2,
 '2026-03-08','2026-03-20',100,100,'completed',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '已完成，配合無障礙通道。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── B. 掘路 (Road Excavation / Trenching) — quantity mode (米) ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, blocked_reason, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('b0000003-0000-0000-0000-0000000000b0','d0000003-0003-0003-0003-000000000003',null,
 'B','掘路及溝槽開挖','源禾路 CH0-CH260',1,
 '2026-03-15','2026-05-10',75,62,'in-progress',
 'quantity',260,162,'米',null,'[]'::jsonb,'[]'::jsonb,
 '沿源禾路雨水渠線開挖，分段進行。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('b0000003-0000-0000-0000-0000000000b1','d0000003-0003-0003-0003-000000000003','b0000003-0000-0000-0000-0000000000b0',
 'B.1','源禾路 CH0-CH120 溝槽開挖','源禾路 CH0-CH120',2,
 '2026-03-15','2026-04-10',100,100,'completed',
 'quantity',120,120,'米',null,'[]'::jsonb,'[]'::jsonb,
 '已完成，平均深度 2.4m。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('b0000003-0000-0000-0000-0000000000b2','d0000003-0003-0003-0003-000000000003','b0000003-0000-0000-0000-0000000000b0',
 'B.2','源禾路 CH120-CH260 溝槽開挖','源禾路 CH120-CH260',2,
 '2026-04-10','2026-05-10',55,30,'delayed',
 'quantity',140,42,'米',null,'[]'::jsonb,'[]'::jsonb,
 '遇地下電纜需中電到場確認，進度落後。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('b0000003-0000-0000-0000-0000000000b3','d0000003-0003-0003-0003-000000000003','b0000003-0000-0000-0000-0000000000b2',
 'B.2.1','支撐 / 護土板安裝 (掘路安全)','源禾路 CH120-CH260',3,
 '2026-04-10','2026-05-08',60,40,'in-progress',
 'percentage',null,0,null,null,'[]'::jsonb,'[]'::jsonb,
 '深度逾 1.2m 須設支撐 (Cap 59I)。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('b0000003-0000-0000-0000-0000000000b4','d0000003-0003-0003-0003-000000000003','b0000003-0000-0000-0000-0000000000b0',
 'B.3','大涌橋路 CH0-CH180 溝槽開挖','大涌橋路 CH0-CH180',2,
 '2026-05-05','2026-06-15',0,0,'blocked',
 'quantity',180,0,'米','等待業主提供地下管線竣工圖 (utility record)','[]'::jsonb,'[]'::jsonb,
 '未取得管線圖前不可開挖。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── C. 現有渠管拆除 (Removal of Existing Pipes) — quantity (米) ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('c0000003-0000-0000-0000-0000000000c0','d0000003-0003-0003-0003-000000000003',null,
 'C','現有渠管拆除','源禾路 CH0-CH260',1,
 '2026-03-25','2026-05-15',70,48,'in-progress',
 'quantity',240,116,'米','[]'::jsonb,'[]'::jsonb,
 '拆除舊有 450mm 混凝土渠管。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('c0000003-0000-0000-0000-0000000000c1','d0000003-0003-0003-0003-000000000003','c0000003-0000-0000-0000-0000000000c0',
 'C.1','舊雨水渠管拆除 (RCP 450)','源禾路 CH0-CH120',2,
 '2026-03-25','2026-04-20',100,100,'completed',
 'quantity',120,120,'米','[]'::jsonb,'[]'::jsonb,
 '已拆除並運走廢料。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('c0000003-0000-0000-0000-0000000000c2','d0000003-0003-0003-0003-000000000003','c0000003-0000-0000-0000-0000000000c0',
 'C.2','舊污水渠管拆除','源禾路 CH120-CH260',2,
 '2026-04-20','2026-05-15',45,0,'not-started',
 'quantity',120,0,'米','[]'::jsonb,'[]'::jsonb,
 '須先完成上游臨時導流。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── D. 新渠管鋪設 (New Pipe Laying) — quantity (米), per-section ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('d0000003-0000-0000-0000-0000000000d0','d0000003-0003-0003-0003-000000000003',null,
 'D','新渠管鋪設','源禾路 CH0-CH260',1,
 '2026-04-15','2026-06-30',55,33,'in-progress',
 'quantity',440,145,'米','[]'::jsonb,'[]'::jsonb,
 '雨水渠 600mm HDPE + 污水渠 300mm uPVC。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('d0000003-0000-0000-0000-0000000000d1','d0000003-0003-0003-0003-000000000003','d0000003-0000-0000-0000-0000000000d0',
 'D.1','雨水渠管鋪設 (HDPE 600mm)','源禾路 CH0-CH260',2,
 '2026-04-15','2026-06-10',60,45,'in-progress',
 'quantity',260,117,'米','[]'::jsonb,'[]'::jsonb,
 'CH0-CH120 完成，CH120 起進行中。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('d0000003-0000-0000-0000-0000000000d2','d0000003-0003-0003-0003-000000000003','d0000003-0000-0000-0000-0000000000d1',
 'D.1.1','管床鋪設及碎石墊層','源禾路 CH0-CH120',3,
 '2026-04-15','2026-05-05',100,100,'completed',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 'Class S 墊層已驗收。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('d0000003-0000-0000-0000-0000000000d3','d0000003-0003-0003-0003-000000000003','d0000003-0000-0000-0000-0000000000d1',
 'D.1.2','渠管接駁及對接焊 (HDPE)','源禾路 CH0-CH120',3,
 '2026-05-05','2026-05-25',100,100,'completed',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '熱熔對接完成。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('d0000003-0000-0000-0000-0000000000d4','d0000003-0003-0003-0003-000000000003','d0000003-0000-0000-0000-0000000000d0',
 'D.2','污水渠管鋪設 (uPVC 300mm)','源禾路 CH0-CH260',2,
 '2026-05-15','2026-06-30',30,0,'not-started',
 'quantity',180,0,'米','[]'::jsonb,'[]'::jsonb,
 '待雨水渠完成讓位。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── E. 沙井 / 接駁 (Manholes & Connections) — floors-as-checklist ──
-- tracking_mode = 'floors' used as a labelled checklist of manholes.
-- floor_labels = all manholes; floors_completed = those done.
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, floor_labels, floors_completed, qty_total, qty_done, qty_unit,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('e0000003-0000-0000-0000-0000000000e0','d0000003-0003-0003-0003-000000000003',null,
 'E','沙井建造及渠管接駁','沙井 MH1-MH4',1,
 '2026-04-20','2026-07-10',50,50,'in-progress',
 'floors',
 '["MH1","MH2","MH3","MH4","接駁室 BOX-A"]'::jsonb,
 '["MH1","MH2"]'::jsonb,
 null,0,null,
 '預製沙井 + 現場接駁。MH1/MH2 完成。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('e0000003-0000-0000-0000-0000000000e1','d0000003-0003-0003-0003-000000000003','e0000003-0000-0000-0000-0000000000e0',
 'E.1','預製沙井安裝','沙井 MH1-MH4',2,
 '2026-04-20','2026-06-10',60,50,'in-progress',
 'floors',
 '["MH1","MH2","MH3","MH4"]'::jsonb,
 '["MH1","MH2"]'::jsonb,
 null,0,null,
 'MH3 吊裝排期下週。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('e0000003-0000-0000-0000-0000000000e2','d0000003-0003-0003-0003-000000000003','e0000003-0000-0000-0000-0000000000e0',
 'E.2','接駁室 BOX-A 現場灌注','接駁室 BOX-A',2,
 '2026-06-10','2026-07-10',0,0,'not-started',
 'percentage',
 '[]'::jsonb,'[]'::jsonb,null,0,null,
 '主接駁室，須密閉空間作業許可。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── F. 回填 (Backfill & Compaction) — quantity (m3) ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('f0000003-0000-0000-0000-0000000000f0','d0000003-0003-0003-0003-000000000003',null,
 'F','溝槽回填及夯實','源禾路 CH0-CH260',1,
 '2026-05-10','2026-07-20',40,22,'in-progress',
 'quantity',1200,260,'立方米','[]'::jsonb,'[]'::jsonb,
 '分層回填，每 300mm 夯實一次。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('f0000003-0000-0000-0000-0000000000f1','d0000003-0003-0003-0003-000000000003','f0000003-0000-0000-0000-0000000000f0',
 'F.1','管周保護回填 (粒料)','源禾路 CH0-CH120',2,
 '2026-05-10','2026-06-05',80,55,'in-progress',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '管頂 300mm 內用篩選粒料。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── G. 路面復修 (Reinstatement) — percentage ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('00000003-0000-0000-0000-000000009070','d0000003-0003-0003-0003-000000000003',null,
 'G','路面復修','源禾路 CH0-CH260',1,
 '2026-06-15','2026-08-30',10,0,'not-started',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '臨時瀝青 → 永久瀝青 (PWP T2)。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('00000003-0000-0000-0000-000000009071','d0000003-0003-0003-0003-000000000003','00000003-0000-0000-0000-000000009070',
 'G.1','臨時路面修復 (Cold-mix)','源禾路 CH0-CH120',2,
 '2026-06-15','2026-07-05',30,0,'not-started',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '配合掘路完成段。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- ── H. CCTV 檢測 (CCTV Survey & Handover) — percentage ──
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status,
   tracking_mode, qty_total, qty_done, qty_unit, floor_labels, floors_completed,
   notes, category_domain, category_stream, last_updated_by, last_updated_at)
values
('40000003-0000-0000-0000-0000000090b0','d0000003-0003-0003-0003-000000000003',null,
 'H','CCTV 檢測及交付','源禾路 CH0-CH260',1,
 '2026-08-01','2026-09-15',0,0,'not-started',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 'WRc 標準 CCTV 內窺，提交 DSD 驗收。','external','civil',
 (select id from user_profiles where phone='60001002'),now()),
('40000003-0000-0000-0000-0000000090b1','d0000003-0003-0003-0003-000000000003','40000003-0000-0000-0000-0000000090b0',
 'H.1','新雨水渠 CCTV 內窺 (CH0-CH120)','源禾路 CH0-CH120',2,
 '2026-08-01','2026-08-15',0,0,'not-started',
 'percentage',null,0,null,'[]'::jsonb,'[]'::jsonb,
 '完成段先行檢測。','external','civil',
 (select id from user_profiles where phone='60001002'),now())
on conflict (id) do nothing;

-- A couple of progress_history rows on the in-progress quantity item D.1
insert into progress_history (id, item_id, actual_progress, floors_completed, qty_done, notes, updated_by, created_at)
values
('40000003-0000-0000-0000-00000000d101','d0000003-0000-0000-0000-0000000000d1',
 30,'[]'::jsonb,78,'本期鋪設 +78m，累計 CH0-CH78。',
 (select id from user_profiles where phone='60001005'), now() - interval '9 days'),
('40000003-0000-0000-0000-00000000d102','d0000003-0000-0000-0000-0000000000d1',
 45,'[]'::jsonb,39,'本期 +39m，累計 117m。',
 (select id from user_profiles where phone='60001005'), now() - interval '2 days')
on conflict (id) do nothing;

-- ============================================================
-- 4. ISSUES (+ comments)  — varied status / escalation
-- ============================================================
-- status enum is only ('open','resolved') (v4). current_handler_role in
-- ('pm','main_contractor','subcontractor','admin'). issue_no/location are
-- additive (v47); issue_no is trigger-owned so we DON'T set it (let the
-- BEFORE INSERT trigger assign per-project). reporter_role is a snapshot.
insert into issues
  (id, project_id, reporter_id, reporter_role, title, description, location,
   current_handler_role, status, resolved_by, resolved_at, created_at, updated_at)
values
-- open, escalated to main_contractor (reported by worker→subcon→mc path)
('40000003-0001-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60001006'),'subcontractor_worker',
 '源禾路 CH150 掘出未標示電纜','開挖時掘到一條未列入管線圖嘅電纜，已即時停工並圍封，需中電到場確認。',
 '源禾路 CH150 溝槽','main_contractor','open',null,null,
 now() - interval '3 days', now() - interval '1 day'),
-- open, with PM (delayed material)
('40000003-0001-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60001003'),'main_contractor',
 'HDPE 600mm 渠管供應延誤','供應商通知 600mm HDPE 渠管交期延後一週，影響 D.1 鋪設進度。',
 '源禾路 CH120-CH260','pm','open',null,null,
 now() - interval '5 days', now() - interval '2 days'),
-- resolved (drainage / standing water)
('40000003-0001-0000-0000-000000000003','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60001005'),'subcontractor',
 'MH2 沙井底部積水','連場大雨後 MH2 底部積水，需抽水及檢查臨時擋水。',
 '沙井 MH2','subcontractor','resolved',
 (select id from user_profiles where phone='60001005'), now() - interval '6 days',
 now() - interval '8 days', now() - interval '6 days'),
-- open, safety, handler main_contractor
('40000003-0001-0000-0000-000000000004','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60000004'),'safety_officer',
 '掘路段護土板鬆動','源禾路 CH180 段護土板有鬆動跡象，深逾 2m，要求即時加固先准入坑。',
 '源禾路 CH180','main_contractor','open',null,null,
 now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

insert into issue_comments (id, issue_id, author_id, action, body, from_role, to_role, created_at)
values
('40000003-0002-0000-0000-000000000001','40000003-0001-0000-0000-000000000001',
 (select id from user_profiles where phone='60001006'),'reported','已停工圍封，附現場相片。',null,null, now() - interval '3 days'),
('40000003-0002-0000-0000-000000000002','40000003-0001-0000-0000-000000000001',
 (select id from user_profiles where phone='60001005'),'escalated','工人發現，超出判頭處理範圍，上報總承建。','subcontractor','main_contractor', now() - interval '2 days'),
('40000003-0002-0000-0000-000000000003','40000003-0001-0000-0000-000000000001',
 (select id from user_profiles where phone='60001003'),'commented','已聯絡中電 (CLP)，預約明早到場驗線。',null,null, now() - interval '1 day'),
('40000003-0002-0000-0000-000000000004','40000003-0001-0000-0000-000000000003',
 (select id from user_profiles where phone='60001005'),'reported','MH2 積水約 300mm。',null,null, now() - interval '8 days'),
('40000003-0002-0000-0000-000000000005','40000003-0001-0000-0000-000000000003',
 (select id from user_profiles where phone='60001005'),'resolved','已抽乾並加設臨時擋水沙包，回填前再檢查。',null,null, now() - interval '6 days')
on conflict (id) do nothing;

-- ============================================================
-- 5. SI (Site Instruction) + version  +  VO (Variation Order) + version
-- ============================================================
-- We author rows directly (the submit_si/submit_vo RPCs run as the
-- caller; for a static seed we set a sensible status + chain_snapshot
-- manually). number via the per-project sequence pattern naming is
-- avoided — we use explicit numbers SI-001 / VO-001 (unique per project).

-- SI-001: instruct extra rock excavation (locked, so a VO can attach).
-- LOCK ORDERING: si_lock_guard (BEFORE INSERT on si_versions) raises if the
-- parent SI is already locked. So we MUST insert the header with locked_at =
-- NULL (still status 'locked' for display is wrong — keep it un-locked until
-- the version exists), insert the version, THEN set both current_version_id and
-- locked_at + status='locked' in one post-version UPDATE. The UPDATE fires no
-- lock guard (guard is only on si_versions INSERT, which already happened).
insert into site_instructions
  (id, project_id, number, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, locked_at)
values
('40000003-0003-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 'SI-001', null,
 '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
 1,'in_review',
 (select id from user_profiles where phone='60001003'),
 now() - interval '20 days', now() - interval '19 days', null)
on conflict (id) do nothing;

insert into si_versions (id, si_id, version_no, payload, edits_by, created_at)
values
('40000003-0004-0000-0000-000000000001','40000003-0003-0000-0000-000000000001',1,
 '{"title":"源禾路 CH120-CH180 遇岩石，須改用破碎機開挖","description":"溝槽於 CH120-CH180 段遇花崗岩，原合約以一般機械開挖；現指示改用液壓破碎機並按實際岩石量計價。","drawing_version_ids":[],"photo_paths":[],"lat":22.3829,"lng":114.1882,"accuracy_m":8}'::jsonb,
 (select id from user_profiles where phone='60001003'), now() - interval '20 days')
on conflict (id) do nothing;

-- Now the version exists: point current_version_id at it AND apply the lock
-- (status='locked' + locked_at). Guarded so a re-run is a no-op.
update site_instructions
  set current_version_id = '40000003-0004-0000-0000-000000000001',
      status = 'locked',
      locked_at = now() - interval '15 days'
where id = '40000003-0003-0000-0000-000000000001'
  and current_version_id is null;

-- A protest comment after lock (audit-only)
insert into protest_comments (id, si_id, author_id, body, created_at)
values
('40000003-0005-0000-0000-000000000001','40000003-0003-0000-0000-000000000001',
 (select id from user_profiles where phone='60001005'),
 '判頭備註：破碎機開挖會影響交通改道時段，請 PM 留意夜間工作許可。', now() - interval '14 days')
on conflict (id) do nothing;

-- VO-001 attached to SI-001 (in_review). total_amount_cents is server-
-- maintained by trg_vo_sync_total when current_version_id is set; the
-- trg_vo_versions_recompute trigger fills subtotal/total inside payload.
insert into variation_orders
  (id, si_id, project_id, number, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at)
values
('40000003-0006-0000-0000-000000000001','40000003-0003-0000-0000-000000000001',
 'd0000003-0003-0003-0003-000000000003','VO-001', null,
 '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null},{"step_order":2,"required_role":"owner","optional_user_id":null}]'::jsonb,
 1,'in_review',
 (select id from user_profiles where phone='60001003'),
 now() - interval '13 days', now() - interval '12 days')
on conflict (id) do nothing;

-- vo_versions: line_items in cents (HKD). recompute trigger overwrites
-- subtotal_cents/total_amount_cents server-side — values here are just
-- the client estimate it will recompute to.
insert into vo_versions (id, vo_id, version_no, payload, edits_by, created_at)
values
('40000003-0007-0000-0000-000000000001','40000003-0006-0000-0000-000000000001',1,
 '{"description":"額外岩石開挖 (破碎機) — CH120-CH180","line_items":[{"category":"開挖","description":"液壓破碎機岩石開挖","quantity":60,"unit":"立方米","unit_price_cents":85000,"progress_leaf_item_id":null},{"category":"棄置","description":"岩石廢料運棄","quantity":60,"unit":"立方米","unit_price_cents":22000,"progress_leaf_item_id":null}],"total_amount_cents":6420000}'::jsonb,
 (select id from user_profiles where phone='60001003'), now() - interval '13 days')
on conflict (id) do nothing;

-- Point the VO at its current version (sync trigger copies total).
update variation_orders
  set current_version_id = '40000003-0007-0000-0000-000000000001'
where id = '40000003-0006-0000-0000-000000000001'
  and current_version_id is null;

-- ============================================================
-- 6. PTW (Permit to Work) + version + workers  — confined space + excavation
-- ============================================================
-- Active confined-space permit for MH2 接駁 work. expires_at end of HKT day.
-- LOCK ORDERING: ptw_lock_guard (BEFORE INSERT on permit_versions) raises if the
-- parent permit is already locked. An active permit IS locked (activate_ptw sets
-- locked_at). So insert the header with locked_at = NULL, insert the version,
-- THEN apply locked_at in a post-version UPDATE (the guard fires only on the
-- version INSERT, which has already happened). status/activated_at/expires_at
-- on the header do not trip the guard — only locked_at on the parent does.
insert into permits_to_work
  (id, project_id, number, ptw_type, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, activated_at, expires_at, locked_at)
values
('40000003-0008-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 'PTW-001','confined_space', null,
 '[{"step_order":0,"required_role":"safety_officer","optional_user_id":null},{"step_order":1,"required_role":"main_contractor","optional_user_id":null}]'::jsonb,
 2,'active',
 (select id from user_profiles where phone='60001005'),
 now() - interval '2 hours', now() - interval '110 minutes', now() - interval '90 minutes',
 (date_trunc('day', now() at time zone 'Asia/Hong_Kong') + interval '23 hours 59 minutes') at time zone 'Asia/Hong_Kong',
 null)
on conflict (id) do nothing;

insert into permit_versions (id, ptw_id, version_no, payload, edits_by, created_at)
values
('40000003-0009-0000-0000-000000000001','40000003-0008-0000-0000-000000000001',1,
 '{"location":"沙井 MH2 接駁","work_description":"進入 MH2 進行渠管接駁及防水","hazards":["缺氧","硫化氫 H2S","有害氣體","跌入"],"controls":["連續氣體偵測","強制通風","三腳架 + 救生繩","坑外監察員 standby"],"gas_test":{"o2":"20.9%","h2s":"0ppm","co":"0ppm","lel":"0%"},"valid_from":"08:00","valid_to":"18:00"}'::jsonb,
 (select id from user_profiles where phone='60001005'), now() - interval '2 hours')
on conflict (id) do nothing;

-- Version exists now: point current_version_id at it AND apply the lock.
update permits_to_work
  set current_version_id = '40000003-0009-0000-0000-000000000001',
      locked_at = now() - interval '90 minutes'
where id = '40000003-0008-0000-0000-000000000001'
  and current_version_id is null;

insert into permit_workers (id, ptw_id, worker_name, worker_phone, created_at)
values
('40000003-000a-0000-0000-000000000001','40000003-0008-0000-0000-000000000001','陳大文','60001006', now() - interval '2 hours'),
('40000003-000a-0000-0000-000000000002','40000003-0008-0000-0000-000000000001','李志強','60001007', now() - interval '2 hours')
on conflict (id) do nothing;

-- A second PTW: excavation, in_review (掘路安全)
insert into permits_to_work
  (id, project_id, number, ptw_type, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at)
values
('40000003-0008-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 'PTW-002','excavation', null,
 '[{"step_order":0,"required_role":"safety_officer","optional_user_id":null},{"step_order":1,"required_role":"main_contractor","optional_user_id":null}]'::jsonb,
 0,'in_review',
 (select id from user_profiles where phone='60001005'),
 now() - interval '20 hours', now() - interval '19 hours')
on conflict (id) do nothing;

insert into permit_versions (id, ptw_id, version_no, payload, edits_by, created_at)
values
('40000003-0009-0000-0000-000000000002','40000003-0008-0000-0000-000000000002',1,
 '{"location":"源禾路 CH120-CH260","work_description":"溝槽開挖深逾 2m","hazards":["塌坡","地下管線","機械碰撞"],"controls":["護土板支撐","管線探測","指揮員"],"valid_from":"08:00","valid_to":"18:00"}'::jsonb,
 (select id from user_profiles where phone='60001005'), now() - interval '20 hours')
on conflict (id) do nothing;

update permits_to_work
  set current_version_id = '40000003-0009-0000-0000-000000000002'
where id = '40000003-0008-0000-0000-000000000002'
  and current_version_id is null;

-- ============================================================
-- 7. MATERIALS  — varied status (status is a GENERATED column — do NOT set it)
-- ============================================================
-- arrived / partial / requested derived from qty_arrived vs qty_needed.
-- A "late" (overdue) order = requested + planned_arrival_at in the past.
insert into materials
  (id, project_id, name, unit, qty_needed, qty_arrived, item_ids, requested_by,
   planned_arrival_at, arrived_at, notes, created_at)
values
-- arrived
('40000003-000b-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 'HDPE 渠管 600mm (6m/支)','支',44,44,
 array['d0000003-0000-0000-0000-0000000000d1'::uuid],
 (select id from user_profiles where phone='60001005'),
 now() - interval '10 days', now() - interval '10 days','首批已到，存放於 CH0 工作區。', now() - interval '14 days'),
-- partial
('40000003-000b-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 'uPVC 污水渠管 300mm','米',180,60,
 array['d0000003-0000-0000-0000-0000000000d4'::uuid],
 (select id from user_profiles where phone='60001005'),
 now() - interval '2 days', null,'分兩批送貨，餘下下週到。', now() - interval '8 days'),
-- overdue (requested, planned arrival in the past)
('40000003-000b-0000-0000-000000000003','d0000003-0003-0003-0003-000000000003',
 '預製沙井 MH3 (1500mm dia)','個',1,0,
 array['e0000003-0000-0000-0000-0000000000e1'::uuid],
 (select id from user_profiles where phone='60001005'),
 now() - interval '3 days', null,'供應商延誤，已催。', now() - interval '12 days'),
-- requested (future)
('40000003-000b-0000-0000-000000000004','d0000003-0003-0003-0003-000000000003',
 'Class S 碎石墊層料','立方米',90,0,
 array['d0000003-0000-0000-0000-0000000000d2'::uuid],
 (select id from user_profiles where phone='60001005'),
 now() + interval '4 days', null,'配合 D.2 管床。', now() - interval '1 day'),
-- arrived (粒料 backfill)
('40000003-000b-0000-0000-000000000005','d0000003-0003-0003-0003-000000000003',
 '篩選回填粒料','立方米',300,300,
 array['f0000003-0000-0000-0000-0000000000f1'::uuid],
 (select id from user_profiles where phone='60001003'),
 now() - interval '6 days', now() - interval '6 days','管周保護回填用。', now() - interval '9 days')
on conflict (id) do nothing;

-- ============================================================
-- 8. TIMETABLE EVENTS  (events) — meeting / inspection / milestone
-- ============================================================
insert into events (id, project_id, title, description, starts_at, ends_at, location, event_type, created_by, created_at)
values
('40000003-000c-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 '每週工地協調會','回顧進度、物料、天氣影響及安全事項。',
 (date_trunc('week', now()) + interval '1 day' + interval '9 hours'),
 (date_trunc('week', now()) + interval '1 day' + interval '10 hours'),
 '工地辦公室','meeting',
 (select id from user_profiles where phone='60001001'), now() - interval '2 days'),
('40000003-000c-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 'DSD 渠管鋪設中段檢查','渠務署中段驗收 CH0-CH120 雨水渠。',
 now() + interval '3 days' + interval '14 hours', now() + interval '3 days' + interval '16 hours',
 '源禾路 CH60','inspection',
 (select id from user_profiles where phone='60001001'), now() - interval '1 day'),
('40000003-000c-0000-0000-000000000003','d0000003-0003-0003-0003-000000000003',
 '里程碑：雨水渠 CH0-CH120 完工','第一段雨水渠完成並通過 CCTV。',
 now() + interval '20 days' + interval '17 hours', null,
 '源禾路 CH0-CH120','milestone',
 (select id from user_profiles where phone='60001001'), now() - interval '1 day')
on conflict (id) do nothing;

-- ============================================================
-- 9. DAILIES  — daily site logs (must be authored by a main_contractor
--    with sub_role foreman/engineer per dailies_insert; we author 3
--    backdated logs by 60001003 engineer + 60000002 engineer +
--    60001004 foreman). unique (project_id,user_id,date).
-- ============================================================
insert into dailies
  (id, project_id, user_id, date, weather, weather_am, weather_pm, warning_signals,
   progress_item_ids, freeform_items, manpower, plant, notes, created_at)
values
('40000003-000d-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60001003'),
 (now() at time zone 'Asia/Hong_Kong')::date - 2,'雨','陰','雨',array['黃雨']::text[],
 (array['b0000003-0000-0000-0000-0000000000b2'::uuid,'c0000003-0000-0000-0000-0000000000c0'::uuid]),
 array['CH150 掘出未標示電纜，停工待 CLP']::text[],
 '[{"trade":"渠工","count":6},{"trade":"泥水","count":3},{"trade":"管工","count":2}]'::jsonb,
 '[{"type":"挖掘機","count":1},{"type":"泥頭車","count":2},{"type":"抽水泵","count":2}]'::jsonb,
 '上午黃雨，溝槽積水需抽水；下午復工。', now() - interval '2 days'),
('40000003-000d-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60000002'),
 (now() at time zone 'Asia/Hong_Kong')::date - 1,'陰','陰','晴',array[]::text[],
 (array['d0000003-0000-0000-0000-0000000000d1'::uuid,'e0000003-0000-0000-0000-0000000000e1'::uuid]),
 (array['HDPE 對接焊接 CH80-CH120','MH2 接駁進行']::text[]),
 '[{"trade":"渠工","count":8},{"trade":"焊工","count":2}]'::jsonb,
 '[{"type":"挖掘機","count":1},{"type":"吊機","count":1}]'::jsonb,
 '天氣好轉，全日施工順利。', now() - interval '1 day'),
('40000003-000d-0000-0000-000000000003','d0000003-0003-0003-0003-000000000003',
 (select id from user_profiles where phone='60001004'),
 (now() at time zone 'Asia/Hong_Kong')::date,'晴','晴','熱',array['酷熱天氣警告']::text[],
 (array['d0000003-0000-0000-0000-0000000000d1'::uuid,'f0000003-0000-0000-0000-0000000000f1'::uuid]),
 array['管周回填 CH0-CH60']::text[],
 '[{"trade":"渠工","count":7},{"trade":"泥水","count":4}]'::jsonb,
 '[{"type":"夯實機","count":2},{"type":"挖掘機","count":1}]'::jsonb,
 '酷熱警告，已安排遮蔭及加強休息。', now())
on conflict (id) do nothing;

-- ============================================================
-- 10. WEATHER  — territory weather_events + project_weather_claims (EOT)
-- ============================================================
-- weather_events is territory-wide (service-role written in prod); we
-- insert a couple of recent extreme-weather days for the demo timeline.
-- unique (hkt_date, kind, station).
insert into weather_events (id, hkt_date, kind, station, evidence, created_at)
values
('40000003-000e-0000-0000-000000000001',(now() at time zone 'Asia/Hong_Kong')::date - 2,
 'amber_rain', null, '{"code":"WRAINA","issued":"06:40","cancelled":"11:15"}'::jsonb, now() - interval '2 days'),
('40000003-000e-0000-0000-000000000002',(now() at time zone 'Asia/Hong_Kong')::date - 8,
 'black_rain', null, '{"code":"WRAINB","issued":"14:20","cancelled":"17:50"}'::jsonb, now() - interval '8 days'),
('40000003-000e-0000-0000-000000000003',(now() at time zone 'Asia/Hong_Kong')::date - 8,
 'rainfall_20mm', 'N05', '{"mm":78,"station":"沙田"}'::jsonb, now() - interval '8 days'),
('40000003-000e-0000-0000-000000000004',(now() at time zone 'Asia/Hong_Kong')::date,
 'very_hot', null, '{"code":"WHOT","issued":"11:00"}'::jsonb, now())
on conflict (hkt_date, kind, station) do nothing;

-- project_weather_claims — per-project EOT claim rows (CEDD App 7.4 fields).
-- recorded_by must equal the inserter under RLS; here authored by the PM/MC.
insert into project_weather_claims
  (id, project_id, hkt_date, trigger, on_critical_path, ready_to_work, tidy_days, claim_days, note, recorded_by, created_at)
values
('40000003-000f-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 (now() at time zone 'Asia/Hong_Kong')::date - 8,'黑雨 + 雨量 78mm',
 true, true, 0.5, 1.5, '黑雨全段停工，翌日上午清理溝槽積水。EOT 申請 1.5 日。',
 (select id from user_profiles where phone='60001001'), now() - interval '7 days'),
('40000003-000f-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 (now() at time zone 'Asia/Hong_Kong')::date - 2,'黃雨',
 false, true, 0, 0, '黃雨僅影響非關鍵工序，不申請 EOT，僅記錄。',
 (select id from user_profiles where phone='60001003'), now() - interval '2 days')
on conflict (project_id, hkt_date) do nothing;

-- ============================================================
-- 11. EQUIPMENT register + form instance  (form_signoffs are RPC-only)
-- ============================================================
-- equipment_register: ref unique per project. form_instances: (equipment,template).
insert into equipment_register
  (id, project_id, kind, ref_no, name_zh, brand_model, serial_no, location_zh, status, created_by, created_at)
values
('40000003-0010-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 'excavation','EQ-001','挖掘機 (掘斗)','Komatsu PC138US','KMT-138-9921','源禾路工作區','active',
 (select id from user_profiles where phone='60001003'), now() - interval '30 days'),
('40000003-0010-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 'lifting_appliance','EQ-002','汽車吊機 25 噸','XCMG QY25K','XCM-25-4410','沙井吊裝區','active',
 (select id from user_profiles where phone='60001003'), now() - interval '25 days')
on conflict (id) do nothing;

-- form_instances tie equipment to a seeded template (by code). valid_until
-- in the future for one, expiring soon for the other (for dashboard variety).
insert into form_instances
  (id, project_id, equipment_id, template_id, location_zh, assigned_signer_id, valid_until, suspended, created_by, created_at)
select v.id, 'd0000003-0003-0003-0003-000000000003'::uuid, v.equipment_id,
       (select id from form_templates where code = v.tmpl_code),
       v.location_zh,
       (select id from user_profiles where phone = v.signer_phone),
       v.valid_until, false,
       (select id from user_profiles where phone='60001003'), now() - interval '10 days'
from (values
  ('40000003-0011-0000-0000-000000000001'::uuid,'40000003-0010-0000-0000-000000000002'::uuid,'LALG-F1','沙井吊裝區','60000004', now() + interval '5 days'),
  ('40000003-0011-0000-0000-000000000002'::uuid,'40000003-0010-0000-0000-000000000001'::uuid,'CSSR-F4','源禾路工作區','60000004', now() - interval '1 day')
) as v(id, equipment_id, tmpl_code, location_zh, signer_phone, valid_until)
where (select id from form_templates where code = v.tmpl_code) is not null
on conflict (id) do nothing;

-- ============================================================
-- 12. CONTACTS  — project address book (admin/pm written)
-- ============================================================
insert into contacts (id, project_id, name, trade, phone, notes, created_by, created_at)
values
('40000003-0012-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 '陳師傅','渠務判頭','60001005','源禾路渠管鋪設判頭。',
 (select id from user_profiles where phone='60001001'), now() - interval '20 days'),
('40000003-0012-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 '黃工','喉管供應','92345678','HDPE / uPVC 渠管供應商。',
 (select id from user_profiles where phone='60001001'), now() - interval '18 days'),
('40000003-0012-0000-0000-000000000003','d0000003-0003-0003-0003-000000000003',
 '中電工程組 (CLP)','電力公司','27288888','地下電纜驗線 / 改道聯絡。',
 (select id from user_profiles where phone='60001003'), now() - interval '3 days')
on conflict (id) do nothing;

-- ============================================================
-- 13. DOCUMENTS (+ versions)  — register header + version rows
-- ============================================================
-- document_versions require NOT NULL file_path, mime_type (checked),
-- size_bytes. status enum. current_version_id deferred FK.
-- doc_number is the per-project per-type sequence label (we set explicit).
insert into documents
  (id, project_id, progress_item_id, document_type, title, doc_number, created_by, created_at, updated_at)
values
('40000003-0013-0000-0000-000000000001','d0000003-0003-0003-0003-000000000003',
 null,'material_submission','HDPE 600mm 渠管物料報批','MAT-001',
 (select id from user_profiles where phone='60001003'), now() - interval '16 days', now() - interval '12 days'),
('40000003-0013-0000-0000-000000000002','d0000003-0003-0003-0003-000000000003',
 null,'method_statement','密閉空間沙井作業方法聲明','MS-001',
 (select id from user_profiles where phone='60000004'), now() - interval '11 days', now() - interval '11 days')
on conflict (id) do nothing;

insert into document_versions
  (id, document_id, version_no, revision_label, bucket_id, file_path, mime_type, size_bytes,
   status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
values
-- MAT-001 v1 superseded, v2 approved
('40000003-0014-0000-0000-000000000001','40000003-0013-0000-0000-000000000001',1,'Rev A','project-docs',
 'd0000003-0003-0003-0003-000000000003/40000003-0013-0000-0000-000000000001/v1/hdpe600-submittal-revA.pdf',
 'application/pdf',834221,'superseded',
 (select id from user_profiles where phone='60001003'), now() - interval '16 days',
 (select id from user_profiles where phone='60001001'), now() - interval '15 days','缺供應商 ISO 證書，請補。'),
('40000003-0014-0000-0000-000000000002','40000003-0013-0000-0000-000000000001',2,'Rev B','project-docs',
 'd0000003-0003-0003-0003-000000000003/40000003-0013-0000-0000-000000000001/v2/hdpe600-submittal-revB.pdf',
 'application/pdf',901882,'approved',
 (select id from user_profiles where phone='60001003'), now() - interval '13 days',
 (select id from user_profiles where phone='60001001'), now() - interval '12 days','已附證書，批准使用。'),
-- MS-001 v1 submitted (under review)
('40000003-0014-0000-0000-000000000003','40000003-0013-0000-0000-000000000002',1,'Rev A','project-docs',
 'd0000003-0003-0003-0003-000000000003/40000003-0013-0000-0000-000000000002/v1/confined-space-ms-revA.pdf',
 'application/pdf',1248330,'submitted',
 (select id from user_profiles where phone='60000004'), now() - interval '11 days', null, null, null)
on conflict (id) do nothing;

-- Point each document header at its current version.
update documents set current_version_id = '40000003-0014-0000-0000-000000000002'
where id = '40000003-0013-0000-0000-000000000001' and current_version_id is null;
update documents set current_version_id = '40000003-0014-0000-0000-000000000003'
where id = '40000003-0013-0000-0000-000000000002' and current_version_id is null;

-- A couple of document_events (audit trail).
insert into document_events (id, document_id, version_id, event_type, actor_id, note, created_at)
values
('40000003-0015-0000-0000-000000000001','40000003-0013-0000-0000-000000000001','40000003-0014-0000-0000-000000000002',
 'approved',(select id from user_profiles where phone='60001001'),'Rev B 批准。', now() - interval '12 days'),
('40000003-0015-0000-0000-000000000002','40000003-0013-0000-0000-000000000002','40000003-0014-0000-0000-000000000003',
 'submitted',(select id from user_profiles where phone='60000004'),'方法聲明提交待審。', now() - interval '11 days')
on conflict (id) do nothing;

commit;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select name, project_type, ai_enabled from projects where id='d0000003-0003-0003-0003-000000000003';
--   select count(*) from project_members where project_id='d0000003-0003-0003-0003-000000000003' and status='approved';  -- 6
--   select count(*), count(*) filter (where parent_id is null) as tops from progress_items where project_id='d0000003-0003-0003-0003-000000000003';
--   select tracking_mode, count(*) from progress_items where project_id='d0000003-0003-0003-0003-000000000003' group by 1;
--   select status, count(*) from progress_items where project_id='d0000003-0003-0003-0003-000000000003' group by 1;
--   select count(*) from issues where project_id='d0000003-0003-0003-0003-000000000003';
--   select number, status from site_instructions where project_id='d0000003-0003-0003-0003-000000000003';
--   select number, status, total_amount_cents from variation_orders where project_id='d0000003-0003-0003-0003-000000000003';
--   select number, ptw_type, status from permits_to_work where project_id='d0000003-0003-0003-0003-000000000003';
--   select name, status from materials where project_id='d0000003-0003-0003-0003-000000000003';
--   select count(*) from dailies where project_id='d0000003-0003-0003-0003-000000000003';  -- 3
--   select hkt_date, trigger, claim_days from project_weather_claims where project_id='d0000003-0003-0003-0003-000000000003';
--   select ref_no, name_zh from equipment_register where project_id='d0000003-0003-0003-0003-000000000003';
--   select doc_number, title from documents where project_id='d0000003-0003-0003-0003-000000000003';
--   -- re-run the whole file: all ON CONFLICT DO NOTHING -> zero new rows, no error.
-- =============================================================
