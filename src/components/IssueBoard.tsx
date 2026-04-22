import { useState } from 'react'
import {
  MessageSquare, ChevronDown, ChevronRight, Send,
  AlertTriangle, Clock, CheckCircle2, XCircle, ArrowUpCircle, Image,
} from 'lucide-react'
import { useIssues } from '../context/IssueContext'
import { useAuth } from '../context/AuthContext'
import type { IssueReport } from '../types'

const SEV_STYLE: Record<string, string> = {
  normal:  'bg-gray-100 text-gray-600',
  serious: 'bg-orange-100 text-orange-700',
  urgent:  'bg-red-100 text-red-700',
}
const SEV_ZH: Record<string, string> = { normal: '一般', serious: '較嚴重', urgent: '緊急' }

const STATUS_STYLE: Record<string, string> = {
  open:          'bg-blue-100 text-blue-700',
  'in-progress': 'bg-yellow-100 text-yellow-700',
  resolved:      'bg-green-100 text-green-700',
  closed:        'bg-gray-100 text-gray-500',
}
const STATUS_ZH: Record<string, string> = {
  open: '待處理', 'in-progress': '處理中', resolved: '已解決', closed: '已關閉',
}
const STATUS_ICON: Record<string, React.ElementType> = {
  open: Clock, 'in-progress': AlertTriangle, resolved: CheckCircle2, closed: XCircle,
}

const ROLE_COLOR: Record<string, string> = {
  pm: 'bg-blue-600', pe: 'bg-emerald-600', cp: 'bg-orange-500',
  foreman: 'bg-amber-600', worker: 'bg-green-600', 'sub-supervisor': 'bg-purple-600',
  system: 'bg-gray-400',
}

const TIER_ZH: Record<IssueReport['currentTier'], string> = {
  'sub-supervisor': '判頭打理',
  'foreman-pe':     '工頭/工程師',
  'pm':             '總監',
}

/** Which currentTier does this role manage? */
function myTier(role: string): IssueReport['currentTier'] | null {
  if (role === 'sub-supervisor') return 'sub-supervisor'
  if (role === 'foreman' || role === 'pe') return 'foreman-pe'
  if (role === 'pm') return 'pm'
  return null
}

