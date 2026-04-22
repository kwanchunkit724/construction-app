import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { MaterialRequest } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): MaterialRequest {
  return {
    id: row.id, projectId: row.project_id, requestNo: row.request_no,
    requestedBy: row.requested_by, requestedByName: row.requested_by_name,
    requestedByRole: row.requested_by_role, requestedAt: row.requested_at,
    zone: row.zone, items: row.items ?? [], status: row.status,
    approvedBy: row.approved_by, orderedAt: row.ordered_at,
    expectedDelivery: row.expected_delivery, deliveredAt: row.delivered_at,
    notes: row.notes,
  }
}

interface ProcurementContextType {
  requests: MaterialRequest[]
  submitRequest: (req: Omit<MaterialRequest, 'id' | 'requestNo' | 'requestedAt' | 'status'>) => void
  approveRequest: (id: string, byName: string, expectedDelivery: string) => void
  markOrdered: (id: string) => void
  markDelivered: (id: string) => void
  rejectRequest: (id: string) => void
}

const Ctx = createContext<ProcurementContextType | null>(null)

export function ProcurementProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<MaterialRequest[]>([])

  useEffect(() => {
    supabase.from('material_requests').select('*').order('requested_at', { ascending: false })
      .then(({ data }) => { if (data) setRequests(data.map(fromRow)) })
  }, [])

  const submitRequest = (req: Omit<MaterialRequest, 'id' | 'requestNo' | 'requestedAt' | 'status'>) => {
    const id = `MR${Date.now()}`
    const requestNo = `MR-${new Date().getFullYear()}-${String(requests.length + 1).padStart(3, '0')}`
    const requestedAt = new Date().toISOString()
    const newReq: MaterialRequest = { ...req, id, requestNo, requestedAt, status: 'pending' }
    setRequests(prev => [newReq, ...prev])
    supabase.from('material_requests').insert({
      id, project_id: req.projectId, request_no: requestNo,
      requested_by: req.requestedBy, requested_by_name: req.requestedByName,
      requested_by_role: req.requestedByRole, requested_at: requestedAt,
      zone: req.zone, items: req.items, status: 'pending', notes: req.notes,
    }).then(({ error }) => {
      if (error) { console.error(error); setRequests(prev => prev.filter(r => r.id !== id)) }
    })
  }

  const approveRequest = (id: string, byName: string, expectedDelivery: string) => {
    setRequests(prev => prev.map(r => r.id === id
      ? { ...r, status: 'approved', approvedBy: byName, expectedDelivery } : r))
    supabase.from('material_requests')
      .update({ status: 'approved', approved_by: byName, expected_delivery: expectedDelivery })
      .eq('id', id).then(({ error }) => { if (error) console.error(error) })
  }

  const markOrdered = (id: string) => {
    const orderedAt = new Date().toISOString()
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'ordered', orderedAt } : r))
    supabase.from('material_requests').update({ status: 'ordered', ordered_at: orderedAt }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const markDelivered = (id: string) => {
    const deliveredAt = new Date().toISOString()
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'delivered', deliveredAt } : r))
    supabase.from('material_requests').update({ status: 'delivered', delivered_at: deliveredAt }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const rejectRequest = (id: string) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
    supabase.from('material_requests').update({ status: 'rejected' }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  return (
    <Ctx.Provider value={{ requests, submitRequest, approveRequest, markOrdered, markDelivered, rejectRequest }}>
      {children}
    </Ctx.Provider>
  )
}

export function useProcurement() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProcurement must be inside ProcurementProvider')
  return ctx
}
