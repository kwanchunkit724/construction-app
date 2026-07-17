// Excel + PDF export helpers.
// Mobile-friendly: triggers a file download via Blob URL on web; writes to
// the Documents directory via Capacitor Filesystem on native (iOS/Android),
// since WebView blocks anchor-based downloads inside Capacitor.
//
// VO PDF export (exportVOToPDF below) embeds Noto Sans HK subset
// (SIL Open Font License, Google) loaded lazily from public/fonts/.

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import {
  PROGRESS_STATUS_ZH, ISSUE_STATUS_ZH, ISSUE_HANDLER_ZH, ROLE_ZH,
  ISSUE_ACTION_ZH, formatIssueNo,
  computeRollup, getDescendantLeaves, plannedProgressOf, deriveStatus, deriveLeafStatus,
  isScheduled, LINE_ITEM_CATEGORY_ZH,
  WEATHER_KIND_ZH, EQUIPMENT_KIND_ZH, EQUIPMENT_STATUS_ZH,
  FORM_RESULT_ZH, FORM_STATUS_ZH, deriveFormStatus,
  unitStatusCounts,
} from '../types'
import type {
  Project, ProgressItem, Issue, IssueComment, UserProfile, ProgressStatus,
  VO, VOVersion, DrawingVersion,
  WeatherEvent, WeatherClaim, WeatherKind, EquipmentKind, EquipmentStatus,
  Equipment, FormInstance, FormSignoff, FormTemplate, FormsDashboard, FormStatus,
} from '../types'
import { formatHKD } from './currency'
import { supabase } from './supabase'
import { fetchPrevSnapshot, captureSnapshot } from './snapshots'
import type { PrevSnapshot } from './snapshots'
import { templateFor } from './progressTemplates'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  }
  return btoa(bin)
}

async function downloadBlob(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) {
    // Native (iOS / Android via Capacitor) — WebView blocks <a download>.
    // Write to the platform Documents directory; user retrieves via the
    // native Files app (iOS) or file manager (Android).
    const b64 = await blobToBase64(blob)
    // Note: omit `encoding` so Capacitor writes the base64 payload as raw
    // bytes; passing any Encoding value would utf8-encode the base64 string.
    await Filesystem.writeFile({
      path: filename,
      data: b64,
      directory: Directory.Documents,
      recursive: true,
    })
    // eslint-disable-next-line no-alert
    alert(`已儲存：${filename}\n位置：手機「文件」資料夾`)
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function dateStr() {
  return new Date().toISOString().slice(0, 10)
}

// Share-first delivery for shareable docs (PDF reports). The whole industry
// runs on WhatsApp; saving to Documents on native means non-tech users can't
// find the file. So: native → write to Cache + open the share sheet
// (WhatsApp / email / …); web → Web Share API with the file (mobile), else
// fall back to a normal download.
export async function shareOrDownloadBlob(blob: Blob, filename: string, title: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      const b64 = await blobToBase64(blob)
      await Filesystem.writeFile({ path: filename, data: b64, directory: Directory.Cache, recursive: true })
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
      const { Share } = await import('@capacitor/share')
      await Share.share({ title, text: title, url: uri, dialogTitle: '分享報告' })
      return
    } catch (e) {
      console.warn('native share failed — saving to Documents instead:', e)
      await downloadBlob(blob, filename)
      return
    }
  }
  // Web: Web Share API with the file (mobile browsers). Must run within the
  // user gesture; if the gesture lapsed or files aren't supported, download.
  try {
    const file = new File([blob], filename, { type: blob.type })
    const navAny = navigator as unknown as { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> }
    if (navAny.canShare && navAny.canShare({ files: [file] }) && navAny.share) {
      await navAny.share({ files: [file], title })
      return
    }
  } catch {
    // cancelled / unsupported → fall through to download
  }
  await downloadBlob(blob, filename)
}

// ── Progress export ──────────────────────────────────────────
// Driven by ExportProgressOptions (see the ExportProgressModal picker).
// Reports group by 分區 with per-zone roll-up subtotals + a top KPI
// summary. Level (大項/中項/細項) uses NEUTRAL blue-grey bands; red/amber/
// green are reserved for STATUS (in construction reports red = "出事"),
// per the multi-persona review (.planning/export-report/IMPROVEMENT-SPEC.md).

// 99 = 全部層級 — trees go deeper than 細項 (level 4+ sub-tasks); capping the
// picker at 3 silently dropped them from every report (the 判頭's dispute
// evidence). 99 is "no cap", not a real level.
export type ReportDepth = 1 | 2 | 3 | 99
// audience drives the PDF render path: 'owner' → one glance-level page only;
// 'internal' → that same one-pager + a detailed appendix table.
export type ReportAudience = 'owner' | 'internal'

export interface ExportProgressOptions {
  zoneIds: string[]            // project.zones ids to include
  includeUnzoned: boolean      // include items with no/unknown zone
  depth: ReportDepth           // max level to display (rollups always use real leaves)
  statuses: ProgressStatus[]   // statuses to include
  onlyBehind: boolean          // only items behind plan by > 10%
  groupByZone: boolean         // sectioned by zone with subtotals
  showSummary: boolean         // top KPI block
  showGap: boolean             // 差距 (實際−計劃) column
  reportPeriod: string         // e.g. 2026-W23 (free text, optional)
  audience: ReportAudience     // owner one-pager vs internal one-pager + appendix
  // ── T4 (v110): dimension filters — 工種版 / 判頭對數版 ──
  // trades: leaf-level 工種 filter (empty = all). assigneeId: only leaves
  // assigned/delegated to this person (the 判頭 statement — their scope, their
  // % — the document you settle accounts against). Both filter LEAVES; parents
  // appear only as ancestors of matching leaves and their rollups are computed
  // over the FILTERED leaf set so a 判頭 report never counts someone else's work.
  trades: string[]
  assigneeId: string | null
  // display labels for the report header (resolved by the modal)
  filterLabel: string
}

export const ALL_STATUSES: ProgressStatus[] = ['not-started', 'in-progress', 'completed', 'delayed', 'blocked']
// Default reports drop 未開始 — printing every not-started leaf is the wall of
// '0% / 未開始' rows that buries the items that actually need attention.
export const NO_NOTSTARTED: ProgressStatus[] = ALL_STATUSES.filter(s => s !== 'not-started')

export function exportPreset(p: 'internal' | 'owner' | 'exception', project: Project): ExportProgressOptions {
  const zoneIds = project.zones.map(z => z.id)
  // autoZone types (e.g. small_works) hide the zone abstraction in-app;
  // force groupByZone=false so the export stays flat and matches the UI.
  const groupByZone = !templateFor(project.project_type).autoZone
  if (p === 'owner') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: [...NO_NOTSTARTED], onlyBehind: false, groupByZone, showSummary: true, showGap: true, reportPeriod: '', audience: 'owner', trades: [], assigneeId: null, filterLabel: '' }
  }
  if (p === 'exception') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: ['delayed', 'blocked'], onlyBehind: true, groupByZone, showSummary: true, showGap: true, reportPeriod: '', audience: 'internal', trades: [], assigneeId: null, filterLabel: '' }
  }
  // internal defaults to FULL depth — sub-細項 leaves are where the real ticks
  // live; cutting at 3 made the report lie about what was actually done.
  return { zoneIds, includeUnzoned: true, depth: 99, statuses: [...NO_NOTSTARTED], onlyBehind: false, groupByZone, showSummary: true, showGap: true, reportPeriod: '', audience: 'internal', trades: [], assigneeId: null, filterLabel: '' }
}

const UNZONED = '__unzoned__'

// delta = 本期 movement (actual − previous snapshot actual); null when no baseline.
// planned / gap are null for an UNSCHEDULED leaf (no planned_start/planned_end):
// the app's ProgressItemCard shows 未排期 and suppresses 計劃%/差距 for such
// leaves, so the report must do the same instead of fabricating a 0% baseline
// and a bogus variance. Zone/rollup aggregates stay numeric (computeRollup
// already excludes unscheduled leaves from its planned average).
interface Eff { actual: number; planned: number | null; status: ProgressStatus; gap: number | null; delta: number | null }
interface ItemRow {
  zoneKey: string; zoneName: string
  code: string; title: string; level: number; depth: number
  tracking: string; eff: Eff; start: string; end: string; notes: string; updated: string
  // v107: '' (not required) / 待驗收 / ✓已驗收 — leaf only
  acceptance: string
}
interface ZoneAgg { actual: number; planned: number; gap: number; status: ProgressStatus; count: number; behind: number; delta: number | null }
interface Verdict { tone: 'ok' | 'warn' | 'bad'; line: string }
interface ReportModel {
  summary: { actual: number; planned: number; gap: number; total: number; behind: number; notStarted: number; delta: number | null; counts: Record<ProgressStatus, number>; verdict: Verdict }
  // zones = filtered rows for the detail appendix; allZones = every zone's
  // rollup bar for the owner one-pager (shown even if all-not-started so the
  // owner sees the whole site, not just zones with started work).
  zones: Array<{ key: string; name: string; agg: ZoneAgg; rows: ItemRow[] }>
  allZones: Array<{ key: string; name: string; agg: ZoneAgg }>
  prevPeriod: string | null   // baseline period for 本期 Δ, null if none
  opts: ExportProgressOptions
}

// Tracking column text per mode. floors → "x/y樓" (unchanged); checklist →
// "✓x/y" (P1 left this blank — fixed here); quantity → "done/total unit"
// (P2); unit_status → "已簽收 a / 待驗 b / 修復中 c" summary (P3 defect
// register / 逐戶驗收); percentage → '' (the % columns already say it all).
function trackingLabel(it: ProgressItem): string {
  switch (it.tracking_mode) {
    case 'floors':
      return `${it.floors_completed.length}/${it.floor_labels.length}樓`
    case 'checklist':
      return `✓${it.floors_completed.length}/${it.floor_labels.length}`
    case 'quantity':
      return `${it.qty_done ?? 0}/${it.qty_total ?? '?'}${it.qty_unit ?? ''}`
    case 'unit_status': {
      const c = unitStatusCounts(it.label_status, it.floor_labels ?? [])
      // pending = total − signedOff − fixed (fixing + reinspect collapse to "待驗")
      const pending = c.total - c.signedOff - c.fixed
      return `已簽收 ${c.signedOff} / 修復中 ${c.fixed} / 待驗 ${pending}`
    }
    default:
      return ''
  }
}

