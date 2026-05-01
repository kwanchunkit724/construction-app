import { useMemo, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ChevronLeft, Plus, Building2, RefreshCw } from 'lucide-react'
import { Spinner } from '../components/Spinner'
import { BottomNav } from '../components/BottomNav'
import { ProgressItemCard } from '../components/ProgressItemCard'
import { CreateItemModal } from '../components/CreateItemModal'
import { UpdateProgressModal } from '../components/UpdateProgressModal'
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import type { ProgressItem } from '../types'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/home" replace />
  return (
    <ProgressProvider projectId={id}>
      <ProjectDetailInner projectId={id} />
    </ProgressProvider>
  )
}

function ProjectDetailInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { loading, items, fetchError, canEdit, refetch, deleteItem } = useProgress()

  const project = projects.find(p => p.id === projectId)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [createParent, setCreateParent] = useState<ProgressItem | null | undefined>(undefined)
  const [updating, setUpdating] = useState<ProgressItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const roots = useMemo(() => items.filter(i => i.parent_id === null), [items])

  // Auto-expand all level-1 items first time data loads
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

  // Stats
  const leaves = items.filter(i => !items.some(c => c.parent_id === i.id))
  const completed = leaves.filter(i => i.status === 'completed').length
  const inProgress = leaves.filter(i => i.status === 'in-progress').length
  const delayed = leaves.filter(i => i.status === 'delayed').length
  const notStarted = leaves.filter(i => i.status === 'not-started').length

  const expandedSet = expanded.size === 0 ? autoExpanded : expanded

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

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 pb-24">
        {/* Stats */}
        {leaves.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <Stat label="已完成" count={completed} color="text-green-700 bg-green-50 border-green-200" />
            <Stat label="進行中" count={inProgress} color="text-blue-700 bg-blue-50 border-blue-200" />
            <Stat label="落後" count={delayed} color="text-red-700 bg-red-50 border-red-200" />
            <Stat label="未開始" count={notStarted} color="text-site-700 bg-site-50 border-site-200" />
          </div>
        )}

        {fetchError && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
            ⚠ 讀取失敗：{fetchError}
          </div>
        )}

        {canEdit && (
          <button
            onClick={() => setCreateParent(null)}
            className="btn-primary w-full mb-3"
          >
            <Plus size={20} /> 加入大項
          </button>
        )}

        {loading ? (
          <div className="py-10 flex justify-center"><Spinner size={28} /></div>
        ) : roots.length === 0 ? (
          <div className="card p-10 text-center">
            <Building2 size={36} className="mx-auto text-site-300 mb-2" />
            <p className="text-sm text-site-600">還未有任何進度項目</p>
            {canEdit && <p className="text-xs text-site-400 mt-1">點擊上方按鈕加入第一個大項</p>}
            {!canEdit && <p className="text-xs text-site-400 mt-1">你目前是唯讀身份</p>}
          </div>
        ) : (
          <div>
            {roots.map(root => (
              <ProgressItemCard
                key={root.id}
                item={root}
                expanded={expandedSet}
                onToggle={toggle}
                onUpdate={setUpdating}
                onAddChild={p => setCreateParent(p)}
                onDelete={item => deleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      {createParent !== undefined && (
        <CreateItemModal
          open={createParent !== undefined}
          onClose={() => setCreateParent(undefined)}
          parent={createParent}
          zones={project.zones}
        />
      )}
      <UpdateProgressModal
        open={!!updating}
        onClose={() => setUpdating(null)}
        item={updating}
      />
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
