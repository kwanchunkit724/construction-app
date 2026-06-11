// DocumentsSection — inline section rendered under an expanded leaf
// ProgressItemCard when files_enabled is ON. Successor of DrawingsSection.
//
// Wires DocumentsContext (Phase B) + DocumentThumbnail / DocumentUploadSheet /
// DocumentViewer / DocumentReviewBar. Lazy-loads DocumentViewer so the
// viewer-pdf + viewer-zoom chunks stay out of the entry bundle (parity with
// DrawingsSection→DrawingViewer).
//
// Filters documents to this leaf (progress_item_id === leafItemId), offers a
// type-chip filter (物料送審 / 施工方案 / 圖則 / 檢驗記錄 / 其他), a 上載文件 button
// (canUpload), and a 在文件總覽開啟 deep-link to /project/:id/files?item=<id>
// (Phase D route — link is built now, lands later). Reviewers get an inline
// DocumentReviewBar on any 已送審 (submitted) current version.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MoreVertical, Plus, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDocuments } from '../../contexts/DocumentsContext'
import { FullPageSpinner, Spinner } from '../Spinner'
import { DOCUMENT_TYPE_ZH } from '../../types'
import { DocumentThumbnail } from './DocumentThumbnail'
import { DocumentUploadSheet } from './DocumentUploadSheet'
import { DocumentReviewBar } from './DocumentReviewBar'
import type { Document, DocumentType, DocumentVersion } from '../../types'

const DocumentViewer = lazy(() =>
  import('./DocumentViewer').then(m => ({ default: m.DocumentViewer })),
)

export interface DocumentsSectionProps {
  leafItemId: string
}

type UploadSheetState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'version'; documentId: string }

interface ViewingState {
  document: Document
  version: DocumentVersion
}

const TYPE_FILTERS: DocumentType[] = [
  'material_submission',
  'method_statement',
  'drawing',
  'inspection',
  'other',
]

