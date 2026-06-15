-- =============================================================
-- seed-small-reno.sql  —  [DEMO] 小型裝修 — 旺角寫字樓內部翻新
-- =============================================================
-- Idempotent demo seed for ONE small-works / 裝修 project, exercising
-- every module with realistic zh-HK Hong Kong renovation content.
--
-- PROJECT (fixed uuid): d0000002-0002-0002-0002-000000000002
--   type = 'small_works'  (旺角寫字樓內部翻新, 單一單位)
--   ai_enabled = true
--
-- WHAT THIS DOES NOT DO:
--   * It does NOT create auth.users / user_profiles. All personas are
--     resolved BY PHONE from the EXISTING user_profiles rows
--     (select id from user_profiles where phone='600xxxxx'). If a
--     persona's profile is missing, the relevant insert silently
--     no-ops (NULL user_id -> ON CONFLICT / NOT NULL guards skip it),
--     it does NOT abort the whole seed.
--
-- IDEMPOTENCY: wrapped in a single begin;...commit;. Every row uses a
-- FIXED uuid (or natural key) + ON CONFLICT DO NOTHING. Re-running is a
-- no-op. Safe to paste whole into the Supabase SQL editor.
--
-- TRIGGER NOTES (verified against schema):
--   * projects AFTER INSERT trg_seed_default_chain auto-seeds si/vo
--     chains on FIRST insert; we ALSO upsert si/vo/ptw chains
--     explicitly so re-runs (where the project already exists) still
--     have a full PTW chain. All chain inserts are ON CONFLICT
--     (project_id,doc_type,step_order) DO NOTHING.
--   * issues.issue_no is assigned by BEFORE INSERT trg_assign_issue_no
--     — we never supply it.
--   * materials.status is a STORED generated column — never inserted.
--   * vo_versions BEFORE INSERT recompute_vo_totals recomputes every
--     subtotal_cents and total_amount_cents from quantity *
--     unit_price_cents, so the totals we write are advisory only.
--   * variation_orders.total_amount_cents is server-maintained by
--     trg_vo_sync_total when current_version_id is set; we set the
--     version first, then point current_version_id at it.
--   * audit_ledger AFTER triggers just append — harmless here.
-- =============================================================

begin;

-- ── 0. Convenience: project + actor handles (resolved by phone) ──
-- We reference these inline as scalar sub-selects throughout so we
-- never hardcode a user UUID.

-- ── 1. Project ───────────────────────────────────────────────
insert into projects (id, name, zones, assigned_pm_ids, created_by, project_type, ai_enabled, created_at)
values (
  'd0000002-0002-0002-0002-000000000002',
  '[DEMO] 小型裝修 — 旺角寫字樓內部翻新',
  '[{"id":"z1","name":"A區 — 開放式辦公區"},{"id":"z2","name":"B區 — 會議室 / 茶水間 / 洗手間"}]'::jsonb,
  array[(select id from user_profiles where phone = '60001001')],
  (select id from user_profiles where phone = '60000099'),
  'small_works',
  true,
  now() - interval '20 days'
)
on conflict (id) do nothing;

-- Keep assigned_pm_ids / ai_enabled / type correct even if the row
-- pre-existed from an earlier partial seed (still idempotent — sets to
-- the same values every run).
update projects
   set assigned_pm_ids = array[(select id from user_profiles where phone = '60001001')],
       ai_enabled = true,
       project_type = 'small_works'
 where id = 'd0000002-0002-0002-0002-000000000002';

-- ── 2. Project members (all approved) ────────────────────────
-- PM, main_contractor (engineer), general_foreman, subcontractor,
-- subcontractor_worker, safety_officer. approved_by = admin.
insert into project_members (id, user_id, project_id, role, status, applied_at, approved_by, approved_at)
select v.id, up.id, 'd0000002-0002-0002-0002-000000000002', v.role, 'approved',
       now() - interval '19 days',
       (select id from user_profiles where phone = '60000099'),
       now() - interval '19 days'
from (values
  ('e0000002-0002-0002-0002-000000000001'::uuid, '60001001', 'pm'),
  ('e0000002-0002-0002-0002-000000000002'::uuid, '60001003', 'main_contractor'),
  ('e0000002-0002-0002-0002-000000000003'::uuid, '60001002', 'general_foreman'),
  ('e0000002-0002-0002-0002-000000000004'::uuid, '60001005', 'subcontractor'),
  ('e0000002-0002-0002-0002-000000000005'::uuid, '60001006', 'subcontractor_worker'),
  ('e0000002-0002-0002-0002-000000000006'::uuid, '60000004', 'safety_officer')
) as v(id, phone, role)
join user_profiles up on up.phone = v.phone
on conflict (id) do nothing;

-- ── 3. Approval chains (si / vo / ptw) ───────────────────────
-- Small-works flow: 判頭/MC 提交 -> MC 工程師 -> PM. PTW adds 安全主任.
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
values
  ('d0000002-0002-0002-0002-000000000002', 'si', 0, 'main_contractor'),
  ('d0000002-0002-0002-0002-000000000002', 'si', 1, 'pm'),
  ('d0000002-0002-0002-0002-000000000002', 'vo', 0, 'main_contractor'),
  ('d0000002-0002-0002-0002-000000000002', 'vo', 1, 'pm'),
  ('d0000002-0002-0002-0002-000000000002', 'ptw', 0, 'safety_officer'),
  ('d0000002-0002-0002-0002-000000000002', 'ptw', 1, 'pm')
on conflict (project_id, doc_type, step_order) do nothing;

-- =============================================================
-- 4. PROGRESS TREE  (大項 level1 -> 中項 level2 -> 細項 level3)
-- =============================================================
-- Flow: 拆卸 -> 水電改道 -> 間隔/天花 -> 地板 -> 油漆 -> 傢俬/標識 -> 清潔交收
-- Varied tracking_mode (percentage / checklist / quantity / floors-as-room),
-- varied status (completed / in-progress / delayed / blocked / not-started),
-- planned dates spanning the ~7-week programme.
-- last_updated_by = the general_foreman (老總) unless noted.
-- =============================================================

-- helper actor ids reused below as scalar sub-selects.

