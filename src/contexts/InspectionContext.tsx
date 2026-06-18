import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { compressImage } from '../lib/image-compress'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { getInitialHandler } from '../types'
import type {
  InspectionRound,
  InspectionMark,
  InspectionCoverage,
  InspectionCategory,
  InspectionResult,
  GlobalRole,
  SnagType,
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

// A 不合格 floor mark spawns a snag — map the round's inspection category onto the
// issue snag_type so the auto-issue carries a sensible classification.
function categoryToSnag(c: InspectionCategory): SnagType {
  switch (c) {
    case 'leak': return 'leak'
    case 'defect': return 'finish'
    case 'cleanliness': return 'other'
    case 'safety': return 'other'
    default: return 'other'
  }
}

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

  // User's effective role in this project — admin globally, 'pm' when assigned,
  // otherwise the approved project_members.role. Drives both the canManage gate
  // and the reporter_role / handler on auto-spawned snags.
  const myRole = useMemo<GlobalRole | null>(() => {
    if (!profile) return null
    if (profile.global_role === 'admin') return 'admin'
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return 'pm'
    const m = memberships.find(
      mb => mb.user_id === profile.id && mb.project_id === projectId && mb.status === 'approved',
    )
    return m?.role ?? null
  }, [profile, projects, memberships, projectId])

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

  const markFloor = useCallback(async (input: MarkFloorInput) => {
    if (!profile) return { error: '未登入' }
    if (!myRole) return { error: '你不是此工地的成員' }
    const { round, floor_label, result, photos } = input
    const note = input.note?.trim() || null

    let linkedIssueId: string | null = null

    // 不合格 → first spawn a 即時問題 (snag) up the normal escalation chain, then
    // link it on the mark. Mirrors IssuesContext.createQuickIssue insert shape.
    if (result === 'fail') {
      const handler = getInitialHandler(myRole)
      const { data: snag, error: snagErr } = await supabase.from('issues').insert({
        project_id: projectId,
        reporter_id: profile.id,
        reporter_role: myRole,
        title: `[巡查] ${round.title} · ${floor_label} 不合格`,
        description: note || '',
        location: floor_label,
        snag_type: categoryToSnag(round.category),
        photos,
        current_handler_role: handler,
        status: 'open',
        is_quick: true,
      }).select().single()
      if (snagErr) {
        console.error('markFloor snag insert error:', snagErr)
        return { error: snagErr.message }
      }
      await supabase.from('issue_comments').insert({
        issue_id: snag.id, author_id: profile.id, action: 'reported', body: '', to_role: handler,
      })
      linkedIssueId = snag.id as string
    }

    // Re-marking a floor replaces the prior mark — the table has unique(round_id,
    // floor_label), so a plain duplicate insert is forbidden. Delete any existing
    // mark for this (round, floor) first, then insert. A mark on a 'done' round is
    // rejected by a DB trigger — surface that error.
    const { error: delErr } = await supabase
      .from('inspection_marks')
      .delete()
      .eq('round_id', round.id)
      .eq('floor_label', floor_label)
    if (delErr) {
      console.error('markFloor delete-prior error:', delErr)
      return { error: delErr.message }
    }

    const { error: insErr } = await supabase.from('inspection_marks').insert({
      round_id: round.id,
      project_id: projectId,
      floor_label,
      result,
      note,
      photos,
      linked_issue_id: linkedIssueId,
      marked_by: profile.id,
    })
    if (insErr) {
      console.error('markFloor insert error:', insErr)
      return { error: insErr.message }
    }
    await Promise.all([fetchMarks(round.id), refetch()])
    return { error: null }
  }, [profile, myRole, projectId, fetchMarks, refetch])

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
