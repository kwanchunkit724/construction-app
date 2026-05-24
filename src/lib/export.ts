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
  Project, ProgressItem, Issue, UserProfile,
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

// ── Progress export ──────────────────────────────────────────

interface ProgressRow {
  分區: string
  編號: string
  名稱: string
  層級: number
  追蹤模式: string
  計劃進度: string
  實際進度: string
  狀態: string
  計劃開始: string
  計劃完成: string
  備注: string
  最後更新: string
}

function buildProgressRows(
  project: Project,
  items: ProgressItem[],
): { rows: ProgressRow[]; outlineLevels: number[] } {
  // Group items by parent_id to walk the tree depth-first, preserving the
  // visual nesting that the UI shows. Output order: roots → children →
  // grandchildren, each level sorted by `code`.
  const byParent = new Map<string | null, ProgressItem[]>()
  for (const i of items) {
    const k = i.parent_id ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(i)
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.code.localeCompare(b.code))

  const rows: ProgressRow[] = []
  const outlineLevels: number[] = []

  function dfs(parentId: string | null, depth: number) {
    for (const item of byParent.get(parentId) ?? []) {
      const isLeaf = !items.some(i => i.parent_id === item.id)
      const zoneName = project.zones.find(z => z.id === item.zone_id)?.name ?? item.zone_id ?? ''
      const actual = isLeaf ? item.actual_progress : computeRollup(getDescendantLeaves(items, item.id)).actual
      const planned = isLeaf ? item.planned_progress : computeRollup(getDescendantLeaves(items, item.id)).planned
      const status = isLeaf ? item.status : computeRollup(getDescendantLeaves(items, item.id)).status
      // Full-width space indent (U+3000) renders evenly with CJK headers
      // and stays visible on both Excel and PDF without breaking column
      // alignment.
      const indent = '　'.repeat(depth)
      rows.push({
        分區: zoneName,
        編號: item.code,
        名稱: indent + item.title,
        層級: item.level,
        追蹤模式: item.tracking_mode === 'floors' ? `樓層 (${item.floors_completed.length}/${item.floor_labels.length})` : '百分比',
        計劃進度: `${planned}%`,
        實際進度: `${actual}%`,
        狀態: PROGRESS_STATUS_ZH[status],
        計劃開始: item.planned_start ?? '',
        計劃完成: item.planned_end ?? '',
        備注: isLeaf ? item.notes : '',
        最後更新: new Date(item.last_updated_at).toLocaleString('zh-HK'),
      })
      outlineLevels.push(depth)
      dfs(item.id, depth + 1)
    }
  }
  dfs(null, 0)
  return { rows, outlineLevels }
}

