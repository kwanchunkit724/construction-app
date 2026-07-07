import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { cacheGet, cacheSet, getOnline, subscribeOnline } from '../lib/offline'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { deriveStatus, acceptanceGate, floorsToProgress, plannedProgressOf, qtyToProgress, unitStatusToProgress } from '../types'
import type { ProgressItem, ProgressStatus, TrackingMode, ProgressHistoryEntry, UnitState, CategoryDomain, CategoryStream, ProgressTemplate, TemplateItem, NodeKind } from '../types'

interface ProgressContextType {
  loading: boolean
  items: ProgressItem[]
  fetchError: string | null
  // Project-structure rights (create 大項 / 細項, delete, reassign).
  // Supervisor tier only — admin, assigned PM, or members whose
  // global_role is pm / general_foreman. Foreman / engineer / 判頭 /
  // worker / owner / safety_officer do NOT get this even when they're
  // approved members of the project.
  canManageStructure: boolean
  // Legacy alias kept so existing consumers that gate destructive
  // structural buttons on `canEdit` keep working. New code should
  // prefer `canManageStructure` or `canUpdateItem(item)`.
  canEdit: boolean
  // Per-row update right: supervisor OR the row's assigned_to /
  // delegated_to array contains the current user. Used to gate the
  // "更新" button so contributors can still tick progress on the
  // items they were assigned.
  canUpdateItem: (item: ProgressItem) => boolean
  refetch: () => Promise<void>
  addItem: (input: AddItemInput) => Promise<{ error: string | null }>
  updateProgress: (id: string, actual: number, notes: string) => Promise<{ error: string | null }>
  updateFloors: (id: string, floorsCompleted: string[], notes: string) => Promise<{ error: string | null }>
  // P2 (v43): set the quantity done on a 渠務 leaf. Materialises
  // actual_progress = qtyToProgress(qtyDone, qty_total) and journals the metres
  // into progress_history.qty_done so "本期 +86m" survives in the audit trail.
  updateQuantity: (id: string, qtyDone: number, notes: string) => Promise<{ error: string | null }>
  // P2 (v43): set/clear the blocked reason (雨天 / 地下水 / 掘路紙 / 物料 / 其他).
  // A non-null reason makes the item DISPLAY as 受阻 (see displayStatusOf).
  setBlocked: (id: string, reason: string | null) => Promise<{ error: string | null }>
  // P3 (v44): set the per-label state map on a 大樓維修 (unit_status) leaf.
  // Materialises actual_progress = unitStatusToProgress(map, floor_labels),
  // mirrors the signed-off labels into floors_completed (so legacy consumers /
  // export degrade gracefully), and journals the map into
  // progress_history.label_status.
  updateUnitStatus: (id: string, labelStatus: Record<string, UnitState>, notes: string) => Promise<{ error: string | null }>
  setAssignment: (id: string, assigned: string[], delegated: string[]) => Promise<{ error: string | null }>
  // v107 (E1/E2): tick / untick 完成驗收. Same permission surface as progress
  // updates (anyone who can update the item); the acceptor identity is
  // server-pinned by guard_progress_acceptance.
  setAcceptance: (id: string, accepted: boolean) => Promise<{ error: string | null }>
  fetchHistory: (id: string) => Promise<ProgressHistoryEntry[]>
  // v108: 每地盤工序範本 (copy-in). Manage rights = structure editors.
  fetchTemplates: () => Promise<ProgressTemplate[]>
  saveTemplate: (name: string, items: TemplateItem[]) => Promise<{ error: string | null }>
  deleteTemplate: (id: string) => Promise<{ error: string | null }>
  applyTemplate: (template: ProgressTemplate, parentId: string | null, zoneId: string) => Promise<{ error: string | null; inserted: number }>
  updateItemMeta: (id: string, patch: { title?: string; planned_start?: string | null; planned_end?: string | null; category_domain?: CategoryDomain | null; category_stream?: CategoryStream | null; acceptance_required?: boolean }) => Promise<{ error: string | null }>
  deleteItem: (id: string) => Promise<{ error: string | null }>
}

