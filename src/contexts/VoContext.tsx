import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { VO, VOVersion, Approval, VoPayload } from '../types'

interface VoContextValue {
  vos: VO[]
  versionsByVo: Record<string, VOVersion[]>
  approvalsByVo: Record<string, Approval[]>
  loading: boolean
  fetchError: string | null
  canSubmit: boolean

  createDraftVo: (siId: string) => Promise<{ id: string | null; error: string | null }>
  saveVersion: (voId: string, payload: VoPayload) => Promise<{ versionNo: number | null; error: string | null }>
  submitVo: (voId: string) => Promise<{ error: string | null }>
  approve: (voId: string, edits?: VoPayload) => Promise<{ error: string | null }>
  requestRevision: (voId: string, reason: string) => Promise<{ error: string | null }>
  reject: (voId: string, reason: string) => Promise<{ error: string | null }>
  adminOverride: (voId: string, reason: string) => Promise<{ error: string | null }>

  refetch: () => Promise<void>
}

export const VoContext = createContext<VoContextValue | null>(null)

export function VoProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [vos, setVos] = useState<VO[]>([])
  const [versionsByVo, setVersionsByVo] = useState<Record<string, VOVersion[]>>({})
  const [approvalsByVo, setApprovalsByVo] = useState<Record<string, Approval[]>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // VO-01: MC raises VO. Admin + PM can also submit; subcontractor cannot.
  const canSubmit = useMemo(() => {
    if (!profile) return false
    return ['admin', 'pm', 'main_contractor', 'general_foreman'].includes(profile.global_role)
  }, [profile])

  const refetch = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const [voRes, verRes, apRes] = await Promise.all([
      supabase.from('variation_orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('vo_versions').select('*, vo:variation_orders!inner(project_id)').eq('vo.project_id', projectId),
      supabase.from('approvals').select('*').eq('doc_type', 'vo'),
    ])
    if (voRes.error) {
      console.error('variation_orders fetch error:', voRes.error)
      setFetchError(voRes.error.message)
      setLoading(false)
      return
    }
    setVos((voRes.data || []) as VO[])
    const vmap: Record<string, VOVersion[]> = {}
    ;(verRes.data || []).forEach((v: any) => {
      ;(vmap[v.vo_id] ||= []).push(v as VOVersion)
    })
    setVersionsByVo(vmap)
    const amap: Record<string, Approval[]> = {}
    ;((apRes.data || []) as Approval[]).forEach(a => {
      ;(amap[a.doc_id] ||= []).push(a)
    })
    setApprovalsByVo(amap)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refetch()
    // Realtime channel scoped to this project (D-26).
    const ch = supabase
      .channel(`vo-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'variation_orders', filter: `project_id=eq.${projectId}` }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vo_versions' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: 'doc_type=eq.vo' }, () => refetch())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, refetch])

  const createDraftVo = useCallback(async (siId: string) => {
    if (!profile) return { id: null, error: '未登入' }
    // Client-side guards (server is authoritative via submit_vo + UNIQUE constraint).
    const { data: parent, error: parentErr } = await supabase
      .from('site_instructions')
      .select('id, status, project_id')
      .eq('id', siId)
      .single()
    if (parentErr || !parent) return { id: null, error: '找不到對應的工地指令' }
    if (parent.status !== 'locked') return { id: null, error: '只可基於已鎖定的工地指令提出變更指令' }
    if (parent.project_id !== projectId) return { id: null, error: '工地指令不屬於此項目' }

    const { data: existing } = await supabase
      .from('variation_orders')
      .select('id')
      .eq('si_id', siId)
      .maybeSingle()
    if (existing) return { id: null, error: '此工地指令已有變更指令' }

    const { data: numData, error: numErr } = await supabase.rpc('next_vo_number', { p_project_id: projectId })
    if (numErr) return { id: null, error: numErr.message }
    const { data, error } = await supabase
      .from('variation_orders')
      .insert({
        project_id: projectId,
        si_id: siId,
        number: numData,
        created_by: profile.id,
        status: 'draft',
        current_step: 0,
        total_amount_cents: 0,
      })
      .select('id').single()
    if (error) return { id: null, error: error.message }
    return { id: data.id, error: null }
  }, [profile, projectId])

  const saveVersion = useCallback(async (voId: string, payload: VoPayload) => {
    if (!profile) return { versionNo: null, error: '未登入' }
    const existing = versionsByVo[voId] || []
    const nextNo = existing.reduce((m, v) => Math.max(m, v.version_no), 0) + 1
    // Trigger recompute_vo_totals recomputes subtotal_cents + total_amount_cents server-side.
    const { error } = await supabase
      .from('vo_versions')
      .insert({ vo_id: voId, version_no: nextNo, payload, edits_by: profile.id })
    if (error) return { versionNo: null, error: error.message }
    const { data: vRow } = await supabase
      .from('vo_versions')
      .select('id')
      .eq('vo_id', voId)
      .eq('version_no', nextNo)
      .single()
    if (vRow) {
      await supabase.from('variation_orders').update({ current_version_id: vRow.id }).eq('id', voId)
    }
    return { versionNo: nextNo, error: null }
  }, [profile, versionsByVo])

  const submitVo = useCallback(async (voId: string) => {
    const { error } = await supabase.rpc('submit_vo', { p_vo_id: voId })
    return { error: error?.message ?? null }
  }, [])

  const callApproval = useCallback(async (
    voId: string,
    action: string,
    reason: string | null,
    edits: VoPayload | null,
  ) => {
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'vo',
      p_doc_id: voId,
      p_action_type: action,
      p_reason: reason,
      p_edits_jsonb: edits,
    })
    return { error: error?.message ?? null }
  }, [])

  // approve_with_edits: server writes vo_versions in same txn via submit_approval RPC.
  const approve = useCallback(async (voId: string, edits?: VoPayload) => {
    if (edits) return callApproval(voId, 'approve_with_edits', null, edits)
    return callApproval(voId, 'approve', null, null)
  }, [callApproval])

  const requestRevision = useCallback(
    (voId: string, reason: string) => callApproval(voId, 'request_revision', reason, null),
    [callApproval],
  )
  const reject = useCallback(
    (voId: string, reason: string) => callApproval(voId, 'reject', reason, null),
    [callApproval],
  )
  const adminOverride = useCallback(
    (voId: string, reason: string) => callApproval(voId, 'admin_override', reason, null),
    [callApproval],
  )

  const value: VoContextValue = {
    vos,
    versionsByVo,
    approvalsByVo,
    loading,
    fetchError,
    canSubmit,
    createDraftVo,
    saveVersion,
    submitVo,
    approve,
    requestRevision,
    reject,
    adminOverride,
    refetch,
  }
  return <VoContext.Provider value={value}>{children}</VoContext.Provider>
}

export function useVo(): VoContextValue {
  const ctx = useContext(VoContext)
  if (!ctx) throw new Error('useVo must be used within <VoProvider>')
  return ctx
}
