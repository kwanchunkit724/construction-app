// Progress snapshots — the baseline for 本期 Δ (period-over-period movement).
// All calls are best-effort: if the table is missing (migration not yet applied)
// or RLS blocks, they resolve to null / no-op so an export never breaks.

import { supabase } from './supabase'
import type { ProgressItem } from '../types'

export interface PrevSnapshot {
  period: string
  map: Record<string, number> // item_id → actual_progress at that period
}

// The Δ baseline = the most recent snapshot whose period differs from the
// current one (so capturing this period first doesn't compare against itself).
export async function fetchPrevSnapshot(projectId: string, currentPeriod: string): Promise<PrevSnapshot | null> {
  try {
    const { data, error } = await supabase
      .from('progress_snapshots')
      .select('item_id, actual_progress, period, captured_at')
      .eq('project_id', projectId)
      .neq('period', currentPeriod)
      .order('captured_at', { ascending: false })
      .limit(5000)
    if (error || !data || data.length === 0) return null
    const period = (data[0] as { period: string }).period
    const map: Record<string, number> = {}
    for (const r of data as Array<{ item_id: string; actual_progress: number; period: string }>) {
      if (r.period === period && map[r.item_id] === undefined) map[r.item_id] = r.actual_progress
    }
    return { period, map }
  } catch {
    return null
  }
}

// Archive current leaf %s under `period`. Upsert → re-exporting the same period
// overwrites rather than duplicating. Best-effort; never blocks an export.
export async function captureSnapshot(projectId: string, items: ProgressItem[], period: string): Promise<void> {
  try {
    const isLeaf = (it: ProgressItem) => !items.some(i => i.parent_id === it.id)
    const { data: u } = await supabase.auth.getUser()
    const capturedBy = u?.user?.id ?? null
    const rows = items.filter(isLeaf).map(it => ({
      project_id: projectId,
      item_id: it.id,
      actual_progress: it.actual_progress ?? 0,
      // v43: snapshot the real metres for quantity-mode leaves so a period
      // export shows 本期 +Xm, not just the derived %. NULL for other modes.
      qty_done: it.tracking_mode === 'quantity' ? (it.qty_done ?? 0) : null,
      period,
      captured_by: capturedBy,
    }))
    if (rows.length === 0) return
    await supabase.from('progress_snapshots').upsert(rows, { onConflict: 'project_id,item_id,period' })
  } catch {
    /* archival is best-effort */
  }
}
