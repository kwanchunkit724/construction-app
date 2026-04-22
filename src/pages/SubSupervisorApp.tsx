import { useState, useRef } from 'react'
import {
  BarChart2, Users, MessageSquare, AlertTriangle,
  CheckCircle, Send, Camera, Phone,
  Clock, Plus, Mic
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ProgressTracker from '../components/ProgressTracker'
import IssueBoard from '../components/IssueBoard'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useIssues } from '../context/IssueContext'
import { workers } from '../data/mockData'

type Tab = 'progress' | 'workers' | 'comms' | 'issues'

const MSG_TYPE_STYLE = {
  'progress-report': 'bg-blue-100 text-blue-700',
  'issue-report': 'bg-red-100 text-red-700',
  'general': 'bg-gray-100 text-gray-600',
}
const MSG_TYPE_ZH = {
  'progress-report': '進度匯報', 'issue-report': '問題上報', 'general': '一般'
}

// Workers under sub-supervisor's management
const myWorkers = workers.filter(w =>
  ['W001', 'W002', 'W003', 'W009', 'W010', 'W012'].includes(w.id)
)

export default function SubSupervisorApp() {
  const { user } = useAuth()
  const { messages, sendMessage, markRead, currentProjectId } = useProgress()
  const { submitIssue, issues } = useIssues()

  const [activeTab, setActiveTab] = useState<Tab>('progress')
  const [showComposeForm, setShowComposeForm] = useState(false)
  const [composeType, setComposeType] = useState<'progress-report' | 'issue-report' | 'general'>('progress-report')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeTo, setComposeTo] = useState<string[]>(['U004'])
  const [composeSent, setComposeSent] = useState(false)

  // Issue form state
  const [issueCategory, setIssueCategory] = useState('質量問題')
  const [issueSeverity, setIssueSeverity] = useState<'normal'|'serious'|'urgent'>('normal')
  const [issueLocation, setIssueLocation] = useState('Zone C 1-20/F')
  const [issueDrawingRef, setIssueDrawingRef] = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issueNotify, setIssueNotify] = useState(['U004', 'U002', 'U001', 'U003'])
  const [issueSubmitted, setIssueSubmitted] = useState(false)
  const [issuePhotos, setIssuePhotos] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  const myIssues = issues.filter(i => i.submittedBy === user?.id)

  // Messages relevant to this sub-supervisor
  const myMessages = messages.filter(
    m => m.from === user?.id || m.to.includes(user?.id ?? '')
  )
  const unreadCount = myMessages.filter(m => !m.readBy.includes(user?.id ?? '')).length

  const checkedIn = myWorkers.filter(w => w.checkedIn).length

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'progress', label: '進度更新', icon: BarChart2 },
    { id: 'workers',  label: '工人管理', icon: Users, badge: myWorkers.length - checkedIn },
    { id: 'comms',    label: '通訊匯報', icon: MessageSquare, badge: unreadCount },
    { id: 'issues',   label: '問題上報', icon: AlertTriangle },
  ]

  const handleSend = () => {
    if (!composeSubject.trim() || !composeBody.trim()) return
    const recipientNames = composeTo.map(id => {
      const names: Record<string,string> = { U001:'李建明 (總監)', U002:'張志豪 (工程師)', U004:'麥偉強 (工頭)' }
      return names[id] ?? id
    })
    sendMessage({
      type: composeType,
      from: user?.id ?? 'U006',
      fromName: user?.name ?? '王建國',
      fromRole: 'sub-supervisor',
      to: composeTo,
      toNames: recipientNames,
      subject: composeSubject,
      body: composeBody,
      zone: 'Zone C',
    })
    setComposeSent(true)
  }

  const openMessage = (id: string) => {
    markRead([id], user?.id ?? '')
  }

  return (
    <div className="min-h-screen bg-purple-50">
      <Navbar accentColor="bg-purple-600" bgColor="bg-purple-800" />

      <main className="max-w-5xl mx-auto px-4 py-5">
        {/* Identity card */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-900 rounded-2xl p-4 mb-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-2xl font-black">
              {user?.avatar}
            </div>
            <div>
              <p className="font-black text-xl">{user?.name}</p>
              <p className="text-purple-200 text-sm">{user?.roleZh} · {user?.company}</p>
              <p className="text-purple-300 text-xs mt-0.5">負責區域：Zone B · Zone C 結構工程</p>
            </div>
            <div className="ml-auto text-right hidden sm:block">
              <p className="text-3xl font-black text-green-300">{checkedIn}</p>
              <p className="text-purple-200 text-xs">今日出勤 / {myWorkers.length}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-purple-600 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {(tab.badge ?? 0) > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== PROGRESS TAB ===== */}
            {activeTab === 'progress' && (
              <div>
                <div className="mb-4">
                  <h2 className="font-bold text-gray-800">我的工序進度</h2>
                  <p className="text-xs text-gray-400 mt-0.5">以下為工頭委派給你管理的工序項目，你可更新實際進度百分比</p>
                </div>
                <ProgressTracker />
              </div>
            )}

            {/* ===== WORKERS TAB ===== */}
            {activeTab === 'workers' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-800">我的工人團隊</h2>
                    <p className="text-xs text-gray-400 mt-0.5">今日出勤 {checkedIn} / {myWorkers.length} 人</p>
                  </div>
                </div>

                {myWorkers.filter(w => !w.checkedIn).length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    ⚠ 未打卡工人：{myWorkers.filter(w => !w.checkedIn).map(w => w.name).join('、')}
                  </div>
                )}

                <div className="space-y-2">
                  {myWorkers.map(w => (
                    <div key={w.id} className="flex items-center gap-3 p-3.5 border border-gray-100 rounded-xl hover:border-purple-200 transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${w.checkedIn ? 'bg-green-500' : 'bg-gray-300'}`}>
                        {w.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{w.name}</p>
                        <p className="text-xs text-gray-500">{w.trade} · {w.company}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {w.checkedIn ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                              <CheckCircle size={10} /> {w.checkInTime}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-0.5">{w.zone}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">未打卡</span>
                        )}
                      </div>
                      <a href="tel:12345678" className="text-gray-300 hover:text-purple-500 transition-colors ml-1">
                        <Phone size={15} />
                      </a>
                    </div>
                  ))}
                </div>

                {/* Zone summary */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-3">工序分佈</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { zone: 'Zone B', workers: 2, task: '核心筒鋼筋' },
                      { zone: 'Zone C 1-20/F', workers: 3, task: '模板安裝' },
                      { zone: 'Zone C 21-30/F', workers: 6, task: '鋼筋綁紮' },
                      { zone: 'Zone C 31/F+', workers: 1, task: '澆築準備' },
                    ].map(g => (
                      <div key={g.zone} className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                        <p className="text-xs font-bold text-purple-800">{g.zone}</p>
                        <p className="text-xs text-purple-600 mt-0.5">{g.task}</p>
                        <p className="text-lg font-black text-purple-700">{g.workers} 人</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===== COMMS TAB ===== */}
            {activeTab === 'comms' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-800">通訊匯報</h2>
                    <p className="text-xs text-gray-400 mt-0.5">向工頭、工程師或總監匯報進度</p>
                  </div>
                  <button
                    onClick={() => { setShowComposeForm(true); setComposeSent(false) }}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> 發送匯報
                  </button>
                </div>

                {/* Compose form */}
                {showComposeForm && (
                  <div className="mb-5 p-4 bg-purple-50 border border-purple-200 rounded-2xl">
                    {composeSent ? (
                      <div className="text-center py-6">
                        <CheckCircle size={40} className="text-green-500 mx-auto mb-2" />
                        <p className="font-bold text-gray-800">匯報已成功發送</p>
                        <button onClick={() => { setShowComposeForm(false); setComposeSent(false) }} className="mt-3 text-purple-600 text-sm hover:underline">關閉</button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">匯報類型</label>
                            <select
                              value={composeType}
                              onChange={e => setComposeType(e.target.value as typeof composeType)}
                              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-purple-400"
                            >
                              <option value="progress-report">📊 進度匯報</option>
                              <option value="issue-report">⚠️ 問題上報</option>
                              <option value="general">💬 一般通訊</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">發送給</label>
                            <div className="space-y-1">
                              {[
                                { id: 'U004', label: '麥偉強 (工頭)' },
                                { id: 'U002', label: '張志豪 (工程師)' },
                                { id: 'U001', label: '李建明 (總監)' },
                              ].map(r => (
                                <label key={r.id} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={composeTo.includes(r.id)}
                                    onChange={e => setComposeTo(prev =>
                                      e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id)
                                    )}
                                    className="accent-purple-600"
                                  />
                                  {r.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">主題</label>
                          <input
                            type="text" value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                            placeholder="例：【進度匯報】Zone C 26-30/F 今日更新"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">內容</label>
                          <textarea
                            rows={4} value={composeBody} onChange={e => setComposeBody(e.target.value)}
                            placeholder="請描述目前進度狀況、遇到的問題及下一步計劃..."
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowComposeForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50">取消</button>
                          <button
                            onClick={handleSend}
                            disabled={!composeSubject.trim() || !composeBody.trim() || composeTo.length === 0}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Send size={13} /> 發送
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Message list */}
                <div className="space-y-2">
                  {myMessages.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-8">暫無訊息</p>
                  )}
                  {myMessages.map(msg => {
                    const isUnread = !msg.readBy.includes(user?.id ?? '')
                    const isSent = msg.from === user?.id
                    return (
                      <div
                        key={msg.id}
                        onClick={() => openMessage(msg.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-colors ${isUnread ? 'bg-purple-50 border-purple-200 hover:border-purple-400' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${MSG_TYPE_STYLE[msg.type]}`}>
                              {MSG_TYPE_ZH[msg.type]}
                            </span>
                            {isUnread && <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />}
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">
                            {msg.sentAt.slice(0, 16).replace('T', ' ')}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-800 text-sm">{msg.subject}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{msg.body}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                          {isSent
                            ? <span>發送至：{msg.toNames.join('、')}</span>
                            : <span>來自：{msg.fromName}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===== ISSUES TAB ===== */}
            {activeTab === 'issues' && (
              <div>
                {/* ── Section 1: Worker-submitted issues ─────────────────── */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="font-bold text-gray-800 mb-1">工人上報問題</h2>
                  <p className="text-xs text-gray-400 mb-4">以下為工人上報的問題，你可自行解決或上報至工頭/工程師</p>
                  <IssueBoard />
                </div>

                {/* ── Section 2: My submitted issues (to foreman/PE) ─────── */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-800">我已上報至工頭/工程師</h2>
                    {myIssues.length > 0 && (
                      <span className="text-xs text-gray-400">{myIssues.length} 項</span>
                    )}
                  </div>
                  {myIssues.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3">暫無上報記錄</p>
                  ) : (
                    <div className="space-y-2">
                      {myIssues.map(i => (
                        <div key={i.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              i.status === 'open'        ? 'bg-blue-100 text-blue-700' :
                              i.status === 'in-progress' ? 'bg-yellow-100 text-yellow-700' :
                              i.status === 'resolved'    ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {i.status === 'open' ? '待處理' : i.status === 'in-progress' ? '處理中' : i.status === 'resolved' ? '已解決' : '已關閉'}
                            </span>
                            <span className="text-gray-400">{i.submittedAt.slice(0, 16).replace('T', ' ')}</span>
                            {i.comments.length > 0 && <span className="text-purple-600">{i.comments.length} 則回覆</span>}
                          </div>
                          <p className="font-semibold text-gray-700">{i.category} — {i.location}</p>
                          <p className="text-gray-500 truncate">{i.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Section 3: Submit new issue (goes to foreman-pe tier) ─ */}
                <div>
                  <h2 className="font-bold text-gray-800 mb-1">直接上報至工頭/工程師</h2>
                  <p className="text-xs text-gray-400 mb-4">用於你本身發現、需要工頭/工程師關注的問題</p>

                {issueSubmitted ? (
                  <div className="text-center py-12">
                    <CheckCircle size={52} className="text-green-500 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900 text-lg">問題已成功上報</h3>
                    <p className="text-gray-500 text-sm mt-1">工頭、工程師及總監已收到通知</p>
                    <button onClick={() => setIssueSubmitted(false)} className="mt-4 text-purple-600 text-sm hover:underline">再次上報</button>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                      💡 請盡快上報現場發現的質量、安全或技術問題，以便工程師及時處理。
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">問題類別</label>
                      <select value={issueCategory} onChange={e => setIssueCategory(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                        {['質量問題','安全隱患','圖則不符','物料問題','機械故障','其他'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">嚴重程度</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([['normal','一般'],['serious','較嚴重'],['urgent','緊急']] as const).map(([v,l]) => (
                          <button key={v} onClick={() => setIssueSeverity(v)}
                            className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                              issueSeverity === v
                                ? v === 'urgent' ? 'border-red-500 bg-red-50 text-red-700'
                                  : v === 'serious' ? 'border-orange-500 bg-orange-50 text-orange-700'
                                  : 'border-gray-400 bg-gray-100 text-gray-700'
                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}>{l}</button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">發生地點</label>
                      <select value={issueLocation} onChange={e => setIssueLocation(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400">
                        {['Zone B — 核心筒','Zone C 1-20/F','Zone C 21-30/F','Zone C 31/F+','其他'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">相關圖則 (選填)</label>
                      <input type="text" value={issueDrawingRef} onChange={e => setIssueDrawingRef(e.target.value)}
                        placeholder="例：STR-C-28-001 Rev.C"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">問題描述 *</label>
                      <textarea rows={4} value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400 resize-none"
                        placeholder="請詳細描述問題情況，包括發現時間、影響範圍及初步建議..." />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5 block">
                        <Camera size={14} /> 現場照片 (可上載多張)
                      </label>
                      {/* Hidden real file input */}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files ?? [])
                          files.forEach(file => {
                            const reader = new FileReader()
                            reader.onload = ev => {
                              const result = ev.target?.result
                              if (typeof result === 'string') {
                                setIssuePhotos(prev => [...prev, result])
                              }
                            }
                            reader.readAsDataURL(file)
                          })
                          // Reset so same file can be re-selected
                          e.target.value = ''
                        }}
                      />
                      {/* Clickable upload area */}
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-colors"
                      >
                        <Camera size={24} className="mx-auto mb-2 text-gray-300" />
                        拍照或上載圖片
                      </button>
                      {/* Photo previews */}
                      {issuePhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {issuePhotos.map((src, idx) => (
                            <div key={idx} className="relative aspect-square">
                              <img
                                src={src}
                                alt={`photo-${idx + 1}`}
                                className="w-full h-full object-cover rounded-lg border border-gray-200"
                              />
                              <button
                                type="button"
                                onClick={() => setIssuePhotos(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center leading-none hover:bg-red-600"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5 block">
                        <Mic size={14} /> 語音描述 (選填)
                      </label>
                      <button className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-purple-400 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2">
                        <Mic size={16} className="text-purple-500" /> 按住說話
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 mb-2 block">通知對象</label>
                      <div className="flex flex-wrap gap-3">
                        {[{id:'U004',label:'麥偉強 (工頭)'},{id:'U002',label:'張志豪 (工程師)'},{id:'U001',label:'李建明 (總監)'},{id:'U003',label:'陳志安 (安全主任)'}].map(p => (
                          <label key={p.id} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={issueNotify.includes(p.id)}
                              onChange={e => setIssueNotify(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))}
                              className="accent-purple-600" />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      disabled={!issueDescription.trim()}
                      onClick={() => {
                        submitIssue({
                          projectId: currentProjectId,
                          category: issueCategory,
                          severity: issueSeverity,
                          location: issueLocation,
                          drawingRef: issueDrawingRef,
                          description: issueDescription,
                          submittedBy: user?.id ?? '',
                          submittedByName: user?.name ?? '',
                          submittedByRole: user?.role ?? 'sub-supervisor',
                          notifyIds: issueNotify,
                          photos: issuePhotos,
                        })
                        setIssueDescription('')
                        setIssueDrawingRef('')
                        setIssueSeverity('normal')
                        setIssuePhotos([])
                        setIssueSubmitted(true)
                      }}
                      className="w-full bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Send size={15} /> 提交問題上報
                    </button>
                  </div>
                )}
                </div>{/* end Section 3 */}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
