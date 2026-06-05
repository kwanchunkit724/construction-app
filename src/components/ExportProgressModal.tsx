import { useState } from 'react'
import { X, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import type { Project, ProgressItem, ProgressStatus } from '../types'
import { PROGRESS_STATUS_ZH } from '../types'
import {
  type ExportProgressOptions, type ReportDepth,
  ALL_STATUSES, exportPreset,
} from '../lib/export'

// Pre-export picker (multi-persona spec: presets + range filters + remember
// last). Range controls (zones / depth / status) are front; the value is
// picking WHAT range, not columns. Mobile-first.

const PREFS_KEY = (pid: string) => `ck.exportProgress.prefs.${pid}`

function loadPrefs(project: Project): ExportProgressOptions {
  try {
    const raw = localStorage.getItem(PREFS_KEY(project.id))
    if (raw) {
      const p = JSON.parse(raw) as ExportProgressOptions
      // keep only zones that still exist; default to all if none survive.
      const valid = p.zoneIds.filter(id => project.zones.some(z => z.id === id))
      return { ...exportPreset('internal', project), ...p, zoneIds: valid.length ? valid : project.zones.map(z => z.id) }
    }
  } catch { /* ignore */ }
  return exportPreset('internal', project)
}

export function ExportProgressModal({ project, items, onClose }: {
  project: Project
  items: ProgressItem[]
  onClose: () => void
}) {
  const [opts, setOpts] = useState<ExportProgressOptions>(() => loadPrefs(project))
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const set = (patch: Partial<ExportProgressOptions>) => setOpts(o => ({ ...o, ...patch }))

  const allZoneIds = project.zones.map(z => z.id)
  const toggleZone = (id: string) =>
    set({ zoneIds: opts.zoneIds.includes(id) ? opts.zoneIds.filter(z => z !== id) : [...opts.zoneIds, id] })
  const toggleStatus = (s: ProgressStatus) =>
    set({ statuses: opts.statuses.includes(s) ? opts.statuses.filter(x => x !== s) : [...opts.statuses, s] })

  async function run(format: 'xlsx' | 'pdf') {
    setBusy(format)
    try {
      localStorage.setItem(PREFS_KEY(project.id), JSON.stringify(opts))
    } catch { /* ignore */ }
    try {
      const ex = await import('../lib/export')
      if (format === 'xlsx') await ex.exportProgressToExcel(project, items, opts)
      else await ex.exportProgressToPDF(project, items, opts)
      onClose()
    } catch (e) {
      console.error('export failed:', e)
      // eslint-disable-next-line no-alert
      alert('匯出失敗，請再試。')
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-card-md" onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 bg-white border-b border-site-200 px-4 py-3 flex items-center justify-between">
          <div className="font-heading font-bold text-site-900">匯出進度報告</div>
          <button onClick={onClose} className="p-1.5 text-site-500 hover:text-site-900"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-5">
          {/* presets */}
          <div>
            <Label>快速範本</Label>
            <div className="grid grid-cols-3 gap-2">
              <Preset onClick={() => setOpts(exportPreset('internal', project))}>內部版</Preset>
              <Preset onClick={() => setOpts(exportPreset('owner', project))}>業主版</Preset>
              <Preset onClick={() => setOpts(exportPreset('exception', project))}>例外版</Preset>
            </div>
            <p className="text-xs text-site-400 mt-1.5">內部版 = 全部到細項 · 業主版 = 到中項精簡 · 例外版 = 只睇延誤/阻塞/落後</p>
          </div>

          {/* zones */}
          <div>
            <div className="flex items-center justify-between">
              <Label>分區</Label>
              <button onClick={() => set({ zoneIds: opts.zoneIds.length === allZoneIds.length ? [] : allZoneIds })}
                className="text-xs text-safety-700 hover:underline">
                {opts.zoneIds.length === allZoneIds.length ? '全部取消' : '全選'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.zones.map(z => (
                <Chip key={z.id} active={opts.zoneIds.includes(z.id)} onClick={() => toggleZone(z.id)}>{z.name}</Chip>
              ))}
              <Chip active={opts.includeUnzoned} onClick={() => set({ includeUnzoned: !opts.includeUnzoned })}>未分區 / 共用</Chip>
            </div>
          </div>

          {/* depth */}
          <div>
            <Label>層級深度</Label>
            <div className="grid grid-cols-3 gap-2">
              {([[1, '只大項'], [2, '到中項'], [3, '到細項']] as [ReportDepth, string][]).map(([d, t]) => (
                <Seg key={d} active={opts.depth === d} onClick={() => set({ depth: d })}>{t}</Seg>
              ))}
            </div>
          </div>

          {/* status */}
          <div>
            <div className="flex items-center justify-between">
              <Label>狀態</Label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => set({ statuses: ['delayed', 'blocked'], onlyBehind: false })} className="text-safety-700 hover:underline">只延誤+阻塞</button>
                <button onClick={() => set({ statuses: ALL_STATUSES.filter(s => s !== 'completed') })} className="text-safety-700 hover:underline">剔走已完成</button>
                <button onClick={() => set({ statuses: [...ALL_STATUSES] })} className="text-safety-700 hover:underline">全部</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map(s => (
                <Chip key={s} active={opts.statuses.includes(s)} onClick={() => toggleStatus(s)}>{PROGRESS_STATUS_ZH[s]}</Chip>
              ))}
            </div>
          </div>

          {/* toggles */}
          <div className="space-y-2">
            <Label>版面</Label>
            <Toggle on={opts.groupByZone} onChange={v => set({ groupByZone: v })} label="按分區分段 + 每區小計" />
            <Toggle on={opts.showSummary} onChange={v => set({ showSummary: v })} label="頂部工程總覽（總進度 / 落後件數）" />
            <Toggle on={opts.showGap} onChange={v => set({ showGap: v })} label="顯示差距欄（實際 − 計劃，落後標紅）" />
            <Toggle on={opts.onlyBehind} onChange={v => set({ onlyBehind: v })} label="只列落後計劃 > 10% 嘅項目" />
          </div>

          {/* report period */}
          <div>
            <Label>報告期數（選填）</Label>
            <input className="input w-full" placeholder="例如 2026-W23 / 6月第一週"
              value={opts.reportPeriod} onChange={e => set({ reportPeriod: e.target.value })} />
          </div>
        </div>

        {/* actions */}
        <div className="sticky bottom-0 bg-white border-t border-site-200 px-4 py-3 flex gap-2">
          <button onClick={() => run('xlsx')} disabled={!!busy}
            className="flex-1 btn-ghost flex items-center justify-center gap-2 py-3 disabled:opacity-50">
            {busy === 'xlsx' ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />} 匯出 Excel
          </button>
          <button onClick={() => run('pdf')} disabled={!!busy}
            className="flex-1 btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50">
            {busy === 'pdf' ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} 匯出 PDF
          </button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-site-500 mb-1.5">{children}</div>
}
function Preset({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-xl border border-safety-300 bg-safety-50 text-safety-700 font-medium text-sm py-2.5 hover:bg-safety-100 transition">{children}</button>
}
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl text-sm py-2.5 border transition ${active ? 'bg-safety-500 border-safety-500 text-white font-medium' : 'border-site-200 text-site-600 hover:bg-site-50'}`}>{children}</button>
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-2 rounded-full text-sm transition ${active ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-700 hover:bg-site-200'}`}>{children}</button>
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 py-1.5 text-left">
      <span className="text-sm text-site-700">{label}</span>
      <span className={`w-11 h-6 rounded-full flex-shrink-0 relative transition ${on ? 'bg-safety-500' : 'bg-site-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
