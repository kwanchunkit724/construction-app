// DocumentReviewBar — 批核 / 拒絕 controls for a submitted document version.
//
// Rendered ONLY when the current user canReview AND the version's status is
// 'submitted' (the caller — DocumentsSection / DocumentViewer — is responsible
// for that gate; this component additionally early-returns so it is safe to
// render unconditionally). 批核 calls reviewVersion(id, 'approve'); 拒絕 opens a
// note modal — the note is REQUIRED (the RPC rejects an empty note, B3 / §3.4).

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { useDocuments } from '../../contexts/DocumentsContext'
import { Spinner } from '../Spinner'
import type { DocumentVersion } from '../../types'

export interface DocumentReviewBarProps {
  version: DocumentVersion
  // Compact variant sits inline under a thumbnail; default is the full bar.
  compact?: boolean
}

export function DocumentReviewBar({ version, compact }: DocumentReviewBarProps) {
  const { canReview, reviewVersion } = useDocuments()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hard gate: only submitted versions are reviewable, and only by reviewers.
  if (!canReview || version.status !== 'submitted') return null

  async function approve() {
    setBusy(true)
    setError(null)
    const { error } = await reviewVersion(version.id, 'approve')
    setBusy(false)
    if (error) setError(error)
  }

  async function reject() {
    if (!note.trim()) {
      setError('拒絕文件必須填寫原因')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await reviewVersion(version.id, 'reject', note.trim())
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    setRejectOpen(false)
    setNote('')
  }

  return (
    <div className={compact ? 'mt-1' : 'mt-2'}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={approve}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg min-h-0"
        >
          {busy ? <Spinner size={14} className="text-white" /> : <Check size={14} />}
          批核
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setRejectOpen(true)
          }}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg min-h-0"
        >
          <X size={14} />
          拒絕
        </button>
      </div>

      {error && !rejectOpen && (
        <div className="text-xs text-red-600 mt-1">{error}</div>
      )}

      {rejectOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => !busy && setRejectOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-site-100">
              <h3 className="font-bold text-site-900">拒絕文件</h3>
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                disabled={busy}
                className="text-site-400 hover:text-site-700 -mr-2"
                aria-label="關閉"
              >
                <X size={22} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <label className="label">拒絕原因（必填）</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="請說明拒絕原因…"
                rows={3}
                maxLength={500}
                className="input min-h-[88px]"
              />
              {error && <div className="text-xs text-red-600">{error}</div>}
            </div>
            <div className="px-5 py-3 border-t border-site-100 flex gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                disabled={busy}
                className="btn-ghost flex-1"
              >
                取消
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={busy || !note.trim()}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
              >
                {busy && <Spinner size={16} className="text-white" />}
                <span>確認拒絕</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentReviewBar
