import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Layers, Percent } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, TrackingMode, Zone } from '../types'

export function CreateItemModal({
  open, onClose, parent, zone,
}: {
  open: boolean
  onClose: () => void
  parent: ProgressItem | null
  zone: Zone
}) {
  const { addItem } = useProgress()
  const { projects } = useProjects()
  const [title, setTitle] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [plannedProgress, setPlannedProgress] = useState(0)
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
  const project = projects.find(p => p.zones.some(z => z.id === zone.id))
  const projectId = project?.id ?? ''
  const allZones: Zone[] = project?.zones ?? [zone]
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([zone.id])

  // Auto-code per zone
  const [codeMap, setCodeMap] = useState<Record<string, string>>({})
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setPlannedStart('')
      setPlannedEnd('')
      setPlannedProgress(0)
      setTrackingMode('percentage')
      setFloorMode('auto')
      setFloorCount(10)
      setBaseFloor(1)
      setCustomFloors('')
      setError('')
      setSuccessMsg('')
      setSelectedZoneIds([zone.id])
      setCodeMap({})
      setCodeError('')
    }
  }, [open, zone.id])

  // Fetch auto-codes whenever the relevant inputs change
  useEffect(() => {
    if (!open) return
    if (!projectId) return
    const zoneIdsToFetch = isRootAdd ? selectedZoneIds : [zone.id]
    if (zoneIdsToFetch.length === 0) {
      setCodeMap({})
      return
    }
    let cancelled = false
    setCodeLoading(true)
    setCodeError('')
    ;(async () => {
      try {
        const results = await Promise.all(
          zoneIdsToFetch.map(async zid => {
            const { data, error } = await supabase.rpc('next_progress_code', {
              p_project_id: projectId,
              p_zone_id: zid,
              p_parent_id: parent?.id ?? null,
            })
            if (error) throw error
            return [zid, (data as string) ?? ''] as const
          })
        )
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const [zid, code] of results) next[zid] = code
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
  }, [open, projectId, isRootAdd, selectedZoneIds, parent?.id, zone.id])

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

  function zoneName(zid: string): string {
    return allZones.find(z => z.id === zid)?.name ?? zid
  }

  const codeDisplay = (() => {
    if (codeLoading) return '載入中…'
    if (codeError) return `錯誤：${codeError}`
    if (isRootAdd) {
      if (selectedZoneIds.length === 0) return '—'
      return selectedZoneIds
        .map(zid => `${zoneName(zid)}=${codeMap[zid] ?? '?'}`)
        .join('、')
    }
    return codeMap[zone.id] ?? '—'
  })()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    if (!title.trim()) return setError('請輸入名稱')
    if (trackingMode === 'floors' && resolvedFloorLabels.length === 0) {
      return setError('樓層模式需要至少一個樓層')
    }

    const zoneIds = isRootAdd ? selectedZoneIds : [zone.id]
    if (isRootAdd && zoneIds.length === 0) return setError('請至少選擇一個分區')

    // Validate every required code is available
    const missing = zoneIds.filter(zid => !codeMap[zid])
    if (missing.length > 0) return setError('自動編號尚未準備好，請稍候')

    setSubmitting(true)

    const results = await Promise.all(
      zoneIds.map(zid => addItem({
        parent_id: parent?.id ?? null,
        code: codeMap[zid],
        title,
        zone_id: zid,
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        planned_progress: plannedProgress,
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

    if (isRootAdd && zoneIds.length > 1) {
      setSuccessMsg(`已新增到 ${zoneIds.length} 個分區`)
      // Brief delay so user sees the toast, then close
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