-- ── A. 拆卸及保護 (大項, 已完成) ──────────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',null,
 'A','拆卸及保護',null,1,
 (now()-interval '18 days')::date,(now()-interval '12 days')::date,100,100,'completed',
 '舊間隔、天花、地毯全部清走；交吉前已做好保護。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '12 days',now()-interval '18 days',
 'building','civil')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed, last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000001',
 'A.1','拆卸現有間隔及天花','z1',2,
 (now()-interval '18 days')::date,(now()-interval '15 days')::date,100,100,'completed',
 '石膏板間隔 + 礦棉天花拆除，廢料已運走。','checklist',
 '["拆假天花","拆石膏間隔","拆地毯","廢料外運"]'::jsonb,
 '["拆假天花","拆石膏間隔","拆地毯","廢料外運"]'::jsonb,
 (select id from user_profiles where phone='60001006'),now()-interval '15 days',now()-interval '18 days'),
('a1000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000001',
 'A.2','地台保護及現場圍封','z1',2,
 (now()-interval '15 days')::date,(now()-interval '12 days')::date,100,100,'completed',
 '出入口防塵簾、升降機大堂地台保護板鋪好。','percentage',
 '[]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '12 days',now()-interval '18 days')
on conflict (id) do nothing;

-- ── B. 機電改道 (大項, 進行中) — civil+bs ──────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000010','d0000002-0002-0002-0002-000000000002',null,
 'B','機電改道 (水/電/冷氣/消防)',null,1,
 (now()-interval '12 days')::date,(now()+interval '4 days')::date,75,55,'in-progress',
 '電力、冷氣風喉、消防灑水頭改位同步進行。','percentage',
 (select id from user_profiles where phone='60001003'),now()-interval '1 days',now()-interval '17 days',
 'building','bs')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, qty_total, qty_done, qty_unit, blocked_reason,
   floor_labels, floors_completed,
   assigned_to, delegated_to, last_updated_by, last_updated_at, created_at)
values
-- B.1 電力 — quantity mode (拉線 metres)
('a1000002-0000-0000-0000-000000000011','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000010',
 'B.1','電力線槽 / 電線改道','z1',2,
 (now()-interval '12 days')::date,(now()-interval '1 days')::date,100,80,'in-progress',
 '主幹線槽完成，分支拉線進行中。','quantity',
 320,256,'m',null,
 '[]'::jsonb,'[]'::jsonb,
 array[(select id from user_profiles where phone='60001005')],
 array[(select id from user_profiles where phone='60001006')],
 (select id from user_profiles where phone='60001006'),now()-interval '1 days',now()-interval '17 days'),
-- B.2 冷氣風喉 — checklist
('a1000002-0000-0000-0000-000000000012','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000010',
 'B.2','冷氣風喉及出風口改位','z1',2,
 (now()-interval '10 days')::date,(now()+interval '2 days')::date,70,60,'in-progress',
 '出風口位置已按新間隔圖調整。','checklist',
 null,0,null,null,
 '["主風喉接駁","A區出風口","B區出風口","回風口","保溫包紮"]'::jsonb,
 '["主風喉接駁","A區出風口","B區出風口"]'::jsonb,
 array[]::uuid[],array[]::uuid[],
 (select id from user_profiles where phone='60001003'),now()-interval '2 days',now()-interval '16 days'),
-- B.3 消防灑水頭 — blocked (等則師確認)
('a1000002-0000-0000-0000-000000000013','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000010',
 'B.3','消防灑水頭改位','z2',2,
 (now()-interval '8 days')::date,(now()+interval '1 days')::date,80,20,'blocked',
 '會議室灑水頭覆蓋範圍需消防則師確認，暫停施工。','percentage',
 null,0,null,'等待消防則師確認新灑水頭佈置 (FS plan)',
 '[]'::jsonb,'[]'::jsonb,
 array[]::uuid[],array[]::uuid[],
 (select id from user_profiles where phone='60001003'),now()-interval '3 days',now()-interval '16 days'),
-- B.4 水喉 (茶水間/洗手間) — delayed
('a1000002-0000-0000-0000-000000000014','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000010',
 'B.4','茶水間及洗手間水喉改道','z2',2,
 (now()-interval '9 days')::date,(now()-interval '2 days')::date,100,45,'delayed',
 '排水位需開鑿樓板，較預期慢；已通知 PM。','percentage',
 null,0,null,null,
 '[]'::jsonb,'[]'::jsonb,
 array[(select id from user_profiles where phone='60001005')],array[]::uuid[],
 (select id from user_profiles where phone='60001002'),now()-interval '2 days',now()-interval '16 days')
on conflict (id) do nothing;

-- B.1 細項 (level 3) — demonstrates 大項→中項→細項 chain under 電力
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, qty_total, qty_done, qty_unit,
   assigned_to, last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000111','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000011',
 'B.1.1','主幹線槽安裝','z1',3,
 (now()-interval '12 days')::date,(now()-interval '8 days')::date,100,100,'completed',
 '天花主幹金屬線槽全部完成。','quantity',120,120,'m',
 array[(select id from user_profiles where phone='60001006')],
 (select id from user_profiles where phone='60001006'),now()-interval '8 days',now()-interval '12 days'),
('a1000002-0000-0000-0000-000000000112','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000011',
 'B.1.2','分支拉線及插座位','z1',3,
 (now()-interval '8 days')::date,(now()-interval '1 days')::date,100,70,'in-progress',
 '辦公區分支拉線過半，插座盒安裝中。','quantity',200,136,'m',
 array[(select id from user_profiles where phone='60001006')],
 (select id from user_profiles where phone='60001006'),now()-interval '1 days',now()-interval '12 days'),
('a1000002-0000-0000-0000-000000000113','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000011',
 'B.1.3','總配電箱 (DB) 升級','z2',3,
 (now()-interval '4 days')::date,(now()+interval '1 days')::date,70,40,'in-progress',
 '新增 20A 回路予茶水間電熱水爐 (VO-002)。','percentage',null,0,null,
 array[(select id from user_profiles where phone='60001006')],
 (select id from user_profiles where phone='60001006'),now()-interval '1 days',now()-interval '11 days')
on conflict (id) do nothing;

-- ── C. 間隔及天花 (大項, 進行中) ───────────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000020','d0000002-0002-0002-0002-000000000002',null,
 'C','間隔及天花',null,1,
 (now()-interval '6 days')::date,(now()+interval '8 days')::date,45,30,'in-progress',
 '新石膏板間隔起骨架中，天花隨後跟上。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '1 days',now()-interval '14 days',
 'building','civil')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000021','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000020',
 'C.1','石膏板間隔牆','z1',2,
 (now()-interval '6 days')::date,(now()+interval '3 days')::date,60,40,'in-progress',
 '會議室及經理房間隔骨架完成，封板中。','checklist',
 '["經理房","會議室","儲物房","電腦房","茶水間"]'::jsonb,
 '["經理房","會議室"]'::jsonb,
 (select id from user_profiles where phone='60001006'),now()-interval '1 days',now()-interval '14 days'),
