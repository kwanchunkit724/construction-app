// =============================================================
// run-sim.cjs — realistic daily-ops simulation for [TEST] 測試大廈項目
// =============================================================
// Logs in each test account (gotrue password grant) and runs 30-50 REAL
// transactions per feature as the appropriate role (true RLS, persisted),
// recording expected-vs-actual for every transaction. Output → .planning/
// sim-runs/<run-id>/ (per-feature JSON + master.csv + summary.md). Node 18+.
//   node supabase/sim/run-sim.cjs
// =============================================================
const fs = require('fs')
const path = require('path')

// ---- env ----
const envRaw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const env = Object.fromEntries(envRaw.split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
if (!URL || !ANON) { console.error('missing env', Object.keys(env)); process.exit(1) }

const PW = 'CKtest2026'
const PROJ = 'bbbb0000-0000-0000-0000-000000000001'
const uid = p => `bbbb0000-0000-0000-0000-0000${p}`
const item = n => `bbbb1111-0000-0000-0000-${String(n).padStart(12, '0')}`
const STAMP = Date.now().toString(36)

const ACC = {
  admin: '62000099', pm: '62000001', gf: '62000002', owner: '62000003', safety: '62000004',
  z: [
    { eng: '62010001', fore: '62010002', jud: '62010003', wkr: '62010004', name: '一座', zid: 'z-1', base: 0 },
    { eng: '62020001', fore: '62020002', jud: '62020003', wkr: '62020004', name: '二座', zid: 'z-2', base: 8 },
    { eng: '62030001', fore: '62030002', jud: '62030003', wkr: '62030004', name: '三座', zid: 'z-3', base: 16 },
    { eng: '62040001', fore: '62040002', jud: '62040003', wkr: '62040004', name: '外圍', zid: 'z-ext', base: 24 },
  ],
}
// day offsets to scatter created_at across a work-week (negative days from now)
const DAYS = [4, 3, 2, 1, 0]
const dayISO = d => new Date(Date.now() - d * 86400000).toISOString()

// ---- http ----
const jwtCache = {}
async function login(phone) {
  if (jwtCache[phone]) return jwtCache[phone]
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: phone + '@phone.local', password: PW }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('login fail ' + phone + ' ' + JSON.stringify(j).slice(0, 120))
  jwtCache[phone] = j.access_token
  return j.access_token
}
async function req(method, pathq, jwt, body, prefer) {
  const h = { apikey: ANON, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }
  if (prefer) h.Prefer = prefer
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null } catch { j = t }
  return { status: r.status, ok: r.ok, j }
}
const insert = (table, jwt, row) => req('POST', table, jwt, row, 'return=representation')
const patch = (table, jwt, filter, row) => req('PATCH', `${table}?${filter}`, jwt, row, 'return=representation')
const del = (table, jwt, filter) => req('DELETE', `${table}?${filter}`, jwt, null, 'return=representation')
const rpc = (name, jwt, args) => req('POST', `rpc/${name}`, jwt, args, 'return=representation')

// allow/deny interpretation
function outcome(res) {
  if (res.status === 409) return 'allow' // unique dup = the row already exists (idempotent daily-ops, e.g. once-per-day diary)
  if (!(res.status < 300)) return 'deny'
  if (Array.isArray(res.j) && res.j.length === 0) return 'deny' // update/delete hit 0 rows
  return 'allow'
}
const LOG = []
function rec(feature, actorPhone, action, expected, res, note) {
  const got = outcome(res)
  const detail = (res.j && res.j.message) ? String(res.j.message).slice(0, 90) : (Array.isArray(res.j) ? `${res.j.length} row` : '')
  LOG.push({
    feature, seq: LOG.filter(x => x.feature === feature).length + 1,
    actor: actorPhone, action,
    expected, actual: `${got} (http ${res.status}) ${detail}`.trim(),
    pass: got === expected, note: note || '',
  })
  return res
}

