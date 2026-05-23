import { useContext, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, ChevronDown, Plus, Trash2, Edit3,
  CheckCircle2, AlertTriangle, Clock, Minus,
  Layers, Users, UserPlus, History, Image as ImageIcon,
} from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { DrawingsContext } from '../contexts/DrawingsContext'
import { DrawingsSection } from './drawings/DrawingsSection'
import { PROGRESS_STATUS_ZH, computeRollup, getDescendantLeaves } from '../types'
import type { ProgressItem, ProgressStatus, UserProfile } from '../types'
import { supabase } from '../lib/supabase'

// useDrawingsOptional — returns null when no DrawingsProvider is mounted in the tree.
// Lets ProgressItemCard render safely outside ProjectDetail (e.g., dashboard previews)
// where the drawings UI gracefully hides instead of crashing. (Plan 05 guarantees the
// raw DrawingsContext named export — no fallback path required for the import itself.)
function useDrawingsOptional() {
  return useContext(DrawingsContext)
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
  item, expanded, onToggle, onUpdate, onAddChild, onAssign, onHistory, onDelete,
}: {
  item: ProgressItem
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onHistory: (item: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}) {
  const { items, canEdit } = useProgress()
  const [confirmDel, setConfirmDel] = useState(false)
  const [drawingsOpen, setDrawingsOpen] = useState(false)

  const children = items.filter(i => i.parent_id === item.id)
  const isLeaf = children.length === 0
  const isOpen = expanded.has(item.id)

  // Drawings (optional — null when used outside DrawingsProvider, e.g. dashboard preview)
  const drawingsCtx = useDrawingsOptional()
  const drawingCount = useMemo(
    () =>
      drawingsCtx
        ? drawingsCtx.drawings.filter(d => d.leaf_item_id === item.id).length
        : 0,
    [drawingsCtx, item.id],
  )

  const displayActual = isLeaf
    ? item.actual_progress
    : computeRollup(getDescendantLeaves(items, item.id)).actual
  const displayPlanned = isLeaf
    ? item.planned_progress
    : computeRollup(getDescendantLeaves(items, item.id)).planned
  const displayStatus: ProgressStatus = isLeaf
    ? item.status
    : computeRollup(getDescendantLeaves(items, item.id)).status

  const StatusIcon = STATUS_ICON[displayStatus] ?? Minus
  const diff = displayActual - displayPlanned
  const indentRem = (item.level - 1) * 1
  const levelBorder = LEVEL_BORDER[item.level] ?? 'border-l-4 border-l-site-200'
  const cardBg = item.level === 1 ? 'bg-safety-50/40' : 'bg-white'

  const isFloors = item.tracking_mode === 'floors'
  const assigneeIds = [...item.assigned_to, ...item.delegated_to]
  const profiles = useProfiles(assigneeIds)

  return (
    <div style={{ marginLeft: `${indentRem}rem` }}>
      <div className={`rounded-xl border border-site-200 shadow-card mb-1.5 overflow-hidden ${levelBorder} ${cardBg}`}>
        <div className="p-3">
          <div className="flex items-start gap-2">
            <button
              onClick={() => !isLeaf && onToggle(item.id)}
              className={`flex-shrink-0 mt-0.5 ${!isLeaf ? 'text-site-500 hover:text-site-800' : 'text-transparent cursor-default'}`}
              aria-label={isOpen ? '收起' : '展開'}
            >
              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[11px] text-site-400 flex-shrink-0">{item.code}</span>
                    <span className={`font-semibold text-site-900 ${item.level === 1 ? 'text-sm' : 'text-xs'} leading-snug`}>
                      {item.title}
                    </span>
                    {!isLeaf && (
                      <span className="text-[9px] bg-site-100 text-site-500 px-1.5 py-0.5 rounded-full font-medium">
                        自動匯總
                      </span>
                    )}
                    {isLeaf && isFloors && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                        <Layers size={9} />{item.floors_completed.length}/{item.floor_labels.length}層
                      </span>
                    )}
                  </div>
                  {item.notes && isLeaf && (
                    <p className="text-[10px] text-site-400 mt-0.5 line-clamp-2">{item.notes}</p>
                  )}
                </div>
                <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[displayStatus]}`}>
                  <StatusIcon size={9} />
                  {PROGRESS_STATUS_ZH[displayStatus]}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <ProgressBar
                  value={displayActual}
                  planned={displayPlanned}
                  status={displayStatus}
                  className="flex-1"
                />
                <span className={`text-xs font-bold flex-shrink-0 ${displayStatus === 'delayed' ? 'text-red-600' : 'text-site-700'}`}>
                  {displayActual}%
                </span>
                <span className={`text-[11px] font-semibold flex-shrink-0 ${diff < -5 ? 'text-red-500' : diff >= 0 ? 'text-green-600' : 'text-site-400'}`}>
                  ({diff >= 0 ? '+' : ''}{diff}%)
                </span>
              </div>

              {/* Assignee chips (leaf only — assignment lives at leaf level) */}
              {isLeaf && (item.assigned_to.length > 0 || item.delegated_to.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.assigned_to.map(id => (
                    <span key={`o-${id}`} className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                      <Users size={9} />{profiles[id]?.name ?? '...'}
                    </span>
                  ))}
                  {item.delegated_to.map(id => (
                    <span key={`d-${id}`} className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                      <UserPlus size={9} />{profiles[id]?.name ?? '...'}
                    </span>
                  ))}
                </div>
              )}

              {(canEdit || (isLeaf && drawingsCtx)) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-site-100">
                  {isLeaf && drawingsCtx && (
                    <button
                      onClick={() => setDrawingsOpen(o => !o)}
                      className="text-sm bg-site-100 hover:bg-site-200 text-site-700 px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <ImageIcon size={16} /> 🖼 圖則 ({drawingCount})
                    </button>
                  )}
                  {canEdit && isLeaf && (
                    <button
                      onClick={() => onUpdate(item)}
                      className="text-sm bg-safety-500 hover:bg-safety-600 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <Edit3 size={16} /> 更新
                    </button>
                  )}
                  {canEdit && isLeaf && (
                    <button
                      onClick={() => onAssign(item)}
                      className="text-sm bg-site-700 hover:bg-site-800 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <Users size={16} /> 指派
                    </button>
                  )}
                  {canEdit && isLeaf && (
                    <button
                      onClick={() => onHistory(item)}
                      className="text-sm border border-site-200 text-site-600 hover:bg-site-50 px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <History size={16} /> 歷史
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => onAddChild(item)}
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <Plus size={16} /> 細項
                    </button>
                  )}
                  {canEdit && !confirmDel && (
                    <button
                      onClick={() => setConfirmDel(true)}
                      className="text-sm bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 px-3 py-2 rounded-lg flex items-center gap-1.5 min-h-[44px] font-medium"
                    >
                      <Trash2 size={16} /> 刪除
                    </button>
                  )}
                  {canEdit && confirmDel && (
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-red-600 font-semibold">確認?</span>
                      <button
                        onClick={() => { onDelete(item); setConfirmDel(false) }}
                        className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium"
                      >
                        刪除
                      </button>
                      <button
                        onClick={() => setConfirmDel(false)}
                        className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium"
                      >
                        取消
                      </button>
                    </span>
                  )}
                </div>
              )}

              {isLeaf && drawingsOpen && drawingsCtx && (
                <DrawingsSection leafItemId={item.id} />
              )}
            </div>
          </div>
        </div>
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
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
