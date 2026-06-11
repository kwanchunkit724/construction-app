import { useEffect, useState } from 'react'
import { Send, Check } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { deriveStatus, floorsToProgress, plannedProgressOf } from '../types'
import type { ProgressItem } from '../types'

export function UpdateProgressModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { updateProgress, updateFloors } = useProgress()
  const [actual, setActual] = useState(0)
  const [floorsCompleted, setFloorsCompleted] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && item) {
      setActual(item.actual_progress)
      setFloorsCompleted([...item.floors_completed])
      setNotes(item.notes)
      setError('')
    }
  }, [open, item])

  if (!item) return null

  // 'checklist' shares the floors storage + derivation; it differs only in
  // rendering (a vertical tick-list of 工序 rather than the 樓層 grid).
  const isFloors = item.tracking_mode === 'floors'
  const isChecklist = item.tracking_mode === 'checklist'
  const isLabelMode = isFloors || isChecklist
  const computedActual = isLabelMode ? floorsToProgress(floorsCompleted, item.floor_labels) : actual
  const planned = plannedProgressOf(item)
  const status = deriveStatus(computedActual, planned)

  function toggleFloor(label: string) {
    setFloorsCompleted(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    )
  }

  async function save() {
    if (!item) return
    setError('')
    setSubmitting(true)
    const { error } = isLabelMode
      ? await updateFloors(item.id, floorsCompleted, notes)
      : await updateProgress(item.id, actual, notes)
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
      <div className="text-sm font-semibold text-site-900 mb-3 bg-site-100 rounded-lg p-2.5 flex items-center justify-between gap-2">
        <span><span className="font-mono text-site-500">{item.code}</span> · {item.title}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          isLabelMode ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {isChecklist
            ? `清單模式 · ${item.floor_labels.length} 項`
            : isFloors
              ? `樓層模式 · ${item.floor_labels.length} 層`
              : '百分比模式'}
        </span>
      </div>

      {isChecklist ? (
        /* ── Checklist tick-list (工序) — vertical 44px rows ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">已完成工序</label>
            <span className="text-2xl font-black text-purple-600">
              {floorsCompleted.length}/{item.floor_labels.length}
              <span className="text-xs font-normal text-site-400 ml-1">({computedActual}%)</span>
            </span>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {item.floor_labels.map(label => {
              const done = floorsCompleted.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleFloor(label)}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors text-left ${
                    done
                      ? 'bg-green-50 border-green-500 text-green-800'
                      : 'bg-white border-site-200 text-site-600 hover:border-green-300'
                  }`}
                >
                  <span className={`flex-shrink-0 w-5 h-5 rounded grid place-items-center border-2 ${
                    done ? 'bg-green-500 border-green-500 text-white' : 'border-site-300 text-transparent'
                  }`}>
                    <Check size={13} />
                  </span>
                  <span className="flex-1 min-w-0 truncate">{label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : isFloors ? (
        /* ── Floor grid ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">已完成樓層</label>
            <span className="text-2xl font-black text-purple-600">
              {floorsCompleted.length}/{item.floor_labels.length}
              <span className="text-xs font-normal text-site-400 ml-1">({computedActual}%)</span>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {item.floor_labels.map(label => {
              const done = floorsCompleted.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleFloor(label)}
                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border-2 transition-colors min-h-0 flex items-center justify-center gap-1 ${
                    done
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-site-200 text-site-500 hover:border-green-300'
                  }`}
                >
                  {done && <Check size={11} />} {label}
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : (
        /* ── Percentage slider ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">實際完成進度</label>
            <span className="text-2xl font-black text-safety-600">{actual}%</span>
          </div>
          {/* Tap target: native range track is ~4px; thumb size browser-defined.
              Wrap in py-3 (24px) so vertical hit area is 44px+, matching HIG.
              `touch-none` so swipes don't scroll the modal. */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={actual}
            onChange={e => setActual(Number(e.target.value))}
            className="w-full accent-safety-600 h-12 touch-none cursor-pointer"
            aria-label="實際完成進度"
          />
          {/* Quick-tap chips so foreman with gloves can land 50/75/100 without
              sliding the thin native thumb. */}
          <div className="flex gap-2 mt-1">
            {[25, 50, 75, 100].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setActual(v)}
                className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border transition-colors ${
                  actual === v
                    ? 'bg-safety-600 text-white border-safety-600'
                    : 'bg-white text-site-700 border-site-200 hover:bg-site-50'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-site-400 mt-1">
            <span>0%</span>
            <span className="text-orange-500">計劃: {planned}%</span>
            <span>100%</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={actual} planned={planned} status={status} />
          </div>
        </div>
      )}

      {computedActual < planned - 5 && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          ⚠ 進度落後計劃 {planned - computedActual}%，請說明原因
        </div>
      )}

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
