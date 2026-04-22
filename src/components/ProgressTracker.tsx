import { useState, useMemo } from 'react'
import {
  ChevronRight, ChevronDown, RefreshCw, UserPlus,
  Users, CheckCircle2, AlertTriangle, Clock, Minus,
  Filter, X, Send, Plus, Layers, Trash2,
} from 'lucide-react'
import { useAuth, DEMO_ACCOUNTS } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import type { ProgressItem } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  'not-started': 'bg-gray-100 text-gray-500',
  'in-progress':  'bg-blue-100 text-blue-700',
  'completed':    'bg-green-100 text-green-700',
  'delayed':      'bg-red-100 text-red-700',
  'blocked':      'bg-orange-100 text-orange-700',
}
const STATUS_ZH: Record<string, string> = {
  'not-started': '未開始', 'in-progress': '進行中',
  'completed': '已完成', 'delayed': '落後', 'blocked': '受阻',
}
const STATUS_ICON: Record<string, React.ElementType> = {
  'not-started': Minus, 'in-progress': Clock,
  'completed': CheckCircle2, 'delayed': AlertTriangle, 'blocked': AlertTriangle,
}
const BAR_COLOR: Record<string, string> = {
  'not-started': 'bg-gray-300', 'in-progress': 'bg-blue-500',
  'completed': 'bg-green-500', 'delayed': 'bg-red-500', 'blocked': 'bg-orange-500',
}

