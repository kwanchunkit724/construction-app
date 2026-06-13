import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Layers, Percent, ListChecks, Ruler, DoorOpen } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, TrackingMode, Zone, UnitState, CategoryDomain, CategoryStream } from '../types'
import { plannedProgressOf, CATEGORY_DOMAIN_ZH, CATEGORY_STREAM_ZH } from '../types'
import { templateFor } from '../lib/progressTemplates'

// Per-mode picker presentation. Keyed by TrackingMode so the picker can be
// rendered purely from a template's allowedModes list. percentage = today's
// orange/百分比; floors = purple/樓層; checklist = purple/清單 (it shares the
// floors storage and palette).
const MODE_META: Record<TrackingMode, { label: string; icon: typeof Percent; activeClass: string }> = {
  percentage: { label: '百分比', icon: Percent, activeClass: 'border-safety-500 bg-safety-50 text-safety-700' },
  floors: { label: '樓層', icon: Layers, activeClass: 'border-purple-500 bg-purple-50 text-purple-700' },
  checklist: { label: '清單', icon: ListChecks, activeClass: 'border-purple-500 bg-purple-50 text-purple-700' },
  // P2: 渠務 / linear work — done/total in a real unit (m / m2 / 個…). Teal so
  // it reads distinct from the purple label-modes and the orange percentage.
  quantity: { label: '數量', icon: Ruler, activeClass: 'border-teal-500 bg-teal-50 text-teal-700' },
  // P3: 大樓維修 — each 室 walks a 5-state machine. Rose so it reads distinct
  // from the purple label-modes, teal quantity, and orange percentage.
  unit_status: { label: '單位狀態', icon: DoorOpen, activeClass: 'border-rose-500 bg-rose-50 text-rose-700' },
}

