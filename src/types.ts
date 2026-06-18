export type GlobalRole =
  | 'admin'
  | 'pm'
  | 'main_contractor'
  | 'subcontractor'
  | 'subcontractor_worker'
  | 'owner'
  | 'safety_officer'
  | 'general_foreman'

export type SubRole = 'engineer' | 'foreman' | 'safety' | null

export type ProjectRole = Exclude<GlobalRole, 'admin'>

export type MembershipStatus = 'pending' | 'approved' | 'rejected'

export interface UserProfile {
  id: string
  phone: string
  name: string
  global_role: GlobalRole
  sub_role: SubRole
  company: string | null
  onesignal_id: string | null
  // ── P4 / S20 (v48): 平安咭 on the person, valid across sites. Nullable —
  // legacy rows and signup flow leave them null; surfaced to approvers via
  // admin_or_pm_list_applicants and editable by the owner on Profile.
  green_card_no: string | null
  green_card_expiry: string | null
  created_at: string
}

export interface Zone {
  id: string
  name: string
}

// ── Problem 4 / P1: project type ────────────────────────────
// One project-level field selects a progress-table "template" (see
// src/lib/progressTemplates.ts). 'general' is today's exact behaviour;
// existing projects default to it so live data renders byte-identical.
// drainage / maintenance are selectable in P1 but their bespoke modes
// (quantity / unit_status) only land in P2 / P3 — for now they fall back
// to checklist/percentage defaults from the registry.
export type ProjectType = 'general' | 'small_works' | 'drainage' | 'maintenance'

export const PROJECT_TYPE_ZH: Record<ProjectType, string> = {
  general: '大地盤 / 新建大樓',
  small_works: '小型工程 / 裝修',
  drainage: '渠務 / 地下管線',
  maintenance: '大樓維修 (MBIS/MWIS)',
}

export interface Project {
  id: string
  name: string
  zones: Zone[]
  assigned_pm_ids: string[]
  // P1: defaults to 'general' at the DB level (v42 migration). Older rows
  // that predate the column read back as 'general' too.
  project_type: ProjectType
  created_by: string | null
  created_at: string
}

export interface ProjectMember {
  id: string
  user_id: string
  project_id: string
  role: ProjectRole
  status: MembershipStatus
  applied_at: string
  approved_by: string | null
  approved_at: string | null
}

export const ROLE_ZH: Record<GlobalRole, string> = {
  admin: '系統管理員',
  pm: '項目經理 (PM)',
  main_contractor: '總承建商員工',
  subcontractor: '判頭',
  subcontractor_worker: '判頭工人',
  owner: '業主',
  safety_officer: '安全主任',
  general_foreman: '老總',
}

export const SUB_ROLE_ZH: Record<NonNullable<SubRole>, string> = {
  engineer: '工程師',
  foreman: '管工',
  safety: '安全部',
}

// ── Phase 3: Progress Tracking ──────────────────────────────
export type ProgressStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'
// 'checklist' (P1) reuses the floors storage (floor_labels / floors_completed)
// and floorsToProgress derivation — it differs only in rendering (a vertical
// tick-list of 工序 rather than a 樓層 grid). 'quantity' (P2, 渠務 / linear work)
// tracks qty_done/qty_total in a real unit (m / m2 / 個…) and derives % via
// qtyToProgress. 'unit_status' (P3, 大樓維修 / MBIS·MWIS) tracks a per-label
// state machine in label_status and derives % = signed_off/total via
// unitStatusToProgress. Widened in the DB by v42 (checklist), then
// v43-progress-quantity-mode.sql (quantity), then v44-progress-unit-status.sql
// (unit_status).
export type TrackingMode = 'percentage' | 'floors' | 'checklist' | 'quantity' | 'unit_status'

// ── P3 (v44): unit_status state machine (大樓維修 / defect register) ──
// A defect (室/位置) isn't a % and isn't a boolean tick — it walks a 5-state
// machine. % rolls up off the terminal 'signed_off' state (RI已簽收), with
// 'fixed' surfaced as a second number ("已修復 b / 已簽收 a / 共 n"). Order is
// load-bearing: the UpdateProgressModal chip cycles through it in sequence.
export type UnitState = 'pending' | 'fixing' | 'fixed' | 'reinspect' | 'signed_off'

export const UNIT_STATE_ORDER: UnitState[] = ['pending', 'fixing', 'fixed', 'reinspect', 'signed_off']

export const UNIT_STATE_ZH: Record<UnitState, string> = {
  pending: '未處理',
  fixing: '維修中',
  fixed: '已修復',
  reinspect: '待覆檢',
  signed_off: '已簽收',
}

// ── v57: progress-table 2-axis categorization (HKSMM5-aligned) ──
export type CategoryDomain = 'building' | 'external'
export type CategoryStream = 'civil' | 'bs'
export const CATEGORY_DOMAIN_ZH: Record<CategoryDomain, string> = { building: '大樓', external: '外圍' }
export const CATEGORY_STREAM_ZH: Record<CategoryStream, string> = { civil: '土建', bs: '屋宇裝備 (BS)' }

// ── v58: extreme-weather record (EOT) ──
export type WeatherKind = 't8' | 't9' | 't10' | 'black_rain' | 'red_rain' | 'amber_rain' | 'rainfall_20mm' | 'very_hot' | 'cold' | 'other'
export const WEATHER_KIND_ZH: Record<WeatherKind, string> = {
  t8: '八號風球', t9: '九號風球', t10: '十號風球',
  black_rain: '黑色暴雨', red_rain: '紅色暴雨', amber_rain: '黃色暴雨',
  rainfall_20mm: '24h雨量>20mm', very_hot: '酷熱', cold: '寒冷', other: '其他',
}
export interface WeatherEvent { id: string; hkt_date: string; kind: WeatherKind; station: string | null; evidence: any; created_at: string }
export interface WeatherClaim { id: string; project_id: string; hkt_date: string; trigger: string; on_critical_path: boolean | null; ready_to_work: boolean | null; tidy_days: number | null; claim_days: number | null; note: string | null; recorded_by: string | null; updated_at: string }

