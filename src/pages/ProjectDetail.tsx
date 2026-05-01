import { useMemo, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  ChevronLeft, Plus, Building2, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, Minus,
  ListChecks, AlertCircle,
} from 'lucide-react'
import { Spinner } from '../components/Spinner'
import { BottomNav } from '../components/BottomNav'
import { ProgressBar } from '../components/ProgressBar'
import { ProgressItemCard } from '../components/ProgressItemCard'
import { CreateItemModal } from '../components/CreateItemModal'
import { UpdateProgressModal } from '../components/UpdateProgressModal'
import { AssignmentModal } from '../components/AssignmentModal'
import { HistoryModal } from '../components/HistoryModal'
import { IssueCard } from '../components/IssueCard'
import { CreateIssueModal } from '../components/CreateIssueModal'
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { IssuesProvider, useIssues } from '../contexts/IssuesContext'
import { useProjects } from '../contexts/ProjectsContext'
import { computeRollup, getZoneLeaves, PROGRESS_STATUS_ZH } from '../types'
import type { ProgressItem, ProgressStatus, Zone } from '../types'

type Tab = 'progress' | 'issues'

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
    <ProgressProvider projectId={id}>
      <IssuesProvider projectId={id}>
        <ProjectDetailInner projectId={id} />
      </IssuesProvider>
    </ProgressProvider>
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

  const project = projects.find(p => p.id === projectId)

  const [tab, setTab] = useState<Tab>('progress')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [createCtx, setCreateCtx] = useState<CreateContext | null>(null)
  const [updating, setUpdating] = useState<ProgressItem | null>(null)
  const [assigning, setAssigning] = useState<ProgressItem | null>(null)
  const [historyItem, setHistoryItem] = useState<ProgressItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [createIssueOpen, setCreateIssueOpen] = useState(false)

  const openIssueCount = issues.filter(i => i.status === 'open').length

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

  // Stats — leaves only (across whole project)
  const leaves = items.filter(i => !items.some(c => c.parent_id === i.id))
  const completed = leaves.filter(i => i.status === 'completed').length
  const inProgress = leaves.filter(i => i.status === 'in-progress').length
  const delayed = leaves.filter(i => i.status === 'delayed').length
  const notStarted = leaves.filter(i => i.status === 'not-started').length

  const expandedSet = expanded.size === 0 ? autoExpanded : expanded

  // Find a zone to use as fallback when adding from a child item (sub-items inherit parent's zone)
  const projectZones = project.zones
  function zoneOf(parent: ProgressItem | null, fallbackZone: Zone): Zone {
    if (!parent) return fallbackZone
    return projectZones.find(z => z.id === parent.zone_id) ?? fallbackZone
  }

  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      <header
        className="sticky top-0 z-30 bg-white border-b border-site-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl mx-auto px-2 py-2 flex items-center gap-1">
          <button onClick={() => navigate('/home')} className="text-site-700 hover:text-site-900 p-2" aria-label="返回">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-site-900 truncate">{project.name}</h1>
            <p className="text-[11px] text-site-500">{project.zones.length} 個分區 · {items.length} 個進度項目</p>
          </div>
          <button onClick={manualRefresh} disabled={refreshing} className="text-site-500 hover:text-site-800 p-2" aria-label="刷新">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-site-200 sticky top-[calc(env(safe-area-inset-top)+44px)] z-20">
        <div className="max-w-2xl mx-auto flex">
          <TabButton active={tab === 'progress'} onClick={() => setTab('progress')} icon={ListChecks} label="進度" />
          <TabButton active={tab === 'issues'} onClick={() => setTab('issues')} icon={AlertCircle} label="問題" badge={openIssueCount} />
        </div>
      </div>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 pb-24">
        {fetchError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            ⚠ 讀取失敗：{fetchError}
          </div>
        )}

        {tab === 'progress' && (
          <>
            {leaves.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <Stat label="已完成" count={completed} color="text-green-700 bg-green-50 border-green-200" />
                <Stat label="進行中" count={inProgress} color="text-blue-700 bg-blue-50 border-blue-200" />
                <Stat label="落後" count={delayed} color="text-red-700 bg-red-50 border-red-200" />
                <Stat label="未開始" count={notStarted} color="text-site-700 bg-site-50 border-site-200" />
              </div>
            )}

            {loading ? (
              <div className="py-10 flex justify-center"><Spinner size={28} /></div>
            ) : project.zones.length === 0 ? (
              <div className="card p-10 text-center">
                <Building2 size={36} className="mx-auto text-site-300 mb-2" />
                <p className="text-sm text-site-600">此工地尚未設定分區</p>
                <p className="text-xs text-site-400 mt-1">請 Admin 在「管理」頁編輯工地加入分區</p>
              </div>
            ) : (
              <div className="space-y-5">
                {project.zones.map(zone => (
                  <ZoneSection
                    key={zone.id}
                    zone={zone}
                    items={items}
                    expanded={expandedSet}
                    canEdit={canEdit}
                    onToggle={toggle}
                    onAddRoot={() => setCreateCtx({ parent: null, zone })}
                    onUpdate={setUpdating}
                    onAddChild={parent => setCreateCtx({ parent, zone: zoneOf(parent, zone) })}
                    onAssign={setAssigning}
                    onHistory={setHistoryItem}
                    onDelete={item => deleteItem(item.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'issues' && (
          <IssuesTab
            projectId={projectId}
            canReport={!!myRoleInProject}
            onCreate={() => setCreateIssueOpen(true)}
          />
        )}
      </main>

      <BottomNav />

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
      <Icon size={16} />
      {label}
      {typeof badge === 'number' && badge > 0 && (
        <span className="ml-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
          {badge}
        </span>
      )}
    </button>
  )
}

function IssuesTab({
  projectId, canReport, onCreate,
}: {
  projectId: string
  canReport: boolean
  onCreate: () => void
}) {
  const { loading, issues } = useIssues()
  const open = issues.filter(i => i.status === 'open')
  const resolved = issues.filter(i => i.status === 'resolved')

  return (
    <>
      {canReport && (
        <button onClick={onCreate} className="btn-primary w-full mb-4">
          <Plus size={20} /> 報告新問題
        </button>
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
          {resolved.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-2">
                <h3 className="font-bold text-site-900">已解決</h3>
                <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{resolved.length}</span>
              </div>
              {resolved.map(issue => <IssueCard key={issue.id} issue={issue} projectId={projectId} />)}
            </section>
          )}
        </>
      )}
    </>
  )
}

function ZoneSection({
  zone, items, expanded, canEdit,
  onToggle, onAddRoot, onUpdate, onAddChild, onAssign, onHistory, onDelete,
}: {
  zone: Zone
  items: ProgressItem[]
  expanded: Set<string>
  canEdit: boolean
  onToggle: (id: string) => void
  onAddRoot: () => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onHistory: (item: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}) {
  const zoneRoots = items.filter(i => i.parent_id === null && i.zone_id === zone.id)
  const rollup = computeRollup(getZoneLeaves(items, zone.id))
  const StatusIcon = STATUS_ICON[rollup.status] ?? Minus

  return (
    <section>
      {/* Zone header */}
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
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
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