export function buildReportModel(project: Project, items: ProgressItem[], opts: ExportProgressOptions, prev?: PrevSnapshot | null): ReportModel {
  const isLeaf = (it: ProgressItem) => !items.some(i => i.parent_id === it.id)
  const pmap = prev?.map ?? null
  // average prev% over a leaf set that has baseline data (leaves w/o a prior
  // snapshot are skipped so a newly-added item doesn't skew the Δ).
  const prevAvg = (leaves: ProgressItem[]): number | null => {
    if (!pmap) return null
    const vals = leaves.map(l => pmap[l.id]).filter((v): v is number => v !== undefined)
    if (vals.length === 0) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  const aggDelta = (leaves: ProgressItem[], actual: number): number | null => {
    const pa = prevAvg(leaves)
    return pa === null ? null : actual - pa
  }
  const effOf = (it: ProgressItem): Eff => {
    if (isLeaf(it)) {
      const actual = it.actual_progress
      const pv = pmap ? pmap[it.id] : undefined
      const delta = pv === undefined ? null : actual - pv
      // Unscheduled leaf (no planned dates): match ProgressItemCard — show 未排期,
      // suppress 計劃%/差距 (null), but keep the live-derived status so the report
      // stays consistent with the card (which derives status from actual vs 0, NOT
      // from the stored planned_progress column).
      if (!isScheduled(it)) {
        return { actual, planned: null, status: deriveLeafStatus(it, 0), gap: null, delta }
      }
      const planned = plannedProgressOf(it)
      return { actual, planned, status: deriveLeafStatus(it, planned), gap: actual - planned, delta }
    }
    // Parent rollup over the FILTERED leaf set — a 判頭/工種 report's parent
    // rows must not absorb other people's/trades' progress.
    const descLeaves = getDescendantLeaves(items, it.id).filter(inScope)
    const r = computeRollup(descLeaves)
    return { actual: r.actual, planned: r.planned, status: r.status, gap: r.actual - r.planned, delta: aggDelta(descLeaves, r.actual) }
  }
  const zoneKeyOf = (it: ProgressItem): string => {
    if (it.zone_id && project.zones.some(z => z.id === it.zone_id)) return it.zone_id
    return UNZONED
  }
  const zoneNameOf = (key: string) => key === UNZONED ? '未分區 / 共用' : (project.zones.find(z => z.id === key)?.name ?? key)

  const zoneSel = new Set(opts.zoneIds)
  // T4 dimension filters — applied to LEAVES only. Parents survive as ancestors
  // of matching leaves, and every aggregate below (zone agg / summary / parent
  // eff) runs over the FILTERED leaf set, so a 判頭/工種 report only counts the
  // work it claims to cover.
  const tradeSel = new Set(opts.trades ?? [])
  const leafDimOk = (it: ProgressItem): boolean => {
    if (tradeSel.size > 0 && !(it.trade && tradeSel.has(it.trade))) return false
    if (opts.assigneeId && !(it.assigned_to ?? []).includes(opts.assigneeId) && !(it.delegated_to ?? []).includes(opts.assigneeId)) return false
    return true
  }
  const inScope = (it: ProgressItem) => {
    const k = zoneKeyOf(it)
    const zoneOk = k === UNZONED ? opts.includeUnzoned : zoneSel.has(k)
    if (!zoneOk) return false
    // leaf: must also match the dimension filters; parent: kept for structure,
    // its eff/agg is computed over filtered descendant leaves below.
    return isLeaf(it) ? leafDimOk(it) : true
  }
  const scopeItems = items.filter(inScope)

  // qualify test (status + behind) on each scope item's effective status.
  const statusSel = new Set(opts.statuses)
  const qualifies = (it: ProgressItem) => {
    const e = effOf(it)
    if (!statusSel.has(e.status)) return false
    // gap is null for unscheduled leaves — variance is not meaningful, so they
    // can never satisfy the 落後 (onlyBehind) filter.
    if (opts.onlyBehind && (e.gap === null || e.gap >= -10)) return false
    return true
  }
  // keep qualified items + their ancestor chain (to preserve tree context).
  const byId = new Map(items.map(i => [i.id, i]))
  const keep = new Set<string>()
  const dimFiltering = tradeSel.size > 0 || !!opts.assigneeId
  for (const it of scopeItems) {
    // With a dimension filter active, only LEAVES seed the keep-set — parents
    // enter solely as ancestors, so a branch with zero matching leaves never
    // prints an empty section.
    if (dimFiltering && !isLeaf(it)) continue
    if (!qualifies(it)) continue
    keep.add(it.id)
    let p = it.parent_id ? byId.get(it.parent_id) : undefined
    while (p && inScope(p)) { keep.add(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined }
  }
  const display = scopeItems.filter(it => keep.has(it.id) && it.level <= opts.depth)

  // group + DFS per zone (tree order, sorted by code, depth for indent).
  const zoneOrder: string[] = [...project.zones.map(z => z.id)]
  if (opts.includeUnzoned) zoneOrder.push(UNZONED)
  const displayByZone = new Map<string, ProgressItem[]>()
  for (const it of display) {
    const k = zoneKeyOf(it)
    if (!displayByZone.has(k)) displayByZone.set(k, [])
    displayByZone.get(k)!.push(it)
  }
  const zones: ReportModel['zones'] = []
  for (const key of zoneOrder) {
    const zItems = displayByZone.get(key)
    if (!zItems || zItems.length === 0) continue
    const zSet = new Set(zItems.map(i => i.id))
    const byParent = new Map<string | null, ProgressItem[]>()
    for (const it of zItems) {
      const pk = it.parent_id && zSet.has(it.parent_id) ? it.parent_id : null
      if (!byParent.has(pk)) byParent.set(pk, [])
      byParent.get(pk)!.push(it)
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.code.localeCompare(b.code))
    const rows: ItemRow[] = []
    const dfs = (pid: string | null, d: number) => {
      for (const it of byParent.get(pid) ?? []) {
        const e = effOf(it)
        rows.push({
          zoneKey: key, zoneName: zoneNameOf(key),
          code: it.code, title: it.title, level: it.level, depth: d,
          tracking: trackingLabel(it),
          eff: e,
          start: it.planned_start ?? '', end: it.planned_end ?? '',
          notes: isLeaf(it) ? it.notes : '', updated: new Date(it.last_updated_at).toLocaleString('zh-HK'),
          acceptance: isLeaf(it) && it.acceptance_required ? (it.accepted_at ? '✓已驗收' : '待驗收') : '',
        })
        dfs(it.id, d + 1)
      }
    }
    dfs(null, 0)
    // zone agg from ALL leaves in that zone within scope (true progress).
    const zoneLeaves = scopeItems.filter(i => isLeaf(i) && zoneKeyOf(i) === key)
    const r = computeRollup(zoneLeaves)
    const behind = zoneLeaves.filter(l => (l.actual_progress - plannedProgressOf(l)) < -10).length
    zones.push({ key, name: zoneNameOf(key), agg: { actual: r.actual, planned: r.planned, gap: r.actual - r.planned, status: r.status, count: zoneLeaves.length, behind, delta: aggDelta(zoneLeaves, r.actual) }, rows })
  }

  // overall summary from all in-scope leaves.
  const scopeLeaves = scopeItems.filter(isLeaf)
  const sr = computeRollup(scopeLeaves)
  const counts = { 'not-started': 0, 'in-progress': 0, 'completed': 0, 'delayed': 0, 'blocked': 0 } as Record<ProgressStatus, number>
  // Derive status live (matches rows/zones/verdict) — the stored l.status column
  // freezes at save-time and goes stale as the schedule advances.
  for (const l of scopeLeaves) counts[deriveLeafStatus(l, plannedProgressOf(l))]++
  const behind = scopeLeaves.filter(l => (l.actual_progress - plannedProgressOf(l)) < -10).length

  // every zone's rollup bar for the one-pager (incl. all-not-started zones)
  const allZones = zoneOrder.flatMap(key => {
    const zl = scopeItems.filter(i => isLeaf(i) && zoneKeyOf(i) === key)
    if (zl.length === 0) return []
    const r = computeRollup(zl)
    const zbehind = zl.filter(l => (l.actual_progress - plannedProgressOf(l)) < -10).length
    return [{ key, name: zoneNameOf(key), agg: { actual: r.actual, planned: r.planned, gap: r.actual - r.planned, status: r.status, count: zl.length, behind: zbehind, delta: aggDelta(zl, r.actual) } }]
  })

  const sgap = sr.actual - sr.planned
  const sdelta = aggDelta(scopeLeaves, sr.actual)
  const tone: Verdict['tone'] = behind > 0 ? 'bad' : sgap < -3 ? 'warn' : 'ok'
  const verdict: Verdict = {
    tone,
    line: `${project.name} — 整體 ${sr.actual}%，` +
      (sgap < -3 ? `落後計劃 ${-sgap}%` : sgap > 3 ? `超前 ${sgap}%` : '貼近計劃') +
      (sdelta !== null ? `，本期 ${sdelta >= 0 ? '+' : ''}${sdelta}%` : '') +
      (behind > 0 ? `，${behind} 項要跟進` : ''),
  }
  return { summary: { actual: sr.actual, planned: sr.planned, gap: sgap, total: scopeLeaves.length, behind, notStarted: counts['not-started'], delta: sdelta, counts, verdict }, zones, allZones, prevPeriod: prev?.period ?? null, opts }
}

// Status colours (red/amber/green) — reserved for STATUS, not level.
const STATUS_PILL: Record<ProgressStatus, { bg: string; fg: string; bar: string; mark: string }> = {
  'delayed': { bg: '#fee2e2', fg: '#b91c1c', bar: '#dc2626', mark: '⚠ ' },
  'blocked': { bg: '#fef3c7', fg: '#92400e', bar: '#d97706', mark: '■ ' },
  'in-progress': { bg: '#dbeafe', fg: '#1d4ed8', bar: '#3b82f6', mark: '' },
  'completed': { bg: '#dcfce7', fg: '#15803d', bar: '#22c55e', mark: '✓ ' },
  'not-started': { bg: '#f1f5f9', fg: '#64748b', bar: '#cbd5e1', mark: '' },
}
// Level (structure) — neutral blue-grey bands.
const LEVEL_BG: Record<number, string> = { 1: '#dbe3ec', 2: '#eef2f6', 3: '#ffffff' }
const gapColour = (g: number) => g < 0 ? '#b91c1c' : g > 0 ? '#15803d' : '#64748b'
const fileTag = (opts: ExportProgressOptions) => {
  const base = opts.reportPeriod ? safeName(opts.reportPeriod) : dateStr()
  return opts.filterLabel ? `${safeName(opts.filterLabel)}_${base}` : base
}

// ── Excel ────────────────────────────────────────────────────
export async function exportProgressToExcel(project: Project, items: ProgressItem[], opts: ExportProgressOptions) {
  const period = opts.reportPeriod || dateStr()
  const prev = await fetchPrevSnapshot(project.id, period)
  const model = buildReportModel(project, items, opts, prev)
  const pct = (n: number) => n // numeric; format applied via cell.z
  const aoa: (string | number | null)[][] = []
  const numCells: Array<{ r: number; c: number }> = []
  const outline: Array<number | null> = [] // per data row: outline level (null = no row meta)

  const pushRow = (cells: (string | number | null)[], lvl: number | null) => { aoa.push(cells); outline.push(lvl) }
  const markNums = (rowIdx: number, cols: number[]) => cols.forEach(c => numCells.push({ r: rowIdx, c }))

  if (model.summary && opts.showSummary) {
    pushRow([model.summary.verdict.line], null)
    pushRow([`${project.name} — 進度報告${opts.filterLabel ? `（${opts.filterLabel}）` : ''}`], null)
    pushRow([`產生：${new Date().toLocaleString('zh-HK')}${opts.reportPeriod ? `   期數：${opts.reportPeriod}` : ''}`], null)
    pushRow([`整體：計劃 ${model.summary.planned}% / 實際 ${model.summary.actual}% / 差距 ${model.summary.gap}%   ·   落後 ${model.summary.behind} 項 / 共 ${model.summary.total} 項`], null)
    pushRow([`延誤 ${model.summary.counts.delayed} · 阻塞 ${model.summary.counts.blocked} · 進行中 ${model.summary.counts['in-progress']} · 已完成 ${model.summary.counts.completed} · 未開始 ${model.summary.counts['not-started']}`], null)
    pushRow([], null)
  }

  // header
  const header = ['分區', '編號', '名稱', '層級', '追蹤模式', '計劃%', '實際%']
  if (opts.showGap) header.push('差距')
  header.push('狀態', '驗收', '計劃開始', '計劃完成', '備注')
  const headerRowIdx = aoa.length
  pushRow(header, null)

  const colIndex = { plan: 5, act: 6, gap: opts.showGap ? 7 : -1 }
  const statusCol = opts.showGap ? 8 : 7
  const acceptCol = statusCol + 1
  const startCol = statusCol + 2, endCol = statusCol + 3, notesCol = statusCol + 4

  for (const z of model.zones) {
    if (opts.groupByZone) {
      const r = aoa.length
      pushRow([`▌ ${z.name}`], 0)
      // subtotal row
      const sub: (string | number | null)[] = []
      sub[0] = '　小計'; sub[2] = `${z.agg.count} 項 · 落後 ${z.agg.behind}`
      sub[colIndex.plan] = z.agg.planned; sub[colIndex.act] = z.agg.actual
      if (opts.showGap) sub[colIndex.gap] = z.agg.gap
      sub[statusCol] = PROGRESS_STATUS_ZH[z.agg.status]
      const subIdx = aoa.length
      pushRow(sub, 0)
      const sCols = [colIndex.plan, colIndex.act, ...(opts.showGap ? [colIndex.gap] : [])]
      markNums(subIdx, sCols)
      void r
    }
    for (const it of z.rows) {
      const cells: (string | number | null)[] = []
      cells[0] = opts.groupByZone ? '' : z.name
      cells[1] = it.code
      cells[2] = '　'.repeat(it.depth) + it.title
      cells[3] = it.level
      cells[4] = it.tracking
      // Unscheduled leaf: 計劃 → 未排期, 差距 → — (text, not 0%). Match the app card.
      cells[colIndex.plan] = it.eff.planned === null ? '未排期' : pct(it.eff.planned)
      cells[colIndex.act] = pct(it.eff.actual)
      if (opts.showGap) cells[colIndex.gap] = it.eff.gap === null ? '—' : it.eff.gap
      cells[statusCol] = STATUS_PILL[it.eff.status].mark + PROGRESS_STATUS_ZH[it.eff.status]
      cells[acceptCol] = it.acceptance
      cells[startCol] = it.start
      cells[endCol] = it.end
      cells[notesCol] = it.notes
      const idx = aoa.length
      pushRow(cells, opts.groupByZone ? it.depth + 1 : it.depth)
      // Only mark numeric % columns for "0%" formatting — skip null (text) cells
      // so the 未排期 / — labels aren't coerced/formatted as numbers.
      const numCols = [colIndex.act]
      if (it.eff.planned !== null) numCols.push(colIndex.plan)
      if (opts.showGap && it.eff.gap !== null) numCols.push(colIndex.gap)
      markNums(idx, numCols)
    }
    if (opts.groupByZone) pushRow([], 0)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // numeric % cells: real numbers with "0%" display so they SUM/AVG.
  for (const { r, c } of numCells) {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = ws[addr]
    if (cell && typeof cell.v === 'number') cell.z = '0"%"'
  }
  ws['!cols'] = header.map((h, i) => ({ wch: i === 2 ? 40 : (h.length > 4 ? 12 : 9) }))
  // xlsx outline levels cap at 7 — clamp so a deep tree doesn't emit an invalid sheet.
  ws['!rows'] = aoa.map((_, i) => i === headerRowIdx ? {} : (outline[i] != null ? { level: Math.min(outline[i] as number, 7) } : {}))
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '進度報告')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  // Unified delivery: same share-first path as the PDF (was downloadBlob, which
  // silently hid the Excel in the Documents folder on native).
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_進度_${fileTag(opts)}.xlsx`, model.summary.verdict.line)
  await captureSnapshot(project.id, items, period)
}

// ── PDF — html2canvas (full CJK glyph support, any character) with
// BLOCK-AWARE pagination: the tall render is cut ONLY at element boundaries
// (`.pgblk`), never mid-row. This fixes the old raw-pixel slice that
// guillotined rows, while keeping browser-font rendering so every Chinese
// glyph shows (the embedded subset font can't cover arbitrary text).
// Owner audience → a glance-level one-pager; internal → that one-pager + a
// detailed table per zone.

const toneHex = (t: Verdict['tone']) => t === 'bad' ? '#b91c1c' : t === 'warn' ? '#d97706' : '#16a34a'

function reportHtml(project: Project, model: ReportModel, opts: ExportProgressOptions): string {
  const s = model.summary
  const hasDelta = model.prevPeriod !== null
  const card = (label: string, val: string, colour: string) => `
    <div style="flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px;">
      <div style="font-size:12px; color:#64748b;">${escapeHtml(label)}</div>
      <div style="font-size:26px; font-weight:800; color:${colour}; line-height:1.1;">${escapeHtml(val)}</div>
    </div>`

  const zoneBars = model.allZones.map(z => {
    const barHex = STATUS_PILL[z.agg.status].bar
    const a = Math.max(0, Math.min(100, z.agg.actual))
    const p = Math.max(0, Math.min(100, z.agg.planned))
    return `
    <div class="pgblk" style="display:flex; align-items:center; gap:12px; margin:7px 0;">
      <div style="width:96px; font-weight:600; font-size:14px; color:#0f172a;">${escapeHtml(z.name)}</div>
      <div style="flex:1; position:relative; height:14px; background:#f1f5f9; border-radius:5px;">
        <div style="position:absolute; left:0; top:0; bottom:0; width:${a}%; background:${barHex}; border-radius:5px;"></div>
        <div style="position:absolute; left:${p}%; top:-3px; bottom:-3px; width:2px; background:#475569;"></div>
      </div>
      <div style="width:200px; font-size:13px; color:#475569; text-align:right;">${z.agg.actual}% / 計劃 ${z.agg.planned}%${z.agg.delta !== null ? `　<span style="color:${z.agg.delta >= 0 ? '#15803d' : '#b91c1c'};">本期 ${z.agg.delta >= 0 ? '+' : ''}${z.agg.delta}%</span>` : ''}${z.agg.behind ? `　<span style="color:#b91c1c;">⚠${z.agg.behind}</span>` : ''}</div>
    </div>`
  }).join('')

  // gap === null → unscheduled leaf: variance is not meaningful, so it can never
  // land on the 需要關注 list via gap (only via an explicit delayed/blocked status).
  const attn: Array<{ zone: string; title: string; actual: number; gap: number | null; note: string; status: ProgressStatus }> = []
  for (const z of model.zones) for (const r of z.rows) {
    if (r.eff.status === 'delayed' || r.eff.status === 'blocked' || (r.eff.gap !== null && r.eff.gap < -10)) {
      attn.push({ zone: z.name, title: r.title, actual: r.eff.actual, gap: r.eff.gap, note: r.notes ?? '', status: r.eff.status })
    }
  }
  attn.sort((x, y) => (x.gap ?? 0) - (y.gap ?? 0))
  const attnRows = attn.length === 0
    ? `<div class="pgblk" style="font-size:14px; color:#15803d; margin:4px 0;">暫無落後 / 阻塞項目，全部按計劃。</div>`
    : attn.slice(0, 12).map(a => {
      const fg = STATUS_PILL[a.status].fg
      return `<div class="pgblk" style="display:flex; justify-content:space-between; gap:12px; padding:5px 0; border-bottom:1px solid #f1f5f9;">
        <div style="font-size:13px; color:${fg};">${escapeHtml(STATUS_PILL[a.status].mark + a.zone + ' · ' + a.title)}${a.note ? `<div style="font-size:12px; color:#94a3b8;">${escapeHtml(a.note)}</div>` : ''}</div>
        <div style="font-size:13px; color:#475569; white-space:nowrap;">實際 ${a.actual}%${a.gap === null ? '（未排期）' : `（${a.gap >= 0 ? '+' : ''}${a.gap}%）`}</div>
      </div>`
    }).join('')
  const moreAttn = attn.length > 12 ? `<div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">…另有 ${attn.length - 12} 項，詳見內部版附錄。</div>` : ''

  const onePager = `
    <div class="pgblk" style="font-size:13px; color:#64748b; margin-bottom:6px;">${escapeHtml(project.name)} — 進度報告${opts.filterLabel ? `　<span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:6px; font-weight:600;">${escapeHtml(opts.filterLabel)}</span>` : ''}</div>
    <div class="pgblk" style="background:${toneHex(s.verdict.tone)}; color:#fff; border-radius:10px; padding:16px 18px; font-size:20px; font-weight:800; margin-bottom:16px;">${escapeHtml(s.verdict.line)}</div>
    <div class="pgblk" style="display:flex; gap:12px; margin-bottom:18px;">
      ${card('整體實際', `${s.actual}%`, '#0f172a')}
      ${card('計劃', `${s.planned}%`, '#475569')}
      ${card('差距', `${s.gap >= 0 ? '+' : ''}${s.gap}%`, s.gap < 0 ? '#b91c1c' : '#15803d')}
      ${s.delta !== null ? card(`本期${model.prevPeriod ? `（vs ${escapeHtml(model.prevPeriod)}）` : ''}`, `${s.delta >= 0 ? '+' : ''}${s.delta}%`, s.delta >= 0 ? '#15803d' : '#b91c1c') : ''}
    </div>
    <div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:6px 0 4px;">各分區進度</div>
    ${zoneBars}
    <div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:16px 0 6px;">需要關注（${attn.length}）</div>
    ${attnRows}${moreAttn}
    <div class="pgblk" style="font-size:12px; color:#94a3b8; margin-top:10px;">未開始 ${s.notStarted} 項（未列入上表）</div>`

  let appendix = ''
  if (opts.audience === 'internal') {
    appendix = model.zones.map(z => {
      const rows = z.rows.map(r => {
        const sp = STATUS_PILL[r.eff.status]
        const w = r.level === 1 ? 700 : r.level === 2 ? 600 : 400
        return `<tr class="pgblk" style="border-bottom:1px solid #e2e8f0; border-left:4px solid ${sp.bar};">
          <td style="padding:5px 6px; font-family:Consolas,monospace; color:#64748b; font-size:11px;">${escapeHtml(r.code)}</td>
          <td style="padding:5px 6px; padding-left:${6 + r.depth * 16}px; font-weight:${w};">${escapeHtml(r.title)}${r.tracking ? ` <span style="color:#7c3aed; font-size:11px;">${escapeHtml(r.tracking)}</span>` : ''}</td>
          <td style="padding:5px 6px; text-align:right; font-weight:700;">${r.eff.actual}%</td>
          <td style="padding:5px 6px; text-align:right; color:#64748b;">${r.eff.planned === null ? '未排期' : `${r.eff.planned}%`}</td>
          <td style="padding:5px 6px; text-align:right; font-weight:700; color:${r.eff.gap === null ? '#94a3b8' : gapColour(r.eff.gap)};">${r.eff.gap === null ? '—' : `${r.eff.gap >= 0 ? '+' : ''}${r.eff.gap}%`}</td>
          ${hasDelta ? `<td style="padding:5px 6px; text-align:right; font-weight:700; color:${r.eff.delta === null ? '#cbd5e1' : r.eff.delta >= 0 ? '#15803d' : '#b91c1c'};">${r.eff.delta === null ? '—' : `${r.eff.delta >= 0 ? '+' : ''}${r.eff.delta}%`}</td>` : ''}
          <td style="padding:5px 6px; text-align:center; vertical-align:middle; white-space:nowrap; width:74px;"><span style="display:inline-block; background:${sp.bg}; color:${sp.fg}; padding:3px 8px; border-radius:7px; font-size:11px; line-height:1; white-space:nowrap; text-align:center;">${escapeHtml(sp.mark + PROGRESS_STATUS_ZH[r.eff.status])}</span></td>
          <td style="padding:5px 6px; text-align:center; white-space:nowrap; font-size:11px; color:${r.acceptance === '待驗收' ? '#c2410c' : r.acceptance ? '#15803d' : '#cbd5e1'};">${escapeHtml(r.acceptance || '—')}</td>
          <td style="padding:5px 6px; color:#475569; font-size:12px;">${escapeHtml(r.notes ?? '')}</td>
          <td style="padding:5px 6px; color:#64748b; font-size:12px;">${escapeHtml(r.end ?? '')}</td>
        </tr>`
      }).join('')
      return `
        <div class="pgblk" style="margin-top:22px; font-size:15px; font-weight:700; color:#0f172a;">${escapeHtml(z.name)} — 詳細 <span style="font-weight:500; font-size:13px; color:#64748b;">整體 ${z.agg.actual}%（計劃 ${z.agg.planned}%）· ${z.agg.count} 項</span></div>
        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px;">
          <thead><tr class="pgblk" style="background:#f97316; color:#fff; text-align:left;">
            <th style="padding:6px;">編號</th><th style="padding:6px;">名稱</th><th style="padding:6px; text-align:right;">實際</th><th style="padding:6px; text-align:right;">計劃</th><th style="padding:6px; text-align:right;">差距</th>${hasDelta ? '<th style="padding:6px; text-align:right;">本期</th>' : ''}<th style="padding:6px; text-align:center; white-space:nowrap; width:74px;">狀態</th><th style="padding:6px; text-align:center; white-space:nowrap;">驗收</th><th style="padding:6px;">說明</th><th style="padding:6px; white-space:nowrap;">計劃完成</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`
    }).join('')
  }

  return onePager + appendix
}

export async function exportProgressToPDF(project: Project, items: ProgressItem[], opts: ExportProgressOptions) {
  // 本期 Δ baseline = latest prior snapshot; archive this run after generating.
  const period = opts.reportPeriod || dateStr()
  const prev = await fetchPrevSnapshot(project.id, period)
  const model = buildReportModel(project, items, opts, prev)
  const html2canvas = (await import('html2canvas')).default

  const W = 794 // A4 portrait @ ~96dpi
  const container = document.createElement('div')
  container.style.cssText = [
    'position:fixed', 'top:0', 'left:-10000px', `width:${W}px`, 'padding:28px',
    'background:#ffffff',
    'font-family:Inter,"Microsoft JhengHei","PingFang HK","Heiti TC","Noto Sans CJK TC",sans-serif',
    'color:#0f172a',
  ].join('; ')
  container.innerHTML = reportHtml(project, model, opts)
  document.body.appendChild(container)

  try {
    const cTop = container.getBoundingClientRect().top
    const blockBottoms = Array.from(container.querySelectorAll('.pgblk'))
      .map(b => (b as HTMLElement).getBoundingClientRect().bottom - cTop)
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', logging: false })
    const cssToCanvas = canvas.height / container.offsetHeight
    const bounds = blockBottoms.map(b => b * cssToCanvas).sort((a, b) => a - b)

    const doc: any = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageWpt = doc.internal.pageSize.getWidth()
    const pageHpt = doc.internal.pageSize.getHeight()
    const footerPt = 24
    const usableHpt = pageHpt - footerPt
    const pageHcanvas = (usableHpt * canvas.width) / pageWpt

    let startPx = 0, first = true
    while (startPx < canvas.height - 1) {
      let endPx = startPx + pageHcanvas
      if (endPx < canvas.height) {
        // snap the cut DOWN to the last block boundary that fits this page —
        // never bisect a row. (If a single block is taller than a page, the
        // fixed advance still guarantees progress.)
        const cand = bounds.filter(b => b > startPx + 12 && b <= endPx)
        if (cand.length) endPx = cand[cand.length - 1]
      } else {
        endPx = canvas.height
      }
      const sliceH = Math.max(1, Math.round(endPx - startPx))
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, sliceH)
      ctx.drawImage(canvas, 0, -startPx)
      if (!first) doc.addPage()
      // JPEG (q0.92) not PNG — a full-page raster as PNG is multi-MB and chokes
      // viewers / WhatsApp; JPEG of text-on-white stays crisp at a fraction of the size.
      doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWpt, (sliceH * pageWpt) / canvas.width)
      startPx = endPx; first = false
    }

    // Footer in zh-HK — embed Noto Sans HK so the Chinese renders instead of
    // the old helvetica garble/strip. The body of each page is a raster image
    // (html2canvas) so it's unaffected; only this footer needs the CJK font.
    // ensureChineseFont() throws if the font asset is missing; degrade to an
    // ASCII footer in that case rather than failing the whole export.
    const asOf = opts.reportPeriod || dateStr()
    const n = doc.getNumberOfPages()
    let cjkFooter = true
    try {
      await ensureChineseFont(doc)
    } catch {
      cjkFooter = false
    }
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
      if (cjkFooter) {
        doc.setFont('NotoHK')
        doc.text(`CK 工程 · ${asOf}`, 40, pageHpt - 9)
      } else {
        doc.setFont('helvetica', 'normal')
        doc.text(`CK · ${asOf}`, 40, pageHpt - 9)
      }
      // Page counter stays Latin/digits — render with a core font so it never
      // depends on the CJK asset loading.
      doc.setFont('helvetica', 'normal')
      doc.text(`P. ${i} / ${n}`, pageWpt - 70, pageHpt - 9)
    }

    const blob = doc.output('blob') as Blob
    await shareOrDownloadBlob(blob, `${safeName(project.name)}_進度_${fileTag(opts)}.pdf`, model.summary.verdict.line)
    await captureSnapshot(project.id, items, period)
  } finally {
    container.remove()
  }
}

function escapeHtml(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Issues export ────────────────────────────────────────────

export async function exportIssuesToExcel(
  project: Project,
  issues: Issue[],
  users: Record<string, UserProfile>,
  comments: IssueComment[] = [],
) {
  // Sheet 1 — 問題清單 (S16: 編號 + 位置 lead the columns).
  const rows = issues
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(i => ({
      編號: formatIssueNo(i.issue_no),
      位置: i.location ?? '',
      狀態: ISSUE_STATUS_ZH[i.status],
      標題: i.title,
      描述: i.description,
      照片數: i.photos.length,
      // '前成員' (ex-member) — not '—' — when an id has no resolvable name, so
      // the audit trail never fully loses who reported / resolved an issue even
      // after they leave the project (RLS hides their profile; the v47 RPC in
      // ProjectDetail.tsx now also resolves comment authors → most are named).
      報告者: users[i.reporter_id]?.name ?? '前成員',
      報告者角色: ROLE_ZH[i.reporter_role],
      當前處理層: ISSUE_HANDLER_ZH[i.current_handler_role],
      解決者: i.resolved_by ? (users[i.resolved_by]?.name ?? '前成員') : '',
      報告時間: new Date(i.created_at).toLocaleString('zh-HK'),
      解決時間: i.resolved_at ? new Date(i.resolved_at).toLocaleString('zh-HK') : '',
    }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 6 },
    { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '問題清單')

  // Sheet 2 — 處理紀錄 (S17): one row per comment / activity event, ordered by
  // issue number then time, so the escalation trail reads in full.
  const issueById = new Map(issues.map(i => [i.id, i]))
  const handlerZh = (r: string | null): string =>
    r ? (ISSUE_HANDLER_ZH[r as keyof typeof ISSUE_HANDLER_ZH] ?? r) : ''
  const logRows = comments
    .slice()
    .sort((a, b) => {
      const ia = issueById.get(a.issue_id)?.issue_no ?? 0
      const ib = issueById.get(b.issue_id)?.issue_no ?? 0
      if (ia !== ib) return ia - ib
      return a.created_at.localeCompare(b.created_at)
    })
    .map(c => {
      const iss = issueById.get(c.issue_id)
      return {
        編號: formatIssueNo(iss?.issue_no ?? null),
        問題標題: iss?.title ?? '',
        時間: new Date(c.created_at).toLocaleString('zh-HK'),
        動作: ISSUE_ACTION_ZH[c.action] ?? c.action,
        操作人: users[c.author_id]?.name ?? '前成員',
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

  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await downloadBlob(blob, `${safeName(project.name)}_問題_${dateStr()}.xlsx`)
}

// ── Projects list export (admin) ─────────────────────────────

export async function exportProjectsToExcel(
  projects: Project[],
  users: Record<string, UserProfile>,
) {
  const rows = projects.map(p => ({
    名稱: p.name,
    分區數: p.zones.length,
    分區: p.zones.map(z => `${z.id}:${z.name}`).join(' / '),
    指派PM: p.assigned_pm_ids.map(id => users[id]?.name ?? id).join(', '),
    建立時間: new Date(p.created_at).toLocaleString('zh-HK'),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 25 }, { wch: 8 }, { wch: 40 }, { wch: 25 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '工地清單')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await downloadBlob(blob, `工地清單_${dateStr()}.xlsx`)
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}

// ── Phase 2: VO PDF export with Chinese font ─────────────────
// Embeds Noto Sans HK subset (SIL Open Font License, Google).
// The font + jspdf are loaded lazily via dynamic import / fetch so
// the entry chunk stays slim (CI guard: <800 KB).

let _fontLoaded = false

export async function ensureChineseFont(doc: any): Promise<void> {
  if (_fontLoaded) {
    doc.setFont('NotoHK')
    return
  }
  const res = await fetch('/fonts/noto-sans-hk-subset.ttf')
  if (!res.ok) throw new Error('無法載入中文字體')
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  }
  const b64 = btoa(bin)
  doc.addFileToVFS('NotoSansHK.ttf', b64)
  doc.addFont('NotoSansHK.ttf', 'NotoHK', 'normal')
  doc.setFont('NotoHK')
  _fontLoaded = true
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

async function resizeImageMaxKB(blob: Blob, maxKB: number): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    let scale = 1
    const w = img.naturalWidth
    const h = img.naturalHeight
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * scale))
      canvas.height = Math.max(1, Math.round(h * scale))
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const candidate: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.75))
      if (candidate.size <= maxKB * 1024) return candidate
      scale *= 0.75
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.5))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportVOToPDF(
  project: Project,
  vo: VO,
  version: VOVersion,
  drawings: DrawingVersion[],
  _users: Record<string, UserProfile>,
  approvalTimeline: Array<{ actor_name: string; action_zh: string; at: string; reason: string | null }>,
  parentSiNumber?: string,
): Promise<void> {
  // Rendered via html2canvas (system CJK fonts) — see htmlToPdfBlob — so every
  // Chinese character renders, not just the embedded jsPDF subset's glyphs.
  const { supabase } = await import('./supabase')
  const esc = escapeHtml
  const row = (label: string, val: string) =>
    `<div class="pgblk" style="display:flex; gap:8px; padding:3px 0; font-size:13px;"><span style="color:#64748b; min-width:120px; flex-shrink:0;">${esc(label)}</span><span style="color:#0f172a; font-weight:600; word-break:break-all;">${esc(val)}</span></div>`
  const head = (t: string) =>
    `<div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:16px 0 6px; border-bottom:2px solid #f97316; padding-bottom:3px;">${esc(t)}</div>`

  // Drawing thumbnails: fetch + resize + embed as data-URL <img> (html2canvas
  // rasterises them). Missing thumbnails are skipped (non-fatal).
  let drawingsHtml = ''
  for (const dv of drawings) {
    const { data: signed } = await supabase.storage.from('project-drawings').createSignedUrl(dv.file_path, 300)
    if (!signed?.signedUrl) continue
    try {
      const blob = await (await fetch(signed.signedUrl)).blob()
      const resized = await resizeImageMaxKB(blob, 200)
      const dataUrl = await blobToDataUrl(resized)
      drawingsHtml += `<div class="pgblk" style="display:inline-block; width:48%; margin:1%; vertical-align:top;"><img src="${dataUrl}" style="width:100%; border:1px solid #e2e8f0;"/></div>`
    } catch { /* skip */ }
  }

  const items = version.payload.line_items
  const itemRows = items.map((li, i) => [
    (i + 1).toString(),
    LINE_ITEM_CATEGORY_ZH[li.category],
    li.description,
    li.quantity.toString(),
    li.unit,
    formatHKD(li.unit_price_cents),
    formatHKD(li.subtotal_cents),
  ])
  const itemFoot = `<tr class="pgblk"><td colspan="6" style="border:1px solid #cbd5e1; padding:5px 7px; font-size:11px; font-weight:700; text-align:right; background:#f1f5f9;">${esc('經系統核算總額')}</td><td style="border:1px solid #cbd5e1; padding:5px 7px; font-size:11px; font-weight:700; background:#f1f5f9;">${esc(formatHKD(vo.total_amount_cents))}</td></tr>`

  let body = `
    <div class="pgblk" style="font-size:22px; font-weight:800;">變更指令 ${esc(vo.number)}</div>
    <div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">CK工程 — 變更指令 (Variation Order)</div>
    ${head('資料')}
    ${row('項目', project.name)}
    ${row('狀態', vo.status)}
    ${row('提交', vo.submitted_at ?? '—')}
    ${row('鎖定', vo.locked_at ?? '—')}
    ${row('參考工地指令', parentSiNumber ?? '—')}`
  if (version.payload.description) body += row('說明', version.payload.description)
  body += head('項目明細')
    + htmlTable(['#', '類別', '描述', '數量', '單位', '單價', '小計'], itemRows, { footHtml: itemFoot })
  body += head('簽核紀錄')
    + htmlTable(['時間', '動作', '處理者', '原因'], approvalTimeline.map(a => [a.at, a.action_zh, a.actor_name, a.reason ?? '']))
  if (drawingsHtml) body += head('附圖') + `<div>${drawingsHtml}</div>`
  body += `<div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">產生時間：${esc(new Date().toLocaleString('zh-HK'))} — 由 CK工程系統產生</div>`

  const blob = await htmlToPdfBlob(body)
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_${vo.number}_${dateStr()}.pdf`, `變更指令 ${vo.number} — ${project.name}`)
}

// ── 地盤表格 approved-form PDF replica (v55) ───────────────────
// §5 step 7 (paper bridge): after a successful record_form_signoff, generate the
// statutory approved-form replica embedding the rendered checklist + the drawn
// signature, so the qualified person can print and post it on the scaffold /
// machine as the displayed copy. Returns the Blob so the caller can BOTH share
// it AND upload it to storage to populate form_signoffs.pdf_path.
//
// WHERE pdf_path WOULD BE WIRED: the v55 schema reserves form_signoffs.pdf_path
// but ships no storage bucket + no setter RPC (form_signoffs INSERT is RPC-only
// via record_form_signoff, which does not yet accept a pdf_path; an UPDATE is
// blocked by the append-only posture). So a future migration must add a
// `form-pdfs` bucket + a `set_form_signoff_pdf(p_signoff_id, p_path)` definer
// RPC; the client would then `supabase.storage.from('form-pdfs').upload(path,
// blob)` and call that RPC. Until then we generate + share/download the replica
// (fully functional for the print-and-post statutory flow) and leave pdf_path
// null. See EquipmentContext.signOff caller.

export interface FormPdfInput {
  projectName: string
  templateName: string
  templateCode: string
  statutoryRef: string | null
  equipmentName: string
  equipmentRef: string
  location: string | null
  resultZh: string
  // The rendered checklist: each row's label + the signer's tick (true/false/null)
  // + optional remark, read out of the signoff payload.
  checklist: Array<{ label_zh: string; value: boolean | null; remark?: string }>
  signerName: string
  signedAt: string
  validUntil: string | null
  certNo: string | null
  // Pure base64 PNG (no data: prefix) from PtwSignaturePad.
  signatureB64: string
}

export async function generateFormSignoffPdf(input: FormPdfInput): Promise<Blob> {
  // Rendered via html2canvas (system CJK fonts) — see htmlToPdfBlob — so every
  // Chinese character renders, not just the embedded jsPDF subset's glyphs.
  const esc = escapeHtml
  const row = (label: string, val: string) =>
    `<div class="pgblk" style="display:flex; gap:8px; padding:3px 0; font-size:13px;"><span style="color:#64748b; min-width:120px; flex-shrink:0;">${esc(label)}</span><span style="color:#0f172a; font-weight:600; word-break:break-all;">${esc(val)}</span></div>`
  const head = (t: string) =>
    `<div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:16px 0 6px; border-bottom:2px solid #f97316; padding-bottom:3px;">${esc(t)}</div>`

  let body = `
    <div class="pgblk" style="font-size:22px; font-weight:800;">${esc(input.templateName)}</div>
    <div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">CK工程 — 法定表格簽核記錄</div>
    ${head('表格資料')}
    ${row('表格編號', input.templateCode)}`
  if (input.statutoryRef) body += row('法定依據', input.statutoryRef)
  body += row('項目', input.projectName)
    + row('機械 / 結構', `${input.equipmentRef} ${input.equipmentName}`)
  if (input.location) body += row('位置', input.location)
  body += row('檢查結果', input.resultZh)

  body += head('檢查項目')
  for (const r of input.checklist) {
    const mark = r.value === true ? '[合格]' : r.value === false ? '[不合格]' : '[—]'
    const color = r.value === true ? '#16a34a' : r.value === false ? '#dc2626' : '#64748b'
    body += `<div class="pgblk" style="font-size:13px; padding:2px 0;"><span style="color:${color}; font-weight:700;">${esc(mark)}</span> ${esc(r.label_zh)}${r.remark ? `<div style="color:#64748b; font-size:11px; padding-left:16px;">備註：${esc(r.remark)}</div>` : ''}</div>`
  }

  body += head('簽署')
  body += `<div class="pgblk" style="display:flex; gap:20px; align-items:flex-start; margin-top:4px;">`
  if (input.signatureB64) {
    body += `<img src="data:image/png;base64,${input.signatureB64}" style="width:180px; height:70px; object-fit:contain; border:1px solid #e2e8f0;"/>`
  }
  body += `<div style="font-size:13px; line-height:1.7;">`
    + `<div>合資格人士：<b>${esc(input.signerName)}</b></div>`
    + (input.certNo ? `<div>證書編號：${esc(input.certNo)}</div>` : '')
    + `<div>簽署時間：${esc(new Date(input.signedAt).toLocaleString('zh-HK'))}</div>`
    + (input.validUntil ? `<div>有效至：${esc(new Date(input.validUntil).toLocaleString('zh-HK'))}</div>` : '')
    + `</div></div>`
  body += `<div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">產生時間：${esc(new Date().toLocaleString('zh-HK'))} — 由 CK工程系統產生</div>`

  return await htmlToPdfBlob(body)
}

// Convenience wrapper: generate + share/download (print-and-post flow).
export async function shareFormSignoffPdf(input: FormPdfInput): Promise<void> {
  const blob = await generateFormSignoffPdf(input)
  const filename = `${safeName(input.projectName)}_${input.templateCode}_${safeName(input.equipmentName)}_${dateStr()}.pdf`
  await shareOrDownloadBlob(blob, filename, `${input.templateName} — ${input.equipmentName}`)
}

// ── 簽名證明 certificate (v60 non-repudiation) ──────────────────
// The 本人 proof certificate for 勞工處: WHO signed (verified account + derived
// phone + project role), WHICH credential backed it, WHAT was signed, WHEN, the
// re-auth posture, and the hash-chain tamper-evidence. SignatureProofCard reads
// get_signature_proof(p_kind,p_id) and renders this on screen; the 匯出簽名證明
// button renders the SAME proof object into this jsPDF doc. Shape mirrors the
// get_signature_proof return jsonb (see supabase/v60-sign-reauth.sql §7).

export interface SignatureProofInput {
  kind: 'ptw' | 'form'
  signerName: string | null
  signerPhone: string | null
  signerRoleZh: string | null
  credential: Record<string, unknown> | null
  docNumber: string | null
  docKindZh: string          // e.g. 動火工作許可證 / 法定表格
  projectName: string | null
  detailZh: string | null    // ptw_type label OR 表格 + result, for the WHAT line
  signedAt: string | null
  reauthEnforced: boolean
  reauthMethodZh: string     // e.g. 密碼重新驗證
  ledgerSeq: number | null
  ledgerHash: string | null
  integrityIntact: boolean
  integrityReason: string | null
  attestationZh: string
}

export async function exportSignatureProofPdf(input: SignatureProofInput): Promise<void> {
  // Rendered via html2canvas (system CJK fonts) — see htmlToPdfBlob — so every
  // Chinese character renders, not just the embedded subset's glyphs.
  const esc = escapeHtml
  const row = (label: string, val: string) =>
    `<div class="pgblk" style="display:flex; gap:8px; padding:3px 0; font-size:13px;"><span style="color:#64748b; min-width:120px; flex-shrink:0;">${esc(label)}</span><span style="color:#0f172a; font-weight:600; word-break:break-all;">${esc(val)}</span></div>`
  const para = (t: string) =>
    `<div class="pgblk" style="font-size:12px; color:#475569; margin:4px 0; line-height:1.5;">${esc(t)}</div>`
  const head = (t: string) =>
    `<div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:16px 0 6px; border-bottom:2px solid #f97316; padding-bottom:3px;">${esc(t)}</div>`

  let body = `
    <div class="pgblk" style="font-size:22px; font-weight:800;">簽名證明 (Signature Proof)</div>
    <div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">CK工程 — 電子簽名非否認證明（勞工處用途）</div>
    ${head('簽署人')}
    ${row('姓名', input.signerName ?? '（未知）')}
    ${row('電話', input.signerPhone ?? '未提供')}
    ${row('項目角色', input.signerRoleZh ?? '—')}`

  if (input.credential) {
    const c = input.credential as Record<string, any>
    const certNo = c.cert_no ?? c.certNo ?? null
    const type = c.type ?? c.credential_type ?? null
    const validUntil = c.valid_until ?? c.validUntil ?? null
    body += head('合資格人士證明')
    if (type) body += row('資格類別', String(type))
    if (certNo) body += row('證書編號', String(certNo))
    if (validUntil) body += row('有效至', new Date(String(validUntil)).toLocaleDateString('zh-HK'))
  }

  body += head('簽署文件')
    + row('類型', input.docKindZh)
    + row('編號', input.docNumber ?? '—')
    + (input.projectName ? row('項目', input.projectName) : '')
    + (input.detailZh ? row('內容', input.detailZh) : '')
    + row('簽署時間', input.signedAt ? `${new Date(input.signedAt).toLocaleString('zh-HK')}（香港時間）` : '未知')

  body += head('身份驗證')
    + row('簽署前重新驗證', input.reauthEnforced ? `已啟用（${input.reauthMethodZh}）` : `未強制（${input.reauthMethodZh}）`)

  body += head('防篡改記錄')
    + row('帳本序號', input.ledgerSeq !== null ? String(input.ledgerSeq) : '未記錄')
    + (input.ledgerHash ? row('雜湊', input.ledgerHash) : '')
    + row('雜湊鏈完整性', input.integrityIntact ? '完整（未被竄改）' : `已破損${input.integrityReason ? `：${input.integrityReason}` : ''}`)

  body += head('證明聲明') + para(input.attestationZh)
    + `<div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">產生時間：${esc(new Date().toLocaleString('zh-HK'))} — 由 CK工程系統產生</div>`

  const blob = await htmlToPdfBlob(body)
  const filename = `簽名證明_${safeName(input.docNumber ?? input.kind)}_${dateStr()}.pdf`
  await shareOrDownloadBlob(blob, filename, `簽名證明 — ${input.docNumber ?? input.docKindZh}`)
}

// ── Compliance proof pack (DWSS §5.4-style record proof) ──────────
// Doc-level proof bundling record identity + its approval chain + the
// tamper-evident-ledger integrity attestation into one PDF. Usable on any doc
// type (PTW / SI / VO). Reuses the Noto Sans HK font + native/web share helper.
export interface ProofPackInput {
  docKindZh: string          // e.g. '工作許可證 (PTW)'
  docNumber: string          // e.g. 'PTW-001'
  dwssRefStr?: string        // e.g. 'SSR/PTW/000001'
  projectName?: string
  statusZh?: string
  detailZh?: string          // type / title
  chainRolesZh?: string[]    // approval-chain role labels, in order
}

// Render an HTML body string to a paginated A4 PDF blob via html2canvas, using
// the browser's system CJK fonts (Microsoft JhengHei / PingFang HK / Noto CJK) —
// the SAME mechanism as exportProgressToPDF. This is why it renders ALL Chinese
// correctly: it does NOT depend on the embedded jsPDF subset font (which only
// carries a limited glyph set and garbled any character outside it). Use a
// `pgblk` class on top-level blocks so the pager never bisects a row.
async function htmlToPdfBlob(bodyHtml: string): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default
  const W = 794 // A4 portrait @ ~96dpi
  const container = document.createElement('div')
  container.style.cssText = [
    'position:fixed', 'top:0', 'left:-10000px', `width:${W}px`, 'padding:28px',
    'background:#ffffff',
    'font-family:Inter,"Microsoft JhengHei","PingFang HK","Heiti TC","Noto Sans CJK TC",sans-serif',
    'color:#0f172a',
  ].join('; ')
  container.innerHTML = bodyHtml
  document.body.appendChild(container)
  try {
    const cTop = container.getBoundingClientRect().top
    const blockBottoms = Array.from(container.querySelectorAll('.pgblk, .pgavoid'))
      .map(b => (b as HTMLElement).getBoundingClientRect().bottom - cTop)
    // .pgavoid = keep the WHOLE element on one page (page-break-inside: avoid).
    // Break candidates strictly inside a page-sized pgavoid are discarded, so
    // the slicer breaks before it instead of bisecting its border box.
    const avoidRects = Array.from(container.querySelectorAll('.pgavoid')).map(b => {
      const r = (b as HTMLElement).getBoundingClientRect()
      return { top: r.top - cTop, bottom: r.bottom - cTop }
    })
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', logging: false })
    const cssToCanvas = canvas.height / container.offsetHeight
    const doc: any = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageWpt = doc.internal.pageSize.getWidth()
    const pageHpt = doc.internal.pageSize.getHeight()
    const pageHcanvas = (pageHpt * canvas.width) / pageWpt
    const avoids = avoidRects
      .map(r => ({ top: r.top * cssToCanvas, bottom: r.bottom * cssToCanvas }))
      .filter(r => r.bottom - r.top <= pageHcanvas - 24)
    const bounds = blockBottoms.map(b => b * cssToCanvas)
      .filter(b => !avoids.some(r => b > r.top + 6 && b < r.bottom - 6))
      .sort((a, b) => a - b)
    let startPx = 0, first = true
    while (startPx < canvas.height - 1) {
      let endPx = startPx + pageHcanvas
      if (endPx < canvas.height) {
        const cand = bounds.filter(b => b > startPx + 12 && b <= endPx)
        if (cand.length) endPx = cand[cand.length - 1]
      } else {
        endPx = canvas.height
      }
      const sliceH = Math.max(1, Math.round(endPx - startPx))
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, sliceH)
      ctx.drawImage(canvas, 0, -startPx)
      if (!first) doc.addPage()
      doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWpt, (sliceH * pageWpt) / canvas.width)
      startPx = endPx; first = false
    }
    return doc.output('blob') as Blob
  } finally {
    document.body.removeChild(container)
  }
}

// Build a pager-friendly HTML table for htmlToPdfBlob. Each <tr> carries the
// `pgblk` class so the slicer never bisects a row. Cells are HTML-escaped.
function htmlTable(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  opts?: { headFill?: string; footHtml?: string },
): string {
  const esc = escapeHtml
  const th = headers
    .map(h => `<th style="border:1px solid #cbd5e1; padding:5px 7px; font-size:11px; text-align:left; color:#ffffff; background:${opts?.headFill ?? '#1d4ed8'};">${esc(h)}</th>`)
    .join('')
  const trs = rows
    .map(r => `<tr class="pgblk">${r.map(c => `<td style="border:1px solid #e2e8f0; padding:5px 7px; font-size:11px; color:#0f172a; vertical-align:top; word-break:break-word;">${esc(c == null ? '' : String(c))}</td>`).join('')}</tr>`)
    .join('')
  return `<table style="border-collapse:collapse; width:100%; margin:6px 0; table-layout:fixed;"><thead><tr>${th}</tr></thead><tbody>${trs}${opts?.footHtml ?? ''}</tbody></table>`
}

export async function exportComplianceProofPack(input: ProofPackInput): Promise<void> {
  // Global ledger integrity attestation (per-record audit lives in the same chain).
  let integrity: any = null
  try {
    const { data } = await supabase.rpc('verify_integrity')
    integrity = data
  } catch { /* best-effort */ }

  const esc = escapeHtml
  const row = (label: string, val: string) =>
    `<div class="pgblk" style="display:flex; gap:8px; padding:3px 0; font-size:13px;"><span style="color:#64748b; min-width:120px; flex-shrink:0;">${esc(label)}</span><span style="color:#0f172a; font-weight:600; word-break:break-all;">${esc(val)}</span></div>`
  const para = (t: string) =>
    `<div class="pgblk" style="font-size:12px; color:#475569; margin:4px 0; line-height:1.5;">${esc(t)}</div>`
  const head = (t: string) =>
    `<div class="pgblk" style="font-size:15px; font-weight:700; color:#0f172a; margin:16px 0 6px; border-bottom:2px solid #f97316; padding-bottom:3px;">${esc(t)}</div>`

  let body = `
    <div class="pgblk" style="font-size:22px; font-weight:800;">合規證明書 (Compliance Proof)</div>
    <div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">CK工程 — 數碼工地記錄合規證明（對標 DEVB DWSS Annex A）</div>
    ${head('文件')}
    ${row('類型', input.docKindZh)}
    ${row('編號', input.docNumber)}
    ${input.dwssRefStr ? row('DWSS 格式編號', input.dwssRefStr) : ''}
    ${input.projectName ? row('項目', input.projectName) : ''}
    ${input.statusZh ? row('狀態', input.statusZh) : ''}
    ${input.detailZh ? row('內容', input.detailZh) : ''}`

  if (input.chainRolesZh && input.chainRolesZh.length) {
    body += head('審批流程') + row('審批鏈', `${input.chainRolesZh.length} 步`)
      + input.chainRolesZh.map((r, i) => row(`第 ${i + 1} 步`, r)).join('')
  }

  body += head('防篡改記錄')
    + para('本記錄載於 CK工程防篡改審計帳本（append-only、sha256 雜湊鏈）。任何對歷史記錄嘅竄改都會打斷雜湊鏈，可被偵測。')
  if (integrity) {
    body += row('帳本完整性', integrity.intact ? '完整（未被竄改）' : `已破損${integrity.reason ? `：${integrity.reason}` : ''}`)
    if (integrity.head_seq != null) body += row('帳本序號 (head)', String(integrity.head_seq))
    if (integrity.head_hash) body += row('鏈頭雜湊', String(integrity.head_hash))
    if (integrity.verified_at) body += row('驗證時間', `${integrity.verified_at}（UTC）`)
  } else {
    body += row('帳本完整性', '未能即時取得（請於系統「資料完整性」頁覆核）')
  }

  body += head('證明聲明')
    + para('本證明由 CK工程系統自動產生，列明上述記錄之審批流程及其喺防篡改審計帳本中嘅完整性狀態。第三方可透過系統 verify_integrity / export_ledger_proof 函數離線覆核雜湊鏈。本聲明為自我評估；CK工程並非政府 DWSS，亦未經第三方認證。')
    + `<div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">產生時間：${esc(new Date().toLocaleString('zh-HK'))} — 由 CK工程系統產生</div>`

  const blob = await htmlToPdfBlob(body)
  const filename = `合規證明_${safeName(input.docNumber)}_${dateStr()}.pdf`
  await shareOrDownloadBlob(blob, filename, `合規證明 — ${input.docNumber}`)
}

// ── 天氣記錄 / 極端天氣 EOT 申索 export (Weather Part 2) ──────────
// Joins each per-project project_weather_claims row to the territory-wide
// weather_events evidence on the same hkt_date so an EOT claim ships with its
// objective HKO grounds (T8+/黑雨/紅雨/24h雨量>20mm). Mirrors the CEDD PAH
// Appendix 7.4 (Inclement Weather Report Form) discretionary fields. Replaces
// the ad-hoc anchor-download CSV that Capacitor's WebView blocks on native.

// One ZH line summarising a date's weather_events (kind labels + rainfall mm).
function weatherEventsLabel(evs: WeatherEvent[]): string {
  return evs
    .map(e => {
      const base = WEATHER_KIND_ZH[e.kind as WeatherKind] ?? e.kind
      const mm = e.kind === 'rainfall_20mm' && e.evidence?.mm != null ? `（${e.evidence.mm}mm）` : ''
      return base + mm
    })
    .join(' + ')
}

// Stations recorded for a date (rain-gauge codes for rainfall_20mm rows).
function weatherStations(evs: WeatherEvent[]): string {
  return Array.from(new Set(evs.map(e => e.station).filter((s): s is string => !!s))).join(' / ')
}

const yesNo = (v: boolean | null | undefined) => v == null ? '' : v ? '是' : '否'

export async function exportWeatherEotToExcel(
  project: Project,
  events: WeatherEvent[],
  claims: WeatherClaim[],
): Promise<void> {
  const eventsByDate = new Map<string, WeatherEvent[]>()
  for (const e of events) {
    const a = eventsByDate.get(e.hkt_date) ?? []
    a.push(e)
    eventsByDate.set(e.hkt_date, a)
  }
  const totalDays = claims.reduce((s, c) => s + (Number(c.claim_days) || 0), 0)
  const sorted = claims.slice().sort((a, b) => a.hkt_date.localeCompare(b.hkt_date))

  const aoa: (string | number | null)[][] = []
  aoa.push([`${project.name} — 天氣記錄 / 極端天氣 EOT 申索`])
  aoa.push([`產生：${new Date().toLocaleString('zh-HK')}`])
  aoa.push([`已記錄申請 EOT 總日數：${totalDays} 日 · 共 ${claims.length} 日`])
  aoa.push([])
  const header = ['日期', '天氣事件', '天文台站', '觸發', '關鍵路徑', '可施工', '善後日數', '申請EOT日數', '備註']
  aoa.push(header)
  for (const c of sorted) {
    const evs = eventsByDate.get(c.hkt_date) ?? []
    aoa.push([
      c.hkt_date,
      weatherEventsLabel(evs),
      weatherStations(evs),
      c.trigger,
      yesNo(c.on_critical_path),
      yesNo(c.ready_to_work),
      c.tidy_days ?? '',
      c.claim_days ?? '',
      c.note ?? '',
    ])
  }
  aoa.push([])
  aoa.push(['', '', '', '', '', '', '', totalDays, '申請EOT總日數'])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 28 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '天氣EOT記錄')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_天氣EOT_${dateStr()}.xlsx`, `${project.name} — 天氣 EOT 申索（${totalDays} 日）`)
}

// PDF variant — emulates the CEDD Inclement Weather Report Form layout via
// jsPDF + autoTable (ensureChineseFont so every glyph renders).
export async function exportWeatherEotToPDF(
  project: Project,
  events: WeatherEvent[],
  claims: WeatherClaim[],
): Promise<void> {
  // Rendered via html2canvas (system CJK fonts) — see htmlToPdfBlob.
  const esc = escapeHtml
  const eventsByDate = new Map<string, WeatherEvent[]>()
  for (const e of events) {
    const a = eventsByDate.get(e.hkt_date) ?? []
    a.push(e)
    eventsByDate.set(e.hkt_date, a)
  }
  const totalDays = claims.reduce((s, c) => s + (Number(c.claim_days) || 0), 0)
  const sorted = claims.slice().sort((a, b) => a.hkt_date.localeCompare(b.hkt_date))

  const rows = sorted.map(c => {
    const evs = eventsByDate.get(c.hkt_date) ?? []
    return [
      c.hkt_date,
      weatherEventsLabel(evs),
      c.trigger,
      yesNo(c.on_critical_path),
      yesNo(c.ready_to_work),
      c.tidy_days ?? '',
      c.claim_days ?? '',
      c.note ?? '',
    ]
  })
  const foot = `<tr class="pgblk"><td colspan="6" style="border:1px solid #cbd5e1; padding:5px 7px; font-size:11px; font-weight:700; text-align:right; background:#f1f5f9;">${esc('申請 EOT 總日數')}</td><td style="border:1px solid #cbd5e1; padding:5px 7px; font-size:11px; font-weight:700; background:#f1f5f9;">${esc(String(totalDays))}</td><td style="border:1px solid #cbd5e1; background:#f1f5f9;"></td></tr>`

  const body = `
    <div class="pgblk" style="font-size:20px; font-weight:800;">惡劣天氣 / 工期延誤 (EOT) 申索報告</div>
    <div class="pgblk" style="font-size:12px; color:#64748b; margin-top:4px;">CK工程 — 天氣 EOT 申索</div>
    <div class="pgblk" style="font-size:13px; margin-top:8px;">項目：<b>${esc(project.name)}</b></div>
    <div class="pgblk" style="font-size:13px; padding:2px 0;">已記錄申請 EOT 總日數：<b>${esc(String(totalDays))}</b> 日 · 共 ${esc(String(claims.length))} 日</div>
    <div class="pgblk" style="font-size:11px; color:#475569; margin-top:6px; line-height:1.5;">標準：T8 或以上 / 黑雨 / 紅雨 / 24 小時雨量 &gt; 20mm（私人 SFBC / 房署客觀準則）。政府 GCC 為酌情，需填關鍵路徑等資料供工程師審批。資料來源：香港天文台。</div>
    ${htmlTable(['日期', '天氣事件', '觸發', '關鍵路徑', '可施工', '善後', 'EOT', '備註'], rows, { footHtml: foot })}
    <div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">產生時間：${esc(new Date().toLocaleString('zh-HK'))} — 由 CK工程系統產生</div>`

  const blob = await htmlToPdfBlob(body)
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_天氣EOT_${dateStr()}.pdf`, `${project.name} — 天氣 EOT 申索（${totalDays} 日）`)
}

// ── 機械登記 / 法定表格 register export (equipment module) ────────
// Two sheets: 機械登記 (equipment_register) + 檢查狀態 (each form_instance's
// derived FormStatus + its latest form_signoffs row). pdf_path is always NULL
// (no bucket / setter RPC), so no PDF-link column is exported.

// Latest signoff for an instance (by signed_at).
function latestSignoff(signoffs: FormSignoff[] | undefined): FormSignoff | null {
  if (!signoffs || signoffs.length === 0) return null
  return signoffs.slice().sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0]
}

export async function exportEquipmentRegister(
  project: Project,
  equipment: Equipment[],
  instances: FormInstance[],
  signoffsByInstance: Record<string, FormSignoff[]>,
  templateById: Record<string, FormTemplate>,
  dashboard: FormsDashboard | null,
  users: Record<string, UserProfile>,
): Promise<void> {
  // Sheet 1 — 機械登記
  const equipRows = equipment
    .slice()
    .sort((a, b) => a.ref_no.localeCompare(b.ref_no))
    .map(eq => ({
      編號: eq.ref_no,
      名稱: eq.name_zh,
      類別: EQUIPMENT_KIND_ZH[eq.kind as EquipmentKind] ?? eq.kind,
      品牌型號: eq.brand_model ?? '',
      序號: eq.serial_no ?? '',
      位置: eq.location_zh ?? '',
      狀態: EQUIPMENT_STATUS_ZH[eq.status as EquipmentStatus] ?? eq.status,
    }))
  const ws1 = XLSX.utils.json_to_sheet(equipRows)
  ws1['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '機械登記')

  // Sheet 2 — 檢查狀態. Prefer the server dashboard rows (status already
  // derived server-side); fall back to deriving from instances + templates.
  const equipNameById = new Map(equipment.map(eq => [eq.id, `${eq.ref_no} ${eq.name_zh}`]))
  const dashByInstance = new Map((dashboard?.rows ?? []).map(r => [r.instance_id, r]))

  const inspRows = instances
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(inst => {
      const tpl = templateById[inst.template_id]
      const dash = dashByInstance.get(inst.id)
      const status: FormStatus = dash?.status
        ?? deriveFormStatus(inst, tpl?.remind_before_days ?? 0)
      const last = latestSignoff(signoffsByInstance[inst.id])
      const equipName = inst.equipment_id
        ? (equipNameById.get(inst.equipment_id) ?? dash?.equipment_name ?? '')
        : (dash?.equipment_name ?? '')
      return {
        機械: equipName,
        表格: tpl ? `${tpl.name_zh}（${tpl.code}）` : (dash ? `${dash.template_name}（${dash.template_code}）` : ''),
        法定依據: tpl?.statutory_ref ?? '',
        狀態: FORM_STATUS_ZH[status],
        有效至: inst.valid_until ? new Date(inst.valid_until).toLocaleDateString('zh-HK') : '',
        最後簽署: last ? new Date(last.signed_at).toLocaleString('zh-HK') : '',
        簽署人: last ? (users[last.signed_by]?.name ?? '前成員') : '',
        結果: last ? FORM_RESULT_ZH[last.result] : '',
        暫停: yesNo(inst.suspended),
      }
    })
  const ws2 = XLSX.utils.json_to_sheet(inspRows)
  ws2['!cols'] = [{ wch: 24 }, { wch: 26 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 8 }]

  // KPI header rows prepended to sheet 2 from dashboard.counts (when available).
  if (dashboard) {
    const c = dashboard.counts
    XLSX.utils.sheet_add_aoa(ws2, [[
      `有效 ${c.valid} · 即將到期 ${c.expiring} · 過期 ${c.expired} · 未簽 ${c.missing} · 停用 ${c.suspended}`,
    ]], { origin: -1 })
  }
  XLSX.utils.book_append_sheet(wb, ws2, '檢查狀態')

  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_機械表格_${dateStr()}.xlsx`, `${project.name} — 機械登記 / 法定表格`)
}