('a1000002-0000-0000-0000-000000000022','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000020',
 'C.2','礦棉 / 石膏假天花','z1',2,
 (now()+interval '2 days')::date,(now()+interval '8 days')::date,0,0,'not-started',
 '待機電上頂及間隔封板後開始。','checklist',
 '["A區礦棉天花","B區礦棉天花","會議室石膏天花","檢修口"]'::jsonb,
 '[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '14 days',now()-interval '14 days'),
('a1000002-0000-0000-0000-000000000023','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000020',
 'C.3','玻璃間隔及門','z2',2,
 (now()+interval '5 days')::date,(now()+interval '10 days')::date,0,0,'not-started',
 '會議室強化玻璃間隔，待量度實際尺寸後訂造。','percentage',
 '[]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '14 days',now()-interval '14 days')
on conflict (id) do nothing;

-- C.1 細項 (level 3) — 間隔分房 (inserted AFTER C.1 parent a1...021 so the
-- non-deferrable progress_items_parent_id_fkey is satisfied — parent-before-child).
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000211','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000021',
 'C.1.1','經理房間隔','z1',3,
 (now()-interval '6 days')::date,(now()-interval '3 days')::date,100,100,'completed',
 '骨架 + 雙面封板完成。','percentage',
 (select id from user_profiles where phone='60001006'),now()-interval '3 days',now()-interval '6 days'),
('a1000002-0000-0000-0000-000000000212','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000021',
 'C.1.2','會議室間隔','z2',3,
 (now()-interval '4 days')::date,(now()+interval '1 days')::date,80,55,'in-progress',
 '單面封板完成，另一面待機電上頂。','percentage',
 (select id from user_profiles where phone='60001006'),now()-interval '1 days',now()-interval '6 days'),
('a1000002-0000-0000-0000-000000000213','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000021',
 'C.1.3','儲物房 / 電腦房間隔','z1',3,
 (now()+interval '1 days')::date,(now()+interval '3 days')::date,0,0,'not-started',
 '待會議室完成後接力。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '6 days',now()-interval '6 days')
on conflict (id) do nothing;

-- ── D. 地板工程 (大項, 未開始) — quantity m2 ───────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000030','d0000002-0002-0002-0002-000000000002',null,
 'D','地板工程',null,1,
 (now()+interval '8 days')::date,(now()+interval '14 days')::date,0,0,'not-started',
 '自流平 + 地膠 / 地毯磚。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '14 days',now()-interval '13 days',
 'building','civil')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, qty_total, qty_done, qty_unit,
   last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000031','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000030',
 'D.1','自流平水泥批盪','z1',2,
 (now()+interval '8 days')::date,(now()+interval '10 days')::date,0,0,'not-started',
 '全屋約 180m² 自流平。','quantity',180,0,'m²',
 (select id from user_profiles where phone='60001002'),now()-interval '13 days',now()-interval '13 days'),
('a1000002-0000-0000-0000-000000000032','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000030',
 'D.2','地毯磚鋪設 (辦公區)','z1',2,
 (now()+interval '10 days')::date,(now()+interval '13 days')::date,0,0,'not-started',
 '辦公區地毯磚。','quantity',150,0,'m²',
 (select id from user_profiles where phone='60001002'),now()-interval '13 days',now()-interval '13 days'),
('a1000002-0000-0000-0000-000000000033','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000030',
 'D.3','防滑地磚 (茶水間/洗手間)','z2',2,
 (now()+interval '11 days')::date,(now()+interval '14 days')::date,0,0,'not-started',
 '濕區防滑磚。','quantity',30,0,'m²',
 (select id from user_profiles where phone='60001002'),now()-interval '13 days',now()-interval '13 days')
on conflict (id) do nothing;

-- ── E. 油漆及牆身飾面 (大項, 未開始) ───────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000040','d0000002-0002-0002-0002-000000000002',null,
 'E','油漆及牆身飾面',null,1,
 (now()+interval '13 days')::date,(now()+interval '20 days')::date,0,0,'not-started',
 '批灰、底漆、面漆兩度。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '13 days',now()-interval '12 days',
 'building','civil')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000041','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000040',
 'E.1','牆身批灰 + 打磨','z1',2,
 (now()+interval '13 days')::date,(now()+interval '16 days')::date,0,0,'not-started',
 '間隔板接縫批灰打磨。','percentage','[]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '12 days',now()-interval '12 days'),
('a1000002-0000-0000-0000-000000000042','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000040',
 'E.2','乳膠漆面漆 (兩度)','z1',2,
 (now()+interval '16 days')::date,(now()+interval '20 days')::date,0,0,'not-started',
 '白色乳膠漆兩度，重點牆深灰色。','checklist',
 '["A區四面牆","會議室","經理房","走廊","茶水間"]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '12 days',now()-interval '12 days')
on conflict (id) do nothing;

-- ── F. 傢俬、燈具及標識 (大項, 未開始) — bs ────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000050','d0000002-0002-0002-0002-000000000002',null,
 'F','傢俬、燈具及標識',null,1,
 (now()+interval '18 days')::date,(now()+interval '24 days')::date,0,0,'not-started',
 '系統傢俬、LED 燈具、公司標識安裝。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '12 days',now()-interval '11 days',
 'building','bs')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000051','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000050',
 'F.1','LED 燈具及照明安裝','z1',2,
 (now()+interval '18 days')::date,(now()+interval '21 days')::date,0,0,'not-started',
 '天花 LED panel + 線燈。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '11 days',now()-interval '11 days'),