export function DocumentsSection({ leafItemId }: DocumentsSectionProps) {
  const { profile } = useAuth()
  const {
    projectId,
    documents,
    versionsByDocument,
    loading,
    fetchError,
    canUpload,
    canUploadDrawingType,
    getThumbUrl,
    withdrawVersion,
  } = useDocuments()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all')
  const [uploadSheet, setUploadSheet] = useState<UploadSheetState>({ mode: 'closed' })
  const [viewing, setViewing] = useState<ViewingState | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>({})
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Debounce search input (200ms, drawings parity)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // Filter to this leaf item, then by type chip, then search, then created_at DESC.
  const itemDocuments = useMemo(() => {
    const term = search.trim().toLowerCase()
    return documents
      .filter(d => d.progress_item_id === leafItemId)
      .filter(d => (typeFilter === 'all' ? true : d.document_type === typeFilter))
      .filter(d => (term ? d.title.toLowerCase().includes(term) : true))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }, [documents, leafItemId, typeFilter, search])

  // Resolve current version per document — prefer current_version_id, else the
  // first (highest version_no) row.
  function currentVersionFor(d: Document): DocumentVersion | null {
    const versions = versionsByDocument[d.id] ?? []
    if (versions.length === 0) return null
    const matched = versions.find(v => v.id === d.current_version_id)
    return matched ?? versions[0]
  }

  // Fetch signed thumbnail URLs for visible documents' current versions.
  useEffect(() => {
    let cancelled = false
    const versions = itemDocuments
      .map(d => currentVersionFor(d))
      .filter((v): v is DocumentVersion => v !== null)

    Promise.all(
      versions.map(async v => {
        const { url } = await getThumbUrl(v)
        return [v.id, url] as const
      }),
    ).then(entries => {
      if (cancelled) return
      const next: Record<string, string | null> = {}
      for (const [id, url] of entries) next[id] = url
      setThumbUrls(prev => ({ ...prev, ...next }))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemDocuments.map(d => currentVersionFor(d)?.id ?? '').join(','), getThumbUrl])

  function openViewer(d: Document) {
    const v = currentVersionFor(d)
    if (!v) return
    setViewing({ document: d, version: v })
  }

  function closeViewer() {
    setViewing(null)
  }

  async function onWithdraw(version: DocumentVersion) {
    if (!window.confirm('確定撤回此版本?')) return
    const { error } = await withdrawVersion(version.id)
    if (error) window.alert(error)
    setOpenMenuId(null)
  }

  function canWithdraw(version: DocumentVersion): boolean {
    if (!profile) return false
    return version.submitted_by === profile.id || profile.global_role === 'admin'
  }

  return (
    <div className="mt-3 pt-3 border-t border-site-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-site-900 text-sm">
          文件 ({itemDocuments.length})
        </h3>
        <div className="flex items-center gap-2">
          <Link
            to={`/project/${projectId}/files?item=${leafItemId}`}
            className="text-[11px] text-site-500 hover:text-site-700 inline-flex items-center gap-0.5"
          >
            <ExternalLink size={11} /> 在文件總覽開啟
          </Link>
          {canUpload && (
            <button
              type="button"
              onClick={() => setUploadSheet({ mode: 'new' })}
              className="text-[11px] bg-safety-500 hover:bg-safety-600 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 min-h-0"
            >
              <Plus size={12} /> 上載文件
            </button>
          )}
        </div>
      </div>

      {fetchError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-2">
          ⚠ 讀取文件失敗：{fetchError}
        </div>
      )}

      {/* Type-chip filter */}
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${
            typeFilter === 'all'
              ? 'bg-site-900 text-white'
              : 'bg-site-100 text-site-600 hover:bg-site-200'
          }`}
        >
          全部
        </button>
        {TYPE_FILTERS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${
              typeFilter === t
                ? 'bg-site-900 text-white'
                : 'bg-site-100 text-site-600 hover:bg-site-200'
            }`}
          >
            {DOCUMENT_TYPE_ZH[t]}
          </button>
        ))}
      </div>

      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-site-400 pointer-events-none"
        />
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="搜尋文件名稱"
          className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-site-200 bg-white"
        />
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Spinner size={20} />
        </div>
      ) : itemDocuments.length === 0 ? (
        <div className="text-center py-6 px-3 bg-site-50 rounded-lg">
          <p className="text-xs text-site-500 mb-2">尚未有文件</p>
          {canUpload && (
            <button
              type="button"
              onClick={() => setUploadSheet({ mode: 'new' })}
              className="text-[11px] bg-safety-500 hover:bg-safety-600 text-white px-2.5 py-1 rounded-lg inline-flex items-center gap-1 min-h-0"
            >
              <Plus size={12} /> 上載文件
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {itemDocuments.map(d => {
            const v = currentVersionFor(d)
            const thumbUrl = v ? thumbUrls[v.id] ?? null : null
            return (
              <div key={d.id} className="relative">
                <DocumentThumbnail
                  document={d}
                  currentVersion={v}
                  thumbUrl={thumbUrl}
                  onClick={() => openViewer(d)}
                />
                {canUpload && (
                  <div className="absolute top-1 right-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === d.id ? null : d.id)
                      }}
                      className="bg-white/90 hover:bg-white text-site-700 rounded-full p-1 shadow"
                      aria-label="更多動作"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {openMenuId === d.id && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-site-200 rounded-lg shadow-card-md min-w-[140px] py-1">
                          {(d.document_type !== 'drawing' || canUploadDrawingType) && (
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSheet({ mode: 'version', documentId: d.id })
                                setOpenMenuId(null)
                              }}
                              className="w-full text-left text-xs px-3 py-2 text-site-700 hover:bg-site-50"
                            >
                              上載新版本
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              openViewer(d)
                              setOpenMenuId(null)
                            }}
                            className="w-full text-left text-xs px-3 py-2 text-site-700 hover:bg-site-50"
                          >
                            查看版本記錄
                          </button>
                          {v && canWithdraw(v) && (
                            <button
                              type="button"
                              onClick={() => onWithdraw(v)}
                              className="w-full text-left text-xs px-3 py-2 text-red-600 hover:bg-red-50"
                            >
                              撤回
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* Reviewers approve / reject a submitted current version inline
                    (the bar self-gates on canReview + status==='submitted'). */}
                {v && <DocumentReviewBar version={v} compact />}
              </div>
            )
          })}
        </div>
      )}

      {uploadSheet.mode !== 'closed' && (
        <DocumentUploadSheet
          open
          progressItemId={leafItemId}
          existingDocumentId={
            uploadSheet.mode === 'version' ? uploadSheet.documentId : undefined
          }
          onClose={() => setUploadSheet({ mode: 'closed' })}
        />
      )}

      {viewing && (
        <Suspense fallback={<FullPageSpinner label="載入中..." />}>
          <DocumentViewer
            version={viewing.version}
            document={viewing.document}
            allVersions={versionsByDocument[viewing.document.id] ?? []}
            onClose={closeViewer}
            onSelectVersion={v =>
              setViewing(prev => (prev ? { ...prev, version: v } : prev))
            }
          />
        </Suspense>
      )}
    </div>
  )
}

export default DocumentsSection
