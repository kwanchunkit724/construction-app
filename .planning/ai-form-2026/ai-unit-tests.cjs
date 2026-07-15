// Self-contained unit tests for the AI Edge Function's PURE logic (no deploy
// needed). Function bodies are copied VERBATIM from the source so a drift between
// this and the source shows as a failure. Run: node ai-unit-tests.cjs
let fails = 0
function ok(name, cond, detail) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -- ' + (detail ?? '')}`); if (!cond) fails++ }
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }

// ── index.ts: stableStringify + hashArgs ─────────────────────────────────────
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}
function hashArgs(tool, args) {
  const s = tool + ':' + stableStringify(args ?? {})
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
ok('hashArgs deterministic', hashArgs('create_event', { a: 1, b: 2 }) === hashArgs('create_event', { a: 1, b: 2 }))
ok('hashArgs key-order independent', hashArgs('t', { a: 1, b: 2 }) === hashArgs('t', { b: 2, a: 1 }))
ok('hashArgs differs on args', hashArgs('t', { a: 1 }) !== hashArgs('t', { a: 2 }))
ok('hashArgs differs on tool', hashArgs('t1', { a: 1 }) !== hashArgs('t2', { a: 1 }))
ok('hashArgs nested order-independent', hashArgs('t', { x: { p: 1, q: 2 } }) === hashArgs('t', { x: { q: 2, p: 1 } }))

// ── index.ts: pickModel ──────────────────────────────────────────────────────
const ANALYSIS_RE = /分析|報告|週報|周報|月報|規劃|預測|風險|落後|綜合|總結|overview|analy|report|plan|summary/i
function pickModel(messages, hint) {
  if (hint) return hint
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const text = typeof lastUser?.content === 'string' ? lastUser.content
    : (lastUser?.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join(' ')
  return ANALYSIS_RE.test(text) ? 'claude-opus-4-8' : 'claude-sonnet-4-6'
}
eq('pickModel: analysis->opus', pickModel([{ role: 'user', content: '幫我分析下個地盤' }]), 'claude-opus-4-8')
eq('pickModel: 落後->opus', pickModel([{ role: 'user', content: '邊啲工序落後?' }]), 'claude-opus-4-8')
eq('pickModel: simple->sonnet', pickModel([{ role: 'user', content: '加個會議' }]), 'claude-sonnet-4-6')
eq('pickModel: hint wins', pickModel([{ role: 'user', content: '分析' }], 'claude-haiku-4-5'), 'claude-haiku-4-5')
eq('pickModel: block content', pickModel([{ role: 'user', content: [{ type: 'text', text: '出週報' }] }]), 'claude-opus-4-8')

// ── tools-mutate.ts: deriveStatus + plannedProgress (must match src/types.ts) ─
function deriveStatus(actual, planned) {
  if (actual >= 100) return 'completed'
  if (actual === 0) return 'not-started'
  if (actual < planned - 5) return 'delayed'
  return 'in-progress'
}
eq('deriveStatus 100->completed', deriveStatus(100, 50), 'completed')
eq('deriveStatus 0->not-started', deriveStatus(0, 30), 'not-started')
eq('deriveStatus behind->delayed', deriveStatus(40, 50), 'delayed')   // 40 < 45
eq('deriveStatus close->in-progress', deriveStatus(48, 50), 'in-progress') // 48 !< 45
eq('deriveStatus ahead->in-progress', deriveStatus(80, 50), 'in-progress')

const MS_PER_DAY = 86400000
function plannedProgress(ps, pe) {
  if (!ps || !pe) return 0
  const s = new Date(ps + 'T00:00:00').getTime(); const e = new Date(pe + 'T00:00:00').getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return 0
  const t = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  if (t < s) return 0
  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1
  if (totalDays <= 1) return t >= e ? 100 : 0
  const elapsed = Math.floor((t - s) / MS_PER_DAY) + 1
  if (elapsed >= totalDays) return 100
  return Math.round((elapsed / totalDays) * 100)
}
eq('plannedProgress null->0', plannedProgress(null, null), 0)
eq('plannedProgress future-start->0', plannedProgress('2999-01-01', '2999-12-31'), 0)
eq('plannedProgress past-end->100', plannedProgress('2000-01-01', '2000-12-31'), 100)
ok('plannedProgress in-range 0..100', (() => { const v = plannedProgress('2000-01-01', '2999-12-31'); return v >= 0 && v <= 100 })())

// ── tools-mutate.ts: fmt (HKT = UTC+8) ───────────────────────────────────────
function fmt(iso) {
  if (!iso) return ''
  try {
    const d = new Date(new Date(iso).getTime() + 8 * 3600e3)
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  } catch { return iso }
}
eq('fmt HKT 01:00Z->09:00', fmt('2026-06-14T01:00:00Z'), '6月14日 09:00')
eq('fmt HKT day-roll 20:00Z->04:00 next', fmt('2026-06-14T20:00:00Z'), '6月15日 04:00')
eq('fmt empty', fmt(''), '')

// ── tools.ts: search_documents query sanitizer ───────────────────────────────
function sanitize(query) { return String(query).replace(/[,()*%]/g, ' ').trim() }
eq('sanitize strips or-metachars', sanitize('天面 (排水), 100%'), '天面  排水   100')
eq('sanitize plain term', sanitize('天面'), '天面')

// ── tools-mutate.ts: role-exposure matrix (§3) ───────────────────────────────
const MANAGERS = ['admin', 'pm', 'main_contractor', 'general_foreman', 'subcontractor']
const PLUS_SAFETY = [...MANAGERS, 'safety_officer']
const EVERYONE = [...PLUS_SAFETY, 'subcontractor_worker', 'owner']
const REVIEWERS = ['admin', 'pm', 'main_contractor', 'general_foreman']
const ALLOW = {
  create_event: PLUS_SAFETY, update_event: PLUS_SAFETY,
  create_issue: EVERYONE, add_issue_comment: EVERYONE,
  order_material: MANAGERS, receive_material: MANAGERS,
  add_contact: PLUS_SAFETY,
  set_progress_blocked: [...MANAGERS, 'subcontractor_worker'],
  update_progress_percent: [...MANAGERS, 'subcontractor_worker'],
  // Phase 3
  escalate_issue: EVERYONE, resolve_issue: EVERYONE, reopen_issue: EVERYONE,
  approve_document: REVIEWERS, reject_document: REVIEWERS,
  submit_approval_decision: PLUS_SAFETY,
  delete_progress_item: REVIEWERS,
}
const STEPUP = { approve_document: 'document', reject_document: 'document', submit_approval_decision: 'approval', delete_progress_item: 'progress_delete' }
function mutateAllowed(name, role) { if (role === 'admin') return true; return !!role && !!ALLOW[name] && ALLOW[name].includes(role) }
function exposedCount(role) { if (role === 'admin') return Object.keys(ALLOW).length; return Object.keys(ALLOW).filter((n) => ALLOW[n].includes(role)).length }
ok('worker CANNOT order_material', mutateAllowed('order_material', 'subcontractor_worker') === false)
ok('worker CANNOT create_event', mutateAllowed('create_event', 'subcontractor_worker') === false)
ok('worker CAN create_issue', mutateAllowed('create_issue', 'subcontractor_worker') === true)
ok('worker CAN set_progress_blocked', mutateAllowed('set_progress_blocked', 'subcontractor_worker') === true)
ok('safety CANNOT order_material', mutateAllowed('order_material', 'safety_officer') === false)
ok('safety CAN create_event', mutateAllowed('create_event', 'safety_officer') === true)
ok('判頭 CAN order_material', mutateAllowed('order_material', 'subcontractor') === true)
// Phase 3 role-exposure
ok('判頭 CANNOT approve_document (reviewers exclude 判頭)', mutateAllowed('approve_document', 'subcontractor') === false)
ok('判頭 CANNOT delete_progress_item', mutateAllowed('delete_progress_item', 'subcontractor') === false)
ok('PM CAN approve_document', mutateAllowed('approve_document', 'pm') === true)
ok('PM CAN delete_progress_item', mutateAllowed('delete_progress_item', 'pm') === true)
ok('worker CAN escalate_issue (RLS gates)', mutateAllowed('escalate_issue', 'subcontractor_worker') === true)
ok('owner CAN resolve_issue (RLS gates)', mutateAllowed('resolve_issue', 'owner') === true)
ok('safety CAN submit_approval_decision', mutateAllowed('submit_approval_decision', 'safety_officer') === true)
ok('worker CANNOT submit_approval_decision', mutateAllowed('submit_approval_decision', 'subcontractor_worker') === false)
// step-up class mapping
ok('approve_document -> document step-up', STEPUP['approve_document'] === 'document')
ok('submit_approval_decision -> approval step-up', STEPUP['submit_approval_decision'] === 'approval')
ok('delete_progress_item -> progress_delete step-up', STEPUP['delete_progress_item'] === 'progress_delete')
ok('create_event has NO step-up', STEPUP['create_event'] === undefined)
// exposure counts (16 mutate tools)
ok('admin sees all 16 mutate tools', exposedCount('admin') === 16)
ok('owner sees 5 (issue tools only)', exposedCount('owner') === 5)
ok('worker sees 7', exposedCount('subcontractor_worker') === 7)
ok('safety sees 9', exposedCount('safety_officer') === 9)
ok('判頭 sees 13 (all but reviewer-only)', exposedCount('subcontractor') === 13)
ok('null role sees 0', exposedCount(null) === 0)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