export default function IssueBoard({ projectId }: { projectId?: string }) {
  const { issues, addComment, updateStatus, escalateIssue } = useIssues()
  const { user } = useAuth()

  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [commentText, setCommentText] = useState<Record<string, string>>({})
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSev, setFilterSev]       = useState('all')

  const tier = user ? myTier(user.role) : null

  // Each role sees only the tier they are responsible for.
  // CP (safety officer) sees everything for oversight.
  const tierFilter = (issue: IssueReport): boolean => {
    if (!user) return false
    if (user.role === 'cp') return true
    return tier !== null && issue.currentTier === tier
  }

  const filtered = issues
    .filter(i => !projectId || i.projectId === projectId)
    .filter(tierFilter)
    .filter(i => filterStatus === 'all' || i.status === filterStatus)
    .filter(i => filterSev    === 'all' || i.severity === filterSev)

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const sendComment = (issueId: string) => {
    const text = commentText[issueId]?.trim()
    if (!text || !user) return
    addComment(issueId, { authorId: user.id, authorName: user.name, authorRole: user.role, body: text })
    setCommentText(prev => ({ ...prev, [issueId]: '' }))
  }

  const nextTier = (issue: IssueReport): IssueReport['currentTier'] =>
    issue.currentTier === 'sub-supervisor' ? 'foreman-pe' : 'pm'

  const escalateLabel = (issue: IssueReport) =>
    issue.currentTier === 'sub-supervisor' ? '上報工頭/工程師 ↑' : '上報至總監 ↑'

  // Can current user trigger escalation on this issue?
  const canEscalate = (issue: IssueReport) =>
    user !== null &&
    tier !== null &&
    issue.currentTier === tier &&
    issue.currentTier !== 'pm' &&   // pm is the top tier — no further escalation
    issue.status !== 'resolved' &&
    issue.status !== 'closed'

  const canResolve = (issue: IssueReport) =>
    user !== null &&
    tier !== null &&
    issue.currentTier === tier &&
    issue.status !== 'resolved' &&
    issue.status !== 'closed'

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="all">全部狀態</option>
          {Object.entries(STATUS_ZH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
          <option value="all">全部嚴重程度</option>
          {Object.entries(SEV_ZH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} 項問題</span>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
          暫無待處理問題
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(issue => {
          const isOpen   = expanded.has(issue.id)
          const StatusIcon = STATUS_ICON[issue.status]
          return (
            <div key={issue.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                onClick={() => toggle(issue.id)}
                className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
              >
                {isOpen
                  ? <ChevronDown  size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  : <ChevronRight size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[issue.severity]}`}>
                      {SEV_ZH[issue.severity]}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${STATUS_STYLE[issue.status]}`}>
                      <StatusIcon size={9} />{STATUS_ZH[issue.status]}
                    </span>
                    <span className="text-[10px] text-gray-400">{issue.location}</span>
                    {issue.comments.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <MessageSquare size={9} />{issue.comments.length}
                      </span>
                    )}
                    {issue.photos && issue.photos.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <Image size={9} />{issue.photos.length}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {issue.category} — {issue.description.slice(0, 60)}{issue.description.length > 60 ? '…' : ''}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {issue.submittedByName} · {issue.submittedAt.slice(0, 16).replace('T', ' ')}
                  </p>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                  {/* Detail fields */}
                  <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                    <div><span className="text-gray-400">類別：</span><span className="font-medium text-gray-700">{issue.category}</span></div>
                    <div><span className="text-gray-400">地點：</span><span className="font-medium text-gray-700">{issue.location}</span></div>
                    {issue.drawingRef && <div><span className="text-gray-400">圖則：</span><span className="font-medium text-gray-700">{issue.drawingRef}</span></div>}
                    <div><span className="text-gray-400">上報人：</span><span className="font-medium text-gray-700">{issue.submittedByName}</span></div>
                    <div><span className="text-gray-400">當前層級：</span><span className="font-medium text-purple-700">{TIER_ZH[issue.currentTier]}</span></div>
                  </div>
                  <p className="text-sm text-gray-700 bg-white border border-gray-100 rounded-lg p-3 mb-4">{issue.description}</p>

                  {/* Photos */}
                  {issue.photos && issue.photos.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                        <Image size={11} /> 現場照片 ({issue.photos.length})
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {issue.photos.map((src, idx) => (
                          <img
                            key={idx} src={src} alt={`photo-${idx + 1}`}
                            className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Escalation / Resolve actions ───────────────────────── */}
                  {canResolve(issue) && (
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => updateStatus(issue.id, 'resolved')}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 size={14} />
                        {user?.role === 'sub-supervisor' ? '自行解決' : '標記解決'}
                      </button>
                      {canEscalate(issue) && (
                        <button
                          onClick={() => escalateIssue(issue.id, nextTier(issue), user!.name, user!.role)}
                          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ArrowUpCircle size={14} /> {escalateLabel(issue)}
                        </button>
                      )}
                    </div>
                  )}

                  {/* PM status panel */}
                  {user?.role === 'pm' && issue.currentTier === 'pm' && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="text-xs text-gray-500">更改狀態：</span>
                      {(['open', 'in-progress', 'resolved', 'closed'] as IssueReport['status'][]).map(s => (
                        <button
                          key={s}
                          onClick={() => updateStatus(issue.id, s)}
                          className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                            issue.status === s
                              ? STATUS_STYLE[s] + ' border-current'
                              : 'border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          {STATUS_ZH[s]}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Comments */}
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <MessageSquare size={11} /> 討論 ({issue.comments.length})
                    </p>
                    {issue.comments.length === 0 && (
                      <p className="text-xs text-gray-400 italic">暫無討論...</p>
                    )}
                    <div className="space-y-2">
                      {issue.comments.map(c => (
                        <div key={c.id} className="flex gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${ROLE_COLOR[c.authorRole] ?? ROLE_COLOR['system']}`}>
                            {c.authorId === 'system' ? '↑' : c.authorName.slice(0, 1)}
                          </div>
                          <div className="flex-1 bg-white border border-gray-100 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-800">{c.authorName}</span>
                              <span className="text-[10px] text-gray-400">{c.createdAt.slice(0, 16).replace('T', ' ')}</span>
                            </div>
                            <p className="text-xs text-gray-700">{c.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add comment — all roles except worker */}
                  {user && user.role !== 'worker' && (
                    <div className="flex gap-2">
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold ${ROLE_COLOR[user.role] ?? 'bg-gray-500'}`}>
                        {user.avatar}
                      </div>
                      <div className="flex-1 flex gap-2">
                        <input
                          value={commentText[issue.id] ?? ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [issue.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment(issue.id)}
                          placeholder="輸入回覆或處理方案..."
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => sendComment(issue.id)}
                          disabled={!commentText[issue.id]?.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1"
                        >
                          <Send size={11} /> 回覆
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
