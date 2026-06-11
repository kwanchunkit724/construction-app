import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { useAuth } from './AuthContext'

// ── Inline types (re-exported via src/types-daily.ts for the orchestrator) ──
export const WEATHER_OPTIONS = ['晴', '陰', '雨', '暴雨', '熱', '凍', '大風'] as const
export type Weather = typeof WEATHER_OPTIONS[number]

// S2: HKO warning signals. ⚠ LOCKSTEP — must equal the v45
// dailies_warning_signals_chk list string-for-string, or the upsert 400s.
export const WARNING_SIGNAL_OPTIONS = [
  '一號風球', '三號風球', '八號或以上風球',
  '黃雨', '紅雨', '黑雨', '雷暴警告',
  '酷熱天氣警告', '寒冷天氣警告',
] as const
export type WarningSignal = typeof WARNING_SIGNAL_OPTIONS[number]

// S1: structured labour / plant counts. jsonb arrays in the DB; the shape is
// NOT server-validated (same posture as freeform_items) — the UI drops empty /
// zero rows on save.
export interface ManpowerRow {
  trade: string
  count: number
}
export interface PlantRow {
  type: string
  count: number
}

export interface Daily {
  id: string
  project_id: string
  user_id: string
  date: string
  weather: Weather
  // S2 (v45): AM required in the new UI; PM optional. Legacy `weather` is kept
  // written = weather_am so old iOS clients still render a value and the
  // NOT NULL / check on `weather` holds. Pre-v45 rows read weather_am/pm null.
  weather_am: Weather | null
  weather_pm: Weather | null
  warning_signals: string[]
  // S1 (v45)
  manpower: ManpowerRow[]
  plant: PlantRow[]
  progress_item_ids: string[]
  freeform_items: string[]
  notes: string
  created_at: string
  updated_at: string
}

export interface DailyPayload {
  weather: Weather
  weather_am: Weather | null
  weather_pm: Weather | null
  warning_signals: string[]
  manpower: ManpowerRow[]
  plant: PlantRow[]
  progress_item_ids: string[]
  freeform_items: string[]
  notes: string
}

// Today in HKT as YYYY-MM-DD (uses Intl `en-CA` to get ISO-format date).
export function todayHKT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })
}

// Yesterday in HKT (S5 「複製琴日」). HK has no DST, so a fixed −86 400 000 ms
// shift never lands on the wrong calendar day.
export function yesterdayHKT(): string {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Hong_Kong',
  })
}

interface DailiesContextValue {
  dailies: Daily[]
  selectedDate: string
  setSelectedDate: (d: string) => void
  loading: boolean
  fetchError: string | null
  refresh: () => Promise<void>
  upsertMyDaily: (payload: DailyPayload) => Promise<{ id: string | null; error: string | null }>
  deleteMyDaily: (id: string) => Promise<{ error: string | null }>
  // S5: fetch my own daily for an arbitrary date (read allowed to all approved
  // members by RLS; filtered to own row). Used by 「複製琴日」.
  fetchMyDailyFor: (date: string) => Promise<Daily | null>
}

const DailiesContext = createContext<DailiesContextValue | null>(null)

export function DailiesProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const { profile } = useAuth()
  const [dailies, setDailies] = useState<Daily[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(todayHKT())
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await supabase
      .from('dailies')
      .select('*')
      .eq('project_id', projectId)
      .eq('date', selectedDate)
      .order('updated_at', { ascending: false })
    if (error) {
      console.error('dailies fetch error:', error)
      setFetchError(error.message)
      setLoading(false)
      return
    }
    setDailies((data || []) as Daily[])
    setLoading(false)
  }, [projectId, selectedDate])

  useEffect(() => {
    refresh()
    // Realtime channel scoped to this project; we filter on date client-side
    // in refresh() to avoid juggling multiple channels when the user pages dates.
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const ch = supabase
      .channel(`dailies-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dailies',
          filter: `project_id=eq.${projectId}`,
        },
        onChange,
      )
      .subscribe()
    return () => {
      onChange.cancel()
      supabase.removeChannel(ch)
    }
  }, [projectId, refresh])

  const upsertMyDaily = useCallback(
    async (payload: DailyPayload): Promise<{ id: string | null; error: string | null }> => {
      if (!profile) return { id: null, error: '未登入' }
      const date = todayHKT()
      // Server RLS gates this to main_contractor + foreman/engineer on self only,
      // but we mirror the role check client-side so the UI can disable Save early.
      const allowed =
        profile.global_role === 'main_contractor' &&
        (profile.sub_role === 'foreman' || profile.sub_role === 'engineer')
      if (!allowed) return { id: null, error: '只有總承建商管工或工程師可以填寫日誌' }
      const { data, error } = await supabase
        .from('dailies')
        .upsert(
          {
            project_id: projectId,
            user_id: profile.id,
            date,
            // Compat: keep legacy `weather` = the AM choice so old iOS clients
            // still render a value and the NOT NULL / check on `weather` holds.
            weather: payload.weather_am ?? payload.weather,
            weather_am: payload.weather_am,
            weather_pm: payload.weather_pm,
            warning_signals: payload.warning_signals,
            manpower: payload.manpower,
            plant: payload.plant,
            progress_item_ids: payload.progress_item_ids,
            freeform_items: payload.freeform_items,
            notes: payload.notes,
          },
          { onConflict: 'project_id,user_id,date' },
        )
        .select('id')
        .single()
      if (error) {
        console.error('dailies upsert error:', error)
        return { id: null, error: error.message }
      }
      return { id: (data as { id: string }).id, error: null }
    },
    [profile, projectId],
  )

  const fetchMyDailyFor = useCallback(
    async (date: string): Promise<Daily | null> => {
      if (!profile) return null
      const { data, error } = await supabase
        .from('dailies')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', profile.id)
        .eq('date', date)
        .maybeSingle()
      if (error) {
        console.error('dailies fetchMyDailyFor error:', error)
        return null
      }
      return (data as Daily | null) ?? null
    },
    [profile, projectId],
  )

  const deleteMyDaily = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.from('dailies').delete().eq('id', id)
      if (error) {
        console.error('dailies delete error:', error)
        return { error: error.message }
      }
      return { error: null }
    },
    [],
  )

  const value = useMemo<DailiesContextValue>(
    () => ({
      dailies,
      selectedDate,
      setSelectedDate,
      loading,
      fetchError,
      refresh,
      upsertMyDaily,
      deleteMyDaily,
      fetchMyDailyFor,
    }),
    [dailies, selectedDate, loading, fetchError, refresh, upsertMyDaily, deleteMyDaily, fetchMyDailyFor],
  )

  return <DailiesContext.Provider value={value}>{children}</DailiesContext.Provider>
}

export function useDailies(): DailiesContextValue {
  const ctx = useContext(DailiesContext)
  if (!ctx) throw new Error('useDailies must be used within <DailiesProvider>')
  return ctx
}
