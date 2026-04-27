import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { DrawingRegisterItem, Submittal } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawingFromRow(row: any): DrawingRegisterItem {
  return {
    id: row.id, projectId: row.project_id, drawingNo: row.drawing_no,
    title: row.title, discipline: row.discipline, revision: row.revision,
    issueDate: row.issue_date, receivedDate: row.received_date,
    status: row.status, distributedTo: row.distributed_to ?? [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function submittalFromRow(row: any): Submittal {
  return {
    id: row.id, projectId: row.project_id, submittalNo: row.submittal_no,
    title: row.title, category: row.category, submittedBy: row.submitted_by,
    submittedAt: row.submitted_at, status: row.status, remarks: row.remarks,
  }
}

interface DocumentContextType {
  drawings: DrawingRegisterItem[]
  submittals: Submittal[]
  addDrawing: (d: Omit<DrawingRegisterItem, 'id'>) => void
  supersedDrawing: (id: string) => void
  addSubmittal: (s: Omit<Submittal, 'id'>) => void
  updateSubmittalStatus: (id: string, status: Submittal['status'], remarks?: string) => void
}

const Ctx = createContext<DocumentContextType | null>(null)

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [drawings, setDrawings] = useState<DrawingRegisterItem[]>([])
  const [submittals, setSubmittals] = useState<Submittal[]>([])

  useEffect(() => {
    supabase.from('drawings').select('*').order('issue_date', { ascending: false })
      .then(({ data }) => { if (data) setDrawings(data.map(drawingFromRow)) })
    supabase.from('submittals').select('*').order('submitted_at', { ascending: false })
      .then(({ data }) => { if (data) setSubmittals(data.map(submittalFromRow)) })

    const drawChannel = supabase
      .channel('drawing-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drawings' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (payload.eventType === 'INSERT')
          setDrawings(prev => prev.some(d => d.id === p.new.id) ? prev : [drawingFromRow(p.new), ...prev])
        else if (payload.eventType === 'UPDATE')
          setDrawings(prev => prev.map(d => d.id === p.new.id ? drawingFromRow(p.new) : d))
        else if (payload.eventType === 'DELETE')
          setDrawings(prev => prev.filter(d => d.id !== p.old.id))
      })
      .subscribe()

    const subChannel = supabase
      .channel('submittal-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submittals' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (payload.eventType === 'INSERT')
          setSubmittals(prev => prev.some(s => s.id === p.new.id) ? prev : [submittalFromRow(p.new), ...prev])
        else if (payload.eventType === 'UPDATE')
          setSubmittals(prev => prev.map(s => s.id === p.new.id ? submittalFromRow(p.new) : s))
        else if (payload.eventType === 'DELETE')
          setSubmittals(prev => prev.filter(s => s.id !== p.old.id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(drawChannel)
      supabase.removeChannel(subChannel)
    }
  }, [])

  const addDrawing = (d: Omit<DrawingRegisterItem, 'id'>) => {
    const id = `D${Date.now()}`
    const newDrawing: DrawingRegisterItem = { ...d, id }
    setDrawings(prev => [newDrawing, ...prev])
    supabase.from('drawings').insert({
      id, project_id: d.projectId, drawing_no: d.drawingNo, title: d.title,
      discipline: d.discipline, revision: d.revision,
      issue_date: d.issueDate, received_date: d.receivedDate,
      status: d.status, distributed_to: d.distributedTo,
    }).then(({ error }) => {
      if (error) { console.error(error); setDrawings(prev => prev.filter(x => x.id !== id)) }
    })
  }

  const supersedDrawing = (id: string) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, status: 'superseded' } : d))
    supabase.from('drawings').update({ status: 'superseded' }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const addSubmittal = (s: Omit<Submittal, 'id'>) => {
    const id = `S${Date.now()}`
    const newSubmittal: Submittal = { ...s, id }
    setSubmittals(prev => [newSubmittal, ...prev])
    supabase.from('submittals').insert({
      id, project_id: s.projectId, submittal_no: s.submittalNo,
      title: s.title, category: s.category, submitted_by: s.submittedBy,
      submitted_at: s.submittedAt, status: s.status, remarks: s.remarks,
    }).then(({ error }) => {
      if (error) { console.error(error); setSubmittals(prev => prev.filter(x => x.id !== id)) }
    })
  }

  const updateSubmittalStatus = (id: string, status: Submittal['status'], remarks?: string) => {
    setSubmittals(prev => prev.map(s => s.id === id ? { ...s, status, remarks: remarks ?? s.remarks } : s))
    supabase.from('submittals').update({ status, remarks }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  return (
    <Ctx.Provider value={{ drawings, submittals, addDrawing, supersedDrawing, addSubmittal, updateSubmittalStatus }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDocument() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDocument must be inside DocumentProvider')
  return ctx
}