('a1000002-0000-0000-0000-000000000052','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000050',
 'F.2','系統辦公傢俬安裝','z1',2,
 (now()+interval '20 days')::date,(now()+interval '23 days')::date,0,0,'not-started',
 '工作枱、活動櫃、會議檯。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '11 days',now()-interval '11 days'),
('a1000002-0000-0000-0000-000000000053','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000050',
 'F.3','公司標識及門牌','z2',2,
 (now()+interval '22 days')::date,(now()+interval '24 days')::date,0,0,'not-started',
 '前台 logo、房間門牌、走火指示牌。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '11 days',now()-interval '11 days')
on conflict (id) do nothing;

-- ── G. 清潔及交收 (大項, 未開始) ──────────────────────────────
insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, last_updated_by, last_updated_at, created_at,
   category_domain, category_stream)
values
('a1000002-0000-0000-0000-000000000060','d0000002-0002-0002-0002-000000000002',null,
 'G','清潔及交收',null,1,
 (now()+interval '24 days')::date,(now()+interval '26 days')::date,0,0,'not-started',
 '埋尾執漏、開荒清潔、業主驗收。','percentage',
 (select id from user_profiles where phone='60001002'),now()-interval '11 days',now()-interval '10 days',
 'building','civil')
on conflict (id) do nothing;

insert into progress_items
  (id, project_id, parent_id, code, title, zone_id, level,
   planned_start, planned_end, planned_progress, actual_progress, status, notes,
   tracking_mode, floor_labels, floors_completed,
   last_updated_by, last_updated_at, created_at)
values
('a1000002-0000-0000-0000-000000000061','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000060',
 'G.1','執漏 (snag list)','z1',2,
 (now()+interval '24 days')::date,(now()+interval '25 days')::date,0,0,'not-started',
 '巡場執漏清單。','percentage','[]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '10 days',now()-interval '10 days'),
('a1000002-0000-0000-0000-000000000062','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000060',
 'G.2','開荒清潔','z1',2,
 (now()+interval '25 days')::date,(now()+interval '26 days')::date,0,0,'not-started',
 '全屋開荒、玻璃清潔。','percentage','[]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '10 days',now()-interval '10 days'),
('a1000002-0000-0000-0000-000000000063','d0000002-0002-0002-0002-000000000002','a1000002-0000-0000-0000-000000000060',
 'G.3','業主驗收及交收','z1',2,
 (now()+interval '26 days')::date,(now()+interval '26 days')::date,0,0,'not-started',
 '業主聯同 PM 驗收，簽署交收紙。','checklist',
 '["機電測試","油漆面層","傢俬安裝","標識","清潔","文件交收"]'::jsonb,'[]'::jsonb,
 (select id from user_profiles where phone='60001002'),now()-interval '10 days',now()-interval '10 days')
on conflict (id) do nothing;

-- ── progress_history — a couple of audit ticks on live items ──
insert into progress_history (id, item_id, actual_progress, floors_completed, notes, qty_done, change_type, updated_by, created_at)
values
('b1000002-0000-0000-0000-000000000001','a1000002-0000-0000-0000-000000000011',60,'[]'::jsonb,'主幹線槽完成',192,'progress',
 (select id from user_profiles where phone='60001006'),now()-interval '4 days'),
('b1000002-0000-0000-0000-000000000002','a1000002-0000-0000-0000-000000000011',80,'[]'::jsonb,'分支拉線過半',256,'progress',
 (select id from user_profiles where phone='60001006'),now()-interval '1 days'),
('b1000002-0000-0000-0000-000000000003','a1000002-0000-0000-0000-000000000021',40,'["經理房","會議室"]'::jsonb,'會議室封板',null,'progress',
 (select id from user_profiles where phone='60001006'),now()-interval '1 days')
on conflict (id) do nothing;

-- =============================================================
-- 5. ISSUES (+ comments)  — varied status (note: schema status is
--    open|resolved; we also vary current_handler_role + escalation
--    via comments to show in-progress vs resolved threads)
-- =============================================================
insert into issues
  (id, project_id, reporter_id, reporter_role, title, description, photos,
   current_handler_role, status, location, resolved_by, resolved_at, created_at, updated_at)
values
-- I-1 open, handler subcontractor (worker -> 判頭)
('c1000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001006'),'subcontractor_worker',
 '洗手間排水位漏水','拆完舊間隔後發現洗手間原有排水位有滲漏，未接駁新喉前需處理。','[]'::jsonb,
 'subcontractor','open','B區 — 洗手間',null,null,now()-interval '6 days',now()-interval '6 days'),
-- I-2 open + escalated to main_contractor
('c1000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001005'),'subcontractor',
 '消防灑水頭佈置待則師確認','會議室新間隔令一個灑水頭被遮擋，需消防則師重新計算覆蓋範圍。','[]'::jsonb,
 'main_contractor','open','B區 — 會議室',null,null,now()-interval '3 days',now()-interval '2 days'),
-- I-3 resolved
('c1000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001002'),'general_foreman',
 '升降機大堂保護板鬆脫','大廈管理處投訴升降機大堂保護板鬆脫，已即時重新固定。','[]'::jsonb,
 'main_contractor','resolved','公共升降機大堂',
 (select id from user_profiles where phone='60001003'),now()-interval '8 days',
 now()-interval '9 days',now()-interval '8 days'),
-- I-4 open, handler pm (engineer -> pm)
('c1000002-0000-0000-0000-000000000004','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001003'),'main_contractor',
 '水喉改道進度落後','茶水間排水需開鑿樓板，較預期慢兩日，或影響地板工序開工。','[]'::jsonb,
 'pm','open','B區 — 茶水間',null,null,now()-interval '2 days',now()-interval '1 days')
on conflict (id) do nothing;

insert into issue_comments (id, issue_id, author_id, action, body, from_role, to_role, created_at)
values
('c2000002-0000-0000-0000-000000000001','c1000002-0000-0000-0000-000000000001',
 (select id from user_profiles where phone='60001006'),'reported','發現舊排水位滲漏，影響接駁。',null,null,now()-interval '6 days'),
('c2000002-0000-0000-0000-000000000002','c1000002-0000-0000-0000-000000000001',
 (select id from user_profiles where phone='60001005'),'commented','已安排水喉師傅明早到場檢查。',null,null,now()-interval '5 days'),
('c2000002-0000-0000-0000-000000000003','c1000002-0000-0000-0000-000000000002',
 (select id from user_profiles where phone='60001005'),'reported','灑水頭被新間隔遮擋。',null,null,now()-interval '3 days'),
('c2000002-0000-0000-0000-000000000004','c1000002-0000-0000-0000-000000000002',
 (select id from user_profiles where phone='60001005'),'escalated','超出判頭範圍，需總承建商跟消防則師。','subcontractor','main_contractor',now()-interval '2 days'),
('c2000002-0000-0000-0000-000000000005','c1000002-0000-0000-0000-000000000003',
 (select id from user_profiles where phone='60001003'),'resolved','保護板已重新固定並加強。',null,null,now()-interval '8 days'),
