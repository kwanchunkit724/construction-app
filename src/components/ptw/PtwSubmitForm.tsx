import { useState, useMemo } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Modal } from '../Modal'
import { usePtw } from '../../contexts/PtwContext'
import { PTW_TYPE_ZH, PTW_TYPE_V1 } from '../../types'
import type { PtwType, PtwChecklistItem, PtwPayload } from '../../types'
import { checklistTemplate } from '../../lib/ptw'

interface WorkerDraft {
  name: string
  phone: string
}

interface PtwSubmitFormProps {
  open: boolean
  onClose: () => void
  onSubmitted: (ptwId: string) => void
}

export function PtwSubmitForm({ open, onClose, onSubmitted }: PtwSubmitFormProps) {
  const { createDraft, saveVersion, submit, addWorker } = usePtw()
  const [ptwType, setPtwType] = useState<PtwType>('hot_work')
  const [description, setDescription] = useState('')
  const [checklist, setChecklist] = useState<PtwChecklistItem[]>(() => checklistTemplate('hot_work'))
  const [workers, setWorkers] = useState<WorkerDraft[]>([{ name: '', phone: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allRequiredChecked = useMemo(
    () => checklist.filter(c => c.required).every(c => c.value === true),
    [checklist],
  )

  const validWorkers = useMemo(
    () => workers.filter(w => w.name.trim().length > 0),
    [workers],
  )

  const canSubmit = description.trim().length > 0 && allRequiredChecked && validWorkers.length > 0

  function handleTypeChange(t: PtwType) {
    setPtwType(t)
    setChecklist(checklistTemplate(t))
  }

  function toggleCheck(key: string) {
    setChecklist(prev => prev.map(c => c.key === key ? { ...c, value: c.value === true ? false : true } : c))
  }

  function updateWorker(idx: number, field: keyof WorkerDraft, value: string) {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w))
  }

  function addWorkerRow() {
    setWorkers(prev => [...prev, { name: '', phone: '' }])
  }

  function removeWorker(idx: number) {
    setWorkers(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { id, error: createErr } = await createDraft(ptwType)
      if (createErr || !id) {
        setError(createErr || '建立失敗')
        return
      }
      const payload: PtwPayload = {
        description: description.trim(),
        checklist,
        ppe_photo_paths: [],
        scene_photo_paths: [],
        drawing_version_ids: [],
      }
      const { error: vErr } = await saveVersion(id, payload)
      if (vErr) { setError(vErr); return }
      for (const w of validWorkers) {
        await addWorker(id, w.name.trim(), w.phone.trim() || null, null)
      }
      const { error: subErr } = await submit(id)
      if (subErr) { setError(subErr); return }
      onSubmitted(id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="新增工作許可證" onClose={onClose}>
      <div className="space-y-4">
        {/* PTW type */}
        <div>
          <label className="label">許可證類型</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
            {(Object.keys(PTW_TYPE_ZH) as PtwType[]).map(t => {
              const enabled = (PTW_TYPE_V1 as readonly PtwType[]).includes(t)
              const selected = ptwType === t
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && handleTypeChange(t)}
                  className={
                    selected
                      ? 'rounded-xl border-2 border-safety-500 bg-safety-50 px-3 py-2 text-sm font-medium text-safety-700'
                      : enabled
                        ? 'rounded-xl border border-site-200 bg-white px-3 py-2 text-sm text-site-700 hover:border-safety-300'
                        : 'rounded-xl border border-site-100 bg-site-50 px-3 py-2 text-xs text-site-400 cursor-not-allowed'
                  }
                >
                  {PTW_TYPE_ZH[t]}
                  {!enabled && <div className="text-[10px] mt-0.5">敬請期待</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">工作描述</label>
          <textarea
            className="input"
            rows={3}
            placeholder="說明工作範圍、地點、時段..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={4000}
          />
          <p className="text-xs text-site-500 text-right">{description.length}/4000</p>
        </div>

        {/* Checklist */}
        {checklist.length > 0 && (
          <div>
            <label className="label">安全核對清單</label>
            <div className="space-y-2 mt-1">
              {checklist.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleCheck(item.key)}
                  className={
                    'w-full flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ' +
                    (item.value === true
                      ? 'border-green-300 bg-green-50 text-green-900'
                      : item.required
                        ? 'border-amber-200 bg-amber-50 text-site-900'
                        : 'border-site-200 bg-white text-site-700')
                  }
                >
                  <span
                    className={
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ' +
                      (item.value === true
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-site-300 bg-white text-transparent')
                    }
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="flex-1">
                    {item.label_zh}
                    {item.required && <span className="ml-1 text-red-500">*</span>}
                  </span>
                </button>
              ))}
            </div>
            {!allRequiredChecked && (
              <p className="mt-2 text-xs text-amber-700">
                必須勾選所有 <span className="text-red-500">*</span> 必填項目先可以提交
              </p>
            )}
          </div>
        )}

        {/* Workers */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label">工人名單</label>
            <button type="button" className="btn-ghost text-sm" onClick={addWorkerRow}>
              <Plus size={14} className="inline mr-1" />
              加入工人
            </button>
          </div>
          <div className="space-y-2 mt-1">
            {workers.map((w, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="工人姓名"
                  value={w.name}
                  onChange={e => updateWorker(idx, 'name', e.target.value)}
                />
                <input
                  className="input w-32"
                  placeholder="電話 (選填)"
                  value={w.phone}
                  onChange={e => updateWorker(idx, 'phone', e.target.value)}
                />
                {workers.length > 1 && (
                  <button
                    type="button"
                    className="btn-ghost text-red-600"
                    onClick={() => removeWorker(idx)}
                    aria-label="刪除"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {validWorkers.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">最少加入一名工人</p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
