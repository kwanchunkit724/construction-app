import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { deriveStatus } from '../types'
import type { ProgressItem } from '../types'

export function UpdateProgressModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { updateProgress } = useProgress()
  const [actual, setActual] = useState(0)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Sync local state when modal opens with a new item
  useEffect(() => {
    if (open && item) {
      setActual(item.actual_progress)
      setNotes(item.notes)
      setError('')
    }
  }, [open, item])

  if (!item) return null

  const status = deriveStatus(actual, item.planned_progress)

  async function save() {
    if (!item) return
    setError('')
    setSubmitting(true)
    const { error } = await updateProgress(item.id, actual, notes)
    setSubmitting(false)
    if (error) setError(error)
    else onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="更新進度"
      footer={
        <button onClick={save} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : <><Send size={16} /> 儲存更新</>}
        </button>
      }
    >
      <div className="text-sm font-semibold text-site-900 mb-4 bg-site-100 rounded-lg p-2.5">
        <span className="font-mono text-site-500">{item.code}</span> · {item.title}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">實際完成進度</label>
          <span className="text-2xl font-black text-safety-600">{actual}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={actual}
          onChange={e => setActual(Number(e.target.value))}
          className="w-full accent-safety-600"
        />
        <div className="flex justify-between text-xs text-site-400 mt-1">
          <span>0%</span>
          <span className="text-orange-500">計劃: {item.planned_progress}%</span>
          <span>100%</span>
        </div>
        <div className="mt-3">
          <ProgressBar value={actual} planned={item.planned_progress} status={status} />
        </div>
        {actual < item.planned_progress - 5 && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            ⚠ 進度落後計劃 {item.planned_progress - actual}%，請說明原因
          </div>
        )}
      </div>

      <div>
        <label className="label">備注 / 說明</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="請說明最新進展或影響因素..."
          className="input resize-none"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
          {error}
        </div>
      )}
    </Modal>
  )
}
