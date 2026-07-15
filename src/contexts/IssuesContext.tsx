import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { cacheGet, cacheSet, getOnline, subscribeOnline } from '../lib/offline'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { getInitialHandler, getNextHandler, deriveHandoffAction } from '../types'
import { compressImage } from '../lib/image-compress'
import type { Issue, IssueComment, IssueHandlerRole, GlobalRole, SnagType } from '../types'

export interface QuickSnagInput {
  title: string
  snag_type: SnagType
  location: string
  description: string
  photos: string[]
  progress_item_id?: string | null
}

interface IssuesContextType {
  loading: boolean
  issues: Issue[]
  fetchError: string | null
  myRoleInProject: GlobalRole | null  // user's role in this project (for permission checks)
  refetch: () => Promise<void>
  createIssue: (title: string, description: string, photos: string[], location?: string, progressItemId?: string | null) => Promise<{ error: string | null; id?: string }>
  createQuickIssue: (input: QuickSnagInput) => Promise<{ error: string | null; id?: string }>
  graduateToFormal: (issueId: string) => Promise<{ error: string | null }>
  uploadPhoto: (file: File) => Promise<{ url: string | null; error: string | null }>
  fetchComments: (issueId: string) => Promise<IssueComment[]>
  addComment: (issueId: string, body: string) => Promise<{ error: string | null }>
  escalateIssue: (issueId: string, comment: string) => Promise<{ error: string | null }>
  // v106: unified person-handoff (上呈 / 同層轉交 / 彈番落去). action is derived
  // from toRole vs the issue's current tier. reason is required.
  reassignIssue: (issueId: string, toUserId: string, toRole: IssueHandlerRole, reason: string) => Promise<{ error: string | null }>
  fetchHandlers: () => Promise<{ user_id: string; name: string; role: string }[]>
  resolveIssue: (issueId: string, comment: string) => Promise<{ error: string | null }>
  reopenIssue: (issueId: string, comment: string) => Promise<{ error: string | null }>
}

const IssuesContext = createContext<IssuesContextType | null>(null)

