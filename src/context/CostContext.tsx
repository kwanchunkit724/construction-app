import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { BOQItem, VariationOrder } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boqFromRow(row: any): BOQItem {
  return {
    id: row.id, projectId: row.project_id, code: row.code,
    description: row.description, unit: row.unit,
    contractQty: row.contract_qty, rate: row.rate,
    contractAmount: row.contract_amount,
    completedQty: row.completed_qty, completedAmount: row.completed_amount,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function voFromRow(row: any): VariationOrder {
  return {
    id: row.id, projectId: row.project_id, voNo: row.vo_no,
    description: row.description, raisedBy: row.raised_by,
    raisedByName: row.raised_by_name, raisedAt: row.raised_at,
    amount: row.amount, type: row.type, status: row.status,
    approvedBy: row.approved_by, approvedAt: row.approved_at,
  }
}

interface CostContextType {
  boqItems: BOQItem[]
  variationOrders: VariationOrder[]
  updateCompletedQty: (id: string, qty: number) => void
  addVO: (vo: Omit<VariationOrder, 'id' | 'raisedAt' | 'status'>) => void
  approveVO: (id: string, byName: string) => void
  rejectVO: (id: string) => void
  submitVO: (id: string) => void
  totalContractSum: number
  totalCompletedAmount: number
  totalVOAmount: number
}

const Ctx = createContext<CostContextType | null>(null)

export function CostProvider({ children }: { children: ReactNode }) {
  const [boqItems, setBoqItems] = useState<BOQItem[]>([])
  const [variationOrders, setVOs] = useState<VariationOrder[]>([])

  useEffect(() => {
    supabase.from('boq_items').select('*').order('code')
      .then(({ data }) => { if (data) setBoqItems(data.map(boqFromRow)) })
    supabase.from('variation_orders').select('*').order('raised_at', { ascending: false })
      .then(({ data }) => { if (data) setVOs(data.map(voFromRow)) })

    const boqChannel = supabase
      .channel('boq-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boq_items' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (payload.eventType === 'INSERT')
          setBoqItems(prev => prev.some(b => b.id === p.new.id) ? prev : [...prev, boqFromRow(p.new)])
        else if (payload.eventType === 'UPDATE')
          setBoqItems(prev => prev.map(b => b.id === p.new.id ? boqFromRow(p.new) : b))
        else if (payload.eventType === 'DELETE')
          setBoqItems(prev => prev.filter(b => b.id !== p.old.id))
      })
      .subscribe()

    const voChannel = supabase
      .channel('vo-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'variation_orders' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (payload.eventType === 'INSERT')
          setVOs(prev => prev.some(v => v.id === p.new.id) ? prev : [voFromRow(p.new), ...prev])
        else if (payload.eventType === 'UPDATE')
          setVOs(prev => prev.map(v => v.id === p.new.id ? voFromRow(p.new) : v))
        else if (payload.eventType === 'DELETE')
          setVOs(prev => prev.filter(v => v.id !== p.old.id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(boqChannel)
      supabase.removeChannel(voChannel)
    }
  }, [])

  const updateCompletedQty = (id: string, qty: number) => {
    setBoqItems(prev => prev.map(b => b.id === id
      ? { ...b, completedQty: qty, completedAmount: qty * b.rate } : b))
    const item = boqItems.find(b => b.id === id)
    if (!item) return
    supabase.from('boq_items')
      .update({ completed_qty: qty, completed_amount: qty * item.rate })
      .eq('id', id).then(({ error }) => { if (error) console.error(error) })
  }

  const addVO = (vo: Omit<VariationOrder, 'id' | 'raisedAt' | 'status'>) => {
    const id = `VO${Date.now()}`
    const voNo = `VO-${new Date().getFullYear()}-${String(variationOrders.length + 1).padStart(3, '0')}`
    const raisedAt = new Date().toISOString()
    const newVO: VariationOrder = { ...vo, id, voNo, raisedAt, status: 'draft' }
    setVOs(prev => [newVO, ...prev])
    supabase.from('variation_orders').insert({
      id, project_id: vo.projectId, vo_no: voNo, description: vo.description,
      raised_by: vo.raisedBy, raised_by_name: vo.raisedByName,
      raised_at: raisedAt, amount: vo.amount, type: vo.type, status: 'draft',
    }).then(({ error }) => {
      if (error) { console.error(error); setVOs(prev => prev.filter(v => v.id !== id)) }
    })
  }

  const submitVO = (id: string) => {
    setVOs(prev => prev.map(v => v.id === id ? { ...v, status: 'submitted' } : v))
    supabase.from('variation_orders').update({ status: 'submitted' }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const approveVO = (id: string, byName: string) => {
    const approvedAt = new Date().toISOString()
    setVOs(prev => prev.map(v => v.id === id
      ? { ...v, status: 'approved', approvedBy: byName, approvedAt } : v))
    supabase.from('variation_orders')
      .update({ status: 'approved', approved_by: byName, approved_at: approvedAt })
      .eq('id', id).then(({ error }) => { if (error) console.error(error) })
  }

  const rejectVO = (id: string) => {
    setVOs(prev => prev.map(v => v.id === id ? { ...v, status: 'rejected' } : v))
    supabase.from('variation_orders').update({ status: 'rejected' }).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const totalContractSum = boqItems.reduce((s, b) => s + b.contractAmount, 0)
  const totalCompletedAmount = boqItems.reduce((s, b) => s + b.completedAmount, 0)
  const totalVOAmount = variationOrders.filter(v => v.status === 'approved').reduce((s, v) => s + v.amount, 0)

  return (
    <Ctx.Provider value={{
      boqItems, variationOrders, updateCompletedQty,
      addVO, approveVO, rejectVO, submitVO,
      totalContractSum, totalCompletedAmount, totalVOAmount,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useCost() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCost must be inside CostProvider')
  return ctx
}
