import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import type { SI, SIVersion, ProtestComment, Approval, SiPayload } from '../types'

interface SiContextValue {
  sis: SI[]
  versionsBySi: Record<string, SIVersion[]>
  approvalsBySi: Record<string, Approval[]>
  commentsBySi: Record<string, ProtestComment[]>
  loading: boolean
  fetchError: string | null
  canSubmit: boolean

  createDraftSi: () => Promise<{ id: string | null; error: string | null }>
  saveVersion: (siId: string, payload: SiPayload) => Promise<{ versionNo: number | null; error: string | null }>
  submitSi: (siId: string) => Promise<{ error: string | null }>
  approve: (siId: string, edits?: SiPayload) => Promise<{ error: string | null }>
  requestRevision: (siId: string, reason: string) => Promise<{ error: string | null }>
  reject: (siId: string, reason: string) => Promise<{ error: string | null }>
  adminOverride: (siId: string, reason: string) => Promise<{ error: string | null }>
  addProtest: (siId: string, body: string) => Promise<{ error: string | null }>

  refetch: () => Promise<void>
}

export const SiContext = createContext<SiContextValue | null>(null)

export function SiProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [sis, setSis] = useState<SI[]>([])
  const [versionsBySi, setVersionsBySi] = useState<Record<string, SIVersion[]>>({})
  const [approvalsBySi, setApprovalsBySi] = useState<Record<string, Approval[]>>({})
  const [commentsBySi, setCommentsBySi] = useState<Record<string, ProtestComment[]>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!profile) return false
    return ['admin', 'pm', 'main_contractor', 'subcontractor', 'subcontractor_worker'].includes(profile.global_role)
  }, [profile])

  const refetch = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const siRes = await supabase
      .from('site_instructions').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (siRes.error) {
      console.error('site_instructions fetch error:', siRes.error)
      setFetchError(siRes.error.message)
      setLoading(false)
      return
    }
    const sis = (siRes.data || []) as SI[]
    setSis(sis)
    const siIds = sis.map(s => s.id)
    // Do NOT embed site_instructions on si_versions: si_versions has TWO FKs to
    // it (si_id forward + the current_version_id back-reference), so a
    // `site_instructions!inner` embed is AMBIGUOUS — PostgREST errors and every
    // version silently drops, leaving the list title as "(未填寫標題)". Filter by
    // the already-fetched SI ids instead.
    const [verRes, apRes, cmRes] = await Promise.all([
      siIds.length
        ? supabase.from('si_versions').select('*').in('si_id', siIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from('approvals').select('*').eq('doc_type', 'si'),
      supabase.from('protest_comments').select('*'),
    ])
    if (verRes.error) console.error('si_versions fetch error:', verRes.error)
    const vmap: Record<string, SIVersion[]> = {}
    ;(verRes.data || []).forEach((v: any) => {
      ;(vmap[v.si_id] ||= []).push(v as SIVersion)
    })
    setVersionsBySi(vmap)
    const amap: Record<string, Approval[]> = {}
    ;((apRes.data || []) as Approval[]).forEach(a => {
      ;(amap[a.doc_id] ||= []).push(a)
    })
    setApprovalsBySi(amap)
    const cmap: Record<string, ProtestComment[]> = {}
    ;((cmRes.data || []) as ProtestComment[]).forEach(c => {
      ;(cmap[c.si_id] ||= []).push(c)
    })
    setCommentsBySi(cmap)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refetch()
    // Realtime channel scoped to this project (D-26).
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const ch = supabase
      .channel(`si-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_instructions', filter: `project_id=eq.${projectId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'si_versions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: 'doc_type=eq.si' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'protest_comments' }, onChange)
      .subscribe()
    return () => { onChange.cancel(); supabase.removeChannel(ch) }
  }, [projectId, refetch])

  const createDraftSi = useCallback(async () => {
    if (!profile) return { id: null, error: '未登入' }
    const { data: numData, error: numErr } = await supabase.rpc('next_si_number', { p_project_id: projectId })
    if (numErr) return { id: null, error: numErr.message }
    const { data, error } = await supabase
      .from('site_instructions')
      .insert({ project_id: projectId, number: numData, created_by: profile.id, status: 'draft', current_step: 0 })
      .select('id').single()
    if (error) return { id: null, error: error.message }
    return { id: data.id, error: null }
  }, [profile, projectId])

  const saveVersion = useCallback(async (siId: string, payload: SiPayload) => {
    if (!profile) return { versionNo: null, error: '未登入' }
    // Compute next version_no client-side; concurrency caught by unique(si_id,version_no).
    const existing = versionsBySi[siId] || []
    const nextNo = existing.reduce((m, v) => Math.max(m, v.version_no), 0) + 1
    const { error } = await supabase
      .from('si_versions')
      .insert({ si_id: siId, version_no: nextNo, payload, edits_by: profile.id })
    if (error) return { versionNo: null, error: error.message }
    // Update parent's current_version_id (creator-while-draft RLS allows).
    const { data: vRow } = await supabase
      .from('si_versions')
      .select('id')
      .eq('si_id', siId)
      .eq('version_no', nextNo)
      .single()
    if (vRow) {
      await supabase.from('site_instructions').update({ current_version_id: vRow.id }).eq('id', siId)
    }
    return { versionNo: nextNo, error: null }
  }, [profile, versionsBySi])

  const submitSi = useCallback(async (siId: string) => {
    const { error } = await supabase.rpc('submit_si', { p_si_id: siId })
    return { error: error?.message ?? null }
  }, [])

  const callApproval = useCallback(async (
    siId: string,
    action: string,
    reason: string | null,
    edits: SiPayload | null,
  ) => {
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'si',
      p_doc_id: siId,
      p_action_type: action,
      p_reason: reason,
      p_edits_jsonb: edits,
    })
    return { error: error?.message ?? null }
  }, [])

  // BLOCKER 1 fix: approve_with_edits goes through submit_approval ONLY.
  // The RPC writes si_versions server-side in the same txn as the approvals INSERT.
  // This eliminates the two-write race + audit gap.
  const approve = useCallback(async (siId: string, edits?: SiPayload) => {
    if (edits) return callApproval(siId, 'approve_with_edits', null, edits)
    return callApproval(siId, 'approve', null, null)
  }, [callApproval])

  const requestRevision = useCallback(
    (siId: string, reason: string) => callApproval(siId, 'request_revision', reason, null),
    [callApproval],
  )
  const reject = useCallback(
    (siId: string, reason: string) => callApproval(siId, 'reject', reason, null),
    [callApproval],
  )
  const adminOverride = useCallback(
    (siId: string, reason: string) => callApproval(siId, 'admin_override', reason, null),
    [callApproval],
  )

  const addProtest = useCallback(async (siId: string, body: string) => {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('protest_comments').insert({ si_id: siId, author_id: profile.id, body })
    return { error: error?.message ?? null }
  }, [profile])

  const value: SiContextValue = {
    sis,
    versionsBySi,
    approvalsBySi,
    commentsBySi,
    loading,
    fetchError,
    canSubmit,
    createDraftSi,
    saveVersion,
    submitSi,
    approve,
    requestRevision,
    reject,
    adminOverride,
    addProtest,
    refetch,
  }
  return <SiContext.Provider value={value}>{children}</SiContext.Provider>
}

export function useSi(): SiContextValue {
  const ctx = useContext(SiContext)
  if (!ctx) throw new Error('useSi must be used within <SiProvider>')
  return ctx
}
