import { useMemo, useState } from 'react'
import { X, FileSpreadsheet, FileText, Loader2, ChevronDown, RotateCcw } from 'lucide-react'
import type { Project, ProgressItem, ProgressStatus } from '../types'
import { PROGRESS_STATUS_ZH } from '../types'
import {
  type ExportProgressOptions, type ReportDepth,
  ALL_STATUSES, exportPreset, buildReportModel,
} from '../lib/export'

// Pre-export picker. Audience-first: pick 業主版（一頁紙）or 內部版（詳細）and go;
// everything else lives behind 進階. A live scope counter shows what will land
// in the file BEFORE the multi-second render, and presets carry a visible
// active state so you always know which template you're about to send.

type PresetName = 'internal' | 'owner' | 'exception' | 'custom'
const PREFS_KEY = (pid: string) => `ck.exportProgress.preset.${pid}`

// Remember only the last PRESET NAME (not raw opts) — restoring raw last-used
// filters silently produced near-empty reports sent to the wrong audience.
function loadPreset(project: Project): 'internal' | 'owner' | 'exception' {
  try {
    const raw = localStorage.getItem(PREFS_KEY(project.id))
    if (raw === 'owner' || raw === 'exception' || raw === 'internal') return raw
  } catch { /* ignore */ }
  return 'internal'
}

const PRESET_META: Record<Exclude<PresetName, 'custom'>, { label: string; sub: string }> = {
  internal: { label: '內部版（詳細）', sub: '一頁紙總覽 + 每區詳細列表' },
  owner: { label: '業主版（一頁紙）', sub: '畀老闆 / 業主睇，10 秒睇得明' },
  exception: { label: '例外版', sub: '只睇延誤 / 阻塞 / 落後' },
}

export function ExportProgressModal({ project, items, onClose }: {
  project: Project
  items: ProgressItem[]
  onClose: () => void
}) {
  const initial = loadPreset(project)
  const [activePreset, setActivePreset] = useState<PresetName>(initial)
  const [opts, setOpts] = useState<ExportProgressOptions>(() => exportPreset(initial, project))
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const [advanced, setAdvanced] = useState(false)

  // any manual edit → 自訂 (so the active-preset chip never lies)
  const set = (patch: Partial<ExportProgressOptions>) => {
    setOpts(o => ({ ...o, ...patch }))
    setActivePreset('custom')
  }
  const applyPreset = (p: 'internal' | 'owner' | 'exception') => {
    setOpts(exportPreset(p, project))
    setActivePreset(p)
  }

  const allZoneIds = project.zones.map(z => z.id)
  const toggleZone = (id: string) =>
    set({ zoneIds: opts.zoneIds.includes(id) ? opts.zoneIds.filter(z => z !== id) : [...opts.zoneIds, id] })
  const toggleStatus = (s: ProgressStatus) =>
    set({ statuses: opts.statuses.includes(s) ? opts.statuses.filter(x => x !== s) : [...opts.statuses, s] })

  // live scope counter — what will actually land in the file, before render.
  const scope = useMemo(() => {
    try { return buildReportModel(project, items, opts).summary }
    catch { return null }
  }, [project, items, opts])

  async function run(format: 'xlsx' | 'pdf') {
    setBusy(format)
    try {
      if (activePreset !== 'custom') localStorage.setItem(PREFS_KEY(project.id), activePreset)
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

        <div className="p-4 space-y-4">
          {/* audience-first preset picker */}
          <div className="grid grid-cols-1 gap-2">
            <PresetBig active={activePreset === 'owner'} onClick={() => applyPreset('owner')} {...PRESET_META.owner} />
            <PresetBig active={activePreset === 'internal'} onClick={() => applyPreset('internal')} {...PRESET_META.internal} />
            <div className="grid grid-cols-2 gap-2">
              <PresetSmall active={activePreset === 'exception'} onClick={() => applyPreset('exception')}>{PRESET_META.exception.label}</PresetSmall>
              {activePreset === 'custom' && (
                <button onClick={() => applyPreset(initial)}
                  className="rounded-xl border border-site-300 text-site-600 text-sm py-2 flex items-center justify-center gap-1.5 hover:bg-site-50">
                  <RotateCcw size={14} /> 還原範本
                </button>
              )}
            </div>
          </div>

          {/* live scope counter */}
          {scope && (
            <div className="rounded-xl bg-site-50 border border-site-200 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-site-800">
                  {activePreset === 'owner' ? '業主一頁紙' : activePreset === 'custom' ? '自訂' : PRESET_META[activePreset].label}
                </span>
                <span className="text-site-400">·</span>
                <span className="text-site-600">整體 {scope.actual}%</span>
                {scope.behind > 0
                  ? <span className="text-red-600 font-semibold">· 落後 {scope.behind} 項</span>
                  : <span className="text-green-700">· 全部按計劃</span>}
              </div>
              <div className="text-xs text-site-400 mt-0.5">
                {opts.audience === 'owner'
                  ? `一頁紙：總覽 + 各分區 + 需關注${scope.behind > 0 ? ` ${scope.behind} 項` : ''}`
                  : `已開始 ${scope.total - scope.notStarted} 項（未開始 ${scope.notStarted} 項不列入詳細）`}
              </div>
            </div>
          )}

          {/* advanced disclosure */}
          <button onClick={() => setAdvanced(a => !a)}
            className="w-full flex items-center justify-between text-sm font-semibold text-site-600 py-1">
            進階設定（分區 / 深度 / 狀態 / 期數）
            <ChevronDown size={16} className={`transition ${advanced ? 'rotate-180' : ''}`} />
          </button>

          {advanced && (
            <div className="space-y-5 pt-1">
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
                <Label>層級深度（內部版詳細表）</Label>
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
                    <button onClick={() => set({ statuses: ALL_STATUSES.filter(s => s !== 'not-started') })} className="text-safety-700 hover:underline">剔走未開始</button>
                    <button onClick={() => set({ statuses: [...ALL_STATUSES] })} className="text-safety-700 hover:underline">全部</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_STATUSES.map(s => (
                    <Chip key={s} active={opts.statuses.includes(s)} onClick={() => toggleStatus(s)}>{PROGRESS_STATUS_ZH[s]}</Chip>
                  ))}
                </div>
              </div>

              {/* report period */}
              <div>
                <Label>報告期數 / 資料截止（選填）</Label>
                <input className="input w-full" placeholder="例如 2026-W23 / 6月第一週"
                  value={opts.reportPeriod} onChange={e => set({ reportPeriod: e.target.value })} />
              </div>
            </div>
          )}
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
function PresetBig({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition ${active ? 'border-safety-500 bg-safety-50 ring-1 ring-safety-300' : 'border-site-200 hover:bg-site-50'}`}>
      <div className={`font-bold text-sm ${active ? 'text-safety-700' : 'text-site-900'}`}>{label}</div>
      <div className="text-xs text-site-500 mt-0.5">{sub}</div>
    </button>
  )
}
function PresetSmall({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl border text-sm py-2 transition ${active ? 'border-safety-500 bg-safety-50 text-safety-700 font-medium' : 'border-site-200 text-site-600 hover:bg-site-50'}`}>{children}</button>
}
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-xl text-sm py-2.5 border transition ${active ? 'bg-safety-500 border-safety-500 text-white font-medium' : 'border-site-200 text-site-600 hover:bg-site-50'}`}>{children}</button>
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-2 rounded-full text-sm transition ${active ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-700 hover:bg-site-200'}`}>{children}</button>
}