// Unit suggestions for the quantity sub-form. Free text (no DB check) so trades
// can extend, but these cover the 渠務 staples — metres of pipe, area, volume,
// and counted items (manholes / gullies / connections).
const QTY_UNIT_SUGGESTIONS = ['m', 'm2', 'm3', '個', '件']

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
  // P2: quantity sub-form (渠務). qtyTotal as string so the field can be empty
  // mid-edit; parsed at submit. qtyUnit free-text with chip suggestions.
  const [qtyTotal, setQtyTotal] = useState('')
  const [qtyUnit, setQtyUnit] = useState('m')
  // P3: unit_status sub-form (大樓維修). 'grid' = the 樓×室 generator (floors ×
  // rooms-per-floor → 15/F-A..15/F-H); 'custom' = free-text labels (reuse the
  // customFloors textarea). Floors source the same auto-floor labels; the room
  // suffix letters are A.. by unitCount.
  const [unitMode, setUnitMode] = useState<'grid' | 'custom'>('grid')
  const [unitFloorCount, setUnitFloorCount] = useState(3)
  const [unitBaseFloor, setUnitBaseFloor] = useState(1)
  const [unitCount, setUnitCount] = useState(8)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // v57: 2-axis category for a root 大項.
  const [catDomain, setCatDomain] = useState<CategoryDomain | null>(null)
  const [catStream, setCatStream] = useState<CategoryStream | null>(null)
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
  // Template drives which tracking modes this project type offers and which
  // is pre-selected. 'general' (and any unknown type) resolves to today's
  // [percentage, floors, checklist] with percentage default.
  const template = templateFor(project?.project_type)
  const allowedModes = template.allowedModes
  const defaultMode = template.defaultMode
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
      // Preselect the project type's default mode (general → percentage,
      // small_works → checklist). checklist authors labels via the custom
      // textarea (工序名), so start it in 'custom' rather than the floor
      // auto-generator.
      setTrackingMode(defaultMode)
      setFloorMode(defaultMode === 'checklist' ? 'custom' : 'auto')
      setFloorCount(10)
      setBaseFloor(1)
      setCustomFloors('')
      setQtyTotal('')
      setQtyUnit('m')
      setUnitMode('grid')
      setUnitFloorCount(3)
      setUnitBaseFloor(1)
      setUnitCount(8)
      setError('')
      setSuccessMsg('')
      setSelectedZoneIds([zone.id])
      setSelectedParentIds(parent ? [parent.id] : [])
      setCodeMap({})
      setCodeError('')
    }
  }, [open, zone.id, parent, defaultMode])

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

  // P3: 樓×室 generator — for each floor (auto-floor labels) emit one label per
  // room (A.. by unitCount), e.g. floor 15F × 8 rooms → 15/F-A..15/F-H.
  const autoUnitLabels = useMemo(() => {
    const floors: string[] = []
    for (let i = 0; i < unitFloorCount; i++) {
      const n = unitBaseFloor + i
      if (n === 0) floors.push('GF')
      else if (n < 0) floors.push(`B${Math.abs(n)}`)
      else floors.push(`${n}/F`)
    }
    const rooms: string[] = []
    for (let r = 0; r < unitCount; r++) rooms.push(String.fromCharCode(65 + (r % 26)))
    const labels: string[] = []
    for (const f of floors) for (const room of rooms) labels.push(`${f}-${room}`)
    return labels
  }, [unitFloorCount, unitBaseFloor, unitCount])

  // checklist always sources labels from the free-text 工序 list; floors mode
  // honours the auto/custom sub-toggle; unit_status honours its grid/custom
  // toggle. All feed the same floor_labels store.
  const customLabels = customFloors.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  // unit_status stores its 室 labels in floor_labels too (so floorsToProgress /
  // export / history floor-chips degrade gracefully) — it is a label mode.
  const isLabelMode = trackingMode === 'floors' || trackingMode === 'checklist' || trackingMode === 'unit_status'
  const resolvedFloorLabels = trackingMode === 'checklist'
    ? customLabels
    : trackingMode === 'unit_status'
      ? (unitMode === 'grid' ? autoUnitLabels : customLabels)
      : floorMode === 'auto'
        ? autoFloorLabels
        : customLabels

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
    if (isLabelMode && resolvedFloorLabels.length === 0) {
      return setError(
        trackingMode === 'checklist'
          ? '清單模式需要至少一項工序'
          : trackingMode === 'unit_status'
            ? '單位狀態模式需要至少一個單位（室）'
            : '樓層模式需要至少一個樓層',
      )
    }
    if (trackingMode === 'quantity') {
      const t = Number(qtyTotal)
      if (!qtyTotal.trim() || !Number.isFinite(t) || t <= 0) return setError('請輸入有效的總數量（大於 0）')
      if (!qtyUnit.trim()) return setError('請輸入單位（例：m）')
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
        floor_labels: isLabelMode ? resolvedFloorLabels : [],
        qty_total: trackingMode === 'quantity' ? Number(qtyTotal) : null,
        qty_unit: trackingMode === 'quantity' ? qtyUnit.trim() : null,
        // unit_status seeds every 室 to 未處理 ('pending'); ignored for other modes.
        label_status: trackingMode === 'unit_status'
          ? Object.fromEntries(resolvedFloorLabels.map(l => [l, 'pending' as UnitState]))
          : undefined,
        // v57: 2-axis category — only on a root 大項.
        category_domain: isRootAdd ? catDomain : null,
        category_stream: isRootAdd ? catStream : null,
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

        {isRootAdd && (
          <div className="grid grid-cols-2 gap-2">
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

        {/* Tracking mode — driven by the project type's template
            (allowedModes / defaultMode). For 'general' this is
            percentage / 樓層 / 清單, byte-identical look to before. */}
        <div className="pt-2 border-t border-site-100">
          <label className="label">追蹤方式</label>
          <div className={`grid gap-2 ${allowedModes.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {allowedModes.map(m => {
              const active = trackingMode === m
              const meta = MODE_META[m]
              const Icon = meta.icon
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTrackingMode(m)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors min-h-0 ${
                    active ? meta.activeClass : 'border-site-200 text-site-500 hover:border-site-300'
                  }`}
                >
                  <Icon size={14} /> {meta.label}
                </button>
              )
            })}
          </div>

          {trackingMode === 'checklist' && (
            <div className="mt-3 bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
              <div>
                <label className="block text-xs text-site-500 mb-1">工序名（每行一項，亦可用逗號分隔）</label>
                <textarea
                  value={customFloors}
                  onChange={e => setCustomFloors(e.target.value)}
                  rows={4}
                  placeholder={'例：\n拆卸\n水電\n泥水\n木工\n油漆'}
                  className="input resize-none bg-white"
                />
              </div>
              {resolvedFloorLabels.length > 0 && (
                <div>
                  <p className="text-xs text-site-500 mb-1.5">預覽（{resolvedFloorLabels.length} 項）</p>
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

          {trackingMode === 'quantity' && (
            <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-site-500 mb-1">總數量 *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={qtyTotal}
                    onChange={e => setQtyTotal(e.target.value)}
                    placeholder="例：600"
                    className="input bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-site-500 mb-1">單位 *</label>
                  <input
                    value={qtyUnit}
                    onChange={e => setQtyUnit(e.target.value)}
                    placeholder="m"
                    className="input bg-white"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QTY_UNIT_SUGGESTIONS.map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setQtyUnit(u)}
                    className={`text-xs px-2.5 py-1 rounded-lg border min-h-0 ${
                      qtyUnit.trim() === u
                        ? 'border-teal-500 bg-white text-teal-700 font-semibold'
                        : 'border-site-200 bg-white text-site-500'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-site-500">
                以「已完成 / 總數量」自動計算百分比；更新時輸入實際數量（例：已鋪 230 {qtyUnit.trim() || 'm'}）。
              </p>
            </div>
          )}

          {trackingMode === 'unit_status' && (
            <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUnitMode('grid')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border min-h-0 ${
                    unitMode === 'grid' ? 'border-rose-500 bg-white text-rose-700' : 'border-site-200 text-site-400 bg-white'
                  }`}
                >樓×室 自動</button>
                <button
                  type="button"
                  onClick={() => setUnitMode('custom')}
                  className={`py-1.5 rounded-lg text-xs font-semibold border min-h-0 ${
                    unitMode === 'custom' ? 'border-rose-500 bg-white text-rose-700' : 'border-site-200 text-site-400 bg-white'
                  }`}
                >自訂</button>
              </div>

              {unitMode === 'grid' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-site-500 mb-1">樓層數</label>
                    <input
                      type="number" min={1} max={100} value={unitFloorCount}
                      onChange={e => setUnitFloorCount(Math.max(1, Number(e.target.value) || 1))}
                      className="input bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-site-500 mb-1">起始（負為地庫）</label>
                    <input
                      type="number" min={-20} max={100} value={unitBaseFloor}
                      onChange={e => setUnitBaseFloor(Number(e.target.value) || 1)}
                      className="input bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-site-500 mb-1">每層室數</label>
                    <input
                      type="number" min={1} max={26} value={unitCount}
                      onChange={e => setUnitCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                      className="input bg-white"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-site-500 mb-1">單位名稱（逗號或換行分隔）</label>
                  <textarea
                    value={customFloors}
                    onChange={e => setCustomFloors(e.target.value)}
                    rows={3}
                    placeholder="例：15/F-A, 15/F-B, 16/F-A, 天台"
                    className="input resize-none bg-white"
                  />
                </div>
              )}

              {resolvedFloorLabels.length > 0 && (
                <div>
                  <p className="text-xs text-site-500 mb-1.5">預覽（{resolvedFloorLabels.length} 個單位 · 全部 未處理）</p>
                  <div className="flex flex-wrap gap-1">
                    {resolvedFloorLabels.slice(0, 30).map(l => (
                      <span key={l} className="text-[10px] bg-white border border-rose-200 text-rose-600 px-1.5 py-0.5 rounded">{l}</span>
                    ))}
                    {resolvedFloorLabels.length > 30 && (
                      <span className="text-[10px] text-site-400">+{resolvedFloorLabels.length - 30}</span>
                    )}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-site-500">
                每個單位（室）由「未處理 → 維修中 → 已修復 → 待覆檢 → 已簽收」逐步更新；百分比 = 已簽收 / 總數。
              </p>
            </div>
          )}

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
