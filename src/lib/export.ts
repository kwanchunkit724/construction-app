// Excel + PDF export helpers.
// Mobile-friendly: triggers a file download via Blob URL.

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  PROGRESS_STATUS_ZH, ISSUE_STATUS_ZH, ISSUE_HANDLER_ZH, ROLE_ZH,
  computeRollup, getDescendantLeaves,
} from '../types'
import type { Project, ProgressItem, Issue, UserProfile } from '../types'

function downloadBlob(blob: Blob, filename: string) {
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

function buildProgressRows(project: Project, items: ProgressItem[]): ProgressRow[] {
  return items
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(item => {
      const isLeaf = !items.some(i => i.parent_id === item.id)
      const zoneName = project.zones.find(z => z.id === item.zone_id)?.name ?? item.zone_id ?? ''
      const actual = isLeaf ? item.actual_progress : computeRollup(getDescendantLeaves(items, item.id)).actual
      const planned = isLeaf ? item.planned_progress : computeRollup(getDescendantLeaves(items, item.id)).planned
      const status = isLeaf ? item.status : computeRollup(getDescendantLeaves(items, item.id)).status
      return {
        分區: zoneName,
        編號: item.code,
        名稱: item.title,
        層級: item.level,
        追蹤模式: item.tracking_mode === 'floors' ? `樓層 (${item.floors_completed.length}/${item.floor_labels.length})` : '百分比',
        計劃進度: `${planned}%`,
        實際進度: `${actual}%`,
        狀態: PROGRESS_STATUS_ZH[status],
        計劃開始: item.planned_start ?? '',
        計劃完成: item.planned_end ?? '',
        備注: isLeaf ? item.notes : '',
        最後更新: new Date(item.last_updated_at).toLocaleString('zh-HK'),
      }
    })
}

export function exportProgressToExcel(project: Project, items: ProgressItem[]) {
  const rows = buildProgressRows(project, items)
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 6 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '進度追蹤')
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, `${safeName(project.name)}_進度_${dateStr()}.xlsx`)
}

export function exportProgressToPDF(project: Project, items: ProgressItem[]) {
  const rows = buildProgressRows(project, items)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFontSize(14)
  doc.text(`${project.name} - Progress Report`, 40, 40)
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleString('en-US')}`, 40, 58)

  autoTable(doc, {
    startY: 75,
    head: [['Zone', 'Code', 'Title', 'Lvl', 'Mode', 'Plan%', 'Actual%', 'Status', 'Start', 'End']],
    body: rows.map(r => [
      r.分區, r.編號, r.名稱, r.層級, r.追蹤模式, r.計劃進度, r.實際進度, r.狀態, r.計劃開始, r.計劃完成,
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [249, 115, 22] },
    columnStyles: { 2: { cellWidth: 180 } },
  })
  doc.save(`${safeName(project.name)}_progress_${dateStr()}.pdf`)
}

// ── Issues export ────────────────────────────────────────────

export function exportIssuesToExcel(
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
  downloadBlob(blob, `${safeName(project.name)}_問題_${dateStr()}.xlsx`)
}

// ── Projects list export (admin) ─────────────────────────────

export function exportProjectsToExcel(
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
  downloadBlob(blob, `工地清單_${dateStr()}.xlsx`)
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
}
