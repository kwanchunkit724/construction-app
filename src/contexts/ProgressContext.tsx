import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { deriveStatus, floorsToProgress } from '../types'
import type { ProgressItem, ProgressStatus, TrackingMode, ProgressHistoryEntry } from '../types'

interface ProgressContextType {
  loading: boolean
  items: ProgressItem[]
  fetchError: string | null
  canEdit: boolean
  refetch: () => Promise<void>
  addItem: (input: AddItemInput) => Promise<{ error: string | null }>
  updateProgress: (id: string, actual: number, notes: string) => Promise<{ error: string | null }>
  updateFloors: (id: string, floorsCompleted: string[], notes: string) => Promise<{ error: string | null }>
  setAssignment: (id: string, assigned: string[], delegated: string[]) => Promise<{ error: string | null }>
  fetchHistory: (id: string) => Promise<ProgressHistoryEntry[]>
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
}

const ProgressContext = createContext<ProgressContextType | null>(null)

export function ProgressProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ProgressItem[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const canEdit = (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved'
    )
    if (myMembership && ['pm', 'main_contractor', 'subcontractor'].includes(myMembership.role)) {
      return true
    }
    return false
  })()

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('progress_items')
      .select('*')
      .eq('project_id', projectId)
      .order('code', { ascending: true })
    if (error) {
      console.error('progress_items fetch error:', error)
      setFetchError(error.message)
    } else {
      setItems(data as ProgressItem[])
      setFetchError(null)
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    const channel = supabase
      .channel(`progress-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_items', filter: `project_id=eq.${projectId}` },
        () => refetch()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, refetch])

  async function addItem(input: AddItemInput) {
    if (!profile) return { error: '未登入' }
    const parent = input.parent_id ? items.find(i => i.id === input.parent_id) : null
    const level = parent ? parent.level + 1 : 1
    const trackingMode: TrackingMode = input.tracking_mode ?? 'percentage'
    const floorLabels = trackingMode === 'floors' ? (input.floor_labels ?? []) : []
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
      assigned_to: [],
      delegated_to: [],
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function recordHistory(itemId: string, actual: number, floorsCompleted: string[], notes: string) {
    if (!profile) return
    await supabase.from('progress_history').insert({
      item_id: itemId,
      actual_progress: actual,
      floors_completed: floorsCompleted,
      notes,
      updated_by: profile.id,
    })
  }

  async function updateProgress(id: string, actual: number, notes: string) {
    if (!profile) return { error: '未登入' }
    const item = items.find(i => i.id === id)
    if (!item) return { error: '找不到此項目' }
    const status = deriveStatus(actual, item.planned_progress)
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
    const status = deriveStatus(actual, item.planned_progress)
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

  return (
    <ProgressContext.Provider value={{
      loading, items, fetchError, canEdit, refetch,
      addItem, updateProgress, updateFloors,
      setAssignment, fetchHistory, deleteItem,
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
