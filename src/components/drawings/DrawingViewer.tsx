// DrawingViewer — full-screen modal for viewing a Drawing version.
//
// INVARIANT (ISSUE-11): DrawingsProvider is assumed mounted upstream. This
// component calls useDrawings() unconditionally; it is only ever instantiated
// from DrawingsSection (Plan 07), which itself early-returns when no provider
// is in scope (via useDrawingsOptional). If you render DrawingViewer outside
// a DrawingsProvider it WILL throw — that is intentional, surface the bug.
//
// LAZY-LOAD BOUNDARIES: react-pdf and react-zoom-pan-pinch are static imports
// at the top of this module. They are routed into the `viewer-pdf` and
// `viewer-zoom` chunks via vite.config.ts manualChunks. The CALLER (Plan 07
// DrawingsSection) is expected to wrap this component in React.lazy() so the
// chunks only load when the viewer is opened.
import { useEffect, useState } from 'react'
import { History as HistoryIcon, X } from 'lucide-react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { Document, Page } from 'react-pdf'
import '../../lib/pdfWorker' // side-effect: sets pdfjs.GlobalWorkerOptions.workerSrc — MUST precede any <Page>
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useDrawings } from '../../contexts/DrawingsContext'
import { revisionLabelOrDefault } from '../../lib/drawings'
import { Spinner } from '../Spinner'
import { DrawingVersionHistory } from './DrawingVersionHistory'
import { PdfPageNavigator } from './PdfPageNavigator'
import type { Drawing, DrawingVersion } from '../../types'

export interface DrawingViewerProps {
  version: DrawingVersion
  drawing: Drawing
  allVersions: DrawingVersion[]
  onClose(): void
  onSelectVersion(version: DrawingVersion): void
}

export function DrawingViewer({
  version,
  drawing,
  allVersions,
  onClose,
  onSelectVersion,
}: DrawingViewerProps) {
  const { getViewerUrl } = useDrawings()
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
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [historyOpen, onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      data-testid="drawing-viewer-zoom"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{drawing.title}</div>
          <div className="text-xs text-white/70">{revLabel}</div>
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
            無法載入圖則：{urlError}
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
                <Document
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
                </Document>
              ) : (
                <img
                  src={signedUrl}
                  alt={drawing.title}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              )}
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      {isPdf && totalPages > 1 && (
        <div className="absolute left-0 right-0 bottom-4 flex justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <PdfPageNavigator
              current={pageNum}
              total={totalPages}
              onChange={setPageNum}
            />
          </div>
        </div>
      )}

      <DrawingVersionHistory
        open={historyOpen}
        drawing={drawing}
        versions={allVersions}
        currentVersionId={version.id}
        onClose={() => setHistoryOpen(false)}
        onSelect={onSelectVersion}
      />
    </div>
  )
}

export default DrawingViewer
