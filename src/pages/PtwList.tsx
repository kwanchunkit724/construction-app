import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { PtwCard } from '../components/ptw/PtwCard'
import { PtwSubmitForm } from '../components/ptw/PtwSubmitForm'
import { PtwProvider, usePtw } from '../contexts/PtwContext'
import { ProjectsProvider } from '../contexts/ProjectsContext'
import type { PtwStatus } from '../types'

type StatusFilter = 'all' | 'draft' | 'in_review' | 'active' | 'closed_out' | 'expired' | 'rejected' | 'revision_requested'

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'in_review', label: '簽核中' },
  { value: 'active', label: '生效中' },
  { value: 'closed_out', label: '已完工' },
  { value: 'expired', label: '已過期' },
  { value: 'revision_requested', label: '已退回' },
  { value: 'rejected', label: '已拒絕' },
]

function PtwListInner() {
  const { id: projectId } = useParams<{ id: string }>()
  const { ptws, loading, fetchError, canSubmit } = usePtw()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)

  const filtered = useMemo(() => {
    return ptws.filter(p => {
      if (filter !== 'all') {
        if (filter === 'in_review' && !['submitted', 'in_review', 'approved'].includes(p.status)) return false
        if (filter !== 'in_review' && p.status !== (filter as PtwStatus)) return false
      }
      if (search.trim() && !p.number.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [ptws, filter, search])

  if (!projectId) return null

  return (
    <AppLayout title="工作許可證" wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-site-900">工作許可證</h2>
          {canSubmit && (
            <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} className="inline mr-1" />
              新增
            </button>
          )}
        </div>

        {fetchError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={
                filter === f.value
                  ? 'rounded-full bg-safety-500 text-white px-3 py-1 text-sm font-medium'
                  : 'rounded-full bg-white border border-site-200 text-site-700 px-3 py-1 text-sm'
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋編號..."
            className="input pl-10"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center"><Spinner size={32} /></div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-site-500">
            {ptws.length === 0 ? '尚未有工作許可證' : '無符合條件嘅工作許可證'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(p => <PtwCard key={p.id} ptw={p} projectId={projectId} />)}
          </div>
        )}
      </div>

      <PtwSubmitForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmitted={() => { /* refetched via realtime */ }}
      />
    </AppLayout>
  )
}

export default function PtwListPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  return (
    <ProjectsProvider>
      <PtwProvider projectId={projectId}>
        <PtwListInner />
      </PtwProvider>
    </ProjectsProvider>
  )
}