// ---- feature sims ----
async function simProgress() {
  const F = '進度'
  for (const z of ACC.z) {
    const leaves = [
      { n: z.base + 3, who: [z.eng, z.fore] },
      { n: z.base + 4, who: [z.jud, z.wkr] },
      { n: z.base + 7, who: [z.jud] },
      { n: z.base + 8, who: [z.eng] },
    ]
    for (const lf of leaves) {
      for (const ph of lf.who) {
        const jwt = await login(ph)
        const val = 20 + Math.floor(((lf.n + lf.who.indexOf(ph)) * 13) % 70)
        const r = await patch('progress_items', jwt, `id=eq.${item(lf.n)}`, { actual_progress: val, status: val >= 100 ? 'completed' : 'in-progress' })
        rec(F, ph, `更新進度 ${item(lf.n).slice(-4)} → ${val}% (${z.name})`, 'allow', r, '被派 leaf')
      }
    }
    // manager adds a mid item (PM)
    const pm = await login(ACC.pm)
    const r2 = await insert('progress_items', pm, { project_id: PROJ, parent_id: item(z.base + 1), code: `${z.name[0]}1.2-${STAMP}`, title: `${z.name}-結構-4樓〔中項·sim〕`, zone_id: z.zid, level: 2, tracking_mode: 'percentage', status: 'not-started' })
    rec(F, ACC.pm, `PM 加中項 (${z.name})`, 'allow', r2)
    // deny: judou adds 大項
    const jud = await login(z.jud)
    const r3 = await insert('progress_items', jud, { project_id: PROJ, parent_id: null, code: `Z-${z.name}-${STAMP}`, title: 'judou 越權大項', zone_id: z.zid, level: 1, tracking_mode: 'percentage', status: 'not-started' })
    rec(F, z.jud, `判頭加大項 (${z.name})`, 'deny', r3, '非 manager')
    // deny: worker updates a leaf not assigned to them (a sibling)
    const wkr = await login(z.wkr)
    const r4 = await patch('progress_items', wkr, `id=eq.${item(z.base + 3)}`, { actual_progress: 99 })
    rec(F, z.wkr, `工人改未派 leaf (${z.name})`, 'deny', r4)
  }
}

async function simIssues() {
  const F = '問題'
  let created = []
  for (const z of ACC.z) {
    const wkr = await login(z.wkr)
    for (let k = 0; k < 2; k++) {
      const r = await insert('issues', wkr, { project_id: PROJ, reporter_id: uid(z.wkr), reporter_role: 'subcontractor_worker', current_handler_role: 'subcontractor', title: `${z.name} 漏水/裂痕 #${k + 1}`, created_at: dayISO(DAYS[(z.base + k) % 5]) })
      rec(F, z.wkr, `工人報問題 (${z.name})`, 'allow', r)
      if (Array.isArray(r.j) && r.j[0]) created.push({ id: r.j[0].id, z })
    }
    // snag (is_quick)
    const r2 = await insert('issues', wkr, { project_id: PROJ, reporter_id: uid(z.wkr), reporter_role: 'subcontractor_worker', current_handler_role: 'subcontractor', title: `${z.name} 即時影相 snag`, is_quick: true, snag_type: 'defect' })
    rec(F, z.wkr, `工人即時問題 snag (${z.name})`, 'allow', r2)
    const jud = await login(z.jud)
    const r3 = await insert('issues', jud, { project_id: PROJ, reporter_id: uid(z.jud), reporter_role: 'subcontractor', current_handler_role: 'main_contractor', title: `${z.name} 判頭報物料延誤` })
    rec(F, z.jud, `判頭報問題 (${z.name})`, 'allow', r3)
  }
  // escalate + comment + resolve on the created worker issues (handler = subcontractor → judou escalates)
  for (const c of created) {
    const jud = await login(c.z.jud)
    const re = await patch('issues', jud, `id=eq.${c.id}`, { current_handler_role: 'main_contractor' })
    rec(F, c.z.jud, `判頭升級問題→總承 (${c.z.name})`, 'allow', re)
    const rc = await insert('issue_comments', jud, { issue_id: c.id, author_id: uid(c.z.jud), action: 'commented', body: '已通知總承跟進' })
    rec(F, c.z.jud, `判頭留言`, 'allow', rc)
  }
  // main_contractor resolves half
  for (let i = 0; i < created.length; i += 2) {
    const c = created[i]
    const eng = await login(c.z.eng)
    const rr = await patch('issues', eng, `id=eq.${c.id}`, { status: 'resolved', resolved_by: uid(c.z.eng), resolved_at: new Date().toISOString() })
    rec(F, c.z.eng, `總承解決問題 (${c.z.name})`, 'allow', rr)
  }
  // deny: worker edits an issue they didn't report / don't handle
  if (created[1]) {
    const otherWkr = await login(ACC.z[1].wkr)
    const rd = await patch('issues', otherWkr, `id=eq.${created[0].id}`, { title: '越權改' })
    rec(F, ACC.z[1].wkr, `工人改非自己問題`, 'deny', rd)
  }
  // safety officer blanket act
  if (created[0]) {
    const so = await login(ACC.safety)
    const rs = await patch('issues', so, `id=eq.${created[created.length - 1].id}`, { title: '安全主任備註更新' })
    rec(F, ACC.safety, `安全主任改任何問題 (v66)`, 'allow', rs)
  }
}

