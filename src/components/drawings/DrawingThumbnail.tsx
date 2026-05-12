import { FileText, Image as ImageIcon } from 'lucide-react'
import { revisionLabelOrDefault } from '../../lib/drawings'
import { DRAWING_STATUS_ZH } from '../../types'
import type { Drawing, DrawingStatus, DrawingVersion } from '../../types'

export interface DrawingThumbnailProps {
  drawing: Drawing
  currentVersion: DrawingVersion | null
  thumbUrl: string | null
  onClick(): void
}

function StatusBadge({ status }: { status: DrawingStatus }) {
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

export function DrawingThumbnail({
  drawing,
  currentVersion,
  thumbUrl,
  onClick,
}: DrawingThumbnailProps) {
  const status: DrawingStatus = currentVersion?.status ?? 'withdrawn'
  const isPdf = currentVersion?.mime_type === 'application/pdf'
  const revLabel = revisionLabelOrDefault(
    currentVersion?.revision_label,
    currentVersion?.version_no ?? 1,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${drawing.title} (${DRAWING_STATUS_ZH[status]})`}
      className="card w-full text-left p-0 overflow-hidden flex flex-col hover:border-safety-300 transition-colors"
    >
      <div className="aspect-square w-full bg-site-100 flex items-center justify-center">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : isPdf ? (
          <FileText size={48} className="text-site-400" />
        ) : (
          <ImageIcon size={48} className="text-site-400" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="text-sm font-medium text-site-900 line-clamp-2">
          {drawing.title}
        </div>
        <div className="text-xs text-site-500">{revLabel}</div>
        <div>
          <StatusBadge status={status} />
        </div>
      </div>
    </button>
  )
}

export default DrawingThumbnail
