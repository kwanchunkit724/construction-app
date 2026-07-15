import { FormEvent, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProjects } from '../contexts/ProjectsContext'
import { PROJECT_TYPE_ZH, generateFloorLabels } from '../types'
import type { ProjectType, Zone, ZoneKind } from '../types'
import { templateFor } from '../lib/progressTemplates'

const PROJECT_TYPE_ORDER: ProjectType[] = ['general', 'small_works', 'drainage', 'maintenance']

// Guided zone editor row: kind + floor preset inputs (building only). The
// floors are generated once at creation and become the immutable tick list.
interface ZoneDraft {
  id: string
  name: string
  kind: ZoneKind
  basements: string
  irregular: string
  standard: string
  roof: string
}

function newZoneDraft(id = '', name = ''): ZoneDraft {
  return { id, name, kind: 'building', basements: '0', irregular: 'G/F', standard: '10', roof: '1' }
}

function draftFloors(d: ZoneDraft): string[] {
  return generateFloorLabels({
    basements: Math.max(0, parseInt(d.basements) || 0),
    irregular: d.irregular.split(/[,，]/).map(s => s.trim()).filter(Boolean),
    standardCount: Math.max(0, parseInt(d.standard) || 0),
    roofCount: Math.max(0, parseInt(d.roof) || 0),
  }).map(f => f.label)
}

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createProject } = useProjects()
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>('general')
  // v112: 新項目 default 新版 (guided). 舊版自由樹 still offered for edge cases.
  const [guided, setGuided] = useState(true)
  const [zones, setZones] = useState<Zone[]>([{ id: 'A', name: 'A 座' }])
  const [drafts, setDrafts] = useState<ZoneDraft[]>([newZoneDraft('A', 'A 座')])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // autoZone types (小型工程) create one implicit zone server-side, so we
  // hide the zone editor entirely and don't validate zones for them.
  // Guided mode is only meaningful for 'general' (multi-zone building sites).
  const template = templateFor(projectType)
  const showZoneEditor = !template.autoZone
  const guidedAvailable = projectType === 'general'
  const useGuided = guided && guidedAvailable

  function reset() {
    setName('')
    setProjectType('general')
    setGuided(true)
    setZones([{ id: 'A', name: 'A 座' }])
    setDrafts([newZoneDraft('A', 'A 座')])
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  function updateZone(idx: number, field: 'id' | 'name', value: string) {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, [field]: value } : z))
  }

  function updateDraft(idx: number, patch: Partial<ZoneDraft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  function addZone() {
    setZones(prev => [...prev, { id: '', name: '' }])
    setDrafts(prev => [...prev, newZoneDraft()])
  }

  function removeZone(idx: number) {
    setZones(prev => prev.filter((_, i) => i !== idx))
    setDrafts(prev => prev.filter((_, i) => i !== idx))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('請輸入項目名稱')

    let cleanZones: Zone[] = []
    if (showZoneEditor) {
      if (useGuided) {
        const rows = drafts
          .map(d => ({ ...d, id: d.id.trim(), name: d.name.trim() }))
          .filter(d => d.id && d.name)
        if (rows.length === 0) return setError('請填寫分區資料')
        const ids = rows.map(d => d.id)
        if (new Set(ids).size !== ids.length) return setError('分區編號不可重複')
        cleanZones = rows.map(d => {
          if (d.kind === 'external') return { id: d.id, name: d.name, kind: 'external' as ZoneKind }
          const floors = draftFloors(d)
          return { id: d.id, name: d.name, kind: 'building' as ZoneKind, floors }
        })
        const emptyTower = cleanZones.find(z => z.kind === 'building' && (z.floors ?? []).length === 0)
        if (emptyTower) return setError(`「${emptyTower.name}」未設定任何樓層`)
      } else {
        if (zones.length === 0) return setError('至少要有一個分區')
        cleanZones = zones
          .map(z => ({ id: z.id.trim(), name: z.name.trim() }))
          .filter(z => z.id && z.name)
        if (cleanZones.length === 0) return setError('請填寫分區資料')
        const ids = cleanZones.map(z => z.id)
        if (new Set(ids).size !== ids.length) return setError('分區編號不可重複')
      }
    }

    setSubmitting(true)
    const { error } = await createProject(name, cleanZones, projectType, {
      progressMode: useGuided ? 'guided' : 'classic',
    })
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
          <label className="label">工程類型 *</label>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_TYPE_ORDER.map(t => {
              const selected = projectType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setProjectType(t)}
                  className={`py-2.5 px-2 rounded-xl border-2 text-sm font-semibold transition-colors min-h-[44px] text-center ${
                    selected
                      ? 'border-safety-500 bg-safety-50 text-safety-700'
                      : 'border-site-200 text-site-500 hover:border-site-300'
                  }`}
                >
                  {PROJECT_TYPE_ZH[t]}
                </button>
              )
            })}
          </div>
          {!showZoneEditor && (
            <p className="text-xs text-site-400 mt-2">
              此類型會自動建立單一工地，毋須設定分區。
            </p>
          )}
        </div>

        {guidedAvailable && showZoneEditor && (
          <div>
            <label className="label">進度表模式 *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGuided(true)}
                className={`py-2.5 px-2 rounded-xl border-2 text-sm font-semibold min-h-[44px] ${guided ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}
              >
                新版（引導式）
              </button>
              <button
                type="button"
                onClick={() => setGuided(false)}
                className={`py-2.5 px-2 rounded-xl border-2 text-sm font-semibold min-h-[44px] ${!guided ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}
              >
                舊版（自由樹）
              </button>
            </div>
            {guided && (
              <p className="text-xs text-site-400 mt-2">
                分區同樓層開盤後鎖死；工種／位置／工序日後可自由加減。
              </p>
            )}
          </div>
        )}

        {showZoneEditor && !useGuided && (
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
        )}

        {showZoneEditor && useGuided && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">分區結構 *（開盤後不可更改）</label>
              <button type="button" onClick={addZone} className="text-sm text-safety-600 font-semibold flex items-center gap-1 min-h-0">
                <Plus size={16} /> 加分區
              </button>
            </div>
            <div className="space-y-3">
              {drafts.map((d, idx) => {
                const floors = d.kind === 'building' ? draftFloors(d) : []
                return (
                  <div key={idx} className="border border-site-200 rounded-xl p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <input
                        value={d.id}
                        onChange={e => updateDraft(idx, { id: e.target.value })}
                        placeholder="編號"
                        className="input w-16 text-center font-mono"
                      />
                      <input
                        value={d.name}
                        onChange={e => updateDraft(idx, { name: e.target.value })}
                        placeholder="分區名稱（例：一座）"
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
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateDraft(idx, { kind: 'building' })}
                        className={`py-2 rounded-lg border-2 text-xs font-semibold min-h-0 ${d.kind === 'building' ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}
                      >
                        大樓（有樓層）
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDraft(idx, { kind: 'external' })}
                        className={`py-2 rounded-lg border-2 text-xs font-semibold min-h-0 ${d.kind === 'external' ? 'border-green-500 bg-green-50 text-green-700' : 'border-site-200 text-site-500'}`}
                      >
                        外圍（剔位置）
                      </button>
                    </div>
                    {d.kind === 'building' && (
                      <>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-site-400 block mb-0.5">地庫層</label>
                            <input className="input text-center" inputMode="numeric" value={d.basements} onChange={e => updateDraft(idx, { basements: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] text-site-400 block mb-0.5">非標準層</label>
                            <input className="input text-center" value={d.irregular} onChange={e => updateDraft(idx, { irregular: e.target.value })} placeholder="G/F" />
                          </div>
                          <div>
                            <label className="text-[10px] text-site-400 block mb-0.5">標準層數</label>
                            <input className="input text-center" inputMode="numeric" value={d.standard} onChange={e => updateDraft(idx, { standard: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-[10px] text-site-400 block mb-0.5">天面層</label>
                            <input className="input text-center" inputMode="numeric" value={d.roof} onChange={e => updateDraft(idx, { roof: e.target.value })} />
                          </div>
                        </div>
                        <p className="text-[10px] text-site-400">
                          共 {floors.length} 層{floors.length > 0 ? `：${floors[0]} … ${floors[floors.length - 1]}` : ''}
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
