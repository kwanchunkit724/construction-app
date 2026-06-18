import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import type { ControlledDoc, ControlledDocCategory } from '../types'

// 受控文件登記冊 (Controlled-Document Register, v91). Editors register controlled
// documents; issuing a new revision supersedes the prior row (revise_cd RPC); a
// manager withdraws (withdraw_cd). Scoped to one projectId; one realtime channel.

export interface CdInput {
  title: string
  doc_category: ControlledDocCategory
  revision: string
  holders?: string | null
  notes?: string | null
}

interface CdCtx {
  docs: ControlledDoc[]
  loading: boolean
  error: string | null
  canManage: boolean    // register / edit-current / revise (editor gate)
  canWithdraw: boolean  // withdraw (manager gate)
  refresh: () => Promise<void>
  createDoc: (input: CdInput) => Promise<{ id: string | null; number: string | null; error: string | null }>
  updateDoc: (id: string, patch: Partial<CdInput>) => Promise<{ error: string | null }>
  deleteDoc: (id: string) => Promise<{ error: string | null }>
  reviseDoc: (id: string, revision: string, note: string) => Promise<{ error: string | null }>
  withdrawDoc: (id: string) => Promise<{ error: string | null }>
}

const Ctx = createContext<CdCtx | null>(null)

const EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor']
const WITHDRAW_ROLES = ['pm', 'main_contractor']

export function ControlledDocsProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const [docs, setDocs] = useState<ControlledDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId

  const { canManage, canWithdraw } = useMemo(() => {
    if (!profile) return { canManage: false, canWithdraw: false }
    if (profile.global_role === 'admin') return { canManage: true, canWithdraw: true }
    const project = projects.find(p => p.id === projectId)
    const isAssignedPm = !!project?.assigned_pm_ids.includes(profile.id)
    const myRole = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )?.role
    return {
      canManage: isAssignedPm || (!!myRole && EDITOR_ROLES.includes(myRole)),
      canWithdraw: isAssignedPm || (!!myRole && WITHDRAW_ROLES.includes(myRole)),
    }
  }, [profile, projects, memberships, projectId])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('controlled_documents')
      .select('*')
      .eq('project_id', projectIdRef.current)
      .order('number')
      .order('issued_at', { ascending: false })
    if (err) {
      setError(err.message)
      setDocs([])
    } else {
      setDocs((data ?? []) as ControlledDoc[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh, projectId])

  useEffect(() => {
    const onChange = debounce(() => void refresh(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`cd-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'controlled_documents', filter: `project_id=eq.${projectId}` },
        onChange,
      )
      .subscribe()
    return () => { onChange.cancel(); void supabase.removeChannel(channel) }
  }, [projectId, refresh])

  const createDoc = useCallback(async (input: CdInput) => {
    if (!profile) return { id: null, number: null, error: '未登入' }
    const { data: numberData, error: numberErr } =
      await supabase.rpc('next_cd_number', { p_project_id: projectId })
    if (numberErr || !numberData) {
      return { id: null, number: null, error: numberErr?.message || '無法產生編號' }
    }
    const { data, error: err } = await supabase
      .from('controlled_documents')
      .insert({
        project_id: projectId,
        number: numberData as string,
        title: input.title.trim(),
        doc_category: input.doc_category,
        revision: input.revision.trim() || 'A',
        holders: input.holders?.trim() || null,
        notes: input.notes?.trim() || null,
        issued_by: profile.id,
      })
      .select('id')
      .single()
    if (err) return { id: null, number: null, error: err.message }
    return { id: (data?.id as string) ?? null, number: numberData as string, error: null }
  }, [profile, projectId])

  const updateDoc = useCallback(async (id: string, patch: Partial<CdInput>) => {
    const cleaned: Record<string, unknown> = {}
    if (patch.title !== undefined) cleaned.title = patch.title.trim()
    if (patch.doc_category !== undefined) cleaned.doc_category = patch.doc_category
    if (patch.revision !== undefined) cleaned.revision = patch.revision.trim() || 'A'
    if (patch.holders !== undefined) cleaned.holders = patch.holders?.trim() || null
    if (patch.notes !== undefined) cleaned.notes = patch.notes?.trim() || null
    const { error: err } = await supabase.from('controlled_documents').update(cleaned).eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const deleteDoc = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('controlled_documents').delete().eq('id', id)
    if (err) return { error: err.message }
    return { error: null }
  }, [])

  const rpcAction = useCallback(async (fn: string, params: Record<string, unknown>) => {
    const { error: err } = await supabase.rpc(fn, params)
    if (err) return { error: err.message }
    await refresh()
    return { error: null }
  }, [refresh])

  const reviseDoc = useCallback((id: string, revision: string, note: string) =>
    rpcAction('revise_cd', { p_id: id, p_revision: revision.trim(), p_note: note.trim() }), [rpcAction])
  const withdrawDoc = useCallback((id: string) => rpcAction('withdraw_cd', { p_id: id }), [rpcAction])

  const value = useMemo<CdCtx>(() => ({
    docs, loading, error, canManage, canWithdraw, refresh,
    createDoc, updateDoc, deleteDoc, reviseDoc, withdrawDoc,
  }), [docs, loading, error, canManage, canWithdraw, refresh,
    createDoc, updateDoc, deleteDoc, reviseDoc, withdrawDoc])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useControlledDocs() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useControlledDocs must be used inside ControlledDocsProvider')
  return ctx
}