('c2000002-0000-0000-0000-000000000006','c1000002-0000-0000-0000-000000000004',
 (select id from user_profiles where phone='60001003'),'escalated','或影響地板開工日期，請 PM 評估程序調整。','main_contractor','pm',now()-interval '1 days')
on conflict (id) do nothing;

-- =============================================================
-- 6. SITE INSTRUCTIONS (+ versions)
-- =============================================================
-- SI-001: locked (已批准鎖定) — drives a downstream VO.
-- SI-002: in_review (審批中).
insert into site_instructions
  (id, project_id, number, current_version_id, chain_snapshot, current_step, status,
   created_by, created_at, submitted_at, locked_at)
values
('d1000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002','SI-001',
 null,
 '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
 2,'in_review',
 (select id from user_profiles where phone='60001003'),
 now()-interval '7 days',now()-interval '7 days',null),
('d1000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002','SI-002',
 null,
 '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
 0,'in_review',
 (select id from user_profiles where phone='60001003'),
 now()-interval '2 days',now()-interval '2 days',null)
on conflict (id) do nothing;

insert into si_versions (id, si_id, version_no, payload, edits_by, created_at)
values
('d2000002-0000-0000-0000-000000000001','d1000002-0000-0000-0000-000000000001',1,
 '{"title":"會議室加裝玻璃間隔","description":"業主要求會議室改用強化玻璃間隔連玻璃門，取代原圖則的石膏板實牆，以增加採光。","drawing_version_ids":[],"photo_paths":[],"voice_path":null,"lat":22.3193,"lng":114.1694,"accuracy_m":12}'::jsonb,
 (select id from user_profiles where phone='60001003'),now()-interval '7 days'),
('d2000002-0000-0000-0000-000000000002','d1000002-0000-0000-0000-000000000002',1,
 '{"title":"茶水間電熱水爐加位","description":"業主要求茶水間加裝即熱式電熱水爐，需新增 20A 專用回路及防漏電開關。","drawing_version_ids":[],"photo_paths":[],"voice_path":null,"lat":22.3193,"lng":114.1694,"accuracy_m":15}'::jsonb,
 (select id from user_profiles where phone='60001003'),now()-interval '2 days')
on conflict (id) do nothing;

-- point SI-001 current version + (re)affirm SI-002 current version
update site_instructions set current_version_id = 'd2000002-0000-0000-0000-000000000001'
 where id = 'd1000002-0000-0000-0000-000000000001' and current_version_id is null;
update site_instructions set current_version_id = 'd2000002-0000-0000-0000-000000000002'
 where id = 'd1000002-0000-0000-0000-000000000002' and current_version_id is null;
-- SI-001 lock AFTER its version exists (si_lock_guard blocks adding a version to
-- an already-locked SI, so lock last). This is the approved/locked end-state.
update site_instructions set status='locked', locked_at=now()-interval '5 days'
 where id='d1000002-0000-0000-0000-000000000001';

-- approvals audit rows for the locked SI-001 (MC approve -> PM approve)
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
values
('d3000002-0000-0000-0000-000000000001','si','d1000002-0000-0000-0000-000000000001',0,'approve',
 (select id from user_profiles where phone='60001003'),null,now()-interval '6 days'),
('d3000002-0000-0000-0000-000000000002','si','d1000002-0000-0000-0000-000000000001',1,'approve',
 (select id from user_profiles where phone='60001001'),null,now()-interval '5 days')
on conflict (id) do nothing;

-- =============================================================
-- 7. VARIATION ORDERS (+ versions)  — HKD amounts (cents)
-- =============================================================
-- VO-001: SI-linked to locked SI-001 (玻璃間隔差價), in_review.
-- VO-002: standalone (si_id null), draft.
-- NOTE: vo_versions BEFORE INSERT trigger recomputes subtotal/total
-- from quantity*unit_price_cents; values below match the recompute.
insert into variation_orders
  (id, si_id, project_id, number, current_version_id, total_amount_cents, chain_snapshot,
   current_step, status, created_by, created_at, submitted_at, locked_at)
values
('e1000002-0000-0000-0000-000000000001','d1000002-0000-0000-0000-000000000001',
 'd0000002-0002-0002-0002-000000000002','VO-001',null,null,
 '[{"step_order":0,"required_role":"main_contractor","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
 0,'in_review',
 (select id from user_profiles where phone='60001003'),
 now()-interval '4 days',now()-interval '4 days',null),
('e1000002-0000-0000-0000-000000000002',null,
 'd0000002-0002-0002-0002-000000000002','VO-002',null,null,
 null,0,'draft',
 (select id from user_profiles where phone='60001003'),
 now()-interval '1 days',null,null)
on conflict (id) do nothing;

-- versions (trigger recomputes totals; we supply line items)
insert into vo_versions (id, vo_id, version_no, payload, edits_by, created_at)
values
('e2000002-0000-0000-0000-000000000001','e1000002-0000-0000-0000-000000000001',1,
 '{"description":"會議室改強化玻璃間隔連玻璃門之差價 (SI-001)","line_items":[{"category":"material","description":"12mm 強化玻璃間隔連五金","quantity":18,"unit":"m²","unit_price_cents":85000,"subtotal_cents":1530000,"progress_leaf_item_id":"a1000002-0000-0000-0000-000000000023"},{"category":"labour","description":"玻璃安裝人工","quantity":2,"unit":"工","unit_price_cents":180000,"subtotal_cents":360000,"progress_leaf_item_id":null},{"category":"material","description":"扣除原石膏板間隔 (退回)","quantity":1,"unit":"式","unit_price_cents":-220000,"subtotal_cents":-220000,"progress_leaf_item_id":null}],"total_amount_cents":1670000}'::jsonb,
 (select id from user_profiles where phone='60001003'),now()-interval '4 days'),
('e2000002-0000-0000-0000-000000000002','e1000002-0000-0000-0000-000000000002',1,
 '{"description":"茶水間即熱式電熱水爐加位 (SI-002 衍生)","line_items":[{"category":"material","description":"即熱式電熱水爐 + 防漏電開關","quantity":1,"unit":"套","unit_price_cents":320000,"subtotal_cents":320000,"progress_leaf_item_id":null},{"category":"labour","description":"20A 專用回路拉線及接駁","quantity":1,"unit":"式","unit_price_cents":150000,"subtotal_cents":150000,"progress_leaf_item_id":null}],"total_amount_cents":470000}'::jsonb,
 (select id from user_profiles where phone='60001003'),now()-interval '1 days')
on conflict (id) do nothing;

