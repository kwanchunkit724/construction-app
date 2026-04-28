import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { startPolling, triggerRefetch } from '../lib/syncUtils'
import { supabase } from '../lib/supabase'
import type { NCR } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): NCR {
  return {
    id: row.id, projectId: row.project_id, ncrNo: row.ncr_no,
    date: row.date, raisedBy: row.raised_by, raisedByName: row.raised_by_name,
    zone: row.zone, workItem: row.work_item, description: row.description,
    severity: row.severity, photos: row.photos ?? [], status: row.status,
    correctiveAction: row.corrective_action, correctiveActionBy: row.corrective_action_by,
    correctiveDueDate: row.corrective_due_date, closedAt: row.closed_at,
  }
}

interface QCContextType {
  ncrs: NCR[]
  raiseNCR: (ncr: Omit<NCR, 'id' | 'ncrNo' | 'status'>) => void
  updateCorrectiveAction: (id: string, action: string, dueDate: string, byName: string) => void
  closeNCR: (id: string) => void
}

const Ctx = createContext<QCContextType | null>(null)

export function QCProvider({ children }: { children: ReactNode }) {
  const [ncrs, setNcrs] = useState<NCR[]>([])

  useEffect(() => {
    const refetch = () =>
      supabase.from('ncrs').select('*').order('date', { ascending: false })
        .then(({ data }) => { if (data) setNcrs(data.map(fromRow)) })
    return startPolling(refetch)
  }, [])

  const raiseNCR = (ncr: Omit<NCR, 'id' | 'ncrNo' | 'status'>) => {
    const id = `NCR${Date.now()}`
    const ncrNo = `NCR-${new Date().getFullYear()}-${String(ncrs.length + 1).padStart(3, '0')}`
    const newNCR: NCR = { ...ncr, id, ncrNo, status: 'open' }
    setNcrs(prev => [newNCR, ...prev])
    supabase.from('ncrs').insert({
      id, project_id: ncr.projectId, ncr_no: ncrNo, date: ncr.date,
      raised_by: ncr.raisedBy, raised_by_name: ncr.raisedByName,
      zone: ncr.zone, work_item: ncr.workItem, description: ncr.description,
      severity: ncr.severity, photos: ncr.photos, status: 'open',
    }).then(({ error }) => {
      if (error) { console.error(error); setNcrs(prev => prev.filter(n => n.id !== id)) }
      else triggerRefetch()
    })
  }

  const updateCorrectiveAction = (id: string, action: string, dueDate: string, byName: string) => {
    setNcrs(prev => prev.map(n => n.id === id
      ? { ...n, status: 'corrective-action', correctiveAction: action, correctiveDueDate: dueDate, correctiveActionBy: byName }
      : n))
    supabase.from('ncrs').update({
      status: 'corrective-action', corrective_action: action,
      corrective_due_date: dueDate, corrective_action_by: byName,
    }).eq('id', id).then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const closeNCR = (id: string) => {
    const closedAt = new Date().toISOString()
    setNcrs(prev => prev.map(n => n.id === id ? { ...n, status: 'closed', closedAt } : n))
    supabase.from('ncrs').update({ status: 'closed', closed_at: closedAt }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  return (
    <Ctx.Provider value={{ ncrs, raiseNCR, updateCorrectiveAction, closeNCR }}>
      {children}
    </Ctx.Provider>
  )
}

export function useQC() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useQC must be inside QCProvider')
  return ctx
}
