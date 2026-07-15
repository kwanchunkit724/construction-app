import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { DictKind, ProgressItem, ProjectDict } from '../types'

// ── Guided 進度表 engine (v112) ─────────────────────────────
// One flat leaf carries all four dimensions — 分區(zone_id) × 工種(trade_label)
// × 位置(location) × 工序(title) — plus the floors checklist. Every drill page
// is a filter + count over the same leaves; there is no tree and therefore no
// rollup traversal. done/total are TICK counts (二元: a tick = that floor's
// process is 100%), so the % at any level is honest arithmetic, not averaging.

// ── Per-project dictionaries ────────────────────────────────
export function useDicts(projectId: string) {
  const [dicts, setDicts] = useState<ProjectDict[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_dicts')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .order('created_at')
    if (!error) setDicts((data ?? []) as ProjectDict[])
    setLoading(false)
  }, [projectId])

  useEffect(() => { void refetch() }, [refetch])

  const add = useCallback(async (kind: DictKind, label: string) => {
    const clean = label.trim()
    if (!clean) return { error: '請輸入名稱' }
    const maxSort = Math.max(0, ...dicts.filter(d => d.kind === kind).map(d => d.sort_order))
    const { error } = await supabase.from('project_dicts').insert({
      project_id: projectId, kind, label: clean, sort_order: maxSort + 1,
    })
    if (error) {
      return { error: error.code === '23505' ? '已有同名項目' : error.message }
    }
    await refetch()
    return { error: null }
  }, [projectId, dicts, refetch])

  const remove = useCallback(async (id: string) => {
    // locked rows simply match no row under the delete policy — read back to
    // tell the user honestly instead of pretending it worked.
    const { error } = await supabase.from('project_dicts').delete().eq('id', id)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }, [refetch])

  const byKind = useCallback(
    (kind: DictKind) => dicts.filter(d => d.kind === kind),
    [dicts],
  )

  return { dicts, loading, refetch, add, remove, byKind }
}

// ── Leaf filtering + % ──────────────────────────────────────
export interface GuidedFilter {
  zoneIds?: string[]
  tradeLabel?: string
  location?: string
  // when set, a leaf contributes 1 cell: done iff this floor is ticked.
  floor?: string
}

export function guidedLeaves(items: ProgressItem[], f: GuidedFilter = {}): ProgressItem[] {
  return items.filter(i =>
    (!f.zoneIds || (i.zone_id !== null && f.zoneIds.includes(i.zone_id)))
    && (!f.tradeLabel || i.trade_label === f.tradeLabel)
    && (!f.location || i.location === f.location))
}

export interface GuidedPct {
  // null when nothing matches (page renders — instead of a lying 0%)
  pct: number | null
  done: number
  total: number
}

export function guidedPctOf(leaves: ProgressItem[], floor?: string): GuidedPct {
  let done = 0
  let total = 0
  for (const l of leaves) {
    const labels = Array.isArray(l.floor_labels) ? l.floor_labels : []
    const ticked = Array.isArray(l.floors_completed) ? l.floors_completed : []
    if (floor) {
      if (!labels.includes(floor)) continue
      total += 1
      if (ticked.includes(floor)) done += 1
    } else {
      total += labels.length
      done += ticked.length
    }
  }
  return { pct: total === 0 ? null : Math.round((done / total) * 100), done, total }
}

export function guidedPct(items: ProgressItem[], f: GuidedFilter): GuidedPct {
  return guidedPctOf(guidedLeaves(items, f), f.floor)
}

// Distinct dimension values that actually carry data — the drill pages show
// the union of (dictionary entries, values present on leaves) so a deleted
// dict entry with live data never becomes unreachable.
export function distinctValues(
  leaves: ProgressItem[],
  dim: 'trade_label' | 'location',
): string[] {
  const s = new Set<string>()
  for (const l of leaves) { const v = l[dim]; if (v) s.add(v) }
  return [...s]
}

export function unionOrdered(dictLabels: string[], dataLabels: string[]): string[] {
  const out = [...dictLabels]
  for (const l of dataLabels) if (!out.includes(l)) out.push(l)
  return out
}
