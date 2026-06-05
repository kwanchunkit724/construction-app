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
  computeRollup, getDescendantLeaves,
  LINE_ITEM_CATEGORY_ZH,
} from '../types'
import type {
  Project, ProgressItem, Issue, UserProfile, ProgressStatus,
  VO, VOVersion, DrawingVersion,
} from '../types'
import { formatHKD } from './currency'

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
}

export const ALL_STATUSES: ProgressStatus[] = ['not-started', 'in-progress', 'completed', 'delayed', 'blocked']

export function exportPreset(p: 'internal' | 'owner' | 'exception', project: Project): ExportProgressOptions {
  const zoneIds = project.zones.map(z => z.id)
  if (p === 'owner') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: [...ALL_STATUSES], onlyBehind: false, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '' }
  }
  if (p === 'exception') {
    return { zoneIds, includeUnzoned: true, depth: 2, statuses: ['delayed', 'blocked'], onlyBehind: true, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '' }
  }
  return { zoneIds, includeUnzoned: true, depth: 3, statuses: [...ALL_STATUSES], onlyBehind: false, groupByZone: true, showSummary: true, showGap: true, reportPeriod: '' }
}

const UNZONED = '__unzoned__'

interface Eff { actual: number; planned: number; status: ProgressStatus; gap: number }
interface ItemRow {
  zoneKey: string; zoneName: string
  code: string; title: string; level: number; depth: number
  tracking: string; eff: Eff; start: string; end: string; notes: string; updated: string
}
interface ZoneAgg { actual: number; planned: number; gap: number; status: ProgressStatus; count: number; behind: number }
interface ReportModel {
  summary: { actual: number; planned: number; gap: number; total: number; behind: number; counts: Record<ProgressStatus, number> }
  zones: Array<{ key: string; name: string; agg: ZoneAgg; rows: ItemRow[] }>
  opts: ExportProgressOptions
}

