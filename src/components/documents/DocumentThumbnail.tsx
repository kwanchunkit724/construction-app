// DocumentThumbnail — grid tile for a Document's current version. Mirrors
// DrawingThumbnail but carries the document_type chip and the 6-state review
// status pill (DOCUMENT_STATUS_ZH).

import { FileText, Image as ImageIcon } from 'lucide-react'
import { revisionLabelOrDefault } from '../../lib/documents'
import { DOCUMENT_STATUS_ZH, DOCUMENT_TYPE_ZH } from '../../types'
import type { Document, DocumentStatus, DocumentVersion } from '../../types'

export interface DocumentThumbnailProps {
  document: Document
  currentVersion: DocumentVersion | null
  thumbUrl: string | null
  onClick(): void
}

const STATUS_STYLE: Record<DocumentStatus, string> = {
  draft: 'bg-site-100 text-site-500',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-50 text-red-600',
  superseded: 'bg-gray-100 text-gray-500 line-through',
  withdrawn: 'bg-red-50 text-red-600 line-through',
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_STYLE[status]}`}>
      {DOCUMENT_STATUS_ZH[status]}
    </span>
  )
}

export function DocumentThumbnail({
  document,
  currentVersion,
  thumbUrl,
  onClick,
}: DocumentThumbnailProps) {
  const status: DocumentStatus = currentVersion?.status ?? 'withdrawn'
  const isPdf = currentVersion?.mime_type === 'application/pdf'
  const revLabel = revisionLabelOrDefault(
    currentVersion?.revision_label,
    currentVersion?.version_no ?? 1,
  )

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${document.title} (${DOCUMENT_STATUS_ZH[status]})`}
      className="card w-full text-left p-0 overflow-hidden flex flex-col hover:border-safety-300 transition-colors"
    >
      <div className="aspect-square w-full bg-site-100 flex items-center justify-center">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : isPdf ? (
          <FileText size={48} className="text-site-400" />
        ) : (
          <ImageIcon size={48} className="text-site-400" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-semibold bg-site-100 text-site-600 px-1 rounded">
            {DOCUMENT_TYPE_ZH[document.document_type]}
          </span>
          {document.doc_number && (
            <span className="text-[9px] font-mono text-site-400">{document.doc_number}</span>
          )}
        </div>
        <div className="text-sm font-medium text-site-900 line-clamp-2">
          {document.title}
        </div>
        <div className="text-xs text-site-500">{revLabel}</div>
        <div>
          <StatusBadge status={status} />
        </div>
      </div>
    </button>
  )
}

export default DocumentThumbnail