// ── Guided 進度表 export (v112) — the flat leaf carries every dimension:
// 類別(大樓/外圍) × 分區 × 工種(trade_label) × 位置 × 工序 × 樓層剔格.
// Sheet/section 1 is a 分區×工種 % matrix; sheet/section 2 is one row per
// 工序 with tick counts and the ticked/unticked label lists. done/total are
// TICK counts, so every % is arithmetic over the same cells the app shows.

export interface GuidedExportOptions {
  zoneId?: string | null
  tradeLabel?: string | null
}

interface GuidedRow {
  kindZh: string
  zoneIdx: number
  zoneName: string
  trade: string
  location: string
  title: string
  done: number
  total: number
  pct: number | null
  doneLabels: string[]
  restLabels: string[]
  // ordered per-floor cells — the app's 格仔 strip, reproduced in the report
  cells: { label: string; done: boolean }[]
}

// sketch layout v2: outer group = 分區 × 位置 (with its own progress bar),
// inner sub-groups = 工種 banners, then one box per 工序. Rows arrive sorted
// kind → zone → location → trade → title, so consecutive grouping suffices.
interface GuidedTradeSub {
  trade: string
  rows: GuidedRow[]
}
interface GuidedLocGroup {
  kindZh: string
  zoneName: string
  location: string
  rows: GuidedRow[]
  trades: GuidedTradeSub[]
}