function ProgressBar({ value, planned, status }: { value: number; planned: number; status: string }) {
  return (
    <div className="relative h-2 bg-gray-100 rounded-full w-28 overflow-hidden">
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-gray-400 z-10"
        style={{ left: `${Math.min(planned, 100)}%` }}
      />
      <div
        className={`h-full rounded-full transition-all ${BAR_COLOR[status]}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ── Assign / Delegate modal (multi-select) ───────────────────────────────────
function AssignModal({
  item, mode, onClose,
}: {
  item: ProgressItem
  mode: 'assign' | 'delegate'
  onClose: () => void
}) {
  const { assignItem, setDelegated } = useProgress()
  const [selected, setSelected] = useState<string[]>(
    mode === 'assign' ? [...item.ownedBy] : [...item.delegatedTo]
  )

  const candidates = DEMO_ACCOUNTS.filter(a =>
    mode === 'assign'
      ? (a.role === 'pe' || a.role === 'foreman')
      : a.role === 'sub-supervisor'
  )

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const confirm = () => {
    if (mode === 'assign') assignItem(item.id, selected)
    else setDelegated(item.id, selected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">
            {mode === 'assign' ? '指派負責人' : '委派判頭打理'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-1">工序項目</p>
        <p className="text-sm font-semibold text-gray-800 mb-3 bg-gray-50 rounded-lg p-2.5">{item.code} — {item.title}</p>
        <p className="text-xs text-gray-400 mb-2">可選擇多於一人</p>
        <div className="space-y-2 mb-5">
          {candidates.map(c => {
            const checked = selected.includes(c.id)
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-blue-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="accent-blue-600 w-4 h-4 flex-shrink-0"
                />
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {c.avatar}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{c.name}</p>
                  <p className="text-gray-400 text-xs">{c.roleZh} · {c.company}</p>
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">取消</button>
          <button onClick={confirm} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-sm font-semibold">
            確認 {selected.length > 0 && `(${selected.length}人)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Update modal — handles both percentage and floors mode ───────────────────
function UpdateModal({ item, onClose }: { item: ProgressItem; onClose: () => void }) {
  const { updateProgress, updateFloors } = useProgress()
  const { user } = useAuth()

  // percentage mode state
  const [val, setVal] = useState(item.actualProgress)

  // floors mode state
  const [doneFloors, setDoneFloors] = useState<string[]>([...item.floorsCompleted])

  const [notes, setNotes] = useState(item.notes)

  const toggleFloor = (label: string) =>
    setDoneFloors(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label])

  const floorPct = item.floorLabels.length > 0
    ? Math.round((doneFloors.length / item.floorLabels.length) * 100)
    : 0

  const save = () => {
    if (item.trackingMode === 'floors') {
      updateFloors(item.id, doneFloors, notes, user?.name ?? '')
    } else {
      updateProgress(item.id, val, notes, user?.name ?? '')
    }
    onClose()
  }

  const plannedPct = item.trackingMode === 'floors' ? item.plannedProgress : item.plannedProgress
  const actualPct  = item.trackingMode === 'floors' ? floorPct : val

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">更新進度</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              item.trackingMode === 'floors' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {item.trackingMode === 'floors' ? `樓層模式 · ${item.floorLabels.length}層` : '百分比模式'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <p className="text-sm font-semibold text-gray-800 mb-4 bg-gray-50 rounded-lg p-2.5">
          {item.code} — {item.title}
        </p>

        {item.trackingMode === 'floors' ? (
          /* ── Floor checkbox grid ── */
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">選擇已完成樓層</p>
              <span className="text-lg font-black text-purple-600">
                {doneFloors.length}/{item.floorLabels.length} 層
                <span className="text-xs font-normal text-gray-400 ml-1">({floorPct}%)</span>
              </span>
            </div>

            {/* Floor grid */}
            <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
              {item.floorLabels.map(label => {
                const done = doneFloors.includes(label)
                return (
                  <button
                    key={label}
                    onClick={() => toggleFloor(label)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${
                      done
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'
                    }`}
                  >
                    {done ? '✓' : ''} {label}
                  </button>
                )
              })}
            </div>

            {floorPct < plannedPct - 5 && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                ⚠ 進度落後計劃 {plannedPct - floorPct}%，請說明原因
              </div>
            )}
          </div>
        ) : (
          /* ── Percentage slider ── */
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">實際完成進度</label>
              <span className="text-2xl font-black text-blue-600">{val}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={1} value={val}
              onChange={e => setVal(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-orange-500">計劃: {item.plannedProgress}%</span>
              <span>100%</span>
            </div>
            {val < item.plannedProgress - 5 && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                ⚠ 進度落後計劃 {item.plannedProgress - val}%，請說明原因
              </div>
            )}
          </div>
        )}

        <div className="mb-5">
          <label className="text-sm font-medium text-gray-700 mb-1 block">備注 / 說明</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={2} placeholder="請說明最新進展或影響因素..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {/* Progress summary bar */}
        <div className="mb-4 bg-gray-50 rounded-xl p-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>完成進度</span>
            <span className="font-semibold">{actualPct}% / 計劃 {plannedPct}%</span>
          </div>
          <ProgressBar value={actualPct} planned={plannedPct} status={
            actualPct === 100 ? 'completed' : actualPct < plannedPct - 5 ? 'delayed' : 'in-progress'
          } />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">取消</button>
          <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5">
            <Send size={14} /> 儲存更新
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add item modal ─────────────────────────────────────────────────────────
function AddItemModal({
  parentItem,
  allItems,
  onClose,
}: {
  parentItem: ProgressItem | null
  allItems: ProgressItem[]
  onClose: () => void
}) {
  const { addItem, currentProject } = useProgress()

  const level = parentItem ? parentItem.level + 1 : 1
  const levelLabel = level === 1 ? '大項 (分區/樓棟)' : level === 2 ? '中項' : `第${level}層細項`

  const projectZones = currentProject?.zones ?? []

  const siblings = allItems.filter(i => i.parentId === (parentItem?.id ?? null))
  const nextNum = siblings.length + 1
  const defaultCode = parentItem
    ? `${parentItem.code}-${String(nextNum).padStart(2, '0')}`
    : `Z${String(allItems.filter(i => i.level === 1).length + 1).padStart(2, '0')}`

  const [code, setCode] = useState(defaultCode)
  const [title, setTitle] = useState('')
  // For level 1, zone is chosen from project zones dropdown; inherit from parent for L2/L3
  const [zoneId, setZoneId] = useState(
    level === 1 ? (projectZones[0]?.id ?? '') : (parentItem?.zone ?? '')
  )
  const [plannedStart, setPlannedStart] = useState('2026-01-01')
  const [plannedEnd, setPlannedEnd] = useState('2026-12-31')
  const [plannedPct, setPlannedPct] = useState(0)

  // Tracking mode
  const [trackingMode, setTrackingMode] = useState<'percentage' | 'floors'>('percentage')
  const [floorCount, setFloorCount] = useState(10)
  const [floorLabelMode, setFloorLabelMode] = useState<'auto' | 'custom'>('auto')
  const [customFloors, setCustomFloors] = useState('')
  const [baseFloor, setBaseFloor] = useState(1)

  const [error, setError] = useState('')

  // Auto-fill code & title when zone selected (level 1 only)
  const selectedZone = projectZones.find(z => z.id === zoneId)

  // Generate auto floor labels
  const autoFloorLabels = useMemo(() => {
    const labels: string[] = []
    for (let i = 0; i < floorCount; i++) {
      const n = baseFloor + i
      if (n <= 0) labels.push(n === 0 ? 'GF' : `B${Math.abs(n)}`)
      else labels.push(`${n}F`)
    }
    return labels
  }, [floorCount, baseFloor])

  const resolvedFloorLabels = floorLabelMode === 'auto'
    ? autoFloorLabels
    : customFloors.split(/[,\n]/).map(s => s.trim()).filter(Boolean)

  const save = () => {
    if (!code.trim()) { setError('請輸入編號'); return }
    if (!title.trim()) { setError('請輸入名稱'); return }
    if (level === 1 && !zoneId) { setError('請選擇所屬分區/樓棟'); return }
    if (trackingMode === 'floors' && resolvedFloorLabels.length === 0) {
      setError('請設定樓層'); return
    }
    const resolvedZone = level === 1
      ? (selectedZone ? `${selectedZone.id} — ${selectedZone.name}` : zoneId)
      : (parentItem?.zone ?? zoneId)
    addItem({
      code: code.trim(),
      title: title.trim(),
      zone: resolvedZone,
      projectId: parentItem?.projectId ?? '',
      parentId: parentItem?.id ?? null,
      level,
      plannedStart,
      plannedEnd,
      plannedProgress: plannedPct,
      actualProgress: 0,
      status: 'not-started',
      ownedBy: [],
      delegatedTo: [],
      notes: '',
      lastUpdatedBy: '',
      lastUpdatedAt: new Date().toISOString(),
      trackingMode,
      floorLabels: trackingMode === 'floors' ? resolvedFloorLabels : [],
      floorsCompleted: [],
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">加入新項目</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              類型：<span className="font-semibold text-blue-600">{levelLabel}</span>
              {parentItem && <span> · 上級：{parentItem.code} {parentItem.title}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* Zone selector — only for level 1 (大項) */}
          {level === 1 && (
            <div>
              <label className="block text-xs font-semibold text-site-600 mb-1">
                所屬分區 / 樓棟 *
              </label>
              {projectZones.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {projectZones.map(z => {
                    const ZONE_ICON: Record<string, string> = {
                      tower: '🏢', podium: '🏗', basement: '⬇', carpark: '🅿', external: '🌿'
                    }
                    const active = zoneId === z.id
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => setZoneId(z.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                          active
                            ? 'border-safety-500 bg-safety-50'
                            : 'border-site-200 hover:border-site-300 bg-white'
                        }`}
                      >
                        <span className="text-lg flex-shrink-0">{ZONE_ICON[z.type] ?? '📍'}</span>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${active ? 'text-safety-700' : 'text-site-800'}`}>{z.name}</p>
                          <p className="text-[10px] text-site-400 font-mono">{z.id}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  ⚠ 此項目尚未定義分區，請先在「項目管理」中設定分區。
                </p>
              )}
            </div>
          )}

          {/* Code */}
          <div>
            <label className="block text-xs font-semibold text-site-600 mb-1">編號 *</label>
            <input
              value={code} onChange={e => setCode(e.target.value)}
              className="w-full border border-site-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-safety-400 focus:ring-2 focus:ring-safety-100"
              placeholder="例：ZA-01"
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">工序名稱 *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
              placeholder="例：混凝土澆灌工程"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">計劃開始</label>
              <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">計劃完成</label>
              <input type="date" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          {/* Planned % */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600">當前計劃進度</label>
              <span className="text-sm font-bold text-blue-600">{plannedPct}%</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={plannedPct}
              onChange={e => setPlannedPct(Number(e.target.value))}
              className="w-full accent-blue-600" />
          </div>

          {/* ── Tracking mode selector ── */}
          <div className="pt-1 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 mb-2">追蹤方式</label>
            <div className="grid grid-cols-2 gap-2">
              {(['percentage', 'floors'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTrackingMode(m)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    trackingMode === m
                      ? m === 'floors' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {m === 'floors' ? <><Layers size={14} /> 樓層</> : <>% 百分比</>}
                </button>
              ))}
            </div>
          </div>

          {/* ── Floor config (only shown when floors mode) ── */}
          {trackingMode === 'floors' && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
              {/* Label mode */}
              <div className="flex gap-2">
                {(['auto', 'custom'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setFloorLabelMode(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      floorLabelMode === m ? 'border-purple-500 bg-white text-purple-700' : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'
                    }`}
                  >
                    {m === 'auto' ? '自動生成' : '自訂名稱'}
                  </button>
                ))}
              </div>

              {floorLabelMode === 'auto' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">樓層數目</label>
                    <input
                      type="number" min={1} max={100} value={floorCount}
                      onChange={e => setFloorCount(Math.max(1, Number(e.target.value)))}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">起始樓層號 (負數=地庫)</label>
                    <input
                      type="number" min={-20} max={100} value={baseFloor}
                      onChange={e => setBaseFloor(Number(e.target.value))}
                      className="w-full border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">輸入樓層名稱（以逗號或換行分隔）</label>
                  <textarea
                    value={customFloors}
                    onChange={e => setCustomFloors(e.target.value)}
                    rows={3}
                    placeholder="例：B2, B1, GF, 1F, 2F, 3F"
                    className="w-full border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none"
                  />
                </div>
              )}

              {/* Preview */}
              {resolvedFloorLabels.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">預覽 ({resolvedFloorLabels.length} 層)</p>
                  <div className="flex flex-wrap gap-1">
                    {resolvedFloorLabels.slice(0, 20).map(l => (
                      <span key={l} className="text-[10px] bg-white border border-purple-200 text-purple-600 px-1.5 py-0.5 rounded">{l}</span>
                    ))}
                    {resolvedFloorLabels.length > 20 && (
                      <span className="text-[10px] text-gray-400">+{resolvedFloorLabels.length - 20} 層</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">取消</button>
          <button onClick={save} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5">
            <Plus size={14} /> 加入項目
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Single tree row ──────────────────────────────────────────────────────────
function ProgressRow({
  item, allItems, expanded, onToggle,
  onUpdate, onAssign, onDelegate, onAddChild, onDelete,
  canUpdate, canAssign, canDelegate, canAdd, canDelete,
}: {
  item: ProgressItem
  allItems: ProgressItem[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (item: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onDelegate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
  canUpdate: (i: ProgressItem) => boolean
  canAssign: boolean
  canDelegate: boolean
  canAdd: boolean
  canDelete: boolean
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const children = allItems.filter(i => i.parentId === item.id)
  const isOpen = expanded.has(item.id)

  const ownerNames = DEMO_ACCOUNTS.filter(a => item.ownedBy.includes(a.id)).map(a => a.name)
  const delegateeNames = DEMO_ACCOUNTS.filter(a => item.delegatedTo.includes(a.id)).map(a => a.name)

  const StatusIcon = STATUS_ICON[item.status] ?? Minus
  const diff = item.actualProgress - item.plannedProgress

  const indentPx = (item.level - 1) * 20
  const rowBg = item.level === 1 ? 'bg-gray-50 font-semibold' : 'bg-white'
  const textSize = item.level === 1 ? 'text-sm' : 'text-xs'

  // Floor mode display
  const isFloors = item.trackingMode === 'floors' && item.floorLabels.length > 0
  const floorDone = item.floorsCompleted.length
  const floorTotal = item.floorLabels.length

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors group ${rowBg}`}>
        {/* Code + toggle */}
        <td className="py-2.5 pr-2" style={{ paddingLeft: `${indentPx}px` }}>
          <div className="flex items-center gap-1">
            {children.length > 0 ? (
              <button onClick={() => onToggle(item.id)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-[14px] flex-shrink-0" />
            )}
            <span className={`font-mono ${textSize} text-gray-500 whitespace-nowrap`}>{item.code}</span>
          </div>
        </td>

        {/* Title */}
        <td className={`py-2.5 pr-3 ${textSize} text-gray-800 max-w-[200px]`}>
          <div className="flex items-center gap-1.5">
            <p className="truncate">{item.title}</p>
            {isFloors && (
              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded">
                <Layers size={8} />{floorDone}/{floorTotal}層
              </span>
            )}
          </div>
          {item.notes && <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.notes}</p>}
        </td>

        {/* Progress */}
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-2">
            <ProgressBar value={item.actualProgress} planned={item.plannedProgress} status={item.status} />
            <span className={`text-xs font-bold w-8 text-right ${item.status === 'delayed' ? 'text-red-600' : 'text-gray-700'}`}>
              {item.actualProgress}%
            </span>
          </div>
        </td>

        {/* Δ vs plan */}
        <td className="py-2.5 pr-3 text-xs text-right whitespace-nowrap">
          <span className={`font-semibold ${diff < -5 ? 'text-red-500' : diff >= 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {diff >= 0 ? '+' : ''}{diff}%
          </span>
        </td>

        {/* Status */}
        <td className="py-2.5 pr-3">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[item.status]}`}>
            <StatusIcon size={10} />
            {STATUS_ZH[item.status]}
          </span>
        </td>

        {/* Assignees */}
        <td className="py-2.5 pr-3 max-w-[130px]">
          <div className="text-[10px] text-gray-500 space-y-0.5">
            {ownerNames.map(n => (
              <span key={n} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded mr-1">
                <Users size={9} />{n}
              </span>
            ))}
            {delegateeNames.map(n => (
              <span key={n} className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded mr-1">
                <UserPlus size={9} />{n}
              </span>
            ))}
          </div>
        </td>

        {/* Actions */}
        <td className="py-2.5">
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
            {canUpdate(item) && (
              <button
                onClick={() => onUpdate(item)}
                className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg whitespace-nowrap"
              >
                更新
              </button>
            )}
            {canAssign && (
              <button
                onClick={() => onAssign(item)}
                className="text-[10px] bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded-lg whitespace-nowrap"
              >
                指派
              </button>
            )}
            {canDelegate && item.level > 1 && (
              <button
                onClick={() => onDelegate(item)}
                className="text-[10px] bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded-lg whitespace-nowrap"
              >
                委派
              </button>
            )}
            {canAdd && (
              <button
                onClick={() => onAddChild(item)}
                className="text-[10px] bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg whitespace-nowrap flex items-center gap-0.5"
              >
                <Plus size={9} />細項
              </button>
            )}
            {canDelete && !confirmDel && (
              <button
                onClick={() => setConfirmDel(true)}
                className="text-[10px] bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 px-2 py-1 rounded-lg whitespace-nowrap flex items-center gap-0.5"
              >
                <Trash2 size={9} />刪除
              </button>
            )}
            {canDelete && confirmDel && (
              <span className="flex items-center gap-1">
                <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">確認刪除?</span>
                <button
                  onClick={() => onDelete(item)}
                  className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg whitespace-nowrap"
                >
                  確認
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="text-[10px] border border-gray-200 text-gray-500 px-2 py-1 rounded-lg whitespace-nowrap hover:bg-gray-50"
                >
                  取消
                </button>
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Children */}
      {isOpen && children.map(child => (
        <ProgressRow
          key={child.id}
          item={child}
          allItems={allItems}
          expanded={expanded}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onAssign={onAssign}
          onDelegate={onDelegate}
          onAddChild={onAddChild}
          onDelete={onDelete}
          canUpdate={canUpdate}
          canAssign={canAssign}
          canDelegate={canDelegate}
          canAdd={canAdd}
          canDelete={canDelete}
        />
      ))}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProgressTracker() {
  const { user } = useAuth()
  const { items, deleteItem } = useProgress()

  const role = user?.role
  const userId = user?.id ?? ''

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(items.filter(i => i.level === 1).map(i => i.id))
  )
  const [filterZone, setFilterZone] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showMyItems, setShowMyItems] = useState(false)
  const [updating, setUpdating] = useState<ProgressItem | null>(null)
  const [assigning, setAssigning] = useState<ProgressItem | null>(null)
  const [delegating, setDelegating] = useState<ProgressItem | null>(null)
  const [addingParent, setAddingParent] = useState<ProgressItem | null | undefined>(undefined)

  const canAdd    = role === 'pm'
  const canDelete = role === 'pm'

  const visibleRoots = useMemo(() => {
    const rootItems = items.filter(i => i.parentId === null)
    if (role === 'pm' || role === 'cp') return rootItems
    if (role === 'pe' || role === 'foreman') {
      return rootItems.filter(root => {
        const desc = getAllDescendants(root.id, items)
        return desc.some(d => d.ownedBy.includes(userId)) || root.ownedBy.includes(userId)
      })
    }
    if (role === 'sub-supervisor') {
      return rootItems.filter(root => {
        const desc = getAllDescendants(root.id, items)
        return desc.some(d => d.delegatedTo.includes(userId))
      })
    }
    return rootItems
  }, [items, role, userId])

  const filteredRoots = visibleRoots.filter(r => {
    if (filterZone !== 'all' && r.zone !== filterZone) return false
    if (filterStatus !== 'all') {
      const desc = getAllDescendants(r.id, items)
      if (r.status !== filterStatus && !desc.some(d => d.status === filterStatus)) return false
    }
    if (showMyItems) {
      const desc = getAllDescendants(r.id, items)
      const mine = (item: ProgressItem) => item.ownedBy.includes(userId) || item.delegatedTo.includes(userId)
      if (!mine(r) && !desc.some(mine)) return false
    }
    return true
  })

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const itemCanUpdate = (item: ProgressItem) => {
    if (role === 'pm') return true
    if ((role === 'pe' || role === 'foreman') && item.ownedBy.includes(userId)) return true
    if (role === 'sub-supervisor' && (item.delegatedTo.includes(userId) || item.ownedBy.includes(userId))) return true
    return false
  }

  const allVisible = [
    ...filteredRoots,
    ...filteredRoots.flatMap(r => getAllDescendants(r.id, items)),
  ]
  const leaves      = allVisible.filter(i => !items.some(x => x.parentId === i.id))
  const completed   = leaves.filter(i => i.status === 'completed').length
  const delayed     = leaves.filter(i => i.status === 'delayed').length
  const inProg      = leaves.filter(i => i.status === 'in-progress').length
  const notStarted  = leaves.filter(i => i.status === 'not-started').length
  const zones       = [...new Set(items.filter(i => i.parentId === null).map(i => i.zone))]

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: '已完成',   count: completed,  color: 'bg-green-50 text-green-700 border-green-200' },
          { label: '進行中',   count: inProg,      color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: '進度落後', count: delayed,     color: 'bg-red-50 text-red-700 border-red-200' },
          { label: '未開始',   count: notStarted,  color: 'bg-gray-50 text-gray-600 border-gray-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
            <p className="text-2xl font-black">{s.count}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + add */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Filter size={14} className="text-gray-400" />
        <select value={filterZone} onChange={e => setFilterZone(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="all">全部區域</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="all">全部狀態</option>
          {Object.entries(STATUS_ZH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {role !== 'pm' && role !== 'cp' && (
          <button
            onClick={() => setShowMyItems(prev => !prev)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${
              showMyItems ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-300'
            }`}
          >
            {showMyItems ? '✓ 只看我的' : '只看我的'}
          </button>
        )}
        <button
          onClick={() => setExpanded(new Set(items.filter(i => i.level === 1).map(i => i.id)))}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw size={12} /> 重置展開
        </button>
        {canAdd && (
          <button
            onClick={() => setAddingParent(null)}
            className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            <Plus size={13} /> 加入大項
          </button>
        )}
      </div>

      {/* Tree table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="text-left text-[10px] text-gray-400 border-b-2 border-gray-200 uppercase tracking-wider">
              <th className="pb-2 pr-2 font-medium w-28">編號</th>
              <th className="pb-2 pr-3 font-medium">工序名稱</th>
              <th className="pb-2 pr-3 font-medium w-44">進度</th>
              <th className="pb-2 pr-3 font-medium w-14 text-right">偏差</th>
              <th className="pb-2 pr-3 font-medium w-20">狀態</th>
              <th className="pb-2 pr-3 font-medium w-36">負責人</th>
              <th className="pb-2 font-medium w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoots.map(root => (
              <ProgressRow
                key={root.id}
                item={root}
                allItems={items}
                expanded={expanded}
                onToggle={toggle}
                onUpdate={setUpdating}
                onAssign={setAssigning}
                onDelegate={setDelegating}
                onAddChild={setAddingParent}
                onDelete={item => deleteItem(item.id)}
                canUpdate={itemCanUpdate}
                canAssign={role === 'pm'}
                canDelegate={role === 'pe' || role === 'foreman'}
                canAdd={canAdd}
                canDelete={canDelete}
              />
            ))}
          </tbody>
        </table>
        {filteredRoots.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            沒有符合條件的工序項目
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-400">
        <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-gray-400 inline-block"/> 計劃進度標記</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-2 bg-blue-100 rounded inline-block"/> <Users size={10}/> 負責人</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-2 bg-amber-100 rounded inline-block"/> <UserPlus size={10}/> 委派判頭</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-2 bg-purple-100 rounded inline-block"/> <Layers size={10}/> 樓層模式</div>
      </div>

      {/* Modals */}
      {updating   && <UpdateModal item={updating} onClose={() => setUpdating(null)} />}
      {assigning  && <AssignModal item={assigning} mode="assign" onClose={() => setAssigning(null)} />}
      {delegating && <AssignModal item={delegating} mode="delegate" onClose={() => setDelegating(null)} />}
      {addingParent !== undefined && (
        <AddItemModal
          parentItem={addingParent}
          allItems={items}
          onClose={() => setAddingParent(undefined)}
        />
      )}
    </div>
  )
}

// ── Util ──────────────────────────────────────────────────────────────────────
function getAllDescendants(parentId: string, items: ProgressItem[]): ProgressItem[] {
  const children = items.filter(i => i.parentId === parentId)
  return children.flatMap(c => [c, ...getAllDescendants(c.id, items)])
}
