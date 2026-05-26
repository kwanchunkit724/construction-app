import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Inline types — see CLAUDE.md "Where new features fit": new milestone tables
// keep their type next to the context to avoid widening src/types.ts in this
// release. The orchestrator re-exports them from src/types-timetable.ts.
export type EventType = 'meeting' | 'inspection' | 'milestone' | 'other'

export interface Event {
  id: string
  project_id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  event_type: EventType
  created_by: string
  created_at: string
  updated_at: string
}

export const EVENT_TYPE_ZH: Record<EventType, string> = {
  meeting: '會議',
  inspection: '巡查',
  milestone: '里程碑',
  other: '其他',
}

export interface CreateEventInput {
  title: string
  description?: string | null
  starts_at: string
  ends_at?: string | null
  location?: string | null
  event_type: EventType
}

export type UpdateEventInput = Partial<CreateEventInput>

interface EventsContextValue {
  events: Event[]
  loading: boolean
  fetchError: string | null
  rangeFrom: string | null
  rangeTo: string | null
  refresh: (from?: string, to?: string) => Promise<void>
  createEvent: (payload: CreateEventInput) => Promise<{ id: string | null; error: string | null }>
  updateEvent: (id: string, patch: UpdateEventInput) => Promise<{ error: string | null }>
  deleteEvent: (id: string) => Promise<{ error: string | null }>
}

const EventsContext = createContext<EventsContextValue | null>(null)

export function EventsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [rangeFrom, setRangeFrom] = useState<string | null>(null)
  const [rangeTo, setRangeTo] = useState<string | null>(null)

  const refresh = useCallback(async (from?: string, to?: string) => {
    setLoading(true)
    setFetchError(null)
    let q = supabase
      .from('events')
      .select('*')
      .eq('project_id', projectId)
      .order('starts_at', { ascending: true })
    if (from) q = q.gte('starts_at', from)
    if (to) q = q.lte('starts_at', to)
    const { data, error } = await q
    if (error) {
      console.error('events fetch error:', error)
      setFetchError(error.message)
      setLoading(false)
      return
    }
    setEvents((data || []) as Event[])
    if (from !== undefined) setRangeFrom(from ?? null)
    if (to !== undefined) setRangeTo(to ?? null)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    // Initial fetch with no range — picks up everything for this project so
    // the EventForm modal can verify writes regardless of which range the
    // TimetableContext currently displays. Consumers can call refresh(from,to)
    // to scope later.
    refresh()
    const ch = supabase
      .channel(`events-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `project_id=eq.${projectId}` },
        () => refresh(rangeFrom ?? undefined, rangeTo ?? undefined),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // rangeFrom/rangeTo intentionally excluded — we read latest values at
    // callback time via closure recreation through refresh dep, while still
    // keeping the channel tied to projectId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refresh])

  const createEvent = useCallback(async (payload: CreateEventInput) => {
    if (!profile) return { id: null, error: '未登入' }
    const { data, error } = await supabase
      .from('events')
      .insert({
        project_id: projectId,
        title: payload.title,
        description: payload.description ?? null,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at ?? null,
        location: payload.location ?? null,
        event_type: payload.event_type,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (error) return { id: null, error: error.message }
    return { id: data.id, error: null }
  }, [profile, projectId])

  const updateEvent = useCallback(async (id: string, patch: UpdateEventInput) => {
    const next: Record<string, unknown> = {}
    if (patch.title !== undefined) next.title = patch.title
    if (patch.description !== undefined) next.description = patch.description
    if (patch.starts_at !== undefined) next.starts_at = patch.starts_at
    if (patch.ends_at !== undefined) next.ends_at = patch.ends_at
    if (patch.location !== undefined) next.location = patch.location
    if (patch.event_type !== undefined) next.event_type = patch.event_type
    const { error } = await supabase.from('events').update(next).eq('id', id)
    return { error: error?.message ?? null }
  }, [])

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    return { error: error?.message ?? null }
  }, [])

  const value: EventsContextValue = {
    events,
    loading,
    fetchError,
    rangeFrom,
    rangeTo,
    refresh,
    createEvent,
    updateEvent,
    deleteEvent,
  }
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

export function useEvents(): EventsContextValue {
  const ctx = useContext(EventsContext)
  if (!ctx) throw new Error('useEvents must be used within <EventsProvider>')
  return ctx
}
