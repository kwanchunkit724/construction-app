import { useMemo, useState, useEffect, lazy, Suspense } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  ChevronLeft, Plus, Building2, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, Minus,
  ListChecks, AlertCircle, Download, FileCheck2,
  FileText, Receipt, Shield, Bot, CloudRain,
  Wrench, BookOpen, Package, CalendarDays,
  Contact as ContactIcon, FolderOpen, CalendarClock,
  Sparkles, ClipboardX, ClipboardCheck, UsersRound, FileStack, Zap, Footprints,
  PackagePlus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { UserProfile, IssueComment } from '../types'
import { Spinner } from '../components/Spinner'
import { BottomNav } from '../components/BottomNav'
import { Sidebar } from '../components/Sidebar'
import { ProgressBar } from '../components/ProgressBar'
import { ProgressItemCard } from '../components/ProgressItemCard'
import { CreateItemModal } from '../components/CreateItemModal'
import { UpdateProgressModal } from '../components/UpdateProgressModal'
import { AssignmentModal } from '../components/AssignmentModal'
import { EditItemModal } from '../components/EditItemModal'
import { HistoryModal } from '../components/HistoryModal'
import { IssueCard } from '../components/IssueCard'
import { CreateIssueModal } from '../components/CreateIssueModal'
import { CreateQuickSnagSheet } from '../components/CreateQuickSnagSheet'
import { ExportProgressModal } from '../components/ExportProgressModal'
import { TemplateManagerModal } from '../components/TemplateManagerModal'
import { FloorStructureWizard } from '../components/FloorStructureWizard'
import { BatchAssignModal } from '../components/BatchAssignModal'
import { useAiAssistantEnabled } from '../components/assistant/useAiAssistantEnabled'
import { HelpButton } from '../components/tutorial/HelpButton'
import { WeatherBanner } from '../components/WeatherBanner'
// Lazy so the 助理 chat panel (+ SSE client) stays out of the eager entry chunk.
const AssistantPanel = lazy(() => import('../components/assistant/AssistantPanel').then(m => ({ default: m.AssistantPanel })))
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { IssuesProvider, useIssues } from '../contexts/IssuesContext'
import { DrawingsProvider } from '../contexts/DrawingsContext'
import { DocumentsProvider } from '../contexts/DocumentsContext'
import { MaterialsProvider } from '../contexts/MaterialsContext'
import { useProjects } from '../contexts/ProjectsContext'
import { useAuth } from '../contexts/AuthContext'
import { useStepUp } from '../contexts/StepUpContext'
import { ModulesProvider, useModules } from '../contexts/ModulesContext'
import { computeRollup, getZoneLeaves, PROGRESS_STATUS_ZH, deriveStatus, deriveLeafStatus, plannedProgressOf, CATEGORY_DOMAIN_ZH, CATEGORY_STREAM_ZH, unitStatusCounts } from '../types'
import type { ProgressItem, ProgressStatus, Zone, CategoryDomain, CategoryStream, UnitState } from '../types'
import { templateFor } from '../lib/progressTemplates'

type Tab = 'progress' | 'issues' | 'si-vo' | 'tools' | 'equipment' | 'assistant'

const STATUS_ICON: Record<ProgressStatus, typeof Minus> = {
  'not-started': Minus,
  'in-progress': Clock,
  'completed': CheckCircle2,
  'delayed': AlertTriangle,
  'blocked': AlertTriangle,
}
const STATUS_PILL: Record<ProgressStatus, string> = {
  'not-started': 'bg-site-100 text-site-500',
  'in-progress': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
  'delayed': 'bg-red-100 text-red-700',
  'blocked': 'bg-orange-100 text-orange-700',
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/home" replace />
  return (
    // ModulesProvider must wrap the stack: ProjectDetailInner (+ its tab/tool
    // children) call useModules() to gate the in-page tabs. The /project/:id
    // route is NOT a ModuleRoute, so without this wrap useModules() throws
    // ('must be used within ModulesProvider') and the project home crashes.
    <ModulesProvider projectId={id}>
      <ProgressProvider projectId={id}>
        <IssuesProvider projectId={id}>
          <DrawingsProvider projectId={id}>
            <DocumentsProvider projectId={id}>
              <MaterialsProvider projectId={id}>
                <ProjectDetailInner projectId={id} />
              </MaterialsProvider>
            </DocumentsProvider>
          </DrawingsProvider>
        </IssuesProvider>
      </ProgressProvider>
    </ModulesProvider>
  )
}

interface CreateContext {
  parent: ProgressItem | null
  zone: Zone
}

function ProjectDetailInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { loading, items, fetchError, canEdit, refetch, deleteItem } = useProgress()
  const { issues, myRoleInProject } = useIssues()
  const { requireStepUp } = useStepUp()
  const { isModuleEnabled } = useModules()

  const project = projects.find(p => p.id === projectId)

  const aiEnabled = useAiAssistantEnabled(projectId)
  // Module gating — each tab only shows when its module is on (default-true
  // until the RPC says off, so nothing hides while loading). 進度 is core and
  // always visible. 簽核 / 工具 are multi-module gateways: shown when ANY of the
  // modules they front is enabled; the cards inside gate themselves per-module.
  const showIssuesTab = isModuleEnabled('issues')
  // 文書 tab now also fronts 文件 (documents) + 機械/表格 (equipment), moved out of 工具.
  const showSiVoTab = isModuleEnabled('si') || isModuleEnabled('vo') || isModuleEnabled('ptw')
    || isModuleEnabled('documents') || isModuleEnabled('equipment')
  const showToolsTab = isModuleEnabled('weather')
    || isModuleEnabled('materials') || isModuleEnabled('contacts')
    || isModuleEnabled('timetable') || isModuleEnabled('dailies')
  const showAssistantTab = aiEnabled && isModuleEnabled('assistant')

  const [tab, setTab] = useState<Tab>('progress')
  // v57: progress category filter (大樓/外圍 × 土建/BS)
  const [catDomain, setCatDomain] = useState<CategoryDomain | 'all'>('all')
  const [catStream, setCatStream] = useState<CategoryStream | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [createCtx, setCreateCtx] = useState<CreateContext | null>(null)
  const [updating, setUpdating] = useState<ProgressItem | null>(null)
  const [assigning, setAssigning] = useState<ProgressItem | null>(null)
  const [editing, setEditing] = useState<ProgressItem | null>(null)
  const [historyItem, setHistoryItem] = useState<ProgressItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [createIssueOpen, setCreateIssueOpen] = useState(false)
  const [createSnagOpen, setCreateSnagOpen] = useState(false)
  const [showExport, setShowExport] = useState(false)
  // v108: 工序範本 manager (create / apply project-scope templates)
  const [showTemplates, setShowTemplates] = useState(false)
  // v109: 總樓層設定 wizard (opt-in floor structure)
  const [showFloorWizard, setShowFloorWizard] = useState(false)
  // T2: 判紙批量指派
  const [showBatchAssign, setShowBatchAssign] = useState(false)

  // If the module behind the active tab gets turned off (admin toggle arrives
  // over realtime), the tab button + its content both disappear — bounce back
  // to 進度 so the user is never stranded on a now-blank tab. 進度 is core and
  // can never be disabled.
  useEffect(() => {
    const stillVisible =
      tab === 'progress'
      || (tab === 'issues' && showIssuesTab)
      || (tab === 'si-vo' && showSiVoTab)
      || (tab === 'tools' && showToolsTab)
      || (tab === 'assistant' && showAssistantTab)
    if (!stillVisible) setTab('progress')
  }, [tab, showIssuesTab, showSiVoTab, showToolsTab, showAssistantTab])

  // The 問題 tab badge counts formal open issues only — 即時問題 (snags) are a
  // separate self-handled lane with their own section/count inside the tab.
  const openIssueCount = issues.filter(i => i.status === 'open' && !i.is_quick).length

  const roots = useMemo(() => items.filter(i => i.parent_id === null), [items])

  // Auto-expand all level-1 items first time
  const autoExpanded = useMemo(() => {
    if (expanded.size > 0) return expanded
    return new Set(roots.map(r => r.id))
  }, [expanded, roots])

  function toggle(itemId: string) {
    setExpanded(prev => {
      const next = new Set(prev.size === 0 ? autoExpanded : prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

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

  // Project-type template drives per-type vocabulary + zone chrome. 'general'
  // (and existing projects) resolve to today's behaviour, so the page renders
  // byte-identical for them. autoZone types (小型工程) designed for ONE implicit
  // zone suppress the zone header by default. But if the project actually has
  // >1 zones (e.g. a reno seed with A區 + B區), hiding all zone headers makes
  // consecutive item lists indistinguishable — restore zone labels in that case.
  const template = templateFor(project.project_type)
  const hideZoneChrome = template.autoZone && project.zones.length <= 1

  // v57: narrow the tree + tiles to the selected category. The tag lives on the
  // 大項 (root); an item is visible iff its root matches. A 未分類 root only shows
  // under 全部/全部.
  const rootCategoryOf = (i: ProgressItem): { d: CategoryDomain | null; s: CategoryStream | null } => {
    let cur: ProgressItem | undefined = i
    while (cur && cur.parent_id) cur = items.find(x => x.id === cur!.parent_id)
    return { d: cur?.category_domain ?? null, s: cur?.category_stream ?? null }
  }
  const filterActive = catDomain !== 'all' || catStream !== 'all'
  const visibleItems = !filterActive ? items : items.filter(i => {
    const { d, s } = rootCategoryOf(i)
    return (catDomain === 'all' || d === catDomain) && (catStream === 'all' || s === catStream)
  })
  const visibleZones = !filterActive ? project.zones
    : project.zones.filter(z => visibleItems.some(i => i.parent_id === null && i.zone_id === z.id))

  // Stats — leaves only (within the current category view)
  const leaves = visibleItems.filter(i => !visibleItems.some(c => c.parent_id === i.id))
  // Derive status live (schedule-vs-today) to match the cards + zone rollups
  // below — the stored i.status column freezes at save time and goes stale, so
  // tiles would otherwise contradict the cards right under them.
  const effStatus = (i: ProgressItem) => deriveLeafStatus(i, plannedProgressOf(i))
  const completed = leaves.filter(i => effStatus(i) === 'completed').length
  const inProgress = leaves.filter(i => effStatus(i) === 'in-progress').length
  const delayed = leaves.filter(i => effStatus(i) === 'delayed').length
  const notStarted = leaves.filter(i => effStatus(i) === 'not-started').length

  // P3: 大樓維修 earliest-completion tile. The 法定命令 deadline reuses planned_end
  // on the L1 (root / 座) items — we take the EARLIEST planned_end across all
  // roots as the target, then days = ceil((target − today)/day). Negative = overdue.
  // Relabelled 最早完工目標 (not 法定限期) because it's just the earliest planned_end,
  // not a true statutory order date. Only computed for maintenance; other types
  // are byte-identical to before.
  const isMaintenance = template.kpiTiles === 'maintenance'
  const isDrainage = template.kpiTiles === 'drainage'
  const isSmallWorks = template.kpiTiles === 'small-works'
  const earliestCompletion = useMemo(() => {
    if (!isMaintenance && !isSmallWorks) return null
    const ends = items
      .filter(i => i.parent_id === null && i.planned_end)
      .map(i => i.planned_end as string)
      .sort()
    if (ends.length === 0) return null
    const earliest = ends[0]
    const todayMs = new Date(new Date().toDateString()).getTime()
    const endMs = new Date(earliest + 'T00:00:00').getTime()
    if (Number.isNaN(endMs)) return null
    const days = Math.ceil((endMs - todayMs) / 86400000)
    return { date: earliest, days }
  }, [isMaintenance, isSmallWorks, items])

  // Maintenance KPI: 已簽收 / 已修復 counts across all unit_status leaves.
  const maintenanceCounts = useMemo(() => {
    if (!isMaintenance) return null
    let signedOff = 0
    let fixed = 0
    let total = 0
    for (const leaf of leaves) {
      if (leaf.tracking_mode === 'unit_status') {
        const c = unitStatusCounts(
          leaf.label_status as Record<string, UnitState> | null,
          leaf.floor_labels ?? [],
        )
        signedOff += c.signedOff
        fixed += c.fixed
        total += c.total
      }
    }
    return { signedOff, fixed, total }
  }, [isMaintenance, leaves])

  // Drainage KPI: aggregate qtySum/qtyTotal/qtyUnit across all zones.
  // Only shown when every leaf is quantity-mode sharing one unit (qtySum non-null).
  const drainageRollup = useMemo(() => {
    if (!isDrainage) return null
    const allLeaves = project.zones.flatMap(z => getZoneLeaves(items, z.id))
    const r = computeRollup(allLeaves)
    if (r.qtySum === null || r.qtyTotal === null) return null
    // Earliest L1 planned_end → distance-to-completion tile
    const ends = items
      .filter(i => i.parent_id === null && i.planned_end)
      .map(i => i.planned_end as string)
      .sort()
    let daysToCompletion: number | null = null
    let completionDate: string | null = null
    if (ends.length > 0) {
      const todayMs = new Date(new Date().toDateString()).getTime()
      const endMs = new Date(ends[0] + 'T00:00:00').getTime()
      if (!Number.isNaN(endMs)) {
        daysToCompletion = Math.ceil((endMs - todayMs) / 86400000)
        completionDate = ends[0]
      }
    }
    return {
      qtySum: r.qtySum,
      qtyTotal: r.qtyTotal,
      qtyUnit: r.qtyUnit ?? '',
      daysToCompletion,
      completionDate,
    }
  }, [isDrainage, items, project.zones])

  const expandedSet = expanded.size === 0 ? autoExpanded : expanded

  // Find a zone to use as fallback when adding from a child item (sub-items inherit parent's zone)
  const projectZones = project.zones
  function zoneOf(parent: ProgressItem | null, fallbackZone: Zone): Zone {
    if (!parent) return fallbackZone
    return projectZones.find(z => z.id === parent.zone_id) ?? fallbackZone
  }

  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      <Sidebar />

      <div className="flex-1 flex flex-col md:pl-60 lg:pl-64">
      {/* Sticky top bar: header + tabs pinned together as ONE unit. Previously
          they were two separate sticky elements and the tabs used a hardcoded
          top-[44px] offset that did NOT match the real header height (~61px,
          taller with iOS safe-area / browser zoom / large fonts). The mismatch
          let the higher-z header overlap the tabs and, on taller headers, the
          list — "project bar blocks the list". One sticky wrapper = no magic
          offset to drift, bar can never cover the list. */}
      <div
        className="sticky top-0 z-30 bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
      <header className="bg-white border-b border-site-200">
        <div className="max-w-2xl md:max-w-7xl mx-auto px-2 md:px-4 py-2 flex items-center gap-1">
          <button onClick={() => navigate('/home')} className="text-site-700 hover:text-site-900 p-2" aria-label="返回">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base md:text-lg font-bold text-site-900 truncate">{project.name}</h1>
            <p className="text-[11px] text-site-500">
              {hideZoneChrome
                ? `${items.length} 個進度項目`
                : `${project.zones.length} 個分區 · ${items.length} 個進度項目`}
            </p>
          </div>
          <ExportMenu
            tab={tab}
            onExportProgress={() => setShowExport(true)}
            onExportIssuesXlsx={async () => {
              if (!project) return
              // S23b: the v47 get_issue_actor_profiles RPC now also resolves
              // comment authors, so it alone is authoritative — drop the old
              // RLS-narrowed user_profiles pre-query (it hid ex-members anyway).
              // SECURITY DEFINER, gated on the same can_view_project predicate as
              // the issues SELECT policy → only names of actors the caller can see.
              const users: Record<string, UserProfile> = {}
              const { data: actors } = await supabase.rpc('get_issue_actor_profiles', { p_project_id: project.id })
              if (actors) for (const a of actors as Array<{ id: string; name: string }>) {
                users[a.id] = { id: a.id, name: a.name } as UserProfile
              }
              // S17: one comments query for the 處理紀錄 sheet (issue counts are
              // small; chunk the .in() at 200 ids if it ever grows).
              let comments: IssueComment[] = []
              const issueIds = issues.map(i => i.id)
              if (issueIds.length > 0) {
                const { data: cs } = await supabase
                  .from('issue_comments')
                  .select('*')
                  .in('issue_id', issueIds)
                  .order('created_at', { ascending: true })
                if (cs) comments = cs as IssueComment[]
              }
              const { exportIssuesToExcel } = await import('../lib/export')
              await exportIssuesToExcel(project, issues, users, comments)
            }}
          />
          <button onClick={manualRefresh} disabled={refreshing} className="text-site-500 hover:text-site-800 p-2" aria-label="刷新">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Tabs — inside the sticky wrapper above (no own sticky offset) */}
      <div className="bg-white border-b border-site-200">
        <div className="max-w-2xl md:max-w-7xl mx-auto flex">
          <TabButton active={tab === 'progress'} onClick={() => setTab('progress')} icon={ListChecks} label="進度" />
          {showIssuesTab && <TabButton active={tab === 'issues'} onClick={() => setTab('issues')} icon={AlertCircle} label="問題" badge={openIssueCount} />}
          {showSiVoTab && <TabButton active={tab === 'si-vo'} onClick={() => setTab('si-vo')} icon={FileCheck2} label="文書" />}
          {showToolsTab && <TabButton active={tab === 'tools'} onClick={() => setTab('tools')} icon={Wrench} label="工具" />}
          {showAssistantTab && <TabButton active={tab === 'assistant'} onClick={() => setTab('assistant')} icon={Bot} label="助理" />}
        </div>
      </div>
      </div>

      <main className="flex-1 max-w-2xl md:max-w-7xl w-full mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-10">
        <WeatherBanner />
        {fetchError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            ⚠ 讀取失敗：{fetchError}
          </div>
        )}

        {tab === 'progress' && (
          <>
            {isMaintenance && earliestCompletion && (
              <EarliestCompletionTile date={earliestCompletion.date} days={earliestCompletion.days} />
            )}
            {isSmallWorks && earliestCompletion && (
              <EarliestCompletionTile date={earliestCompletion.date} days={earliestCompletion.days} label="距交場" />
            )}
            {isMaintenance && maintenanceCounts && maintenanceCounts.total > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="已簽收" count={maintenanceCounts.signedOff} color="text-green-700 bg-green-50 border-green-200" />
                <Stat label="已修復" count={maintenanceCounts.fixed} color="text-blue-700 bg-blue-50 border-blue-200" />
                <Stat label="共" count={maintenanceCounts.total} color="text-site-700 bg-site-50 border-site-200" />
              </div>
            )}
            {isDrainage && drainageRollup && (
              <DrainageKpiStrip
                qtySum={drainageRollup.qtySum}
                qtyTotal={drainageRollup.qtyTotal}
                qtyUnit={drainageRollup.qtyUnit}
                daysToCompletion={drainageRollup.daysToCompletion}
                completionDate={drainageRollup.completionDate}
              />
            )}
            {items.some(i => i.category_domain || i.category_stream) && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {([['all', '全部範疇'], ['building', CATEGORY_DOMAIN_ZH.building], ['external', CATEGORY_DOMAIN_ZH.external]] as [CategoryDomain | 'all', string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setCatDomain(k)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${catDomain === k ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'}`}>{l}</button>
                ))}
                <span className="text-site-300">·</span>
                {([['all', '所有領域'], ['civil', CATEGORY_STREAM_ZH.civil], ['bs', CATEGORY_STREAM_ZH.bs]] as [CategoryStream | 'all', string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setCatStream(k)} className={`text-xs px-2.5 py-1 rounded-full font-medium ${catStream === k ? 'bg-site-700 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'}`}>{l}</button>
                ))}
              </div>
            )}
            {leaves.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <Stat label="已完成" count={completed} color="text-green-700 bg-green-50 border-green-200" />
                <Stat label="進行中" count={inProgress} color="text-blue-700 bg-blue-50 border-blue-200" />
                <Stat label="落後" count={delayed} color="text-red-700 bg-red-50 border-red-200" />
                <Stat label="未開始" count={notStarted} color="text-site-700 bg-site-50 border-site-200" />
              </div>
            )}
            {canEdit && (
              <div className="flex justify-end gap-2 mb-3">
                <button
                  onClick={() => setShowFloorWizard(true)}
                  className="text-xs font-semibold text-site-600 hover:text-site-900 bg-white border border-site-200 hover:bg-site-50 rounded-xl px-3 py-2 inline-flex items-center gap-1.5 min-h-0"
                >
                  <Building2 size={14} /> 總樓層設定
                </button>
                <button
                  onClick={() => setShowTemplates(true)}
                  className="text-xs font-semibold text-site-600 hover:text-site-900 bg-white border border-site-200 hover:bg-site-50 rounded-xl px-3 py-2 inline-flex items-center gap-1.5 min-h-0"
                >
                  <PackagePlus size={14} /> 工序範本
                </button>
                <button
                  onClick={() => setShowBatchAssign(true)}
                  className="text-xs font-semibold text-site-600 hover:text-site-900 bg-white border border-site-200 hover:bg-site-50 rounded-xl px-3 py-2 inline-flex items-center gap-1.5 min-h-0"
                >
                  <UsersRound size={14} /> 批量指派
                </button>
              </div>
            )}

            {loading ? (
              <div className="py-10 flex justify-center"><Spinner size={28} /></div>
            ) : project.zones.length === 0 && !hideZoneChrome ? (
              // Dead-end only for zone-based types with no zones yet. autoZone
              // types (小型工程) always have their implicit zone, and we never
              // want to push them to "go ask an admin for a 分區".
              <div className="card p-10 text-center">
                <Building2 size={36} className="mx-auto text-site-300 mb-2" />
                <p className="text-sm text-site-600">此工地尚未設定分區</p>
                <p className="text-xs text-site-400 mt-1">請 Admin 在「管理」頁編輯工地加入分區</p>
              </div>
            ) : (
              <div className="space-y-5 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
                {(filterActive ? visibleZones : project.zones).length === 0 ? (
                  <div className="card p-8 text-center md:col-span-2 lg:col-span-3">
                    <p className="text-sm text-site-500">呢個分類冇項目。</p>
                  </div>
                ) : (filterActive ? visibleZones : project.zones).map(zone => (
                  <ZoneSection
                    key={zone.id}
                    zone={zone}
                    items={visibleItems}
                    expanded={expandedSet}
                    canEdit={canEdit}
                    hideZoneHeader={hideZoneChrome}
                    onToggle={toggle}
                    onAddRoot={() => setCreateCtx({ parent: null, zone })}
                    onUpdate={setUpdating}
                    onAddChild={parent => setCreateCtx({ parent, zone: zoneOf(parent, zone) })}
                    onAssign={setAssigning}
                    onHistory={setHistoryItem}
                    onEdit={setEditing}
                    onDelete={async item => {
                      if (!(await requireStepUp('progress_delete'))) return
                      await deleteItem(item.id)
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'issues' && showIssuesTab && (
          <IssuesTab
            projectId={projectId}
            canReport={!!myRoleInProject}
            onCreate={() => setCreateIssueOpen(true)}
            onCreateSnag={() => setCreateSnagOpen(true)}
          />
        )}

        {tab === 'si-vo' && showSiVoTab && (
          <SiVoSwitcher projectId={projectId} />
        )}
        {tab === 'tools' && showToolsTab && (
          <ToolsSwitcher projectId={projectId} />
        )}
        {/* Keep the assistant MOUNTED across tab switches so the conversation is
            NOT reset (item #8) — just hide it when another tab is active. */}
        {showAssistantTab && (
          <div style={tab === 'assistant' ? undefined : { display: 'none' }}>
            <div className="flex justify-end mb-2">
              <HelpButton tutorialKey="ai-assistant" variant="pill" />
            </div>
            <Suspense fallback={<div className="py-10 flex justify-center"><Spinner size={28} /></div>}>
              <AssistantPanel projectId={projectId} />
            </Suspense>
          </div>
        )}
      </main>
      </div>

      <div className="md:hidden"><BottomNav /></div>

      {createCtx && (
        <CreateItemModal
          open={!!createCtx}
          onClose={() => setCreateCtx(null)}
          parent={createCtx.parent}
          zone={createCtx.zone}
        />
      )}
      <UpdateProgressModal
        open={!!updating}
        onClose={() => setUpdating(null)}
        item={updating}
      />
      <AssignmentModal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        item={assigning}
      />
      <EditItemModal
        open={!!editing}
        onClose={() => setEditing(null)}
        item={editing}
      />
      <HistoryModal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        item={historyItem}
      />
      <CreateIssueModal
        open={createIssueOpen}
        onClose={() => setCreateIssueOpen(false)}
        projectId={projectId}
      />
      <CreateQuickSnagSheet
        open={createSnagOpen}
        onClose={() => setCreateSnagOpen(false)}
        projectId={projectId}
      />
      {showExport && (
        <ExportProgressModal project={project} items={items} onClose={() => setShowExport(false)} />
      )}
      <TemplateManagerModal
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        zones={project.zones}
      />
      <FloorStructureWizard
        open={showFloorWizard}
        onClose={() => setShowFloorWizard(false)}
        zones={project.zones}
        projectId={projectId}
      />
      <BatchAssignModal
        open={showBatchAssign}
        onClose={() => setShowBatchAssign(false)}
        zones={project.zones}
        projectId={projectId}
      />
    </div>
  )
}

function TabButton({
  active, onClick, icon: Icon, label, badge,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ListChecks
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-colors ${
        active ? 'border-safety-500 text-safety-600' : 'border-transparent text-site-400 hover:text-site-700'
      }`}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="ml-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
          {badge}
        </span>
      )}
    </button>
  )
}

function IssuesTab({
  projectId, canReport, onCreate, onCreateSnag,
}: {
  projectId: string
  canReport: boolean
  onCreate: () => void
  onCreateSnag: () => void
}) {
  const { loading, issues } = useIssues()
  // 即時問題 (snags) are a separate self-handled lane — split them out so they
  // don't mix with the formal escalation issues.
  const formal = issues.filter(i => !i.is_quick)
  const snags = issues.filter(i => i.is_quick)
  const open = formal.filter(i => i.status === 'open')
  const resolved = formal.filter(i => i.status === 'resolved')
  const openSnags = snags.filter(i => i.status === 'open')
  const doneSnags = snags.filter(i => i.status === 'resolved')

  return (
    <>
      {canReport && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={onCreate} className="btn-primary flex items-center justify-center gap-1.5">
            <Plus size={18} /> 報告問題
          </button>
          <button onClick={onCreateSnag} className="btn-ghost flex items-center justify-center gap-1.5">
            <Zap size={18} /> 即時問題
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : issues.length === 0 ? (
        <div className="card p-10 text-center">
          <AlertCircle size={36} className="mx-auto text-site-300 mb-2" />
          <p className="text-sm text-site-600">未有問題記錄</p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h3 className="font-bold text-site-900">處理中</h3>
                <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{open.length}</span>
              </div>
              {open.map(issue => <IssueCard key={issue.id} issue={issue} projectId={projectId} />)}
            </section>
          )}
          {openSnags.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h3 className="font-bold text-site-900 flex items-center gap-1.5">
                  <Zap size={15} className="text-safety-500" /> 即時問題
                </h3>
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{openSnags.length}</span>
              </div>
              {openSnags.map(issue => <IssueCard key={issue.id} issue={issue} projectId={projectId} />)}
            </section>
          )}
          {resolved.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h3 className="font-bold text-site-900">已解決</h3>
                <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{resolved.length}</span>
              </div>
              {resolved.map(issue => <IssueCard key={issue.id} issue={issue} projectId={projectId} />)}
            </section>
          )}
          {doneSnags.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-2">
                <h3 className="font-bold text-site-900">已完成即時問題</h3>
                <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{doneSnags.length}</span>
              </div>
              {doneSnags.map(issue => <IssueCard key={issue.id} issue={issue} projectId={projectId} />)}
            </section>
          )}
        </>
      )}
    </>
  )
}

function ZoneSection({
  zone, items, expanded, canEdit, hideZoneHeader = false,
  onToggle, onAddRoot, onUpdate, onAddChild, onAssign, onHistory, onEdit, onDelete,
}: {
  zone: Zone
  items: ProgressItem[]
  expanded: Set<string>
  canEdit: boolean
  // autoZone types (小型工程) hide the 分區 header card entirely — there is one
  // implicit zone, so a zone header would be noise. Editors still get a bare
  // "加入大項" button so they can add items.
  hideZoneHeader?: boolean
  onToggle: (id: string) => void
  onAddRoot: () => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onHistory: (item: ProgressItem) => void
  onEdit: (item: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}) {
  const zoneRoots = items.filter(i => i.parent_id === null && i.zone_id === zone.id)
  const rollup = computeRollup(getZoneLeaves(items, zone.id))
  const StatusIcon = STATUS_ICON[rollup.status] ?? Minus

  return (
    <section>
      {hideZoneHeader ? (
        // No zone chrome for autoZone types — just the add-item affordance.
        canEdit && (
          <button
            onClick={onAddRoot}
            className="mb-2 w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2 rounded-lg"
          >
            <Plus size={16} /> 加入大項
          </button>
        )
      ) : (
      /* Zone header */
      <div className="card-md p-4 mb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-site-500 flex-shrink-0">{zone.id}</span>
              <h2 className="font-bold text-site-900 truncate">{zone.name}</h2>
            </div>
            <p className="text-[11px] text-site-400 mt-0.5">
              {rollup.leafCount === 0 ? '尚未有進度項目' : `${rollup.leafCount} 個 leaf 項目自動匯總`}
            </p>
          </div>
          <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[rollup.status]}`}>
            <StatusIcon size={11} />
            {PROGRESS_STATUS_ZH[rollup.status]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ProgressBar
            value={rollup.actual}
            planned={rollup.planned}
            status={rollup.status}
            className="flex-1"
          />
          <span className="text-sm font-bold text-site-900 flex-shrink-0">{rollup.actual}%</span>
          <span className="text-xs text-site-500 flex-shrink-0">/ 計劃 {rollup.planned}%</span>
        </div>

        {canEdit && (
          <button
            onClick={onAddRoot}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2 rounded-lg"
          >
            <Plus size={16} /> 加入大項
          </button>
        )}
      </div>
      )}

      {/* Items in this zone */}
      {zoneRoots.length === 0 ? (
        !canEdit && (
          <div className="text-center text-xs text-site-400 py-3">— 暫無項目 —</div>
        )
      ) : (
        <div>
          {zoneRoots.map(root => (
            <ProgressItemCard
              key={root.id}
              item={root}
              expanded={expanded}
              onToggle={onToggle}
              onUpdate={onUpdate}
              onAddChild={onAddChild}
              onAssign={onAssign}
              onHistory={onHistory}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SiVoSwitcher({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const { isModuleEnabled } = useModules()
  // PTW visibility is governed solely by the per-project module switch.
  const showPtw = isModuleEnabled('ptw')
  // 文件 (documents) + 機械/表格 (equipment) now live in the 文書 tab too.
  const showFiles = isModuleEnabled('documents')
  // 機械/表格 — gated on the equipment module AND the equipment_register INSERT
  // role set (admin / assigned PM / approved pm·main_contractor·safety_officer).
  const showEquipment = isModuleEnabled('equipment') && (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const m = memberships.find(
      mb => mb.user_id === profile.id && mb.project_id === projectId && mb.status === 'approved',
    )
    return !!m && ['pm', 'main_contractor', 'safety_officer'].includes(m.role)
  })()
  return (
    <div className="space-y-3">
      <p className="text-sm text-site-600 px-1">
        文書管理：指令 · 文件 · 機械表格
      </p>
      {isModuleEnabled('si') && (
      <button
        onClick={() => navigate(`/project/${projectId}/si`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
          <FileText size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">工地指令</p>
          <p className="text-xs text-site-500 mt-0.5">SI · 主判 / 分判工程指示與審批</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {isModuleEnabled('vo') && (
      <button
        onClick={() => navigate(`/project/${projectId}/vo`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
          <Receipt size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">變更指令</p>
          <p className="text-xs text-site-500 mt-0.5">VO · 費用變更與經系統核算總額 (HKD)</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {showPtw && (
        <button
          onClick={() => navigate(`/project/${projectId}/ptw`)}
          className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center flex-shrink-0">
            <Shield size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-site-900">工作許可證</p>
            <p className="text-xs text-site-500 mt-0.5">PTW · 動火 / 高空 / 吊運 + 安全主任簽核</p>
          </div>
          <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
        </button>
      )}
      {showFiles && (
        <button
          onClick={() => navigate(`/project/${projectId}/files`)}
          className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
        >
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-site-900">文件</p>
            <p className="text-xs text-site-500 mt-0.5">物料送審 · 施工方案 · 圖則 · 檢驗記錄</p>
          </div>
          <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
        </button>
      )}
      {showEquipment && (
        <button
          onClick={() => navigate(`/project/${projectId}/equipment`)}
          className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
        >
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center flex-shrink-0">
            <Wrench size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-site-900">機械 / 表格</p>
            <p className="text-xs text-site-500 mt-0.5">棚架 · 吊機 · 吊船法定週期檢查 · 手機簽署</p>
          </div>
          <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
        </button>
      )}
    </div>
  )
}

// v1.2 mobile entry point for the three new feature surfaces. Sidebar
// covers desktop; mobile users land here from the 工具 tab strip.
function ToolsSwitcher({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isModuleEnabled } = useModules()

  return (
    <div className="space-y-3">
      <p className="text-sm text-site-600 px-1">
        工地工具：選擇要使用的功能
      </p>
      {/* 天氣記錄 — admin interface only (item #17). */}
      {isModuleEnabled('weather') && profile?.global_role === 'admin' && (
      <button
        onClick={() => navigate(`/project/${projectId}/weather`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
      >
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
          <CloudRain size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">天氣記錄</p>
          <p className="text-xs text-site-500 mt-0.5">實時警告 · 極端天氣日 · EOT 延期申索（天文台數據）</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {/* 機械/表格 + 文件 moved to the 文書 tab (items #9, #14). */}
      {isModuleEnabled('dailies') && (
      <button
        onClick={() => navigate(`/project/${projectId}/daily`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
      >
        <div className="w-11 h-11 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center flex-shrink-0">
          <BookOpen size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">每日日誌</p>
          <p className="text-xs text-site-500 mt-0.5">每日工地記錄 · 天氣 · 完成項目 · 備註</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {isModuleEnabled('materials') && (
      <button
        onClick={() => navigate(`/project/${projectId}/materials`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
      >
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Package size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">物料</p>
          <p className="text-xs text-site-500 mt-0.5">叫料 · 預計到貨 · 入貨進度</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {isModuleEnabled('timetable') && (
      <button
        onClick={() => navigate(`/project/${projectId}/timetable`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
      >
        <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center flex-shrink-0">
          <CalendarDays size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">行事曆</p>
          <p className="text-xs text-site-500 mt-0.5">物料到貨 · 進度完工 · 會議與檢查</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {isModuleEnabled('contacts') && (
      <button
        onClick={() => navigate(`/project/${projectId}/contacts`)}
        className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px]"
      >
        <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
          <ContactIcon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-site-900">聯絡人</p>
          <p className="text-xs text-site-500 mt-0.5">行頭通訊錄 · 一鍵打電話</p>
        </div>
        <ChevronLeft size={18} className="text-site-300 rotate-180 flex-shrink-0" />
      </button>
      )}
      {/* 清潔檢查 / RISC / 受控文件 / 巡查 modules removed from the UI (owner request). */}
    </div>
  )
}

function Stat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-xl border p-2 text-center ${color}`}>
      <p className="text-xl font-black leading-none">{count}</p>
      <p className="text-[10px] mt-0.5 font-medium">{label}</p>
    </div>
  )
}

// P3: 大樓維修 earliest-completion banner. Relabelled 最早完工目標 instead of
// 法定限期 — the date is the earliest L1 planned_end, not a statutory order.
// days < 0 = 已逾期 (red), ≤ 14 = 緊迫 (amber), else informational (blue).
function EarliestCompletionTile({ date, days, label }: { date: string; days: number; label?: string }) {
  const overdue = days < 0
  const urgent = days >= 0 && days <= 14
  const color = overdue
    ? 'bg-red-50 border-red-200 text-red-700'
    : urgent
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-blue-50 border-blue-200 text-blue-700'
  const heading = label ?? '最早完工目標'
  const body = overdue
    ? `已逾期 ${Math.abs(days)} 日`
    : label
      ? `${label} ${days} 日`
      : `距完工目標 ${days} 日`
  return (
    <div className={`rounded-xl border p-3 mb-3 flex items-center gap-3 ${color}`}>
      <CalendarClock size={22} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium opacity-80">{heading}</p>
        <p className="text-sm font-bold">{body}</p>
      </div>
      <span className="text-xs font-mono font-semibold flex-shrink-0">{date}</span>
    </div>
  )
}

// P2: 渠務 KPI strip. Shows Σ已鋪/共 in the project's native unit plus a
// 距完工 tile derived from the earliest L1 planned_end. Only rendered when
// every leaf is quantity-mode with the same unit (qtySum non-null).
function DrainageKpiStrip({
  qtySum, qtyTotal, qtyUnit, daysToCompletion, completionDate,
}: {
  qtySum: number
  qtyTotal: number
  qtyUnit: string
  daysToCompletion: number | null
  completionDate: string | null
}) {
  const pct = qtyTotal > 0 ? Math.round((qtySum / qtyTotal) * 100) : 0
  return (
    <div className="flex gap-2 mb-3 flex-wrap">
      <div className="flex-1 min-w-[140px] rounded-xl border bg-teal-50 border-teal-200 text-teal-700 p-3">
        <p className="text-[11px] font-medium opacity-80">已鋪 / 共</p>
        <p className="text-lg font-black leading-tight">
          {qtySum}<span className="text-xs font-semibold ml-0.5">{qtyUnit}</span>
          <span className="text-sm font-semibold text-teal-500 mx-1">/</span>
          {qtyTotal}<span className="text-xs font-semibold ml-0.5">{qtyUnit}</span>
        </p>
        <p className="text-xs font-medium mt-0.5 opacity-70">{pct}% 完成</p>
      </div>
      {daysToCompletion !== null && completionDate && (() => {
        const overdue = daysToCompletion < 0
        const urgent = daysToCompletion >= 0 && daysToCompletion <= 14
        const color = overdue
          ? 'bg-red-50 border-red-200 text-red-700'
          : urgent
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        return (
          <div className={`flex-1 min-w-[140px] rounded-xl border p-3 ${color}`}>
            <p className="text-[11px] font-medium opacity-80">最早完工目標</p>
            <p className="text-lg font-black leading-tight">
              {overdue ? `逾期 ${Math.abs(daysToCompletion)} 日` : `${daysToCompletion} 日`}
            </p>
            <p className="text-xs font-medium mt-0.5 opacity-70">{completionDate}</p>
          </div>
        )
      })()}
    </div>
  )
}

function ExportMenu({
  tab, onExportProgress, onExportIssuesXlsx,
}: {
  tab: Tab
  onExportProgress: () => void
  onExportIssuesXlsx: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-site-500 hover:text-site-800 p-2"
        aria-label="匯出"
      >
        <Download size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-site-200 shadow-card-md py-1 min-w-[160px] z-40">
            {tab === 'progress' && (
              <MenuItem label="匯出進度報告…" onClick={() => { onExportProgress(); setOpen(false) }} />
            )}
            {tab === 'issues' && (
              <MenuItem label="匯出 Excel" onClick={() => { void onExportIssuesXlsx(); setOpen(false) }} />
            )}
            {(tab === 'si-vo' || tab === 'tools') && (
              <MenuItem label="此頁面冇匯出選項" onClick={() => setOpen(false)} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2 text-sm text-site-700 hover:bg-site-50 min-h-0"
    >
      {label}
    </button>
  )
}
