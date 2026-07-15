import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useDrawings } from '../../contexts/DrawingsContext'
import { revisionLabelOrDefault } from '../../lib/drawings'
import { DRAWING_STATUS_ZH } from '../../types'
import type { Drawing, DrawingStatus, DrawingVersion } from '../../types'

export interface DrawingVersionHistoryProps {
  open: boolean
  drawing: Drawing
  versions: DrawingVersion[]
  currentVersionId: string | null
  onClose(): void
  onSelect(version: DrawingVersion): void
}

function DrawingStatusBadge({ status }: { status: DrawingStatus }) {
  const label = DRAWING_STATUS_ZH[status]
  if (status === 'current') {
    return (
      <span className="text-lg font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">
        {label}
      </span>
    )
  }
  if (status === 'superseded') {
    return (
      <span className="text-lg bg-gray-100 text-gray-500 line-through px-2 py-0.5 rounded">
        {label}
      </span>
    )
  }
  return (
    <span className="text-lg bg-red-50 text-red-600 line-through px-2 py-0.5 rounded">
      {label}
    </span>
  )
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('zh-HK')
}

function dateLine(v: DrawingVersion): string {
  if (v.status === 'current') return `上載 ${fmt(v.uploaded_at)}`
  if (v.status === 'superseded') return `${fmt(v.uploaded_at)} ~ ${fmt(v.superseded_at)}`
  return `上載 ${fmt(v.uploaded_at)} / 撤回 ${fmt(v.withdrawn_at)}`
}

export function DrawingVersionHistory({
  open,
  drawing,
  versions,
  currentVersionId,
  onClose,
  onSelect,
}: DrawingVersionHistoryProps) {
  const { uploaderNameById } = useDrawings()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-site-100">
          <h3 className="font-bold text-site-900">版本記錄</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-site-400 hover:text-site-700 -mr-2"
            aria-label="關閉"
          >
            <X size={22} />
          </button>
        </div>
        <div className="px-2 py-2 overflow-y-auto flex-1">
          <div className="text-xs text-site-500 px-3 pb-2">{drawing.title}</div>
          {versions.length === 0 && (
            <div className="text-sm text-site-500 px-3 py-6 text-center">
              沒有版本記錄
            </div>
          )}
          <ul className="divide-y divide-site-100">
            {versions.map(v => {
              const isCurrentRow = v.id === currentVersionId
              const uploaderName = uploaderNameById[v.uploaded_by ?? ''] || '未知'
              const revLabel = revisionLabelOrDefault(v.revision_label, v.version_no)
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(v)
                      onClose()
                    }}
                    className={`w-full text-left px-3 py-3 hover:bg-site-50 ${
                      isCurrentRow ? '' : 'opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-site-900">
                        v{v.version_no}
                      </span>
                      <DrawingStatusBadge status={v.status} />
                    </div>
                    <div className="text-xs text-site-600 mt-1">{dateLine(v)}</div>
                    <div className="text-xs text-site-500 mt-0.5">
                      {revLabel} · 上載者：{uploaderName}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default DrawingVersionHistory
