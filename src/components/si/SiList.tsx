import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useSi } from '../../contexts/SiContext'
import { Spinner } from '../Spinner'
import { SiCard } from './SiCard'
import type { SiStatus } from '../../types'

type FilterKey = 'all' | 'pending' | 'approved' | 'returned' | 'rejected'

const FILTERS: { key: FilterKey; label: string; match: (s: SiStatus) => boolean }[] = [
  { key: 'all', label: '全部', match: () => true },
  { key: 'pending', label: '待批准', match: s => s === 'submitted' || s === 'in_review' },
  { key: 'approved', label: '已批准', match: s => s === 'approved' || s === 'locked' },
  { key: 'returned', label: '已退回', match: s => s === 'revision_requested' },
  { key: 'rejected', label: '已拒絕', match: s => s === 'rejected' },
]

export interface SiListProps {
  onOpen: (siId: string) => void
  onNew: () => void
}

export function SiList({ onOpen, onNew }: SiListProps) {
  const { sis, versionsBySi, loading, fetchError, canSubmit } = useSi()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // 200ms search debounce
  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200)
    return () => window.clearTimeout(h)
  }, [search])

  const visible = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter) ?? FILTERS[0]
    return sis
      .filter(si => f.match(si.status))
      .filter(si => {
        if (!debouncedSearch) return true
        const v = (versionsBySi[si.id] || [])
          .slice()
          .sort((a, b) => b.version_no - a.version_no)[0]
        const title = (v?.payload?.title || '').toLowerCase()
        return title.includes(debouncedSearch) || si.number.toLowerCase().includes(debouncedSearch)
      })
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [sis, versionsBySi, filter, debouncedSearch])

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
        <h2 className="text-lg font-bold text-site-900">工地指令</h2>
        {canSubmit && (
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
          placeholder="搜尋標題…"
          className="input pl-9"
        />
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-2">
          {fetchError}
        </div>
      )}

      {/* List or empty state */}
      {visible.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-site-500 mb-3">
            {sis.length === 0 ? '尚未有工地指令' : '沒有符合條件的工地指令'}
          </p>
          {sis.length === 0 && canSubmit && (
            <button
              type="button"
              onClick={onNew}
              className="btn-primary inline-flex items-center gap-1"
            >
              <Plus size={16} />
              <span>新增</span>
            </button>
          )}
        </div>
      ) : (
        <div>
          {visible.map(si => {
            const latest = (versionsBySi[si.id] || [])
              .slice()
              .sort((a, b) => b.version_no - a.version_no)[0]
            return (
              <SiCard
                key={si.id}
                si={si}
                latestVersion={latest}
                onTap={onOpen}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SiList
