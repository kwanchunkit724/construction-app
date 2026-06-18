import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Footprints, X, CheckCircle2, ChevronRight } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { InspectionProvider, useInspection } from '../contexts/InspectionContext'
import type { CreateRoundInput } from '../contexts/InspectionContext'
import { INSPECTION_CATEGORY_ZH, INSPECTION_ROUND_STATUS_ZH } from '../types'
import type { InspectionCategory, InspectionRoundStatus } from '../types'

export default function InspectionListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <InspectionProvider projectId={id}>
      <InspectionListInner projectId={id} />
    </InspectionProvider>
  )
}

export function inspectionStatusBadge(s: InspectionRoundStatus) {
  const map: Record<InspectionRoundStatus, string> = {
    open: 'bg-amber-100 text-amber-700',
    done: 'bg-green-100 text-green-700',
    cancelled: 'bg-site-100 text-site-400 line-through',
  }
  return map[s]
}

function InspectionListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { rounds, coverage, loading, error, canManage } = useInspection()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<InspectionRoundStatus | null>(null)

  const filtered = useMemo(
    () => statusFilter ? rounds.filter(r => r.status === statusFilter) : rounds,
    [rounds, statusFilter],
  )
  const openCount = rounds.filter(r => r.status === 'open').length

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3 space-y-3">
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]"
        >
          <ChevronLeft size={18} /> 返回工地
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-site-900 flex items-center gap-2">
              <Footprints size={20} className="text-indigo-600" /> 巡查
            </h1>
            <p className="text-xs text-site-500 mt-0.5">定期巡查 · 逐層核查 · {openCount} 個進行中</p>
          </div>
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> 開巡查
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {([null, 'open', 'done', 'cancelled'] as (InspectionRoundStatus | null)[]).map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setStatusFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-full font-medium min-h-[44px] ${
                statusFilter === s ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'
              }`}
            >
              {s === null ? '全部' : INSPECTION_ROUND_STATUS_ZH[s]}
            </button>
          ))}
        </div>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>}

        {!loading && filtered.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {rounds.length === 0
              ? (canManage ? '仲未有巡查。撳「開巡查」開第一輪。' : '仲未有巡查。')
              : '沒有符合篩選的巡查'}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(r => {
            const cov = coverage[r.id]
            const total = cov?.total ?? r.floor_labels.length
            const marked = cov?.marked ?? 0
            const failed = cov?.failed ?? 0
            const pct = total > 0 ? Math.round((marked / total) * 100) : 0
            return (
              <button
                key={r.id}
                onClick={() => navigate(`/project/${projectId}/inspection/${r.id}`)}
                className="card w-full p-3 flex items-start gap-3 text-left hover:bg-site-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">
                      {INSPECTION_CATEGORY_ZH[r.category]}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${inspectionStatusBadge(r.status)}`}>
                      {INSPECTION_ROUND_STATUS_ZH[r.status]}
                    </span>
                  </div>
                  <p className="font-bold text-site-900 mt-1 truncate">{r.title}</p>
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-site-500">{marked} / {total} 層</span>
                      {failed > 0 && <span className="text-red-600 font-semibold">{failed} 項不合格</span>}
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-site-100 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-site-300 flex-shrink-0 mt-1" />
              </button>
            )
          })}
        </div>
      </div>

      {createOpen && (
        <CreateRoundModal
          onClose={() => setCreateOpen(false)}
          onDone={id => { setCreateOpen(false); navigate(`/project/${projectId}/inspection/${id}`) }}
        />
      )}
    </AppLayout>
  )
}

// Parse a free-text floor-set ("G,1,2,3" or whitespace-separated) into a deduped,
// trimmed, non-empty list — preserving entry order.
function parseFloors(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tok of raw.split(/[,\s]+/)) {
    const t = tok.trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

function CreateRoundModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { createRound } = useInspection()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<InspectionCategory>('leak')
  const [notes, setNotes] = useState('')
  const [floorText, setFloorText] = useState('')
  const [floorCount, setFloorCount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const floors = useMemo(() => parseFloors(floorText), [floorText])

  function generateFloors() {
    const n = parseInt(floorCount, 10)
    if (!Number.isFinite(n) || n < 1) { setErr('請輸入有效的樓層數'); return }
    setErr(null)
    const labels = Array.from({ length: n }, (_, i) => String(i + 1))
    setFloorText(labels.join(','))
  }

  async function submit() {
    if (!title.trim()) return setErr('請輸入標題')
    if (floors.length === 0) return setErr('請輸入至少一個樓層')
    setSubmitting(true)
    setErr(null)
    const input: CreateRoundInput = {
      title,
      category,
      floor_labels: floors,
      notes: notes || null,
    }
    const { id, error } = await createRound(input)
    if (error || !id) { setErr(error || '開巡查失敗'); setSubmitting(false); return }
    onDone(id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900 flex items-center gap-2"><Footprints size={18} className="text-indigo-600" /> 開巡查</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="label">標題</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：6 月漏水巡查" />
          </div>
          <div>
            <label className="label">類別</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value as InspectionCategory)}>
              {(Object.keys(INSPECTION_CATEGORY_ZH) as InspectionCategory[]).map(c => (
                <option key={c} value={c}>{INSPECTION_CATEGORY_ZH[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">說明（可選）</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="巡查範圍 / 注意事項" />
          </div>

          <div>
            <label className="label">樓層 (逗號分隔)</label>
            <input className="input" value={floorText} onChange={e => setFloorText(e.target.value)} placeholder="例：G,1,2,3" />
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-site-500 flex-shrink-0">或 1 至</span>
              <input
                type="number"
                min={1}
                className="input flex-1"
                value={floorCount}
                onChange={e => setFloorCount(e.target.value)}
                placeholder="N"
              />
              <span className="text-xs text-site-500 flex-shrink-0">層</span>
              <button type="button" onClick={generateFloors} className="btn-ghost flex-shrink-0">產生</button>
            </div>
            {floors.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {floors.map(f => (
                  <span key={f} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{f}</span>
                ))}
              </div>
            )}
          </div>

          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />} 開巡查
          </button>
        </div>
      </div>
    </div>
  )
}