// Suggested 大項 per (domain, stream), from the HKSMM5 trade sections — used to
// seed the category picker + an optional "套用標準大項" template. zh-HK terms.
export const CATEGORY_TEMPLATES: Record<CategoryDomain, Record<CategoryStream, string[]>> = {
  building: {
    civil: ['結構（混凝土/紮鐵/釘板）', '鋼結構', '砌磚', '防水', '幕牆/外牆', '門窗', '間隔', '批盪', '天花', '地台/鋪砌', '木器/油漆', '玻璃'],
    bs: ['給排水（水喉/驗水）', '消防', '通風空調 (MVAC)', '升降機/電梯', '電力（電線井/上升總線）', 'ELV/BMS', '預留預埋 (BWIC)'],
  },
  external: {
    civil: ['地基/打樁', '連續牆/ELS', '開挖及填土', '道路/路面', '雨水及污水渠', '園境/綠化'],
    bs: ['外部給排水', '外部電力/街燈', '化糞池/泵房', '室外消防'],
  },
}

export interface ProgressItem {
  id: string
  project_id: string
  parent_id: string | null
  code: string
  title: string
  zone_id: string | null
  level: number
  planned_start: string | null
  planned_end: string | null
  planned_progress: number
  actual_progress: number
  status: ProgressStatus
  notes: string
  tracking_mode: TrackingMode
  floor_labels: string[]
  floors_completed: string[]
  // ── P2 (v43): quantity mode (渠務 / linear work) ──
  // qty_total = the run's total measure (e.g. 600 m); qty_done = how much is
  // laid (e.g. 230 m); qty_unit = the free-text unit (m / m2 / m3 / 個 / 件…).
  // Non-quantity leaves leave these at NULL / 0 — which is treated as weight=1
  // in computeRollup, so existing projects are byte-identical. % is still
  // materialised into actual_progress via qtyToProgress on every update.
  qty_total: number | null
  qty_done: number
  qty_unit: string | null
  // blocked_reason: when set, the item's DISPLAYED status forces 受阻 (blocked).
  // deriveStatus alone can never return 'blocked'; this is the only path that
  // surfaces a real stoppage reason (雨天 / 地下水 / 掘路紙 / 物料 / 其他).
  blocked_reason: string | null
  // ── P3 (v44): unit_status mode (大樓維修 / defect register) ──
  // A { label: UnitState } map (e.g. { "15/F-A": "signed_off", ... }). '{}' for
  // every non-unit_status leaf — i.e. every existing row — so the field is a
  // no-op until someone authors a 大樓維修 item. % is materialised into
  // actual_progress via unitStatusToProgress on every update, and the
  // signed-off labels are mirrored into floors_completed so legacy consumers
  // (export / history floor chips) degrade gracefully.
  label_status: Record<string, UnitState>
  // ── v57: 2-axis categorization (set on the 大項 / top-level item only) ──
  // domain = 大樓(building/superstructure) vs 外圍(external/site works);
  // stream = 土建(civil) vs 屋宇裝備 BS(E&M). NULL on existing rows → '未分類'.
  category_domain: CategoryDomain | null
  category_stream: CategoryStream | null
  assigned_to: string[]
  delegated_to: string[]
  last_updated_by: string | null
  last_updated_at: string
  created_at: string
}

export interface ProgressHistoryEntry {
  id: string
  item_id: string
  actual_progress: number
  floors_completed: string[]
  notes: string
  updated_by: string | null
  created_at: string
  // v38: a row is either a progress tick ('progress', default) or a metadata
  // edit ('meta', e.g. rename / date change). `meta` holds the diff of changed
  // keys as { key: [old, new] } for 'meta' rows; null for progress ticks.
  change_type?: 'progress' | 'meta'
  meta?: Record<string, [string | null, string | null]> | null
  // v43: for quantity-mode updates, the metres laid at this tick — so the
  // audit trail keeps the real number ("本期 +86m"), not just the % delta.
  // null on every non-quantity (and pre-v43) history row.
  qty_done?: number | null
  // v44: for unit_status updates, the per-label state map AT this tick (e.g.
  // { "15/F-C": "signed_off", ... }). The HistoryModal diffs consecutive rows
  // to render "15/F-C：已修復→已簽收". null on every non-unit_status (and
  // pre-v44) history row.
  label_status?: Record<string, UnitState> | null
}

// Helper: compute progress from floors_completed
export function floorsToProgress(completed: string[], all: string[]): number {
  if (all.length === 0) return 0
  return Math.round((completed.length / all.length) * 100)
}

// Helper: compute progress from a quantity pair (渠務 / linear work).
// 0 when total is falsy (un-set / zero — avoids divide-by-zero); otherwise
// round(done/total*100) clamped to 0–100 so an over-run (done > total) still
// materialises a valid 100 and a stray negative can't poison the rollup.
export function qtyToProgress(done: number, total: number | null | undefined): number {
  if (!total || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)))
}

// Helper: compute progress from a unit_status map (大樓維修 / defect register).
// % = round(signed_off / total * 100) — completion is RI sign-off (已簽收), not
// merely "fixed". `labels` is the authoritative label set (floor_labels); a
// label missing from the map counts as 'pending' (not signed-off). 0 when there
// are no labels (avoids divide-by-zero). Clamped 0–100 defensively.
export function unitStatusToProgress(
  labelStatus: Record<string, UnitState> | null | undefined,
  labels: string[],
): number {
  if (!labels || labels.length === 0) return 0
  const map = labelStatus ?? {}
  const signedOff = labels.reduce((n, l) => n + (map[l] === 'signed_off' ? 1 : 0), 0)
  return Math.max(0, Math.min(100, Math.round((signedOff / labels.length) * 100)))
}

// Helper: count the headline states for the unit_status badge / KPI tiles.
// total is taken from the authoritative `labels` set (so an un-touched label
// counts toward 共 N even before it appears in the map). signedOff/fixed read
// the map; a label not in the map is 'pending'. Used by ProgressItemCard's
// "簽收 a · 修復 b / n" badge and the maintenance zone-header numbers.
export function unitStatusCounts(
  labelStatus: Record<string, UnitState> | null | undefined,
  labels: string[],
): { signedOff: number; fixed: number; total: number } {
  const map = labelStatus ?? {}
  const ls = labels ?? []
  let signedOff = 0
  let fixed = 0
  for (const l of ls) {
    const s = map[l]
    if (s === 'signed_off') signedOff++
    else if (s === 'fixed') fixed++
  }
  return { signedOff, fixed, total: ls.length }
}

