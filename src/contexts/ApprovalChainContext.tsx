import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { ChainStep, GlobalRole } from '../types'

export type DocType = 'si' | 'vo' | 'ptw'

interface ChainContextValue {
  stepsByDocType: Record<DocType, ChainStep[]>
  loading: boolean
  canEdit: boolean
  projectName: string | null
  saveChain: (docType: DocType, steps: ChainStep[]) => Promise<{ error: string | null }>
  refetch: () => Promise<void>
}

const ApprovalChainContext = createContext<ChainContextValue | null>(null)

export function ApprovalChainProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [stepsByDocType, setSteps] = useState<Record<DocType, ChainStep[]>>({ si: [], vo: [], ptw: [] })
  const [loading, setLoading] = useState(true)
  const [assignedPmIds, setAssignedPmIds] = useState<string[]>([])
  const [projectName, setProjectName] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [rowsRes, projRes] = await Promise.all([
      supabase
        .from('approval_chain_steps')
        .select('*')
        .eq('project_id', projectId)
        .order('step_order', { ascending: true }),
      supabase
        .from('projects')
        .select('name, assigned_pm_ids')
        .eq('id', projectId)
        .single(),
    ])
    const next: Record<DocType, ChainStep[]> = { si: [], vo: [], ptw: [] }
    ;(rowsRes.data || []).forEach((r: any) => {
      if (r.doc_type === 'si' || r.doc_type === 'vo' || r.doc_type === 'ptw') {
        next[r.doc_type as DocType].push({
          step_order: r.step_order,
          required_role: r.required_role as GlobalRole,
          optional_user_id: r.optional_user_id,
        })
      }
    })
    // Defensive: ensure step_order ascending
    ;(['si','vo','ptw'] as DocType[]).forEach(dt => {
      next[dt].sort((a, b) => a.step_order - b.step_order)
    })
    setSteps(next)
    setAssignedPmIds((projRes.data?.assigned_pm_ids as string[]) || [])
    setProjectName((projRes.data?.name as string) || null)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refetch()
    const ch = supabase
      .channel(`chains-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_chain_steps', filter: `project_id=eq.${projectId}` }, () => refetch())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, refetch])

  const canEdit = !!profile && (profile.global_role === 'admin' || assignedPmIds.includes(profile.id))

  const saveChain = useCallback(async (docType: DocType, steps: ChainStep[]) => {
    const payload = steps.map((s, i) => ({
      step_order: i,
      required_role: s.required_role,
      optional_user_id: s.optional_user_id,
    }))
    const { error } = await supabase.rpc('save_chain_steps', {
      p_project_id: projectId,
      p_doc_type: docType,
      p_steps: payload,
    })
    if (!error) await refetch()
    return { error: error?.message ?? null }
  }, [projectId, refetch])

  return (
    <ApprovalChainContext.Provider value={{ stepsByDocType, loading, canEdit, projectName, saveChain, refetch }}>
      {children}
    </ApprovalChainContext.Provider>
  )
}

export function useApprovalChain(): ChainContextValue {
  const ctx = useContext(ApprovalChainContext)
  if (!ctx) throw new Error('useApprovalChain must be used within <ApprovalChainProvider>')
  return ctx
}
