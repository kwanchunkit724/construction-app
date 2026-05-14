import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useVo } from '../../contexts/VoContext'
import { Spinner } from '../Spinner'
import { VoCard } from './VoCard'
import type { VoStatus, SI } from '../../types'

type FilterKey = 'all' | 'pending' | 'approved' | 'returned' | 'rejected'

const FILTERS: { key: FilterKey; label: string; match: (s: VoStatus) => boolean }[] = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'pending', label: '待批准', match: s => s === 'submitted' || s === 'in_review' },
  { key: 'approved', label: '已批准', match: s => s === 'approved' || s === 'locked' },
  { key: 'returned', label: '已退回', match: s => s === 'revision_requested' },
  { key: 'rejected', label: '已拒絕', match: s => s === 'rejected' },
]

export interface VoListProps {
  sis?: SI[]
  onOpen: (voId: string) => void
  onNew?: () => void
}

export function VoList({ sis, onOpen, onNew }: VoListProps) {
  const { vos, loading, fetchError, canSubmit } = useVo()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => window.clearTimeout(h)
  }, [search])

  const siById = useMemo(() => {
    const map: Record<string, SI> = {}
    for (const s of sis ?? []) map[s.id] = s
    return map
  }, [sis])

  const visible = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter) ?? FILTERS[0]
    const fromMs = from ? new Date(from).getTime() : null
    const toMs = to ? new Date(to).getTime() + 86_399_999 : null // inclusive end-of-day
    return vos
      .filter(vo => f.match(vo.status))
      .filter(vo => {
        const t = new Date(vo.created_at).getTime()
        if (fromMs !== null && t < fromMs) return false
        if (toMs !== null && t > toMs) return false
        return true
      })
      .filter(vo => {
        if (!debouncedSearch) return true
        return vo.number.toLowerCase().includes(debouncedSearch)
      })
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [vos, filter, debouncedSearch, from, to])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-site-900">變更指令</h2>
        {canSubmit && onNew && (
          <button
            type="button"
            onClick={onNew}
            className="btn-primary inline-flex items-center gap-1 px-3 py-2 text-sm"
          >
            <Plus size={16} />
            <span>新增</span>
          </button>
        )}
      </div>

      {/* Date range filter (VO-10) */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[11px] text-site-600 ml-1">由</label>
          <input
            type="date"
            className="input text-sm"
            value={from}
            onChange={e => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[11px] text-site-600 ml-1">至</label>
          <input
            type="date"
            className="input text-sm"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
        </div>
      </div>

      {/* Filter pills */}
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

      {/* Search */}
      <div className="relative mt-2 mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜尋編號…"
          className="input pl-9"
        />
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-2">
          {fetchError}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-site-500 mb-3">
            {vos.length === 0 ? '尚未有變更指令' : '沒有符合條件的變更指令'}
          </p>
        </div>
      ) : (
        <div>
          {visible.map(vo => (
            <VoCard
              key={vo.id}
              vo={vo}
              parentSiNumber={siById[vo.si_id]?.number}
              onTap={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default VoList
