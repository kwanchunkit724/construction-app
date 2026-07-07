import { FormEvent, useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { plannedProgressOf, CATEGORY_DOMAIN_ZH, CATEGORY_STREAM_ZH } from '../types'
import type { ProgressItem, CategoryDomain, CategoryStream } from '../types'

// Edit an existing item's title + planned dates WITHOUT delete+recreate (which
// would lose its history, children, drawings and assignments). Planned dates
// re-base plannedProgressOf so 計劃進度 / 落後-超前 recompute automatically.
export function EditItemModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { updateItemMeta } = useProgress()
  const [title, setTitle] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [catDomain, setCatDomain] = useState<CategoryDomain | null>(null)
  const [catStream, setCatStream] = useState<CategoryStream | null>(null)
  const [acceptanceRequired, setAcceptanceRequired] = useState(false)

  useEffect(() => {
    if (open && item) {
      setTitle(item.title)
      setPlannedStart(item.planned_start ?? '')
      setPlannedEnd(item.planned_end ?? '')
      setCatDomain(item.category_domain ?? null)
      setCatStream(item.category_stream ?? null)
      setAcceptanceRequired(!!item.acceptance_required)
      setError('')
    }
  }, [open, item])

  if (!item) return null
  const isRoot = item.parent_id === null
  const preview = plannedProgressOf({ planned_start: plannedStart || null, planned_end: plannedEnd || null })

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!item) return
    if (!title.trim()) return setError('請輸入名稱')
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) return setError('計劃完成日期不可早於開始日期')
    setSubmitting(true)
    const { error } = await updateItemMeta(item.id, {
      title: title.trim(),
      planned_start: plannedStart || null,
      planned_end: plannedEnd || null,
      acceptance_required: acceptanceRequired,
      // category only on a root 大項
      ...(item.parent_id === null ? { category_domain: catDomain, category_stream: catStream } : {}),
    })
    setSubmitting(false)
    if (error) setError(error)
    else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="編輯項目"
      footer={
        <button onClick={() => save()} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '儲存'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="text-sm font-semibold text-site-900 bg-site-100 rounded-lg p-2.5">
          <span className="font-mono text-site-500">{item.code}</span>
        </div>
        <div>
          <label className="label">名稱</label>
          <input className="input" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">計劃開始</label>
            <input type="date" className="input" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} />
          </div>
          <div>
            <label className="label">計劃完成</label>
            <input type="date" className="input" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} />
          </div>
        </div>
        {isRoot && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">範疇</label>
              <select className="input" value={catDomain ?? ''} onChange={e => setCatDomain((e.target.value || null) as CategoryDomain | null)}>
                <option value="">未分類</option>
                {(Object.keys(CATEGORY_DOMAIN_ZH) as CategoryDomain[]).map(d => <option key={d} value={d}>{CATEGORY_DOMAIN_ZH[d]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">工種</label>
              <select className="input" value={catStream ?? ''} onChange={e => setCatStream((e.target.value || null) as CategoryStream | null)}>
                <option value="">未分類</option>
                {(Object.keys(CATEGORY_STREAM_ZH) as CategoryStream[]).map(s => <option key={s} value={s}>{CATEGORY_STREAM_ZH[s]}</option>)}
              </select>
            </div>
          </div>
        )}
        <label className="flex items-center gap-2.5 rounded-xl bg-site-50 border border-site-100 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={acceptanceRequired}
            onChange={e => setAcceptanceRequired(e.target.checked)}
            className="accent-safety-600 h-4 w-4"
          />
          <span className="flex-1">
            <span className="text-sm font-semibold text-site-800">此項目需要驗收</span>
            <span className="block text-xs text-site-400 mt-0.5">完成驗收先算「已完成」</span>
          </span>
        </label>
        <div className="rounded-xl bg-site-50 border border-site-100 p-3 flex items-center justify-between">
          <span className="label mb-0">計劃進度（自動）</span>
          <span className="text-base font-bold text-safety-600">
            {plannedStart && plannedEnd ? `${preview}%` : '未排期'}
          </span>
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}