export function IssuesProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [loading, setLoading] = useState(true)
  const [issues, setIssues] = useState<Issue[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Determine user's effective role in this project
  const myRoleInProject = ((): GlobalRole | null => {
    if (!profile) return null
    if (profile.global_role === 'admin') return 'admin'
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return 'pm'
    const m = memberships.find(
      mb => mb.user_id === profile.id && mb.project_id === projectId && mb.status === 'approved'
    )
    return m?.role ?? null
  })()

  const refetch = useCallback(async () => {
    // Fast path: known offline → serve last-synced issues, skip the network.
    if (!getOnline()) {
      const cached = cacheGet<Issue[]>(`issues:${projectId}`)
      if (cached) { setIssues(cached.data); setFetchError(null); return }
    }
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('issues fetch error:', error)
      // Only fall back to cache when offline — don't mask a real online error.
      const cached = !getOnline() ? cacheGet<Issue[]>(`issues:${projectId}`) : null
      if (cached) {
        setIssues(cached.data)
        setFetchError(null)
      } else {
        setFetchError(error.message)
      }
    } else {
      setIssues(data as Issue[])
      cacheSet(`issues:${projectId}`, data as Issue[])
      setFetchError(null)
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    // Subscribe to issue changes for this project only.
    // Comments don't affect the issue list; IssueDetail subscribes per-issue.
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`issues-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `project_id=eq.${projectId}` },
        onChange)
      .subscribe()

    return () => { onChange.cancel(); supabase.removeChannel(channel) }
  }, [projectId, refetch])

  // Re-sync on reconnect: realtime doesn't replay events missed while offline.
  useEffect(() => subscribeOnline(online => { if (online) void refetch() }), [refetch])

  async function createIssue(title: string, description: string, photos: string[], location?: string, progressItemId?: string | null) {
    if (!profile) return { error: '未登入' }
    if (!myRoleInProject) return { error: '你不是此工地的成員' }

    const handler = getInitialHandler(myRoleInProject)
    // issue_no is trigger-assigned (v47) — never sent from the client.
    const { data, error } = await supabase.from('issues').insert({
      project_id: projectId,
      reporter_id: profile.id,
      reporter_role: myRoleInProject,
      title: title.trim(),
      description: description.trim(),
      location: location?.trim() || null,
      progress_item_id: progressItemId ?? null,
      photos,
      current_handler_role: handler,
      status: 'open',
    }).select().single()
    if (error) return { error: error.message }

    // Add 'reported' activity log
    await supabase.from('issue_comments').insert({
      issue_id: data.id,
      author_id: profile.id,
      action: 'reported',
      body: '',
      to_role: handler,
    })

    await refetch()
    return { error: null, id: data.id }
  }

  // 即時問題 (snag): a lightweight, self-handled, push-silent issue. is_quick=true →
  // the v93 triggers skip the formal issue_no + OneSignal; it carries snag_type +
  // a floor/zone location for fast on-site logging.
  async function createQuickIssue(input: QuickSnagInput) {
    if (!profile) return { error: '未登入' }
    if (!myRoleInProject) return { error: '你不是此工地的成員' }

    const handler = getInitialHandler(myRoleInProject)
    const { data, error } = await supabase.from('issues').insert({
      project_id: projectId,
      reporter_id: profile.id,
      reporter_role: myRoleInProject,
      title: input.title.trim(),
      description: input.description.trim(),
      location: input.location.trim() || null,
      progress_item_id: input.progress_item_id ?? null,
      snag_type: input.snag_type,
      photos: input.photos,
      current_handler_role: handler,
      status: 'open',
      is_quick: true,
    }).select().single()
    if (error) return { error: error.message }

    await supabase.from('issue_comments').insert({
      issue_id: data.id, author_id: profile.id, action: 'reported', body: '', to_role: handler,
    })

    await refetch()
    return { error: null, id: data.id }
  }

  // Graduate a snag into a formal numbered issue (one-way). The DB guard
  // (v93 guard_issue_quick) assigns the per-project issue_no on this flip and
  // the push trigger notifies the handler exactly once.
  async function graduateToFormal(issueId: string) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('issues').update({
      is_quick: false, updated_at: new Date().toISOString(),
    }).eq('id', issueId)
    if (error) return { error: error.message }

    await supabase.from('issue_comments').insert({
      issue_id: issueId, author_id: profile.id, action: 'commented',
      body: '已將即時問題升級為正式問題',
    })
    await refetch()
    return { error: null }
  }

  async function uploadPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
    if (!profile) return { url: null, error: '未登入' }
    // Compress before upload — issue photos are a top storage consumer on the
    // Supabase Free 1GB tier (CLAUDE.md). compressImage falls back to the original.
    const toUpload = await compressImage(file)
    const ext = toUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('issue-photos')
      .upload(fileName, toUpload, { contentType: toUpload.type, upsert: false })
    if (upErr) return { url: null, error: upErr.message }
    // Store the storage PATH, not a public URL — issue-photos is becoming a private
    // bucket (v74) and photos are rendered via short-lived signed URLs (lib/issuePhotos +
    // IssuePhoto). The legacy public-URL rows still resolve because signIssuePhoto
    // extracts the path from either form.
    return { url: fileName, error: null }
  }

  async function fetchComments(issueId: string): Promise<IssueComment[]> {
    const { data, error } = await supabase
      .from('issue_comments')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('comments fetch error:', error)
      return []
    }
    return data as IssueComment[]
  }

  async function addComment(issueId: string, body: string) {
    if (!profile) return { error: '未登入' }
    if (!body.trim()) return { error: '請輸入內容' }
    const { error } = await supabase.from('issue_comments').insert({
      issue_id: issueId,
      author_id: profile.id,
      action: 'commented',
      body: body.trim(),
    })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function escalateIssue(issueId: string, comment: string) {
    if (!profile) return { error: '未登入' }
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return { error: '找不到問題' }
    const next = getNextHandler(issue.current_handler_role)
    if (!next) return { error: '已到最高層，無法再上呈' }

    const { error } = await supabase.from('issues').update({
      current_handler_role: next,
      updated_at: new Date().toISOString(),
    }).eq('id', issueId)
    if (error) return { error: error.message }

    const { error: cErr } = await supabase.from('issue_comments').insert({
      issue_id: issueId,
      author_id: profile.id,
      action: 'escalated',
      body: comment.trim(),
      from_role: issue.current_handler_role,
      to_role: next,
    })
    await refetch()
    if (cErr) return { error: `已上呈，但記錄失敗：${cErr.message}` }
    return { error: null }
  }

  // v106: point the issue at a SPECIFIC person (上呈 up / 同層轉交 / 彈番落去 down).
  // One data op — set role+person — with a required reason; the action label is
  // derived from the target tier vs the current tier.
  async function reassignIssue(issueId: string, toUserId: string, toRole: IssueHandlerRole, reason: string) {
    if (!profile) return { error: '未登入' }
    if (!reason.trim()) return { error: '請填寫原因' }
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return { error: '找不到問題' }
    const fromRole = issue.current_handler_role
    const fromUser = issue.current_handler_id
    const action = deriveHandoffAction(fromRole, toRole)

    const { error } = await supabase.from('issues').update({
      current_handler_role: toRole,
      current_handler_id: toUserId,
      updated_at: new Date().toISOString(),
    }).eq('id', issueId)
    if (error) return { error: error.message }

    const { error: cErr } = await supabase.from('issue_comments').insert({
      issue_id: issueId,
      author_id: profile.id,
      action,
      body: reason.trim(),
      from_role: fromRole,
      to_role: toRole,
      from_user: fromUser,
      to_user: toUserId,
    })
    await refetch()
    if (cErr) return { error: `已轉交，但記錄失敗：${cErr.message}` }
    return { error: null }
  }

  // Candidate handlers for the person-picker: approved members + assigned PMs in
  // this project (server-gated by get_project_handlers / can_view_project).
  async function fetchHandlers(): Promise<{ user_id: string; name: string; role: string }[]> {
    const { data, error } = await supabase.rpc('get_project_handlers', { p_project_id: projectId })
    if (error) { console.error('handlers fetch error:', error); return [] }
    return (data as { user_id: string; name: string; role: string }[]) ?? []
  }

  async function resolveIssue(issueId: string, comment: string) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('issues').update({
      status: 'resolved',
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', issueId)
    if (error) return { error: error.message }

    const { error: cErr } = await supabase.from('issue_comments').insert({
      issue_id: issueId,
      author_id: profile.id,
      action: 'resolved',
      body: comment.trim(),
    })
    await refetch()
    if (cErr) return { error: `已標記解決，但記錄失敗：${cErr.message}` }
    return { error: null }
  }

  async function reopenIssue(issueId: string, comment: string) {
    if (!profile) return { error: '未登入' }
    const { error } = await supabase.from('issues').update({
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', issueId)
    if (error) return { error: error.message }

    const { error: cErr } = await supabase.from('issue_comments').insert({
      issue_id: issueId,
      author_id: profile.id,
      action: 'reopened',
      body: comment.trim(),
    })
    await refetch()
    if (cErr) return { error: `已重開，但記錄失敗：${cErr.message}` }
    return { error: null }
  }

  return (
    <IssuesContext.Provider value={{
      loading, issues, fetchError, myRoleInProject, refetch,
      createIssue, createQuickIssue, graduateToFormal, uploadPhoto, fetchComments, addComment,
      escalateIssue, reassignIssue, fetchHandlers, resolveIssue, reopenIssue,
    }}>
      {children}
    </IssuesContext.Provider>
  )
}

export function useIssues() {
  const ctx = useContext(IssuesContext)
  if (!ctx) throw new Error('useIssues must be used within IssuesProvider')
  return ctx
}

// Helper: can the user (with role X in project) act on this issue?
//
// `myRole` is the caller's PER-PROJECT membership role (admin globally, 'pm'
// when assigned to the project, otherwise the approved project_members.role) —
// see IssuesProvider's myRoleInProject. So every grant below is membership-
// scoped: a user only gains these rights inside a project they belong to.
//
// Authority mirrors the issues UPDATE RLS policy in v4-issues-schema.sql:
//   admin OR has_role_in_project(handler) OR reporter_id = auth.uid()
// The reporter clause is what keeps escalation from dead-ending: a
// subcontractor_worker reports an issue routed to 'subcontractor', but if that
// sub tier has no 'subcontractor' member, nobody but a global admin matches the
// handler role — the issue would be stuck at 'subcontractor' forever. Letting
// the reporter act on their own open issue (escalate it upward, or resolve it)
// breaks the dead-end without widening anyone else's authority, and the server
// already permits exactly this.
//
// Supervisory roles — safety_officer (安全主任) and general_foreman (老總) — run
// the site and own the safety lane (棚網鬆脫 etc.), yet the chain never routes a
// handler to them. Without this branch the 老總 / 安全主任 can only act on issues
// they personally reported — the wrong authority model for the people who
// supervise the whole project. Grant them ACT rights on ANY issue in a project
// they are an approved member of (myRole carries the membership scope), the same
// blanket way admin is allowed. NOTE: this is the client gate only; the server
// issues UPDATE RLS still needs a matching grant for these roles or the mutation
// will be rejected for issues they neither handle nor reported.
export function canActOnIssue(
  myRole: GlobalRole | null,
  handler: IssueHandlerRole,
  isReporter = false,
  isAssignee = false,
): boolean {
  if (!myRole) return false
  if (myRole === 'admin') return true
  // On-site supervisors: project-wide act-rights on every issue (membership-scoped).
  if (myRole === 'safety_officer' || myRole === 'general_foreman') return true
  // v106: the specifically-named person on the hook can always act (mirrors the
  // RLS `current_handler_id = auth.uid()` clause added in v106).
  if (isAssignee) return true
  if (handler === 'pm' && myRole === 'pm') return true
  if (handler === 'main_contractor' && myRole === 'main_contractor') return true
  if (handler === 'subcontractor' && myRole === 'subcontractor') return true
  // Fallback so the chain never dead-ends: the reporter can always move their
  // own issue forward (matches the RLS reporter_id = auth.uid() clause).
  if (isReporter) return true
  return false
}