export function buildReportModel(project: Project, items: ProgressItem[], opts: ExportProgressOptions): ReportModel {
  const isLeaf = (it: ProgressItem) => !items.some(i => i.parent_id === it.id)
  const effOf = (it: ProgressItem): Eff => {
    if (isLeaf(it)) return { actual: it.actual_progress, planned: it.planned_progress, status: it.status, gap: it.actual_progress - it.planned_progress }
    const r = computeRollup(getDescendantLeaves(items, it.id))
    return { actual: r.actual, planned: r.planned, status: r.status, gap: r.actual - r.planned }
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
    if (opts.onlyBehind && e.gap >= -10) return false
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
          tracking: it.tracking_mode === 'floors' ? `樓層 (${it.floors_completed.length}/${it.floor_labels.length})` : '百分比',
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
    const behind = zoneLeaves.filter(l => (l.actual_progress - l.planned_progress) < -10).length
    zones.push({ key, name: zoneNameOf(key), agg: { actual: r.actual, planned: r.planned, gap: r.actual - r.planned, status: r.status, count: zoneLeaves.length, behind }, rows })
  }

  // overall summary from all in-scope leaves.
  const scopeLeaves = scopeItems.filter(isLeaf)
  const sr = computeRollup(scopeLeaves)
  const counts = { 'not-started': 0, 'in-progress': 0, 'completed': 0, 'delayed': 0, 'blocked': 0 } as Record<ProgressStatus, number>
  for (const l of scopeLeaves) counts[l.status]++
  const behind = scopeLeaves.filter(l => (l.actual_progress - l.planned_progress) < -10).length

  return { summary: { actual: sr.actual, planned: sr.planned, gap: sr.actual - sr.planned, total: scopeLeaves.length, behind, counts }, zones, opts }
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
  const model = buildReportModel(project, items, opts)
  const pct = (n: number) => n // numeric; format applied via cell.z
  const aoa: (string | number | null)[][] = []
  const numCells: Array<{ r: number; c: number }> = []
  const outline: Array<number | null> = [] // per data row: outline level (null = no row meta)

  const pushRow = (cells: (string | number | null)[], lvl: number | null) => { aoa.push(cells); outline.push(lvl) }
  const markNums = (rowIdx: number, cols: number[]) => cols.forEach(c => numCells.push({ r: rowIdx, c }))

  if (model.summary && opts.showSummary) {
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
      cells[colIndex.plan] = pct(it.eff.planned)
      cells[colIndex.act] = pct(it.eff.actual)
      if (opts.showGap) cells[colIndex.gap] = it.eff.gap
      cells[statusCol] = STATUS_PILL[it.eff.status].mark + PROGRESS_STATUS_ZH[it.eff.status]
      cells[startCol] = it.start
      cells[endCol] = it.end
      cells[notesCol] = it.notes
      const idx = aoa.length
      pushRow(cells, opts.groupByZone ? it.depth + 1 : it.depth)
      markNums(idx, [colIndex.plan, colIndex.act, ...(opts.showGap ? [colIndex.gap] : [])])
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
  await downloadBlob(blob, `${safeName(project.name)}_進度_${fileTag(opts)}.xlsx`)
}

// ── PDF (html2canvas — full colour + any CJK glyph) ──────────
export async function exportProgressToPDF(project: Project, items: ProgressItem[], opts: ExportProgressOptions) {
  const model = buildReportModel(project, items, opts)
  const html2canvas = (await import('html2canvas')).default

  const container = document.createElement('div')
  container.style.cssText = [
    'position: fixed', 'top: 0', 'left: -10000px', 'width: 1100px', 'padding: 24px',
    'background: #ffffff',
    'font-family: Inter, "Microsoft JhengHei", "PingFang HK", "Heiti TC", "Noto Sans CJK TC", sans-serif',
    'font-size: 11px', 'color: #0f172a',
  ].join('; ')

  const colCount = 8 + (opts.showGap ? 1 : 0)
  const pillStyle = (s: ProgressStatus) => `background:${STATUS_PILL[s].bg}; color:${STATUS_PILL[s].fg}; padding:2px 8px; border-radius:8px; font-size:10px; font-weight:600;`

  const summaryHtml = opts.showSummary && model.summary ? `
    <div style="display:flex; gap:10px; margin:0 0 14px 0;">
      <div style="flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px;">
        <div style="font-size:10px; color:#64748b;">整體進度</div>
        <div style="font-size:22px; font-weight:800; color:#0f172a;">${model.summary.actual}<span style="font-size:13px; color:#94a3b8;">% / 計劃 ${model.summary.planned}%</span></div>
        <div style="font-size:11px; color:${gapColour(model.summary.gap)}; font-weight:700;">${model.summary.gap >= 0 ? '+' : ''}${model.summary.gap}% 差距</div>
      </div>
      <div style="flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px;">
        <div style="font-size:10px; color:#64748b;">需要關注</div>
        <div style="font-size:22px; font-weight:800; color:#b91c1c;">${model.summary.behind}<span style="font-size:13px; color:#94a3b8;"> 項落後 / 共 ${model.summary.total}</span></div>
        <div style="font-size:11px; color:#475569;">延誤 ${model.summary.counts.delayed} · 阻塞 ${model.summary.counts.blocked}</div>
      </div>
      <div style="flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px;">
        <div style="font-size:10px; color:#64748b;">狀態分佈</div>
        <div style="font-size:11px; color:#475569; line-height:1.5;">進行中 ${model.summary.counts['in-progress']} · 已完成 ${model.summary.counts.completed} · 未開始 ${model.summary.counts['not-started']}</div>
      </div>
    </div>` : ''

  const headCells = ['分區', '編號', '名稱', '層級', '追蹤', '計劃%', '實際%']
    .concat(opts.showGap ? ['差距'] : [])
    .concat(['狀態', '計劃開始', '計劃完成'])
  const th = (t: string, align = 'left', w = '') => `<th style="padding:7px 6px; text-align:${align}; ${w}">${escapeHtml(t)}</th>`

  const zoneSections = model.zones.map(z => {
    const bandRollup = `整體 ${z.agg.actual}%（計劃 ${z.agg.planned}%，${z.agg.gap < 0 ? `落後 ${-z.agg.gap}%` : `差 ${z.agg.gap}%`}${z.agg.behind ? `，落後 ${z.agg.behind} 項` : ''}）`
    const bandRow = opts.groupByZone ? `
      <tr><td colspan="${colCount}" style="background:#1e3a5f; color:#fff; padding:8px 10px; font-weight:700; font-size:12px;">
        ${escapeHtml(z.name)} <span style="font-weight:500; color:#cbd5e1; font-size:11px;">— ${escapeHtml(bandRollup)}</span>
      </td></tr>` : ''
    const itemRows = z.rows.map(it => {
      const sp = STATUS_PILL[it.eff.status]
      const lvlBg = LEVEL_BG[it.level] ?? '#ffffff'
      const weight = it.level === 1 ? 700 : it.level === 2 ? 600 : 400
      const indent = it.depth * 16
      return `
      <tr style="background:${lvlBg}; border-bottom:1px solid #e2e8f0; border-left:4px solid ${sp.bar};">
        <td style="padding:5px 6px;">${opts.groupByZone ? '' : escapeHtml(z.name)}</td>
        <td style="padding:5px 6px; font-family:Consolas,monospace; color:#475569;">${escapeHtml(it.code)}</td>
        <td style="padding:5px 6px; padding-left:${6 + indent}px; font-weight:${weight}; color:${it.level === 3 ? '#334155' : '#0f172a'};">${escapeHtml(it.title)}</td>
        <td style="padding:5px 6px; text-align:center; color:#64748b;">${it.level}</td>
        <td style="padding:5px 6px; color:#64748b;">${escapeHtml(it.tracking)}</td>
        <td style="padding:5px 6px; text-align:right; color:#64748b;">${it.eff.planned}%</td>
        <td style="padding:5px 6px; text-align:right; font-weight:700;">${it.eff.actual}%</td>
        ${opts.showGap ? `<td style="padding:5px 6px; text-align:right; font-weight:700; color:${gapColour(it.eff.gap)};">${it.eff.gap >= 0 ? '+' : ''}${it.eff.gap}%</td>` : ''}
        <td style="padding:5px 6px; text-align:center;"><span style="${pillStyle(it.eff.status)}">${escapeHtml(sp.mark + PROGRESS_STATUS_ZH[it.eff.status])}</span></td>
        <td style="padding:5px 6px; color:#64748b;">${escapeHtml(it.start)}</td>
        <td style="padding:5px 6px; color:#64748b;">${escapeHtml(it.end)}</td>
      </tr>`
    }).join('')
    const subtotal = opts.groupByZone ? `
      <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; font-weight:700;">
        <td style="padding:6px;" colspan="5">　${escapeHtml(z.name)} 小計（${z.agg.count} 項）</td>
        <td style="padding:6px; text-align:right;">${z.agg.planned}%</td>
        <td style="padding:6px; text-align:right;">${z.agg.actual}%</td>
        ${opts.showGap ? `<td style="padding:6px; text-align:right; color:${gapColour(z.agg.gap)};">${z.agg.gap >= 0 ? '+' : ''}${z.agg.gap}%</td>` : ''}
        <td colspan="3"></td>
      </tr>` : ''
    return bandRow + itemRows + subtotal
  }).join('')

  container.innerHTML = `
    <h1 style="margin:0 0 2px 0; font-size:20px; font-weight:800; color:#0f172a;">${escapeHtml(project.name)} — 進度報告</h1>
    <div style="margin:0 0 12px 0; font-size:11px; color:#64748b;">產生時間：${new Date().toLocaleString('zh-HK')}${opts.reportPeriod ? `　·　期數：${escapeHtml(opts.reportPeriod)}` : ''}</div>
    ${summaryHtml}
    <table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead><tr style="background:#f97316; color:#fff;">
        ${th('分區', 'left', 'width:64px;')}${th('編號', 'left', 'width:84px;')}${th('名稱')}${th('層', 'center', 'width:34px;')}${th('追蹤', 'left', 'width:96px;')}${th('計劃%', 'right', 'width:54px;')}${th('實際%', 'right', 'width:54px;')}${opts.showGap ? th('差距', 'right', 'width:54px;') : ''}${th('狀態', 'center', 'width:78px;')}${th('計劃開始', 'left', 'width:84px;')}${th('計劃完成', 'left', 'width:84px;')}
      </tr></thead>
      <tbody>${zoneSections}</tbody>
    </table>`

  document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', logging: false })
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const imgW = pageW
    const pageHCanvasPx = (pageH * canvas.width) / pageW
    let yOffsetPx = 0, isFirst = true
    while (yOffsetPx < canvas.height) {
      const sliceH = Math.min(pageHCanvasPx, canvas.height - yOffsetPx)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceH
      const ctx = sliceCanvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
      ctx.drawImage(canvas, 0, -yOffsetPx)
      if (!isFirst) doc.addPage()
      doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, (sliceH * imgW) / canvas.width)
      yOffsetPx += pageHCanvasPx
      isFirst = false
    }
    const blob = doc.output('blob') as Blob
    await shareOrDownloadBlob(blob, `${safeName(project.name)}_進度_${fileTag(opts)}.pdf`, `${project.name} 進度報告`)
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
      報告者: users[i.reporter_id]?.name ?? '—',
      報告者角色: ROLE_ZH[i.reporter_role],
      當前處理層: ISSUE_HANDLER_ZH[i.current_handler_role],
      解決者: i.resolved_by ? (users[i.resolved_by]?.name ?? '—') : '',
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
  doc.text(`參考工地指令：${vo.si_id ? vo.si_id : '—'}`, 40, 130)
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