async function simChainDoc(F, table, versionTable, idField, numPrefix, docType, steps, makePayload, denyCreatorPhone, extra) {
  // steps = [{role, phone}] approval steps in order
  const creators = [ACC.z[0].jud, ACC.z[1].eng, ACC.z[0].fore, ACC.z[2].jud, ACC.z[1].jud, ACC.z[3].eng]
  const made = []
  for (let i = 0; i < creators.length; i++) {
    const ph = creators[i]
    const jwt = await login(ph)
    const number = `${numPrefix}-${STAMP}-${i + 1}`
    const cr = await insert(table, jwt, { project_id: PROJ, number, created_by: uid(ph), status: 'draft', ...(extra || {}) })
    rec(F, ph, `開單 ${number}`, 'allow', cr)
    if (!(Array.isArray(cr.j) && cr.j[0])) continue
    const docId = cr.j[0].id
    const vr = await insert(versionTable, jwt, { [idField]: docId, version_no: 1, payload: makePayload(i), edits_by: uid(ph) })
    rec(F, ph, `加內容版本 ${number}`, 'allow', vr)
    // point the doc at its current version (submit_si requires saved content)
    if (Array.isArray(vr.j) && vr.j[0]) await patch(table, jwt, `id=eq.${docId}`, { current_version_id: vr.j[0].id })
    const sub = await rpc(`submit_${docType}`, jwt, { [`p_${docType}_id`]: docId })
    rec(F, ph, `提交 ${number}`, 'allow', sub)
    made.push({ docId, number })
    // approve through steps
    for (const st of steps) {
      const apj = await login(st.phone)
      const ap = await rpc('submit_approval', apj, { p_doc_type: docType, p_doc_id: docId, p_action_type: 'approve', p_reason: '審核通過 sim', p_edits_jsonb: null })
      rec(F, st.phone, `批核 ${number} (${st.role})`, 'allow', ap)
    }
  }
  // deny: forbidden role creates
  const dj = await login(denyCreatorPhone)
  const dr = await insert(table, dj, { project_id: PROJ, number: `${numPrefix}-DENY-${STAMP}`, created_by: uid(denyCreatorPhone), status: 'draft' })
  rec(F, denyCreatorPhone, `越權開單`, 'deny', dr)
  // deny: non-submitter submits an existing draft (worker)
  return made
}

