import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, ChevronDown, Plus, Trash2, Edit3, MoreVertical,
  CheckCircle2, AlertTriangle, Clock, Minus,
  Layers, Users, UserPlus, History, Image as ImageIcon,
} from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { DrawingsContext } from '../contexts/DrawingsContext'
import { DrawingsSection } from './drawings/DrawingsSection'
import { MaterialItemsPanel } from './material/MaterialItemsPanel'
import { PROGRESS_STATUS_ZH, computeRollup, getDescendantLeaves, plannedProgressOf, deriveStatus, isScheduled } from '../types'
import type { ProgressItem, ProgressStatus, UserProfile } from '../types'
import { supabase } from '../lib/supabase'
import { useProjects } from '../contexts/ProjectsContext'

// useDrawingsOptional — null when no DrawingsProvider mounted (e.g. dashboard preview).
function useDrawingsOptional() {
  return useContext(DrawingsContext)
}

// arr — defensive: DB can deliver null for nominally-array columns
// (nullable col / row predating a default). A bare [...null] spread throws
// "not iterable", and with no error boundary one bad row blanks the WHOLE
// progress list. Normalise every array access through this.
function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

const STATUS_STYLE: Record<ProgressStatus, string> = {
  'not-started': 'bg-site-100 text-site-500',
  'in-progress': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
  'delayed': 'bg-red-100 text-red-700',
  'blocked': 'bg-orange-100 text-orange-700',
}
const STATUS_ICON: Record<ProgressStatus, typeof Minus> = {
  'not-started': Minus,
  'in-progress': Clock,
  'completed': CheckCircle2,
  'delayed': AlertTriangle,
  'blocked': AlertTriangle,
}
const LEVEL_BORDER: Record<number, string> = {
  1: 'border-l-4 border-l-safety-500',
  2: 'border-l-4 border-l-blue-400',
}

// Lightweight in-memory profile cache shared across cards
const profileCache: Record<string, UserProfile> = {}
const pending: Record<string, Promise<UserProfile | null>> = {}

function getProfile(id: string): Promise<UserProfile | null> {
  const cached = profileCache[id]
  if (cached) return Promise.resolve(cached)
  const inFlight = pending[id]
  if (inFlight) return inFlight
  const p = (async () => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', id).maybeSingle()
    if (data) profileCache[id] = data as UserProfile
    delete pending[id]
    return (data as UserProfile | null) ?? null
  })()
  pending[id] = p
  return p
}

