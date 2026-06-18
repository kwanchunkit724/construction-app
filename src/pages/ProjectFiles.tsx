// ProjectFiles — the project-level 文件總覽 (documents register) page.
// Route /project/:id/files, lazy-loaded, its own DocumentsProvider boundary
// (like PtwList). Reachable only when files_enabled is ON — the route in
// App.tsx is wrapped in <FilesGate>, the ToolsSwitcher card + Sidebar entry are
// flag-gated, so with the flag OFF this surface does not exist.
//
// Layout per FILE-SYSTEM-DESIGN §3.2:
//   header (文件總覽 + storage meter + refresh) · search · 類型 chips · 狀態 chips
//   · 檢視 selector (按進度項目 default / 按類型 / 按狀態) · grouped document rows.
// Default grouping = by progress item (header shows code + title + zone via
// project.zones; a 未連結項目 group for progress_item_id IS NULL). Each row taps
// into a DocumentDetailSheet (version list, review bar, 上載新版本, 撤回, the
// document_events audit timeline). A (+) 上載文件 FAB shows when canUpload.
// Honours ?item=<id> deep-link from DocumentsSection's 在文件總覽開啟.

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, RefreshCw, Search, Plus, FileText, ChevronRight,
  HardDrive, FolderOpen, History as HistoryIcon, X, CalendarClock, RotateCcw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Sidebar } from '../components/Sidebar'
import { BottomNav } from '../components/BottomNav'
import { Spinner, FullPageSpinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { useStepUp } from '../contexts/StepUpContext'
import { useProjects } from '../contexts/ProjectsContext'
import { useProgress, ProgressProvider } from '../contexts/ProgressContext'
import { DocumentsProvider, useDocuments } from '../contexts/DocumentsContext'
import { DocumentUploadSheet } from '../components/documents/DocumentUploadSheet'
import { DocumentReviewBar } from '../components/documents/DocumentReviewBar'
import { revisionLabelOrDefault } from '../lib/documents'
import { dwssRef } from '../lib/dwss'
import {
  DOCUMENT_TYPE_ZH,
  DOCUMENT_STATUS_ZH,
} from '../types'
import type {
  Document,
  DocumentVersion,
  DocumentType,
  DocumentStatus,
  DocumentEvent,
  DocumentEventType,
  ProgressItem,
  Zone,
} from '../types'

const DocumentViewer = lazy(() =>
  import('../components/documents/DocumentViewer').then(m => ({ default: m.DocumentViewer })),
)

// ── Filter option tables ──────────────────────────────────────
const TYPE_OPTIONS: DocumentType[] = [
  'material_submission',
  'method_statement',
  'drawing',
  'inspection',
  'other',
]
// 狀態 chip row — only the three review-cycle states the register surfaces
// (草稿 / 已取代 / 已撤回 are derived states, not browse filters per §3.2).
const STATUS_OPTIONS: DocumentStatus[] = ['submitted', 'approved', 'rejected']

type ViewMode = 'item' | 'type' | 'status'
const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'item', label: '按進度項目' },
  { value: 'type', label: '按類型' },
  { value: 'status', label: '按狀態' },
]

const STATUS_PILL: Record<DocumentStatus, string> = {
  draft: 'bg-site-100 text-site-500',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-50 text-red-600',
  superseded: 'bg-gray-100 text-gray-500',
  withdrawn: 'bg-red-50 text-red-600',
}

// Storage meter: amber once the project crosses ~700MB (the §2.2-4 early-warning
// threshold before a paid-tier decision).
const STORAGE_AMBER_BYTES = 700 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Today in HKT (YYYY-MM-DD) for 死線 overdue comparison.
function todayHKTDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })
}

// S8: a review deadline counts as 逾期 only while the doc is still 待審 (submitted)
// and its due date has passed.
function isReviewOverdue(dueDate: string | null, status: DocumentStatus): boolean {
  return !!dueDate && status === 'submitted' && dueDate < todayHKTDate()
}