async function simSI() {
  await simChainDoc('工地指令', 'site_instructions', 'si_versions', 'si_id', 'SI', 'si',
    [{ role: '總承', phone: ACC.z[0].eng }, { role: 'PM', phone: ACC.pm }],
    i => ({ description: `工地指令 sim #${i + 1}：請按圖則調整柱位鋼筋`, location: '各層' }),
    ACC.owner)
}
async function simVO() {
  await simChainDoc('變更指令', 'variation_orders', 'vo_versions', 'vo_id', 'VO', 'vo',
    [{ role: '總承', phone: ACC.z[0].eng }, { role: 'PM', phone: ACC.pm }, { role: '業主', phone: ACC.owner }],
    i => ({ description: `變更指令 sim #${i + 1}`, line_items: [{ category: 'labour', description: '額外人工', quantity: 5, unit: '工', unit_price_cents: 120000, subtotal_cents: 600000 }] }),
    ACC.z[0].wkr)
}
async function simPTW() {
  const F = '工作許可證'
  const made = await simChainDoc(F, 'permits_to_work', 'permit_versions', 'ptw_id', 'PTW', 'ptw',
    [{ role: '安全主任', phone: ACC.safety }, { role: '總承', phone: ACC.z[0].eng }],
    i => ({ work_desc: `工作許可 sim #${i + 1}`, workers: [] }),
    ACC.safety,
    { ptw_type: ['work_at_height', 'lifting', 'electrical', 'confined_space', 'excavation', 'work_at_height'][0] })
  return made
}

async function simEquipment() {
  const F = '機械/表格'
  const mc = await login(ACC.z[0].eng) // main_contractor can manage
  const equips = []
  for (let i = 0; i < 6; i++) {
    const kind = ['excavation', 'scaffold', 'lifting_appliance', 'excavation', 'scaffold', 'lifting_appliance'][i]
    const cr = await insert('equipment_register', mc, { project_id: PROJ, kind, ref_no: `SIM-EQ-${STAMP}-${i + 1}`, name_zh: `模擬機械 ${i + 1}`, created_by: uid(ACC.z[0].eng), status: 'active' })
    rec(F, ACC.z[0].eng, `總承加機械 #${i + 1} (${kind})`, 'allow', cr)
    if (Array.isArray(cr.j) && cr.j[0]) equips.push({ id: cr.j[0].id, kind })
  }
  // map equipment_kind -> a template id (for form instances)
  const tmplResp = await req('GET', `form_templates?select=id,equipment_kind,required_credential`, mc)
  const tmplByKind = {}
  if (Array.isArray(tmplResp.j)) for (const t of tmplResp.j) if (!tmplByKind[t.equipment_kind]) tmplByKind[t.equipment_kind] = t
  // deny: judou adds equipment
  const jud = await login(ACC.z[0].jud)
  const dr = await insert('equipment_register', jud, { project_id: PROJ, kind: 'excavation', ref_no: `SIM-EQ-DENY-${STAMP}`, name_zh: '越權機械', created_by: uid(ACC.z[0].jud), status: 'active' })
  rec(F, ACC.z[0].jud, `判頭加機械`, 'deny', dr)
  // safety officer CAN add (v77)
  const so = await login(ACC.safety)
  const sr = await insert('equipment_register', so, { project_id: PROJ, kind: 'scaffold', ref_no: `SIM-EQ-SO-${STAMP}`, name_zh: '安全主任加機械', created_by: uid(ACC.safety), status: 'active' })
  rec(F, ACC.safety, `安全主任加機械 (v77)`, 'allow', sr)
  // mint QR: safety allow, judou deny
  if (equips[0]) {
    rec(F, ACC.safety, `安全主任 mint QR`, 'allow', await rpc('mint_equipment_jwt', so, { p_equipment_id: equips[0].id }))
    rec(F, ACC.z[0].jud, `判頭 mint QR`, 'deny', await rpc('mint_equipment_jwt', jud, { p_equipment_id: equips[0].id }))
  }
  // verify credential (PM allow, judou deny) — verify the seeded creds
  rec(F, ACC.pm, `PM 核實證書`, 'allow', await rpc('verify_user_credential', await login(ACC.pm), { p_credential_id: 'bbbb5555-0000-0000-0000-000000000001' }))
  rec(F, ACC.z[0].jud, `判頭核實證書`, 'deny', await rpc('verify_user_credential', jud, { p_credential_id: 'bbbb5555-0000-0000-0000-000000000002' }))
  // form instances + signoff. judou(62010003) holds a verified competent_person cred.
  const wkr = await login(ACC.z[0].wkr)
  for (const eq of equips) {
    const t = tmplByKind[eq.kind]
    if (!t) continue
    // manager creates the form instance for this equipment×template
    const ir = await insert('form_instances', mc, { project_id: PROJ, equipment_id: eq.id, template_id: t.id, created_by: uid(ACC.z[0].eng) })
    rec(F, ACC.z[0].eng, `開表格項 (${eq.kind})`, 'allow', ir)
    const instId = (Array.isArray(ir.j) && ir.j[0]) ? ir.j[0].id : null
    if (!instId) continue
    const sig = Buffer.from('sim-signature-'.repeat(20)).toString('base64') // long enough to pass the min-length check
    // sign: judou has competent_person; only valid where required_credential = competent_person
    const expectSign = t.required_credential === 'competent_person' ? 'allow' : 'deny'
    const so2 = await rpc('record_form_signoff', jud, { p_instance_id: instId, p_result: 'pass', p_payload: { checklist: [{ label_zh: '結構完好', value: true }] }, p_signature_b64: sig })
    rec(F, ACC.z[0].jud, `合資格判頭簽表格 (${t.required_credential})`, expectSign, so2, '持 competent_person 牌')
    // deny: worker (no credential) signs
    const so3 = await rpc('record_form_signoff', wkr, { p_instance_id: instId, p_result: 'pass', p_payload: {}, p_signature_b64: sig })
    rec(F, ACC.z[0].wkr, `工人(無牌)簽表格`, 'deny', so3)
  }
}

