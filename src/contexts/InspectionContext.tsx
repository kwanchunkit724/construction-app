import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { compressImage } from '../lib/image-compress'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import type {
  InspectionRound,
  InspectionMark,
  InspectionCoverage,
  InspectionCategory,
  InspectionResult,
} from '../types'

// 巡查 (recurring site inspection, v95). A manager OPENS a round (a set of floors
// to walk for one category — 漏水 / 清潔 / 安全 / 缺陷 / 其他), then MARKS each floor
// 合格 / 不合格 / 不適用. A 不合格 mark auto-spawns an 即時問題 (snag) routed up the
// normal escalation chain. Scoped to one projectId; two realtime channels
// (rounds + marks) debounce-refetch the list + coverage. Photos reuse the private
// issue-photos bucket (signed-URL render via lib/issuePhotos).

export interface CreateRoundInput {
  title: string
  category: InspectionCategory
  floor_labels: string[]
  notes?: string | null
}

export interface MarkFloorInput {
  round: InspectionRound
  floor_label: string
  result: InspectionResult
  note?: string | null
  photos: string[]
}

interface InspectionCtx {
  rounds: InspectionRound[]
  marksByRound: Record<string, InspectionMark[]>
  coverage: Record<string, InspectionCoverage>
  loading: boolean
  error: string | null
  canManage: boolean
  refetch: () => Promise<void>
  fetchMarks: (roundId: string) => Promise<InspectionMark[]>
  createRound: (input: CreateRoundInput) => Promise<{ error: string | null; id?: string }>
  markFloor: (input: MarkFloorInput) => Promise<{ error: string | null }>
  closeRound: (id: string) => Promise<{ error: string | null }>
  cancelRound: (id: string) => Promise<{ error: string | null }>
  uploadPhoto: (file: File) => Promise<{ url: string | null; error: string | null }>
}

const Ctx = createContext<InspectionCtx | null>(null)

// Editor gate — mirrors can_edit_project_progress (admin / assigned PM / approved
// pm|main_contractor|subcontractor): may open rounds + mark floors.
const EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor']

export function InspectionProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const [rounds, setRounds] = useState<InspectionRound[]>([])
  const [marksByRound, setMarksByRound] = useState<Record<string, InspectionMark[]>>({})
  const [coverage, setCoverage] = useState<Record<string, InspectionCoverage>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const canManage = useMemo(() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    const isAssignedPm = !!project?.assigned_pm_ids.includes(profile.id)
    const role = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )?.role
    return isAssignedPm || (!!role && EDITOR_ROLES.includes(role))
  }, [profile, projects, memberships, projectId])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('inspection_rounds')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('created_at', { ascending: false })
    if (err) {
      console.error('inspection rounds fetch error:', err)
      setError(err.message)
      setRounds([])
    } else {
      setRounds((data ?? []) as InspectionRound[])
    }
    // Coverage (marked / total / failed per round) via the SECURITY DEFINER RPC.
    const { data: covData, error: covErr } = await supabase
      .rpc('get_inspection_coverage', { p_project_id: projectIdRef.current })
    if (covErr) {
      console.error('inspection coverage fetch error:', covErr)
    } else {
      const map: Record<string, InspectionCoverage> = {}
      ;((covData ?? []) as InspectionCoverage[]).forEach(c => { map[c.round_id] = c })
      setCoverage(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refetch() }, [refetch, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`inspection-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_rounds', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_marks', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [projectId, refetch])

  const fetchMarks = useCallback(async (roundId: string): Promise<InspectionMark[]> => {
    const { data, error: err } = await supabase
      .from('inspection_marks')
      .select('*')
      .eq('round_id', roundId)
      .order('marked_at', { ascending: true })
    if (err) {
      console.error('inspection marks fetch error:', err)
      return []
    }
    const marks = (data ?? []) as InspectionMark[]
    setMarksByRound(prev => ({ ...prev, [roundId]: marks }))
    return marks
  }, [])

  const uploadPhoto = useCallback(async (file: File): Promise<{ url: string | null; error: string | null }> => {
    if (!profile) return { url: null, error: '未登入' }
    // Compress before upload — photos are a top storage consumer on the Supabase
    // Free 1GB tier (CLAUDE.md). compressImage falls back to the original.
    const toUpload = await compressImage(file)
    const ext = toUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('issue-photos')
      .upload(fileName, toUpload, { contentType: toUpload.type, upsert: false })
    if (upErr) return { url: null, error: upErr.message }
    // Store the storage PATH, not a public URL — rendered via short-lived signed
    // URLs (lib/issuePhotos).
    return { url: fileName, error: null }
  }, [profile])

  const createRound = useCallback(async (input: CreateRoundInput) => {
    if (!profile) return { error: '未登入' }
    const { data, error: err } = await supabase
      .from('inspection_rounds')
      .insert({
        project_id: projectId,
        title: input.title.trim(),
        category: input.category,
        floor_labels: input.floor_labels,
        opened_by: profile.id,
        notes: input.notes?.trim() || null,
      })
      .select('id')
      .single()
    if (err) {
      console.error('createRound error:', err)
      return { error: err.message }
    }
    await refetch()
    return { error: null, id: (data?.id as string) ?? undefined }
  }, [profile, projectId, refetch])

  // Mark a floor through the atomic mark_inspection_floor RPC (v96): it validates
  // the round is open + the caller may edit, replaces any prior mark, and in ONE
  // transaction spawns / reuses / resolves the linked 即時問題 snag for a 不合格 —
  // so a failed mark-insert can never leave a dangling snag, and a re-mark never
  // orphans the previous one.
  const markFloor = useCallback(async (input: MarkFloorInput) => {
    if (!profile) return { error: '未登入' }
    const { round, floor_label, result, photos } = input
    const note = input.note?.trim() || null
    const { error: err } = await supabase.rpc('mark_inspection_floor', {
      p_round_id: round.id,
      p_floor_label: floor_label,
      p_result: result,
      p_note: note,
      p_photos: photos,
    })
    if (err) {
      console.error('markFloor error:', err)
      return { error: err.message }
    }
    await Promise.all([fetchMarks(round.id), refetch()])
    return { error: null }
  }, [profile, fetchMarks, refetch])

  const rpcAction = useCallback(async (fn: string, params: Record<string, unknown>) => {
    const { error: err } = await supabase.rpc(fn, params)
    if (err) {
      console.error(`${fn} error:`, err)
      return { error: err.message }
    }
    await refetch()
    return { error: null }
  }, [refetch])

  const closeRound = useCallback((id: string) => rpcAction('close_inspection_round', { p_id: id }), [rpcAction])
  const cancelRound = useCallback((id: string) => rpcAction('cancel_inspection_round', { p_id: id }), [rpcAction])

  const value = useMemo<InspectionCtx>(() => ({
    rounds, marksByRound, coverage, loading, error, canManage, refetch,
    fetchMarks, createRound, markFloor, closeRound, cancelRound, uploadPhoto,
  }), [rounds, marksByRound, coverage, loading, error, canManage, refetch,
    fetchMarks, createRound, markFloor, closeRound, cancelRound, uploadPhoto])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInspection() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useInspection must be used inside InspectionProvider')
  return ctx
}
