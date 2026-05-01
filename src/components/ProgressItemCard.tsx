import { useState } from 'react'
import {
  ChevronRight, ChevronDown, Plus, Trash2, Edit3,
  CheckCircle2, AlertTriangle, Clock, Minus,
} from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { PROGRESS_STATUS_ZH, computeRollup, getDescendantLeaves } from '../types'
import type { ProgressItem, ProgressStatus } from '../types'

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

export function ProgressItemCard({
  item, expanded, onToggle, onUpdate, onAddChild, onDelete,
}: {
  item: ProgressItem
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}) {
  const { items, canEdit } = useProgress()
  const [confirmDel, setConfirmDel] = useState(false)

  const children = items.filter(i => i.parent_id === item.id)
  const isLeaf = children.length === 0
  const isOpen = expanded.has(item.id)

  // Leaves use stored value. Non-leaves use rollup of descendant leaves.
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

              {canEdit && (
                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-site-100">
                  {isLeaf && (
                    <button
                      onClick={() => onUpdate(item)}
                      className="text-[11px] bg-safety-500 hover:bg-safety-600 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 min-h-0"
                    >
                      <Edit3 size={11} /> 更新
                    </button>
                  )}
                  <button
                    onClick={() => onAddChild(item)}
                    className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 min-h-0"
                  >
                    <Plus size={11} /> 細項
                  </button>
                  {!confirmDel && (
                    <button
                      onClick={() => setConfirmDel(true)}
                      className="text-[11px] bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 min-h-0"
                    >
                      <Trash2 size={11} /> 刪除
                    </button>
                  )}
                  {confirmDel && (
                    <span className="flex items-center gap-1">
                      <span className="text-[11px] text-red-600 font-semibold">確認?</span>
                      <button
                        onClick={() => { onDelete(item); setConfirmDel(false) }}
                        className="text-[11px] bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg min-h-0"
                      >
                        刪除
                      </button>
                      <button
                        onClick={() => setConfirmDel(false)}
                        className="text-[11px] border border-site-200 text-site-500 px-2.5 py-1 rounded-lg min-h-0"
                      >
                        取消
                      </button>
                    </span>
                  )}
                </div>
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
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