async function simDailies() {
  const F = '每日日誌'
  // authors: gf + all main_contractor (eng+fore of each zone) — one per author for today.
  // (PM omitted: PM already logged today via the Stage-C seed; dailies are unique per user/day.)
  const authors = [ACC.gf, ...ACC.z.flatMap(z => [z.eng, z.fore])]
  for (const ph of authors) {
    const jwt = await login(ph)
    const r = await insert('dailies', jwt, { project_id: PROJ, user_id: uid(ph), date: new Date().toISOString().slice(0, 10), weather: '晴' })
    rec(F, ph, `寫今日日誌`, 'allow', r)
    // attempt prior-day diaries → expected DENY (R2 today-lock), one per author per past day
    for (let d = 1; d <= 3; d++) {
      const pr = await insert('dailies', jwt, { project_id: PROJ, user_id: uid(ph), date: new Date(Date.now() - d * 86400000).toISOString().slice(0, 10), weather: '晴' })
      rec(F, ph, `補 ${d} 日前日誌`, 'deny', pr, '當日鎖 R2')
    }
  }
  // deny: judou + worker write
  rec(F, ACC.z[0].jud, `判頭寫日誌`, 'deny', await insert('dailies', await login(ACC.z[0].jud), { project_id: PROJ, user_id: uid(ACC.z[0].jud), date: new Date().toISOString().slice(0, 10), weather: '晴' }))
  rec(F, ACC.z[0].wkr, `工人寫日誌`, 'deny', await insert('dailies', await login(ACC.z[0].wkr), { project_id: PROJ, user_id: uid(ACC.z[0].wkr), date: new Date().toISOString().slice(0, 10), weather: '晴' }))
  // deny: PM backdates (R2 lock)
  rec(F, ACC.pm, `PM 補尋日日誌`, 'deny', await insert('dailies', await login(ACC.pm), { project_id: PROJ, user_id: uid(ACC.pm), date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), weather: '晴' }))
}

