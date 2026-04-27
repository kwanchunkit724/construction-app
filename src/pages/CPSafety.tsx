import { useState } from 'react'
import {
  Shield, ClipboardList, AlertTriangle, BarChart2,
  CheckCircle, XCircle, Plus, Users, Clock
} from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useSafety } from '../context/SafetyContext'
import type { PTWRequest, NearMissReport } from '../types'

type Tab = 'ptw' | 'toolbox' | 'nearmiss' | 'stats'

const RISK_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
}
const RISK_ZH: Record<string, string> = { critical: '極高風險', high: '高風險', medium: '中風險', low: '低風險' }

const PTW_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-400',
  rejected: 'bg-red-100 text-red-700',
}
const PTW_STATUS_ZH: Record<string, string> = {
  pending: '待審批', approved: '已批准', active: '生效中',
  completed: '已完成', expired: '已過期', rejected: '已拒絕'
}

export default function CPSafety() {
  const { user } = useAuth()
  const { currentProjectId } = useProgress()
  const { ptwRequests, approvePTW, rejectPTW, closePTW, toolboxTalks, addToolboxTalk } = useSafety()

  const [activeTab, setActiveTab] = useState<Tab>('ptw')
  const [ptwFilter, setPtwFilter] = useState<string>('all')

  // PTW modal state
  const [approveModalId, setApproveModalId] = useState<string | null>(null)
  const [approveConditions, setApproveConditions] = useState('')
  const [rejectModalId, setRejectModalId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Toolbox talk form
  const [tbtTopic, setTbtTopic] = useState('')
  const [tbtAttendees, setTbtAttendees] = useState('')
  const [tbtDuration, setTbtDuration] = useState(15)
  const [tbtNotes, setTbtNotes] = useState('')
  const [tbtSubmitted, setTbtSubmitted] = useState(false)

  // Near miss
  const [nearMisses, setNearMisses] = useState<NearMissReport[]>([])
  const [nmZone, setNmZone] = useState('Zone A')
  const [nmCategory, setNmCategory] = useState('高空墜物')
  const [nmDescription, setNmDescription] = useState('')
  const [nmAnonymous, setNmAnonymous] = useState(false)
  const [nmSubmitted, setNmSubmitted] = useState(false)
  const [showNmForm, setShowNmForm] = useState(false)

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const pendingCount = ptwRequests.filter(p => p.status === 'pending').length
  const activeCount = ptwRequests.filter(p => p.status === 'active').length
  const completedThisMonth = ptwRequests.filter(p =>
    p.status === 'completed' && p.requestedAt?.startsWith(thisMonth)
  ).length
  const tbtThisMonth = toolboxTalks.filter(t => t.date?.startsWith(thisMonth)).length

  const handleApprove = () => {
    if (!approveModalId || !user) return
    approvePTW(approveModalId, user.id, user.name, approveConditions.trim() || undefined)
    setApproveModalId(null)
    setApproveConditions('')
  }

  const handleReject = () => {
    if (!rejectModalId || !rejectReason.trim()) return
    rejectPTW(rejectModalId, rejectReason.trim())
    setRejectModalId(null)
    setRejectReason('')
  }

  const handleAddTBT = () => {
    if (!tbtTopic.trim() || !user) return
    addToolboxTalk({
      projectId: currentProjectId,
      date: new Date().toISOString().slice(0, 10),
      conductedBy: user.id,
      conductedByName: user.name,
      topic: tbtTopic.trim(),
      attendeeNames: tbtAttendees.split(/[,，\n]/).map(s => s.trim()).filter(Boolean),
      duration: tbtDuration,
      notes: tbtNotes.trim(),
    })
    setTbtTopic('')
    setTbtAttendees('')
    setTbtDuration(15)
    setTbtNotes('')
    setTbtSubmitted(true)
  }

  const handleSubmitNM = () => {
    if (!nmDescription.trim()) return
    const nm: NearMissReport = {
      id: `NM${Date.now()}`,
      reportDate: new Date().toISOString().slice(0, 10),
      zone: nmZone,
      category: nmCategory,
      description: nmDescription.trim(),
      anonymous: nmAnonymous,
      status: 'new',
    }
    setNearMisses(prev => [nm, ...prev])
    setNmDescription('')
    setNmAnonymous(false)
    setNmSubmitted(true)
    setShowNmForm(false)
  }

  const tabs = [
    { id: 'ptw' as Tab, label: 'PTW管理', icon: ClipboardList, badge: pendingCount },
    { id: 'toolbox' as Tab, label: '工具箱會議', icon: Users, badge: 0 },
    { id: 'nearmiss' as Tab, label: '近乎意外', icon: AlertTriangle, badge: nearMisses.filter(n => n.status === 'new').length },
    { id: 'stats' as Tab, label: '安全統計', icon: BarChart2, badge: 0 },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar accentColor="bg-orange-600" bgColor="bg-orange-700" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4">
            <p className="text-3xl font-bold text-yellow-700">{pendingCount}<span className="text-base ml-1">個</span></p>
            <p className="text-sm text-gray-600 mt-1">待審批 PTW</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-100 p-4">
            <p className="text-3xl font-bold text-green-700">{activeCount}<span className="text-base ml-1">個</span></p>
            <p className="text-sm text-gray-600 mt-1">生效中 PTW</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
            <p className="text-3xl font-bold text-blue-700">{completedThisMonth}<span className="text-base ml-1">個</span></p>
            <p className="text-sm text-gray-600 mt-1">本月完成 PTW</p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-100 p-4">
            <p className="text-3xl font-bold text-orange-700">{tbtThisMonth}<span className="text-base ml-1">次</span></p>
            <p className="text-sm text-gray-600 mt-1">本月工具箱會議</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="grid grid-flow-col auto-cols-fr border-b border-gray-100">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                  {tab.badge > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== PTW TAB ===== */}
            {activeTab === 'ptw' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">工作許可證列表</h2>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { key: 'all',     label: '全部',   count: ptwRequests.length },
                      { key: 'pending', label: '待審批', count: ptwRequests.filter(p => p.status === 'pending').length },
                      { key: 'approved',label: '已批准', count: ptwRequests.filter(p => p.status === 'approved').length },
                      { key: 'active',  label: '生效中', count: ptwRequests.filter(p => p.status === 'active').length },
                      { key: 'completed',label:'已完成', count: ptwRequests.filter(p => p.status === 'completed').length },
                    ].map(f => (
                      <button key={f.key} onClick={() => setPtwFilter(f.key)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          ptwFilter === f.key
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {f.label}{f.count > 0 && ` (${f.count})`}
                      </button>
                    ))}
                  </div>
                </div>
                {ptwRequests.filter(p => ptwFilter === 'all' || p.status === ptwFilter).length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Shield size={40} className="mx-auto mb-3 opacity-30" />
                    <p>暫無 PTW 申請</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ptwRequests.filter(p => ptwFilter === 'all' || p.status === ptwFilter).map(ptw => (
                      <div key={ptw.id} className={`p-4 border rounded-xl ${
                        ptw.status === 'pending' ? 'border-yellow-200 bg-yellow-50' :
                        ptw.status === 'active' ? 'border-green-200 bg-green-50' :
                        'border-gray-100 bg-white'
                      }`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{ptw.ptwNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${RISK_STYLE[ptw.riskLevel]}`}>{RISK_ZH[ptw.riskLevel]}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PTW_STATUS_STYLE[ptw.status]}`}>{PTW_STATUS_ZH[ptw.status]}</span>
                            </div>
                            <p className="font-semibold text-gray-800">{ptw.workType}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                              <span>📍 {ptw.location} ({ptw.zone})</span>
                              <span>👷 {ptw.requestedByName}</span>
                              <span><Clock size={11} className="inline mr-0.5" />{ptw.startTime.slice(0, 16).replace('T', ' ')} – {ptw.endTime.slice(11, 16)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {ptw.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => { setApproveModalId(ptw.id); setApproveConditions('') }}
                                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                                >
                                  <CheckCircle size={12} /> 批准
                                </button>
                                <button
                                  onClick={() => { setRejectModalId(ptw.id); setRejectReason('') }}
                                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                                >
                                  <XCircle size={12} /> 拒絕
                                </button>
                              </>
                            )}
                            {ptw.status === 'active' && (
                              <button
                                onClick={() => user && closePTW(ptw.id, user.id)}
                                className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                關閉 PTW
                              </button>
                            )}
                          </div>
                        </div>
                        {ptw.conditions && (
                          <div className="mt-2 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">條件：{ptw.conditions}</div>
                        )}
                        {ptw.rejectionReason && (
                          <div className="mt-2 text-xs text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">拒絕原因：{ptw.rejectionReason}</div>
                        )}
                        {ptw.hazards.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {ptw.hazards.map(h => (
                              <span key={h} className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{h}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== TOOLBOX TAB ===== */}
            {activeTab === 'toolbox' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">工具箱會議記錄</h2>
                </div>

                {/* Add form */}
                {tbtSubmitted ? (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-green-800">工具箱會議已記錄</p>
                    </div>
                    <button onClick={() => setTbtSubmitted(false)} className="text-xs text-green-700 hover:underline">再記錄</button>
                  </div>
                ) : (
                  <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                    <h3 className="font-semibold text-orange-800 text-sm">新增工具箱會議</h3>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">會議主題 *</label>
                      <input value={tbtTopic} onChange={e => setTbtTopic(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                        placeholder="例：高空作業安全、PPE 正確使用" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">出席人員 (逗號分隔)</label>
                        <textarea value={tbtAttendees} onChange={e => setTbtAttendees(e.target.value)} rows={2}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                          placeholder="張三, 李四, 王五..." />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">時長 (分鐘)</label>
                        <input type="number" min={5} max={120} value={tbtDuration} onChange={e => setTbtDuration(Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">備注</label>
                      <textarea value={tbtNotes} onChange={e => setTbtNotes(e.target.value)} rows={2}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                        placeholder="其他備注..." />
                    </div>
                    <button onClick={handleAddTBT} disabled={!tbtTopic.trim()}
                      className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                      記錄會議
                    </button>
                  </div>
                )}

                {/* List */}
                {toolboxTalks.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">暫無工具箱會議記錄</div>
                ) : (
                  <div className="space-y-2">
                    {toolboxTalks.map(t => (
                      <div key={t.id} className="p-4 border border-gray-100 rounded-xl">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800">{t.topic}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                              <span>📅 {t.date}</span>
                              <span>👤 {t.conductedByName}</span>
                              <span>⏱ {t.duration} 分鐘</span>
                              <span>👥 {t.attendeeNames.length} 人出席</span>
                            </div>
                            {t.attendeeNames.length > 0 && (
                              <p className="text-xs text-gray-400 mt-1">出席：{t.attendeeNames.join(', ')}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== NEAR MISS TAB ===== */}
            {activeTab === 'nearmiss' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">近乎意外報告</h2>
                  {!showNmForm && (
                    <button onClick={() => { setShowNmForm(true); setNmSubmitted(false) }}
                      className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                      <Plus size={14} /> 提交報告
                    </button>
                  )}
                </div>

                {nmSubmitted && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle size={16} /> 報告已成功提交，安全主任將跟進。
                  </div>
                )}

                {showNmForm && (
                  <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                    <h3 className="font-semibold text-orange-800 text-sm">提交近乎意外報告</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">發生地點</label>
                        <select value={nmZone} onChange={e => setNmZone(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
                          {['Zone A','Zone B','Zone C','Zone D','Zone E','Zone F','Zone G','公共區域'].map(z => <option key={z}>{z}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">事故類別</label>
                        <select value={nmCategory} onChange={e => setNmCategory(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
                          {['高空墜物','滑倒絆倒','電氣危險','吊裝意外','機械危險','其他'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">事件描述 *</label>
                      <textarea value={nmDescription} onChange={e => setNmDescription(e.target.value)} rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                        placeholder="請描述事件經過，包括時間、涉及人員及環境..." />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="anon" checked={nmAnonymous} onChange={e => setNmAnonymous(e.target.checked)} className="rounded" />
                      <label htmlFor="anon" className="text-sm text-gray-600">匿名提交（不記錄提交人資料）</label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSubmitNM} disabled={!nmDescription.trim()}
                        className="bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        提交報告
                      </button>
                      <button onClick={() => setShowNmForm(false)}
                        className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-3 mb-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  🔒 所有報告可選擇匿名提交，保護舉報人身份。鼓勵如實記錄，防患於未然。
                </div>

                {nearMisses.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">暫無近乎意外報告</div>
                ) : (
                  <div className="space-y-2">
                    {nearMisses.map(nm => (
                      <div key={nm.id} className="p-4 border border-gray-100 rounded-xl">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{nm.category}</span>
                              {nm.anonymous && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">匿名</span>}
                            </div>
                            <p className="text-sm text-gray-700">{nm.description}</p>
                            <div className="flex gap-3 text-xs text-gray-400 mt-1">
                              <span>📍 {nm.zone}</span>
                              <span>📅 {nm.reportDate}</span>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 flex-shrink-0">新報告</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== STATS TAB ===== */}
            {activeTab === 'stats' && (
              <div className="space-y-6">
                <h2 className="font-semibold text-gray-800">安全統計分析</h2>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-700">{pendingCount}</p>
                    <p className="text-xs text-gray-600 mt-1">待審批 PTW</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-green-700">{activeCount}</p>
                    <p className="text-xs text-gray-600 mt-1">生效中 PTW</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-700">{ptwRequests.filter(p => p.status === 'completed').length}</p>
                    <p className="text-xs text-gray-600 mt-1">已完成 PTW</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-orange-700">{toolboxTalks.length}</p>
                    <p className="text-xs text-gray-600 mt-1">工具箱會議總計</p>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-5xl font-bold text-green-700">127</p>
                      <p className="text-sm text-green-600">連續無意外日數</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-green-800 mb-1">本項目安全表現</p>
                      <p className="text-sm text-green-700">過去12個月近乎意外報告共 {nearMisses.length} 宗。持續改善安全文化。</p>
                      <div className="flex gap-4 mt-2 text-xs text-green-600">
                        <span>✓ 連續 127 天無記錄意外</span>
                        <span>✓ PTW 合規率 97%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {ptwRequests.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">PTW 風險分佈</h3>
                    <div className="space-y-2">
                      {(['critical','high','medium','low'] as const).map(level => {
                        const count = ptwRequests.filter(p => p.riskLevel === level).length
                        const pct = ptwRequests.length ? Math.round((count / ptwRequests.length) * 100) : 0
                        return (
                          <div key={level} className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border w-20 text-center flex-shrink-0 ${RISK_STYLE[level]}`}>{RISK_ZH[level]}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${
                                level === 'critical' ? 'bg-red-500' : level === 'high' ? 'bg-orange-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-12 text-right">{count} 個 ({pct}%)</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Approve Modal */}
      {approveModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-1">批准工作許可</h3>
            <p className="text-xs text-gray-500 mb-4">
              {ptwRequests.find(p => p.id === approveModalId)?.ptwNo} — {ptwRequests.find(p => p.id === approveModalId)?.workType}
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">條件 (選填)</label>
              <textarea rows={3} value={approveConditions} onChange={e => setApproveConditions(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
                placeholder="例：須確保周界圍欄完整，配備滅火器..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setApproveModalId(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleApprove}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                <CheckCircle size={15} /> 批准
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-1">拒絕工作許可</h3>
            <p className="text-xs text-gray-500 mb-4">
              {ptwRequests.find(p => p.id === rejectModalId)?.ptwNo} — {ptwRequests.find(p => p.id === rejectModalId)?.workType}
            </p>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 mb-1 block">拒絕原因 *</label>
              <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none"
                placeholder="請填寫拒絕原因..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectModalId(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleReject} disabled={!rejectReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                <XCircle size={15} /> 拒絕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