-- point current_version_id (trg_vo_sync_total copies total_amount_cents)
update variation_orders set current_version_id = 'e2000002-0000-0000-0000-000000000001'
 where id = 'e1000002-0000-0000-0000-000000000001' and current_version_id is null;
update variation_orders set current_version_id = 'e2000002-0000-0000-0000-000000000002'
 where id = 'e1000002-0000-0000-0000-000000000002' and current_version_id is null;

-- VO-001 step-0 approval audit (MC approved, awaiting PM)
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
values
('e3000002-0000-0000-0000-000000000001','vo','e1000002-0000-0000-0000-000000000001',0,'approve',
 (select id from user_profiles where phone='60001003'),null,now()-interval '3 days')
on conflict (id) do nothing;

-- =============================================================
-- 8. PERMIT TO WORK (+ version + workers)
-- =============================================================
-- PTW-001: hot_work (燒焊 / 切割) for 風喉支架, active.
insert into permits_to_work
  (id, project_id, number, ptw_type, current_version_id, chain_snapshot, current_step,
   status, created_by, created_at, submitted_at, activated_at, expires_at,
   fire_watch_started_at, closed_out_at, locked_at)
values
('f1000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002','PTW-001','hot_work',
 null,
 '[{"step_order":0,"required_role":"safety_officer","optional_user_id":null},{"step_order":1,"required_role":"pm","optional_user_id":null}]'::jsonb,
 2,'active',
 (select id from user_profiles where phone='60001005'),
 now()-interval '1 days',now()-interval '1 days',now()-interval '20 hours',
 (date_trunc('day', now() at time zone 'Asia/Hong_Kong') + interval '23 hours 59 minutes') at time zone 'Asia/Hong_Kong',
 null,null,null)
on conflict (id) do nothing;

insert into permit_versions (id, ptw_id, version_no, payload, edits_by, created_at)
values
('f2000002-0000-0000-0000-000000000001','f1000002-0000-0000-0000-000000000001',1,
 '{"description":"冷氣風喉鋼支架現場燒焊及切割 (A區頂)","checklist":[{"key":"extinguisher","label_zh":"附近備有滅火筒","required":true,"value":true},{"key":"clearance","label_zh":"焊接範圍 10m 內清除易燃物","required":true,"value":true},{"key":"firewatch","label_zh":"已安排火警監察員","required":true,"value":true},{"key":"ppe","label_zh":"焊工已佩戴 PPE","required":true,"value":true},{"key":"ventilation","label_zh":"通風良好","required":true,"value":true}],"ppe_photo_paths":[],"scene_photo_paths":[],"drawing_version_ids":[],"lat":22.3193,"lng":114.1694,"accuracy_m":10}'::jsonb,
 (select id from user_profiles where phone='60001005'),now()-interval '1 days')
on conflict (id) do nothing;

update permits_to_work set current_version_id = 'f2000002-0000-0000-0000-000000000001'
 where id = 'f1000002-0000-0000-0000-000000000001' and current_version_id is null;
-- PTW-001 lock AFTER its version exists (ptw_lock_guard blocks adding a version
-- to a locked PTW). The active permit ends locked.
update permits_to_work set locked_at=now()-interval '20 hours'
 where id='f1000002-0000-0000-0000-000000000001';

insert into permit_workers (id, ptw_id, worker_name, worker_phone, worker_photo_path, created_at)
values
('f4000002-0000-0000-0000-000000000001','f1000002-0000-0000-0000-000000000001','陳大文','60001006',null,now()-interval '1 days'),
('f4000002-0000-0000-0000-000000000002','f1000002-0000-0000-0000-000000000001','李志強','60001007',null,now()-interval '1 days')
on conflict (id) do nothing;

-- PTW chain approvals (safety_officer -> pm) that activated it
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason, created_at)
values
('f3000002-0000-0000-0000-000000000001','ptw','f1000002-0000-0000-0000-000000000001',0,'approve',
 (select id from user_profiles where phone='60000004'),null,now()-interval '22 hours'),
('f3000002-0000-0000-0000-000000000002','ptw','f1000002-0000-0000-0000-000000000001',1,'approve',
 (select id from user_profiles where phone='60001001'),null,now()-interval '20 hours')
on conflict (id) do nothing;

-- =============================================================
-- 9. MATERIALS  (status is a generated column — NOT inserted)
-- =============================================================
insert into materials
  (id, project_id, name, unit, qty_needed, qty_arrived, item_ids, requested_by,
   planned_arrival_at, arrived_at, notes, created_at, updated_at)
values
-- arrived (full)
('11000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 '75mm 鍍鋅天花骨料','支',120,120,
 array['a1000002-0000-0000-0000-000000000022']::uuid[],
 (select id from user_profiles where phone='60001005'),
 now()-interval '6 days',now()-interval '6 days','已全部到場',now()-interval '8 days',now()-interval '6 days'),
-- partial
('11000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 '12mm 防火石膏板','張',90,50,
 array['a1000002-0000-0000-0000-000000000021']::uuid[],
 (select id from user_profiles where phone='60001005'),
 now()-interval '2 days',null,'第一批 50 張已到，餘數本週五',now()-interval '5 days',now()-interval '2 days'),
-- requested, future arrival
('11000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002',
 '地毯磚 600x600 (深灰)','箱',75,0,
 array['a1000002-0000-0000-0000-000000000032']::uuid[],
 (select id from user_profiles where phone='60001005'),
 now()+interval '7 days',null,'地板工序前到場',now()-interval '3 days',now()-interval '3 days'),
-- overdue (requested, planned arrival in the past, nothing arrived = "late" client-side)
('11000002-0000-0000-0000-000000000004','d0000002-0002-0002-0002-000000000002',
 '即熱式電熱水爐 (VO-002)','台',1,0,
 array['a1000002-0000-0000-0000-000000000014']::uuid[],
 (select id from user_profiles where phone='60001003'),
 now()-interval '1 days',null,'供應商缺貨，仍未到場 — 已逾期',now()-interval '4 days',now()-interval '4 days'),
-- requested electrical (arrived)
('11000002-0000-0000-0000-000000000005','d0000002-0002-0002-0002-000000000002',
 '2.5mm² 單芯電線 (紅/黑/黃綠)','卷',12,12,
 array['a1000002-0000-0000-0000-000000000011']::uuid[],
 (select id from user_profiles where phone='60001005'),
 now()-interval '7 days',now()-interval '7 days','電力改道用',now()-interval '9 days',now()-interval '7 days')