async function simMaterials() {
  const F = '物料'
  const orders = []
  for (const z of ACC.z) {
    for (const ph of [z.jud, z.eng, z.fore, z.jud, z.eng]) {
      const jwt = await login(ph)
      const mats = ['鋼筋 T', '英泥', '砂', '石屎', '磚', '木方', '鋁窗', '防水膜']
      const r = await insert('materials', jwt, { project_id: PROJ, name: `${z.name} ${mats[orders.length % mats.length]}${10 + orders.length % 5}`, unit: ['噸', '包', '立方', '件'][orders.length % 4], qty_needed: 5 + orders.length, requested_by: uid(ph), planned_arrival_at: dayISO(-(orders.length % 5)), created_at: dayISO(DAYS[orders.length % 5]) })
      rec(F, ph, `落料單 (${z.name})`, 'allow', r)
      if (Array.isArray(r.j) && r.j[0]) orders.push({ id: r.j[0].id, ph })
    }
  }
  // receive (qty_arrived) by requester
  for (let i = 0; i < orders.length; i += 2) {
    const o = orders[i]
    rec(F, o.ph, `收貨記數`, 'allow', await patch('materials', await login(o.ph), `id=eq.${o.id}`, { qty_arrived: 5 }))
  }
  // deny: worker creates
  rec(F, ACC.z[0].wkr, `工人落料單`, 'deny', await insert('materials', await login(ACC.z[0].wkr), { project_id: PROJ, name: '越權料', unit: '個', qty_needed: 1, requested_by: uid(ACC.z[0].wkr) }))
  // deny: judou edits ANOTHER person's order (R1)
  if (orders[1]) rec(F, ACC.z[1].jud, `判頭改別人料單 (R1)`, 'deny', await patch('materials', await login(ACC.z[1].jud), `id=eq.${orders[0].id}`, { name: '越權改' }))
}

async function simEvents() {
  const F = '行事曆'
  const authors = [ACC.pm, ACC.gf, ACC.z[0].eng, ACC.z[1].fore, ACC.z[2].eng, ACC.z[3].fore]
  let c = 0
  for (const ph of authors) {
    const jwt = await login(ph)
    for (let k = 0; k < 5; k++) {
      const r = await insert('events', jwt, { project_id: PROJ, title: `工地會議/巡查 sim ${++c}`, starts_at: dayISO(-(k)), created_by: uid(ph), event_type: ['meeting', 'inspection', 'milestone', 'other'][k % 4] })
      rec(F, ph, `加事件`, 'allow', r)
    }
  }
  // deny: judou + worker
  for (const ph of [ACC.z[0].jud, ACC.z[0].wkr, ACC.z[1].jud, ACC.owner, ACC.safety]) {
    rec(F, ph, `越權加事件`, 'deny', await insert('events', await login(ph), { project_id: PROJ, title: '越權事件', starts_at: new Date().toISOString(), created_by: uid(ph), event_type: 'other' }))
  }
}

async function simContacts() {
  const F = '聯絡人'
  const pm = await login(ACC.pm)
  const trades = ['電工', '水喉', '紮鐵', '棚架', '機電', '泥水', '油漆', '玻璃', '消防', '吊船', '清拆', '園境', '防水', '冷氣', '雲石', '鋁窗', '天花', '地板', '門鎖', '燒焊']
  for (let i = 0; i < trades.length; i++) {
    rec(F, ACC.pm, `PM 加聯絡人 ${trades[i]}`, 'allow', await insert('contacts', pm, { project_id: PROJ, name: `${trades[i]}師傅${i + 1}`, trade: trades[i], phone: `9${String(1000000 + i).slice(-7)}`, created_by: uid(ACC.pm) }))
  }
  // deny: everyone else
  for (const ph of [ACC.z[0].eng, ACC.z[0].jud, ACC.z[0].wkr, ACC.gf, ACC.owner, ACC.safety, ACC.z[1].fore, ACC.z[2].jud, ACC.z[3].eng, ACC.z[1].wkr]) {
    rec(F, ph, `越權加聯絡人`, 'deny', await insert('contacts', await login(ph), { project_id: PROJ, name: '越權', trade: '電工', phone: '90000000', created_by: uid(ph) }))
  }
}

