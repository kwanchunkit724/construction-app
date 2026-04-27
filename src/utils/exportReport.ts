import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { BOQItem, VariationOrder } from '../types'

const HKD = (n: number) =>
  new Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD', maximumFractionDigits: 0 }).format(n)

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── BOQ Excel ────────────────────────────────────────────────────────────────
export function exportBoqExcel(items: BOQItem[], projectName: string) {
  const rows = items.map(b => ({
    '編號': b.code,
    '描述': b.description,
    '單位': b.unit,
    '合約量': b.contractQty,
    '完成量': b.completedQty,
    '完成%': b.contractQty > 0 ? +((b.completedQty / b.contractQty) * 100).toFixed(1) : 0,
    '合約金額(HKD)': b.contractAmount,
    '完成金額(HKD)': b.completedAmount,
  }))
  const total = {
    '編號': '合計', '描述': '', '單位': '', '合約量': '', '完成量': '', '完成%': '',
    '合約金額(HKD)': items.reduce((s, b) => s + b.contractAmount, 0),
    '完成金額(HKD)': items.reduce((s, b) => s + b.completedAmount, 0),
  }
  const ws = XLSX.utils.json_to_sheet([...rows, total])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ')
  XLSX.writeFile(wb, `BOQ_${projectName}_${today()}.xlsx`)
}

// ─── BOQ PDF ──────────────────────────────────────────────────────────────────
export function exportBoqPdf(items: BOQItem[], projectName: string) {
  const doc = new jsPDF({ orientation: 'landscape' })
  doc.setFontSize(14)
  doc.text(`工程量清單 (BOQ) — ${projectName}`, 14, 15)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`匯出日期：${today()}`, 14, 21)
  doc.setTextColor(0)

  const totalContract = items.reduce((s, b) => s + b.contractAmount, 0)
  const totalDone = items.reduce((s, b) => s + b.completedAmount, 0)

  autoTable(doc, {
    startY: 26,
    head: [['編號', '描述', '單位', '合約量', '完成量', '完成%', '合約金額', '完成金額']],
    body: [
      ...items.map(b => {
        const pct = b.contractQty > 0 ? ((b.completedQty / b.contractQty) * 100).toFixed(1) + '%' : '0%'
        return [b.code, b.description, b.unit, b.contractQty, b.completedQty, pct, HKD(b.contractAmount), HKD(b.completedAmount)]
      }),
      [{ content: '合計', colSpan: 6, styles: { fontStyle: 'bold' } }, HKD(totalContract), HKD(totalDone)],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [13, 148, 136] },
    footStyles: { fontStyle: 'bold' },
  })

  doc.save(`BOQ_${projectName}_${today()}.pdf`)
}

// ─── VO Excel ─────────────────────────────────────────────────────────────────
export function exportVoExcel(vos: VariationOrder[], projectName: string) {
  const TYPE_ZH: Record<string, string> = { addition: '追加', omission: '刪減', substitution: '替換' }
  const STATUS_ZH: Record<string, string> = { draft: '草稿', submitted: '已提交', approved: '已批准', rejected: '已拒絕' }
  const rows = vos.map(v => ({
    'VO號': v.voNo || v.id.slice(-6).toUpperCase(),
    '描述': v.description,
    '類型': TYPE_ZH[v.type] ?? v.type,
    '狀態': STATUS_ZH[v.status] ?? v.status,
    '金額(HKD)': v.amount,
    '提交人': v.raisedByName,
    '提交日期': v.raisedAt.slice(0, 10),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'VariationOrders')
  XLSX.writeFile(wb, `VO_${projectName}_${today()}.xlsx`)
}

// ─── VO PDF ───────────────────────────────────────────────────────────────────
export function exportVoPdf(vos: VariationOrder[], projectName: string) {
  const TYPE_ZH: Record<string, string> = { addition: '追加', omission: '刪減', substitution: '替換' }
  const STATUS_ZH: Record<string, string> = { draft: '草稿', submitted: '已提交', approved: '已批准', rejected: '已拒絕' }
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`差異令 (VO) — ${projectName}`, 14, 15)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(`匯出日期：${today()}`, 14, 21)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 26,
    head: [['VO號', '描述', '類型', '狀態', '金額', '提交人', '日期']],
    body: vos.map(v => [
      v.voNo || v.id.slice(-6).toUpperCase(),
      v.description,
      TYPE_ZH[v.type] ?? v.type,
      STATUS_ZH[v.status] ?? v.status,
      HKD(v.amount),
      v.raisedByName,
      v.raisedAt.slice(0, 10),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [29, 78, 216] },
  })

  doc.save(`VO_${projectName}_${today()}.pdf`)
}

// ─── Progress Excel ───────────────────────────────────────────────────────────
export function exportProgressExcel(
  items: { name: string; zone?: string; level: number; actualProgress: number; plannedProgress: number; assignee?: string }[],
  projectName: string
) {
  const rows = items.map(i => ({
    '層級': i.level,
    '工序名稱': i.name,
    '區域': i.zone ?? '',
    '實際進度%': i.actualProgress,
    '計劃進度%': i.plannedProgress,
    '差異%': i.actualProgress - i.plannedProgress,
    '負責人': i.assignee ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Progress')
  XLSX.writeFile(wb, `Progress_${projectName}_${today()}.xlsx`)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function triggerDownload(url: string, filename: string) {
  downloadBlob(new Blob(), filename)
  void url
}
