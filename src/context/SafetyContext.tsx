import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { startPolling, triggerRefetch } from '../lib/syncUtils'
import { supabase } from '../lib/supabase'
import type { PTWRequest, ToolboxTalk } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ptwFromRow(row: any): PTWRequest {
  return {
    id: row.id, projectId: row.project_id, ptwNo: row.ptw_no,
    workType: row.work_type, location: row.location, zone: row.zone,
    description: row.description, hazards: row.hazards ?? [],
    requiredPPE: row.required_ppe ?? [], requestedBy: row.requested_by,
    requestedByName: row.requested_by_name, requestedAt: row.requested_at,
    startTime: row.start_time, endTime: row.end_time, riskLevel: row.risk_level,
    status: row.status, approvedBy: row.approved_by, approvedByName: row.approved_by_name,
    approvedAt: row.approved_at, rejectionReason: row.rejection_reason,
    conditions: row.conditions, acknowledgedBy: row.acknowledged_by ?? [],
    closedBy: row.closed_by, closedAt: row.closed_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tbtFromRow(row: any): ToolboxTalk {
  return {
    id: row.id, projectId: row.project_id, date: row.date,
    conductedBy: row.conducted_by, conductedByName: row.conducted_by_name,
    topic: row.topic, attendeeNames: row.attendee_names ?? [],
    duration: row.duration, notes: row.notes,
  }
}

interface SafetyContextType {
  ptwRequests: PTWRequest[]
  submitPTW: (ptw: Omit<PTWRequest, 'id' | 'ptwNo' | 'requestedAt' | 'status' | 'acknowledgedBy'>) => void
  approvePTW: (id: string, byId: string, byName: string, conditions?: string) => void
  rejectPTW: (id: string, reason: string) => void
  acknowledgePTW: (id: string, workerId: string) => void
  closePTW: (id: string, byId: string) => void
  toolboxTalks: ToolboxTalk[]
  addToolboxTalk: (talk: Omit<ToolboxTalk, 'id'>) => void
}

const Ctx = createContext<SafetyContextType | null>(null)

export function SafetyProvider({ children }: { children: ReactNode }) {
  const [ptwRequests, setPtwRequests] = useState<PTWRequest[]>([])
  const [toolboxTalks, setToolboxTalks] = useState<ToolboxTalk[]>([])

  useEffect(() => {
    const refetchPtw = () =>
      supabase.from('ptw_requests').select('*').order('requested_at', { ascending: false })
        .then(({ data }) => { if (data) setPtwRequests(data.map(ptwFromRow)) })
    const refetchTbt = () =>
      supabase.from('toolbox_talks').select('*').order('date', { ascending: false })
        .then(({ data }) => { if (data) setToolboxTalks(data.map(tbtFromRow)) })
    const stopPtw = startPolling(refetchPtw)
    const stopTbt = startPolling(refetchTbt)
    return () => { stopPtw(); stopTbt() }
  }, [])

  const submitPTW = (ptw: Omit<PTWRequest, 'id' | 'ptwNo' | 'requestedAt' | 'status' | 'acknowledgedBy'>) => {
    const id = `PTW${Date.now()}`
    const ptwNo = `PTW-${new Date().getFullYear()}-${String(ptwRequests.length + 1).padStart(3, '0')}`
    const requestedAt = new Date().toISOString()
    const newPTW: PTWRequest = { ...ptw, id, ptwNo, requestedAt, status: 'pending', acknowledgedBy: [] }
    setPtwRequests(prev => [newPTW, ...prev])
    supabase.from('ptw_requests').insert({
      id, project_id: ptw.projectId, ptw_no: ptwNo, work_type: ptw.workType,
      location: ptw.location, zone: ptw.zone, description: ptw.description,
      hazards: ptw.hazards, required_ppe: ptw.requiredPPE,
      requested_by: ptw.requestedBy, requested_by_name: ptw.requestedByName,
      requested_at: requestedAt, start_time: ptw.startTime, end_time: ptw.endTime,
      risk_level: ptw.riskLevel, status: 'pending', acknowledged_by: [],
    }).then(({ error }) => {
      if (error) { console.error(error); setPtwRequests(prev => prev.filter(p => p.id !== id)) }
      else triggerRefetch()
    })
  }

  const approvePTW = (id: string, byId: string, byName: string, conditions?: string) => {
    const approvedAt = new Date().toISOString()
    setPtwRequests(prev => prev.map(p => p.id === id
      ? { ...p, status: 'approved', approvedBy: byId, approvedByName: byName, approvedAt, conditions }
      : p))
    supabase.from('ptw_requests').update({
      status: 'approved', approved_by: byId, approved_by_name: byName,
      approved_at: approvedAt, conditions,
    }).eq('id', id).then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const rejectPTW = (id: string, reason: string) => {
    setPtwRequests(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected', rejectionReason: reason } : p))
    supabase.from('ptw_requests').update({ status: 'rejected', rejection_reason: reason }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const acknowledgePTW = (id: string, workerId: string) => {
    setPtwRequests(prev => prev.map(p => {
      if (p.id !== id || p.acknowledgedBy.includes(workerId)) return p
      const acknowledgedBy = [...p.acknowledgedBy, workerId]
      supabase.from('ptw_requests').update({ acknowledged_by: acknowledgedBy, status: 'active' }).eq('id', id)
        .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
      return { ...p, acknowledgedBy, status: 'active' }
    }))
  }

  const closePTW = (id: string, byId: string) => {
    const closedAt = new Date().toISOString()
    setPtwRequests(prev => prev.map(p => p.id === id ? { ...p, status: 'completed', closedBy: byId, closedAt } : p))
    supabase.from('ptw_requests').update({ status: 'completed', closed_by: byId, closed_at: closedAt }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const addToolboxTalk = (talk: Omit<ToolboxTalk, 'id'>) => {
    const id = `TBT${Date.now()}`
    const newTalk: ToolboxTalk = { ...talk, id }
    setToolboxTalks(prev => [newTalk, ...prev])
    supabase.from('toolbox_talks').insert({
      id, project_id: talk.projectId, date: talk.date,
      conducted_by: talk.conductedBy, conducted_by_name: talk.conductedByName,
      topic: talk.topic, attendee_names: talk.attendeeNames,
      duration: talk.duration, notes: talk.notes,
    }).then(({ error }) => {
      if (error) { console.error(error); setToolboxTalks(prev => prev.filter(t => t.id !== id)) }
      else triggerRefetch()
    })
  }

  return (
    <Ctx.Provider value={{ ptwRequests, submitPTW, approvePTW, rejectPTW, acknowledgePTW, closePTW, toolboxTalks, addToolboxTalk }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSafety() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSafety must be inside SafetyProvider')
  return ctx
}
