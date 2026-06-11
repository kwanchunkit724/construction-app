// DocumentViewer — full-screen modal for viewing a Document version.
//
// Generalised from DrawingViewer. Signs the blob URL via the bucket-aware
// context.getViewerUrl (migrated drawings live in project-drawings, new docs in
// project-docs — the signer keys off version.bucket_id, FILE-SYSTEM-DESIGN §2.1).
//
// INVARIANT: DocumentsProvider is assumed mounted upstream — this calls
// useDocuments() unconditionally. It is only ever instantiated from
// DocumentsSection, which early-returns when files_enabled is off.
//
// LAZY-LOAD: react-pdf + react-zoom-pan-pinch are static top-of-module imports
// routed into the `viewer-pdf` / `viewer-zoom` chunks (vite manualChunks). The
// CALLER (DocumentsSection) wraps this in React.lazy() so the chunks only load
// when the viewer opens — same boundary as DrawingsSection→DrawingViewer.

import { useEffect, useState } from 'react'
import { History as HistoryIcon, X } from 'lucide-react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { Document as PdfDocument, Page } from 'react-pdf'
import '../../lib/pdfWorker' // side-effect: sets pdfjs workerSrc — MUST precede any <Page>
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useDocuments } from '../../contexts/DocumentsContext'
import { revisionLabelOrDefault, documentStatusLabel } from '../../lib/documents'
import { Spinner } from '../Spinner'
import { PdfPageNavigator } from '../drawings/PdfPageNavigator'
import { DocumentVersionHistory } from './DocumentVersionHistory'
import { DocumentReviewBar } from './DocumentReviewBar'
import type { Document, DocumentVersion } from '../../types'

export interface DocumentViewerProps {
  version: DocumentVersion
  document: Document
  allVersions: DocumentVersion[]
  onClose(): void
  onSelectVersion(version: DocumentVersion): void
}

export function DocumentViewer({
  version,
  document,
  allVersions,
  onClose,
  onSelectVersion,
}: DocumentViewerProps) {
  const { getViewerUrl } = useDocuments()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)

  const isPdf = version.mime_type === 'application/pdf'
  const revLabel = revisionLabelOrDefault(version.revision_label, version.version_no)

  useEffect(() => {
    let cancelled = false
    setSignedUrl(null)
    setUrlError(null)
    setLoading(true)
    setPageNum(1)
    setTotalPages(0)
    getViewerUrl(version).then(({ url, error }) => {
      if (cancelled) return
      if (error) setUrlError(error)
      else setSignedUrl(url)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [version, getViewerUrl])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (historyOpen) setHistoryOpen(false)
        else onClose()
      }
    }
    window.document.addEventListener('keydown', onKey)
    return () => window.document.removeEventListener('keydown', onKey)
  }, [historyOpen, onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      data-testid="document-viewer-zoom"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{document.title}</div>
          <div className="text-xs text-white/70">
            {revLabel} · {documentStatusLabel(version.status)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="text-white px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-1 text-sm"
          aria-label="版本記錄"
        >
          <HistoryIcon size={18} />
          <span className="hidden sm:inline">📋 版本記錄</span>
          <span className="sm:hidden">📋</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-white px-2 py-2 rounded-lg hover:bg-white/10 ml-1"
          aria-label="關閉"
        >
          <X size={22} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Spinner size={28} className="text-white" />
          </div>
        )}
        {urlError && (
          <div className="absolute inset-x-4 top-4 text-sm text-red-200 bg-red-900/70 border border-red-700 rounded-xl px-3 py-2">
            無法載入文件：{urlError}
          </div>
        )}
        {signedUrl && !urlError && (
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={6}
            doubleClick={{ mode: 'reset' }}
            wheel={{ step: 0.2 }}
            pinch={{ step: 5 }}
          >
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              {isPdf ? (
                <PdfDocument
                  file={signedUrl}
                  onLoadSuccess={info => setTotalPages(info.numPages)}
                  onLoadError={err => setUrlError(err.message)}
                  loading={<Spinner size={28} className="text-white" />}
                >
                  <Page
                    pageNumber={pageNum}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </PdfDocument>
              ) : (
                <img
                  src={signedUrl}
                  alt={document.title}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              )}
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      {isPdf && totalPages > 1 && (
        <div className="absolute left-0 right-0 bottom-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <PdfPageNavigator
              current={pageNum}
              total={totalPages}
              onChange={setPageNum}
            />
          </div>
        </div>
      )}

      {/* Reviewer controls — render only on a submitted version (the bar
          early-returns otherwise). Sits above the safe-area inset. */}
      <div className="px-4 py-2 bg-black/80">
        <DocumentReviewBar version={version} />
      </div>

      <DocumentVersionHistory
        open={historyOpen}
        document={document}
        versions={allVersions}
        currentVersionId={version.id}
        onClose={() => setHistoryOpen(false)}
        onSelect={onSelectVersion}
      />
    </div>
  )
}

export default DocumentViewer
