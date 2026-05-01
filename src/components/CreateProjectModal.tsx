import { FormEvent, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProjects } from '../contexts/ProjectsContext'
import type { Zone } from '../types'

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createProject } = useProjects()
  const [name, setName] = useState('')
  const [zones, setZones] = useState<Zone[]>([{ id: 'A', name: 'A 座' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName('')
    setZones([{ id: 'A', name: 'A 座' }])
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  function updateZone(idx: number, field: 'id' | 'name', value: string) {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, [field]: value } : z))
  }

  function addZone() {
    setZones(prev => [...prev, { id: '', name: '' }])
  }

  function removeZone(idx: number) {
    setZones(prev => prev.filter((_, i) => i !== idx))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('請輸入項目名稱')
    if (zones.length === 0) return setError('至少要有一個分區')
    const cleanZones = zones
      .map(z => ({ id: z.id.trim(), name: z.name.trim() }))
      .filter(z => z.id && z.name)
    if (cleanZones.length === 0) return setError('請填寫分區資料')
    const ids = cleanZones.map(z => z.id)
    if (new Set(ids).size !== ids.length) return setError('分區編號不可重複')

    setSubmitting(true)
    const { error } = await createProject(name, cleanZones)
    setSubmitting(false)
    if (error) setError(error)
    else close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="新增工地項目"
      footer={
        <button onClick={onSubmit} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '建立項目'}
        </button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">項目名稱 *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：尖沙咀廣東道 39 號"
            className="input"
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">分區結構 *</label>
            <button type="button" onClick={addZone} className="text-sm text-safety-600 font-semibold flex items-center gap-1 min-h-0">
              <Plus size={16} /> 加分區
            </button>
          </div>
          <p className="text-xs text-site-400 mb-2">例如：A 座、B 座、地庫、外圍</p>
          <div className="space-y-2">
            {zones.map((z, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  value={z.id}
                  onChange={e => updateZone(idx, 'id', e.target.value)}
                  placeholder="編號"
                  className="input w-20 text-center font-mono"
                />
                <input
                  value={z.name}
                  onChange={e => updateZone(idx, 'name', e.target.value)}
                  placeholder="分區名稱"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeZone(idx)}
                  className="flex-shrink-0 text-site-300 hover:text-red-600 p-2"
                  aria-label="刪除分區"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
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
