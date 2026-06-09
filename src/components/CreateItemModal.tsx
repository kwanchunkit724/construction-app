import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Layers, Percent } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, TrackingMode, Zone } from '../types'
import { plannedProgressOf } from '../types'

export function CreateItemModal({
  open, onClose, parent, zone,
}: {
  open: boolean
  onClose: () => void
  parent: ProgressItem | null
  zone: Zone
}) {
  const { addItem, items } = useProgress()
  const { projects } = useProjects()
  const [title, setTitle] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  // Planned progress is NOT entered by hand — it is derived from the schedule
  // (planned_start → planned_end vs today). This is the "where we should be" %.
  const plannedPreview = useMemo(
    () => plannedProgressOf({ planned_start: plannedStart || null, planned_end: plannedEnd || null }),
    [plannedStart, plannedEnd],
  )
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('percentage')
  const [floorMode, setFloorMode] = useState<'auto' | 'custom'>('auto')
  const [floorCount, setFloorCount] = useState(10)
  const [baseFloor, setBaseFloor] = useState(1)
  const [customFloors, setCustomFloors] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Multi-zone selection (root-level adds only)
  const isRootAdd = parent === null
  // Prefer the parent's project_id when we have one — zone.id ("A"/"B"/
  // "1") can be ambiguous across projects and projects.find then picks the
  // wrong one, breaking next_progress_code with "parent item not found".
  const project = parent
    ? projects.find(p => p.id === parent.project_id)
    : projects.find(p => p.zones.some(z => z.id === zone.id))
  const projectId = project?.id ?? ''
  const allZones: Zone[] = project?.zones ?? [zone]
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([zone.id])

  // When the user is adding a 細項 under a first-level parent, we expose a
  // "同時加入其他分區嘅同名大項" picker so they don't have to repeat the
  // same child add across the 4 座 of a building. We match peers by title
  // because zone-prefixed codes (土瓜灣=01 vs 九龍城=01) are independent
  // per-zone counters and won't line up.
  const isFirstLevelChildAdd = parent !== null && parent.parent_id === null
  const peerParents = useMemo<ProgressItem[]>(() => {
    if (!isFirstLevelChildAdd || !parent) return []
    return items
      .filter(i =>
        i.parent_id === null
        && i.title === parent.title
        && i.id !== parent.id,
      )
      .sort((a, b) => (a.zone_id ?? '').localeCompare(b.zone_id ?? ''))
  }, [isFirstLevelChildAdd, parent, items])

  // The parent itself is always pre-selected; the picker only appears if
  // at least one peer was found.
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>(parent ? [parent.id] : [])

  // Auto-code per zone (root adds keyed by zone_id, child adds keyed by
  // peer parent_id — both maps live here under their respective keys).
  const [codeMap, setCodeMap] = useState<Record<string, string>>({})
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setPlannedStart('')
      setPlannedEnd('')
      setTrackingMode('percentage')
      setFloorMode('auto')
      setFloorCount(10)
      setBaseFloor(1)
      setCustomFloors('')
      setError('')
      setSuccessMsg('')
      setSelectedZoneIds([zone.id])
      setSelectedParentIds(parent ? [parent.id] : [])
      setCodeMap({})
      setCodeError('')
    }
  }, [open, zone.id, parent])

  // Build the list of (zone_id, parent_id) pairs we'll insert into. Root
  // adds fan out across selected zones with parent_id=null. Peer-parent
  // adds fan out across the selected first-level peers, each carrying its
  // own zone_id and parent_id. Single-child adds collapse to one target.
  type InsertTarget = { key: string; zoneId: string; parentId: string | null }
  const insertTargets = useMemo<InsertTarget[]>(() => {
    if (isRootAdd) {
      return selectedZoneIds.map(zid => ({ key: zid, zoneId: zid, parentId: null }))
    }
    if (isFirstLevelChildAdd && peerParents.length > 0) {
      const all = parent ? [parent, ...peerParents] : peerParents
      return selectedParentIds
        .map(pid => all.find(p => p.id === pid))
        .filter((p): p is ProgressItem => Boolean(p))
        .map(p => ({ key: p.id, zoneId: p.zone_id ?? zone.id, parentId: p.id }))
    }
    return parent
      ? [{ key: parent.id, zoneId: zone.id, parentId: parent.id }]
      : []
  }, [isRootAdd, isFirstLevelChildAdd, peerParents, parent, selectedZoneIds, selectedParentIds, zone.id])

  // Fetch auto-codes whenever the targets change.
  useEffect(() => {
    if (!open) return
    if (!projectId) return
    if (insertTargets.length === 0) {
      setCodeMap({})
      return
    }
    let cancelled = false
    setCodeLoading(true)
    setCodeError('')
    ;(async () => {
      try {
        const results = await Promise.all(
          insertTargets.map(async t => {
            const { data, error } = await supabase.rpc('next_progress_code', {
              p_project_id: projectId,
              p_zone_id: t.zoneId,
              p_parent_id: t.parentId,
            })
            if (error) throw error
            return [t.key, (data as string) ?? ''] as const
          })
        )
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const [k, code] of results) next[k] = code
        setCodeMap(next)
      } catch (err: any) {
        if (cancelled) return
        console.error('next_progress_code error:', err)
        setCodeError(err?.message ?? '無法取得自動編號')
        setCodeMap({})
      } finally {
        if (!cancelled) setCodeLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, projectId, insertTargets])

  const level = parent ? parent.level + 1 : 1
  const levelLabel = level === 1 ? '大項' : level === 2 ? '中項' : `第 ${level} 層細項`

  const autoFloorLabels = useMemo(() => {
    const labels: string[] = []
    for (let i = 0; i < floorCount; i++) {
      const n = baseFloor + i
      if (n === 0) labels.push('GF')
      else if (n < 0) labels.push(`B${Math.abs(n)}`)
      else labels.push(`${n}F`)
    }
    return labels
  }, [floorCount, baseFloor])

  const resolvedFloorLabels = floorMode === 'auto'
    ? autoFloorLabels
    : customFloors.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)

  function toggleZone(zid: string) {
    setSelectedZoneIds(prev => prev.includes(zid) ? prev.filter(x => x !== zid) : [...prev, zid])
  }

  function toggleSelectAll() {
    if (selectedZoneIds.length === allZones.length) setSelectedZoneIds([])
    else setSelectedZoneIds(allZones.map(z => z.id))
  }

  function togglePeerParent(pid: string) {
    setSelectedParentIds(prev =>
      prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid],
    )
  }

  function togglePeerSelectAll() {
    const all = parent ? [parent.id, ...peerParents.map(p => p.id)] : []
    if (selectedParentIds.length === all.length) setSelectedParentIds(parent ? [parent.id] : [])
    else setSelectedParentIds(all)
  }

  function zoneName(zid: string): string {
    return allZones.find(z => z.id === zid)?.name ?? zid
  }

  const codeDisplay = (() => {
    if (codeLoading) return '載入中…'
    if (codeError) return `錯誤：${codeError}`
    if (insertTargets.length === 0) return '—'
    if (insertTargets.length === 1) {
      const t = insertTargets[0]
      return codeMap[t.key] ?? '—'
    }
    return insertTargets
      .map(t => `${zoneName(t.zoneId)}=${codeMap[t.key] ?? '?'}`)
      .join('、')
  })()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!title.trim()) return setError('請輸入名稱')
    if (trackingMode === 'floors' && resolvedFloorLabels.length === 0) {
      return setError('樓層模式需要至少一個樓層')
    }

    if (insertTargets.length === 0) {
      return setError(isRootAdd ? '請至少選擇一個分區' : '請至少選擇一個目標項目')
    }

    // Validate every required code is available
    const missing = insertTargets.filter(t => !codeMap[t.key])
    if (missing.length > 0) return setError('自動編號尚未準備好，請稍候')

    if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
      return setError('計劃完成日期不可早於開始日期')
    }

    setSubmitting(true)

    const results = await Promise.all(
      insertTargets.map(t => addItem({
        parent_id: t.parentId,
        code: codeMap[t.key],
        title,
        zone_id: t.zoneId,
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        planned_progress: plannedPreview,
        tracking_mode: trackingMode,
        floor_labels: trackingMode === 'floors' ? resolvedFloorLabels : [],
      }))
    )

    setSubmitting(false)

    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      setError(failed[0].error ?? '新增失敗')
      return
    }

    if (insertTargets.length > 1) {
      setSuccessMsg(`已新增到 ${insertTargets.length} 個位置`)
      setTimeout(() => onClose(), 1200)
    } else {
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`加入 ${levelLabel}`}
      footer={
        <button onClick={onSubmit} disabled={submitting || codeLoading} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '建立'}
        </button>
      }
    >
      <div className="text-xs text-site-500 mb-3 bg-site-100 rounded-lg p-2.5 space-y-1">
        {!isRootAdd && (
          <div>分區：<span className="font-semibold text-site-700"><span className="font-mono">{zone.id}</span> {zone.name}</span></div>
        )}
        {parent && (
          <div>上級：<span className="font-mono">{parent.code}</span> {parent.title}</div>
        )}
        <div>
          編號（自動）：<span className="font-mono font-semibold text-site-700">{codeDisplay}</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {isRootAdd && allZones.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">套用到分區 *</label>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-safety-600 hover:text-safety-700 min-h-0"
              >
                {selectedZoneIds.length === allZones.length ? '全部取消' : '全選'}
              </button>
            </div>
            <div className="space-y-1.5 bg-site-50 border border-site-200 rounded-xl p-2.5 max-h-56 overflow-y-auto">
              {allZones.map(z => {
                const checked = selectedZoneIds.includes(z.id)
                return (
                  <label
                    key={z.id}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer min-h-[44px] ${
                      checked ? 'bg-white border border-safety-300' : 'border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleZone(z.id)}
                      className="accent-safety-600 h-4 w-4"
                    />
                    <span className="font-mono text-xs text-site-500">{z.id}</span>
                    <span className="text-sm text-site-800 truncate flex-1">{z.name}</span>
                  </label>
                )
              })}
            </div>
            {selectedZoneIds.length === 0 && (
              <p className="text-xs text-red-600 mt-1.5">請至少選擇一個分區</p>
            )}
          </div>
        )}

        {isFirstLevelChildAdd && peerParents.length > 0 && parent && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">同時加入其他分區嘅同名大項</label>
              <button
                type="button"
                onClick={togglePeerSelectAll}
                className="text-xs font-semibold text-safety-600 hover:text-safety-700 min-h-0"
              >
                {selectedParentIds.length === peerParents.length + 1 ? '全部取消' : '全選'}
              </button>
            </div>
            <p className="text-[11px] text-site-500 mb-1.5">
              偵測到其他分區有同名嘅大項「{parent.title}」。揀埋以下分區，會自動將
              呢個細項加去同一個大項下面，編號獨立計算。
            </p>
            <div className="space-y-1.5 bg-site-50 border border-site-200 rounded-xl p-2.5 max-h-56 overflow-y-auto">
              {[parent, ...peerParents].map(p => {
                const checked = selectedParentIds.includes(p.id)
                const zName = allZones.find(z => z.id === p.zone_id)?.name ?? p.zone_id ?? '—'
                const isSourceZone = p.id === parent.id
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer min-h-[44px] ${
                      checked ? 'bg-white border border-safety-300' : 'border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePeerParent(p.id)}
                      className="accent-safety-600 h-4 w-4"
                    />
                    <span className="font-mono text-xs text-site-500">{p.zone_id ?? '—'}</span>
                    <span className="text-sm text-site-800 truncate flex-1">{zName}</span>
                    <span className="font-mono text-[11px] text-site-400">{p.code}</span>
                    {isSourceZone && (
                      <span className="text-[10px] bg-safety-100 text-safety-700 px-1.5 py-0.5 rounded-full font-medium">當前</span>
                    )}
                  </label>
                )
              })}
            </div>
            {selectedParentIds.length === 0 && (
              <p className="text-xs text-red-600 mt-1.5">請至少選擇一個目標項目</p>
            )}
          </div>
        )}

        <div>
          <label className="label">名稱 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例：地基工程"
            className="input"
          />
        </div>

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

        <div className="rounded-xl bg-site-50 border border-site-100 p-3">
          <div className="flex items-center justify-between">
            <span className="label mb-0">計劃進度（自動）</span>
            <span className="text-base font-bold text-safety-600">
              {plannedStart && plannedEnd ? `${plannedPreview}%` : '未排期'}
            </span>
          </div>
          <p className="text-xs text-site-400 mt-1">
            依「計劃開始 → 計劃完成」與今日自動計算，無需手動輸入。
          </p>
        </div>

        {/* Tracking mode */}
        <div className="pt-2 border-t border-site-100">
          <label className="label">追蹤方式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTrackingMode('percentage')}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors min-h-0 ${
                trackingMode === 'percentage'
                  ? 'border-safety-500 bg-safety-50 text-safety-700'
                  : 'border-site-200 text-site-500 hover:border-site-300'
              }`}
            >
              <Percent size={14} /> 百分比
            </button>
            <button
              type="button"
              onClick={() => setTrackingMode('floors')}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors min-h-0 ${
                trackingMode === 'floors'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-site-200 text-site-500 hover:border-site-300'
              }`}
            >
              <Layers size={14} /> 樓層
            </button>
          </div>

          {trackingMode === 'floors' && (
            <div className="mt-3 bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFloorMode('auto')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border min-h-0 ${
                    floorMode === 'auto' ? 'border-purple-500 bg-white text-purple-700' : 'border-site-200 text-site-400 bg-white'
                  }`}
                >自動生成</button>
                <button
                  type="button"
                  onClick={() => setFloorMode('custom')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border min-h-0 ${
                    floorMode === 'custom' ? 'border-purple-500 bg-white text-purple-700' : 'border-site-200 text-site-400 bg-white'
                  }`}
                >自訂</button>
              </div>

              {floorMode === 'auto' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-site-500 mb-1">樓層數</label>
                    <input
                      type="number" min={1} max={100} value={floorCount}
                      onChange={e => setFloorCount(Math.max(1, Number(e.target.value) || 1))}
                      className="input bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-site-500 mb-1">起始（負為地庫）</label>
                    <input
                      type="number" min={-20} max={100} value={baseFloor}
                      onChange={e => setBaseFloor(Number(e.target.value) || 1)}
                      className="input bg-white"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-site-500 mb-1">樓層名稱（逗號或換行分隔）</label>
                  <textarea
                    value={customFloors}
                    onChange={e => setCustomFloors(e.target.value)}
                    rows={3}
                    placeholder="例：B2, B1, GF, 1F, 2F, 3F"
                    className="input resize-none bg-white"
                  />
                </div>
              )}

              {resolvedFloorLabels.length > 0 && (
                <div>
                  <p className="text-xs text-site-500 mb-1.5">預覽（{resolvedFloorLabels.length} 層）</p>
                  <div className="flex flex-wrap gap-1">
                    {resolvedFloorLabels.slice(0, 30).map(l => (
                      <span key={l} className="text-[10px] bg-white border border-purple-200 text-purple-600 px-1.5 py-0.5 rounded">{l}</span>
                    ))}
                    {resolvedFloorLabels.length > 30 && (
                      <span className="text-[10px] text-site-400">+{resolvedFloorLabels.length - 30}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            ✓ {successMsg}
          </div>
        )}
      </form>
    </Modal>
  )
}
