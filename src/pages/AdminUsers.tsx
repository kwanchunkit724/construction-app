import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Phone, ClipboardList } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { InFlightApprovalsModal } from '../components/admin/InFlightApprovalsModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'
import type { UserProfile, GlobalRole, SubRole } from '../types'

const ROLE_FILTERS: ({ value: GlobalRole | 'all'; label: string })[] = [
  { value: 'all', label: '全部' },
  { value: 'admin', label: ROLE_ZH.admin },
  { value: 'pm', label: ROLE_ZH.pm },
  { value: 'main_contractor', label: ROLE_ZH.main_contractor },
  { value: 'subcontractor', label: ROLE_ZH.subcontractor },
  { value: 'subcontractor_worker', label: ROLE_ZH.subcontractor_worker },
  { value: 'owner', label: ROLE_ZH.owner },
]

const ROLE_PILL: Record<GlobalRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  pm: 'bg-safety-100 text-safety-700',
  main_contractor: 'bg-blue-100 text-blue-700',
  subcontractor: 'bg-amber-100 text-amber-700',
  subcontractor_worker: 'bg-site-100 text-site-700',
  owner: 'bg-green-100 text-green-700',
}

export default function AdminUsers() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<GlobalRole | 'all'>('all')
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [viewingInFlight, setViewingInFlight] = useState<UserProfile | null>(null)

  async function fetchUsers() {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('users fetch error:', error)
    else setUsers((data as UserProfile[]) ?? [])
  }

  useEffect(() => {
    fetchUsers().finally(() => setLoading(false))
  }, [])

  async function manualRefresh() {
    setRefreshing(true)
    await fetchUsers()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (roleFilter !== 'all' && u.global_role !== roleFilter) return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q)
        || u.phone.includes(q)
        || (u.company ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter])

  if (profile?.global_role !== 'admin') {
    return (
      <AppLayout title="用戶管理">
        <div className="card p-8 text-center text-sm text-site-500">
          只有系統管理員可以瀏覽此頁
        </div>
      </AppLayout>
    )
  }

  const counts: Record<GlobalRole | 'all', number> = {
    all: users.length,
    admin: users.filter(u => u.global_role === 'admin').length,
    pm: users.filter(u => u.global_role === 'pm').length,
    main_contractor: users.filter(u => u.global_role === 'main_contractor').length,
    subcontractor: users.filter(u => u.global_role === 'subcontractor').length,
    subcontractor_worker: users.filter(u => u.global_role === 'subcontractor_worker').length,
    owner: users.filter(u => u.global_role === 'owner').length,
  }

  return (
    <AppLayout title="用戶管理" wide>
      {/* Search + refresh */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋姓名 / 手機 / 公司..."
            className="input pl-10"
          />
        </div>
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          className="btn-ghost flex-shrink-0 px-4"
          aria-label="刷新"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Role filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ROLE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setRoleFilter(f.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors min-h-0 ${
              roleFilter === f.value
                ? 'bg-safety-500 text-white border-safety-500'
                : 'bg-white text-site-600 border-site-200 hover:border-safety-300'
            }`}
          >
            {f.label} <span className="opacity-70">({counts[f.value]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-site-500">未有匹配嘅用戶</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="card p-3 md:p-4 flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-safety-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                {u.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-site-900 truncate">{u.name}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_PILL[u.global_role]}`}>
                    {ROLE_ZH[u.global_role]}
                    {u.sub_role && ` · ${SUB_ROLE_ZH[u.sub_role]}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-site-500 mt-0.5">
                  <span className="inline-flex items-center gap-1"><Phone size={11} />{u.phone}</span>
                  {u.company && <span className="truncate">{u.company}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setEditing(u)}
                  disabled={u.id === profile.id}
                  className="text-xs font-semibold text-safety-700 bg-safety-50 hover:bg-safety-100 border border-safety-200 px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-0"
                >
                  編輯角色
                </button>
                <button
                  onClick={() => setViewingInFlight(u)}
                  className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-lg flex items-center justify-center gap-1 min-h-0"
                  title="查看用戶嘅待處理簽核工作"
                >
                  <ClipboardList size={12} /> 查看待處理簽核
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditRoleModal
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={async () => { setEditing(null); await fetchUsers() }}
        />
      )}

      {viewingInFlight && (
        <InFlightApprovalsModal
          open
          userId={viewingInFlight.id}
          userName={viewingInFlight.name}
          onClose={() => setViewingInFlight(null)}
        />
      )}
    </AppLayout>
  )
}

function EditRoleModal({
  user, onClose, onUpdated,
}: {
  user: UserProfile
  onClose: () => void
  onUpdated: () => void
}) {
  const [role, setRole] = useState<GlobalRole>(user.global_role)
  const [subRole, setSubRole] = useState<SubRole>(user.sub_role)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSubmitting(true)
    setError('')
    const { error: e } = await supabase
      .from('user_profiles')
      .update({
        global_role: role,
        sub_role: role === 'main_contractor' ? subRole : null,
      })
      .eq('id', user.id)
    setSubmitting(false)
    if (e) setError(e.message)
    else onUpdated()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`編輯 ${user.name}`}
      footer={
        <button onClick={save} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '儲存'}
        </button>
      }
    >
      <div className="text-xs text-site-500 mb-3 bg-site-100 rounded-lg p-2.5">
        {user.phone}{user.company ? ` · ${user.company}` : ''}
      </div>

      <label className="label">全域角色</label>
      <div className="grid grid-cols-1 gap-2 mb-4">
        {(['admin', 'pm', 'main_contractor', 'subcontractor', 'subcontractor_worker', 'owner'] as GlobalRole[]).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => { setRole(r); if (r !== 'main_contractor') setSubRole(null) }}
            className={`text-left px-4 py-3 rounded-xl border-2 transition-colors min-h-0 ${
              role === r ? 'border-safety-500 bg-safety-50 text-safety-700 font-semibold' : 'border-site-200 text-site-700 hover:border-site-300'
            }`}
          >
            {ROLE_ZH[r]}
          </button>
        ))}
      </div>

      {role === 'main_contractor' && (
        <>
          <label className="label">職位</label>
          <div className="grid grid-cols-3 gap-2">
            {(['engineer', 'foreman', 'safety'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSubRole(s)}
                className={`px-2 py-2 rounded-xl border-2 text-sm transition-colors min-h-0 ${
                  subRole === s ? 'border-safety-500 bg-safety-50 text-safety-700 font-semibold' : 'border-site-200 text-site-700 hover:border-site-300'
                }`}
              >
                {SUB_ROLE_ZH[s]}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
          {error}
        </div>
      )}
    </Modal>
  )
}
