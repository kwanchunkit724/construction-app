import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// Inline types — re-exported from src/types-timetable.ts for orchestrator use.
export type TimetableSource = 'material' | 'completion' | 'event'

export interface TimetableEntry {
  source: TimetableSource
  ref_id: string
  occurs_at: string
  title: string
  meta: Record<string, unknown>
}

// Default range: current Hong Kong week (Mon..Sun). We compute this in UTC
// offset terms (HKT = UTC+8, no DST) so the window edges line up with the
// HK calendar regardless of the user's device timezone.
const HKT_OFFSET_MIN = 8 * 60

function todayInHkt(): Date {
  const now = new Date()
  // Shift "now" into HKT wall-clock by adding the offset, then treat the
  // resulting components as UTC. The Date object is purely a date carrier
  // for week-boundary math here.
  return new Date(now.getTime() + (HKT_OFFSET_MIN - -now.getTimezoneOffset()) * 60_000 - now.getTimezoneOffset() * 60_000)
}

export function defaultHktWeekRange(): { from: string; to: string } {
  // Anchor on today in HKT. Monday = start of week.
  const nowUtcMs = Date.now()
  const hktShiftedMs = nowUtcMs + HKT_OFFSET_MIN * 60_000
  const hktNow = new Date(hktShiftedMs)
  const day = hktNow.getUTCDay() // 0=Sun ... 6=Sat in HKT
  const daysFromMon = (day + 6) % 7 // Sun→6, Mon→0, Tue→1, ...
  const monStartHktMs = Date.UTC(hktNow.getUTCFullYear(), hktNow.getUTCMonth(), hktNow.getUTCDate())
    - daysFromMon * 86_400_000
  // Convert HKT midnight back to UTC instant: HKT 00:00 = UTC previous day 16:00
  const fromUtcMs = monStartHktMs - HKT_OFFSET_MIN * 60_000
  const toUtcMs = fromUtcMs + 7 * 86_400_000
  return {
    from: new Date(fromUtcMs).toISOString(),
    to: new Date(toUtcMs).toISOString(),
  }
}

// Silence "unused" warning for the helper kept for potential debugging.
void todayInHkt

interface TimetableContextValue {
  entries: TimetableEntry[]
  loading: boolean
  fetchError: string | null
  rangeFrom: string
  rangeTo: string
  setRange: (from: string, to: string) => void
  refresh: () => Promise<void>
}

const TimetableContext = createContext<TimetableContextValue | null>(null)

export function TimetableProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const initial = defaultHktWeekRange()
  const [rangeFrom, setRangeFrom] = useState<string>(initial.from)
  const [rangeTo, setRangeTo] = useState<string>(initial.to)
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Use refs to read latest range inside realtime callback without
  // re-subscribing whenever the range changes.
  const rangeFromRef = useRef(rangeFrom)
  const rangeToRef = useRef(rangeTo)
  useEffect(() => { rangeFromRef.current = rangeFrom }, [rangeFrom])
  useEffect(() => { rangeToRef.current = rangeTo }, [rangeTo])

  const refresh = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase.rpc('get_timetable', {
      p_project_id: projectId,
      p_from: rangeFromRef.current,
      p_to: rangeToRef.current,
    })
    if (error) {
      console.error('timetable fetch error:', error)
      setFetchError(error.message)
      setLoading(false)
      return
    }
    setEntries((data || []) as TimetableEntry[])
    setLoading(false)
  }, [projectId])

  const setRange = useCallback((from: string, to: string) => {
    setRangeFrom(from)
    setRangeTo(to)
  }, [])

  // Refetch when projectId or window endpoints change.
  useEffect(() => {
    refresh()
  }, [projectId, rangeFrom, rangeTo, refresh])

  // Realtime: any change to underlying source tables for this project should
  // trigger a refresh. We don't try to be clever — the RPC is cheap and the
  // realtime payload doesn't tell us which entries it would affect.
  useEffect(() => {
    const ch = supabase
      .channel(`timetable-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `project_id=eq.${projectId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `project_id=eq.${projectId}` },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'progress_items', filter: `project_id=eq.${projectId}` },
        () => refresh(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, refresh])

  const value: TimetableContextValue = {
    entries,
    loading,
    fetchError,
    rangeFrom,
    rangeTo,
    setRange,
    refresh,
  }
  return <TimetableContext.Provider value={value}>{children}</TimetableContext.Provider>
}

export function useTimetable(): TimetableContextValue {
  const ctx = useContext(TimetableContext)
  if (!ctx) throw new Error('useTimetable must be used within <TimetableProvider>')
  return ctx
}