function useProfiles(ids: string[]): Record<string, UserProfile> {
  const [snap, setSnap] = useState<Record<string, UserProfile>>({})
  useEffect(() => {
    let cancelled = false
    Promise.all(ids.map(getProfile)).then(rows => {
      if (cancelled) return
      const next: Record<string, UserProfile> = {}
      rows.forEach((p, i) => { if (p) next[ids[i]] = p })
      setSnap(prev => ({ ...prev, ...next }))
    })
    return () => { cancelled = true }
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  return snap
}

export function ProgressItemCard({
  item, expanded, onToggle, onUpdate, onAddChild, onAssign, onHistory, onEdit, onDelete,
}: {
  item: ProgressItem
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onHistory: (item: ProgressItem) => void
  onEdit: (item: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}) {
  const { items, canEdit, canUpdateItem } = useProgress()
  const { projects } = useProjects()
  const canUpdateThis = canUpdateItem(item)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [drawingsOpen, setDrawingsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const zoneLabel = useMemo(() => {
    if (!item.zone_id) return null
    const project = projects.find(p => p.id === item.project_id)
    return project?.zones.find(z => z.id === item.zone_id)?.name ?? null
  }, [projects, item.project_id, item.zone_id])

  const children = items.filter(i => i.parent_id === item.id)
  const isLeaf = children.length === 0
  const isOpen = expanded.has(item.id)

  const drawingsCtx = useDrawingsOptional()
  const drawingCount = useMemo(
    () => drawingsCtx ? drawingsCtx.drawings.filter(d => d.leaf_item_id === item.id).length : 0,
    [drawingsCtx, item.id],
  )

  const descLeaves = isLeaf ? [] : getDescendantLeaves(items, item.id)
  const rollup = isLeaf ? null : computeRollup(descLeaves)
  const displayActual = isLeaf ? item.actual_progress : rollup!.actual
  // Planned is schedule-derived (planned_start→planned_end vs today), not stored.
  const displayPlanned = isLeaf ? plannedProgressOf(item) : rollup!.planned
  const displayStatus: ProgressStatus = isLeaf
    ? deriveStatus(item.actual_progress, displayPlanned)
    : rollup!.status
  const scheduled = isLeaf ? isScheduled(item) : descLeaves.some(isScheduled)

  const StatusIcon = STATUS_ICON[displayStatus] ?? Minus
  const diff = displayActual - displayPlanned
  const indentRem = (item.level - 1) * 0.85
  const levelBorder = LEVEL_BORDER[item.level] ?? 'border-l-4 border-l-site-200'
  const cardBg = item.level === 1 ? 'bg-safety-50/40' : 'bg-white'

  const isFloors = item.tracking_mode === 'floors'
  const assignedTo = arr(item.assigned_to)
  const delegatedTo = arr(item.delegated_to)
  const assigneeIds = [...assignedTo, ...delegatedTo]
  const profiles = useProfiles(assigneeIds)

  // tapping the row body: parents toggle children, leaves toggle their detail.
  const toggleRow = () => onToggle(item.id)

  // close kebab on outside click
  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setMenuOpen(false); setConfirmDel(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

  const hasMenuActions = canEdit || (isLeaf && !!drawingsCtx)
  // Every row is expandable: parents → children, leaves → detail (notes /
  // assignees / drawings / 需用物料). Leaves always expandable so linked
  // materials stay reachable even when the row has no notes/assignees.

  return (
    <div style={{ marginLeft: `${indentRem}rem` }}>
      {/* No overflow-hidden — the kebab dropdown is absolute/top-full
          and on short (non-leaf) rows it overflows the card box; clipping it
          here hid the menu behind the next item. Inner content is padded so
          the rounded corners still read clean without clipping. */}
      <div className={`rounded-lg border border-site-200 mb-1 ${levelBorder} ${cardBg}`}>
        {/* compact row */}
        <div className="flex items-center gap-1.5 pl-1.5 pr-1.5 py-1.5">
          {/* chevron — parents reveal children, leaves reveal detail */}
          <button
            onClick={toggleRow}
            className="flex-shrink-0 w-6 h-6 grid place-items-center text-site-400 hover:text-site-700"
            aria-label={isOpen ? '收起' : '展開'}
          >
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>

          {/* title + meta + progress (tap to expand) */}
          <button onClick={toggleRow} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-[10px] text-site-400 flex-shrink-0">{item.code}</span>
              {zoneLabel && <span className="text-[9px] font-semibold bg-site-100 text-site-600 px-1 rounded flex-shrink-0">{zoneLabel}</span>}
              <span className={`font-semibold text-site-900 truncate ${item.level === 1 ? 'text-sm' : 'text-[13px]'}`}>{item.title}</span>
              {isFloors && isLeaf && (
                <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-100 text-purple-700 px-1 rounded flex-shrink-0">
                  <Layers size={8} />{arr(item.floors_completed).length}/{arr(item.floor_labels).length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <ProgressBar value={displayActual} planned={displayPlanned} status={displayStatus} className="flex-1 h-1.5" />
              <span className={`text-[11px] font-bold flex-shrink-0 ${displayStatus === 'delayed' ? 'text-red-600' : 'text-site-700'}`}>{displayActual}%</span>
              <span
                title={scheduled ? (diff < -5 ? `落後計劃 ${-diff}%` : diff > 5 ? `超前計劃 ${diff}%` : '大致與計劃一致') : '未設定計劃日期'}
                className={`text-[10px] font-semibold flex-shrink-0 w-11 text-right ${!scheduled ? 'text-site-300' : diff < -5 ? 'text-red-500' : diff > 0 ? 'text-green-600' : 'text-site-400'}`}
              >
                {!scheduled ? '未排期' : `${diff >= 0 ? '+' : ''}${diff}%`}
              </span>
            </div>
          </button>

          {/* status pill */}
          <span className={`flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[displayStatus]}`}>
            <StatusIcon size={8} />
            <span className="hidden sm:inline">{PROGRESS_STATUS_ZH[displayStatus]}</span>
          </span>

          {/* primary inline action: 更新 (the one foremen tap all day) */}
          {canUpdateThis && isLeaf && (
            <button
              onClick={() => onUpdate(item)}
              className="flex-shrink-0 w-11 h-9 grid place-items-center bg-safety-500 hover:bg-safety-600 text-white rounded-lg"
              aria-label="更新"
            >
              <Edit3 size={16} />
            </button>
          )}

          {/* overflow kebab: everything else */}
          {hasMenuActions && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="w-9 h-9 grid place-items-center text-site-500 hover:text-site-900 hover:bg-site-100 rounded-lg"
                aria-label="更多"
              >
                <MoreVertical size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-site-200 shadow-card-md py-1 min-w-[150px]">
                  {isLeaf && drawingsCtx && (
                    <MenuRow icon={<ImageIcon size={15} />} label={`圖則 (${drawingCount})`} onClick={() => { setDrawingsOpen(o => !o); if (!isOpen) onToggle(item.id); setMenuOpen(false) }} />
                  )}
                  {canEdit && isLeaf && (
                    <MenuRow icon={<Users size={15} />} label="指派" onClick={() => { onAssign(item); setMenuOpen(false) }} />
                  )}
                  {canEdit && isLeaf && (
                    <MenuRow icon={<History size={15} />} label="歷史" onClick={() => { onHistory(item); setMenuOpen(false) }} />
                  )}
                  {canEdit && (
                    <MenuRow icon={<Plus size={15} />} label="加細項" onClick={() => { onAddChild(item); setMenuOpen(false) }} />
                  )}
                  {canEdit && (
                    <MenuRow icon={<Edit3 size={15} />} label="編輯（名稱／日期）" onClick={() => { onEdit(item); setMenuOpen(false) }} />
                  )}
                  {canEdit && !confirmDel && (
                    <MenuRow icon={<Trash2 size={15} />} label="刪除" danger onClick={() => setConfirmDel(true)} />
                  )}
                  {canEdit && confirmDel && (
                    <div className="px-3 py-2 flex items-center justify-between gap-2 bg-red-50">
                      <span className="text-xs text-red-600 font-semibold">確認刪除?</span>
                      <div className="flex gap-1">
                        <button onClick={() => { onDelete(item); setMenuOpen(false); setConfirmDel(false) }} className="text-xs bg-red-600 text-white px-2 py-1 rounded">刪</button>
                        <button onClick={() => setConfirmDel(false)} className="text-xs text-site-500 px-2 py-1">取消</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* expanded detail (leaf only): notes, assignees, drawings, materials */}
        {isOpen && isLeaf && (
          <div className="px-3 pb-2.5 pt-1 border-t border-site-100 space-y-2">
            {item.notes && <p className="text-[11px] text-site-500 whitespace-pre-wrap">{item.notes}</p>}
            {(assignedTo.length > 0 || delegatedTo.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {assignedTo.map(id => (
                  <span key={`o-${id}`} className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                    <Users size={9} />{profiles[id]?.name ?? '...'}
                  </span>
                ))}
                {delegatedTo.map(id => (
                  <span key={`d-${id}`} className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                    <UserPlus size={9} />{profiles[id]?.name ?? '...'}
                  </span>
                ))}
              </div>
            )}
            {drawingsOpen && drawingsCtx && <DrawingsSection leafItemId={item.id} />}
            <MaterialItemsPanel itemId={item.id} title="需用物料" />
          </div>
        )}
      </div>

      {isOpen && children.map(child => (
        <ProgressItemCard
          key={child.id}
          item={child}
          expanded={expanded}
          onToggle={onToggle}
          onUpdate={onUpdate}
          onAddChild={onAddChild}
          onAssign={onAssign}
          onHistory={onHistory}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function MenuRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-site-50 ${danger ? 'text-red-600' : 'text-site-700'}`}
    >
      {icon} {label}
    </button>
  )
}