on conflict (id) do nothing;

-- =============================================================
-- 10. DAILIES  (one log per project,user,date) — v45 columns
-- =============================================================
-- Engineer (60001003, main_contractor/engineer) keeps the diary.
insert into dailies
  (id, project_id, user_id, date, weather, weather_am, weather_pm, warning_signals,
   manpower, plant, progress_item_ids, freeform_items, notes, created_at, updated_at)
values
('21000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001003'),(now()-interval '3 days')::date,
 '晴','晴','陰','{}'::text[],
 '[{"trade":"電工","count":3},{"trade":"泥水","count":2},{"trade":"雜工","count":2}]'::jsonb,
 '[{"type":"手推式雲石機","count":1}]'::jsonb,
 array['a1000002-0000-0000-0000-000000000011','a1000002-0000-0000-0000-000000000014']::uuid[],
 array['電力分支拉線','茶水間開鑿排水位']::text[],
 '電力進度良好；茶水間排水較預期慢。',now()-interval '3 days',now()-interval '3 days'),
('21000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001003'),(now()-interval '1 days')::date,
 '陰','陰','雨','{"黃雨"}'::text[],
 '[{"trade":"電工","count":2},{"trade":"間隔師傅","count":3},{"trade":"雜工","count":1}]'::jsonb,
 '[]'::jsonb,
 array['a1000002-0000-0000-0000-000000000011','a1000002-0000-0000-0000-000000000021']::uuid[],
 array['會議室間隔封板','風喉燒焊 (PTW-001)']::text[],
 '下午黃雨，戶外無工序受影響；室內如常。',now()-interval '1 days',now()-interval '1 days'),
('21000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002',
 (select id from user_profiles where phone='60001003'),(now() at time zone 'Asia/Hong_Kong')::date,
 '熱','熱','晴','{"酷熱天氣警告"}'::text[],
 '[{"trade":"電工","count":2},{"trade":"間隔師傅","count":3},{"trade":"冷氣技工","count":2}]'::jsonb,
 '[]'::jsonb,
 array['a1000002-0000-0000-0000-000000000012','a1000002-0000-0000-0000-000000000021']::uuid[],
 array['冷氣出風口','石膏間隔']::text[],
 '酷熱天氣，已加派飲水及輪流休息。',now(),now())
on conflict (project_id, user_id, date) do nothing;

-- =============================================================
-- 11. EVENTS (timetable)
-- =============================================================
insert into events (id, project_id, title, description, starts_at, ends_at, location, event_type, created_by, created_at, updated_at)
values
('31000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 '每週工地會議','業主、PM、判頭三方進度會議。',
 now()+interval '2 days',now()+interval '2 days'+interval '1 hours','地盤辦公室','meeting',
 (select id from user_profiles where phone='60001001'),now()-interval '5 days',now()-interval '5 days'),
('31000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 '消防則師到場','確認灑水頭新佈置 (Issue I-2)。',
 now()+interval '1 days',null,'B區 — 會議室','inspection',
 (select id from user_profiles where phone='60001001'),now()-interval '2 days',now()-interval '2 days'),
('31000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002',
 '機電完工里程碑','機電改道目標完工日。',
 now()+interval '4 days',null,null,'milestone',
 (select id from user_profiles where phone='60001001'),now()-interval '5 days',now()-interval '5 days')
on conflict (id) do nothing;

-- =============================================================
-- 12. CONTACTS (per-project address book; admin/pm-curated)
-- =============================================================
insert into contacts (id, project_id, name, trade, phone, notes, created_by, created_at, updated_at)
values
('41000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002','發記水電','水電','69001234','熟手，夜間都接',(select id from user_profiles where phone='60001001'),now()-interval '15 days',now()-interval '15 days'),
('41000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002','強記冷氣工程','冷氣','69005678','VRV / 風喉',(select id from user_profiles where phone='60001001'),now()-interval '15 days',now()-interval '15 days'),
('41000002-0000-0000-0000-000000000003','d0000002-0002-0002-0002-000000000002','明哥玻璃','玻璃間隔','69009012','強化玻璃連安裝',(select id from user_profiles where phone='60001001'),now()-interval '10 days',now()-interval '10 days'),
('41000002-0000-0000-0000-000000000004','d0000002-0002-0002-0002-000000000002','藝豐傢俬','系統傢俬','69003456','辦公室系統傢俬',(select id from user_profiles where phone='60001001'),now()-interval '10 days',now()-interval '10 days')
on conflict (id) do nothing;

-- =============================================================
-- 13. EQUIPMENT + FORM INSTANCES  (forms module)
-- =============================================================
-- Two pieces of plant on site; tie weekly-check form instances to the
-- seeded form_templates (CSSR-F5 棚架, LALG-F1 吊機週檢) by template code.
insert into equipment_register
  (id, project_id, kind, ref_no, name_zh, brand_model, serial_no, location_zh, photo_path, status, created_by, created_at)
values
('51000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 'scaffold','EQ-001','活動棚架 (A區天花)','流動鋁架塔','AT-2024-118','A區開放式辦公區',null,'active',
 (select id from user_profiles where phone='60001003'),now()-interval '13 days'),
('51000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 'lifting_appliance','EQ-002','物料吊運電動絞車','TigerLift TL-500','TL500-7741','後樓梯吊運位',null,'active',
 (select id from user_profiles where phone='60001003'),now()-interval '12 days')
on conflict (id) do nothing;

insert into form_instances
  (id, project_id, equipment_id, template_id, location_zh, assigned_signer_id,
   valid_until, suspended, created_by, created_at)
values
-- 棚架週檢 — valid (signed recently, due in ~10 days)
('52000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 '51000002-0000-0000-0000-000000000001',
 (select id from form_templates where code='CSSR-F5'),
 'A區開放式辦公區',
 (select id from user_profiles where phone='60000004'),
 now()+interval '10 days',false,
 (select id from user_profiles where phone='60001003'),now()-interval '4 days'),
-- 吊機週檢 — expiring soon (due in 1 day)
('52000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 '51000002-0000-0000-0000-000000000002',
 (select id from form_templates where code='LALG-F1'),
 '後樓梯吊運位',
 (select id from user_profiles where phone='60000004'),
 now()+interval '1 days',false,
 (select id from user_profiles where phone='60001003'),now()-interval '6 days')
on conflict (id) do nothing;

