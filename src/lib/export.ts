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
  computeRollup, getDescendantLeaves, plannedProgressOf, deriveStatus,
  isScheduled, LINE_ITEM_CATEGORY_ZH,
} from '../types'
import type {
  Project, ProgressItem, Issue, UserProfile, ProgressStatus,
  VO, VOVersion, DrawingVersion,
} from '../types'
import { formatHKD } from './currency'
import { fetchPrevSnapshot, captureSnapshot } from './snapshots'
import type { PrevSnapshot } from './snapshots'

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
async function shareOrDownloadBlob(blob: Blob, filename: string, title: string) {
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

export type ReportDepth = 1 | 2 | 3
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
}

export const ALL_STATUSES: ProgressStatus[] = ['not-started', 'in-progress', 'completed', 'delayed', 'blocked']
// Default reports drop 未開始 — printing every not-started leaf is the wall of
// '0% / 未開始' rows that buries the items that actually need attention.
export const NO_NOTSTARTED: ProgressStatus[] = ALL_STATUSES.filter(s => s !== 'not-started')

export function exportPreset(p: 'internal' | 'owner' | 'exception', project: Project): ExportProgressOptions {
  const zoneIds = project.zones.map(z => z.id)
  if (p === 'owner') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: [...NO_NOTSTARTED], onlyBehind: false, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '', audience: 'owner' }
  }
  if (p === 'exception') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: ['delayed', 'blocked'], onlyBehind: true, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '', audience: 'internal' }
  }
  return { zoneIds, includeUnzoned: true, depth: 3, statuses: [...NO_NOTSTARTED], onlyBehind: false, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '', audience: 'internal' }
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
        return { actual, planned: null, status: deriveStatus(actual, 0), gap: null, delta }
      }
      const planned = plannedProgressOf(it)
      return { actual, planned, status: deriveStatus(actual, planned), gap: actual - planned, delta }
    }
    const r = computeRollup(getDescendantLeaves(items, it.id))
    return { actual: r.actual, planned: r.planned, status: r.status, gap: r.actual - r.planned, delta: aggDelta(getDescendantLeaves(items, it.id), r.actual) }
  }
  const zoneKeyOf = (it: ProgressItem): string => {
    if (it.zone_id && project.zones.some(z => z.id === it.zone_id)) return it.zone_id
    return UNZONED
  }
  const zoneNameOf = (key: string) => key === UNZONED ? '未分區 / 共用' : (project.zones.find(z => z.id === key)?.name ?? key)

  const zoneSel = new Set(opts.zoneIds)
  const inScope = (it: ProgressItem) => {
    const k = zoneKeyOf(it)
    return k === UNZONED ? opts.includeUnzoned : zoneSel.has(k)
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
  for (const it of scopeItems) {
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
          tracking: it.tracking_mode === 'floors' ? `${it.floors_completed.length}/${it.floor_labels.length}樓` : '',
          eff: e,
          start: it.planned_start ?? '', end: it.planned_end ?? '',
          notes: isLeaf(it) ? it.notes : '', updated: new Date(it.last_updated_at).toLocaleString('zh-HK'),
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
  for (const l of scopeLeaves) counts[deriveStatus(l.actual_progress, plannedProgressOf(l))]++
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
const fileTag = (opts: ExportProgressOptions) => opts.reportPeriod ? safeName(opts.reportPeriod) : dateStr()

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
    pushRow([`${project.name} — 進度報告`], null)
    pushRow([`產生：${new Date().toLocaleString('zh-HK')}${opts.reportPeriod ? `   期數：${opts.reportPeriod}` : ''}`], null)
    pushRow([`整體：計劃 ${model.summary.planned}% / 實際 ${model.summary.actual}% / 差距 ${model.summary.gap}%   ·   落後 ${model.summary.behind} 項 / 共 ${model.summary.total} 項`], null)
    pushRow([`延誤 ${model.summary.counts.delayed} · 阻塞 ${model.summary.counts.blocked} · 進行中 ${model.summary.counts['in-progress']} · 已完成 ${model.summary.counts.completed} · 未開始 ${model.summary.counts['not-started']}`], null)
    pushRow([], null)
  }

  // header
  const header = ['分區', '編號', '名稱', '層級', '追蹤模式', '計劃%', '實際%']
  if (opts.showGap) header.push('差距')
  header.push('狀態', '計劃開始', '計劃完成', '備注')
  const headerRowIdx = aoa.length
  pushRow(header, null)

  const colIndex = { plan: 5, act: 6, gap: opts.showGap ? 7 : -1 }
  const statusCol = opts.showGap ? 8 : 7
  const startCol = statusCol + 1, endCol = statusCol + 2, notesCol = statusCol + 3

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
  ws['!rows'] = aoa.map((_, i) => i === headerRowIdx ? {} : (outline[i] != null ? { level: outline[i] as number } : {}))
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
    <div class="pgblk" style="font-size:13px; color:#64748b; margin-bottom:6px;">${escapeHtml(project.name)} — 進度報告</div>
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
          <td style="padding:5px 6px; text-align:center;"><span style="background:${sp.bg}; color:${sp.fg}; padding:2px 7px; border-radius:7px; font-size:11px;">${escapeHtml(sp.mark + PROGRESS_STATUS_ZH[r.eff.status])}</span></td>
          <td style="padding:5px 6px; color:#475569; font-size:12px;">${escapeHtml(r.notes ?? '')}</td>
          <td style="padding:5px 6px; color:#64748b; font-size:12px;">${escapeHtml(r.end ?? '')}</td>
        </tr>`
      }).join('')
      return `
        <div class="pgblk" style="margin-top:22px; font-size:15px; font-weight:700; color:#0f172a;">${escapeHtml(z.name)} — 詳細 <span style="font-weight:500; font-size:13px; color:#64748b;">整體 ${z.agg.actual}%（計劃 ${z.agg.planned}%）· ${z.agg.count} 項</span></div>
        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:6px;">
          <thead><tr class="pgblk" style="background:#f97316; color:#fff; text-align:left;">
            <th style="padding:6px;">編號</th><th style="padding:6px;">名稱</th><th style="padding:6px; text-align:right;">實際</th><th style="padding:6px; text-align:right;">計劃</th><th style="padding:6px; text-align:right;">差距</th>${hasDelta ? '<th style="padding:6px; text-align:right;">本期</th>' : ''}<th style="padding:6px; text-align:center;">狀態</th><th style="padding:6px;">說明</th><th style="padding:6px;">計劃完成</th>
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

    // ASCII footer (jsPDF core font has no CJK glyphs — keep it Latin/digits).
    const asOf = opts.reportPeriod || dateStr()
    const n = doc.getNumberOfPages()
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
      doc.text(`CK 工程 · ${asOf}`.replace(/[^\x00-\x7f]+/g, 'CK'), 40, pageHpt - 9)
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
) {
  const rows = issues
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(i => ({
      狀態: ISSUE_STATUS_ZH[i.status],
      標題: i.title,
      描述: i.description,
      照片數: i.photos.length,
      // '前成員' (ex-member) — not '—' — when an id has no resolvable name, so
      // the audit trail never fully loses who reported / resolved an issue even
      // after they leave the project (RLS hides their profile; see the RPC merge
      // in ProjectDetail.tsx that should already supply most of these).
      報告者: users[i.reporter_id]?.name ?? '前成員',
      報告者角色: ROLE_ZH[i.reporter_role],
      當前處理層: ISSUE_HANDLER_ZH[i.current_handler_role],
      解決者: i.resolved_by ? (users[i.resolved_by]?.name ?? '前成員') : '',
      報告時間: new Date(i.created_at).toLocaleString('zh-HK'),
      解決時間: i.resolved_at ? new Date(i.resolved_at).toLocaleString('zh-HK') : '',
    }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 40 }, { wch: 6 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '問題清單')
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

async function ensureChineseFont(doc: any): Promise<void> {
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
  // Dynamic imports keep jspdf in the lazy reports-pdf chunk.
  const jspdfMod = await import('jspdf')
  const autoTableMod = await import('jspdf-autotable')
  const jsPDFCtor = (jspdfMod as any).default
  const autoTableFn = (autoTableMod as any).default
  const { supabase } = await import('./supabase')

  const doc: any = new jsPDFCtor({ unit: 'pt', format: 'a4' })
  await ensureChineseFont(doc)

  // Header
  doc.setFontSize(16)
  doc.text(`變更指令 ${vo.number}`, 40, 50)
  doc.setFontSize(10)
  doc.text(`項目：${project.name}`, 40, 72)
  doc.text(`狀態：${vo.status}`, 40, 86)
  doc.text(`提交：${vo.submitted_at ?? '—'}    鎖定：${vo.locked_at ?? '—'}`, 40, 100)

  // SI reference
  doc.setFontSize(12)
  doc.text(`參考工地指令：${parentSiNumber ?? '—'}`, 40, 130)
  doc.setFontSize(10)
  doc.text(version.payload.description || '', 40, 150, { maxWidth: 515 })

  // Line items
  const items = version.payload.line_items
  autoTableFn(doc, {
    startY: 220,
    head: [['#','類別','描述','數量','單位','單價','小計']],
    body: items.map((li, i) => [
      (i + 1).toString(),
      LINE_ITEM_CATEGORY_ZH[li.category],
      li.description,
      li.quantity.toString(),
      li.unit,
      formatHKD(li.unit_price_cents),
      formatHKD(li.subtotal_cents),
    ]),
    foot: [[
      { content: '經系統核算總額', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatHKD(vo.total_amount_cents), styles: { fontStyle: 'bold' } },
    ]],
    styles: { font: 'NotoHK', fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [29, 78, 216] },
  })

  // Approval timeline
  doc.addPage()
  doc.setFontSize(12)
  doc.text('簽核紀錄', 40, 50)
  autoTableFn(doc, {
    startY: 70,
    head: [['時間','動作','處理者','原因']],
    body: approvalTimeline.map(a => [a.at, a.action_zh, a.actor_name, a.reason ?? '']),
    styles: { font: 'NotoHK', fontSize: 9, cellPadding: 4 },
  })

  // Drawing thumbnails — 6 per page, ≤200 KB each
  for (let i = 0; i < drawings.length; i += 6) {
    doc.addPage()
    doc.text('附圖', 40, 50)
    const batch = drawings.slice(i, i + 6)
    for (let j = 0; j < batch.length; j++) {
      const dv = batch[j]
      const { data: signed } = await supabase.storage.from('project-drawings').createSignedUrl(dv.file_path, 300)
      if (!signed?.signedUrl) continue
      try {
        const blob = await (await fetch(signed.signedUrl)).blob()
        const resized = await resizeImageMaxKB(blob, 200)
        const dataUrl = await blobToDataUrl(resized)
        const col = j % 2
        const row = Math.floor(j / 2)
        doc.addImage(dataUrl, 'JPEG', 40 + col * 280, 70 + row * 240, 260, 220, undefined, 'FAST')
      } catch {
        // Missing thumbnail is non-fatal — skip.
      }
    }
  }

  // Footer
  doc.setFontSize(8)
  doc.text(`產生時間：${new Date().toLocaleString('zh-HK')} — 由 CK工程系統產生`, 40, 820)

  const blob = doc.output('blob') as Blob
  await downloadBlob(blob, `${safeName(project.name)}_${vo.number}_${dateStr()}.pdf`)
}
