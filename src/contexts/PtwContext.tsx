import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import type {
  PTW, PtwVersion, PermitWorker, PermitSignoff, PermitScan, Approval, PtwPayload,
} from '../types'

interface PtwContextValue {
  ptws: PTW[]
  versionsByPtw: Record<string, PtwVersion[]>
  workersByPtw: Record<string, PermitWorker[]>
  approvalsByPtw: Record<string, Approval[]>
  signoffsByPtw: Record<string, PermitSignoff[]>
  scansByPtw: Record<string, PermitScan[]>
  projectId: string
  loading: boolean
  fetchError: string | null
  canSubmit: boolean

  createDraft: (ptwType: PTW['ptw_type']) => Promise<{ id: string | null; error: string | null }>
  saveVersion: (ptwId: string, payload: PtwPayload) => Promise<{ versionNo: number | null; error: string | null }>
  submit: (ptwId: string) => Promise<{ error: string | null }>
  approve: (ptwId: string) => Promise<{ error: string | null }>
  requestRevision: (ptwId: string, reason: string) => Promise<{ error: string | null }>
  reject: (ptwId: string, reason: string) => Promise<{ error: string | null }>
  adminOverride: (ptwId: string, reason: string) => Promise<{ error: string | null }>
  startFireWatch: (ptwId: string) => Promise<{ error: string | null }>
  closeOut: (ptwId: string, signatureB64: string) => Promise<{ error: string | null }>
  addWorker: (ptwId: string, name: string, phone: string | null, photoPath: string | null) => Promise<{ id: string | null; error: string | null }>

  refetch: () => Promise<void>
}

const PtwContext = createContext<PtwContextValue | null>(null)

