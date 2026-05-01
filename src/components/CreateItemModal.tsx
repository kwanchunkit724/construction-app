import { FormEvent, useState } from 'react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import type { ProgressItem, Zone } from '../types'

export function CreateItemModal({
  open, onClose, parent, zones,
}: {
  open: boolean
  onClose: () => void
  parent: ProgressItem | null
  zones: Zone[]
}) {
  const { addItem } = useProgress()
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [zoneId, setZoneId] = useState<string>(parent?.zone_id ?? zones[0]?.id ?? '')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [plannedProgress, setPlannedProgress] = useState(0)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setCode('')
    setTitle('')
    setZoneId(parent?.zone_id ?? zones[0]?.id ?? '')
    setPlannedStart('')
    setPlannedEnd('')
    setPlannedProgress(0)
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  const level = parent ? parent.level + 1 : 1
  const levelLabel = level === 1 ? '大項' : level === 2 ? '中項' : `第 ${level} 層細項`

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!code.trim()) return setError('請輸入編號')
    if (!title.trim()) return setError('請輸入名稱')

    setSubmitting(true)
    const { error } = await addItem({
      parent_id: parent?.id ?? null,
      code,
      title,
      zone_id: zoneId || null,
      planned_start: plannedStart || null,
      planned_end: plannedEnd || null,
      planned_progress: plannedProgress,
    })
    setSubmitting(false)
    if (error) setError(error)
    else close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`加入 ${levelLabel}`}
      footer={
        <button onClick={onSubmit} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '建立'}
        </button>
      }
    >
      {parent && (
        <div className="text-xs text-site-500 mb-3 bg-site-100 rounded-lg p-2.5">
          上級：<span className="font-mono">{parent.code}</span> {parent.title}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">編號 *</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={parent ? `${parent.code}-01` : 'A01'}
            className="input font-mono"
          />
        </div>
        <div>
          <label className="label">名稱 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例：地基工程"
            className="input"
          />
        </div>

        {level === 1 && zones.length > 0 && (
          <div>
            <label className="label">分區</label>
            <div className="grid grid-cols-2 gap-2">
              {zones.map(z => {
                const active = zoneId === z.id
                return (
                  <button
                    type="button"
                    key={z.id}
                    onClick={() => setZoneId(z.id)}
                    className={`px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${
                      active ? 'border-safety-500 bg-safety-50 text-safety-700 font-semibold' : 'border-site-200 text-site-700 hover:border-site-300'
                    }`}
                  >
                    <span className="font-mono text-xs">{z.id}</span>
                    <span className="text-sm ml-1">{z.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">計劃開始</label>
            <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">計劃完成</label>
            <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">計劃進度</label>
            <span className="text-base font-bold text-safety-600">{plannedProgress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={plannedProgress}
            onChange={e => setPlannedProgress(Number(e.target.value))}
            className="w-full accent-safety-600"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