// ── Page shell (providers) ────────────────────────────────────
export default function ProjectFilesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  // ProgressProvider supplies the leaf progress items for grouping headers +
  // the upload sheet's 進度項目 picker; DocumentsProvider is this page's own
  // boundary (the page can be deep-linked without ProjectDetail mounted).
  return (
    <ProgressProvider projectId={projectId}>
      <DocumentsProvider projectId={projectId}>
        <ProjectFilesInner projectId={projectId} />
      </DocumentsProvider>
    </ProgressProvider>
  )
}

function ProjectFilesInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { items } = useProgress()
  const {
    documents,
    versionsByDocument,
    loading,
    fetchError,
    refetch,
    canUpload,
  } = useDocuments()

  const project = projects.find(p => p.id === projectId)

  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkItem = searchParams.get('item')
  const deepLinkDoc = searchParams.get('doc')

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<DocumentType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [view, setView] = useState<ViewMode>('item')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detail, setDetail] = useState<Document | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Debounce search (200ms, drawings/section parity).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  // Leaf progress items (no children) — used for group headers + the picker.
  const leafItems = useMemo(
    () => items.filter(i => !items.some(c => c.parent_id === i.id)),
    [items],
  )
  const itemById = useMemo(() => {
    const m: Record<string, ProgressItem> = {}
    for (const it of leafItems) m[it.id] = it
    return m
  }, [leafItems])

  function zoneNameOf(item: ProgressItem | undefined): string | null {
    if (!item || !item.zone_id || !project) return null
    const zone: Zone | undefined = project.zones.find(z => z.id === item.zone_id)
    return zone?.name ?? null
  }

  // current version per document — current_version_id, else highest version_no.
  function currentVersionFor(d: Document): DocumentVersion | null {
    const versions = versionsByDocument[d.id] ?? []
    if (versions.length === 0) return null
    return versions.find(v => v.id === d.current_version_id) ?? versions[0]
  }
  function displayStatusOf(d: Document): DocumentStatus {
    return currentVersionFor(d)?.status ?? 'withdrawn'
  }

  // Apply type / status / search filters before grouping.
  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase()
    return documents.filter(d => {
      if (typeFilter !== 'all' && d.document_type !== typeFilter) return false
      if (statusFilter !== 'all' && displayStatusOf(d) !== statusFilter) return false
      if (term) {
        const inTitle = d.title.toLowerCase().includes(term)
        const inNumber = (d.doc_number ?? '').toLowerCase().includes(term)
        if (!inTitle && !inNumber) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, versionsByDocument, typeFilter, statusFilter, search])

  // Build groups for the active view.
  interface Group {
    key: string
    label: string
    sub: string | null
    docs: Document[]
  }
  const groups = useMemo<Group[]>(() => {
    const byCreated = (a: Document, b: Document) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

    if (view === 'type') {
      return TYPE_OPTIONS
        .map(t => ({
          key: t,
          label: DOCUMENT_TYPE_ZH[t],
          sub: null,
          docs: filteredDocuments.filter(d => d.document_type === t).sort(byCreated),
        }))
        .filter(g => g.docs.length > 0)
    }

    if (view === 'status') {
      const order: DocumentStatus[] = [
        'submitted', 'approved', 'rejected', 'superseded', 'withdrawn', 'draft',
      ]
      return order
        .map(s => ({
          key: s,
          label: DOCUMENT_STATUS_ZH[s],
          sub: null,
          docs: filteredDocuments.filter(d => displayStatusOf(d) === s).sort(byCreated),
        }))
        .filter(g => g.docs.length > 0)
    }

    // view === 'item' (default) — group by progress item, leaf order, then a
    // trailing 未連結項目 group for project-level docs (progress_item_id IS NULL).
    const result: Group[] = []
    for (const it of leafItems) {
      const docs = filteredDocuments
        .filter(d => d.progress_item_id === it.id)
        .sort(byCreated)
      if (docs.length === 0) continue
      const zoneName = zoneNameOf(it)
      result.push({
        key: it.id,
        label: `${it.code} ${it.title}`,
        sub: zoneName,
        docs,
      })
    }
    const unlinked = filteredDocuments
      .filter(d => !d.progress_item_id || !itemById[d.progress_item_id])
      .sort(byCreated)
    if (unlinked.length > 0) {
      result.push({ key: '__unlinked__', label: '未連結項目', sub: '工地整體', docs: unlinked })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filteredDocuments, leafItems, itemById, project])

  // Deep-link: when ?item=<id> arrives, force 按進度項目 view + scroll the group
  // into view once after the documents load.
  const scrolledRef = useRef(false)
  const appliedItemRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkItem) return
    // Force 按進度項目 view ONCE per deep-link, then leave the selector alone so
    // the user can still switch to 按類型 / 按狀態 without it snapping back.
    if (appliedItemRef.current !== deepLinkItem) {
      setView('item')
      appliedItemRef.current = deepLinkItem
      scrolledRef.current = false
    }
    if (scrolledRef.current || loading) return
    const el = window.document.getElementById(`docgroup-${deepLinkItem}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      scrolledRef.current = true
    }
  }, [deepLinkItem, loading, groups])

  // Deep-link: ?doc=<id> (from the 待我審批 cross-project feed) opens the matching
  // document's detail sheet once the documents have loaded.
  const appliedDocRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkDoc || loading) return
    if (appliedDocRef.current === deepLinkDoc) return
    const match = documents.find(d => d.id === deepLinkDoc)
    if (match) {
      setDetail(match)
      appliedDocRef.current = deepLinkDoc
    }
  }, [deepLinkDoc, loading, documents])

  // Storage meter — aggregate size_bytes across this project's versions. One
  // pass over versionsByDocument (already loaded) so no extra query is needed.
  const usedBytes = useMemo(() => {
    let total = 0
    for (const list of Object.values(versionsByDocument)) {
      for (const v of list) total += v.size_bytes ?? 0
    }
    return total
  }, [versionsByDocument])
  const storageAmber = usedBytes >= STORAGE_AMBER_BYTES

  async function manualRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-6 text-center">
          <p className="text-sm text-site-600 mb-3">找不到此工地</p>
          <button onClick={() => navigate('/home')} className="btn-ghost">回首頁</button>
        </div>
      </div>
    )
  }

  const totalShown = groups.reduce((n, g) => n + g.docs.length, 0)

  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      <Sidebar />

      <div className="flex-1 flex flex-col md:pl-60 lg:pl-64">
        {/* Sticky header */}
        <div
          className="sticky top-0 z-30 bg-white border-b border-site-200"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl md:max-w-7xl mx-auto px-2 md:px-4 py-2 flex items-center gap-1">
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="text-site-700 hover:text-site-900 p-2"
              aria-label="返回"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base md:text-lg font-bold text-site-900 truncate">文件總覽</h1>
              <p className="text-[11px] text-site-500 truncate">{project.name}</p>
            </div>
            {/* Storage meter */}
            <div
              className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg ${
                storageAmber ? 'bg-amber-100 text-amber-700' : 'bg-site-100 text-site-600'
              }`}
              title="此工地已用儲存空間"
            >
              <HardDrive size={13} />
              已用 ~{formatBytes(usedBytes)}
            </div>
            <button
              onClick={manualRefresh}
              disabled={refreshing}
              className="text-site-500 hover:text-site-800 p-2"
              aria-label="刷新"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <main className="flex-1 max-w-2xl md:max-w-7xl w-full mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-10">
          {fetchError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
              ⚠ 讀取文件失敗：{fetchError}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400 pointer-events-none" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜尋 標題 / 編號…"
              className="input pl-10"
            />
          </div>

          {/* 類型 chip row */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] text-site-400 flex-shrink-0 mr-0.5">類型</span>
              <Chip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>全部</Chip>
              {TYPE_OPTIONS.map(t => (
                <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                  {DOCUMENT_TYPE_ZH[t]}
                </Chip>
              ))}
            </div>
          </div>

          {/* 狀態 chip row */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] text-site-400 flex-shrink-0 mr-0.5">狀態</span>
              <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>全部</Chip>
              {STATUS_OPTIONS.map(s => (
                <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                  {DOCUMENT_STATUS_ZH[s]}
                </Chip>
              ))}
            </div>
          </div>

          {/* 檢視 selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] text-site-400">檢視</span>
            <select
              value={view}
              onChange={e => setView(e.target.value as ViewMode)}
              className="text-sm rounded-lg border border-site-200 bg-white px-2.5 py-1.5"
            >
              {VIEW_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-site-400">共 {totalShown} 份文件</span>
          </div>

          {/* Body */}
          {loading ? (
            <div className="py-16 flex justify-center"><Spinner size={32} /></div>
          ) : groups.length === 0 ? (
            <div className="card p-10 text-center">
              <FolderOpen size={36} className="mx-auto text-site-300 mb-2" />
              <p className="text-sm text-site-600">
                {documents.length === 0 ? '此工地尚未有文件' : '無符合條件嘅文件'}
              </p>
              {canUpload && documents.length === 0 && (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="btn-primary mt-4 inline-flex"
                >
                  <Plus size={18} /> 上載文件
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(g => (
                <section key={g.key} id={`docgroup-${g.key}`}>
                  <div className="flex items-baseline justify-between px-1 mb-1.5">
                    <div className="min-w-0">
                      <h2 className="font-bold text-site-900 text-sm truncate">{g.label}</h2>
                      {g.sub && <p className="text-[11px] text-site-400">{g.sub}</p>}
                    </div>
                    <span className="text-[11px] text-site-500 flex-shrink-0 ml-2">{g.docs.length} 份文件</span>
                  </div>
                  <div className="space-y-2">
                    {g.docs.map(d => (
                      <DocumentRow
                        key={d.id}
                        document={d}
                        version={currentVersionFor(d)}
                        onOpen={() => setDetail(d)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>

      <div className="md:hidden"><BottomNav /></div>

      {/* (+) 上載文件 FAB — visible if canUpload */}
      {canUpload && (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="fixed right-5 bottom-20 md:bottom-8 z-40 bg-safety-500 hover:bg-safety-600 text-white rounded-full shadow-card-md w-14 h-14 flex items-center justify-center"
          aria-label="上載文件"
        >
          <Plus size={26} />
        </button>
      )}

      {uploadOpen && (
        <DocumentUploadSheet
          open
          leafItems={leafItems.map(it => ({ id: it.id, code: it.code, title: it.title }))}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {detail && (
        <DocumentDetailSheet
          document={detail}
          versions={versionsByDocument[detail.id] ?? []}
          onClose={() => setDetail(null)}
          onClearDeepLink={() => {
            if (deepLinkItem || deepLinkDoc) {
              const next = new URLSearchParams(searchParams)
              next.delete('item')
              next.delete('doc')
              setSearchParams(next, { replace: true })
            }
          }}
        />
      )}
    </div>
  )
}

function Chip({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[12px] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
        active
          ? 'bg-site-900 text-white'
          : 'bg-white border border-site-200 text-site-600 hover:bg-site-50'
      }`}
    >
      {children}
    </button>
  )
}

function DocumentRow({
  document, version, onOpen,
}: {
  document: Document
  version: DocumentVersion | null
  onOpen: () => void
}) {
  const status: DocumentStatus = version?.status ?? 'withdrawn'
  const revLabel = revisionLabelOrDefault(version?.revision_label, version?.version_no ?? 1)
  const overdue = isReviewOverdue(document.review_due_date, status)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card w-full p-3 flex items-center gap-3 text-left hover:bg-site-50 transition-colors min-h-[44px]"
    >
      <div className="w-9 h-9 rounded-lg bg-site-100 text-site-500 flex items-center justify-center flex-shrink-0">
        <FileText size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {document.doc_number && (
            <span className="text-[10px] font-mono text-site-400">{document.doc_number}</span>
          )}
          <span className="text-[10px] font-semibold bg-site-100 text-site-600 px-1 rounded">
            {DOCUMENT_TYPE_ZH[document.document_type]}
          </span>
        </div>
        <div className="text-sm font-medium text-site-900 truncate">{document.title}</div>
        <div className="text-[11px] text-site-500 flex items-center gap-2 flex-wrap">
          <span>{revLabel}</span>
          {document.review_due_date && (
            <span className={`inline-flex items-center gap-0.5 ${overdue ? 'text-red-600 font-semibold' : 'text-site-400'}`}>
              <CalendarClock size={11} /> 死線 {document.review_due_date}
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[status]}`}>
          {DOCUMENT_STATUS_ZH[status]}
        </span>
        {overdue && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">逾期</span>
        )}
      </div>
      <ChevronRight size={16} className="text-site-300 flex-shrink-0" />
    </button>
  )
}

// ── DocumentDetailSheet — version list + review + audit timeline ──
const EVENT_VERB_ZH: Record<DocumentEventType, string> = {
  created: '建立咗文件',
  version_uploaded: '上載咗新版本',
  submitted: '已送審',
  approved: '已批准',
  rejected: '已拒絕',
  superseded: '已取代',
  withdrawn: '已撤回',
  migrated: '由舊系統匯入',
}

function DocumentDetailSheet({
  document: doc,
  versions,
  onClose,
  onClearDeepLink,
}: {
  document: Document
  versions: DocumentVersion[]
  onClose: () => void
  onClearDeepLink: () => void
}) {
  const { profile } = useAuth()
  const { requireStepUp } = useStepUp()
  const {
    uploaderNameById,
    canUpload,
    canReview,
    canUploadDrawingType,
    withdrawVersion,
    setReviewDueDate,
  } = useDocuments()

  const [events, setEvents] = useState<DocumentEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [actorNames, setActorNames] = useState<Record<string, string>>({})
  const [uploadVersionOpen, setUploadVersionOpen] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [viewing, setViewing] = useState<DocumentVersion | null>(null)
  const [busy, setBusy] = useState(false)
  // S8: inline 死線 edit (creator or reviewer).
  const [dueEditOpen, setDueEditOpen] = useState(false)
  const [dueInput, setDueInput] = useState(doc.review_due_date ?? '')
  const [dueSaving, setDueSaving] = useState(false)

  // Sort versions newest-first for display.
  const sortedVersions = useMemo(
    () => versions.slice().sort((a, b) => b.version_no - a.version_no),
    [versions],
  )
  const currentVersion = useMemo(
    () => sortedVersions.find(v => v.id === doc.current_version_id) ?? sortedVersions[0] ?? null,
    [sortedVersions, doc.current_version_id],
  )

  // Fetch the document_events audit timeline on demand (events table is not
  // realtime-published — §1.5 / §3.2).
  useEffect(() => {
    let cancelled = false
    setEventsLoading(true)
    supabase
      .from('document_events')
      .select('*')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setEvents([])
          setEventsLoading(false)
          return
        }
        const rows = data as DocumentEvent[]
        setEvents(rows)
        // Resolve actor names not already covered by uploaderNameById.
        const missing = Array.from(
          new Set(
            rows
              .map(e => e.actor_id)
              .filter((x): x is string => Boolean(x) && !uploaderNameById[x as string]),
          ),
        )
        if (missing.length > 0) {
          const { data: profs } = await supabase
            .from('user_profiles')
            .select('id, name')
            .in('id', missing)
          if (!cancelled && profs) {
            const m: Record<string, string> = {}
            for (const p of profs as { id: string; name: string }[]) m[p.id] = p.name
            setActorNames(m)
          }
        }
        setEventsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc.id, uploaderNameById])

  function nameFor(id: string | null): string {
    if (!id) return '系統'
    return uploaderNameById[id] || actorNames[id] || '未知'
  }

  function canWithdraw(v: DocumentVersion): boolean {
    if (!profile) return false
    if (v.status === 'withdrawn' || v.status === 'superseded') return false
    return v.submitted_by === profile.id || profile.global_role === 'admin'
  }

  async function onWithdraw(v: DocumentVersion) {
    if (!window.confirm('確定撤回此版本?')) return
    if (!(await requireStepUp('document'))) return
    setBusy(true)
    const { error } = await withdrawVersion(v.id)
    setBusy(false)
    if (error) window.alert(error)
  }

  function close() {
    onClearDeepLink()
    onClose()
  }

  const allowVersionUpload =
    canUpload && (doc.document_type !== 'drawing' || canUploadDrawingType)

  // S9: the current version is rejected → offer 重新送審 (resubmit as a new
  // version). Seed the label as the next version number + carry the reason.
  const isRejected = currentVersion?.status === 'rejected'
  const maxVersionNo = sortedVersions.reduce((m, v) => Math.max(m, v.version_no), 0)
  const overdue = currentVersion
    ? isReviewOverdue(doc.review_due_date, currentVersion.status)
    : false
  // S8: creator or any reviewer may set / change the 死線.
  const canEditDue = canReview || doc.created_by === profile?.id

  async function saveDue() {
    setDueSaving(true)
    const { error } = await setReviewDueDate(doc.id, dueInput || null)
    setDueSaving(false)
    if (error) { window.alert(error); return }
    setDueEditOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={close}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-site-100">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                {doc.doc_number && (
                  <span className="text-[11px] font-mono text-site-400">{doc.doc_number}</span>
                )}
                <span className="text-[10px] font-semibold bg-site-100 text-site-600 px-1.5 rounded">
                  {DOCUMENT_TYPE_ZH[doc.document_type]}
                </span>
              </div>
              {/* DWSS Annex A §3.1.8 format reference */}
              <p className="text-xs font-mono text-site-400 mt-0.5">DWSS: {dwssRef('document', parseInt((doc.doc_number ?? '').match(/\d+/)?.[0] ?? '0', 10))}</p>
              <h3 className="font-bold text-site-900 mt-0.5">{doc.title}</h3>
            </div>
            <button
              type="button"
              onClick={close}
              className="text-site-400 hover:text-site-700 -mr-2 -mt-1"
              aria-label="關閉"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-4">
          {/* 死線 (review deadline) — show + inline edit for creator / reviewer */}
          <div className="rounded-xl border border-site-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-site-500 inline-flex items-center gap-1">
                <CalendarClock size={13} /> 送審死線
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${overdue ? 'text-red-600' : 'text-site-800'}`}>
                  {doc.review_due_date ?? '未設定'}
                </span>
                {overdue && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">逾期</span>
                )}
                {canEditDue && !dueEditOpen && (
                  <button
                    type="button"
                    onClick={() => { setDueInput(doc.review_due_date ?? ''); setDueEditOpen(true) }}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    {doc.review_due_date ? '更改' : '設定'}
                  </button>
                )}
              </div>
            </div>
            {dueEditOpen && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={dueInput}
                  onChange={e => setDueInput(e.target.value)}
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={saveDue}
                  disabled={dueSaving}
                  className="btn-primary !min-h-[40px] !px-3 text-sm"
                >
                  {dueSaving ? <Spinner size={14} className="text-white" /> : '儲存'}
                </button>
                <button
                  type="button"
                  onClick={() => setDueEditOpen(false)}
                  className="btn-ghost !min-h-[40px] !px-3 text-sm"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* Inline reviewer controls on the current submitted version */}
          {currentVersion && <DocumentReviewBar version={currentVersion} />}

          {/* S9: 重新送審 — primary action when the current version was rejected */}
          {allowVersionUpload && isRejected && (
            <button
              type="button"
              onClick={() => setResubmitOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-safety-500 hover:bg-safety-600 py-2.5 rounded-lg"
            >
              <RotateCcw size={16} /> 重新送審
            </button>
          )}

          {/* 上載新版本 */}
          {allowVersionUpload && (
            <button
              type="button"
              onClick={() => setUploadVersionOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2 rounded-lg"
            >
              <Plus size={16} /> 上載新版本
            </button>
          )}

          {/* Version list */}
          <div>
            <h4 className="text-xs font-bold text-site-500 mb-2">版本</h4>
            <ul className="space-y-2">
              {sortedVersions.map(v => {
                const revLabel = revisionLabelOrDefault(v.revision_label, v.version_no)
                const isCurrent = v.id === doc.current_version_id
                return (
                  <li
                    key={v.id}
                    className={`rounded-xl border p-3 ${
                      isCurrent ? 'border-safety-200 bg-safety-50/40' : 'border-site-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-site-900">v{v.version_no}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[v.status]}`}>
                        {DOCUMENT_STATUS_ZH[v.status]}
                      </span>
                      <span className="text-[11px] text-site-400">{revLabel}</span>
                      <span className="ml-auto text-[11px] text-site-500">{formatBytes(v.size_bytes)}</span>
                    </div>
                    <div className="text-[11px] text-site-500 mt-1">
                      送審者：{nameFor(v.submitted_by)} · {fmtDateTime(v.submitted_at)}
                    </div>
                    {v.review_note && (
                      <div className="text-[11px] text-site-600 mt-1 bg-site-50 rounded-lg px-2 py-1 whitespace-pre-wrap">
                        審批備註：{v.review_note}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setViewing(v)}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        查看
                      </button>
                      {canWithdraw(v) && (
                        <button
                          type="button"
                          onClick={() => onWithdraw(v)}
                          disabled={busy}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                        >
                          撤回
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
              {sortedVersions.length === 0 && (
                <li className="text-sm text-site-500 text-center py-4">沒有版本記錄</li>
              )}
            </ul>
          </div>

          {/* Audit timeline */}
          <div>
            <h4 className="text-xs font-bold text-site-500 mb-2 inline-flex items-center gap-1">
              <HistoryIcon size={13} /> 記錄
            </h4>
            {eventsLoading ? (
              <div className="py-4 flex justify-center"><Spinner size={18} /></div>
            ) : events.length === 0 ? (
              <p className="text-xs text-site-400 py-2">沒有記錄</p>
            ) : (
              <ol className="space-y-1.5">
                {events.map(e => {
                  const ver = versions.find(v => v.id === e.version_id)
                  const revLabel = ver
                    ? revisionLabelOrDefault(ver.revision_label, ver.version_no)
                    : null
                  return (
                    <li key={e.id} className="text-[12px] text-site-700 flex items-start gap-1.5">
                      <span className="text-site-300 mt-1.5 flex-shrink-0">•</span>
                      <span>
                        <span className="font-medium text-site-900">{nameFor(e.actor_id)}</span>{' '}
                        {EVENT_VERB_ZH[e.event_type]}
                        {revLabel ? ` ${revLabel}` : ''}
                        <span className="text-site-400"> · {fmtDateTime(e.created_at)}</span>
                        {e.note && (
                          <span className="block text-site-500 text-[11px] mt-0.5">{e.note}</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      {uploadVersionOpen && (
        <DocumentUploadSheet
          open
          progressItemId={doc.progress_item_id ?? undefined}
          existingDocumentId={doc.id}
          onClose={() => setUploadVersionOpen(false)}
        />
      )}

      {resubmitOpen && (
        <DocumentUploadSheet
          open
          progressItemId={doc.progress_item_id ?? undefined}
          existingDocumentId={doc.id}
          suggestedRevisionLabel={`v${maxVersionNo + 1}`}
          rejectionNote={currentVersion?.review_note ?? undefined}
          onClose={() => setResubmitOpen(false)}
        />
      )}

      {viewing && (
        <Suspense fallback={<FullPageSpinner label="載入中..." />}>
          <DocumentViewer
            version={viewing}
            document={doc}
            allVersions={sortedVersions}
            onClose={() => setViewing(null)}
            onSelectVersion={v => setViewing(v)}
          />
        </Suspense>
      )}
    </div>
  )
}