export function PtwProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const [ptws, setPtws] = useState<PTW[]>([])
  const [versionsByPtw, setVersionsByPtw] = useState<Record<string, PtwVersion[]>>({})
  const [workersByPtw, setWorkersByPtw] = useState<Record<string, PermitWorker[]>>({})
  const [approvalsByPtw, setApprovalsByPtw] = useState<Record<string, Approval[]>>({})
  const [signoffsByPtw, setSignoffsByPtw] = useState<Record<string, PermitSignoff[]>>({})
  const [scansByPtw, setScansByPtw] = useState<Record<string, PermitScan[]>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!profile) return false
    return ['admin', 'pm', 'main_contractor', 'subcontractor', 'subcontractor_worker'].includes(profile.global_role)
  }, [profile])

  const refetch = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const [pRes, vRes, wRes, aRes, sRes, scRes] = await Promise.all([
      supabase.from('permits_to_work').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('permit_versions').select('*, ptw:permits_to_work!inner(project_id)').eq('ptw.project_id', projectId),
      supabase.from('permit_workers').select('*, ptw:permits_to_work!inner(project_id)').eq('ptw.project_id', projectId),
      supabase.from('approvals').select('*').eq('doc_type', 'ptw'),
      supabase.from('permit_signoffs').select('*, ptw:permits_to_work!inner(project_id)').eq('ptw.project_id', projectId),
      supabase.from('permit_scans').select('*, ptw:permits_to_work!inner(project_id)').eq('ptw.project_id', projectId),
    ])
    if (pRes.error) {
      console.error('permits_to_work fetch error:', pRes.error)
      setFetchError(pRes.error.message)
      setLoading(false)
      return
    }
    setPtws((pRes.data || []) as PTW[])
    const vmap: Record<string, PtwVersion[]> = {}
    ;(vRes.data || []).forEach((v: any) => { (vmap[v.ptw_id] ||= []).push(v as PtwVersion) })
    setVersionsByPtw(vmap)
    const wmap: Record<string, PermitWorker[]> = {}
    ;(wRes.data || []).forEach((w: any) => { (wmap[w.ptw_id] ||= []).push(w as PermitWorker) })
    setWorkersByPtw(wmap)
    const amap: Record<string, Approval[]> = {}
    ;((aRes.data || []) as Approval[]).forEach(a => { (amap[a.doc_id] ||= []).push(a) })
    setApprovalsByPtw(amap)
    const smap: Record<string, PermitSignoff[]> = {}
    ;(sRes.data || []).forEach((s: any) => { (smap[s.ptw_id] ||= []).push(s as PermitSignoff) })
    setSignoffsByPtw(smap)
    const scmap: Record<string, PermitScan[]> = {}
    ;(scRes.data || []).forEach((sc: any) => { (scmap[sc.ptw_id] ||= []).push(sc as PermitScan) })
    setScansByPtw(scmap)
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refetch()
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const ch = supabase
      .channel(`ptw-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permits_to_work', filter: `project_id=eq.${projectId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permit_versions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permit_workers' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permit_signoffs' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: 'doc_type=eq.ptw' }, onChange)
      .subscribe()
    return () => { onChange.cancel(); supabase.removeChannel(ch) }
  }, [projectId, refetch])

  const createDraft = useCallback(async (ptwType: PTW['ptw_type']) => {
    if (!profile) return { id: null, error: '未登入' }
    const { data: numberData, error: numberErr } = await supabase.rpc('next_ptw_number', { p_project_id: projectId })
    if (numberErr || !numberData) return { id: null, error: numberErr?.message || 'next_ptw_number failed' }
    const { data, error } = await supabase
      .from('permits_to_work')
      .insert({
        project_id: projectId,
        number: numberData as unknown as string,
        ptw_type: ptwType,
        created_by: profile.id,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error) return { id: null, error: error.message }
    return { id: data.id as string, error: null }
  }, [profile, projectId])

  const saveVersion = useCallback(async (ptwId: string, payload: PtwPayload) => {
    if (!profile) return { versionNo: null, error: '未登入' }
    const existing = versionsByPtw[ptwId] || []
    const versionNo = (existing[existing.length - 1]?.version_no ?? 0) + 1
    const { error } = await supabase.from('permit_versions').insert({
      ptw_id: ptwId,
      version_no: versionNo,
      payload: payload as unknown as Record<string, unknown>,
      edits_by: profile.id,
    })
    if (error) return { versionNo: null, error: error.message }
    // Point parent at the new current_version_id
    const { data: vRow } = await supabase
      .from('permit_versions')
      .select('id')
      .eq('ptw_id', ptwId)
      .eq('version_no', versionNo)
      .single()
    if (vRow?.id) {
      await supabase.from('permits_to_work').update({ current_version_id: vRow.id }).eq('id', ptwId)
    }
    return { versionNo, error: null }
  }, [profile, versionsByPtw])

  const submit = useCallback(async (ptwId: string) => {
    const { error } = await supabase.rpc('submit_ptw', { p_ptw_id: ptwId })
    return { error: error?.message ?? null }
  }, [])

  const approve = useCallback(async (ptwId: string) => {
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'ptw', p_doc_id: ptwId, p_action_type: 'approve',
    })
    return { error: error?.message ?? null }
  }, [])

  const requestRevision = useCallback(async (ptwId: string, reason: string) => {
    if (reason.trim().length < 10) return { error: '需要至少 10 個字元嘅原因' }
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'ptw', p_doc_id: ptwId, p_action_type: 'request_revision', p_reason: reason,
    })
    return { error: error?.message ?? null }
  }, [])

  const reject = useCallback(async (ptwId: string, reason: string) => {
    if (reason.trim().length < 10) return { error: '需要至少 10 個字元嘅原因' }
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'ptw', p_doc_id: ptwId, p_action_type: 'reject', p_reason: reason,
    })
    return { error: error?.message ?? null }
  }, [])

  const adminOverride = useCallback(async (ptwId: string, reason: string) => {
    if (reason.trim().length < 10) return { error: '需要至少 10 個字元嘅原因' }
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: 'ptw', p_doc_id: ptwId, p_action_type: 'admin_override', p_reason: reason,
    })
    return { error: error?.message ?? null }
  }, [])

  const startFireWatch = useCallback(async (ptwId: string) => {
    // Direct update on permits_to_work. RLS UPDATE policy currently only allows
    // the creator to update during draft. Need a SECURITY DEFINER RPC for this
    // — to be added in a future plan. For now, use direct update under the
    // assumption the operator is the creator (typical hot_work close-out path).
    const { error } = await supabase
      .from('permits_to_work')
      .update({ fire_watch_started_at: new Date().toISOString() })
      .eq('id', ptwId)
    return { error: error?.message ?? null }
  }, [])

  const closeOut = useCallback(async (ptwId: string, signatureB64: string) => {
    const { error } = await supabase.rpc('close_out_ptw', { p_ptw_id: ptwId, p_signature_b64: signatureB64 })
    return { error: error?.message ?? null }
  }, [])

  const addWorker = useCallback(async (
    ptwId: string,
    name: string,
    phone: string | null,
    photoPath: string | null,
  ) => {
    const { data, error } = await supabase
      .from('permit_workers')
      .insert({ ptw_id: ptwId, worker_name: name, worker_phone: phone, worker_photo_path: photoPath })
      .select('id')
      .single()
    if (error) return { id: null, error: error.message }
    return { id: data.id as string, error: null }
  }, [])

  const value: PtwContextValue = {
    ptws,
    versionsByPtw,
    workersByPtw,
    approvalsByPtw,
    signoffsByPtw,
    scansByPtw,
    loading,
    fetchError,
    canSubmit,
    projectId,
    createDraft,
    saveVersion,
    submit,
    approve,
    requestRevision,
    reject,
    adminOverride,
    startFireWatch,
    closeOut,
    addWorker,
    refetch,
  }

  return <PtwContext.Provider value={value}>{children}</PtwContext.Provider>
}

export function usePtw(): PtwContextValue {
  const ctx = useContext(PtwContext)
  if (!ctx) throw new Error('usePtw must be used inside PtwProvider')
  return ctx
}
