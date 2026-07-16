import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { supabase } from '../../lib/supabase'
import { useProjects } from '../../contexts/ProjectsContext'
import { useProgress } from '../../contexts/ProgressContext'
import { generateFloorLabels } from '../../types'
import type { Project, ProgressItem, SiteMap, Zone, ZoneKind } from '../../types'

// v112 guided 分區管理 (user feedback: structure is no longer 開盤鎖死).
// Add zones, edit a building zone's floor list, delete EMPTY zones only —
// a zone with 工序 refuses deletion instead of silently destroying data.
// Floor edits PROPAGATE: new floors are appended to every 工序 in the zone,
// removed floors disappear from tick lists (ticks pruned, % re-materialised),
// and a 工序's own exclusions are preserved (floors it never had stay out).
// Gate these sheets to admin / assigned PM — projects-row RLS allows them.

async function writeZones(projectId: string, zones: Zone[], siteMap?: SiteMap | null): Promise<string | null> {
  const patch: Record<string, unknown> = { zones }
  if (siteMap !== undefined) patch.site_map = siteMap
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId)
  return error ? error.message : null
}

// ── 新增分區 ─────────────────────────────────────────────────
export function AddZoneSheet({ project, onClose }: {
  project: Project
  onClose: () => void
}) {
  const { refetch } = useProjects()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ZoneKind>('building')
  const [basements, setBasements] = useState('0')
  const [irregular, setIrregular] = useState('G/F')
  const [standard, setStandard] = useState('10')
  const [roof, setRoof] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const floors = kind === 'building'
    ? generateFloorLabels({
        basements: Math.max(0, parseInt(basements) || 0),
        irregular: irregular.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        standardCount: Math.max(0, parseInt(standard) || 0),
        roofCount: Math.max(0, parseInt(roof) || 0),
      }).map(f => f.label)
    : []

  function newId(): string {
    const ids = new Set(project.zones.map(z => z.id))
    for (let i = 0; i < 50; i++) {
      const id = `z${Math.random().toString(36).slice(2, 7)}`
      if (!ids.has(id)) return id
    }
    return `z${Date.now().toString(36)}`
  }

  async function save() {
    setError('')
    const clean = name.trim()
    if (!clean) return setError('請輸入分區名稱')
    if (project.zones.some(z => z.name === clean)) return setError('已有同名分區')
    if (kind === 'building' && floors.length === 0) return setError('大樓要至少一層')
    setBusy(true)
    const zone: Zone = kind === 'building'
      ? { id: newId(), name: clean, kind, floors }
      : { id: newId(), name: clean, kind }
    const err = await writeZones(project.id, [...project.zones, zone])
    if (err) { setError(err); setBusy(false); return }
    await refetch()
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title="新增分區"
      footer={
        <button onClick={() => void save()} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={18} className="text-white" /> : '加入分區'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">分區名稱 *</label>
          <input className="input" placeholder="例：五座 / 平台" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind('building')} className={`py-2 rounded-lg border-2 text-xs font-semibold min-h-[44px] ${kind === 'building' ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}>
            大樓（有樓層）
          </button>
          <button type="button" onClick={() => setKind('external')} className={`py-2 rounded-lg border-2 text-xs font-semibold min-h-[44px] ${kind === 'external' ? 'border-green-500 bg-green-50 text-green-700' : 'border-site-200 text-site-500'}`}>
            外圍（剔位置）
          </button>
        </div>
        {kind === 'building' && (
          <>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-site-400 block mb-0.5">地庫層</label>
                <input className="input text-center" inputMode="numeric" value={basements} onChange={e => setBasements(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-site-400 block mb-0.5">非標準層</label>
                <input className="input text-center" value={irregular} onChange={e => setIrregular(e.target.value)} placeholder="G/F" />
              </div>
              <div>
                <label className="text-[10px] text-site-400 block mb-0.5">標準層數</label>
                <input className="input text-center" inputMode="numeric" value={standard} onChange={e => setStandard(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-site-400 block mb-0.5">天面層</label>
                <input className="input text-center" inputMode="numeric" value={roof} onChange={e => setRoof(e.target.value)} />
              </div>
            </div>
            <p className="text-[10px] text-site-400">
              共 {floors.length} 層{floors.length > 0 ? `：${floors[0]} … ${floors[floors.length - 1]}` : ''}
            </p>
          </>
        )}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
      </div>
    </Modal>
  )
}

// ── 分區設定: 樓層編輯 + 刪除分區 ────────────────────────────
export function ZoneSettingsSheet({ project, zone, leaves, onClose }: {
  project: Project
  zone: Zone
  leaves: ProgressItem[]
  onClose: () => void
}) {
  const { refetch: refetchProjects } = useProjects()
  const { refetch: refetchProgress } = useProgress()
  const isBuilding = (zone.kind ?? 'building') === 'building'
  const orig = zone.floors ?? []
  const [floors, setFloors] = useState<string[]>(orig)
  const [newFloor, setNewFloor] = useState('')
  // where the new floor slots in — a tower with 天面 needs mid-inserts
  // (19/F goes AFTER 18/F, not above R2/F). '__end__' = 最頂, '__bottom__' = 最底.
  const [insertAfter, setInsertAfter] = useState<string>('__end__')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [error, setError] = useState('')

  const changed = JSON.stringify(floors) !== JSON.stringify(orig)

  function addFloor() {
    const clean = newFloor.trim()
    if (!clean) return
    if (floors.includes(clean)) { setError('已有同名樓層'); return }
    setError('')
    setFloors(f => {
      if (insertAfter === '__bottom__') return [clean, ...f]
      const idx = f.indexOf(insertAfter)
      if (insertAfter === '__end__' || idx === -1) return [...f, clean]
      return [...f.slice(0, idx + 1), clean, ...f.slice(idx + 1)]
    })
    setNewFloor('')
  }

  async function saveFloors() {
    setError('')
    if (floors.length === 0) return setError('大樓要至少一層')
    setBusy(true)
    const additions = floors.filter(f => !orig.includes(f))
    // propagate to every 工序 in the zone: keep the leaf's own exclusions,
    // include additions, drop removals, normalise to the new zone order.
    for (const leaf of leaves) {
      const had = new Set(leaf.floor_labels ?? [])
      const newLabels = floors.filter(f => had.has(f) || additions.includes(f))
      const newDone = (leaf.floors_completed ?? []).filter(f => newLabels.includes(f))
      const sameLabels = JSON.stringify(newLabels) === JSON.stringify(leaf.floor_labels ?? [])
      const sameDone = JSON.stringify(newDone) === JSON.stringify(leaf.floors_completed ?? [])
      if (sameLabels && sameDone) continue
      const actual = newLabels.length === 0 ? 0 : Math.round((newDone.length / newLabels.length) * 100)
      const { error: e } = await supabase.from('progress_items').update({
        floor_labels: newLabels,
        floors_completed: newDone,
        actual_progress: actual,
        status: actual >= 100 ? 'completed' : actual === 0 ? 'not-started' : 'in-progress',
        last_updated_at: new Date().toISOString(),
      }).eq('id', leaf.id)
      if (e) { setError(`${leaf.title}：${e.message}`); setBusy(false); return }
    }
    const newZones = project.zones.map(z => z.id === zone.id ? { ...z, floors } : z)
    const err = await writeZones(project.id, newZones)
    if (err) { setError(err); setBusy(false); return }
    await Promise.all([refetchProjects(), refetchProgress()])
    setBusy(false)
    onClose()
  }

  async function deleteZone() {
    setBusy(true); setError('')
    const newZones = project.zones.filter(z => z.id !== zone.id)
    // prune the deleted zone's tile off the site map (markers are unrelated)
    const sm = project.site_map
    const newMap = sm ? { ...sm, cells: sm.cells.filter(c => c.zone_id !== zone.id) } : undefined
    const err = await writeZones(project.id, newZones, newMap)
    if (err) { setError(err); setBusy(false); return }
    await refetchProjects()
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title={`分區設定 · ${zone.name}`}
      footer={isBuilding ? (
        <button onClick={() => void saveFloors()} disabled={busy || !changed} className="btn-primary w-full disabled:opacity-50">
          {busy ? <Spinner size={18} className="text-white" /> : `儲存樓層（${floors.length} 層，套用到 ${leaves.length} 個工序）`}
        </button>
      ) : undefined}
    >
      <div className="space-y-4">
        {isBuilding && (
          <div>
            <label className="label">樓層（由低到高，撳 × 移除）</label>
            <div className="flex flex-wrap gap-1.5">
              {floors.map(f => (
                <span key={f} className="inline-flex items-center gap-1 text-xs font-semibold bg-site-100 text-site-700 pl-2.5 pr-1 py-1 rounded-full">
                  {f}
                  <button type="button" onClick={() => setFloors(fs => fs.filter(x => x !== f))} className="w-5 h-5 grid place-items-center text-site-400 hover:text-red-600 min-h-0" aria-label={`移除 ${f}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {floors.length === 0 && <span className="text-xs text-site-400">未有樓層</span>}
            </div>
            <div className="flex gap-2 mt-2.5">
              <input className="input flex-1 min-w-0" placeholder="新樓層名（例：19/F）" value={newFloor} onChange={e => setNewFloor(e.target.value)} />
              <select className="input w-32 flex-shrink-0" value={insertAfter} onChange={e => setInsertAfter(e.target.value)}>
                <option value="__end__">加到最頂</option>
                <option value="__bottom__">加到最底</option>
                {floors.map(f => <option key={f} value={f}>喺 {f} 之後</option>)}
              </select>
              <button type="button" onClick={addFloor} disabled={!newFloor.trim()} className="btn-ghost px-3 text-xs disabled:opacity-40 flex-shrink-0">加</button>
            </div>
            <p className="text-[10px] text-site-400 mt-1.5 leading-relaxed">
              新加嘅樓層會自動加入呢個分區全部工序；移除嘅樓層會連剔格一齊刪走；工序本身冇包括嘅樓層唔會被硬加。
            </p>
          </div>
        )}

        <div className={isBuilding ? 'pt-3 border-t border-site-100' : ''}>
          {leaves.length > 0 ? (
            <p className="text-xs text-site-400">
              <Trash2 size={12} className="inline mr-1" />呢個分區有 {leaves.length} 個工序 — 要刪晒工序先可以刪分區。
            </p>
          ) : confirmDel ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-600 font-semibold">確認刪除「{zone.name}」？</span>
              <div className="flex gap-2">
                <button onClick={() => void deleteZone()} disabled={busy} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg">刪除</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-site-500 px-2">取消</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-xs text-site-400 hover:text-red-600 flex items-center gap-1 min-h-0">
              <Trash2 size={13} /> 刪除分區
            </button>
          )}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
      </div>
    </Modal>
  )
}

