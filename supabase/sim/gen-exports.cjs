#!/usr/bin/env node
/*
 * gen-exports.cjs — generate REAL .xlsx exports from LIVE [TEST] project data,
 * mirroring the app's own export output (src/lib/export.ts).
 *
 * Run from repo root:  node supabase/sim/gen-exports.cjs
 *
 * It:
 *   1. parses .env for VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *   2. logs in as PM (62000001@phone.local) via gotrue password grant
 *   3. pulls the [TEST] project's progress_items / issues / materials /
 *      equipment_register / form_instances / form_signoffs / form_templates /
 *      contacts / issue_comments / user_profiles over PostgREST
 *   4. builds .xlsx workbooks with the SAME zh-HK headers + sheet names as the
 *      app (進度報告 / 問題清單+處理紀錄 / 機械登記+檢查狀態 / 聯絡人)
 *   5. writes them to .planning/sim-runs/exports/
 *
 * Pure Node (global fetch on Node 18+) + the `xlsx` dependency. CommonJS (.cjs)
 * because the repo package.json is "type":"module".
 */

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const PROJECT_ID = 'bbbb0000-0000-0000-0000-000000000001'
const PM_EMAIL = '62000001@phone.local'
const PM_PASSWORD = 'CKtest2026'
const OUT_DIR = path.join(REPO_ROOT, '.planning', 'sim-runs', 'exports')

// ── zh-HK label maps (verbatim from src/types.ts) ───────────────────────────
const PROGRESS_STATUS_ZH = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'delayed': '延誤',
  'blocked': '受阻',
}
const STATUS_MARK = {
  'delayed': '⚠ ', 'blocked': '■ ', 'in-progress': '', 'completed': '✓ ', 'not-started': '',
}
const ISSUE_STATUS_ZH = { open: '處理中', resolved: '已解決' }
const ISSUE_HANDLER_ZH = { pm: 'PM', main_contractor: '總承建商', subcontractor: '判頭', admin: '系統管理員' }
const ISSUE_ACTION_ZH = {
  reported: '報告問題', commented: '留言', escalated: '上呈', resolved: '標記為已解決', reopened: '重新開啟',
}
const ROLE_ZH = {
  admin: '系統管理員', pm: '項目經理 (PM)', main_contractor: '總承建商員工',
  subcontractor: '判頭', subcontractor_worker: '判頭工人', owner: '業主',
  safety_officer: '安全主任', general_foreman: '老總',
}
const EQUIPMENT_KIND_ZH = {
  scaffold: '棚架', excavation: '挖掘工程', lifting_appliance: '起重機械', swp: '吊船', other: '其他',
}
const EQUIPMENT_STATUS_ZH = { active: '使用中', idle: '閒置', offsite: '已離場', retired: '已退役' }
const FORM_RESULT_ZH = { pass: '合格', pass_with_remarks: '合格 (有備註)', fail: '不合格' }
const FORM_STATUS_ZH = { valid: '有效', expiring: '即將到期', expired: '過期', missing: '未簽', suspended: '停用' }

// ── helpers (mirror src/types.ts + src/lib/export.ts) ───────────────────────
function dateStr() { return new Date().toISOString().slice(0, 10) }
function safeName(name) { return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) }
function zhTime(s) { return s ? new Date(s).toLocaleString('zh-HK') : '' }
function zhDate(s) { return s ? new Date(s).toLocaleDateString('zh-HK') : '' }
function formatIssueNo(n) { return n ? '#' + String(n).padStart(3, '0') : '—' }
const yesNo = (v) => v == null ? '' : v ? '是' : '否'

function deriveStatus(actual, planned) {
  if (actual >= 100) return 'completed'
  if (actual === 0) return planned > 0 ? 'delayed' : 'not-started'
  if (actual < planned - 10) return 'delayed'
  return 'in-progress'
}
function isScheduled(it) { return !!(it.planned_start && it.planned_end) }
function plannedProgressOf(it) { return it.planned_progress ?? 0 }