async function simDocuments() {
  const F = '文件/圖則'
  // next_document_number: allow MAT/MS for judou/MC/老總; deny drawing for judou/老總
  const types = ['material_submission', 'method_statement', 'inspection', 'other']
  for (const z of [ACC.z[0], ACC.z[1]]) {
    for (const ph of [z.jud, z.eng, z.fore]) {
      const jwt = await login(ph)
      for (const t of types) {
        rec(F, ph, `取文件編號 ${t}`, 'allow', await rpc('next_document_number', jwt, { p_project_id: PROJ, p_type: t }))
      }
    }
  }
  // 老總 doc number allow
  const gf = await login(ACC.gf)
  rec(F, ACC.gf, `老總取文件編號`, 'allow', await rpc('next_document_number', gf, { p_project_id: PROJ, p_type: 'other' }))
  // deny: drawing number for judou + 老總 + worker (D-25)
  for (const ph of [ACC.z[0].jud, ACC.gf, ACC.z[0].wkr]) {
    rec(F, ph, `取圖則編號 (D-25)`, 'deny', await rpc('next_document_number', await login(ph), { p_project_id: PROJ, p_type: 'drawing' }))
  }
  // drawing number for PM + MC allow
  for (const ph of [ACC.pm, ACC.z[0].eng]) {
    rec(F, ph, `取圖則編號`, 'allow', await rpc('next_document_number', await login(ph), { p_project_id: PROJ, p_type: 'drawing' }))
  }
  // deny: worker doc number
  rec(F, ACC.z[0].wkr, `工人取文件編號`, 'deny', await rpc('next_document_number', await login(ACC.z[0].wkr), { p_project_id: PROJ, p_type: 'other' }))
}

// ---- run ----
;(async () => {
  const steps = [
    ['進度', simProgress], ['問題', simIssues], ['工地指令', simSI], ['變更指令', simVO],
    ['工作許可證', simPTW], ['機械/表格', simEquipment], ['每日日誌', simDailies],
    ['物料', simMaterials], ['行事曆', simEvents], ['聯絡人', simContacts], ['文件/圖則', simDocuments],
  ]
  for (const [name, fn] of steps) {
    process.stdout.write(`\n=== ${name} ===\n`)
    try { await fn() } catch (e) { console.error(`${name} ERROR`, e.message) }
    const f = LOG.filter(x => x.feature.startsWith(name.slice(0, 2)))
    console.log(`  ${f.length} tx · pass ${f.filter(x => x.pass).length} · fail ${f.filter(x => !x.pass).length}`)
  }

  // ---- write output ----
  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.join(__dirname, '..', '..', '.planning', 'sim-runs', runId)
  fs.mkdirSync(dir, { recursive: true })
  const feats = [...new Set(LOG.map(x => x.feature))]
  for (const ft of feats) fs.writeFileSync(path.join(dir, `${ft.replace(/[\/]/g, '_')}.json`), JSON.stringify(LOG.filter(x => x.feature === ft), null, 2))
  const csv = ['feature,seq,actor,action,expected,actual,pass,note', ...LOG.map(x => [x.feature, x.seq, x.actor, x.action, x.expected, x.actual, x.pass, x.note].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
  fs.writeFileSync(path.join(dir, 'master.csv'), csv)
  let md = `# Sim run ${runId}\n\n總 ${LOG.length} transactions · pass ${LOG.filter(x => x.pass).length} · **fail ${LOG.filter(x => !x.pass).length}**\n\n`
  for (const ft of feats) {
    const f = LOG.filter(x => x.feature === ft)
    md += `## ${ft} — ${f.length} tx (pass ${f.filter(x => x.pass).length} / fail ${f.filter(x => !x.pass).length})\n\n`
    const fails = f.filter(x => !x.pass)
    if (fails.length) { md += `**FAIL:**\n`; for (const x of fails) md += `- seq${x.seq} ${x.actor} | ${x.action} | exp ${x.expected} | got ${x.actual}\n`; md += `\n` }
  }
  fs.writeFileSync(path.join(dir, 'summary.md'), md)
  console.log(`\nTOTAL ${LOG.length} tx · pass ${LOG.filter(x => x.pass).length} · fail ${LOG.filter(x => !x.pass).length}`)
  console.log('output →', dir)
})()
