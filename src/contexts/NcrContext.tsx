import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { compressImage } from '../lib/image-compress'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import type { Ncr, NcrSeverity } from '../types'

// 不符合事項報告 / 糾正措施 (NCR / CAR) — per-project quality non-conformity
// workflow. An editor RAISES an NCR; the responsible party submits a CAR
// (root-cause + corrective + preventive action); a manager VERIFIES + CLOSES.
// All state transitions go through SECURITY DEFINER RPCs so the verifier gate
// cannot be bypassed (the UPDATE RLS policy only lets the raiser fix text while
// still open). Scoped to one projectId; one realtime channel refetches the list.
//
// Physical table is `ncr_reports` (a sim table squats `ncrs`). Photos reuse the
// private issue-photos bucket (signed-URL render via lib/issuePhotos).

export interface NcrRaiseInput {
  title: string
  description: string
  location?: string | null
  spec_ref?: string | null
  severity: NcrSeverity
  responsible_party?: string | null
  target_close_date?: string | null
  photos: string[]
}

export interface NcrCorrectiveInput {
  root_cause: string
  corrective_action: string
  preventive_action: string
}

interface NcrCtx {
  ncrs: Ncr[]
  loading: boolean
  error: string | null
  canManage: boolean   // raise / submit corrective (editor gate)
  canVerify: boolean   // close / reopen (manager gate)
  refresh: () => Promise<void>
  raiseNcr: (input: NcrRaiseInput) => Promise<{ id: string | null; number: string | null; error: string | null }>
  updateNcr: (id: string, patch: Partial<NcrRaiseInput>) => Promise<{ error: string | null }>
  deleteNcr: (id: string) => Promise<{ error: string | null }>
  submitCorrective: (id: string, input: NcrCorrectiveInput) => Promise<{ error: string | null }>
  closeNcr: (id: string) => Promise<{ error: string | null }>
  reopenNcr: (id: string) => Promise<{ error: string | null }>
  voidNcr: (id: string) => Promise<{ error: string | null }>
  uploadPhoto: (file: File) => Promise<{ path: string | null; error: string | null }>
}

const Ctx = createContext<NcrCtx | null>(null)

// Editor gate — mirrors can_edit_project_progress (admin / assigned PM /
// approved pm|main_contractor|subcontractor): may raise + submit corrective.
const EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor']
// Verifier gate — mirrors close_ncr/reopen_ncr (admin / assigned PM /
// approved pm|main_contractor): may verify-close.
const VERIFIER_ROLES = ['pm', 'main_contractor']

export function NcrProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const [ncrs, setNcrs] = useState<Ncr[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const { canManage, canVerify } = useMemo(() => {
    if (!profile) return { canManage: false, canVerify: false }
    if (profile.global_role === 'admin') return { canManage: true, canVerify: true }
    const project = projects.find(p => p.id === projectId)
    const isAssignedPm = !!project?.assigned_pm_ids.includes(profile.id)
    const myRole = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )?.role
    return {
      canManage: isAssignedPm || (!!myRole && EDITOR_ROLES.includes(myRole)),
      canVerify: isAssignedPm || (!!myRole && VERIFIER_ROLES.includes(myRole)),
    }
  }, [profile, projects, memberships, projectId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('ncr_reports')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setNcrs([])
    } else {
      setNcrs((data ?? []) as Ncr[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`ncr-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ncr_reports', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [projectId, refresh])

  const uploadPhoto = useCallback(async (file: File): Promise<{ path: string | null; error: string | null }> => {
    if (!profile) return { path: null, error: '未登入' }
    const toUpload = await compressImage(file)
    const ext = toUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('issue-photos')
      .upload(fileName, toUpload, { contentType: toUpload.type, upsert: false })
    if (upErr) return { path: null, error: upErr.message }
    return { path: fileName, error: null }
  }, [profile])

  const raiseNcr = useCallback(async (input: NcrRaiseInput) => {
    if (!profile) return { id: null, number: null, error: '未登入' }
    const { data: numberData, error: numberErr } =
      await supabase.rpc('next_ncr_number', { p_project_id: projectId })
    if (numberErr || !numberData) {
      return { id: null, number: null, error: numberErr?.message || '無法產生編號' }
    }
    const { data, error: err } = await supabase
      .from('ncr_reports')
      .insert({
        project_id: projectId,
        number: numberData as string,
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location?.trim() || null,
        spec_ref: input.spec_ref?.trim() || null,
        severity: input.severity,
        responsible_party: input.responsible_party?.trim() || null,
        target_close_date: input.target_close_date || null,
        photos: input.photos,
        raised_by: profile.id,
      })
      .select('id')
      .single()
    if (err) return { id: null, number: null, error: err.message }
    return { id: (data?.id as string) ?? null, number: numberData as string, error: null }
  }, [profile, projectId])

  const updateNcr = useCallback(async (id: string, patch: Partial<NcrRaiseInput>) => {
    const cleaned: Record<string, unknown> = {}
    if (patch.title !== undefined) cleaned.title = patch.title.trim()
    if (patch.description !== undefined) cleaned.description = patch.description.trim()
    if (patch.location !== undefined) cleaned.location = patch.location?.trim() || null
    if (patch.spec_ref !== undefined) cleaned.spec_ref = patch.spec_ref?.trim() || null
    if (patch.severity !== undefined) cleaned.severity = patch.severity
    if (patch.responsible_party !== undefined) cleaned.responsible_party = patch.responsible_party?.trim() || null
    if (patch.target_close_date !== undefined) cleaned.target_close_date = patch.target_close_date || null
    if (patch.photos !== undefined) cleaned.photos = patch.photos
    const { error: err } = await supabase.from('ncr_reports').update(cleaned).eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const deleteNcr = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('ncr_reports').delete().eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const rpcAction = useCallback(async (fn: string, params: Record<string, unknown>) => {
    const { error: err } = await supabase.rpc(fn, params)
    if (err) return { error: err.message }
    await refresh()
    return { error: null }
  }, [refresh])

  const submitCorrective = useCallback((id: string, input: NcrCorrectiveInput) =>
    rpcAction('submit_ncr_corrective', {
      p_id: id,
      p_root_cause: input.root_cause.trim(),
      p_corrective_action: input.corrective_action.trim(),
      p_preventive_action: input.preventive_action.trim(),
    }), [rpcAction])

  const closeNcr = useCallback((id: string) => rpcAction('close_ncr', { p_id: id }), [rpcAction])
  const reopenNcr = useCallback((id: string) => rpcAction('reopen_ncr', { p_id: id }), [rpcAction])
  const voidNcr = useCallback((id: string) => rpcAction('void_ncr', { p_id: id }), [rpcAction])

  const value = useMemo<NcrCtx>(() => ({
    ncrs, loading, error, canManage, canVerify, refresh,
    raiseNcr, updateNcr, deleteNcr, submitCorrective, closeNcr, reopenNcr, voidNcr, uploadPhoto,
  }), [ncrs, loading, error, canManage, canVerify, refresh,
    raiseNcr, updateNcr, deleteNcr, submitCorrective, closeNcr, reopenNcr, voidNcr, uploadPhoto])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNcr() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNcr must be used inside NcrProvider')
  return ctx
}
