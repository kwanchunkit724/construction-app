import { useEffect, useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import {
  ChevronLeft, AlertCircle, CheckCircle2, ArrowUp, MessageCircle,
  Send, RefreshCw, RotateCcw, MapPin,
} from 'lucide-react'
import { Spinner } from '../components/Spinner'
import { Sidebar } from '../components/Sidebar'
import { Modal } from '../components/Modal'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import {
  IssuesProvider, useIssues, canActOnIssue,
} from '../contexts/IssuesContext'
import {
  ISSUE_HANDLER_ZH, ISSUE_STATUS_ZH, ISSUE_ACTION_ZH, ROLE_ZH,
  getNextHandler, formatIssueNo,
} from '../types'
import type { IssueComment, UserProfile } from '../types'
import { supabase } from '../lib/supabase'

export default function IssueDetail() {
  const { id, issueId } = useParams<{ id: string; issueId: string }>()
  if (!id || !issueId) return <Navigate to="/home" replace />
  return (
    <IssuesProvider projectId={id}>
      <IssueDetailInner projectId={id} issueId={issueId} />
    </IssuesProvider>
  )
}

interface ActionDialog {
  type: 'escalate' | 'resolve' | 'reopen'
}

function IssueDetailInner({ projectId, issueId }: { projectId: string; issueId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { projects } = useProjects()
  const {
    issues, myRoleInProject, fetchComments, addComment,
    escalateIssue, resolveIssue, reopenIssue,
  } = useIssues()

  const issue = issues.find(i => i.id === issueId)
  const project = projects.find(p => p.id === projectId)

  const [comments, setComments] = useState<IssueComment[]>([])
  const [users, setUsers] = useState<Record<string, UserProfile>>({})
  const [commentText, setCommentText] = useState('')
  const [dialog, setDialog] = useState<ActionDialog | null>(null)
  const [dialogText, setDialogText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reporterId = issue?.reporter_id
  // Load comments once when issueId or reporter changes (not on every realtime tick)
  useEffect(() => {
    let cancelled = false
    fetchComments(issueId).then((cs) => {
      if (cancelled) return
      setComments(cs)
    })
    return () => { cancelled = true }
  }, [issueId, fetchComments])

  // Subscribe to comments for this issue
  useEffect(() => {
    const channel = supabase
      .channel(`issue-${issueId}-comments`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'issue_comments', filter: `issue_id=eq.${issueId}` },
        async () => {
          const cs = await fetchComments(issueId)
          setComments(cs)
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [issueId, fetchComments])

  // Fetch user profiles for everyone referenced (comments + reporter), de-duplicated
  useEffect(() => {
    const ids = Array.from(new Set([
      ...comments.map(c => c.author_id),
      ...(reporterId ? [reporterId] : []),
    ].filter(id => !users[id])))
    if (ids.length === 0) return
    let cancelled = false
    supabase.from('user_profiles').select('*').in('id', ids).then(({ data }) => {
      if (cancelled || !data) return
      setUsers(prev => {
        const next = { ...prev }
        for (const u of data as UserProfile[]) next[u.id] = u
        return next
      })
    })
    return () => { cancelled = true }
  }, [comments, reporterId, users])

  if (!issue || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-6 text-center">
          <p className="text-sm text-site-600 mb-3">找不到此問題</p>
          <button onClick={() => navigate(`/project/${projectId}`)} className="btn-ghost">返回工地</button>
        </div>
      </div>
    )
  }

  const isOpen = issue.status === 'open'
  const StatusIcon = isOpen ? AlertCircle : CheckCircle2
  const statusStyle = isOpen ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  const isReporter = issue.reporter_id === profile?.id
  const canAct = canActOnIssue(myRoleInProject, issue.current_handler_role, isReporter)
  const nextRole = getNextHandler(issue.current_handler_role)

  async function handleSendComment() {
    setError('')
    if (!commentText.trim()) return
    setBusy(true)
    const { error } = await addComment(issueId, commentText)
    setBusy(false)
    if (error) setError(error)
    else setCommentText('')
  }

  async function handleAction() {
    if (!dialog) return
    setError('')
    setBusy(true)
    let res: { error: string | null } = { error: null }
    if (dialog.type === 'escalate') res = await escalateIssue(issueId, dialogText)
    else if (dialog.type === 'resolve') res = await resolveIssue(issueId, dialogText)
    else if (dialog.type === 'reopen') res = await reopenIssue(issueId, dialogText)
    setBusy(false)
    if (res.error) setError(res.error)
    else {
      setDialog(null)
      setDialogText('')
    }
  }

  const dialogTitle = dialog?.type === 'escalate' ? `上呈到 ${nextRole ? ISSUE_HANDLER_ZH[nextRole] : ''}`
    : dialog?.type === 'resolve' ? '標記為已解決'
    : '重新開啟此問題'

  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      <Sidebar />
      <div className="flex-1 flex flex-col md:pl-60 lg:pl-64">
      <header
        className="sticky top-0 z-30 bg-white border-b border-site-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-2xl md:max-w-4xl mx-auto px-2 md:px-4 py-2 flex items-center gap-1">
          <button onClick={() => navigate(`/project/${projectId}`)} className="text-site-700 hover:text-site-900 p-2" aria-label="返回">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base md:text-lg font-bold text-site-900 truncate">問題詳情</h1>
            <p className="text-[11px] text-site-500 truncate">{project.name}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl md:max-w-4xl w-full mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-10">
        {/* Issue summary */}
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isOpen ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
            }`}>
              <StatusIcon size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-site-900">
                {issue.issue_no != null && (
                  <span className="font-mono text-sm text-site-400 mr-1.5">
                    {formatIssueNo(issue.issue_no)}
                  </span>
                )}
                {issue.title}
              </h2>
              <p className="text-xs text-site-500 mt-0.5">
                {users[issue.reporter_id]?.name ?? '...'} · {ROLE_ZH[issue.reporter_role]} · {new Date(issue.created_at).toLocaleString('zh-HK')}
              </p>
            </div>
          </div>

          {issue.description && (
            <p className="text-sm text-site-700 mt-3 whitespace-pre-wrap">{issue.description}</p>
          )}

          {issue.photos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {issue.photos.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-xl overflow-hidden bg-site-100 border border-site-200"
                >
                  <img src={url} alt={`照片 ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-site-100 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${statusStyle}`}>
              <StatusIcon size={11} /> {ISSUE_STATUS_ZH[issue.status]}
            </span>
            {issue.location && (
              <span className="inline-flex items-center gap-1 text-xs bg-site-100 text-site-600 px-2 py-1 rounded-full font-medium">
                <MapPin size={11} /> {issue.location}
              </span>
            )}
            {isOpen && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                <ArrowUp size={11} /> 處理層：{ISSUE_HANDLER_ZH[issue.current_handler_role]}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {(canAct || isReporter) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {canAct && isOpen && (
              <button
                onClick={() => { setDialog({ type: 'resolve' }); setDialogText('') }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-sm"
              >
                <CheckCircle2 size={16} /> 標記為已解決
              </button>
            )}
            {canAct && isOpen && nextRole && (
              <button
                onClick={() => { setDialog({ type: 'escalate' }); setDialogText('') }}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-sm"
              >
                <ArrowUp size={16} /> 上呈到 {ISSUE_HANDLER_ZH[nextRole]}
              </button>
            )}
            {!isOpen && (isReporter || canAct) && (
              <button
                onClick={() => { setDialog({ type: 'reopen' }); setDialogText('') }}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-sm"
              >
                <RotateCcw size={16} /> 重新開啟
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
            {error}
          </div>
        )}

        {/* Activity / comments thread */}
        <div className="mt-5">
          <h3 className="font-bold text-site-900 mb-2 px-1 flex items-center gap-2">
            <MessageCircle size={16} /> 活動記錄
          </h3>
          <div className="space-y-2">
            {comments.map(c => (
              <CommentItem key={c.id} comment={c} author={users[c.author_id]} />
            ))}
          </div>
        </div>

        {/* Comment composer */}
        <div className="card mt-3 p-3">
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="留言..."
            rows={2}
            className="input resize-none mb-2"
          />
          <button
            onClick={handleSendComment}
            disabled={busy || !commentText.trim()}
            className="btn-primary w-full"
          >
            {busy ? <Spinner size={18} className="text-white" /> : <><Send size={16} /> 送出留言</>}
          </button>
        </div>
      </main>
      </div>

      {dialog && (
        <Modal
          open={!!dialog}
          onClose={() => { setDialog(null); setDialogText('') }}
          title={dialogTitle}
          footer={
            <button onClick={handleAction} disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner size={18} className="text-white" /> : '確認'}
            </button>
          }
        >
          <label className="label">補充說明（可選）</label>
          <textarea
            value={dialogText}
            onChange={e => setDialogText(e.target.value)}
            rows={3}
            placeholder={
              dialog.type === 'escalate' ? '為什麼需要上呈？建議...' :
              dialog.type === 'resolve' ? '如何解決？備注...' :
              '為什麼要重新開啟？...'
            }
            className="input resize-none"
            autoFocus
          />
        </Modal>
      )}
    </div>
  )
}

function CommentItem({ comment, author }: { comment: IssueComment; author?: UserProfile }) {
  const initial = author?.name.slice(0, 1) ?? '?'
  const meta = author ? `${author.name}` : '...'

  if (comment.action !== 'commented') {
    // System / activity event
    const Icon = comment.action === 'escalated' ? ArrowUp
      : comment.action === 'resolved' ? CheckCircle2
      : comment.action === 'reopened' ? RotateCcw
      : AlertCircle
    const text = comment.action === 'escalated'
      ? `上呈到 ${comment.to_role ? ISSUE_HANDLER_ZH[comment.to_role as keyof typeof ISSUE_HANDLER_ZH] ?? comment.to_role : ''}`
      : ISSUE_ACTION_ZH[comment.action]
    return (
      <div className="flex items-start gap-2 px-3 py-2 bg-site-100 rounded-xl">
        <Icon size={14} className="text-site-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-xs text-site-700">
          <span className="font-semibold">{meta}</span> {text}
          {comment.body && <p className="text-site-600 mt-0.5">{comment.body}</p>}
          <p className="text-site-400 text-[10px] mt-0.5">{new Date(comment.created_at).toLocaleString('zh-HK')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-3 flex items-start gap-2">
      <div className="w-8 h-8 rounded-full bg-safety-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-sm text-site-900">{meta}</p>
          <p className="text-[10px] text-site-400">{new Date(comment.created_at).toLocaleString('zh-HK')}</p>
        </div>
        <p className="text-sm text-site-700 whitespace-pre-wrap">{comment.body}</p>
      </div>
    </div>
  )
}