// Advance a unit_status label one step along UNIT_STATE_ORDER, cycling
// 已簽收 → 未處理. The unknown-value guard is load-bearing: a label whose stored
// value isn't in UNIT_STATE_ORDER (e.g. a legacy/AI/imported 'unprocessed' that
// v44 had no CHECK to reject) yields indexOf === -1 → (-1 + 1) % n === 0, which
// would silently RESET it to 'pending' on the first tap and destroy the dispute
// trail. Instead an unknown value advances to 'fixing' (the natural "work has
// started" step), so a tap never quietly rewinds the record. Owned here (types)
// so every consumer — UpdateProgressModal included — shares one safe mapping.
export function nextUnitState(s: UnitState | string): UnitState {
  const i = UNIT_STATE_ORDER.indexOf(s as UnitState)
  if (i === -1) return 'fixing'
  return UNIT_STATE_ORDER[(i + 1) % UNIT_STATE_ORDER.length]
}

export const PROGRESS_STATUS_ZH: Record<ProgressStatus, string> = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'delayed': '落後',
  'blocked': '受阻',
}

// ── Schedule-derived planned progress ───────────────────────
// Where the PLAN says we should be today: linear from planned_start to
// planned_end, counting inclusive days (start day = day 1 of the span).
// e.g. start=Day1, end=Day15 (15-day span), today=Day3 → 3/15 = 20%.
// Before start → 0; on/after end → 100; no dates → 0 (treat as un-scheduled).
const MS_PER_DAY = 86400000
function dateOnlyMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
export function plannedProgressOf(
  item: { planned_start: string | null; planned_end: string | null },
  today: Date = new Date(),
): number {
  const { planned_start, planned_end } = item
  if (!planned_start || !planned_end) return 0
  const s = new Date(planned_start + 'T00:00:00').getTime()
  const e = new Date(planned_end + 'T00:00:00').getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return 0
  const t = dateOnlyMs(today)
  if (t < s) return 0
  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1 // inclusive
  if (totalDays <= 1) return t >= e ? 100 : 0
  const elapsedDays = Math.floor((t - s) / MS_PER_DAY) + 1 // start day counts as 1
  if (elapsedDays >= totalDays) return 100
  return Math.round((elapsedDays / totalDays) * 100)
}

// Schedule variance: actual − planned. Positive = 超前 (ahead), negative = 落後.
export function scheduleVariance(
  item: { planned_start: string | null; planned_end: string | null },
  actual: number,
  today: Date = new Date(),
): number {
  return actual - plannedProgressOf(item, today)
}
export function isScheduled(item: { planned_start: string | null; planned_end: string | null }): boolean {
  return !!item.planned_start && !!item.planned_end
}

// Auto-derive status from progress vs planned
export function deriveStatus(actual: number, planned: number): ProgressStatus {
  if (actual >= 100) return 'completed'
  if (actual === 0 && planned === 0) return 'not-started'
  if (actual === 0) return 'not-started'
  if (actual < planned - 5) return 'delayed'
  return 'in-progress'
}

// ── Roll-up helpers ─────────────────────────────────────────
// A leaf is an item with no children. Leaves carry manual progress.
// Non-leaves (and zones) aggregate progress from descendant leaves.

export function isLeaf(item: ProgressItem, allItems: ProgressItem[]): boolean {
  return !allItems.some(i => i.parent_id === item.id)
}

export function getDescendantLeaves(allItems: ProgressItem[], parentId: string): ProgressItem[] {
  const directChildren = allItems.filter(i => i.parent_id === parentId)
  if (directChildren.length === 0) return []
  return directChildren.flatMap(c => {
    const grandChildren = allItems.filter(i => i.parent_id === c.id)
    return grandChildren.length === 0 ? [c] : getDescendantLeaves(allItems, c.id)
  })
}

export function getZoneLeaves(allItems: ProgressItem[], zoneId: string): ProgressItem[] {
  // All level-1 items in this zone, then walk down to leaves
  const roots = allItems.filter(i => i.parent_id === null && i.zone_id === zoneId)
  return roots.flatMap(r => {
    const isRootLeaf = !allItems.some(i => i.parent_id === r.id)
    return isRootLeaf ? [r] : getDescendantLeaves(allItems, r.id)
  })
}

export interface Rollup {
  actual: number
  planned: number
  status: ProgressStatus
  leafCount: number
  scheduledCount: number
  // ── P2 (v43): quantity roll-up extras (additive, backwards-compatible) ──
  // qtySum / qtyTotal / qtyUnit are non-null ONLY when EVERY leaf in the set is
  // quantity-mode and they all share one qty_unit — i.e. a pure 渠務 branch
  // measured in the same unit. Then the consumer can show "已鋪 230/600 m"
  // alongside the %. Mixed units (m + 個) or a mix of modes → all null, the
  // Σ is suppressed, and weighting falls back to equal weight (= today). Any
  // existing project leaves these null, so every current rollup is unchanged.
  qtySum: number | null
  qtyTotal: number | null
  qtyUnit: string | null
}

// A leaf weighs into the rollup average by qty_total ONLY when the whole leaf
// set is quantity-mode in one shared unit; otherwise every leaf weighs 1 (the
// historical equal-weight behaviour). Returns null when not weightable so the
// caller falls back to the plain mean — guaranteeing byte-identical numbers
// for every non-quantity (i.e. every existing) project. The non-null result
// ALSO drives the rollup's "已鋪 230/600 m" Σ badge, which is why it stays
// strict: a Σ only makes sense when every leaf is sized in the one unit.
function quantityWeighting(
  leaves: ProgressItem[],
): { unit: string; sumDone: number; sumTotal: number; weights: number[] } | null {
  if (leaves.length === 0) return null
  // Must be ALL quantity-mode with a positive qty_total on every leaf — a single
  // non-quantity or un-sized leaf disqualifies the whole set (can't weight it).
  let unit: string | null = null
  for (const l of leaves) {
    if (l.tracking_mode !== 'quantity') return null
    const total = l.qty_total
    if (total == null || total <= 0) return null
    const u = (l.qty_unit ?? '').trim()
    if (!u) return null
    if (unit === null) unit = u
    else if (unit !== u) return null // mixed units → not weightable
  }
  if (unit === null) return null
  const weights = leaves.map(l => l.qty_total as number)
  const sumTotal = weights.reduce((s, w) => s + w, 0)
  const sumDone = leaves.reduce((s, l) => s + (l.qty_done ?? 0), 0)
  if (sumTotal <= 0) return null
  return { unit, sumDone, sumTotal, weights }
}

