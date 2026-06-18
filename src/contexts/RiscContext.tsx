import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { compressImage } from '../lib/image-compress'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import type { Risc, RiscWorkType } from '../types'

// 申請檢查 / 驗收 (Request for Inspection, RISC-lite, v89). A contractor RAISES a
// request that work is ready; an inspector (admin / PM / 總承建商) responds
// pass / fail with a comment via the inspect_risc SECURITY DEFINER RPC. Scoped to
// one projectId; one realtime channel refetches the list. Photos reuse the
// private issue-photos bucket (signed-URL render via lib/issuePhotos).

export interface RiscRaiseInput {
  title: string
  work_type: RiscWorkType
  location?: string | null
  spec_ref?: string | null
  proposed_at?: string | null
  description?: string | null
  photos: string[]
}

interface RiscCtx {
  riscs: Risc[]
  loading: boolean
  error: string | null
  canManage: boolean   // raise / edit-own-while-submitted (editor gate)
  canInspect: boolean  // pass / fail verdict (inspector gate)
  refresh: () => Promise<void>
  raiseRisc: (input: RiscRaiseInput) => Promise<{ id: string | null; number: string | null; error: string | null }>
  updateRisc: (id: string, patch: Partial<RiscRaiseInput>) => Promise<{ error: string | null }>
  deleteRisc: (id: string) => Promise<{ error: string | null }>
  inspectRisc: (id: string, result: 'pass' | 'fail', comment: string) => Promise<{ error: string | null }>
  cancelRisc: (id: string) => Promise<{ error: string | null }>
  uploadPhoto: (file: File) => Promise<{ path: string | null; error: string | null }>
}

const Ctx = createContext<RiscCtx | null>(null)

// Editor gate — mirrors can_edit_project_progress (admin / assigned PM / approved
// pm|main_contractor|subcontractor): may raise + edit own.
const EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor']
// Inspector gate — mirrors inspect_risc (admin / assigned PM / approved
// pm|main_contractor): may pass/fail.
const INSPECTOR_ROLES = ['pm', 'main_contractor']

export function RiscProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const [riscs, setRiscs] = useState<Risc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const { canManage, canInspect } = useMemo(() => {
    if (!profile) return { canManage: false, canInspect: false }
    if (profile.global_role === 'admin') return { canManage: true, canInspect: true }
    const project = projects.find(p => p.id === projectId)
    const isAssignedPm = !!project?.assigned_pm_ids.includes(profile.id)
    const myRole = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )?.role
    return {
      canManage: isAssignedPm || (!!myRole && EDITOR_ROLES.includes(myRole)),
      canInspect: isAssignedPm || (!!myRole && INSPECTOR_ROLES.includes(myRole)),
    }
  }, [profile, projects, memberships, projectId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('risc_requests')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setRiscs([])
    } else {
      setRiscs((data ?? []) as Risc[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`risc-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'risc_requests', filter: `project_id=eq.${projectId}` },
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

  const raiseRisc = useCallback(async (input: RiscRaiseInput) => {
    if (!profile) return { id: null, number: null, error: '未登入' }
    const { data: numberData, error: numberErr } =
      await supabase.rpc('next_risc_number', { p_project_id: projectId })
    if (numberErr || !numberData) {
      return { id: null, number: null, error: numberErr?.message || '無法產生編號' }
    }
    const { data, error: err } = await supabase
      .from('risc_requests')
      .insert({
        project_id: projectId,
        number: numberData as string,
        title: input.title.trim(),
        work_type: input.work_type,
        location: input.location?.trim() || null,
        spec_ref: input.spec_ref?.trim() || null,
        proposed_at: input.proposed_at || null,
        description: input.description?.trim() || null,
        photos: input.photos,
        raised_by: profile.id,
      })
      .select('id')
      .single()
    if (err) return { id: null, number: null, error: err.message }
    return { id: (data?.id as string) ?? null, number: numberData as string, error: null }
  }, [profile, projectId])

  const updateRisc = useCallback(async (id: string, patch: Partial<RiscRaiseInput>) => {
    const cleaned: Record<string, unknown> = {}
    if (patch.title !== undefined) cleaned.title = patch.title.trim()
    if (patch.work_type !== undefined) cleaned.work_type = patch.work_type
    if (patch.location !== undefined) cleaned.location = patch.location?.trim() || null
    if (patch.spec_ref !== undefined) cleaned.spec_ref = patch.spec_ref?.trim() || null
    if (patch.proposed_at !== undefined) cleaned.proposed_at = patch.proposed_at || null
    if (patch.description !== undefined) cleaned.description = patch.description?.trim() || null
    if (patch.photos !== undefined) cleaned.photos = patch.photos
    const { error: err } = await supabase.from('risc_requests').update(cleaned).eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const deleteRisc = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('risc_requests').delete().eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const rpcAction = useCallback(async (fn: string, params: Record<string, unknown>) => {
    const { error: err } = await supabase.rpc(fn, params)
    if (err) return { error: err.message }
    await refresh()
    return { error: null }
  }, [refresh])

  const inspectRisc = useCallback((id: string, result: 'pass' | 'fail', comment: string) =>
    rpcAction('inspect_risc', { p_id: id, p_result: result, p_comment: comment.trim() }), [rpcAction])
  const cancelRisc = useCallback((id: string) => rpcAction('cancel_risc', { p_id: id }), [rpcAction])

  const value = useMemo<RiscCtx>(() => ({
    riscs, loading, error, canManage, canInspect, refresh,
    raiseRisc, updateRisc, deleteRisc, inspectRisc, cancelRisc, uploadPhoto,
  }), [riscs, loading, error, canManage, canInspect, refresh,
    raiseRisc, updateRisc, deleteRisc, inspectRisc, cancelRisc, uploadPhoto])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRisc() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRisc must be used inside RiscProvider')
  return ctx
}
