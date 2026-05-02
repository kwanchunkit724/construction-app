import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { getInitialHandler, getNextHandler } from '../types'
import type { Issue, IssueComment, IssueHandlerRole, GlobalRole } from '../types'

interface IssuesContextType {
  loading: boolean
  issues: Issue[]
  fetchError: string | null
  myRoleInProject: GlobalRole | null  // user's role in this project (for permission checks)
  refetch: () => Promise<void>
  createIssue: (title: string, description: string, photos: string[]) => Promise<{ error: string | null; id?: string }>
  uploadPhoto: (file: File) => Promise<{ url: string | null; error: string | null }>
  fetchComments: (issueId: string) => Promise<IssueComment[]>
  addComment: (issueId: string, body: string) => Promise<{ error: string | null }>
  escalateIssue: (issueId: string, comment: string) => Promise<{ error: string | null }>
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
    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('issues fetch error:', error)
      setFetchError(error.message)
    } else {
      setIssues(data as Issue[])
      setFetchError(null)
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    // Subscribe to issue changes for this project only.
    // Comments don't affect the issue list; IssueDetail subscribes per-issue.
    const channel = supabase
      .channel(`issues-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `project_id=eq.${projectId}` },
        () => refetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, refetch])

  async function createIssue(title: string, description: string, photos: string[]) {
    if (!profile) return { error: '未登入' }
    if (!myRoleInProject) return { error: '你不是此工地的成員' }

    const handler = getInitialHandler(myRoleInProject)
    const { data, error } = await supabase.from('issues').insert({
      project_id: projectId,
      reporter_id: profile.id,
      reporter_role: myRoleInProject,
      title: title.trim(),
      description: description.trim(),
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

  async function uploadPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
    if (!profile) return { url: null, error: '未登入' }
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('issue-photos')
      .upload(fileName, file, { contentType: file.type, upsert: false })
    if (upErr) return { url: null, error: upErr.message }
    const { data } = supabase.storage.from('issue-photos').getPublicUrl(fileName)
    return { url: data.publicUrl, error: null }
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
      createIssue, uploadPhoto, fetchComments, addComment,
      escalateIssue, resolveIssue, reopenIssue,
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
export function canActOnIssue(myRole: GlobalRole | null, handler: IssueHandlerRole): boolean {
  if (!myRole) return false
  if (myRole === 'admin') return true
  if (handler === 'pm' && myRole === 'pm') return true
  if (handler === 'main_contractor' && myRole === 'main_contractor') return true
  if (handler === 'subcontractor' && myRole === 'subcontractor') return true
  return false
}