// Per-leaf rollup weights for a MIXED-mode parent (small-reno finding): when a
// branch mixes a sized quantity leaf (e.g. B.1 機電 320m run) with percentage /
// checklist leaves, the old code fell back to a naive equal-weight mean — so a
// big 320m electrical run counted the same as a tiny blocked stub. Here each
// sized quantity leaf keeps its qty_total as weight while every other leaf
// weighs 1 (its historical weight), so the bulk-of-work leaf pulls the parent %
// proportionally without us inventing a weight for unsized work. Returns null
// when no quantity leaf is present (or none is sized) so the caller keeps the
// plain mean — every non-quantity (i.e. existing) parent is byte-identical.
function mixedQuantityWeights(leaves: ProgressItem[]): number[] | null {
  if (leaves.length === 0) return null
  let anySized = false
  const weights = leaves.map(l => {
    if (l.tracking_mode === 'quantity' && l.qty_total != null && l.qty_total > 0) {
      anySized = true
      return l.qty_total
    }
    return 1
  })
  return anySized ? weights : null
}

// A contributing leaf counts as "blocked" when its stored status is 'blocked'
// OR it carries a blocked_reason (the only field that forces 受阻 in the UI).
// deriveStatus can never return 'blocked' on its own, so this is the sole signal
// that lets a parent surface a descendant's real stoppage.
function isBlockedLeaf(item: ProgressItem): boolean {
  return item.status === 'blocked' || !!item.blocked_reason
}

export function computeRollup(leaves: ProgressItem[], today: Date = new Date()): Rollup {
  if (leaves.length === 0) {
    return {
      actual: 0, planned: 0, status: 'not-started', leafCount: 0, scheduledCount: 0,
      qtySum: null, qtyTotal: null, qtyUnit: null,
    }
  }
  const qw = quantityWeighting(leaves)
  // Quantity-weighted average when the whole branch is one-unit 渠務; else a
  // MIXED-mode weighting (sized quantity leaves by qty_total, the rest by 1) when
  // the branch mixes a metred run with %/checklist work (small-reno B 機電); else
  // the historical equal-weight mean (weight = 1 each). Math: equal weights
  // collapse to the plain average, so any branch without a sized quantity leaf —
  // i.e. every existing non-quantity project — is byte-identical.
  const weights = qw ? qw.weights : (mixedQuantityWeights(leaves) ?? leaves.map(() => 1))
  const weightSum = weights.reduce((s, w) => s + w, 0)
  const actual = weightSum > 0
    ? Math.round(leaves.reduce((s, x, i) => s + x.actual_progress * weights[i], 0) / weightSum)
    : 0
  // Planned is schedule-derived, averaged over SCHEDULED leaves only — un-scheduled
  // leaves (no dates) would otherwise count as 0% and falsely drag the parent's
  // planned down, fabricating a 超前 / on-plan reading. Actual still spans all leaves.
  // Weighting is applied symmetrically (same per-leaf weight) over scheduled leaves.
  const sched = leaves.filter(isScheduled)
  let planned = 0
  if (sched.length) {
    if (qw) {
      // re-derive each scheduled leaf's weight from its own qty_total (the
      // quantity branch is all sized, so every scheduled leaf has one).
      const schedWeightSum = sched.reduce((s, x) => s + (x.qty_total as number), 0)
      planned = schedWeightSum > 0
        ? Math.round(sched.reduce((s, x) => s + plannedProgressOf(x, today) * (x.qty_total as number), 0) / schedWeightSum)
        : 0
    } else {
      planned = Math.round(sched.reduce((s, x) => s + plannedProgressOf(x, today), 0) / sched.length)
    }
  }
  // Surface a descendant stoppage: deriveStatus alone can never return 'blocked',
  // so a parent whose child is 受阻 used to roll up to 落後/進行中 and silently
  // discard the stored 'blocked' (maintenance B.3 消防 + drainage findings). When
  // any contributing leaf is blocked and the branch isn't fully complete, prefer
  // 'blocked' so the parent's chip honestly reflects the held-up child. % math
  // is unchanged — only the badge changes.
  const status: ProgressStatus = actual < 100 && leaves.some(isBlockedLeaf)
    ? 'blocked'
    : deriveStatus(actual, planned)
  return {
    actual, planned, status,
    leafCount: leaves.length, scheduledCount: sched.length,
    qtySum: qw ? qw.sumDone : null,
    qtyTotal: qw ? qw.sumTotal : null,
    qtyUnit: qw ? qw.unit : null,
  }
}

// ── Phase 4: Issue Tracking ─────────────────────────────────
export type IssueStatus = 'open' | 'resolved'
export type IssueHandlerRole = 'pm' | 'main_contractor' | 'subcontractor' | 'admin'
export type IssueAction = 'reported' | 'commented' | 'escalated' | 'resolved' | 'reopened'