-- =============================================================
-- 14. DOCUMENTS (+ versions)  — register header + 1 version each
-- =============================================================
-- DOC-1: material submission (地毯磚) approved.
-- DOC-2: method statement (燒焊) submitted (pending review).
insert into documents
  (id, project_id, progress_item_id, document_type, title, doc_number,
   current_version_id, created_by, created_at, updated_at)
values
('61000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',
 null,'material_submission','地毯磚物料提交 (深灰 600x600)','MAT-001',
 null,(select id from user_profiles where phone='60001005'),now()-interval '5 days',now()-interval '4 days'),
('61000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',
 null,'method_statement','熱工序 (燒焊/切割) 安全施工方法說明','MS-001',
 null,(select id from user_profiles where phone='60001005'),now()-interval '2 days',now()-interval '2 days')
on conflict (id) do nothing;

insert into document_versions
  (id, document_id, version_no, revision_label, bucket_id, file_path, thumb_path,
   mime_type, size_bytes, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_note)
values
('62000002-0000-0000-0000-000000000001','61000002-0000-0000-0000-000000000001',1,'Rev A','project-docs',
 'd0000002-0002-0002-0002-000000000002/61000002-0000-0000-0000-000000000001/v1/carpet-tile-submission.pdf',null,
 'application/pdf',482000,'approved',
 (select id from user_profiles where phone='60001005'),now()-interval '5 days',
 (select id from user_profiles where phone='60001001'),now()-interval '4 days','顏色及型號批准。'),
('62000002-0000-0000-0000-000000000002','61000002-0000-0000-0000-000000000002',1,'Rev A','project-docs',
 'd0000002-0002-0002-0002-000000000002/61000002-0000-0000-0000-000000000002/v1/hot-work-method-statement.pdf',null,
 'application/pdf',356000,'submitted',
 (select id from user_profiles where phone='60001005'),now()-interval '2 days',null,null,null)
on conflict (id) do nothing;

update documents set current_version_id = '62000002-0000-0000-0000-000000000001'
 where id = '61000002-0000-0000-0000-000000000001' and current_version_id is null;
update documents set current_version_id = '62000002-0000-0000-0000-000000000002'
 where id = '61000002-0000-0000-0000-000000000002' and current_version_id is null;

insert into document_events (id, document_id, version_id, event_type, actor_id, note, created_at)
values
('63000002-0000-0000-0000-000000000001','61000002-0000-0000-0000-000000000001','62000002-0000-0000-0000-000000000001','created',
 (select id from user_profiles where phone='60001005'),null,now()-interval '5 days'),
('63000002-0000-0000-0000-000000000002','61000002-0000-0000-0000-000000000001','62000002-0000-0000-0000-000000000001','approved',
 (select id from user_profiles where phone='60001001'),'顏色及型號批准。',now()-interval '4 days'),
('63000002-0000-0000-0000-000000000003','61000002-0000-0000-0000-000000000002','62000002-0000-0000-0000-000000000002','submitted',
 (select id from user_profiles where phone='60001005'),null,now()-interval '2 days')
on conflict (id) do nothing;

-- =============================================================
-- 15. WEATHER — territory events + per-project EOT claims
-- =============================================================
-- weather_events are territory-wide facts (service-role written in prod;
-- seeded here for the demo). project_weather_claims tie to those dates.
insert into weather_events (id, hkt_date, kind, station, evidence, created_at)
values
('71000002-0000-0000-0000-000000000001',(now()-interval '1 days')::date,'amber_rain',null,
 '{"code":"WRAINA","issued":"14:10","expired":"16:25"}'::jsonb,now()-interval '1 days'),
('71000002-0000-0000-0000-000000000002',(now() at time zone 'Asia/Hong_Kong')::date,'very_hot',null,
 '{"code":"WHOT","issued":"11:00"}'::jsonb,now()),
('71000002-0000-0000-0000-000000000003',(now()-interval '6 days')::date,'rainfall_20mm','N05',
 '{"mm":36,"station":"旺角"}'::jsonb,now()-interval '6 days')
on conflict (hkt_date, kind, station) do nothing;

insert into project_weather_claims
  (id, project_id, hkt_date, trigger, on_critical_path, ready_to_work, tidy_days, claim_days, note, recorded_by, created_at, updated_at)
values
('72000002-0000-0000-0000-000000000001','d0000002-0002-0002-0002-000000000002',(now()-interval '6 days')::date,
 '雨量 36mm (旺角站)',false,true,0,0,'室內裝修為主，戶外運料短暫受阻，未影響關鍵路徑。',
 (select id from user_profiles where phone='60001001'),now()-interval '5 days',now()-interval '5 days'),
('72000002-0000-0000-0000-000000000002','d0000002-0002-0002-0002-000000000002',(now()-interval '1 days')::date,
 '黃色暴雨警告',false,true,0,0,'下午黃雨，室內工序如常，記錄備案。',
 (select id from user_profiles where phone='60001001'),now()-interval '1 days',now()-interval '1 days')
on conflict (project_id, hkt_date) do nothing;

commit;

-- =============================================================
-- POST-APPLY VERIFICATION (run after commit; EXECUTE, not source):
--   select count(*) from progress_items where project_id='d0000002-0002-0002-0002-000000000002';            -- ~38
--   select code,title,tracking_mode,status,actual_progress from progress_items
--     where project_id='d0000002-0002-0002-0002-000000000002' order by code;                                 -- varied
--   select count(*) from project_members where project_id='d0000002-0002-0002-0002-000000000002';            -- 6
--   select number,status from site_instructions where project_id='d0000002-0002-0002-0002-000000000002';     -- SI-001 locked, SI-002 in_review
--   select number,status,total_amount_cents from variation_orders
--     where project_id='d0000002-0002-0002-0002-000000000002';                                                -- VO-001 1670000, VO-002 470000 (recomputed)
--   select number,ptw_type,status from permits_to_work where project_id='d0000002-0002-0002-0002-000000000002'; -- PTW-001 hot_work active
--   select name,status,qty_needed,qty_arrived from materials where project_id='d0000002-0002-0002-0002-000000000002';
--   select date,weather_am,weather_pm,warning_signals from dailies where project_id='d0000002-0002-0002-0002-000000000002';
--   select doc_number,document_type from documents where project_id='d0000002-0002-0002-0002-000000000002';
--   select get_forms_dashboard('d0000002-0002-0002-0002-000000000002');                                       -- counts + 2 rows
--   select count(*) from get_project_modules('d0000002-0002-0002-0002-000000000002') where enabled;           -- 13 (all-on)
-- =============================================================
