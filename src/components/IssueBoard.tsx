import { useState, useEffect } from 'react'
import {
  MessageSquare, ChevronDown, ChevronRight, Send,
  AlertTriangle, Clock, CheckCircle2, XCircle, ArrowUpCircle, Image,
  UserCheck, RefreshCw, Camera,
} from 'lucide-react'
import { useIssues } from '../context/IssueContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
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
const TIER_ZH: Record<IssueReport['currentTier'], string> = {
  'sub-supervisor': '判頭處理',
  'foreman-pe':     '總承建商',
  pm:               '總監',
}

interface SubProfile { id: string; name: string; company: string }

export default function IssueBoard({ projectId }: { projectId?: string }) {
  const { issues, addComment, updateStatus, escalateIssue, assignIssue, reassignIssue, resolveWithPhoto } = useIssues()
  const { user } = useAuth()

  // Permission helpers
  const perms = user?.permissions ?? []
  const canManage  = perms.includes('manage:issues') || perms.includes('view:all')
  const canReport  = perms.includes('report:issues')
  const canAssign  = perms.includes('assign:tasks')
  const canDelegate = perms.includes('view:delegated-items')

  const [expanded, setExpanded]         = useState<Set<string>>(new Set())
  const [commentText, setCommentText]   = useState<Record<string, string>>({})
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSev, setFilterSev]       = useState('all')

  const [subSups, setSubSups] = useState<SubProfile[]>([])
  useEffect(() => {
    supabase.from('profiles').select('id,name,company').eq('role', 'sub-contractor')
      .then(({ data }) => { if (data) setSubSups(data as SubProfile[]) })
  }, [])

  const [assigningId, setAssigningId]       = useState<string | null>(null)
  const [assignTarget, setAssignTarget]     = useState('')
  const [reassignId, setReassignId]         = useState<string | null>(null)
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [resolveId, setResolveId]           = useState<string | null>(null)
  const [resolvePhotoUrl, setResolvePhotoUrl] = useState('')

  const tierFilter = (issue: IssueReport): boolean => {
    if (!user) return false
    if (canManage) return true
    if (canDelegate) return issue.currentTier === 'sub-supervisor' && (!issue.assignedToId || issue.assignedToId === user.id)
    if (canReport) return issue.submittedBy === user.id
    return false
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

  const doAssign = (issueId: string) => {
    if (!assignTarget || !user) return
    const target = subSups.find(s => s.id === assignTarget)
    if (!target) return
    assignIssue(issueId, target.id, target.name, user.name)
    setAssigningId(null); setAssignTarget('')
  }

  const doReassign = (issueId: string) => {
    if (!reassignTarget || !reassignReason.trim() || !user) return
    const target = subSups.find(s => s.id === reassignTarget)
    if (!target) return
    reassignIssue(issueId, target.id, target.name, reassignReason.trim(), user.name, user.role)
    setReassignId(null); setReassignTarget(''); setReassignReason('')
  }

  const doResolveWithPhoto = (issueId: string) => {
    if (!user) return
    resolveWithPhoto(issueId, resolvePhotoUrl || 'data:image/svg+xml,<svg/>', user.name, user.role)
    setResolveId(null); setResolvePhotoUrl('')
  }

  return (
    <div>
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
          const isOpen = expanded.has(issue.id)
          const StatusIcon = STATUS_ICON[issue.status]
          return (
            <div key={issue.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggle(issue.id)}
                className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
                {isOpen ? <ChevronDown size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                        : <ChevronRight size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[issue.severity]}`}>
                      {SEV_ZH[issue.severity]}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${STATUS_STYLE[issue.status]}`}>
                      <StatusIcon size={9} />{STATUS_ZH[issue.status]}
                    </span>
                    {issue.assignedToName && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        指派: {issue.assignedToName}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">{issue.location}</span>
                    {issue.comments.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <MessageSquare size={9} />{issue.comments.length}
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

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-gray-400">類別：</span><span className="font-medium text-gray-700">{issue.category}</span></div>
                    <div><span className="text-gray-400">地點：</span><span className="font-medium text-gray-700">{issue.location}</span></div>
                    {issue.drawingRef && <div><span className="text-gray-400">圖則：</span><span className="font-medium text-gray-700">{issue.drawingRef}</span></div>}
                    <div><span className="text-gray-400">上報人：</span><span className="font-medium text-gray-700">{issue.submittedByName}</span></div>
                    <div><span className="text-gray-400">當前層級：</span><span className="font-medium text-purple-700">{TIER_ZH[issue.currentTier]}</span></div>
                    {issue.assignedToName && (
                      <div><span className="text-gray-400">指派至：</span><span className="font-medium text-purple-700">{issue.assignedToName}</span></div>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 bg-white border border-gray-100 rounded-lg p-3">{issue.description}</p>

                  {issue.photos && issue.photos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Image size={11} /> 現場照片</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {issue.photos.map((src, idx) => (
                          <img key={idx} src={src} alt={`photo-${idx + 1}`}
                            className="w-full aspect-square object-cover rounded-lg border border-gray-200" />
                        ))}
                      </div>
                    </div>
                  )}

                  {issue.resolvePhoto && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1"><CheckCircle2 size={11} /> 解決相片</p>
                      <img src={issue.resolvePhoto} alt="resolve" className="w-32 aspect-square object-cover rounded-lg border border-green-200" />
                    </div>
                  )}

                  {/* Assign to sub-contractor (for users with assign:tasks permission) */}
                  {canAssign && issue.currentTier === 'sub-supervisor' && !issue.assignedToId &&
                   issue.status !== 'resolved' && issue.status !== 'closed' && (
                    assigningId === issue.id ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-purple-800">指派至判頭</p>
                        <select value={assignTarget} onChange={e => setAssignTarget(e.target.value)}
                          className="w-full text-sm border border-purple-300 rounded-lg px-3 py-2 focus:outline-none">
                          <option value="">選擇判頭...</option>
                          {subSups.map(s => <option key={s.id} value={s.id}>{s.name} ({s.company})</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => doAssign(issue.id)} disabled={!assignTarget}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-2 rounded-lg text-sm font-semibold">確認指派</button>
                          <button onClick={() => { setAssigningId(null); setAssignTarget('') }}
                            className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">取消</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAssigningId(issue.id)}
                        className="w-full flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl text-sm font-semibold">
                        <UserCheck size={14} /> 指派至判頭
                      </button>
                    )
                  )}

                  {/* Sub-contractor: resolve with photo or reassign */}
                  {canDelegate && issue.currentTier === 'sub-supervisor' &&
                   issue.status !== 'resolved' && issue.status !== 'closed' && (
                    <div className="space-y-2">
                      {resolveId === issue.id ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-green-800">解決問題 — 上傳相片</p>
                          <input type="url" value={resolvePhotoUrl} onChange={e => setResolvePhotoUrl(e.target.value)}
                            placeholder="相片網址（或直接提交）"
                            className="w-full text-sm border border-green-300 rounded-lg px-3 py-2 focus:outline-none" />
                          <div className="flex gap-2">
                            <button onClick={() => doResolveWithPhoto(issue.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-semibold">確認解決</button>
                            <button onClick={() => setResolveId(null)}
                              className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">取消</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setResolveId(issue.id); setReassignId(null) }}
                          className="w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-semibold">
                          <Camera size={14} /> 解決並補相片
                        </button>
                      )}
                      {reassignId === issue.id ? (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-orange-800">轉交至其他判頭</p>
                          <select value={reassignTarget} onChange={e => setReassignTarget(e.target.value)}
                            className="w-full text-sm border border-orange-300 rounded-lg px-3 py-2 focus:outline-none">
                            <option value="">選擇判頭...</option>
                            {subSups.filter(s => s.id !== user?.id).map(s => <option key={s.id} value={s.id}>{s.name} ({s.company})</option>)}
                          </select>
                          <textarea value={reassignReason} onChange={e => setReassignReason(e.target.value)}
                            rows={2} placeholder="請說明轉交原因（必填）..."
                            className="w-full text-sm border border-orange-300 rounded-lg px-3 py-2 focus:outline-none resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => doReassign(issue.id)} disabled={!reassignTarget || !reassignReason.trim()}
                              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white py-2 rounded-lg text-sm font-semibold">確認轉交</button>
                            <button onClick={() => { setReassignId(null); setReassignTarget(''); setReassignReason('') }}
                              className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">取消</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReassignId(issue.id); setResolveId(null) }}
                          className="w-full flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-xl text-sm font-semibold">
                          <RefreshCw size={14} /> 轉交至其他判頭
                        </button>
                      )}
                    </div>
                  )}

                  {/* Manager: resolve / escalate / change status */}
                  {canManage && issue.status !== 'resolved' && issue.status !== 'closed' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button onClick={() => updateStatus(issue.id, 'resolved')}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                          <CheckCircle2 size={14} /> 標記解決
                        </button>
                        {issue.currentTier !== 'pm' && (
                          <button onClick={() => escalateIssue(issue.id, 'pm', user!.name, user!.role)}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                            <ArrowUpCircle size={14} /> 上報 ↑
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-500">更改狀態：</span>
                        {(['open', 'in-progress', 'resolved', 'closed'] as IssueReport['status'][]).map(s => (
                          <button key={s} onClick={() => updateStatus(issue.id, s)}
                            className={`text-[10px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                              issue.status === s ? STATUS_STYLE[s] + ' border-current' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}>
                            {STATUS_ZH[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                      <MessageSquare size={11} /> 討論 ({issue.comments.length})
                    </p>
                    {issue.comments.length === 0 && <p className="text-xs text-gray-400 italic">暫無討論...</p>}
                    <div className="space-y-2 mb-3">
                      {issue.comments.map(c => (
                        <div key={c.id} className="flex gap-2.5">
                          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-blue-600 text-white text-xs font-bold">
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

                  {(canManage || canReport || canDelegate) && (
                    <div className="flex gap-2">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-blue-600 text-white text-xs font-bold">
                        {user?.avatar}
                      </div>
                      <div className="flex-1 flex gap-2">
                        <input value={commentText[issue.id] ?? ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [issue.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment(issue.id)}
                          placeholder="輸入回覆或處理方案..."
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
                        <button onClick={() => sendComment(issue.id)} disabled={!commentText[issue.id]?.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1">
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