export interface Issue {
  id: string
  project_id: string
  reporter_id: string
  reporter_role: GlobalRole
  title: string
  description: string
  photos: string[]
  current_handler_role: IssueHandlerRole
  status: IssueStatus
  // ── P3 / S16 (v47): per-project running number (trigger-assigned, clients
  // never send it) + free-text location. Null on pre-v47 rows until backfill.
  issue_no: number | null
  location: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

// S16: display an issue's running number as #007 (3-wide, zero-padded); '—'
// for un-numbered (pre-backfill) rows.
export function formatIssueNo(n: number | null): string {
  return n ? '#' + String(n).padStart(3, '0') : '—'
}

export interface IssueComment {
  id: string
  issue_id: string
  author_id: string
  action: IssueAction
  body: string
  from_role: string | null
  to_role: string | null
  created_at: string
}

export const ISSUE_STATUS_ZH: Record<IssueStatus, string> = {
  open: '處理中',
  resolved: '已解決',
}

export const ISSUE_HANDLER_ZH: Record<IssueHandlerRole, string> = {
  pm: 'PM',
  main_contractor: '總承建商',
  subcontractor: '判頭',
  admin: '系統管理員',
}

export const ISSUE_ACTION_ZH: Record<IssueAction, string> = {
  reported: '報告問題',
  commented: '留言',
  escalated: '上呈',
  resolved: '標記為已解決',
  reopened: '重新開啟',
}

// Initial handler when an issue is reported (escalation routing).
// safety_officer / general_foreman are supervisory roles that don't sit on the
// subcontractor→main_contractor→pm ladder, so an issue THEY report goes straight
// to PM. These cases are explicit (not the silent default) so the routing for the
// two v48 roles is intentional and grep-able; their ACT authority on issues they
// did NOT report is granted separately by canActOnIssue (IssuesContext).
export function getInitialHandler(reporterRole: GlobalRole): IssueHandlerRole {
  switch (reporterRole) {
    case 'subcontractor_worker': return 'subcontractor'
    case 'subcontractor': return 'main_contractor'
    case 'main_contractor': return 'pm'
    case 'owner': return 'pm'
    case 'pm': return 'pm'
    case 'admin': return 'pm'
    case 'safety_officer': return 'pm'
    case 'general_foreman': return 'pm'
    default: return 'pm'
  }
}

// Next handler when current escalates further. Null = terminal (no further escalation).
export function getNextHandler(current: IssueHandlerRole): IssueHandlerRole | null {
  switch (current) {
    case 'subcontractor': return 'main_contractor'
    case 'main_contractor': return 'pm'
    case 'pm': return null
    case 'admin': return null
    default: return null
  }
}

// ── Phase 1 (milestone): Drawings on Progress Items ─────────
export type DrawingStatus = 'current' | 'superseded' | 'withdrawn'

export interface Drawing {
  id: string
  project_id: string
  leaf_item_id: string
  title: string
  current_version_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DrawingVersion {
  id: string
  drawing_id: string
  version_no: number
  file_path: string
  thumb_path: string | null
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  revision_label: string | null
  status: DrawingStatus
  uploaded_by: string | null
  uploaded_at: string
  superseded_at: string | null
  withdrawn_at: string | null
}

export const DRAWING_STATUS_ZH: Record<DrawingStatus, string> = {
  current: '現行',
  superseded: '已取代',
  withdrawn: '已撤回',
}

// ── v40 (program-2026-06): Documents register ───────────────
// Native file system that supersedes per-item drawings. Field names mirror
// the DB columns in supabase/v40-split/1-tables.sql verbatim (never camelCased
// — same rule as the Drawing block above).
export type DocumentType =
  | 'material_submission'
  | 'method_statement'
  | 'drawing'
  | 'inspection'
  | 'other'

export type DocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'withdrawn'

export interface Document {
  id: string
  project_id: string
  progress_item_id: string | null
  document_type: DocumentType
  title: string
  doc_number: string | null
  current_version_id: string | null
  // ── P2 / S8 (v46): optional review deadline on the register header.
  // 逾期 is derived client-side (review_due_date < today AND status submitted).
  review_due_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  legacy_drawing_id: string | null
}

// ── P2 / S8 (v46): cross-project "待我審批" feed row. Mirrors the
// list_my_pending_reviews() RPC return shape one-for-one.
export interface PendingReview {
  project_id: string
  project_name: string
  document_id: string
  doc_number: string | null
  title: string
  document_type: DocumentType
  review_due_date: string | null
  version_id: string
  version_no: number
  revision_label: string | null
  submitted_by: string | null
  submitted_by_name: string | null
  submitted_at: string | null
}

export interface DocumentVersion {
  id: string
  document_id: string
  version_no: number
  revision_label: string | null
  bucket_id: 'project-docs' | 'project-drawings'
  file_path: string
  thumb_path: string | null
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  status: DocumentStatus
  submitted_by: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  superseded_at: string | null
  withdrawn_at: string | null
  legacy_drawing_version_id: string | null
}

export type DocumentEventType =
  | 'created'
  | 'version_uploaded'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'withdrawn'
  | 'migrated'

export interface DocumentEvent {
  id: string
  document_id: string
  version_id: string | null
  event_type: DocumentEventType
  actor_id: string | null
  note: string | null
  created_at: string
}

export const DOCUMENT_TYPE_ZH: Record<DocumentType, string> = {
  material_submission: '物料送審',
  method_statement: '施工方案',
  drawing: '圖則',
  inspection: '檢驗記錄',
  other: '其他文件',
}

export const DOCUMENT_STATUS_ZH: Record<DocumentStatus, string> = {
  draft: '草稿',
  submitted: '已送審',
  approved: '已批准',
  rejected: '已拒絕',
  superseded: '已取代',
  withdrawn: '已撤回',
}

// ── Phase 2 SI types ────────────────────────────────────────
// VO-side types land in Plan 02-06.

export type SiStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'locked'
  | 'revision_requested'
  | 'rejected'

export type ApprovalActionType =
  | 'approve'
  | 'approve_with_edits'
  | 'request_revision'
  | 'reject'
  | 'admin_override'
  | 'delegate'

export type LineItemCategory = 'labour' | 'material' | 'preliminaries' | 'contingency'

export interface SiPayload {
  title: string
  description: string
  drawing_version_ids: string[]
  photo_paths: string[]
  voice_path: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
}

export interface SI {
  id: string
  project_id: string
  number: string
  current_version_id: string | null
  chain_snapshot: ChainStep[] | null
  current_step: number
  status: SiStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  locked_at: string | null
}

export interface SIVersion {
  id: string
  si_id: string
  version_no: number
  payload: SiPayload
  edits_by: string
  created_at: string
}

export interface ProtestComment {
  id: string
  si_id: string
  author_id: string
  body: string
  created_at: string
}

export interface ChainStep {
  step_order: number
  required_role: GlobalRole
  optional_user_id: string | null
}

export interface Approval {
  id: string
  doc_type: 'si' | 'vo' | 'ptw'
  doc_id: string
  step_order: number
  action_type: ApprovalActionType
  actor_id: string
  delegated_for_user_id: string | null
  reason: string | null
  edits_jsonb: any | null
  created_at: string
}

export interface Delegation {
  id: string
  user_id: string
  delegate_to: string
  valid_from: string
  valid_until: string
  created_at: string
}

export interface NotificationDigestItem {
  doc_type: 'si' | 'vo' | 'ptw'
  doc_id: string
  project_id: string
  headline_zh: string
  deep_link: string
}

export const SI_STATUS_ZH: Record<SiStatus, string> = {
  draft: '草稿',
  submitted: '待批准',
  in_review: '審批中',
  approved: '已批准',
  locked: '已鎖定',
  revision_requested: '已退回',
  rejected: '已拒絕',
}

export const APPROVAL_ACTION_ZH: Record<ApprovalActionType, string> = {
  approve: '批准',
  approve_with_edits: '批准並修改',
  request_revision: '退回 (要求修訂)',
  reject: '拒絕',
  admin_override: '管理員介入',
  delegate: '已轉授',
}

export const LINE_ITEM_CATEGORY_ZH: Record<LineItemCategory, string> = {
  labour: '人工',
  material: '物料',
  preliminaries: '前期費用',
  contingency: '暫定',
}

// ── Phase 2 VO types ────────────────────────────────────────
// VO status enum mirrors SI status (same Chinese labels, same lifecycle).
// total_amount_cents is bigint in Postgres; in TS we type it as number
// (JS Number is safe up to 9e15 cents — well beyond any real HKD VO).

export type VoStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'locked'
  | 'revision_requested'
  | 'rejected'

export interface VoLineItem {
  category: LineItemCategory
  description: string
  quantity: number
  unit: string
  unit_price_cents: number
  subtotal_cents: number
  progress_leaf_item_id: string | null
}

export interface VoPayload {
  description: string
  line_items: VoLineItem[]
  total_amount_cents: number
}

export interface VO {
  id: string
  si_id: string | null
  project_id: string
  number: string
  current_version_id: string | null
  total_amount_cents: number
  chain_snapshot: ChainStep[] | null
  current_step: number
  status: VoStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  locked_at: string | null
}

export interface VOVersion {
  id: string
  vo_id: string
  version_no: number
  payload: VoPayload
  edits_by: string
  created_at: string
}

export const VO_STATUS_ZH: Record<VoStatus, string> = {
  draft: '草稿',
  submitted: '待批准',
  in_review: '審批中',
  approved: '已批准',
  locked: '已鎖定',
  revision_requested: '已退回',
  rejected: '已拒絕',
}

// ── Phase 3: PTW (Permit to Work) ───────────────────────────

export type PtwType =
  | 'hot_work'
  | 'work_at_height'
  | 'lifting'
  | 'confined_space'
  | 'excavation'
  | 'electrical'
  | 'scaffold'
  | 'lift'

export type PtwStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'active'
  | 'closed_out'
  | 'expired'
  | 'rejected'
  | 'revision_requested'

export interface PTW {
  id: string
  project_id: string
  number: string
  ptw_type: PtwType
  current_version_id: string | null
  chain_snapshot: unknown
  current_step: number
  status: PtwStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  activated_at: string | null
  expires_at: string | null
  fire_watch_started_at: string | null
  closed_out_at: string | null
  locked_at: string | null
}

export interface PtwChecklistItem {
  key: string
  label_zh: string
  required: boolean
  value: boolean | null
}

export interface PtwPayload {
  description: string
  checklist: PtwChecklistItem[]
  ppe_photo_paths: string[]
  scene_photo_paths: string[]
  drawing_version_ids: string[]
  lat?: number
  lng?: number
  accuracy_m?: number
  // ── 渠務 / 密閉空間 + 掘地 safety extras (optional, backwards-compatible) ──
  // The seed PTW payloads (confined_space / excavation) already store these, but
  // before this they had no home on the type so PtwDetail couldn't render them.
  // All optional: every existing hot_work / work_at_height / lifting permit (and
  // pre-existing rows) simply leave them undefined.
  //  - hazards / controls: free-text safety lines shown above the checklist.
  //  - gas_test: confined-space pre-entry gas readings (O2/H2S/CO/LEL); each a
  //    free string so a unit ('20.9%' / '0 ppm' / '<10% LEL') survives intact.
  //  - valid_from / valid_to: the permit's own validity window (ISO date/time).
  hazards?: string[]
  controls?: string[]
  gas_test?: { o2?: string; h2s?: string; co?: string; lel?: string }
  valid_from?: string
  valid_to?: string
}

export interface PtwVersion {
  id: string
  ptw_id: string
  version_no: number
  payload: PtwPayload
  edits_by: string
  created_at: string
}

export interface PermitWorker {
  id: string
  ptw_id: string
  worker_name: string
  worker_phone: string | null
  worker_photo_path: string | null
  created_at: string
}

export interface PermitSignoff {
  id: string
  approval_id: string
  ptw_id: string
  signature_b64: string
  created_at: string
}

export interface PermitScan {
  id: string
  ptw_id: string
  scanned_by: string
  scanned_at: string
  jwt_payload_snapshot: Record<string, unknown>
}

export const PTW_TYPE_ZH: Record<PtwType, string> = {
  hot_work: '動火',
  work_at_height: '高空',
  lifting: '吊運',
  confined_space: '密閉空間',
  excavation: '掘地',
  electrical: '電力',
  scaffold: '棚架',
  lift: '升降機',
}

// PTW types authorable from the UI; every one ships a checklist template in
// src/lib/ptw.ts. 電力 (electrical) / 棚架 (scaffold) / 升降機 (lift) joined the
// 渠務 pair (confined_space 密閉空間 + excavation 掘地). Any PtwType NOT listed
// here renders in the picker as a disabled 敬請期待 stub.
export const PTW_TYPE_V1: PtwType[] = ['hot_work', 'work_at_height', 'lifting', 'confined_space', 'excavation', 'electrical', 'scaffold', 'lift']

export const PTW_STATUS_ZH: Record<PtwStatus, string> = {
  draft: '草稿',
  submitted: '待簽核',
  in_review: '簽核中',
  approved: '已批准',
  active: '生效中',
  closed_out: '已完工',
  expired: '已過期',
  rejected: '已拒絕',
  revision_requested: '已退回',
}

// ── 地盤表格管理 (statutory site forms + mobile e-signing, v55) ──
// Mirrors the v55-equipment-forms-schema.sql contract. Field names mirror the
// DB columns verbatim (no camelCase), same as the PTW block above. The forms
// domain layers on the PTW pattern: equipment_register + form_instances +
// form_signoffs (append-only, RPC-only insert via record_form_signoff),
// user_credentials (the qualified-person gate), form_templates (seeded
// reference data). FORM_STATUS_* badge classes follow the CLAUDE.md badge
// conventions (green-100 / amber-100 / red-50 / site-100).

// Kinds of plant / structure a form attaches to (form_templates.equipment_kind
// + equipment_register.kind). String-typed in the DB; this is the v1 set.
export type EquipmentKind =
  | 'scaffold'
  | 'excavation'
  | 'lifting_appliance'
  | 'swp'
  | 'other'

export const EQUIPMENT_KIND_ZH: Record<EquipmentKind, string> = {
  scaffold: '棚架',
  excavation: '挖掘工程',
  lifting_appliance: '起重機械',
  swp: '吊船',
  other: '其他',
}

// equipment_register.status — operational state of the plant item.
export type EquipmentStatus = 'active' | 'idle' | 'offsite' | 'retired'

export const EQUIPMENT_STATUS_ZH: Record<EquipmentStatus, string> = {
  active: '使用中',
  idle: '閒置',
  offsite: '已離場',
  retired: '已退役',
}

// Sign-off result (form_signoffs.result + record_form_signoff p_result).
export type FormSignoffResult = 'pass' | 'pass_with_remarks' | 'fail'

export const FORM_RESULT_ZH: Record<FormSignoffResult, string> = {
  pass: '合格',
  pass_with_remarks: '合格 (有備註)',
  fail: '不合格',
}

// Derived per-instance validity status (server computes the same five buckets
// in get_forms_dashboard). NOT a stored column — computed from valid_until +
// suspended + template.remind_before_days.
export type FormStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'suspended'

export const FORM_STATUS_ZH: Record<FormStatus, string> = {
  valid: '有效',
  expiring: '即將到期',
  expired: '過期',
  missing: '未簽',
  suspended: '停用',
}

// Badge classes per CLAUDE.md conventions: success green-100, warning amber-100,
// error red-50, neutral site-100.
export const FORM_STATUS_BADGE_CLASS: Record<FormStatus, string> = {
  valid: 'bg-green-100 text-green-700',
  expiring: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-50 text-red-600 border border-red-200',
  missing: 'bg-site-100 text-site-500',
  suspended: 'bg-red-50 text-red-600 border border-red-200',
}

// A single tickable line on a form (mirrors PtwChecklistItem, but the template
// rows have no `value` — the signer supplies values in the signoff payload).
export interface FormChecklistItem {
  key: string
  label_zh: string
  required: boolean
}

export interface FormTemplate {
  id: string
  code: string
  name_zh: string
  slang_zh: string | null
  statutory_ref: string | null
  equipment_kind: string
  frequency_days: number | null
  remind_before_days: number
  required_credential: string
  checklist: FormChecklistItem[]
  active: boolean
}

// The register row. Named `Equipment` per the plan (the DB table is
// equipment_register).
export interface Equipment {
  id: string
  project_id: string
  kind: string
  ref_no: string
  name_zh: string
  brand_model: string | null
  serial_no: string | null
  location_zh: string | null
  photo_path: string | null
  status: EquipmentStatus
  created_by: string
  created_at: string
}

export interface FormInstance {
  id: string
  project_id: string
  equipment_id: string | null
  template_id: string
  location_zh: string | null
  assigned_signer_id: string | null
  last_signoff_id: string | null
  valid_until: string | null
  suspended: boolean
  created_by: string
  created_at: string
}

export interface FormSignoff {
  id: string
  instance_id: string
  project_id: string
  result: FormSignoffResult
  payload: Record<string, unknown>
  signed_by: string
  signed_at: string
  valid_until: string | null
  signature_b64: string
  credential_id: string | null
  credential_snapshot: Record<string, unknown> | null
  pdf_path: string | null
}

export interface UserCredential {
  id: string
  user_id: string
  credential_type: string
  cert_name_zh: string
  cert_no: string | null
  issuer: string | null
  valid_from: string | null
  valid_until: string | null
  doc_path: string | null
  verified_by: string | null
  verified_at: string | null
  created_at: string
}

// One row in get_forms_dashboard().rows — flattened instance + template +
// equipment for the boss dashboard. status is the server-derived bucket above.
export interface FormsDashboardRow {
  instance_id: string
  equipment_id: string | null
  template_code: string
  template_name: string
  equipment_name: string | null
  location: string | null
  status: FormStatus
  valid_until: string | null
  suspended: boolean
}

export interface FormsDashboardCounts {
  valid: number
  expiring: number
  expired: number
  missing: number
  suspended: number
}

export interface FormsDashboard {
  counts: FormsDashboardCounts
  rows: FormsDashboardRow[]
}

// Client-side mirror of get_forms_dashboard's CASE expression so EquipmentDetail
// can label an instance without a round-trip. Keep in lock-step with the SQL.
export function deriveFormStatus(
  instance: Pick<FormInstance, 'valid_until' | 'suspended'>,
  remindBeforeDays: number,
): FormStatus {
  if (instance.suspended) return 'suspended'
  if (!instance.valid_until) return 'missing'
  const now = Date.now()
  const until = new Date(instance.valid_until).getTime()
  if (Number.isNaN(until)) return 'missing'
  if (until < now) return 'expired'
  if (until <= now + remindBeforeDays * 86400000) return 'expiring'
  return 'valid'
}

// ── v1.2 forwards ────────────────────────────────────────────
// Daily, Material, Event/Timetable shapes live alongside their
// owning context files so the lane that authored them stays the
// single source of truth. types.ts re-exports them so feature
// consumers can keep importing `from '../types'` like everything
// else in the codebase.

export { WEATHER_OPTIONS } from './types-daily'
export type { Daily, Weather, DailyPayload } from './types-daily'

export {
  MATERIAL_STATUS_ZH,
  MATERIAL_STATUS_BADGE_CLASS,
  isMaterialLate,
} from './types-material'
export type {
  Material,
  MaterialStatus,
  CreateMaterialInput,
  UpdateMaterialPatch,
} from './types-material'

export type { Event, TimetableEntry } from './types-timetable'

export type { Contact, ContactInput } from './types-contact'
export { TRADE_SUGGESTIONS } from './types-contact'

// ── v59: per-project module switches ─────────────────────────
// An admin can turn any module OFF for a single project (進度 excepted — it is
// the non-disableable core). The catalogue of 13 ModuleKeys + their labels /
// icons / routes lives in src/lib/modules.ts; ModuleKey is re-exported here so
// feature consumers keep importing module types `from '../types'`.
//
// A ProjectModule row is the persisted override. Absence of a row means the
// module is enabled (backwards-compat) — only an explicit row with enabled=false
// hides a surface. Column names mirror the SQL verbatim (no camelCase).
export type { ModuleKey } from './lib/modules'

export interface ProjectModule {
  project_id: string
  module_key: string
  enabled: boolean
  updated_by: string | null
  updated_at: string
}

// One row of get_project_modules() — every catalogue key with its effective
// enabled state (override row coalesced to true when absent).
export interface ModuleState {
  module_key: string
  enabled: boolean
}

// ── v81: 清潔檢查 (Cleansing Inspection, DWSS 模組 ④) ──────────────
// A dated, signed site-cleanliness inspection (DEVB TC(W) 2/2023 Annex A). An
// editor records a numbered (CLEAN-001) checklist with photos; a manager then
// verifies (one-way close-out → the row locks). Column names mirror the SQL
// (cleansing_inspections) verbatim.

export type CleansingFrequency = 'daily' | 'weekly' | 'ad_hoc'
export type CleansingResult = 'pass' | 'pass_with_remarks' | 'fail'
export type CleansingItemStatus = 'pass' | 'fail' | 'na'

// One checklist row inside cleansing_inspections.checklist (jsonb array).
export interface CleansingChecklistItem {
  label: string
  status: CleansingItemStatus
  remark?: string
}

export interface CleansingInspection {
  id: string
  project_id: string
  number: string                // CLEAN-001
  inspected_on: string          // date (YYYY-MM-DD)
  frequency: CleansingFrequency
  area: string
  checklist: CleansingChecklistItem[]
  result: CleansingResult
  notes: string | null
  photos: string[]              // issue-photos bucket storage paths
  created_by: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export const CLEANSING_FREQUENCY_ZH: Record<CleansingFrequency, string> = {
  daily: '每日',
  weekly: '每週',
  ad_hoc: '臨時',
}

export const CLEANSING_RESULT_ZH: Record<CleansingResult, string> = {
  pass: '合格',
  pass_with_remarks: '合格（有備註）',
  fail: '不合格',
}

export const CLEANSING_ITEM_STATUS_ZH: Record<CleansingItemStatus, string> = {
  pass: '合格',
  fail: '不合格',
  na: '不適用',
}

// Default HK site-cleansing checklist (editable per record). Items reflect the
// real cleanliness concerns on a HK site — public-area/road cleanliness and
// wheel-washing (EPD), standing water (anti-mosquito / dengue), waste sorting.
export const DEFAULT_CLEANSING_CHECKLIST: readonly string[] = [
  '公共通道暢通、無雜物阻塞',
  '建築廢料已分類及妥善棄置',
  '積水已清除（防蚊滅蟲）',
  '車輛出口洗車設施運作正常',
  '行人路 / 公眾地方保持清潔',
  '廁所 / 茶水間清潔衞生',
  '食物殘渣已清理（防鼠防蟲）',
  '防蚊滅蟲措施已執行',
] as const

// ── v82: 不符合事項報告 / 糾正措施 (NCR / CAR) ───────────────────
// A formal quality non-conformity: work failing a spec/drawing/standard is
// RAISED, the responsible party submits root-cause + corrective + preventive
// actions (CAR), then a verifier CLOSES it. The physical table is `ncr_reports`
// (a sim table squats `ncrs`); column names mirror the SQL verbatim.

export type NcrSeverity = 'minor' | 'major' | 'critical'
export type NcrStatus = 'open' | 'corrective_submitted' | 'closed' | 'void'

export interface Ncr {
  id: string
  project_id: string
  number: string                  // NCR-001
  title: string
  description: string
  location: string | null
  spec_ref: string | null
  severity: NcrSeverity
  responsible_party: string | null
  status: NcrStatus
  raised_by: string
  target_close_date: string | null
  root_cause: string | null
  corrective_action: string | null
  preventive_action: string | null
  corrective_by: string | null
  corrective_at: string | null
  closed_by: string | null
  closed_at: string | null
  photos: string[]
  created_at: string
  updated_at: string
}

export const NCR_SEVERITY_ZH: Record<NcrSeverity, string> = {
  minor: '輕微',
  major: '嚴重',
  critical: '重大',
}

export const NCR_STATUS_ZH: Record<NcrStatus, string> = {
  open: '待糾正',
  corrective_submitted: '待核實',
  closed: '已關閉',
  void: '已作廢',
}

// ── v89: 申請檢查 / 驗收 (Request for Inspection, RISC-lite) ─────
// A contractor requests that work is ready for inspection; an inspector responds
// pass / fail with a comment. Column names mirror risc_requests verbatim.

export type RiscWorkType =
  | 'rebar' | 'formwork' | 'concreting' | 'masonry' | 'waterproofing'
  | 'finishes' | 'mep' | 'drainage' | 'completion' | 'other'
export type RiscStatus = 'submitted' | 'passed' | 'failed' | 'cancelled'

export interface Risc {
  id: string
  project_id: string
  number: string                  // RISC-001
  title: string
  work_type: RiscWorkType
  location: string | null
  spec_ref: string | null
  proposed_at: string | null
  description: string | null
  status: RiscStatus
  raised_by: string
  result_comment: string | null
  inspected_by: string | null
  inspected_at: string | null
  photos: string[]
  created_at: string
  updated_at: string
}

export const RISC_WORK_TYPE_ZH: Record<RiscWorkType, string> = {
  rebar: '鋼筋紮鐵',
  formwork: '模板',
  concreting: '混凝土澆灌',
  masonry: '砌磚 / 砌塊',
  waterproofing: '防水',
  finishes: '飾面 / 裝修',
  mep: '機電裝置',
  drainage: '渠務',
  completion: '完工驗收',
  other: '其他',
}

export const RISC_STATUS_ZH: Record<RiscStatus, string> = {
  submitted: '待檢查',
  passed: '通過',
  failed: '不通過',
  cancelled: '已取消',
}
