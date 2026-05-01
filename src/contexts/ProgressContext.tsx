import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { deriveStatus } from '../types'
import type { ProgressItem, ProgressStatus } from '../types'

interface ProgressContextType {
  loading: boolean
  items: ProgressItem[]
  fetchError: string | null
  canEdit: boolean
  refetch: () => Promise<void>
  addItem: (input: AddItemInput) => Promise<{ error: string | null }>
  updateProgress: (id: string, actual: number, notes: string) => Promise<{ error: string | null }>
  updateItem: (id: string, updates: Partial<AddItemInput> & { actual_progress?: number; status?: ProgressStatus; notes?: string }) => Promise<{ error: string | null }>
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
}

const ProgressContext = createContext<ProgressContextType | null>(null)

export function ProgressProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ProgressItem[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Derive permission to edit
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
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
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
    await refetch()
    return { error: null }
  }

  async function updateItem(id: string, updates: Partial<AddItemInput> & { actual_progress?: number; status?: ProgressStatus; notes?: string }) {
    if (!profile) return { error: '未登入' }
    const payload: Record<string, unknown> = {
      last_updated_by: profile.id,
      last_updated_at: new Date().toISOString(),
    }
    if (updates.code !== undefined) payload.code = updates.code.trim()
    if (updates.title !== undefined) payload.title = updates.title.trim()
    if (updates.zone_id !== undefined) payload.zone_id = updates.zone_id
    if (updates.planned_start !== undefined) payload.planned_start = updates.planned_start
    if (updates.planned_end !== undefined) payload.planned_end = updates.planned_end
    if (updates.planned_progress !== undefined) payload.planned_progress = updates.planned_progress
    if (updates.actual_progress !== undefined) payload.actual_progress = updates.actual_progress
    if (updates.notes !== undefined) payload.notes = updates.notes
    if (updates.status !== undefined) payload.status = updates.status

    const { error } = await supabase.from('progress_items').update(payload).eq('id', id)
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
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
      addItem, updateProgress, updateItem, deleteItem,
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
