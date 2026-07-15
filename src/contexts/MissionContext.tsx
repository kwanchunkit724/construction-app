import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'

// Mission control panel backing store (v22 migration).
// Public read; admin write enforced at DB-RLS level.

export type MissionTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'
export type MissionTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type MissionTaskCategory = 'outreach' | 'demo' | 'pilot' | 'product' | 'infra' | 'admin' | 'content'
export type MissionTaskOwner = 'user' | 'agent' | 'both'
export type MissionLogAuthor = 'user' | 'agent' | 'system'
export type LeadStatus = 'new' | 'contacted' | 'demo' | 'pilot' | 'won' | 'lost'

export interface Lead {
  id: string
  name: string
  company: string
  contact: string
  message: string
  source: string
  status: LeadStatus
  notes: string
  created_at: string
}

export interface MissionTask {
  id: string
  title: string
  description: string
  status: MissionTaskStatus
  priority: MissionTaskPriority
  category: MissionTaskCategory
  owner: MissionTaskOwner
  due_date: string | null
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MissionLogEntry {
  id: string
  author: MissionLogAuthor
  body: string
  tags: string[]
  created_at: string
}

export interface MissionMetrics {
  id: string
  mrr_hkd: number
  customers_signed: number
  pilots_active: number
  demos_run: number
  outreach_sent: number
  replies_received: number
  current_focus: string
  updated_at: string
}

export interface NewMissionTask {
  title: string
  description?: string
  status?: MissionTaskStatus
  priority?: MissionTaskPriority
  category?: MissionTaskCategory
  owner?: MissionTaskOwner
  due_date?: string | null
  notes?: string
  sort_order?: number
}

interface MissionCtx {
  tasks: MissionTask[]
  log: MissionLogEntry[]
  metrics: MissionMetrics | null
  leads: Lead[]
  loading: boolean
  error: string | null
  canWrite: boolean
  refresh: () => Promise<void>
  createTask: (input: NewMissionTask) => Promise<{ error: string | null }>
  updateTask: (id: string, patch: Partial<NewMissionTask>) => Promise<{ error: string | null }>
  deleteTask: (id: string) => Promise<{ error: string | null }>
  postLog: (body: string, tags?: string[]) => Promise<{ error: string | null }>
  updateMetrics: (patch: Partial<MissionMetrics>) => Promise<{ error: string | null }>
  updateLead: (id: string, patch: Partial<Pick<Lead, 'status' | 'notes'>>) => Promise<{ error: string | null }>
  deleteLead: (id: string) => Promise<{ error: string | null }>
}

const Ctx = createContext<MissionCtx | null>(null)

export function MissionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<MissionTask[]>([])
  const [log, setLog] = useState<MissionLogEntry[]>([])
  const [metrics, setMetrics] = useState<MissionMetrics | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canWrite = profile?.global_role === 'admin'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [tRes, lRes, mRes, leadRes] = await Promise.all([
      supabase.from('mission_tasks').select('*').order('sort_order').order('created_at', { ascending: false }),
      supabase.from('mission_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('mission_metrics').select('*').eq('id', 'current').maybeSingle(),
      // Leads are admin-only via RLS; anon/non-admin simply get an empty set.
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ])
    if (tRes.error || lRes.error || mRes.error) {
      const msg = tRes.error?.message || lRes.error?.message || mRes.error?.message || 'fetch failed'
      setError(msg)
    } else {
      setTasks((tRes.data ?? []) as MissionTask[])
      setLog((lRes.data ?? []) as MissionLogEntry[])
      setMetrics((mRes.data ?? null) as MissionMetrics | null)
    }
    // leadRes errors are non-fatal (RLS denial for non-admins is expected).
    setLeads((leadRes.data ?? []) as Lead[])
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Realtime: any change to any of the 3 tables → refetch all
  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel('mission-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_tasks' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_log' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_metrics' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, onChange)
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [refresh])

  const createTask = useCallback(async (input: NewMissionTask) => {
    const { error: err } = await supabase.from('mission_tasks').insert({
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'pending',
      priority: input.priority ?? 'medium',
      category: input.category ?? 'outreach',
      owner: input.owner ?? 'user',
      due_date: input.due_date ?? null,
      notes: input.notes ?? '',
      sort_order: input.sort_order ?? 999,
    })
    return { error: err?.message ?? null }
  }, [])

  const updateTask = useCallback(async (id: string, patch: Partial<NewMissionTask>) => {
    const { error: err } = await supabase.from('mission_tasks').update(patch).eq('id', id)
    return { error: err?.message ?? null }
  }, [])

  const deleteTask = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('mission_tasks').delete().eq('id', id)
    return { error: err?.message ?? null }
  }, [])

  const postLog = useCallback(async (body: string, tags: string[] = []) => {
    if (!profile) return { error: 'Not signed in' }
    // RLS only lets admins insert; human posts are always authored 'user'.
    const { error: err } = await supabase.from('mission_log').insert({ author: 'user', body, tags })
    return { error: err?.message ?? null }
  }, [profile])

  const updateMetrics = useCallback(async (patch: Partial<MissionMetrics>) => {
    const { id: _drop, ...rest } = patch
    void _drop
    const { error: err } = await supabase.from('mission_metrics').update(rest).eq('id', 'current')
    return { error: err?.message ?? null }
  }, [])

  const updateLead = useCallback(async (id: string, patch: Partial<Pick<Lead, 'status' | 'notes'>>) => {
    const { error: err } = await supabase.from('leads').update(patch).eq('id', id)
    return { error: err?.message ?? null }
  }, [])

  const deleteLead = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('leads').delete().eq('id', id)
    return { error: err?.message ?? null }
  }, [])

  return (
    <Ctx.Provider value={{
      tasks, log, metrics, leads, loading, error, canWrite,
      refresh, createTask, updateTask, deleteTask, postLog, updateMetrics,
      updateLead, deleteLead,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useMission() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMission must be used within MissionProvider')
  return ctx
}
