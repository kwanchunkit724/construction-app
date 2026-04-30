/**
 * Demo Simulation Seed Script
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<your_key> node scripts/seed-demos.js
 *
 * Get your service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role key
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://syyntodkvexkbpjrskjj.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: Set SUPABASE_SERVICE_ROLE_KEY environment variable first.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASS = 'Demo@2026'

// ── Permissions ───────────────────────────────────────────────────────────────
const OWNER_PERMS    = ['view:all','view:dashboard','view:costs','view:progress','view:safety','approve:diary','approve:materials','approve:valuation']
const MC_FULL_PERMS  = ['view:all','manage:issues','submit:reports','approve:reports','update:progress','view:progress','manage:safety','approve:ptw','reject:ptw','manage:drawings','view:costs','manage:boq','manage:vo','create:ncr','close:ncr','approve:materials','manage:ptw','assign:tasks']
const MC_PERMS       = ['view:all','manage:issues','submit:reports','update:progress','view:progress','manage:safety','approve:ptw','manage:drawings','view:costs','create:ncr','approve:materials','manage:ptw']
const SUB_PERMS      = ['report:issues','update:progress','view:delegated-items','request:materials','submit:reports','view:own-tasks','create:safety-obs','manage:ptw']

// ── Helper ────────────────────────────────────────────────────────────────────
async function createUser(email, password, profile) {
  let userId = null
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: profile.name },
  })
  if (error) {
    // User already exists — look up their ID from profiles
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', profile.username).single()
    if (existing) { userId = existing.id; console.log(`  ↺ ${profile.name} (${profile.username}) already exists`) }
    else { console.warn(`  ⚠ ${email}: ${error.message}`); return null }
  } else {
    userId = data.user.id
  }
  await supabase.from('profiles').upsert({
    id: userId, username: profile.username, name: profile.name,
    role: profile.role, role_zh: profile.roleZh, trade: profile.trade,
    company: profile.company, avatar: profile.name.slice(0, 1),
    project_id: profile.projectId, approved: true,
    permissions: profile.permissions,
  })
  if (!error) console.log(`  ✓ ${profile.name} (${profile.username}) → ${profile.role}`)
  return userId
}

async function insert(table, rows) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (error) console.warn(`  ⚠ ${table}: ${error.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCENARIO 1 — SHORT-TERM  灣仔辦公室翻新  (4 months, now at Month 2)
// ─────────────────────────────────────────────────────────────────────────────
async function seedShort() {
  console.log('\n📋 Scenario 1: SHORT-TERM — 灣仔辦公室翻新工程 (4 months)')
  const PID = 'DEMO-SHORT-001'

  // Users
  const ownerId = await createUser('owner.short@kwanchunkit.app', PASS, {
    username:'owner.short', name:'劉業主', role:'owner', roleZh:'業主',
    trade:'業主代表', company:'灣仔發展有限公司', projectId:PID, permissions:OWNER_PERMS,
  })
  const pmId = await createUser('pm.short@kwanchunkit.app', PASS, {
    username:'pm.short', name:'陳文輝', role:'main-contractor', roleZh:'總承建商',
    trade:'項目總監', company:'關春傑工程', projectId:PID, permissions:MC_FULL_PERMS,
  })
  const sub1Id = await createUser('sub1.short@kwanchunkit.app', PASS, {
    username:'sub1.short', name:'鄭電氣', role:'sub-contractor', roleZh:'判頭',
    trade:'電氣判頭', company:'正達電氣工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub2Id = await createUser('sub2.short@kwanchunkit.app', PASS, {
    username:'sub2.short', name:'梁鋁窗', role:'sub-contractor', roleZh:'判頭',
    trade:'鋁窗判頭', company:'美達鋁窗工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub3Id = await createUser('sub3.short@kwanchunkit.app', PASS, {
    username:'sub3.short', name:'何裝修', role:'sub-contractor', roleZh:'判頭',
    trade:'裝修判頭', company:'精美裝修工程', projectId:PID, permissions:SUB_PERMS,
  })

  if (!pmId) { console.warn('Skipping Short scenario data (PM creation failed)'); return }

  // Project
  await supabase.from('projects').upsert({
    id: PID, name: '灣仔商業辦公室翻新工程', description: '灣仔商業中心 8樓整層辦公室翻新，包括拆卸、電氣、鋁窗及裝修工程',
    created_by: pmId, status: 'active', project_type: 'renovation',
    num_blocks: 1, has_basement: false, num_basement_levels: 0,
    zones: [{ id:'ZA', name:'辦公區', type:'podium' },{ id:'ZB', name:'接待區', type:'podium' }],
    enabled_modules: ['progress','issues','safety','diary','materials','documents','qc','procurement'],
    assigned_pm_ids: [pmId],
    client: '灣仔發展有限公司', start_date: '2026-03-01', target_end_date: '2026-06-30',
    contract_value: 3200000, site_address: '香港灣仔皇后大道東商業中心8樓',
  })

  // Progress items
  const now = new Date().toISOString()
  await insert('progress_items', [
    { id:'PSH-1', project_id:PID, code:'A', title:'拆卸工程', zone:'辦公區', parent_id:null, level:1,
      planned_start:'2026-03-01', planned_end:'2026-03-21', planned_progress:100, actual_progress:100,
      status:'completed', owned_by:[pmId], delegated_to:[sub3Id], notes:'已完成',
      last_updated_by:'陳文輝', last_updated_at:now, tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PSH-2', project_id:PID, code:'B', title:'電氣粗裝工程', zone:'辦公區', parent_id:null, level:1,
      planned_start:'2026-03-15', planned_end:'2026-04-30', planned_progress:80, actual_progress:65,
      status:'in-progress', owned_by:[pmId], delegated_to:[sub1Id], notes:'線管已完成，電線拉線進行中',
      last_updated_by:'鄭電氣', last_updated_at:now, tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PSH-3', project_id:PID, code:'C', title:'鋁窗工程', zone:'辦公區', parent_id:null, level:1,
      planned_start:'2026-04-01', planned_end:'2026-05-15', planned_progress:30, actual_progress:20,
      status:'in-progress', owned_by:[pmId], delegated_to:[sub2Id], notes:'框架安裝中，玻璃待訂',
      last_updated_by:'梁鋁窗', last_updated_at:now, tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PSH-4', project_id:PID, code:'D', title:'裝修工程', zone:'辦公區', parent_id:null, level:1,
      planned_start:'2026-05-01', planned_end:'2026-06-20', planned_progress:0, actual_progress:0,
      status:'not-started', owned_by:[pmId], delegated_to:[sub3Id], notes:'待電氣完成後開始',
      last_updated_by:'陳文輝', last_updated_at:now, tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
  ])

  // Issues
  await insert('issues', [
    { id:'ISH-001', project_id:PID, category:'質量問題', severity:'serious', location:'辦公區B-12',
      drawing_ref:'E-101', description:'電線管彎曲半徑不符合規格，需重新安裝',
      submitted_by:sub1Id, submitted_by_name:'鄭電氣', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-20T09:30:00', status:'open', comments:[], notify_ids:[pmId],
      photos:[], current_tier:'foreman-pe' },
    { id:'ISH-002', project_id:PID, category:'進度問題', severity:'normal', location:'接待區',
      drawing_ref:'', description:'鋁窗玻璃貨期延誤，預計延遲2週到貨',
      submitted_by:sub2Id, submitted_by_name:'梁鋁窗', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-22T14:00:00', status:'in-progress', comments:[], notify_ids:[pmId,ownerId],
      photos:[], current_tier:'pm' },
  ])

  // PTW
  await insert('ptw_requests', [
    { id:'PTW-SH-001', project_id:PID, ptw_no:'PTW-2026-001', work_type:'高空作業', location:'辦公區天花',
      zone:'辦公區', description:'安裝天花燈槽及電氣線槽', hazards:['墮落','觸電'],
      required_ppe:['安全帶','安全帽','絕緣手套'], requested_by:sub1Id, requested_by_name:'鄭電氣',
      requested_at:'2026-04-28T08:00:00', start_time:'2026-04-29T08:00:00', end_time:'2026-04-29T17:00:00',
      risk_level:'medium', status:'pending', acknowledged_by:[] },
  ])

  // Diary
  await insert('daily_diaries', [
    { id:'DDY-SH-001', project_id:PID, date:'2026-04-28', author_id:sub1Id, author_name:'鄭電氣',
      zone:'辦公區', weather:'sunny', temperature:28, manpower_total:6, equipment:'升降台×1',
      work_done:'完成B區電線管安裝80%，開始C區線管布設', issues_text:'部分位置因結構問題需改路', status:'submitted' },
    { id:'DDY-SH-002', project_id:PID, date:'2026-04-27', author_id:sub3Id, author_name:'何裝修',
      zone:'接待區', weather:'cloudy', temperature:26, manpower_total:4, equipment:'',
      work_done:'完成接待區地面找平工作，批盪共 45㎡', issues_text:'', status:'submitted' },
  ])

  // NCR
  await insert('ncrs', [
    { id:'NCR-SH-001', project_id:PID, ncr_no:'NCR-2026-001', date:'2026-04-21',
      raised_by:pmId, raised_by_name:'陳文輝', zone:'辦公區',
      work_item:'電氣線管安裝', description:'線管彎曲半徑小於規定最小值（4倍管徑），不符合BS 7671要求',
      severity:'major', photos:[], status:'corrective-action',
      corrective_action:'移除不合格線管，重新安裝符合規格彎頭', corrective_action_by:'鄭電氣',
      corrective_due_date:'2026-05-05' },
  ])

  // BOQ
  await insert('boq_items', [
    { id:'BOQ-SH-01', project_id:PID, code:'1.1', description:'拆卸及清理工程', unit:'項', contract_qty:1, rate:180000, contract_amount:180000, completed_qty:1, completed_amount:180000 },
    { id:'BOQ-SH-02', project_id:PID, code:'2.1', description:'電氣粗裝工程（線管、配電箱）', unit:'項', contract_qty:1, rate:520000, contract_amount:520000, completed_qty:0.65, completed_amount:338000 },
    { id:'BOQ-SH-03', project_id:PID, code:'2.2', description:'電氣細裝工程（燈具、插座）', unit:'項', contract_qty:1, rate:280000, contract_amount:280000, completed_qty:0, completed_amount:0 },
    { id:'BOQ-SH-04', project_id:PID, code:'3.1', description:'鋁窗及玻璃工程', unit:'項', contract_qty:1, rate:620000, contract_amount:620000, completed_qty:0.2, completed_amount:124000 },
    { id:'BOQ-SH-05', project_id:PID, code:'4.1', description:'輕鋼架天花工程', unit:'㎡', contract_qty:450, rate:380, contract_amount:171000, completed_qty:0, completed_amount:0 },
    { id:'BOQ-SH-06', project_id:PID, code:'4.2', description:'地板工程（工程磚）', unit:'㎡', contract_qty:380, rate:420, contract_amount:159600, completed_qty:0, completed_amount:0 },
    { id:'BOQ-SH-07', project_id:PID, code:'4.3', description:'油漆及批盪工程', unit:'㎡', contract_qty:1200, rate:85, contract_amount:102000, completed_qty:180, completed_amount:15300 },
  ])

  // VO
  await insert('variation_orders', [
    { id:'VO-SH-001', project_id:PID, vo_no:'VO-2026-001', description:'業主要求新增接待枱獨立電路',
      raised_by:pmId, raised_by_name:'陳文輝', raised_at:'2026-04-15T10:00:00',
      amount:28000, type:'addition', status:'approved', approved_by:'劉業主', approved_at:'2026-04-18T14:00:00' },
    { id:'VO-SH-002', project_id:PID, vo_no:'VO-2026-002', description:'刪減部分隔間牆工程（業主自行處理）',
      raised_by:pmId, raised_by_name:'陳文輝', raised_at:'2026-04-25T09:00:00',
      amount:45000, type:'omission', status:'submitted' },
  ])

  // Drawings
  await insert('drawings', [
    { id:'DRW-SH-01', project_id:PID, drawing_no:'E-101', title:'8/F 電氣總平面圖', revision:'B',
      issue_date:'2026-03-10', discipline:'mep', status:'current' },
    { id:'DRW-SH-02', project_id:PID, drawing_no:'A-101', title:'8/F 平面佈置圖', revision:'C',
      issue_date:'2026-02-28', discipline:'architectural', status:'current' },
    { id:'DRW-SH-03', project_id:PID, drawing_no:'A-102', title:'8/F 天花佈置圖', revision:'A',
      issue_date:'2026-02-28', discipline:'architectural', status:'under-review' },
  ])

  // Material requests
  await insert('material_requests', [
    { id:'MAT-SH-001', project_id:PID, request_no:'MR-2026-001', requested_by:sub1Id,
      requested_by_name:'鄭電氣', requested_by_role:'sub-contractor', requested_at:'2026-04-26T09:00:00',
      zone:'辦公區', items:[{ material:'PVC線管 20mm', unit:'m', quantity:200, urgency:'normal' },
        { material:'電線 2.5mm² 三芯', unit:'m', quantity:500, urgency:'normal' }],
      status:'approved', notes:'', approved_by:'陳文輝' },
  ])

  console.log('  ✅ Short-term scenario seeded successfully')
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCENARIO 2 — MID-TERM  沙田社區中心翻新擴建  (9 months, now at Month 4)
// ─────────────────────────────────────────────────────────────────────────────
async function seedMid() {
  console.log('\n🏗 Scenario 2: MID-TERM — 沙田社區中心翻新擴建工程 (9 months)')
  const PID = 'DEMO-MID-001'

  const own1Id = await createUser('owner1.mid@kwanchunkit.app', PASS, {
    username:'owner1.mid', name:'孫業主', role:'owner', roleZh:'業主',
    trade:'業主代表', company:'沙田區民政事務處', projectId:PID, permissions:OWNER_PERMS,
  })
  const own2Id = await createUser('owner2.mid@kwanchunkit.app', PASS, {
    username:'owner2.mid', name:'張工程師代表', role:'owner', roleZh:'業主',
    trade:'授權工程師', company:'啟誠工程顧問', projectId:PID, permissions:OWNER_PERMS,
  })
  const pmId = await createUser('pm.mid@kwanchunkit.app', PASS, {
    username:'pm.mid', name:'李建文', role:'main-contractor', roleZh:'總承建商',
    trade:'項目總監', company:'關春傑工程', projectId:PID, permissions:MC_FULL_PERMS,
  })
  const peId = await createUser('pe.mid@kwanchunkit.app', PASS, {
    username:'pe.mid', name:'王工程師', role:'main-contractor', roleZh:'總承建商',
    trade:'工地工程師', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const qsId = await createUser('qs.mid@kwanchunkit.app', PASS, {
    username:'qs.mid', name:'劉量師', role:'main-contractor', roleZh:'總承建商',
    trade:'工料測量師', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const safetyId = await createUser('safety.mid@kwanchunkit.app', PASS, {
    username:'safety.mid', name:'謝安全', role:'main-contractor', roleZh:'總承建商',
    trade:'安全主任', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const sub1Id = await createUser('sub1.mid@kwanchunkit.app', PASS, {
    username:'sub1.mid', name:'黃鋼鐵', role:'sub-contractor', roleZh:'判頭',
    trade:'結構鋼判頭', company:'信達鋼鐵工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub2Id = await createUser('sub2.mid@kwanchunkit.app', PASS, {
    username:'sub2.mid', name:'趙機電', role:'sub-contractor', roleZh:'判頭',
    trade:'機電判頭', company:'寶盛機電工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub3Id = await createUser('sub3.mid@kwanchunkit.app', PASS, {
    username:'sub3.mid', name:'周裝修', role:'sub-contractor', roleZh:'判頭',
    trade:'裝修判頭', company:'美誠裝修工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub4Id = await createUser('sub4.mid@kwanchunkit.app', PASS, {
    username:'sub4.mid', name:'馮外牆', role:'sub-contractor', roleZh:'判頭',
    trade:'外牆判頭', company:'卓越外牆工程', projectId:PID, permissions:SUB_PERMS,
  })

  if (!pmId) { console.warn('Skipping Mid scenario data'); return }

  await supabase.from('projects').upsert({
    id: PID, name: '沙田社區中心翻新擴建工程',
    description: '沙田社區中心全面翻新，包括結構加固、機電更換、外牆翻新及室內裝修',
    created_by: pmId, status: 'active', project_type: 'renovation',
    num_blocks: 1, has_basement: true, num_basement_levels: 1,
    zones: [
      { id:'ZA', name:'主樓 (地下至3樓)', type:'podium' },
      { id:'ZB', name:'擴建翼 (地下至2樓)', type:'podium' },
      { id:'ZC', name:'地庫停車場', type:'basement' },
    ],
    enabled_modules: ['progress','issues','safety','diary','materials','documents','qc','procurement'],
    assigned_pm_ids: [pmId, peId],
    client: '沙田區民政事務處', start_date: '2025-12-01', target_end_date: '2026-08-31',
    contract_value: 22000000, site_address: '新界沙田社區中心',
  })

  const now = new Date().toISOString()
  await insert('progress_items', [
    // Level 1 roots
    { id:'PMD-1', project_id:PID, code:'1', title:'結構加固工程', zone:'主樓', parent_id:null, level:1,
      planned_start:'2025-12-01', planned_end:'2026-03-31', planned_progress:100, actual_progress:90,
      status:'in-progress', owned_by:[pmId,peId], delegated_to:[sub1Id],
      notes:'地下至1樓完成，2樓進行中', last_updated_by:'黃鋼鐵', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PMD-2', project_id:PID, code:'2', title:'機電更換工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-01-15', planned_end:'2026-07-31', planned_progress:45, actual_progress:38,
      status:'in-progress', owned_by:[pmId,peId], delegated_to:[sub2Id],
      notes:'主電箱已更換，支路進行中', last_updated_by:'趙機電', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PMD-3', project_id:PID, code:'3', title:'外牆翻新工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-03-01', planned_end:'2026-06-30', planned_progress:25, actual_progress:15,
      status:'in-progress', owned_by:[pmId], delegated_to:[sub4Id],
      notes:'外牆搭棚完成，清洗工作進行中', last_updated_by:'馮外牆', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PMD-4', project_id:PID, code:'4', title:'室內裝修工程', zone:'主樓', parent_id:null, level:1,
      planned_start:'2026-04-01', planned_end:'2026-08-20', planned_progress:5, actual_progress:0,
      status:'not-started', owned_by:[pmId], delegated_to:[sub3Id],
      notes:'待結構及機電粗裝完成後開始', last_updated_by:'李建文', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    // Level 2 — sub-items under 結構
    { id:'PMD-1-1', project_id:PID, code:'1.1', title:'地下層結構加固', zone:'主樓', parent_id:'PMD-1', level:2,
      planned_start:'2025-12-01', planned_end:'2026-01-31', planned_progress:100, actual_progress:100,
      status:'completed', owned_by:[peId], delegated_to:[sub1Id],
      notes:'已完成並通過驗收', last_updated_by:'王工程師', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PMD-1-2', project_id:PID, code:'1.2', title:'1-2樓結構加固', zone:'主樓', parent_id:'PMD-1', level:2,
      planned_start:'2026-02-01', planned_end:'2026-04-30', planned_progress:80, actual_progress:70,
      status:'in-progress', owned_by:[peId], delegated_to:[sub1Id],
      notes:'1樓完成，2樓進行中', last_updated_by:'黃鋼鐵', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
  ])

  await insert('issues', [
    { id:'IMD-001', project_id:PID, category:'安全隱患', severity:'urgent', location:'2樓走廊',
      drawing_ref:'S-201', description:'發現樓板裂縫寬度超過0.3mm，懷疑結構問題，需即時評估',
      submitted_by:sub1Id, submitted_by_name:'黃鋼鐵', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-27T11:00:00', status:'open', comments:[], notify_ids:[pmId,peId,own2Id],
      photos:[], current_tier:'pm' },
    { id:'IMD-002', project_id:PID, category:'圖則問題', severity:'serious', location:'擴建翼地下',
      drawing_ref:'M-101', description:'機電圖則尺寸與現場不符，需設計師澄清',
      submitted_by:sub2Id, submitted_by_name:'趙機電', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-25T14:30:00', status:'in-progress', comments:[], notify_ids:[pmId,peId],
      photos:[], current_tier:'foreman-pe' },
    { id:'IMD-003', project_id:PID, category:'物料問題', severity:'normal', location:'地庫',
      drawing_ref:'', description:'電纜橋架規格與BOQ不符，供應商送錯型號',
      submitted_by:sub2Id, submitted_by_name:'趙機電', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-24T09:00:00', status:'resolved', comments:[], notify_ids:[pmId],
      photos:[], current_tier:'pm' },
    { id:'IMD-004', project_id:PID, category:'進度問題', severity:'normal', location:'外牆',
      drawing_ref:'', description:'外牆棚架搭建因天氣延誤，影響外牆清洗工作',
      submitted_by:sub4Id, submitted_by_name:'馮外牆', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-22T16:00:00', status:'closed', comments:[], notify_ids:[pmId],
      photos:[], current_tier:'pm' },
  ])

  await insert('ptw_requests', [
    { id:'PTW-MD-001', project_id:PID, ptw_no:'PTW-2026-011', work_type:'有限空間作業', location:'地庫泵房',
      zone:'地庫', description:'更換污水泵及管道', hazards:['缺氧','有毒氣體','溺水'],
      required_ppe:['呼吸器','防水服','安全繩'], requested_by:sub2Id, requested_by_name:'趙機電',
      requested_at:'2026-04-28T07:30:00', start_time:'2026-04-29T09:00:00', end_time:'2026-04-29T16:00:00',
      risk_level:'high', status:'pending', acknowledged_by:[] },
    { id:'PTW-MD-002', project_id:PID, ptw_no:'PTW-2026-010', work_type:'高空作業', location:'外牆棚架',
      zone:'全棟', description:'外牆清洗及修補', hazards:['墮落','強風'],
      required_ppe:['安全帶','安全帽'], requested_by:sub4Id, requested_by_name:'馮外牆',
      requested_at:'2026-04-26T08:00:00', start_time:'2026-04-26T09:00:00', end_time:'2026-04-26T17:00:00',
      risk_level:'high', status:'approved', approved_by:safetyId, approved_by_name:'謝安全',
      approved_at:'2026-04-26T08:45:00', acknowledged_by:[sub4Id] },
    { id:'PTW-MD-003', project_id:PID, ptw_no:'PTW-2026-009', work_type:'熱作業', location:'1樓機房',
      zone:'主樓', description:'焊接鋼結構加固件', hazards:['火災','灼傷','煙霧'],
      required_ppe:['焊接面罩','防火手套','阻燃工作服'], requested_by:sub1Id, requested_by_name:'黃鋼鐵',
      requested_at:'2026-04-25T07:00:00', start_time:'2026-04-25T09:00:00', end_time:'2026-04-25T17:00:00',
      risk_level:'medium', status:'completed', approved_by:safetyId, approved_by_name:'謝安全',
      approved_at:'2026-04-25T08:30:00', acknowledged_by:[sub1Id] },
  ])

  await insert('toolbox_talks', [
    { id:'TBT-MD-001', project_id:PID, date:'2026-04-28', conducted_by:safetyId,
      conducted_by_name:'謝安全', topic:'有限空間作業安全', attendee_names:['趙機電','李助手1','李助手2','陳工人1'],
      duration:20, notes:'強調進入前必須測氣' },
    { id:'TBT-MD-002', project_id:PID, date:'2026-04-21', conducted_by:safetyId,
      conducted_by_name:'謝安全', topic:'高空作業與安全帶使用', attendee_names:['馮外牆','馮助手1','馮助手2','馮助手3'],
      duration:15, notes:'現場演示正確佩戴方法' },
  ])

  await insert('daily_diaries', [
    { id:'DDY-MD-001', project_id:PID, date:'2026-04-28', author_id:sub1Id, author_name:'黃鋼鐵',
      zone:'主樓', weather:'cloudy', temperature:25, manpower_total:12,
      equipment:'焊接機×2, 切割機×1',
      work_done:'2樓東翼結構鋼柱焊接完成8支，鋼梁安裝進行中', issues_text:'2樓發現裂縫，已上報PM', status:'submitted' },
    { id:'DDY-MD-002', project_id:PID, date:'2026-04-28', author_id:sub2Id, author_name:'趙機電',
      zone:'全棟', weather:'cloudy', temperature:25, manpower_total:8,
      equipment:'線管彎管機×1',
      work_done:'地下至1樓電纜橋架安裝完成，2樓橋架開始安裝', issues_text:'', status:'submitted' },
    { id:'DDY-MD-003', project_id:PID, date:'2026-04-27', author_id:sub4Id, author_name:'馮外牆',
      zone:'全棟', weather:'sunny', temperature:27, manpower_total:10,
      equipment:'高壓清洗機×2',
      work_done:'南面外牆高壓清洗完成，共約300㎡', issues_text:'', status:'submitted' },
  ])

  await insert('ncrs', [
    { id:'NCR-MD-001', project_id:PID, ncr_no:'NCR-2026-011', date:'2026-04-20',
      raised_by:peId, raised_by_name:'王工程師', zone:'地下',
      work_item:'混凝土修補', description:'地下室混凝土裂縫修補未使用指定環氧樹脂，使用普通水泥填補',
      severity:'major', photos:[], status:'corrective-action',
      corrective_action:'鑿去現有填補物，以Sika环氧树脂重新修補', corrective_action_by:'黃鋼鐵',
      corrective_due_date:'2026-05-10' },
    { id:'NCR-MD-002', project_id:PID, ncr_no:'NCR-2026-012', date:'2026-04-27',
      raised_by:peId, raised_by_name:'王工程師', zone:'主樓2樓',
      work_item:'鋼結構焊接', description:'焊縫外觀檢查不合格，有氣孔及未熔合現象',
      severity:'critical', photos:[], status:'open' },
  ])

  await insert('boq_items', [
    { id:'BOQ-MD-01', project_id:PID, code:'1.1', description:'結構鋼加固工程', unit:'噸', contract_qty:45, rate:18000, contract_amount:810000, completed_qty:36, completed_amount:648000 },
    { id:'BOQ-MD-02', project_id:PID, code:'1.2', description:'混凝土修補及加固', unit:'㎡', contract_qty:800, rate:650, contract_amount:520000, completed_qty:680, completed_amount:442000 },
    { id:'BOQ-MD-03', project_id:PID, code:'2.1', description:'高壓電纜更換', unit:'m', contract_qty:500, rate:1200, contract_amount:600000, completed_qty:350, completed_amount:420000 },
    { id:'BOQ-MD-04', project_id:PID, code:'2.2', description:'配電系統更換', unit:'套', contract_qty:3, rate:380000, contract_amount:1140000, completed_qty:2, completed_amount:760000 },
    { id:'BOQ-MD-05', project_id:PID, code:'2.3', description:'消防系統更新', unit:'項', contract_qty:1, rate:850000, contract_amount:850000, completed_qty:0.3, completed_amount:255000 },
    { id:'BOQ-MD-06', project_id:PID, code:'3.1', description:'外牆清洗及修補', unit:'㎡', contract_qty:2800, rate:180, contract_amount:504000, completed_qty:600, completed_amount:108000 },
    { id:'BOQ-MD-07', project_id:PID, code:'3.2', description:'外牆防水塗料', unit:'㎡', contract_qty:2800, rate:220, contract_amount:616000, completed_qty:0, completed_amount:0 },
    { id:'BOQ-MD-08', project_id:PID, code:'4.1', description:'室內裝修工程（地下至3樓）', unit:'㎡', contract_qty:3200, rate:1800, contract_amount:5760000, completed_qty:0, completed_amount:0 },
  ])

  await insert('variation_orders', [
    { id:'VO-MD-001', project_id:PID, vo_no:'VO-2026-011', description:'增加2樓結構加固範圍（新發現裂縫位置）',
      raised_by:pmId, raised_by_name:'李建文', raised_at:'2026-04-28T15:00:00',
      amount:185000, type:'addition', status:'submitted' },
    { id:'VO-MD-002', project_id:PID, vo_no:'VO-2026-010', description:'業主要求增設兒童活動室隔音設施',
      raised_by:pmId, raised_by_name:'李建文', raised_at:'2026-04-15T10:00:00',
      amount:92000, type:'addition', status:'approved', approved_by:'孫業主', approved_at:'2026-04-20T11:00:00' },
    { id:'VO-MD-003', project_id:PID, vo_no:'VO-2026-009', description:'刪減2樓部分內牆裝修（業主改變用途）',
      raised_by:pmId, raised_by_name:'李建文', raised_at:'2026-04-10T09:00:00',
      amount:68000, type:'omission', status:'approved', approved_by:'孫業主', approved_at:'2026-04-12T14:00:00' },
  ])

  await insert('drawings', [
    { id:'DRW-MD-01', project_id:PID, drawing_no:'S-101', title:'地下層結構加固平面圖', revision:'C', issue_date:'2026-01-15', discipline:'structural', status:'current' },
    { id:'DRW-MD-02', project_id:PID, drawing_no:'S-201', title:'1-2樓結構加固平面圖', revision:'B', issue_date:'2026-02-01', discipline:'structural', status:'current' },
    { id:'DRW-MD-03', project_id:PID, drawing_no:'M-101', title:'機電總平面圖', revision:'A', issue_date:'2025-11-30', discipline:'mep', status:'under-review' },
    { id:'DRW-MD-04', project_id:PID, drawing_no:'A-101', title:'室內裝修平面圖', revision:'B', issue_date:'2026-03-15', discipline:'architectural', status:'current' },
  ])

  console.log('  ✅ Mid-term scenario seeded successfully')
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCENARIO 3 — LONG-TERM  九龍灣商業大廈  (24 months, now at Month 9)
// ─────────────────────────────────────────────────────────────────────────────
async function seedLong() {
  console.log('\n🏢 Scenario 3: LONG-TERM — 九龍灣商業大廈新建工程 (24 months)')
  const PID = 'DEMO-LONG-001'

  const own1Id = await createUser('owner1.long@kwanchunkit.app', PASS, {
    username:'owner1.long', name:'吳業主', role:'owner', roleZh:'業主',
    trade:'業主代表', company:'九龍灣發展有限公司', projectId:PID, permissions:OWNER_PERMS,
  })
  const own2Id = await createUser('owner2.long@kwanchunkit.app', PASS, {
    username:'owner2.long', name:'馮授權工程師', role:'owner', roleZh:'業主',
    trade:'授權工程師', company:'大華工程顧問', projectId:PID, permissions:OWNER_PERMS,
  })
  const own3Id = await createUser('owner3.long@kwanchunkit.app', PASS, {
    username:'owner3.long', name:'鄭代表', role:'owner', roleZh:'業主',
    trade:'技術代表', company:'九龍灣發展有限公司', projectId:PID, permissions:OWNER_PERMS,
  })
  const pmId = await createUser('pm.long@kwanchunkit.app', PASS, {
    username:'pm.long', name:'陳建明', role:'main-contractor', roleZh:'總承建商',
    trade:'項目總監', company:'關春傑工程', projectId:PID, permissions:MC_FULL_PERMS,
  })
  const pe1Id = await createUser('pe1.long@kwanchunkit.app', PASS, {
    username:'pe1.long', name:'林高工', role:'main-contractor', roleZh:'總承建商',
    trade:'高級工程師', company:'關春傑工程', projectId:PID, permissions:MC_FULL_PERMS,
  })
  const pe2Id = await createUser('pe2.long@kwanchunkit.app', PASS, {
    username:'pe2.long', name:'楊工程師', role:'main-contractor', roleZh:'總承建商',
    trade:'工地工程師', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const qsId = await createUser('qs.long@kwanchunkit.app', PASS, {
    username:'qs.long', name:'梁量師', role:'main-contractor', roleZh:'總承建商',
    trade:'工料測量師', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const safetyId = await createUser('safety.long@kwanchunkit.app', PASS, {
    username:'safety.long', name:'謝安全主任', role:'main-contractor', roleZh:'總承建商',
    trade:'註冊安全主任', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const docId = await createUser('doc.long@kwanchunkit.app', PASS, {
    username:'doc.long', name:'方文件主任', role:'main-contractor', roleZh:'總承建商',
    trade:'文件主任', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const qcId = await createUser('qc.long@kwanchunkit.app', PASS, {
    username:'qc.long', name:'蔣QC主任', role:'main-contractor', roleZh:'總承建商',
    trade:'QC主任', company:'關春傑工程', projectId:PID, permissions:MC_PERMS,
  })
  const sub1Id = await createUser('sub1.long@kwanchunkit.app', PASS, {
    username:'sub1.long', name:'黃地基', role:'sub-contractor', roleZh:'判頭',
    trade:'地基工程判頭', company:'宏達地基工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub2Id = await createUser('sub2.long@kwanchunkit.app', PASS, {
    username:'sub2.long', name:'郭結構鋼', role:'sub-contractor', roleZh:'判頭',
    trade:'結構鋼判頭', company:'金剛鋼鐵工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub3Id = await createUser('sub3.long@kwanchunkit.app', PASS, {
    username:'sub3.long', name:'何混凝土', role:'sub-contractor', roleZh:'判頭',
    trade:'混凝土判頭', company:'永固混凝土', projectId:PID, permissions:SUB_PERMS,
  })
  const sub4Id = await createUser('sub4.long@kwanchunkit.app', PASS, {
    username:'sub4.long', name:'徐機電', role:'sub-contractor', roleZh:'判頭',
    trade:'機電判頭', company:'通達機電工程', projectId:PID, permissions:SUB_PERMS,
  })
  const sub5Id = await createUser('sub5.long@kwanchunkit.app', PASS, {
    username:'sub5.long', name:'孔幕牆', role:'sub-contractor', roleZh:'判頭',
    trade:'幕牆判頭', company:'光明幕牆工程', projectId:PID, permissions:SUB_PERMS,
  })

  if (!pmId) { console.warn('Skipping Long scenario data'); return }

  await supabase.from('projects').upsert({
    id: PID, name: '九龍灣商業大廈新建工程',
    description: '九龍灣新建25層商業大廈，包括地基、結構、外牆幕牆、機電及裝修工程',
    created_by: pmId, status: 'active', project_type: 'building',
    num_blocks: 1, has_basement: true, num_basement_levels: 3,
    zones: [
      { id:'ZB', name:'地庫 (B3-B1)', type:'basement' },
      { id:'ZL', name:'低層 (GF-8F)', type:'podium' },
      { id:'ZM', name:'中層 (9F-17F)', type:'tower' },
      { id:'ZH', name:'高層 (18F-25F)', type:'tower' },
    ],
    enabled_modules: ['progress','issues','safety','diary','materials','documents','qc','procurement'],
    assigned_pm_ids: [pmId, pe1Id, pe2Id],
    client: '九龍灣發展有限公司', start_date: '2025-08-01', target_end_date: '2027-07-31',
    contract_value: 168000000, site_address: '九龍九龍灣宏開道XX號',
  })

  const now = new Date().toISOString()
  await insert('progress_items', [
    // L1
    { id:'PLG-1', project_id:PID, code:'1', title:'地基工程', zone:'全地盤', parent_id:null, level:1,
      planned_start:'2025-08-01', planned_end:'2026-02-28', planned_progress:100, actual_progress:100,
      status:'completed', owned_by:[pmId,pe1Id], delegated_to:[sub1Id],
      notes:'地基工程全部完成，通過驗收', last_updated_by:'黃地基', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PLG-2', project_id:PID, code:'2', title:'結構工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-01-01', planned_end:'2026-12-31', planned_progress:38, actual_progress:33,
      status:'in-progress', owned_by:[pmId,pe1Id,pe2Id], delegated_to:[sub2Id,sub3Id],
      notes:'低層區結構完成，中層進行中', last_updated_by:'郭結構鋼', last_updated_at:now,
      tracking_mode:'floors', floor_labels:['B3','B2','B1','GF','1F','2F','3F','4F','5F','6F','7F','8F','9F','10F'],
      floors_completed:['B3','B2','B1','GF','1F','2F','3F','4F'] },
    { id:'PLG-3', project_id:PID, code:'3', title:'外牆幕牆工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-05-01', planned_end:'2027-03-31', planned_progress:0, actual_progress:0,
      status:'not-started', owned_by:[pmId,pe1Id], delegated_to:[sub5Id],
      notes:'待結構完成至8樓後開始', last_updated_by:'陳建明', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PLG-4', project_id:PID, code:'4', title:'機電粗裝工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-02-15', planned_end:'2027-04-30', planned_progress:15, actual_progress:12,
      status:'in-progress', owned_by:[pmId,pe2Id], delegated_to:[sub4Id],
      notes:'地庫及低層機電管槽安裝進行中', last_updated_by:'徐機電', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PLG-5', project_id:PID, code:'5', title:'室內裝修工程', zone:'全棟', parent_id:null, level:1,
      planned_start:'2026-12-01', planned_end:'2027-06-30', planned_progress:0, actual_progress:0,
      status:'not-started', owned_by:[pmId], delegated_to:[],
      notes:'待判頭招標', last_updated_by:'陳建明', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    // L2 — 結構 sub-items
    { id:'PLG-2-1', project_id:PID, code:'2.1', title:'地庫結構 (B3-B1)', zone:'地庫', parent_id:'PLG-2', level:2,
      planned_start:'2026-01-01', planned_end:'2026-04-30', planned_progress:100, actual_progress:100,
      status:'completed', owned_by:[pe1Id], delegated_to:[sub2Id,sub3Id],
      notes:'已完成', last_updated_by:'王工程師', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
    { id:'PLG-2-2', project_id:PID, code:'2.2', title:'低層結構 (GF-8F)', zone:'低層', parent_id:'PLG-2', level:2,
      planned_start:'2026-03-01', planned_end:'2026-08-31', planned_progress:65, actual_progress:55,
      status:'in-progress', owned_by:[pe1Id,pe2Id], delegated_to:[sub2Id,sub3Id],
      notes:'4樓完成，5樓板澆築進行中', last_updated_by:'何混凝土', last_updated_at:now,
      tracking_mode:'floors', floor_labels:['GF','1F','2F','3F','4F','5F','6F','7F','8F'],
      floors_completed:['GF','1F','2F','3F','4F'] },
    { id:'PLG-2-3', project_id:PID, code:'2.3', title:'中高層結構 (9F-25F)', zone:'中高層', parent_id:'PLG-2', level:2,
      planned_start:'2026-07-01', planned_end:'2026-12-31', planned_progress:0, actual_progress:0,
      status:'not-started', owned_by:[pe1Id], delegated_to:[sub2Id,sub3Id],
      notes:'預計7月開始', last_updated_by:'林高工', last_updated_at:now,
      tracking_mode:'percentage', floor_labels:[], floors_completed:[] },
  ])

  await insert('issues', [
    { id:'ILG-001', project_id:PID, category:'安全隱患', severity:'urgent', location:'5樓板邊',
      drawing_ref:'S-502', description:'5樓板澆築時模板支撐移位，需立即停工評估',
      submitted_by:sub3Id, submitted_by_name:'何混凝土', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-28T10:30:00', status:'open', comments:[], notify_ids:[pmId,pe1Id,safetyId,own2Id],
      photos:[], current_tier:'pm' },
    { id:'ILG-002', project_id:PID, category:'質量問題', severity:'serious', location:'4樓柱',
      drawing_ref:'S-401', description:'混凝土試塊28天強度未達設計要求（32.5MPa，要求C35）',
      submitted_by:qcId, submitted_by_name:'蔣QC主任', submitted_by_role:'main-contractor',
      submitted_at:'2026-04-25T14:00:00', status:'in-progress', comments:[], notify_ids:[pmId,pe1Id,own2Id],
      photos:[], current_tier:'pm' },
    { id:'ILG-003', project_id:PID, category:'設計問題', severity:'serious', location:'B2層停車場',
      drawing_ref:'M-201', description:'防排煙管道與結構梁碰撞，需協調修改',
      submitted_by:sub4Id, submitted_by_name:'徐機電', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-22T11:00:00', status:'in-progress', comments:[], notify_ids:[pmId,pe1Id,pe2Id],
      photos:[], current_tier:'foreman-pe' },
    { id:'ILG-004', project_id:PID, category:'物料問題', severity:'normal', location:'工地倉',
      drawing_ref:'', description:'螺紋鋼筋存放不當，部分已生鏽，需清理或報廢',
      submitted_by:sub2Id, submitted_by_name:'郭結構鋼', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-20T09:00:00', status:'resolved', comments:[], notify_ids:[pmId],
      photos:[], current_tier:'pm' },
    { id:'ILG-005', project_id:PID, category:'進度延誤', severity:'normal', location:'低層',
      drawing_ref:'', description:'混凝土供應商因道路挖掘延誤交貨，影響2天工期',
      submitted_by:sub3Id, submitted_by_name:'何混凝土', submitted_by_role:'sub-contractor',
      submitted_at:'2026-04-18T16:00:00', status:'closed', comments:[], notify_ids:[pmId],
      photos:[], current_tier:'pm' },
  ])

  await insert('ptw_requests', [
    { id:'PTW-LG-001', project_id:PID, ptw_no:'PTW-2026-031', work_type:'邊坡作業', location:'5樓板邊',
      zone:'低層', description:'5樓混凝土板澆築作業', hazards:['墮落','混凝土飛濺'],
      required_ppe:['安全帶','安全帽','護目鏡','膠手套'], requested_by:sub3Id, requested_by_name:'何混凝土',
      requested_at:'2026-04-28T07:00:00', start_time:'2026-04-28T08:00:00', end_time:'2026-04-28T18:00:00',
      risk_level:'high', status:'pending', acknowledged_by:[] },
    { id:'PTW-LG-002', project_id:PID, ptw_no:'PTW-2026-030', work_type:'熱作業', location:'4樓鋼骨',
      zone:'低層', description:'鋼柱焊接工作', hazards:['火災','灼傷','煙霧','紫外線'],
      required_ppe:['焊接面罩','防火手套','防火工作服'], requested_by:sub2Id, requested_by_name:'郭結構鋼',
      requested_at:'2026-04-27T07:30:00', start_time:'2026-04-27T09:00:00', end_time:'2026-04-27T17:00:00',
      risk_level:'medium', status:'approved', approved_by:safetyId, approved_by_name:'謝安全主任',
      approved_at:'2026-04-27T08:15:00', acknowledged_by:[sub2Id] },
    { id:'PTW-LG-003', project_id:PID, ptw_no:'PTW-2026-029', work_type:'有限空間', location:'B3泵房',
      zone:'地庫', description:'排水泵安裝及測試', hazards:['缺氧','溺水'],
      required_ppe:['呼吸器','救生衣','安全繩'], requested_by:sub4Id, requested_by_name:'徐機電',
      requested_at:'2026-04-25T08:00:00', start_time:'2026-04-25T09:00:00', end_time:'2026-04-25T16:00:00',
      risk_level:'critical', status:'completed', approved_by:safetyId, approved_by_name:'謝安全主任',
      approved_at:'2026-04-25T08:30:00', acknowledged_by:[sub4Id] },
    { id:'PTW-LG-004', project_id:PID, ptw_no:'PTW-2026-028', work_type:'起重作業', location:'工地全區',
      zone:'全棟', description:'塔吊吊裝鋼骨構件', hazards:['構件墮落','碰撞'],
      required_ppe:['安全帽','反光衣'], requested_by:sub2Id, requested_by_name:'郭結構鋼',
      requested_at:'2026-04-24T07:00:00', start_time:'2026-04-24T08:00:00', end_time:'2026-04-24T17:00:00',
      risk_level:'high', status:'completed', approved_by:safetyId, approved_by_name:'謝安全主任',
      approved_at:'2026-04-24T07:45:00', acknowledged_by:[sub2Id] },
  ])

  await insert('toolbox_talks', [
    { id:'TBT-LG-001', project_id:PID, date:'2026-04-28', conducted_by:safetyId,
      conducted_by_name:'謝安全主任', topic:'混凝土澆築安全及板邊防墮', attendee_names:['何混凝土','何助手1','何助手2','何助手3','何助手4','何助手5'],
      duration:25, notes:'強調板邊必須設置防護欄，所有工人必須佩戴安全帶' },
    { id:'TBT-LG-002', project_id:PID, date:'2026-04-21', conducted_by:safetyId,
      conducted_by_name:'謝安全主任', topic:'起重作業安全', attendee_names:['郭結構鋼','郭助手1','郭助手2','郭助手3','何混凝土'],
      duration:20, notes:'複習起重訊號手勢' },
    { id:'TBT-LG-003', project_id:PID, date:'2026-04-14', conducted_by:safetyId,
      conducted_by_name:'謝安全主任', topic:'熱作業火災預防', attendee_names:['郭結構鋼','郭助手1','郭助手2'],
      duration:15, notes:'焊接後30分鐘留守監察' },
  ])

  await insert('daily_diaries', [
    { id:'DDY-LG-001', project_id:PID, date:'2026-04-28', author_id:sub3Id, author_name:'何混凝土',
      zone:'低層', weather:'sunny', temperature:29, manpower_total:25,
      equipment:'混凝土泵×1, 震動器×4, 塔吊×1',
      work_done:'5樓板模板安裝完成，配筋工作進行中，預計明天澆築', issues_text:'模板支撐出現移位，已即時上報並停工', status:'submitted' },
    { id:'DDY-LG-002', project_id:PID, date:'2026-04-28', author_id:sub2Id, author_name:'郭結構鋼',
      zone:'低層', weather:'sunny', temperature:29, manpower_total:18,
      equipment:'焊接機×4, 塔吊×1',
      work_done:'4樓鋼柱焊接完成12條，鋼梁吊裝6支', issues_text:'', status:'submitted' },
    { id:'DDY-LG-003', project_id:PID, date:'2026-04-27', author_id:sub4Id, author_name:'徐機電',
      zone:'地庫', weather:'sunny', temperature:28, manpower_total:15,
      equipment:'線管彎管機×2',
      work_done:'B2層電纜橋架安裝完成，B1層電纜橋架開始安裝', issues_text:'', status:'submitted' },
    { id:'DDY-LG-004', project_id:PID, date:'2026-04-26', author_id:sub1Id, author_name:'黃地基',
      zone:'全地盤', weather:'cloudy', temperature:26, manpower_total:5,
      equipment:'',
      work_done:'協助後續工程驗收地基文件，清理地基設備', issues_text:'', status:'submitted' },
  ])

  await insert('ncrs', [
    { id:'NCR-LG-001', project_id:PID, ncr_no:'NCR-2026-031', date:'2026-04-25',
      raised_by:qcId, raised_by_name:'蔣QC主任', zone:'低層4樓',
      work_item:'混凝土強度', description:'4樓柱混凝土試塊28天強度不達標（C32.5，要求C35），差5.5MPa',
      severity:'critical', photos:[], status:'open' },
    { id:'NCR-LG-002', project_id:PID, ncr_no:'NCR-2026-030', date:'2026-04-20',
      raised_by:qcId, raised_by_name:'蔣QC主任', zone:'地庫',
      work_item:'鋼筋覆蓋層', description:'B1層牆身鋼筋覆蓋層不足（實測20mm，要求35mm）',
      severity:'major', photos:[], status:'corrective-action',
      corrective_action:'在不足位置額外批水泥漿修補至要求覆蓋層', corrective_action_by:'何混凝土',
      corrective_due_date:'2026-05-05' },
    { id:'NCR-LG-003', project_id:PID, ncr_no:'NCR-2026-029', date:'2026-04-10',
      raised_by:pe1Id, raised_by_name:'林高工', zone:'地庫',
      work_item:'防水層', description:'地庫外牆防水層有破損，未施工已出現滲漏',
      severity:'major', photos:[], status:'closed',
      closed_at:'2026-04-22T10:00:00' },
    { id:'NCR-LG-004', project_id:PID, ncr_no:'NCR-2026-028', date:'2026-04-05',
      raised_by:qcId, raised_by_name:'蔣QC主任', zone:'低層3樓',
      work_item:'鋼骨焊接', description:'鋼柱焊縫超聲波檢測發現內部缺陷',
      severity:'critical', photos:[], status:'closed',
      closed_at:'2026-04-20T15:00:00' },
  ])

  await insert('boq_items', [
    { id:'BOQ-LG-01', project_id:PID, code:'1.1', description:'鑽孔灌注樁工程', unit:'m', contract_qty:4200, rate:3800, contract_amount:15960000, completed_qty:4200, completed_amount:15960000 },
    { id:'BOQ-LG-02', project_id:PID, code:'1.2', description:'地基承台及地梁', unit:'m³', contract_qty:3800, rate:2200, contract_amount:8360000, completed_qty:3800, completed_amount:8360000 },
    { id:'BOQ-LG-03', project_id:PID, code:'2.1', description:'地庫結構混凝土', unit:'m³', contract_qty:8500, rate:1800, contract_amount:15300000, completed_qty:8500, completed_amount:15300000 },
    { id:'BOQ-LG-04', project_id:PID, code:'2.2', description:'低層樓板混凝土 (GF-8F)', unit:'m³', contract_qty:12000, rate:1800, contract_amount:21600000, completed_qty:5800, completed_amount:10440000 },
    { id:'BOQ-LG-05', project_id:PID, code:'2.3', description:'鋼骨結構 (GF-25F)', unit:'噸', contract_qty:1800, rate:18500, contract_amount:33300000, completed_qty:620, completed_amount:11470000 },
    { id:'BOQ-LG-06', project_id:PID, code:'2.4', description:'中高層樓板混凝土 (9F-25F)', unit:'m³', contract_qty:18000, rate:1800, contract_amount:32400000, completed_qty:0, completed_amount:0 },
    { id:'BOQ-LG-07', project_id:PID, code:'3.1', description:'幕牆系統（全棟）', unit:'㎡', contract_qty:8500, rate:3200, contract_amount:27200000, completed_qty:0, completed_amount:0 },
    { id:'BOQ-LG-08', project_id:PID, code:'4.1', description:'機電粗裝工程', unit:'項', contract_qty:1, rate:15800000, contract_amount:15800000, completed_qty:0.12, completed_amount:1896000 },
    { id:'BOQ-LG-09', project_id:PID, code:'4.2', description:'消防系統', unit:'項', contract_qty:1, rate:4200000, contract_amount:4200000, completed_qty:0.08, completed_amount:336000 },
    { id:'BOQ-LG-10', project_id:PID, code:'5.1', description:'室內裝修工程（公共區域）', unit:'㎡', contract_qty:12000, rate:2800, contract_amount:33600000, completed_qty:0, completed_amount:0 },
  ])

  await insert('variation_orders', [
    { id:'VO-LG-001', project_id:PID, vo_no:'VO-2026-031', description:'增加4樓柱混凝土強度至C40（因試塊不達標）',
      raised_by:pmId, raised_by_name:'陳建明', raised_at:'2026-04-27T14:00:00',
      amount:380000, type:'addition', status:'submitted' },
    { id:'VO-LG-002', project_id:PID, vo_no:'VO-2026-030', description:'業主要求增設頂層觀景台結構',
      raised_by:pmId, raised_by_name:'陳建明', raised_at:'2026-04-20T10:00:00',
      amount:2850000, type:'addition', status:'approved', approved_by:'吳業主', approved_at:'2026-04-25T09:00:00' },
    { id:'VO-LG-003', project_id:PID, vo_no:'VO-2026-029', description:'因設計變更刪減部分室內隔牆',
      raised_by:pmId, raised_by_name:'陳建明', raised_at:'2026-04-15T09:00:00',
      amount:420000, type:'omission', status:'approved', approved_by:'馮授權工程師', approved_at:'2026-04-18T11:00:00' },
    { id:'VO-LG-004', project_id:PID, vo_no:'VO-2026-028', description:'幕牆材料由普通鋁板升級為Low-E玻璃',
      raised_by:pmId, raised_by_name:'陳建明', raised_at:'2026-04-10T10:00:00',
      amount:1650000, type:'substitution', status:'approved', approved_by:'吳業主', approved_at:'2026-04-14T14:00:00' },
  ])

  await insert('drawings', [
    { id:'DRW-LG-01', project_id:PID, drawing_no:'S-001', title:'地基平面圖', revision:'D', issue_date:'2025-07-15', discipline:'structural', status:'current' },
    { id:'DRW-LG-02', project_id:PID, drawing_no:'S-401', title:'4樓結構平面圖', revision:'B', issue_date:'2026-02-10', discipline:'structural', status:'current' },
    { id:'DRW-LG-03', project_id:PID, drawing_no:'S-502', title:'5樓結構平面圖', revision:'A', issue_date:'2026-03-01', discipline:'structural', status:'under-review' },
    { id:'DRW-LG-04', project_id:PID, drawing_no:'M-101', title:'地庫機電管道綜合圖', revision:'B', issue_date:'2026-01-20', discipline:'mep', status:'current' },
    { id:'DRW-LG-05', project_id:PID, drawing_no:'M-201', title:'B2層防排煙平面圖', revision:'A', issue_date:'2026-01-20', discipline:'mep', status:'under-review' },
    { id:'DRW-LG-06', project_id:PID, drawing_no:'A-001', title:'外牆幕牆立面圖', revision:'C', issue_date:'2026-03-15', discipline:'architectural', status:'current' },
  ])

  console.log('  ✅ Long-term scenario seeded successfully')
}

// ─────────────────────────────────────────────────────────────────────────────
//  FEEDBACK TABLE  (run once to create — safe to re-run)
// ─────────────────────────────────────────────────────────────────────────────
async function createFeedbackTable() {
  // Uses Supabase SQL via RPC if available, otherwise we just ensure rows table exists
  // The actual CREATE TABLE SQL must be run manually in the Supabase SQL editor (see DEMO_GUIDE.md)
  console.log('\n📝 Note: Run the SQL in scripts/create-feedback-table.sql in the Supabase SQL editor')
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting demo simulation seed...')
  console.log(`   Supabase: ${SUPABASE_URL}`)
  console.log(`   Password for all demo users: ${PASS}\n`)

  await seedShort()
  await seedMid()
  await seedLong()
  await createFeedbackTable()

  console.log('\n✅ All demo simulations seeded!')
  console.log('\n📋 DEMO ACCOUNTS SUMMARY:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('SHORT-TERM (4 months) — 灣仔辦公室翻新:')
  console.log('  owner.short / Demo@2026    → 業主視角')
  console.log('  pm.short / Demo@2026        → 總承建商 PM')
  console.log('  sub1.short / Demo@2026      → 電氣判頭')
  console.log('  sub2.short / Demo@2026      → 鋁窗判頭')
  console.log('  sub3.short / Demo@2026      → 裝修判頭')
  console.log('\nMID-TERM (9 months) — 沙田社區中心:')
  console.log('  owner1.mid / Demo@2026      → 業主代表')
  console.log('  owner2.mid / Demo@2026      → 授權工程師')
  console.log('  pm.mid / Demo@2026          → PM')
  console.log('  pe.mid / Demo@2026          → 工地工程師')
  console.log('  qs.mid / Demo@2026          → 工料測量師')
  console.log('  safety.mid / Demo@2026      → 安全主任')
  console.log('  sub1.mid–sub4.mid / Demo@2026 → 各判頭')
  console.log('\nLONG-TERM (24 months) — 九龍灣商業大廈:')
  console.log('  owner1.long / Demo@2026     → 業主')
  console.log('  owner2.long / Demo@2026     → 授權工程師')
  console.log('  owner3.long / Demo@2026     → 技術代表')
  console.log('  pm.long / Demo@2026         → 項目總監')
  console.log('  pe1.long + pe2.long / Demo@2026 → 工程師')
  console.log('  qs.long / Demo@2026         → 工料測量師')
  console.log('  safety.long / Demo@2026     → 安全主任')
  console.log('  doc.long / Demo@2026        → 文件主任')
  console.log('  qc.long / Demo@2026         → QC主任')
  console.log('  sub1.long–sub5.long / Demo@2026 → 各判頭')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\nAll emails: <username>@kwanchunkit.app')
  console.log('Or login with just the username — the app auto-adds @kwanchunkit.app')
}

main().catch(console.error)
