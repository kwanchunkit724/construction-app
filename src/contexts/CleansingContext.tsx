import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { compressImage } from '../lib/image-compress'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import type {
  CleansingInspection,
  CleansingChecklistItem,
  CleansingFrequency,
  CleansingResult,
} from '../types'

// 清潔檢查 (Cleansing Inspection, DWSS 模組 ④) — per-project, scoped to one
// projectId (mounted inside the route). An editor records a dated checklist with
// photos; a manager verifies (one-way close-out). Mirrors ContactsContext /
// DailiesContext: one realtime channel refetches the whole project's list (n is
// small — a handful of inspections a day).
//
// Photos reuse the private `issue-photos` bucket (a generic per-uploader site-
// photo store rendered via signed URLs — lib/issuePhotos) so no new storage
// policy is introduced on the live app. Capture metadata (GPS + timestamp) is
// recorded best-effort in photo_metadata (v79) via lib/photoMeta.

export interface CleansingInput {
  inspected_on: string
  frequency: CleansingFrequency
  area: string
  checklist: CleansingChecklistItem[]
  result: CleansingResult
  notes?: string | null
  photos: string[]
}

interface CleansingCtx {
  inspections: CleansingInspection[]
  loading: boolean
  error: string | null
  canManage: boolean   // may create / edit own pre-verify (editor gate)
  canVerify: boolean   // may verify (manager gate)
  refresh: () => Promise<void>
  createInspection: (input: CleansingInput) => Promise<{ id: string | null; number: string | null; error: string | null }>
  updateInspection: (id: string, patch: Partial<CleansingInput>) => Promise<{ error: string | null }>
  deleteInspection: (id: string) => Promise<{ error: string | null }>
  verifyInspection: (id: string) => Promise<{ error: string | null }>
  uploadPhoto: (file: File) => Promise<{ path: string | null; error: string | null }>
}

const Ctx = createContext<CleansingCtx | null>(null)

// Editor gate — mirrors can_edit_project_progress (v3): admin / assigned PM /
// approved member in (pm, main_contractor, subcontractor). This is the same gate
// the cleansing_insert RLS policy enforces, so we never show a write affordance
// the server would reject.
const EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor']
// Verifier gate — mirrors verify_cleansing(): admin / assigned PM / approved
// member in (pm, main_contractor, safety_officer).
const VERIFIER_ROLES = ['pm', 'main_contractor', 'safety_officer']

export function CleansingProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const [inspections, setInspections] = useState<CleansingInspection[]>([])
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
    const inEditor = !!myRole && EDITOR_ROLES.includes(myRole)
    const inVerifier = !!myRole && VERIFIER_ROLES.includes(myRole)
    return {
      canManage: isAssignedPm || inEditor,
      canVerify: isAssignedPm || inVerifier,
    }
  }, [profile, projects, memberships, projectId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('cleansing_inspections')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('inspected_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setInspections([])
    } else {
      setInspections((data ?? []) as CleansingInspection[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`cleansing-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cleansing_inspections', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [projectId, refresh])

  // Compress + upload to the private issue-photos bucket under the caller's
  // prefix; return the storage PATH (rendered later via signIssuePhoto).
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

  const createInspection = useCallback(async (input: CleansingInput) => {
    if (!profile) return { id: null, number: null, error: '未登入' }
    const { data: numberData, error: numberErr } =
      await supabase.rpc('next_cleansing_number', { p_project_id: projectId })
    if (numberErr || !numberData) {
      return { id: null, number: null, error: numberErr?.message || '無法產生編號' }
    }
    const { data, error: err } = await supabase
      .from('cleansing_inspections')
      .insert({
        project_id: projectId,
        number: numberData as string,
        inspected_on: input.inspected_on,
        frequency: input.frequency,
        area: input.area.trim(),
        checklist: input.checklist,
        result: input.result,
        notes: input.notes?.trim() || null,
        photos: input.photos,
        created_by: profile.id,
      })
      .select('id')
      .single()
    if (err) return { id: null, number: null, error: err.message }
    return { id: (data?.id as string) ?? null, number: numberData as string, error: null }
  }, [profile, projectId])

  const updateInspection = useCallback(async (id: string, patch: Partial<CleansingInput>) => {
    const cleaned: Record<string, unknown> = {}
    if (patch.inspected_on !== undefined) cleaned.inspected_on = patch.inspected_on
    if (patch.frequency !== undefined) cleaned.frequency = patch.frequency
    if (patch.area !== undefined) cleaned.area = patch.area.trim()
    if (patch.checklist !== undefined) cleaned.checklist = patch.checklist
    if (patch.result !== undefined) cleaned.result = patch.result
    if (patch.notes !== undefined) cleaned.notes = patch.notes?.trim() || null
    if (patch.photos !== undefined) cleaned.photos = patch.photos
    const { error: err } = await supabase.from('cleansing_inspections').update(cleaned).eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const deleteInspection = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('cleansing_inspections').delete().eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const verifyInspection = useCallback(async (id: string) => {
    const { error: err } = await supabase.rpc('verify_cleansing', { p_id: id })
    if (err) return { error: err.message }
    await refresh()
    return { error: null }
  }, [refresh])

  const value = useMemo<CleansingCtx>(() => ({
    inspections, loading, error, canManage, canVerify, refresh,
    createInspection, updateInspection, deleteInspection, verifyInspection, uploadPhoto,
  }), [inspections, loading, error, canManage, canVerify, refresh,
    createInspection, updateInspection, deleteInspection, verifyInspection, uploadPhoto])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCleansing() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCleansing must be used inside CleansingProvider')
  return ctx
}