// computeRollup: qty-weighted average over leaves (quantity leaves carry weight
// = qty_total, others weight 1). Mirrors src/types.ts computeRollup intent:
// excludes UNSCHEDULED leaves from the planned average.
function computeRollup(leaves) {
  if (leaves.length === 0) return { actual: 0, planned: 0, status: 'not-started' }
  const weightOf = (l) => (l.tracking_mode === 'quantity' && l.qty_total && l.qty_total > 0) ? Number(l.qty_total) : 1
  let aw = 0, an = 0
  for (const l of leaves) { const w = weightOf(l); aw += Number(l.actual_progress) * w; an += w }
  const actual = an > 0 ? Math.round(aw / an) : 0
  const sched = leaves.filter(isScheduled)
  let pw = 0, pn = 0
  for (const l of sched) { const w = weightOf(l); pw += plannedProgressOf(l) * w; pn += w }
  const planned = pn > 0 ? Math.round(pw / pn) : 0
  return { actual, planned, status: deriveStatus(actual, planned) }
}

function deriveFormStatus(inst, remindBeforeDays) {
  if (inst.suspended) return 'suspended'
  if (!inst.valid_until) return 'missing'
  const now = Date.now()
  const until = new Date(inst.valid_until).getTime()
  if (Number.isNaN(until)) return 'missing'
  if (until < now) return 'expired'
  if (until <= now + remindBeforeDays * 86400000) return 'expiring'
  return 'valid'
}

function trackingLabel(it) {
  switch (it.tracking_mode) {
    case 'floors':
      return `${(it.floors_completed || []).length}/${(it.floor_labels || []).length}樓`
    case 'checklist':
      return `✓${(it.floors_completed || []).length}/${(it.floor_labels || []).length}`
    case 'quantity':
      return `${it.qty_done ?? 0}/${it.qty_total ?? '?'}${it.qty_unit ?? ''}`
    case 'unit_status': {
      const labels = it.floor_labels || []
      const map = it.label_status || {}
      const total = labels.length
      let signedOff = 0, fixed = 0
      for (const k of labels) {
        const st = map[k]
        if (st === 'signed_off') signedOff++
        else if (st === 'fixed') fixed++
      }
      const pending = total - signedOff - fixed
      return `已簽收 ${signedOff} / 修復中 ${fixed} / 待驗 ${pending}`
    }
    default:
      return ''
  }
}

// ── .env parsing ────────────────────────────────────────────────────────────
function parseEnv() {
  const envPath = path.join(REPO_ROOT, '.env')
  const text = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

// ── REST helpers ────────────────────────────────────────────────────────────
async function login(url, anon) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PM_EMAIL, password: PM_PASSWORD }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`login failed (${res.status}): ${body}`)
  }
  const json = await res.json()
  if (!json.access_token) throw new Error('login: no access_token in response')
  return json.access_token
}

function makeRest(url, anon, jwt) {
  return async function rest(pathAndQuery) {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      headers: { 'apikey': anon, 'Authorization': `Bearer ${jwt}`, 'Accept': 'application/json' },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`REST ${pathAndQuery} failed (${res.status}): ${body}`)
    }
    return res.json()
  }
}

// ── workbook writers ────────────────────────────────────────────────────────
function writeWb(wb, filename) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const full = path.join(OUT_DIR, filename)
  fs.writeFileSync(full, buf)
  return { full, bytes: buf.length }
}