interface AddItemInput {
  parent_id: string | null
  code: string
  title: string
  zone_id?: string | null
  planned_start?: string | null
  planned_end?: string | null
  planned_progress?: number
  notes?: string
  tracking_mode?: TrackingMode
  floor_labels?: string[]
  // P2 (v43): quantity-mode sizing. Only meaningful when tracking_mode is
  // 'quantity'; ignored (and left at the DB default NULL/0) for other modes.
  qty_total?: number | null
  qty_unit?: string | null
  // P3 (v44): unit_status seed map. Only meaningful when tracking_mode is
  // 'unit_status' (the CreateItemModal seeds every label to 'pending'); ignored
  // (left at the DB default '{}') for other modes.
  label_status?: Record<string, UnitState>
  // v57: 2-axis category (root 大項 only). Ignored for children (parent_id set).
  category_domain?: CategoryDomain | null
  category_stream?: CategoryStream | null
  // v107: 需驗收 flag — when true, the item only counts as 完成 after someone
  // ticks 完成驗收 (E3).
  acceptance_required?: boolean
  // v109: display-only structure label (floor / zone …) + floor ordering.
  node_kind?: NodeKind | null
  sort_order?: number | null
}

const ProgressContext = createContext<ProgressContextType | null>(null)

export function ProgressProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ProgressItem[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Supervisor / structural-edit right. Mirrors the server-side
  // can_manage_project_progress() check so the UI hides the same
  // affordances the DB would reject anyway.
  const canManageStructure = (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    // Per-project MEMBERSHIP role governs structural edit rights — mirrors the
    // server can_manage_project_progress (v27), NOT the global account role.
    // (A project's PM by membership may have a different global_role.)
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    return !!myMembership && ['pm', 'general_foreman', 'main_contractor'].includes(myMembership.role)
  })()

  // Per-row update gate. Supervisor passes through; contributors only
  // pass when this specific row was assigned/delegated to them.
  const canUpdateItem = useCallback(
    (item: ProgressItem): boolean => {
      if (canManageStructure) return true
      if (!profile) return false
      return item.assigned_to.includes(profile.id) || item.delegated_to.includes(profile.id)
    },
    [canManageStructure, profile],
  )

  // Legacy alias: most existing call sites use canEdit to gate
  // destructive structural buttons (add child, delete, reassign).
  // Map to the new structural flag so they keep behaving correctly.
  const canEdit = canManageStructure

  const refetch = useCallback(async () => {
    // Fast path: known offline → serve last-synced items, skip the network.
    if (!getOnline()) {
      const cached = cacheGet<ProgressItem[]>(`progress:${projectId}`)
      if (cached) { setItems(cached.data); setFetchError(null); return }
    }
    const { data, error } = await supabase.rpc('get_visible_progress_items', { p_project_id: projectId })
    if (error) {
      console.error('progress_items fetch error:', error)
      // Only fall back to cache when offline — don't mask a real online error.
      const cached = !getOnline() ? cacheGet<ProgressItem[]>(`progress:${projectId}`) : null
      if (cached) {
        setItems(cached.data)
        setFetchError(null)
      } else {
        setFetchError(error.message)
      }
    } else {
      const rows = (data ?? []) as ProgressItem[]
      const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code))
      setItems(sorted)
      cacheSet(`progress:${projectId}`, sorted)
      setFetchError(null)
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`progress-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_items', filter: `project_id=eq.${projectId}` },
        onChange
      )
      .subscribe()

    return () => { onChange.cancel(); supabase.removeChannel(channel) }
  }, [projectId, refetch])

  // Re-sync on reconnect: realtime doesn't replay events missed while offline.
  useEffect(() => subscribeOnline(online => { if (online) void refetch() }), [refetch])

  async function addItem(input: AddItemInput) {
    if (!profile) return { error: '未登入' }
    const parent = input.parent_id ? items.find(i => i.id === input.parent_id) : null
    const level = parent ? parent.level + 1 : 1
    const trackingMode: TrackingMode = input.tracking_mode ?? 'percentage'
    // 'checklist' reuses the floors storage (floor_labels = 工序 names), and
    // 'unit_status' (大樓維修) also stores its 室 labels in floor_labels — so all
    // three label-based modes carry their labels; percentage / quantity carry none.
    const floorLabels = (trackingMode === 'floors' || trackingMode === 'checklist' || trackingMode === 'unit_status')
      ? (input.floor_labels ?? [])
      : []
    // 'quantity' (渠務) carries qty_total + qty_unit; other modes leave them at
    // the DB defaults (NULL / 0) so they stay weight=1 in computeRollup.
    const isQuantity = trackingMode === 'quantity'
    // 'unit_status' (大樓維修) seeds its per-label state map (every 室 → 'pending');
    // other modes leave it at the DB default '{}'.
    const isUnitStatus = trackingMode === 'unit_status'
    const labelStatus: Record<string, UnitState> = isUnitStatus
      ? (input.label_status ?? Object.fromEntries(floorLabels.map(l => [l, 'pending' as UnitState])))
      : {}
    const { error } = await supabase.from('progress_items').insert({
      project_id: projectId,
      parent_id: input.parent_id,
      code: input.code.trim(),
      title: input.title.trim(),
      zone_id: input.zone_id ?? parent?.zone_id ?? null,
      level,
      planned_start: input.planned_start ?? null,
      planned_end: input.planned_end ?? null,
      planned_progress: input.planned_progress ?? 0,
      actual_progress: 0,
      status: 'not-started',
      notes: input.notes ?? '',
      tracking_mode: trackingMode,
      floor_labels: floorLabels,
      floors_completed: [],
      qty_total: isQuantity ? (input.qty_total ?? null) : null,
      qty_done: 0,
      qty_unit: isQuantity ? ((input.qty_unit ?? '').trim() || null) : null,
      label_status: labelStatus,
      // v57: category tags only on the 大項 (root); children inherit via their root.
      category_domain: input.parent_id ? null : (input.category_domain ?? null),
      category_stream: input.parent_id ? null : (input.category_stream ?? null),
      acceptance_required: input.acceptance_required ?? false,
      node_kind: input.node_kind ?? null,
      sort_order: input.sort_order ?? null,
      assigned_to: [],
      delegated_to: [],
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function recordHistory(
    itemId: string,
    actual: number,
    floorsCompleted: string[],
    notes: string,
    qtyDone?: number | null,
    labelStatus?: Record<string, UnitState> | null,
  ) {
    if (!profile) return
    const { error } = await supabase.from('progress_history').insert({
      item_id: itemId,
      actual_progress: actual,
      floors_completed: floorsCompleted,
      notes,
      // v43: carry the metres for quantity ticks so "本期 +86m" survives; null
      // (omitted) for every other mode — column is nullable, pre-v43 rows too.
      qty_done: qtyDone ?? null,
      // v44: carry the per-label state map for unit_status ticks so the
      // HistoryModal can diff "15/F-C：已修復→已簽收"; null for every other mode
      // — column is nullable, pre-v44 rows too.
      label_status: labelStatus ?? null,
      updated_by: profile.id,
    })
    // Don't block the progress update on the audit write, but never swallow it
    // silently — a denied history insert means a gap in the dispute trail.
    if (error) console.error('progress_history insert error:', error)
  }

  // Edit an item's metadata (title / planned dates). planned_start/end drive
  // plannedProgressOf, so editing them re-bases the schedule without losing the
  // item's history, children, drawings or assignments (vs delete + recreate).
  async function updateItemMeta(
    id: string,
    patch: { title?: string; planned_start?: string | null; planned_end?: string | null; category_domain?: CategoryDomain | null; category_stream?: CategoryStream | null; acceptance_required?: boolean },
  ) {
    if (!profile) return { error: '未登入' }
    const before = items.find(i => i.id === id)
    const upd: Record<string, unknown> = {
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }
    if (patch.title !== undefined) upd.title = patch.title
    if (patch.planned_start !== undefined) upd.planned_start = patch.planned_start
    if (patch.planned_end !== undefined) upd.planned_end = patch.planned_end
    if (patch.category_domain !== undefined) upd.category_domain = patch.category_domain
    if (patch.category_stream !== undefined) upd.category_stream = patch.category_stream
    if (patch.acceptance_required !== undefined) upd.acceptance_required = patch.acceptance_required
    const { error } = await supabase.from('progress_items').update(upd).eq('id', id)
    if (error) return { error: error.message }
    // Journal the metadata edit as an immutable history row (v38) — only the
    // keys that actually changed, recorded as { key: [old, new] }. So a dispute
    // over "what was this item called / when was it due" has a trail. Non-blocking,
    // same pattern as recordHistory.
    if (before) {
      const diff: Record<string, [string | null, string | null]> = {}
      if (patch.title !== undefined && patch.title !== before.title) diff.title = [before.title, patch.title]
      if (patch.planned_start !== undefined && (patch.planned_start ?? null) !== (before.planned_start ?? null)) diff.planned_start = [before.planned_start, patch.planned_start ?? null]
      if (patch.planned_end !== undefined && (patch.planned_end ?? null) !== (before.planned_end ?? null)) diff.planned_end = [before.planned_end, patch.planned_end ?? null]
      if (patch.acceptance_required !== undefined && patch.acceptance_required !== before.acceptance_required) diff.acceptance_required = [String(before.acceptance_required), String(patch.acceptance_required)]
      if (Object.keys(diff).length > 0) {
        const { error: hErr } = await supabase.from('progress_history').insert({
          item_id: id,
          actual_progress: before.actual_progress,
          floors_completed: [],
          notes: '',
          change_type: 'meta',
          meta: diff,
          updated_by: profile.id,
        })
        if (hErr) console.error('progress_history meta insert error:', hErr)
      }
    }
    await refetch()
    return { error: null }
  }

  async function updateProgress(id: string, actual: number, notes: string) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const status = acceptanceGate(deriveStatus(actual, plannedProgressOf(item)), item)
    const { error } = await supabase.from('progress_items').update({
      actual_progress: actual,
      status,
      notes,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(id, actual, [], notes)
    await refetch()
    return { error: null }
  }

  async function updateFloors(id: string, floorsCompleted: string[], notes: string) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const actual = floorsToProgress(floorsCompleted, item.floor_labels)
    const status = acceptanceGate(deriveStatus(actual, plannedProgressOf(item)), item)
    const { error } = await supabase.from('progress_items').update({
      actual_progress: actual,
      floors_completed: floorsCompleted,
      status,
      notes,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(id, actual, floorsCompleted, notes)
    await refetch()
    return { error: null }
  }

  // P2 (v43): quantity-mode update (渠務). Sets qty_done, materialises
  // actual_progress = qtyToProgress(qtyDone, qty_total) so every downstream
  // consumer (rollup / status / export / snapshots) still sees a normal %,
  // and journals the metres into progress_history.qty_done. Mirrors the
  // updateFloors save path exactly.
  async function updateQuantity(id: string, qtyDone: number, notes: string) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const safeDone = Math.max(0, Number.isFinite(qtyDone) ? qtyDone : 0)
    const actual = qtyToProgress(safeDone, item.qty_total)
    const status = acceptanceGate(deriveStatus(actual, plannedProgressOf(item)), item)
    const { error } = await supabase.from('progress_items').update({
      qty_done: safeDone,
      actual_progress: actual,
      status,
      notes,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(id, actual, [], notes, safeDone)
    await refetch()
    return { error: null }
  }

  // P3 (v44): unit_status update (大樓維修 / defect register). Persists the
  // per-label state map, materialises actual_progress = unitStatusToProgress so
  // every downstream consumer (rollup / status / export / snapshots) still sees
  // a normal %, AND mirrors the signed-off labels into floors_completed so
  // legacy consumers (export floor chips / history) degrade gracefully. Journals
  // the map into progress_history.label_status. Mirrors the updateFloors path.
  async function updateUnitStatus(id: string, labelStatus: Record<string, UnitState>, notes: string) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    // Keep only labels that actually belong to this item (defensive against a
    // stale map carrying a removed label), and mirror the signed-off ones into
    // floors_completed so the floor-chip consumers (export / history) still work.
    const labels = item.floor_labels ?? []
    const cleaned: Record<string, UnitState> = {}
    for (const l of labels) {
      const s = labelStatus[l]
      if (s) cleaned[l] = s
    }
    const signedOff = labels.filter(l => cleaned[l] === 'signed_off')
    const actual = unitStatusToProgress(cleaned, labels)
    const status = acceptanceGate(deriveStatus(actual, plannedProgressOf(item)), item)
    const { error } = await supabase.from('progress_items').update({
      label_status: cleaned,
      floors_completed: signedOff,
      actual_progress: actual,
      status,
      notes,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(id, actual, signedOff, notes, null, cleaned)
    await refetch()
    return { error: null }
  }

  // P2 (v43): set or clear the blocked reason. A non-null reason makes the
  // item DISPLAY as 受阻 (displayStatusOf) without touching its % — clearing
  // it (null) returns the item to its schedule-derived status. Non-blocking
  // history row mirrors recordHistory so the stoppage shows in the trail.
  async function setBlocked(id: string, reason: string | null) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const trimmed = reason && reason.trim() ? reason.trim() : null
    const { error } = await supabase.from('progress_items').update({
      blocked_reason: trimmed,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(
      id,
      item.actual_progress,
      [],
      trimmed ? `受阻：${trimmed}` : '解除受阻',
    )
    await refetch()
    return { error: null }
  }

  // v107 (E1/E2): tick / untick 完成驗收. accepted_by is sent for optimistic UI
  // but the server pins it to auth.uid() (guard_progress_acceptance) — cannot be
  // forged. When accepting a 100% leaf the stored status flips to completed
  // (acceptanceGate passes); unticking flips it back. Journals to history.
  async function setAcceptance(id: string, accepted: boolean) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const after = { acceptance_required: item.acceptance_required, accepted_at: accepted ? new Date().toISOString() : null }
    const status = acceptanceGate(deriveStatus(item.actual_progress, plannedProgressOf(item)), after)
    const { error } = await supabase.from('progress_items').update({
      accepted_by: accepted ? profile.id : null,
      accepted_at: after.accepted_at,
      status,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await recordHistory(id, item.actual_progress, [], accepted ? '✅ 完成驗收' : '取消驗收')
    await refetch()
    return { error: null }
  }

  async function setAssignment(id: string, assigned: string[], delegated: string[]) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('progress_items').update({
      assigned_to: assigned,
      delegated_to: delegated,
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function fetchHistory(id: string): Promise<ProgressHistoryEntry[]> {
    const { data, error } = await supabase
      .from('progress_history')
      .select('*')
      .eq('item_id', id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('history fetch error:', error)
      return []
    }
    return data as ProgressHistoryEntry[]
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from('progress_items').delete().eq('id', id)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  // ── v108: 每地盤工序範本 ────────────────────────────────────
  async function fetchTemplates(): Promise<ProgressTemplate[]> {
    const { data, error } = await supabase
      .from('progress_templates')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (error) { console.error('templates fetch error:', error); return [] }
    return (data ?? []) as ProgressTemplate[]
  }

  async function saveTemplate(name: string, tItems: TemplateItem[]) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('progress_templates').insert({
      project_id: projectId,
      name: name.trim(),
      items: tItems,
      created_by: profile.id,
    })
    return { error: error ? error.message : null }
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from('progress_templates').delete().eq('id', id)
    return { error: error ? error.message : null }
  }

  // Copy-in (E5): stamp the template's seeds as ordinary progress_items under
  // the chosen parent/zone, one by one through the normal addItem path — the
  // sequential await matters because next_progress_code must see each insert
  // before numbering the next. Later edits to the template never touch these.
  async function applyTemplate(template: ProgressTemplate, parentId: string | null, zoneId: string) {
    let inserted = 0
    for (const ti of template.items) {
      const { data: code, error: codeErr } = await supabase.rpc('next_progress_code', {
        p_project_id: projectId,
        p_zone_id: zoneId,
        p_parent_id: parentId,
      })
      if (codeErr) return { error: `編號失敗：${codeErr.message}（已加入 ${inserted} 項）`, inserted }
      const r = await addItem({
        parent_id: parentId,
        code: (code as string) ?? '',
        title: ti.title,
        zone_id: zoneId,
        tracking_mode: ti.tracking_mode ?? 'percentage',
        floor_labels: ti.floor_labels ?? [],
        qty_total: ti.qty_total ?? null,
        qty_unit: ti.qty_unit ?? null,
        acceptance_required: ti.acceptance_required ?? false,
      })
      if (r.error) return { error: `${r.error}（已加入 ${inserted} 項）`, inserted }
      inserted++
    }
    return { error: null, inserted }
  }

  return (
    <ProgressContext.Provider value={{
      loading, items, fetchError,
      canManageStructure, canEdit, canUpdateItem,
      refetch,
      addItem, updateProgress, updateFloors, updateQuantity, updateUnitStatus, setBlocked,
      setAssignment, setAcceptance, fetchHistory, updateItemMeta, deleteItem,
      fetchTemplates, saveTemplate, deleteTemplate, applyTemplate,
    }}>
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgress() {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider')
  return ctx
}