export async function exportProgressToExcel(project: Project, items: ProgressItem[]) {
  const { rows, outlineLevels } = buildProgressRows(project, items)
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 6 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
  ]
  // Excel outline rows: index 0 is the header row, then one entry per data
  // row carrying its tree depth. Excel renders +/− grouping controls on the
  // left gutter so users can collapse subtrees.
  ws['!rows'] = [{}, ...outlineLevels.map(lv => ({ level: lv }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '進度追蹤')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await downloadBlob(blob, `${safeName(project.name)}_進度_${dateStr()}.xlsx`)
}

export async function exportProgressToPDF(project: Project, items: ProgressItem[]) {
  // Strategy: render an offscreen HTML table with the browser's own CJK
  // fallback chain, snapshot via html2canvas, then paginate the resulting
  // bitmap into A4 landscape pages. The previous jsPDF-autoTable path
  // depended on `public/fonts/noto-sans-hk-subset.ttf` which was built for
  // the VO export's fixed vocabulary (Plan 02-06, ~186 KB) and lacked
  // glyphs for arbitrary project zone names + item titles — every uncovered
  // character collapsed to the `.notdef` glyph, producing the garbled
  // output users saw. html2canvas hands the work back to the browser font
  // stack (Microsoft JhengHei / PingFang HK / etc. per tailwind.config.js
  // `font-sans`), so any CJK string the user can type is rendered.

  const { rows } = buildProgressRows(project, items)
  const html2canvasMod = await import('html2canvas')
  const html2canvas = html2canvasMod.default

  // Build the offscreen table. position:fixed + left:-10000 keeps it off
  // the visible viewport but still attached to the document (html2canvas
  // refuses detached nodes). Width is sized for A4 landscape at scale=2
  // so the snapshot maps cleanly into the page.
  const container = document.createElement('div')
  container.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -10000px',
    'width: 1100px',
    'padding: 24px',
    'background: #ffffff',
    'font-family: Inter, "Microsoft JhengHei", "PingFang HK", "Heiti TC", "Noto Sans CJK TC", sans-serif',
    'font-size: 11px',
    'color: #0f172a',
  ].join('; ')

  const statusBg: Record<string, string> = {
    '未開始': '#f1f5f9',
    '進行中': '#dbeafe',
    '已完工': '#dcfce7',
    '延誤': '#fee2e2',
    '阻塞': '#fef3c7',
  }

  // Hand-rolled HTML to control colors + indent precisely. Title row +
  // generated-at line above the table, orange header band, alternating
  // row backgrounds for readability.
  container.innerHTML = `
    <h1 style="margin:0 0 4px 0; font-size:20px; font-weight:700; color:#0f172a;">
      ${escapeHtml(project.name)} — 進度報告
    </h1>
    <div style="margin:0 0 12px 0; font-size:11px; color:#64748b;">
      產生時間：${new Date().toLocaleString('zh-HK')}
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead>
        <tr style="background:#f97316; color:#ffffff;">
          <th style="padding:8px 6px; text-align:left; width:70px;">分區</th>
          <th style="padding:8px 6px; text-align:left; width:90px;">編號</th>
          <th style="padding:8px 6px; text-align:left;">名稱</th>
          <th style="padding:8px 6px; text-align:center; width:40px;">層級</th>
          <th style="padding:8px 6px; text-align:left; width:110px;">追蹤模式</th>
          <th style="padding:8px 6px; text-align:right; width:60px;">計劃%</th>
          <th style="padding:8px 6px; text-align:right; width:60px;">實際%</th>
          <th style="padding:8px 6px; text-align:center; width:70px;">狀態</th>
          <th style="padding:8px 6px; text-align:left; width:90px;">計劃開始</th>
          <th style="padding:8px 6px; text-align:left; width:90px;">計劃完成</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px;">${escapeHtml(r.分區)}</td>
            <td style="padding:6px; font-family:Consolas,monospace;">${escapeHtml(r.編號)}</td>
            <td style="padding:6px; white-space:pre-wrap;">${escapeHtml(r.名稱)}</td>
            <td style="padding:6px; text-align:center;">${r.層級}</td>
            <td style="padding:6px;">${escapeHtml(r.追蹤模式)}</td>
            <td style="padding:6px; text-align:right;">${escapeHtml(r.計劃進度)}</td>
            <td style="padding:6px; text-align:right; font-weight:600;">${escapeHtml(r.實際進度)}</td>
            <td style="padding:6px; text-align:center;">
              <span style="background:${statusBg[r.狀態] ?? '#f1f5f9'}; padding:2px 8px; border-radius:8px; font-size:10px;">
                ${escapeHtml(r.狀態)}
              </span>
            </td>
            <td style="padding:6px;">${escapeHtml(r.計劃開始)}</td>
            <td style="padding:6px;">${escapeHtml(r.計劃完成)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `

  document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    // Maintain aspect ratio: scale canvas to page width, compute page-height
    // in canvas pixels, then slice the bitmap into N pages.
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    const pageHCanvasPx = (pageH * canvas.width) / pageW

    let yOffsetPx = 0
    let isFirst = true
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
    void imgH // silence ts-unused-warning safeguard

    const blob = doc.output('blob') as Blob
    await downloadBlob(blob, `${safeName(project.name)}_progress_${dateStr()}.pdf`)
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
