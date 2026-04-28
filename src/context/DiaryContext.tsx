import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { startPolling, triggerRefetch } from '../lib/syncUtils'
import { supabase } from '../lib/supabase'
import type { DailyDiary } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): DailyDiary {
  return {
    id: row.id, projectId: row.project_id, date: row.date,
    authorId: row.author_id, authorName: row.author_name,
    zone: row.zone, weather: row.weather, temperature: row.temperature,
    manpowerTotal: row.manpower_total, equipment: row.equipment,
    workDone: row.work_done, issues: row.issues_text ?? '',
    status: row.status,
  }
}

interface DiaryContextType {
  diaries: DailyDiary[]
  submitDiary: (diary: Omit<DailyDiary, 'id' | 'status'>) => void
}

const Ctx = createContext<DiaryContextType | null>(null)

export function DiaryProvider({ children }: { children: ReactNode }) {
  const [diaries, setDiaries] = useState<DailyDiary[]>([])

  useEffect(() => {
    const refetch = () =>
      supabase.from('daily_diaries').select('*').order('date', { ascending: false })
        .then(({ data }) => { if (data) setDiaries(data.map(fromRow)) })
    return startPolling(refetch)
  }, [])

  const submitDiary = (diary: Omit<DailyDiary, 'id' | 'status'>) => {
    const id = `DIARY${Date.now()}`
    const newDiary: DailyDiary = { ...diary, id, status: 'submitted' }
    setDiaries(prev => [newDiary, ...prev])
    supabase.from('daily_diaries').insert({
      id, project_id: diary.projectId, date: diary.date,
      author_id: diary.authorId, author_name: diary.authorName,
      zone: diary.zone, weather: diary.weather, temperature: diary.temperature,
      manpower_total: diary.manpowerTotal, equipment: diary.equipment,
      work_done: diary.workDone, issues_text: diary.issues, status: 'submitted',
    }).then(({ error }) => {
      if (error) { console.error(error); setDiaries(prev => prev.filter(d => d.id !== id)) }
      else triggerRefetch()
    })
  }

  return (
    <Ctx.Provider value={{ diaries, submitDiary }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDiary() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDiary must be inside DiaryProvider')
  return ctx
}
