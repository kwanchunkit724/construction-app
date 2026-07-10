import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { ProgressItemCard } from './ProgressItemCard'
import { computeRollup, PROGRESS_STATUS_ZH } from '../types'
import { useTrades } from '../lib/trades'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, UserProfile, Zone } from '../types'

// T3 三視圖 (panel verdict: 同一份 leaf 數據, 唔同 group-by, 冇第二棵樹).
// 工種 view: leaves grouped by trade tag. 判頭 view: leaves grouped by each
// assigned/delegated person (an item under two 判頭 appears in both groups —
// that IS the truth of a shared item). 我的 view: only my items, grouped by
// zone. Every group header carries a live rollup over exactly its leaves.

export type GroupMode = 'trade' | 'assignee' | 'mine'

interface CardHandlers {
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (item: ProgressItem) => void
  onAddChild: (parent: ProgressItem) => void
  onAssign: (item: ProgressItem) => void
  onHistory: (item: ProgressItem) => void
  onEdit: (item: ProgressItem) => void
  onDelete: (item: ProgressItem) => void
}

export function GroupedProgressView({ mode, items, zones, handlers }: {
  mode: GroupMode
  items: ProgressItem[]
  zones: Zone[]
  handlers: CardHandlers
}) {
  const trades = useTrades()
  const { profile } = useAuth()
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Leaves sorted by location (分區 → 樓層 sort_order → code) so every group
  // reads 一座 G/F → 1/F → … → 四座 instead of insertion order. Sorted ONCE
  // here; groups below preserve this order when they filter.
  const leaves = useMemo(() => {
    const byId = new Map(items.map(i => [i.id, i]))
    const rootSort = (l: ProgressItem): number => {
      let cur: ProgressItem | undefined = l
      while (cur && cur.parent_id) cur = byId.get(cur.parent_id)
      return cur?.sort_order ?? Number.MAX_SAFE_INTEGER
    }
    return items
      .filter(i => !items.some(c => c.parent_id === i.id) && i.node_kind !== 'floor')
      .sort((a, b) =>
        (a.zone_id ?? '').localeCompare(b.zone_id ?? '')
        || rootSort(a) - rootSort(b)
        || a.code.localeCompare(b.code))
  }, [items])

  // resolve names for the 判頭 view group headers
  const assigneeIds = useMemo(() => {
    if (mode !== 'assignee') return []
    const s = new Set<string>()
    for (const l of leaves) { for (const u of l.assigned_to ?? []) s.add(u); for (const u of l.delegated_to ?? []) s.add(u) }
    return [...s]
  }, [mode, leaves])
  // Request each id at most ONCE — an id that never resolves (RLS-hidden
  // profile) must not retrigger the effect forever (fetch loop + permanent
  // "…" group headers).
  const requested = useRef<Set<string>>(new Set())
  useEffect(() => {
    const missing = assigneeIds.filter(id => !requested.current.has(id))
    if (missing.length === 0) return
    missing.forEach(id => requested.current.add(id))
    let alive = true
    supabase.from('user_profiles').select('*').in('id', missing).then(({ data }) => {
      if (!alive || !data) return
      setProfiles(prev => {
        const next = { ...prev }
        for (const u of data as UserProfile[]) next[u.id] = u
        return next
      })
    })
    return () => { alive = false }
  }, [assigneeIds])

  const groups = useMemo((): Array<{ key: string; name: string; leaves: ProgressItem[] }> => {
    if (mode === 'trade') {
      const out: Array<{ key: string; name: string; leaves: ProgressItem[] }> = []
      for (const t of trades) {
        const ls = leaves.filter(l => l.trade === t.code)
        if (ls.length > 0) out.push({ key: t.code, name: `${t.group_zh} · ${t.name_zh}`, leaves: ls })
      }
      const untagged = leaves.filter(l => !l.trade)
      if (untagged.length > 0) out.push({ key: '__none__', name: '未分類', leaves: untagged })
      return out
    }
    if (mode === 'assignee') {
      const byPerson = new Map<string, ProgressItem[]>()
      for (const l of leaves) {
        for (const u of [...(l.assigned_to ?? []), ...(l.delegated_to ?? [])]) {
          if (!byPerson.has(u)) byPerson.set(u, [])
          byPerson.get(u)!.push(l)
        }
      }
      const out = [...byPerson.entries()].map(([u, ls]) => ({
        // RLS can hide a non-member assignee's profile — fall back to a
        // stable label instead of a permanent "…".
        key: u, name: profiles[u]?.name ?? `成員 ${u.slice(-6)}`, leaves: [...new Set(ls)],
      }))
      out.sort((a, b) => b.leaves.length - a.leaves.length)
      const unassigned = leaves.filter(l => (l.assigned_to ?? []).length === 0 && (l.delegated_to ?? []).length === 0)
      if (unassigned.length > 0) out.push({ key: '__none__', name: '未指派', leaves: unassigned })
      return out
    }
    // mine: my items grouped by zone
    if (!profile) return []
    const mine = leaves.filter(l => (l.assigned_to ?? []).includes(profile.id) || (l.delegated_to ?? []).includes(profile.id))
    return zones
      .map(z => ({ key: z.id, name: z.name, leaves: mine.filter(l => l.zone_id === z.id) }))
      .filter(g => g.leaves.length > 0)
  }, [mode, leaves, trades, profiles, profile, zones])

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-site-500">
          {mode === 'mine' ? '未有指派畀你嘅工序' : mode === 'trade' ? '未有工序標咗工種 — 喺「編輯項目」或「工序範本」設定工種' : '未有指派任何工序'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(g => {
        const r = computeRollup(g.leaves)
        const open = !collapsed.has(g.key)
        return (
          <div key={g.key} className="card overflow-visible">
            <button onClick={() => toggleGroup(g.key)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
              {open ? <ChevronDown size={15} className="text-site-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-site-400 flex-shrink-0" />}
              <span className="font-semibold text-sm text-site-900 flex-1 min-w-0 truncate">{g.name}</span>
              <span className="text-[11px] text-site-400 flex-shrink-0">{g.leaves.length} 項 · {PROGRESS_STATUS_ZH[r.status]}</span>
              <ProgressBar value={r.actual} planned={r.planned} status={r.status} className="w-24 h-1.5 flex-shrink-0" />
              <span className="text-xs font-bold text-site-700 w-9 text-right flex-shrink-0">{r.actual}%</span>
            </button>
            {open && (
              <div className="px-2 pb-2">
                {g.leaves.map(l => (
                  <ProgressItemCard
                    key={`${g.key}-${l.id}`}
                    item={{ ...l, level: 2 }}
                    zones={zones}
                    showLocation
                    expanded={handlers.expanded}
                    onToggle={handlers.onToggle}
                    onUpdate={handlers.onUpdate}
                    onAddChild={handlers.onAddChild}
                    onAssign={handlers.onAssign}
                    onHistory={handlers.onHistory}
                    onEdit={handlers.onEdit}
                    onDelete={handlers.onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