// 1) 進度報告 — mirrors exportProgressToExcel (internal preset: depth 3,
//    no 未開始, groupByZone, showSummary, showGap). aoa_to_sheet, one sheet '進度報告'.
function buildProgressWb(project, items) {
  const isLeaf = (it) => !items.some(i => i.parent_id === it.id)
  const UNZONED = '__unzoned__'
  const zoneKeyOf = (it) => (it.zone_id && project.zones.some(z => z.id === it.zone_id)) ? it.zone_id : UNZONED
  const zoneNameOf = (key) => key === UNZONED ? '未分區 / 共用' : (project.zones.find(z => z.id === key)?.name ?? key)

  const effOf = (it) => {
    if (isLeaf(it)) {
      const actual = Number(it.actual_progress)
      if (!isScheduled(it)) return { actual, planned: null, status: deriveStatus(actual, 0), gap: null }
      const planned = plannedProgressOf(it)
      return { actual, planned, status: deriveStatus(actual, planned), gap: actual - planned }
    }
    const leaves = descendantLeaves(items, it.id, isLeaf)
    const r = computeRollup(leaves)
    return { actual: r.actual, planned: r.planned, status: r.status, gap: r.actual - r.planned }
  }

  // internal preset: statuses = all except 'not-started'
  const statusSel = new Set(['in-progress', 'completed', 'delayed', 'blocked'])
  const inScope = (it) => zoneKeyOf(it) === UNZONED ? true : project.zones.some(z => z.id === it.zone_id)
  const scopeItems = items // includeUnzoned true + all zones selected
  const byId = new Map(items.map(i => [i.id, i]))
  const qualifies = (it) => statusSel.has(effOf(it).status)
  const keep = new Set()
  for (const it of scopeItems) {
    if (!qualifies(it)) continue
    keep.add(it.id)
    let p = it.parent_id ? byId.get(it.parent_id) : undefined
    while (p) { keep.add(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined }
  }
  const depth = 3
  const display = scopeItems.filter(it => keep.has(it.id) && it.level <= depth)

  const zoneOrder = [...project.zones.map(z => z.id), UNZONED]
  const displayByZone = new Map()
  for (const it of display) {
    const k = zoneKeyOf(it)
    if (!displayByZone.has(k)) displayByZone.set(k, [])
    displayByZone.get(k).push(it)
  }

  // overall summary (all in-scope leaves)
  const scopeLeaves = scopeItems.filter(isLeaf)
  const sr = computeRollup(scopeLeaves)
  const counts = { 'not-started': 0, 'in-progress': 0, 'completed': 0, 'delayed': 0, 'blocked': 0 }
  for (const l of scopeLeaves) counts[deriveStatus(Number(l.actual_progress), plannedProgressOf(l))]++
  const behind = scopeLeaves.filter(l => (Number(l.actual_progress) - plannedProgressOf(l)) < -10).length
  const sgap = sr.actual - sr.planned
  const verdictLine = `${project.name} — 整體 ${sr.actual}%，` +
    (sgap < -3 ? `落後計劃 ${-sgap}%` : sgap > 3 ? `超前 ${sgap}%` : '貼近計劃') +
    (behind > 0 ? `，${behind} 項要跟進` : '')

  const aoa = []
  aoa.push([verdictLine])
  aoa.push([`${project.name} — 進度報告`])
  aoa.push([`產生：${new Date().toLocaleString('zh-HK')}`])
  aoa.push([`整體：計劃 ${sr.planned}% / 實際 ${sr.actual}% / 差距 ${sgap}%   ·   落後 ${behind} 項 / 共 ${scopeLeaves.length} 項`])
  aoa.push([`延誤 ${counts.delayed} · 阻塞 ${counts.blocked} · 進行中 ${counts['in-progress']} · 已完成 ${counts.completed} · 未開始 ${counts['not-started']}`])
  aoa.push([])

  // header (showGap = true)
  const header = ['分區', '編號', '名稱', '層級', '追蹤模式', '計劃%', '實際%', '差距', '狀態', '計劃開始', '計劃完成', '備注']
  aoa.push(header)
  let dataRows = 0

  for (const key of zoneOrder) {
    const zItems = displayByZone.get(key)
    if (!zItems || zItems.length === 0) continue
    const zoneName = zoneNameOf(key)
    // zone agg from ALL in-scope leaves in that zone
    const zoneLeaves = scopeItems.filter(i => isLeaf(i) && zoneKeyOf(i) === key)
    const zr = computeRollup(zoneLeaves)
    const zbehind = zoneLeaves.filter(l => (Number(l.actual_progress) - plannedProgressOf(l)) < -10).length

    // zone header + subtotal (groupByZone)
    aoa.push([`▌ ${zoneName}`]); dataRows++
    const sub = []
    sub[0] = '　小計'; sub[2] = `${zoneLeaves.length} 項 · 落後 ${zbehind}`
    sub[5] = zr.planned; sub[6] = zr.actual; sub[7] = zr.actual - zr.planned
    sub[8] = PROGRESS_STATUS_ZH[zr.status]
    aoa.push(sub); dataRows++

    // DFS tree order within the zone (sorted by code)
    const zSet = new Set(zItems.map(i => i.id))
    const byParent = new Map()
    for (const it of zItems) {
      const pk = it.parent_id && zSet.has(it.parent_id) ? it.parent_id : null
      if (!byParent.has(pk)) byParent.set(pk, [])
      byParent.get(pk).push(it)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => String(a.code).localeCompare(String(b.code)))
    const dfs = (pid, d) => {
      for (const it of byParent.get(pid) || []) {
        const e = effOf(it)
        const cells = []
        cells[0] = ''
        cells[1] = it.code
        cells[2] = '　'.repeat(d) + it.title
        cells[3] = it.level
        cells[4] = trackingLabel(it)
        cells[5] = e.planned === null ? '未排期' : e.planned
        cells[6] = e.actual
        cells[7] = e.gap === null ? '—' : e.gap
        cells[8] = STATUS_MARK[e.status] + PROGRESS_STATUS_ZH[e.status]
        cells[9] = it.planned_start ?? ''
        cells[10] = it.planned_end ?? ''
        cells[11] = isLeaf(it) ? (it.notes ?? '') : ''
        aoa.push(cells); dataRows++
        dfs(it.id, d + 1)
      }
    }
    dfs(null, 0)
    aoa.push([]); dataRows++
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = header.map((h, i) => ({ wch: i === 2 ? 40 : (h.length > 4 ? 12 : 9) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '進度報告')
  return { wb, sheets: { '進度報告': dataRows } }
}

function descendantLeaves(items, rootId, isLeaf) {
  const childrenOf = new Map()
  for (const it of items) {
    if (!childrenOf.has(it.parent_id)) childrenOf.set(it.parent_id, [])
    childrenOf.get(it.parent_id).push(it)
  }
  const out = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()
    for (const c of childrenOf.get(id) || []) {
      if (isLeaf(c)) out.push(c)
      else stack.push(c.id)
    }
  }
  return out
}

// 2) 問題清單 + 處理紀錄 — mirrors exportIssuesToExcel (json_to_sheet).
function buildIssuesWb(issues, usersById, comments) {
  const nameOf = (id) => id ? (usersById[id]?.name ?? '前成員') : ''
  const rows = issues
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(i => ({
      編號: formatIssueNo(i.issue_no),
      位置: i.location ?? '',
      狀態: ISSUE_STATUS_ZH[i.status] ?? i.status,
      標題: i.title,
      描述: i.description,
      照片數: (i.photos || []).length,
      報告者: usersById[i.reporter_id]?.name ?? '前成員',
      報告者角色: ROLE_ZH[i.reporter_role] ?? i.reporter_role,
      當前處理層: ISSUE_HANDLER_ZH[i.current_handler_role] ?? i.current_handler_role,
      解決者: i.resolved_by ? (usersById[i.resolved_by]?.name ?? '前成員') : '',
      報告時間: zhTime(i.created_at),
      解決時間: i.resolved_at ? zhTime(i.resolved_at) : '',
    }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 6 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '問題清單')

  // Sheet 2 — 處理紀錄
  const issueById = new Map(issues.map(i => [i.id, i]))
  const handlerZh = (r) => r ? (ISSUE_HANDLER_ZH[r] ?? r) : ''
  const logRows = comments
    .slice()
    .sort((a, b) => {
      const ia = issueById.get(a.issue_id)?.issue_no ?? 0
      const ib = issueById.get(b.issue_id)?.issue_no ?? 0
      if (ia !== ib) return ia - ib
      return String(a.created_at).localeCompare(String(b.created_at))
    })
    .map(c => {
      const iss = issueById.get(c.issue_id)
      return {
        編號: formatIssueNo(iss?.issue_no ?? null),
        問題標題: iss?.title ?? '',
        時間: zhTime(c.created_at),
        動作: ISSUE_ACTION_ZH[c.action] ?? c.action,
        操作人: nameOf(c.author_id),
        內容: c.body ?? '',
        由: handlerZh(c.from_role),
        至: handlerZh(c.to_role),
      }
    })
  const ws2 = XLSX.utils.json_to_sheet(logRows)
  ws2['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, '處理紀錄')
  return { wb, sheets: { '問題清單': rows.length, '處理紀錄': logRows.length } }
}

// 3) 機械登記 + 檢查狀態 — mirrors exportEquipmentRegister (json_to_sheet x2).
function buildEquipmentWb(project, equipment, instances, signoffsByInstance, templateById, usersById) {
  const equipRows = equipment
    .slice()
    .sort((a, b) => String(a.ref_no).localeCompare(String(b.ref_no)))
    .map(eq => ({
      編號: eq.ref_no,
      名稱: eq.name_zh,
      類別: EQUIPMENT_KIND_ZH[eq.kind] ?? eq.kind,
      品牌型號: eq.brand_model ?? '',
      序號: eq.serial_no ?? '',
      位置: eq.location_zh ?? '',
      狀態: EQUIPMENT_STATUS_ZH[eq.status] ?? eq.status,
    }))
  const ws1 = XLSX.utils.json_to_sheet(equipRows)
  ws1['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '機械登記')

  const equipNameById = new Map(equipment.map(eq => [eq.id, `${eq.ref_no} ${eq.name_zh}`]))
  const latestSignoff = (arr) => (!arr || arr.length === 0) ? null
    : arr.slice().sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))[0]

  const counts = { valid: 0, expiring: 0, expired: 0, missing: 0, suspended: 0 }
  const inspRows = instances
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(inst => {
      const tpl = templateById[inst.template_id]
      const status = deriveFormStatus(inst, tpl?.remind_before_days ?? 0)
      counts[status] = (counts[status] || 0) + 1
      const last = latestSignoff(signoffsByInstance[inst.id])
      const equipName = inst.equipment_id ? (equipNameById.get(inst.equipment_id) ?? '') : ''
      return {
        機械: equipName,
        表格: tpl ? `${tpl.name_zh}（${tpl.code}）` : '',
        法定依據: tpl?.statutory_ref ?? '',
        狀態: FORM_STATUS_ZH[status],
        有效至: inst.valid_until ? zhDate(inst.valid_until) : '',
        最後簽署: last ? zhTime(last.signed_at) : '',
        簽署人: last ? (usersById[last.signed_by]?.name ?? '前成員') : '',
        結果: last ? (FORM_RESULT_ZH[last.result] ?? last.result) : '',
        暫停: yesNo(inst.suspended),
      }
    })
  const ws2 = XLSX.utils.json_to_sheet(inspRows)
  ws2['!cols'] = [{ wch: 24 }, { wch: 26 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 8 }]
  // KPI header row appended (derived client-side; mirrors dashboard.counts line)
  XLSX.utils.sheet_add_aoa(ws2, [[
    `有效 ${counts.valid} · 即將到期 ${counts.expiring} · 過期 ${counts.expired} · 未簽 ${counts.missing} · 停用 ${counts.suspended}`,
  ]], { origin: -1 })
  XLSX.utils.book_append_sheet(wb, ws2, '檢查狀態')
  return { wb, sheets: { '機械登記': equipRows.length, '檢查狀態': inspRows.length } }
}

// 4) 聯絡人 — no export.ts equivalent; build from the contacts table directly,
//    using the same zh-HK field names the in-app 聯絡人 directory uses.
function buildContactsWb(contacts, usersById) {
  const rows = contacts
    .slice()
    .sort((a, b) => String(a.trade).localeCompare(String(b.trade)) || String(a.name).localeCompare(String(b.name)))
    .map(c => ({
      工種: c.trade ?? '',
      姓名: c.name ?? '',
      電話: c.phone ?? '',
      備註: c.notes ?? '',
      建立者: c.created_by ? (usersById[c.created_by]?.name ?? '前成員') : '',
      建立時間: zhTime(c.created_at),
    }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '聯絡人')
  return { wb, sheets: { '聯絡人': rows.length } }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const env = parseEnv()
  const url = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('.env missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
  console.log('Supabase URL:', url)
  console.log('Anon key:', anon ? `present (${anon.length} chars)` : 'MISSING')

  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('Logging in as PM…')
  const jwt = await login(url, anon)
  console.log('JWT acquired:', `${jwt.slice(0, 12)}… (${jwt.length} chars)`)
  const rest = makeRest(url, anon, jwt)

  const pid = `project_id=eq.${PROJECT_ID}`
  console.log('Fetching live data for [TEST] project', PROJECT_ID, '…')

  const [projects, items, issues, materials, equipment, instances, templates, contacts] =
    await Promise.all([
      rest(`projects?id=eq.${PROJECT_ID}&select=*`),
      rest(`progress_items?${pid}&select=*&order=code.asc`),
      rest(`issues?${pid}&select=*&order=created_at.desc`),
      rest(`materials?${pid}&select=*&order=created_at.desc`),
      rest(`equipment_register?${pid}&select=*&order=created_at.desc`),
      rest(`form_instances?${pid}&select=*&order=created_at.desc`),
      rest(`form_templates?active=eq.true&select=*&order=code.asc`),
      rest(`contacts?${pid}&select=*&order=trade.asc&order=name.asc`),
    ])

  const project = projects[0]
  if (!project) throw new Error('[TEST] project not found / not visible to PM')

  // issue_comments is keyed by issue_id (no project_id column) — fetch the
  // comments for this project's issues via an in.() filter.
  let comments = []
  if (issues.length > 0) {
    const issueIdList = issues.map(i => `"${i.id}"`).join(',')
    comments = await rest(`issue_comments?issue_id=in.(${issueIdList})&select=*&order=created_at.asc`)
  }
  // signoffs for this project (one round-trip), grouped by instance
  const signoffs = await rest(`form_signoffs?${pid}&select=*&order=signed_at.desc`)
  const signoffsByInstance = {}
  for (const s of signoffs) (signoffsByInstance[s.instance_id] ||= []).push(s)

  // user_profiles for name resolution — gather the ids we actually reference.
  const ids = new Set()
  for (const i of issues) { if (i.reporter_id) ids.add(i.reporter_id); if (i.resolved_by) ids.add(i.resolved_by) }
  for (const c of comments) if (c.author_id) ids.add(c.author_id)
  for (const s of signoffs) if (s.signed_by) ids.add(s.signed_by)
  for (const c of contacts) if (c.created_by) ids.add(c.created_by)
  let usersById = {}
  if (ids.size > 0) {
    const idList = [...ids].map(x => `"${x}"`).join(',')
    const profiles = await rest(`user_profiles?id=in.(${idList})&select=id,name,global_role`)
    usersById = Object.fromEntries(profiles.map(p => [p.id, p]))
  }

  console.log('Counts:', {
    progress_items: items.length, issues: issues.length, materials: materials.length,
    equipment: equipment.length, form_instances: instances.length, form_signoffs: signoffs.length,
    contacts: contacts.length, issue_comments: comments.length, templates: templates.length,
  })

  const templateById = Object.fromEntries(templates.map(t => [t.id, t]))

  // build + write all four workbooks
  const results = []
  {
    const { wb, sheets } = buildProgressWb(project, items)
    const { full, bytes } = writeWb(wb, '進度報告.xlsx')
    results.push({ file: full, bytes, sheets })
  }
  {
    const { wb, sheets } = buildIssuesWb(issues, usersById, comments)
    const { full, bytes } = writeWb(wb, '問題清單.xlsx')
    results.push({ file: full, bytes, sheets })
  }
  {
    const { wb, sheets } = buildEquipmentWb(project, equipment, instances, signoffsByInstance, templateById, usersById)
    const { full, bytes } = writeWb(wb, '機械登記冊.xlsx')
    results.push({ file: full, bytes, sheets })
  }
  {
    const { wb, sheets } = buildContactsWb(contacts, usersById)
    const { full, bytes } = writeWb(wb, '聯絡人.xlsx')
    results.push({ file: full, bytes, sheets })
  }

  console.log('\n=== WRITTEN FILES ===')
  for (const r of results) {
    console.log(`${path.basename(r.file)}  (${r.bytes} bytes)  sheets:`, r.sheets)
  }

  // ── verification: re-read each file with XLSX.readFile ─────────────────────
  console.log('\n=== VERIFICATION (re-read with XLSX.readFile) ===')
  for (const r of results) {
    const st = fs.statSync(r.file)
    if (st.size === 0) { console.log(`!! ${path.basename(r.file)} is EMPTY`); continue }
    const wb = XLSX.readFile(r.file)
    console.log(`\n${path.basename(r.file)} — ${st.size} bytes — sheets: [${wb.SheetNames.join(', ')}]`)
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
      const headerRow = aoa.find(row => Array.isArray(row) && row.some(c => c !== '' && c != null))
      const firstData = aoa.length > 1 ? aoa[1] : null
      console.log(`  [${name}] rows=${aoa.length}`)
      console.log(`    header/first line: ${JSON.stringify(headerRow)}`)
      if (firstData) console.log(`    second line:       ${JSON.stringify(firstData)}`)
    }
  }

  console.log('\nDone. Output dir:', OUT_DIR)
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1) })
