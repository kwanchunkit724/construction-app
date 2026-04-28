import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { startPolling, triggerRefetch } from '../lib/syncUtils'
import { supabase } from '../lib/supabase'
import type { IssueReport, IssueComment, Role } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(row: any): IssueReport {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    severity: row.severity,
    location: row.location,
    drawingRef: row.drawing_ref,
    description: row.description,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    submittedByRole: row.submitted_by_role as Role,
    submittedAt: row.submitted_at,
    status: row.status,
    comments: row.comments ?? [],
    notifyIds: row.notify_ids ?? [],
    photos: row.photos ?? [],
    currentTier: row.current_tier,
    assignedToId: row.assigned_to_id ?? undefined,
    assignedToName: row.assigned_to_name ?? undefined,
    resolvePhoto: row.resolve_photo ?? undefined,
  }
}

interface IssueContextType {
  issues: IssueReport[]
  submitIssue: (issue: Omit<IssueReport, 'id' | 'submittedAt' | 'status' | 'comments' | 'currentTier'>) => void
  addComment: (issueId: string, comment: Omit<IssueComment, 'id' | 'createdAt'>) => void
  updateStatus: (issueId: string, status: IssueReport['status']) => void
  escalateIssue: (issueId: string, toTier: IssueReport['currentTier'], byName: string, byRole: Role) => void
  assignIssue: (issueId: string, toId: string, toName: string, byName: string) => void
  reassignIssue: (issueId: string, toId: string, toName: string, reason: string, byName: string, byRole: Role) => void
  resolveWithPhoto: (issueId: string, photo: string, byName: string, byRole: Role) => void
}

const Ctx = createContext<IssueContextType | null>(null)

const TIER_ZH: Record<IssueReport['currentTier'], string> = {
  'sub-supervisor': '判頭打理',
  'foreman-pe': '工頭/工程師',
  pm: '總監',
}

export function IssueProvider({ children }: { children: ReactNode }) {
  const [issues, setIssues] = useState<IssueReport[]>([])

  useEffect(() => {
    const refetch = () =>
      supabase.from('issues').select('*').order('submitted_at', { ascending: false })
        .then(({ data }) => { if (data) setIssues(data.map(fromRow)) })
    return startPolling(refetch)
  }, [])

  const submitIssue = (issue: Omit<IssueReport, 'id' | 'submittedAt' | 'status' | 'comments' | 'currentTier'>) => {
    const currentTier: IssueReport['currentTier'] =
      issue.submittedByRole === 'worker' ? 'sub-supervisor' :
      issue.submittedByRole === 'sub-supervisor' ? 'foreman-pe' : 'pm'
    const id = `ISS${Date.now()}`
    const submittedAt = new Date().toISOString()
    const newIssue: IssueReport = { ...issue, id, submittedAt, status: 'open', comments: [], currentTier }
    setIssues(prev => [newIssue, ...prev])
    supabase.from('issues').insert({
      id, project_id: issue.projectId, category: issue.category, severity: issue.severity,
      location: issue.location, drawing_ref: issue.drawingRef, description: issue.description,
      submitted_by: issue.submittedBy, submitted_by_name: issue.submittedByName,
      submitted_by_role: issue.submittedByRole, submitted_at: submittedAt,
      status: 'open', comments: [], notify_ids: issue.notifyIds,
      photos: issue.photos ?? [], current_tier: currentTier,
    }).then(({ error }) => {
      if (error) { console.error(error); setIssues(prev => prev.filter(i => i.id !== id)) }
      else triggerRefetch()
    })
  }

  const addComment = (issueId: string, comment: Omit<IssueComment, 'id' | 'createdAt'>) => {
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return
    const newComment: IssueComment = { ...comment, id: `CMT${Date.now()}`, createdAt: new Date().toISOString() }
    const newComments = [...issue.comments, newComment]
    const newStatus = issue.status === 'open' ? 'in-progress' as const : issue.status
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, comments: newComments, status: newStatus } : i))
    supabase.from('issues').update({ comments: newComments, status: newStatus }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const updateStatus = (issueId: string, status: IssueReport['status']) => {
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status } : i))
    supabase.from('issues').update({ status }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const escalateIssue = (issueId: string, toTier: IssueReport['currentTier'], byName: string, byRole: Role) => {
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return
    const systemComment: IssueComment = {
      id: `CMT${Date.now()}`, authorId: 'system', authorName: byName, authorRole: byRole,
      body: `⬆ 問題已上報至【${TIER_ZH[toTier]}】層級處理`,
      createdAt: new Date().toISOString(),
    }
    const newComments = [...issue.comments, systemComment]
    setIssues(prev => prev.map(i => i.id === issueId
      ? { ...i, currentTier: toTier, status: 'in-progress', comments: newComments } : i))
    supabase.from('issues').update({ current_tier: toTier, status: 'in-progress', comments: newComments }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const assignIssue = (issueId: string, toId: string, toName: string, byName: string) => {
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return
    const systemComment: IssueComment = {
      id: `CMT${Date.now()}`, authorId: 'system', authorName: byName, authorRole: 'foreman' as Role,
      body: `[指派] 問題已指派至【${toName}】負責處理`,
      createdAt: new Date().toISOString(),
    }
    const newComments = [...issue.comments, systemComment]
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, assignedToId: toId, assignedToName: toName, comments: newComments } : i))
    supabase.from('issues').update({ assigned_to_id: toId, assigned_to_name: toName, comments: newComments }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const reassignIssue = (issueId: string, toId: string, toName: string, reason: string, byName: string, byRole: Role) => {
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return
    const systemComment: IssueComment = {
      id: `CMT${Date.now()}`, authorId: 'system', authorName: byName, authorRole: byRole,
      body: `[轉交] ${byName} 將問題轉交至【${toName}】處理。原因：${reason}`,
      createdAt: new Date().toISOString(),
    }
    const newComments = [...issue.comments, systemComment]
    setIssues(prev => prev.map(i => i.id === issueId
      ? { ...i, assignedToId: toId, assignedToName: toName, comments: newComments } : i))
    supabase.from('issues').update({ assigned_to_id: toId, assigned_to_name: toName, comments: newComments }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  const resolveWithPhoto = (issueId: string, photo: string, byName: string, byRole: Role) => {
    const issue = issues.find(i => i.id === issueId)
    if (!issue) return
    const systemComment: IssueComment = {
      id: `CMT${Date.now()}`, authorId: 'system', authorName: byName, authorRole: byRole,
      body: `[已解決] ${byName} 已解決問題並提交相片記錄`,
      createdAt: new Date().toISOString(),
    }
    const newComments = [...issue.comments, systemComment]
    setIssues(prev => prev.map(i => i.id === issueId
      ? { ...i, status: 'resolved', resolvePhoto: photo, comments: newComments } : i))
    supabase.from('issues').update({ status: 'resolved', resolve_photo: photo, comments: newComments }).eq('id', issueId)
      .then(({ error }) => { if (error) console.error(error); else triggerRefetch() })
  }

  return (
    <Ctx.Provider value={{ issues, submitIssue, addComment, updateStatus, escalateIssue, assignIssue, reassignIssue, resolveWithPhoto }}>
      {children}
    </Ctx.Provider>
  )
}

export function useIssues(): IssueContextType {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useIssues must be inside <IssueProvider>')
  return ctx
}