function groupByLocation(rows: GuidedRow[]): GuidedLocGroup[] {
  const out: GuidedLocGroup[] = []
  for (const r of rows) {
    let g = out[out.length - 1]
    if (!g || g.kindZh !== r.kindZh || g.zoneName !== r.zoneName || g.location !== r.location) {
      g = { kindZh: r.kindZh, zoneName: r.zoneName, location: r.location, rows: [], trades: [] }
      out.push(g)
    }
    g.rows.push(r)
    let t = g.trades[g.trades.length - 1]
    if (!t || t.trade !== r.trade) {
      t = { trade: r.trade, rows: [] }
      g.trades.push(t)
    }
    t.rows.push(r)
  }
  return out
}

function pctOfGuidedRows(rows: GuidedRow[]): number | null {
  const done = rows.reduce((s, r) => s + r.done, 0)
  const total = rows.reduce((s, r) => s + r.total, 0)
  return total === 0 ? null : Math.round((done / total) * 100)
}

// text progress bar for Excel cells (no cell styling in community xlsx)
function textBar(p: number | null): string {
  if (p === null) return '—'
  const filled = Math.round(p / 10)
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${p}%`
}

function buildGuidedRows(project: Project, items: ProgressItem[], opts: GuidedExportOptions): GuidedRow[] {
  const leaves = items.filter(i =>
    !items.some(c => c.parent_id === i.id)
    && i.node_kind !== 'floor'
    && (!opts.zoneId || i.zone_id === opts.zoneId)
    && (!opts.tradeLabel || i.trade_label === opts.tradeLabel))
  const rows = leaves.map(l => {
    const zi = project.zones.findIndex(z => z.id === l.zone_id)
    const zone = zi >= 0 ? project.zones[zi] : undefined
    const labels = Array.isArray(l.floor_labels) ? l.floor_labels : []
    const ticked = new Set(Array.isArray(l.floors_completed) ? l.floors_completed : [])
    const done = labels.filter(f => ticked.has(f))
    const rest = labels.filter(f => !ticked.has(f))
    return {
      kindZh: zone?.kind === 'external' ? '外圍' : '大樓',
      zoneIdx: zi >= 0 ? zi : 99,
      zoneName: zone?.name ?? l.zone_id ?? '—',
      trade: l.trade_label ?? '未分類',
      location: l.location ?? (zone?.kind === 'external' ? '—' : '未分類'),
      title: l.title,
      done: done.length,
      total: labels.length,
      pct: labels.length === 0 ? null : Math.round((done.length / labels.length) * 100),
      doneLabels: done,
      restLabels: rest,
      cells: labels.map(f => ({ label: f, done: ticked.has(f) })),
    }
  })
  rows.sort((a, b) =>
    a.kindZh.localeCompare(b.kindZh)
    || a.zoneIdx - b.zoneIdx
    || a.location.localeCompare(b.location)
    || a.trade.localeCompare(b.trade)
    || a.title.localeCompare(b.title))
  return rows
}

function guidedMatrix(project: Project, rows: GuidedRow[]) {
  const trades = [...new Set(rows.map(r => r.trade))]
  const zoneNames = project.zones
    .filter(z => rows.some(r => r.zoneName === z.name))
    .map(z => z.name)
  const pctOf = (rs: GuidedRow[]): number | null => {
    const done = rs.reduce((s, r) => s + r.done, 0)
    const total = rs.reduce((s, r) => s + r.total, 0)
    return total === 0 ? null : Math.round((done / total) * 100)
  }
  const lines = zoneNames.map(zn => {
    const zr = rows.filter(r => r.zoneName === zn)
    return {
      zone: zn,
      cells: trades.map(t => pctOf(zr.filter(r => r.trade === t))),
      overall: pctOf(zr),
    }
  })
  return {
    trades,
    lines,
    overall: trades.map(t => pctOf(rows.filter(r => r.trade === t))),
    grand: pctOf(rows),
  }
}

function guidedFilterLabel(project: Project, opts: GuidedExportOptions): string {
  const parts: string[] = []
  if (opts.zoneId) parts.push(`分區：${project.zones.find(z => z.id === opts.zoneId)?.name ?? opts.zoneId}`)
  if (opts.tradeLabel) parts.push(`工種：${opts.tradeLabel}`)
  return parts.join(' · ')
}

const fmtGuidedPct = (p: number | null) => (p === null ? '—' : `${p}%`)

export async function exportGuidedProgressToExcel(project: Project, items: ProgressItem[], opts: GuidedExportOptions = {}) {
  const rows = buildGuidedRows(project, items, opts)
  const m = guidedMatrix(project, rows)
  const filterLabel = guidedFilterLabel(project, opts)

  const aoa1: (string | number | null)[][] = []
  aoa1.push([`${project.name} — 進度總覽（分區 × 工種）`])
  aoa1.push([`產生：${new Date().toLocaleString('zh-HK')}${filterLabel ? ` · ${filterLabel}` : ''}`])
  aoa1.push([])
  aoa1.push(['分區', ...m.trades, '整體'])
  for (const line of m.lines) aoa1.push([line.zone, ...line.cells.map(textBar), textBar(line.overall)])
  aoa1.push(['整體', ...m.overall.map(textBar), textBar(m.grand)])
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1)
  ws1['!cols'] = [{ wch: 14 }, ...m.trades.map(() => ({ wch: 20 })), { wch: 20 }]

  // 工序明細 — sketch v2: 類別 title → one block per 分區×位置 (with the
  // location's own % bar) → 工種 banner rows → floor-per-column grid
  // (✓ = done, □ = not yet, blank = excluded from that 工序).
  const aoa2: (string | number | null)[][] = []
  aoa2.push([`${project.name} — 工序明細`])
  aoa2.push([])
  let lastKind = ''
  for (const g of groupByLocation(rows)) {
    if (g.kindZh !== lastKind) { aoa2.push([`【${g.kindZh}】`]); lastKind = g.kindZh }
    const headName = g.location !== '—' ? `${g.zoneName} · ${g.location}` : g.zoneName
    aoa2.push([headName, textBar(pctOfGuidedRows(g.rows))])
    const cols: string[] = []
    for (const r of g.rows) for (const c of r.cells) if (!cols.includes(c.label)) cols.push(c.label)
    for (const t of g.trades) {
      aoa2.push([`▍工種：${t.trade}`])
      aoa2.push(['工序', ...cols, '%'])
      for (const r of t.rows) {
        const cellMap = new Map(r.cells.map(c => [c.label, c.done]))
        aoa2.push([
          r.title,
          ...cols.map(cl => !cellMap.has(cl) ? '' : (cellMap.get(cl) ? '✓' : '□')),
          fmtGuidedPct(r.pct),
        ])
      }
    }
    aoa2.push([])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2)
  ws2['!cols'] = [{ wch: 18 }, ...Array.from({ length: 40 }, () => ({ wch: 4.5 }))]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws1, '進度總覽')
  XLSX.utils.book_append_sheet(wb, ws2, '工序明細')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_進度表_${dateStr()}.xlsx`, `${project.name} — 進度表（${rows.length} 個工序）`)
}

