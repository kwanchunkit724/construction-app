import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Package, Truck, Pencil, Trash2, AlertTriangle, Link2 } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import {
  MaterialsProvider,
  useMaterials,
  isMaterialLate,
  MATERIAL_STATUS_ZH,
  MATERIAL_STATUS_BADGE_CLASS,
} from '../contexts/MaterialsContext'
import type { Material } from '../contexts/MaterialsContext'
import { MaterialForm } from '../components/material/MaterialForm'
import { MaterialReceiveModal } from '../components/material/MaterialReceiveModal'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'

type FilterKey = 'all' | 'requested' | 'partial' | 'arrived' | 'late'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'requested', label: '已申請' },
  { key: 'partial', label: '部分到貨' },
  { key: 'arrived', label: '已齊料' },
  { key: 'late', label: '逾期' },
]

function fmtPlanned(iso: string | null): string {
  if (!iso) return '未定到貨時間'
  return new Date(iso).toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MaterialCard({
  m,
  isSupervisor,
  isOwner,
  onReceive,
  onEdit,
  onDelete,
}: {
  m: Material
  isSupervisor: boolean
  isOwner: boolean
  onReceive: (m: Material) => void
  onEdit: (m: Material) => void
  onDelete: (m: Material) => void
}) {
  const late = isMaterialLate(m)
  const linkedCount = m.item_ids?.length ?? 0
  // Per-row gate matching v16 RLS: only requester OR supervisor (admin / pm /
  // general_foreman / assigned PM) can mutate. Subcontractor/foreman/engineer
  // members can only mutate their own rows.
  const canMutate = isSupervisor || isOwner

  return (
    <div className="card p-3 mb-2">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-site-100 text-site-600">
          <Package size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${MATERIAL_STATUS_BADGE_CLASS[m.status]}`}
            >
              {MATERIAL_STATUS_ZH[m.status]}
            </span>
            {m.urgent && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-600 text-white">
                急件
              </span>
            )}
            {late && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                <AlertTriangle size={10} />
                逾期
              </span>
            )}
          </div>
          <p className="font-semibold text-site-900 mt-1 break-words">{m.name}</p>
          <p className="text-sm text-site-700 mt-0.5">
            <span className="font-mono">{m.qty_arrived}</span>
            <span className="text-site-400"> / </span>
            <span className="font-mono">{m.qty_needed}</span>
            <span className="text-site-500"> {m.unit}</span>
          </p>
          <p className="text-[11px] text-site-500 mt-1">
            預計到貨：{fmtPlanned(m.planned_arrival_at)}
          </p>
          {linkedCount > 0 && (
            <p className="text-[11px] text-site-500 mt-0.5 inline-flex items-center gap-1">
              <Link2 size={11} />
              已連結 {linkedCount} 個進度項目
            </p>
          )}
          {m.notes && (
            <p className="text-xs text-site-600 mt-1 whitespace-pre-wrap line-clamp-3">{m.notes}</p>
          )}
        </div>
      </div>

      {canMutate && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.status !== 'arrived' && (
            <button
              type="button"
              onClick={() => onReceive(m)}
              className="btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm"
            >
              <Truck size={16} />
              <span>入貨</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(m)}
            className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-sm"
          >
            <Pencil size={16} />
            <span>編輯</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(m)}
            className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-sm text-red-600 border-red-200"
          >
            <Trash2 size={16} />
            <span>刪除</span>
          </button>
        </div>
      )}
    </div>
  )
}

function MaterialListInner({ projectId }: { projectId: string }) {
  const { materials, loading, fetchError, canManage, deleteMaterial } = useMaterials()
  const { profile } = useAuth()
  // Supervisor = admin OR pm OR general_foreman OR assigned PM. Mirrors
  // v16-materials-rls-fix.sql `is_material_supervisor()`. Only supervisors
  // (or row owner) may mutate any given material row.
  const { projects } = useProjects()
  const project = projects.find(p => p.id === projectId)
  const isSupervisor = !!profile && (
    profile.global_role === 'admin'
    || profile.global_role === 'pm'
    || profile.global_role === 'general_foreman'
    || (project?.assigned_pm_ids.includes(profile.id) ?? false)
  )
  const [filter, setFilter] = useState<FilterKey>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [receiving, setReceiving] = useState<Material | null>(null)
  const [busyDelete, setBusyDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const visible = useMemo(() => {
    let rows = materials
    if (filter === 'late') rows = materials.filter(isMaterialLate)
    else if (filter !== 'all') rows = materials.filter(m => m.status === filter)
    // Urgent first within whatever filter is active.
    return rows.slice().sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [materials, filter])

  async function handleDelete(m: Material) {
    if (!window.confirm(`確定刪除「${m.name}」？`)) return
    setBusyDelete(m.id)
    setActionError(null)
    const { error } = await deleteMaterial(m.id)
    setBusyDelete(null)
    if (error) setActionError(error)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-site-900">物料清單</h2>
        <span className="text-xs text-site-500">{materials.length} 項</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border ${
                active
                  ? 'bg-safety-600 text-white border-safety-600'
                  : 'bg-white text-site-700 border-site-200'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm my-2">
          {fetchError}
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm my-2">
          {actionError}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-10">
          <Package size={28} className="mx-auto text-site-300 mb-2" />
          <p className="text-site-500">
            {materials.length === 0 ? '尚未有物料申請' : '沒有符合條件的物料'}
          </p>
        </div>
      ) : (
        <div className="mt-3">
          {visible.map(m => (
            <MaterialCard
              key={m.id}
              m={m}
              isSupervisor={isSupervisor}
              isOwner={profile?.id === m.requested_by}
              onReceive={setReceiving}
              onEdit={setEditing}
              onDelete={busyDelete === m.id ? () => {} : handleDelete}
            />
          ))}
        </div>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="fixed right-4 bottom-24 md:bottom-10 z-40 btn-primary rounded-full shadow-card-md inline-flex items-center gap-1 px-4 py-3"
          aria-label="加物料"
        >
          <Plus size={18} />
          <span>加物料</span>
        </button>
      )}

      {creating && (
        <MaterialForm
          projectId={projectId}
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      )}
      {editing && (
        <MaterialForm
          projectId={projectId}
          mode="edit"
          material={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {receiving && (
        <MaterialReceiveModal
          material={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => setReceiving(null)}
        />
      )}
    </div>
  )
}

export default function MaterialListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <AppLayout title="物料">
        <p className="text-site-500">缺少項目編號</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="物料">
      <MaterialsProvider projectId={id}>
        <MaterialListInner projectId={id} />
      </MaterialsProvider>
    </AppLayout>
  )
}
