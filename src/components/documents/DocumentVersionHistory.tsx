// DocumentVersionHistory — version-record sheet for a Document.
//
// Successor of DrawingVersionHistory. Unlike drawings (3-state status), document
// versions carry the full review lifecycle (draft → submitted → approved /
// rejected → superseded / withdrawn), so each row also surfaces status + the
// reviewer + the review note (FILE-SYSTEM-DESIGN §3.4). uploaderNameById maps
// version.submitted_by → name; reviewerNameById covers reviewed_by.

import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useDocuments } from '../../contexts/DocumentsContext'
import { revisionLabelOrDefault } from '../../lib/documents'
import { DOCUMENT_STATUS_ZH } from '../../types'
import type { Document, DocumentStatus, DocumentVersion } from '../../types'

export interface DocumentVersionHistoryProps {
  open: boolean
  document: Document
  versions: DocumentVersion[]
  currentVersionId: string | null
  onClose(): void
  onSelect(version: DocumentVersion): void
}

const STATUS_STYLE: Record<DocumentStatus, string> = {
  draft: 'bg-site-100 text-site-500',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-50 text-red-600',
  superseded: 'bg-gray-100 text-gray-500 line-through',
  withdrawn: 'bg-red-50 text-red-600 line-through',
}

function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_STYLE[status]}`}>
      {DOCUMENT_STATUS_ZH[status]}
    </span>
  )
}

function fmt(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('zh-HK')
}

function dateLine(v: DocumentVersion): string {
  if (v.status === 'superseded') return `${fmt(v.submitted_at)} ~ ${fmt(v.superseded_at)}`
  if (v.status === 'withdrawn') return `送審 ${fmt(v.submitted_at)} / 撤回 ${fmt(v.withdrawn_at)}`
  return `送審 ${fmt(v.submitted_at)}`
}

export function DocumentVersionHistory({
  open,
  document,
  versions,
  currentVersionId,
  onClose,
  onSelect,
}: DocumentVersionHistoryProps) {
  const { uploaderNameById } = useDocuments()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.document.addEventListener('keydown', onKey)
    return () => window.document.removeEventListener('keydown', onKey)
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
          <div className="text-xs text-site-500 px-3 pb-2">{document.title}</div>
          {versions.length === 0 && (
            <div className="text-sm text-site-500 px-3 py-6 text-center">
              沒有版本記錄
            </div>
          )}
          <ul className="divide-y divide-site-100">
            {versions.map(v => {
              const isCurrentRow = v.id === currentVersionId
              const uploaderName = uploaderNameById[v.submitted_by ?? ''] || '未知'
              const reviewerName = uploaderNameById[v.reviewed_by ?? ''] || null
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
                      <DocumentStatusBadge status={v.status} />
                    </div>
                    <div className="text-xs text-site-600 mt-1">{dateLine(v)}</div>
                    <div className="text-xs text-site-500 mt-0.5">
                      {revLabel} · 送審者：{uploaderName}
                    </div>
                    {(v.status === 'approved' || v.status === 'rejected') && reviewerName && (
                      <div className="text-xs text-site-500 mt-0.5">
                        {v.status === 'approved' ? '批核者' : '拒絕者'}：{reviewerName}
                      </div>
                    )}
                    {v.review_note && (
                      <div className="text-xs text-site-600 mt-1 bg-site-50 rounded-lg px-2 py-1 whitespace-pre-wrap">
                        審批備註：{v.review_note}
                      </div>
                    )}
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

export default DocumentVersionHistory
