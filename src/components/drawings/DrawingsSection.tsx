// DrawingsSection — inline section rendered under a leaf ProgressItemCard.
//
// Wires together: DrawingsContext (Plan 05) + DrawingThumbnail / DrawingUploadSheet /
// DrawingViewer (Plan 06). Lazy-loads DrawingViewer so the viewer-pdf + viewer-zoom
// chunks (defined in vite.config.ts manualChunks) are NOT pulled into the entry bundle.
//
// ROLE GATING (D-25, ISSUE-07 fix):
//   canUpload = !!profile && ['admin','pm','main_contractor'].includes(profile.global_role)
//   NEVER write the shorthand-OR variant — it always evaluates to truthy 'pm'.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { MoreVertical, Plus, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDrawings } from '../../contexts/DrawingsContext'
import { FullPageSpinner, Spinner } from '../Spinner'
import { DrawingThumbnail } from './DrawingThumbnail'
import { DrawingUploadSheet } from './DrawingUploadSheet'
import type { Drawing, DrawingVersion } from '../../types'

const DrawingViewer = lazy(() => import('./DrawingViewer').then(m => ({ default: m.DrawingViewer })))

export interface DrawingsSectionProps {
  leafItemId: string
}

type UploadSheetState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'version'; drawingId: string }

interface ViewingState {
  drawing: Drawing
  version: DrawingVersion
}

export function DrawingsSection({ leafItemId }: DrawingsSectionProps) {
  const { profile } = useAuth()
  const {
    drawings,
    versionsByDrawing,
    loading,
    fetchError,
    getThumbUrl,
    withdrawVersion,
  } = useDrawings()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [uploadSheet, setUploadSheet] = useState<UploadSheetState>({ mode: 'closed' })
  const [viewing, setViewing] = useState<ViewingState | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>({})
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  // Debounce search input (D-24 — 200ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // ISSUE-07 FIX: explicit array .includes — NOT shorthand-OR.
  const canUpload =
    !!profile && ['admin', 'pm', 'main_contractor', 'general_foreman'].includes(profile.global_role)

  // Filter to this leaf item, then by search, then sort created_at DESC (D-23)
  const itemDrawings = useMemo(() => {
    const term = search.trim().toLowerCase()
    return drawings
      .filter(d => d.leaf_item_id === leafItemId)
      .filter(d => (term ? d.title.toLowerCase().includes(term) : true))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
  }, [drawings, leafItemId, search])

  // Resolve current version per drawing — prefer linked current_version_id,
  // fall back to first (highest version_no) row in versionsByDrawing.
  function currentVersionFor(d: Drawing): DrawingVersion | null {
    const versions = versionsByDrawing[d.id] ?? []
    if (versions.length === 0) return null
    const matched = versions.find(v => v.id === d.current_version_id)
    return matched ?? versions[0]
  }

  // Fetch signed thumbnail URLs for visible drawings' current versions.
  useEffect(() => {
    let cancelled = false
    const versions = itemDrawings
      .map(d => currentVersionFor(d))
      .filter((v): v is DrawingVersion => v !== null)

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
  }, [itemDrawings.map(d => currentVersionFor(d)?.id ?? '').join(','), getThumbUrl])

  function openViewer(d: Drawing) {
    const v = currentVersionFor(d)
    if (!v) return
    setViewing({ drawing: d, version: v })
  }

  function closeViewer() {
    setViewing(null)
  }

  async function onWithdraw(version: DrawingVersion) {
    if (!window.confirm('確定撤回此版本?')) return
    const { error } = await withdrawVersion(version.id)
    if (error) window.alert(error)
    setOpenMenuId(null)
  }

  function canWithdraw(version: DrawingVersion): boolean {
    if (!profile) return false
    return version.uploaded_by === profile.id || profile.global_role === 'admin'
  }

  return (
    <div className="mt-3 pt-3 border-t border-site-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-site-900 text-sm">
          圖則 ({itemDrawings.length})
        </h3>
        {canUpload && (
          <button
            type="button"
            onClick={() => setUploadSheet({ mode: 'new' })}
            className="text-[11px] bg-safety-500 hover:bg-safety-600 text-white px-2.5 py-1 rounded-lg flex items-center gap-1 min-h-0"
          >
            <Plus size={12} /> 新增圖則
          </button>
        )}
      </div>

      {fetchError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-2">
          ⚠ 讀取圖則失敗：{fetchError}
        </div>
      )}

      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-site-400 pointer-events-none"
        />
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="搜尋圖則標題"
          className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-site-200 bg-white"
        />
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Spinner size={20} />
        </div>
      ) : itemDrawings.length === 0 ? (
        <div className="text-center py-6 px-3 bg-site-50 rounded-lg">
          <p className="text-xs text-site-500 mb-2">尚未有圖則</p>
          {canUpload && (
            <button
              type="button"
              onClick={() => setUploadSheet({ mode: 'new' })}
              className="text-[11px] bg-safety-500 hover:bg-safety-600 text-white px-2.5 py-1 rounded-lg inline-flex items-center gap-1 min-h-0"
            >
              <Plus size={12} /> 新增圖則
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {itemDrawings.map(d => {
            const v = currentVersionFor(d)
            const thumbUrl = v ? thumbUrls[v.id] ?? null : null
            return (
              <div key={d.id} className="relative">
                <DrawingThumbnail
                  drawing={d}
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
                          <button
                            type="button"
                            onClick={() => {
                              setUploadSheet({ mode: 'version', drawingId: d.id })
                              setOpenMenuId(null)
                            }}
                            className="w-full text-left text-xs px-3 py-2 text-site-700 hover:bg-site-50"
                          >
                            上載新版本
                          </button>
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
              </div>
            )
          })}
        </div>
      )}

      {uploadSheet.mode !== 'closed' && (
        <DrawingUploadSheet
          open
          leafItemId={leafItemId}
          existingDrawingId={
            uploadSheet.mode === 'version' ? uploadSheet.drawingId : undefined
          }
          onClose={() => setUploadSheet({ mode: 'closed' })}
        />
      )}

      {viewing && (
        <Suspense fallback={<FullPageSpinner label="載入中..." />}>
          <DrawingViewer
            version={viewing.version}
            drawing={viewing.drawing}
            allVersions={versionsByDrawing[viewing.drawing.id] ?? []}
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

export default DrawingsSection