export async function exportGuidedProgressToPDF(project: Project, items: ProgressItem[], opts: GuidedExportOptions = {}) {
  // Rendered via html2canvas (system CJK fonts) — see htmlToPdfBlob.
  const esc = escapeHtml
  const rows = buildGuidedRows(project, items, opts)
  const m = guidedMatrix(project, rows)
  const filterLabel = guidedFilterLabel(project, opts)

  // html2canvas renders the whole body to one canvas; browsers cap canvas
  // height (~32k px). Cap the detail 工序 count and say so — never silently.
  const CAP = 400
  const shown = rows.slice(0, CAP)
  const capNote = rows.length > CAP
    ? `<div class="pgblk" style="font-size:11px; color:#b45309; margin-top:6px;">⚠ 只顯示首 ${CAP} 個工序（共 ${rows.length} 個）— 完整明細請匯出 Excel 版</div>`
    : ''

  // 總覽 matrix with real progress bars in every cell. html2canvas mislays
  // flex/inline-block baselines — a two-cell table keeps the bar and its %
  // on one line reliably.
  // palette (ui-ux-pro-max: industrial grey + safety orange, financial-dashboard
  // style): slate chrome, orange = in-progress, emerald = done. No blue headers.
  const bar = (p: number | null): string => p === null
    ? '<span style="color:#94a3b8; font-size:10px;">—</span>'
    : `<table style="border-collapse:collapse; width:100%;"><tbody><tr>
        <td style="padding:0; vertical-align:middle;"><div style="height:7px; background:#e2e8f0; border-radius:4px; overflow:hidden;"><div style="width:${p}%; height:7px; background:${p >= 100 ? '#10b981' : '#f97316'};"></div></div></td>
        <td style="padding:0 0 0 6px; width:34px; font-size:10px; font-weight:700; text-align:right; vertical-align:middle; white-space:nowrap;">${p}%</td>
      </tr></tbody></table>`
  const tdS = 'border:1px solid #e2e8f0; padding:5px 7px; font-size:11px; vertical-align:middle;'
  const thS = 'border:1px solid #1e293b; padding:5px 7px; font-size:11px; text-align:left; color:#ffffff; background:#334155;'
  const matrixHtml = `<table style="border-collapse:collapse; width:100%; margin:6px 0; table-layout:fixed;">
    <thead><tr><th style="${thS} width:70px;">分區</th>${m.trades.map(t => `<th style="${thS}">${esc(t)}</th>`).join('')}<th style="${thS}">整體</th></tr></thead>
    <tbody>
      ${m.lines.map(l => `<tr class="pgblk"><td style="${tdS} font-weight:700;">${esc(l.zone)}</td>${l.cells.map(c => `<td style="${tdS}">${bar(c)}</td>`).join('')}<td style="${tdS}">${bar(l.overall)}</td></tr>`).join('')}
      <tr class="pgblk"><td style="${tdS} font-weight:700; background:#f1f5f9;">整體</td>${m.overall.map(c => `<td style="${tdS} background:#f1f5f9;">${bar(c)}</td>`).join('')}<td style="${tdS} background:#f1f5f9;">${bar(m.grand)}</td></tr>
    </tbody></table>`

  // 明細 — sketch v2: 類別 banner → one card per 分區×位置 whose header row
  // is [分區 chip][位置 chip][progress bar + %] → a 工種 banner per trade →
  // one bordered box per 工序 (name + % on top, 格仔 strip below). Every
  // aligned element is a TABLE — the one layout html2canvas renders
  // faithfully; floor labels get a real 8px/12px line so they no longer
  // clip into the boxes.
  const abbrev = (l: string) => l.replace('/F', '') || l
  // chip text needs the same counter-shift as strip labels (html2canvas paints
  // inline text low): explicit height + line-height + relative span. Offset is
  // pixel-measured with the canvas harness — don't tweak blind.
  const chip = (t: string) => `<td style="width:1%; height:22px; line-height:22px; border:1px solid #64748b; border-radius:8px; padding:0 10px; font-size:12px; font-weight:700; color:#1e293b; white-space:nowrap; text-align:center;"><span style="position:relative; top:-6px;">${esc(t)}</span></td><td style="width:6px;"></td>`
  // one row, label INSIDE the box — no second row to drift out of alignment.
  // html2canvas paints small inline text ~5px below where the browser does
  // (verified pixel-by-pixel against its own canvas output); the relative
  // top:-5px span counter-shifts it to dead centre. Don't "clean this up"
  // without re-running the canvas A/B harness.
  const strip = (cells: GuidedRow['cells']): string => {
    const widthPct = Math.min(100, cells.length * 4.4)
    return `<table style="border-collapse:separate; border-spacing:2px 0; table-layout:fixed; width:${widthPct}%; margin-top:5px;"><tbody>
      <tr>${cells.map(c => `<td style="padding:0; height:17px; line-height:17px; text-align:center; border-radius:3px; overflow:hidden; font-size:9px; font-weight:700; white-space:nowrap; background:${c.done ? '#10b981' : '#f8fafc'}; border:1px solid ${c.done ? '#059669' : '#cbd5e1'}; color:${c.done ? '#ffffff' : '#64748b'};"><span style="position:relative; top:-6px;">${esc(abbrev(c.label))}</span></td>`).join('')}</tr>
    </tbody></table>`
  }
  const pctColorOf = (p: number | null) => p === null ? '#94a3b8' : p >= 100 ? '#059669' : p > 0 ? '#ea580c' : '#94a3b8'
  let detailHtml = ''
  let lastKind = ''
  for (const g of groupByLocation(shown)) {
    if (g.kindZh !== lastKind) {
      detailHtml += `<div class="pgblk" style="font-size:15px; font-weight:800; margin-top:16px; background:#1e293b; color:#ffffff; padding:5px 10px; border-radius:8px; text-align:center;">${esc(g.kindZh)}</div>`
      lastKind = g.kindZh
    }
    const gPct = pctOfGuidedRows(g.rows)
    // 工序 boxes directly under the location header — no 工種 banner (user cut it).
    const inner = g.rows.map(r => `
        <div class="pgblk" style="border:1px solid #cbd5e1; border-radius:8px; padding:6px 9px; margin-top:6px;">
          <table style="border-collapse:collapse; width:100%;"><tbody><tr>
            <td style="padding:0; font-size:12px; font-weight:700; vertical-align:middle;">${esc(r.title)}</td>
            <td style="padding:0; font-size:13px; font-weight:800; text-align:right; vertical-align:middle; white-space:nowrap; color:${pctColorOf(r.pct)};">${r.pct === null ? '—' : `${r.pct}%`}</td>
          </tr></tbody></table>
          ${strip(r.cells)}
        </div>`).join('')
    detailHtml += `
      <div class="pgavoid" style="border:1.5px solid #94a3b8; border-radius:10px; padding:9px 11px; margin-top:10px;">
        <div class="pgblk">
          <table style="border-collapse:separate; border-spacing:0; width:100%;"><tbody><tr>
            ${chip(g.zoneName)}${g.location !== '—' ? chip(g.location) : ''}
            <td style="padding-left:12px; vertical-align:middle;">${bar(gPct)}</td>
          </tr></tbody></table>
        </div>
        ${inner}
      </div>`
  }

  const body = `
    <div class="pgblk" style="font-size:20px; font-weight:800;">${esc(project.name)} — 進度表</div>
    <div class="pgblk" style="font-size:11px; color:#64748b; margin-top:4px;">產生：${esc(new Date().toLocaleString('zh-HK'))}${filterLabel ? ` · ${esc(filterLabel)}` : ''} · 共 ${esc(String(rows.length))} 個工序</div>
    <div class="pgblk" style="font-size:14px; font-weight:700; margin-top:14px;">進度總覽（分區 × 工種）</div>
    ${matrixHtml}
    <div class="pgblk" style="font-size:14px; font-weight:700; margin-top:14px;">工序明細</div>
    ${detailHtml}
    ${capNote}
    <div class="pgblk" style="font-size:10px; color:#94a3b8; margin-top:20px;">由 CK工程系統產生 — 剔格制：完成/總數 = 已剔樓層(或位置)/全部 · 綠格 = 該層完成</div>`

  const blob = await htmlToPdfBlob(body)
  await shareOrDownloadBlob(blob, `${safeName(project.name)}_進度表_${dateStr()}.pdf`, `${project.name} — 進度表（${rows.length} 個工序）`)
}
