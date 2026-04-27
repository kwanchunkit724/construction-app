import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { SubContract, ContractItem } from '../types'

interface ContractContextType {
  contracts: SubContract[]
  addContract: (c: Omit<SubContract, 'id' | 'createdAt'>) => void
  updateContract: (id: string, patch: Partial<SubContract>) => void
  deleteContract: (id: string) => void
  addItem: (contractId: string, item: Omit<ContractItem, 'id'>) => void
  removeItem: (contractId: string, itemId: string) => void
  contractsFor: (subContractorId: string) => SubContract[]
}

const Ctx = createContext<ContractContextType | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): SubContract {
  return {
    id: row.id,
    projectId: row.project_id,
    contractNo: row.contract_no,
    subContractorId: row.sub_contractor_id,
    subContractorName: row.sub_contractor_name,
    company: row.company,
    trade: row.trade,
    signedDate: row.signed_date,
    value: row.value ?? 0,
    items: row.items ?? [],
    fileRef: row.file_ref ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

export function ContractProvider({ children }: { children: ReactNode }) {
  const [contracts, setContracts] = useState<SubContract[]>([])

  useEffect(() => {
    supabase.from('sub_contracts').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setContracts(data.map(fromRow)) })

    const channel = supabase
      .channel('sub-contracts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_contracts' }, (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (payload.eventType === 'INSERT')
          setContracts(prev => prev.some(c => c.id === p.new.id) ? prev : [fromRow(p.new), ...prev])
        else if (payload.eventType === 'UPDATE')
          setContracts(prev => prev.map(c => c.id === p.new.id ? fromRow(p.new) : c))
        else if (payload.eventType === 'DELETE')
          setContracts(prev => prev.filter(c => c.id !== p.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const addContract = (c: Omit<SubContract, 'id' | 'createdAt'>) => {
    const id = `CTR${Date.now()}`
    const createdAt = new Date().toISOString()
    const newC: SubContract = { ...c, id, createdAt }
    setContracts(prev => [newC, ...prev])
    supabase.from('sub_contracts').insert({
      id,
      project_id: c.projectId,
      contract_no: c.contractNo,
      sub_contractor_id: c.subContractorId,
      sub_contractor_name: c.subContractorName,
      company: c.company,
      trade: c.trade,
      signed_date: c.signedDate,
      value: c.value,
      items: c.items,
      file_ref: c.fileRef ?? null,
      created_at: createdAt,
      created_by: c.createdBy,
    }).then(({ error }) => {
      if (error) { console.error(error); setContracts(prev => prev.filter(x => x.id !== id)) }
    })
  }

  const updateContract = (id: string, patch: Partial<SubContract>) => {
    setContracts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = {}
    if (patch.contractNo) row.contract_no = patch.contractNo
    if (patch.trade) row.trade = patch.trade
    if (patch.value !== undefined) row.value = patch.value
    if (patch.items) row.items = patch.items
    if (patch.fileRef !== undefined) row.file_ref = patch.fileRef
    supabase.from('sub_contracts').update(row).eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const deleteContract = (id: string) => {
    setContracts(prev => prev.filter(c => c.id !== id))
    supabase.from('sub_contracts').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error(error) })
  }

  const addItem = (contractId: string, item: Omit<ContractItem, 'id'>) => {
    const newItem: ContractItem = { ...item, id: `ITM${Date.now()}` }
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c
      const items = [...c.items, newItem]
      supabase.from('sub_contracts').update({ items }).eq('id', contractId)
        .then(({ error }) => { if (error) console.error(error) })
      return { ...c, items }
    }))
  }

  const removeItem = (contractId: string, itemId: string) => {
    setContracts(prev => prev.map(c => {
      if (c.id !== contractId) return c
      const items = c.items.filter(i => i.id !== itemId)
      supabase.from('sub_contracts').update({ items }).eq('id', contractId)
        .then(({ error }) => { if (error) console.error(error) })
      return { ...c, items }
    }))
  }

  const contractsFor = (subContractorId: string) =>
    contracts.filter(c => c.subContractorId === subContractorId)

  return (
    <Ctx.Provider value={{ contracts, addContract, updateContract, deleteContract, addItem, removeItem, contractsFor }}>
      {children}
    </Ctx.Provider>
  )
}

export function useContracts(): ContractContextType {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useContracts must be inside <ContractProvider>')
  return ctx
}
