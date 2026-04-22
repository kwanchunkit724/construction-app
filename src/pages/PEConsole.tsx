import { useState, useRef } from 'react'
import {
  FileText, BookOpen, ListTodo, AlertCircle,
  Plus, ChevronRight, CheckCircle, Clock, XCircle,
  Upload, Eye, Cloud, Sun, CloudRain, Filter, ListTree, Camera, Send
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ProgressTracker from '../components/ProgressTracker'
import IssueBoard from '../components/IssueBoard'
import { dailyReports, drawings, tasks, issues } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useIssues } from '../context/IssueContext'
import { useProgress } from '../context/ProgressContext'

type Tab = 'reports' | 'drawings' | 'tasks' | 'issues' | 'progress'

const DISC_COLOR: Record<string, string> = {
  structural: 'bg-blue-100 text-blue-700',
  architectural: 'bg-purple-100 text-purple-700',
  mep: 'bg-orange-100 text-orange-700',
  civil: 'bg-green-100 text-green-700',
}
const DISC_ZH: Record<string, string> = {
  structural: '結構', architectural: '建築', mep: '機電', civil: '土木'
}
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-500',
}
const PRIORITY_ZH: Record<string, string> = {
  urgent: '緊急', high: '高', normal: '一般', low: '低'
}
const TASK_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  'in-progress': 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}
const TASK_STATUS_ZH: Record<string, string> = {
  pending: '待處理', 'in-progress': '進行中', done: '已完成', blocked: '受阻'
}

function WeatherIcon({ code }: { code: string }) {
  if (code === '☀️') return <Sun size={14} className="text-yellow-500" />
  if (code === '🌧️') return <CloudRain size={14} className="text-blue-500" />
  return <Cloud size={14} className="text-gray-400" />
}

function ReportStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
  }
  const zh: Record<string, string> = { pending: '待提交', submitted: '待審批', approved: '已批准' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>{zh[status]}</span>
}

function DrawingStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    current: 'bg-green-100 text-green-700',
    superseded: 'bg-gray-100 text-gray-500',
    'under-review': 'bg-yellow-100 text-yellow-700',
  }
  const zh: Record<string, string> = { current: '現行版', superseded: '已廢除', 'under-review': '審閱中' }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>{zh[status]}</span>
}

export default function PEConsole() {
  const { user } = useAuth()
  const { submitIssue, issues: allIssues } = useIssues()
  const { currentProjectId } = useProgress()

  const [activeTab, setActiveTab] = useState<Tab>('reports')
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [showNewReportForm, setShowNewReportForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reportStatuses, setReportStatuses] = useState<Record<string, string>>({})

  const getReportStatus = (id: string, fallback: string) => reportStatuses[id] || fallback

  // Issue form state
  const [issueCategory, setIssueCategory]       = useState('質量問題')
  const [issueSeverity, setIssueSeverity]       = useState<'normal'|'serious'|'urgent'>('normal')
  const [issueLocation, setIssueLocation]       = useState('Zone C')
  const [issueDrawingRef, setIssueDrawingRef]   = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issuePhotos, setIssuePhotos]           = useState<string[]>([])
  const [issueSubmitted, setIssueSubmitted]     = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const myIssues = allIssues.filter(i => i.submittedBy === user?.id)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        if (typeof ev.target?.result === 'string')
          setIssuePhotos(prev => [...prev, ev.target!.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleSubmitIssue = () => {
    if (!issueDescription.trim() && issuePhotos.length === 0) return
    submitIssue({
      projectId: currentProjectId,
      category: issueCategory,
      severity: issueSeverity,
      location: issueLocation,
      drawingRef: issueDrawingRef,
      description: issueDescription.trim() || `【${issueCategory}】現場照片記錄`,
      submittedBy: user?.id ?? '',
      submittedByName: user?.name ?? '',
      submittedByRole: user?.role ?? 'pe',
      notifyIds: [],
      photos: issuePhotos,
    })
    setIssueDescription('')
    setIssueDrawingRef('')
    setIssuePhotos([])
    setIssueSeverity('normal')
    setIssueSubmitted(true)
  }

  const report = dailyReports.find(r => r.id === selectedReport)

  const tabs = [
    { id: 'reports'  as Tab, label: '施工日報', icon: FileText,  count: dailyReports.filter(r => r.status === 'submitted').length },
    { id: 'drawings' as Tab, label: '圖則管理', icon: BookOpen,  count: drawings.filter(d => d.status === 'under-review').length },
    { id: 'tasks'    as Tab, label: '工序安排', icon: ListTodo,  count: tasks.filter(t => t.status !== 'done').length },
    { id: 'progress' as Tab, label: '進度追蹤', icon: ListTree,  count: 0 },
    { id: 'issues'   as Tab, label: '問題追蹤', icon: AlertCircle, count: issues.filter(i => i.status === 'open').length },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar accentColor="bg-emerald-700" bgColor="bg-emerald-800" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSelectedReport(null); setShowNewReportForm(false) }}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="p-5">
            {/* ===== REPORTS TAB ===== */}
            {activeTab === 'reports' && !selectedReport && !showNewReportForm && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">施工日報列表</h2>
                  <button
                    onClick={() => setShowNewReportForm(true)}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={15} /> 新增日報
                  </button>
                </div>
                <div className="space-y-2">
                  {dailyReports.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedReport(r.id)}
                      className="flex items-center gap-4 p-3.5 border border-gray-100 rounded-xl hover:border-emerald-200 hover:bg-emerald-50 cursor-pointer transition-colors group"
                    >
                      <div className="text-center min-w-[50px]">
                        <p className="text-xs text-gray-400">{r.date.slice(5)}</p>
                        <WeatherIcon code={r.weatherCode} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-gray-800 text-sm">{r.zone}</p>
                          <ReportStatusBadge status={r.status} />
                        </div>
                        <p className="text-xs text-gray-500 truncate">{r.summary}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Users size={12} />{r.manpower}人</span>
                        {r.issues > 0 && <span className="text-orange-500">⚠ {r.issues}</span>}
                        <ChevronRight size={15} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report Detail */}
            {activeTab === 'reports' && selectedReport && report && (
              <div>
                <button onClick={() => setSelectedReport(null)} className="text-sm text-emerald-600 hover:text-emerald-800 mb-4 flex items-center gap-1">
                  ← 返回列表
                </button>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{report.id} — {report.zone}</h3>
                      <p className="text-gray-500 text-sm">{report.date} | 負責人：{report.author}</p>
                    </div>
                    <ReportStatusBadge status={report.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                      <p className="text-2xl font-bold text-gray-900">{report.manpower}</p>
                      <p className="text-xs text-gray-400">出勤人數</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                      <WeatherIcon code={report.weatherCode} />
                      <p className="text-xs text-gray-400 mt-1">天氣</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                      <p className={`text-2xl font-bold ${report.issues > 0 ? 'text-orange-500' : 'text-green-600'}`}>{report.issues}</p>
                      <p className="text-xs text-gray-400">問題記錄</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 mb-2">施工摘要</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{report.summary}</p>
                  </div>
                  {getReportStatus(report.id, report.status) === 'submitted' && (
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => setReportStatuses(prev => ({ ...prev, [report.id]: 'approved' }))}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                        <CheckCircle size={15} /> 批准
                      </button>
                      <button
                        onClick={() => setReportStatuses(prev => ({ ...prev, [report.id]: 'pending' }))}
                        className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                        <XCircle size={15} /> 退回
                      </button>
                    </div>
                  )}
                  {getReportStatus(report.id, report.status) === 'approved' && (
                    <div className="flex items-center gap-2 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                      <CheckCircle size={16} className="flex-shrink-0" /> 已批准
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* New Report Form */}
            {activeTab === 'reports' && showNewReportForm && (
              <div>
                <button onClick={() => { setShowNewReportForm(false); setSubmitted(false) }} className="text-sm text-emerald-600 hover:text-emerald-800 mb-4 flex items-center gap-1">
                  ← 返回列表
                </button>
                {submitted ? (
                  <div className="text-center py-12">
                    <CheckCircle size={48} className="text-emerald-500 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900 text-lg">日報已成功提交</h3>
                    <p className="text-gray-500 text-sm mt-1">待項目總監審批</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <h3 className="font-bold text-gray-800">新增施工日報 — {new Date().toISOString().slice(0, 10)}</h3>
                    {[
                      { label: '施工區域', type: 'select', options: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E', 'Zone F', 'Zone G', 'Zone H'] },
                      { label: '出勤人數', type: 'number' },
                      { label: '天氣狀況', type: 'select', options: ['晴天', '多雲', '雨天', '大風'] },
                    ].map((field) => (
                      <div key={field.label}>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">{field.label}</label>
                        {field.type === 'select' ? (
                          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400">
                            {field.options!.map(o => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={field.type} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                        )}
                      </div>
                    ))}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">施工摘要</label>
                      <textarea rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 resize-none" placeholder="描述今日施工進展..." />
                    </div>
                    <button onClick={() => setSubmitted(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
                      提交日報
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===== DRAWINGS TAB ===== */}
            {activeTab === 'drawings' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">圖則版本管理</h2>
                  <button className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                    <Upload size={15} /> 上載新版
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 font-medium pr-3">圖則編號</th>
                        <th className="pb-2 font-medium pr-3">標題</th>
                        <th className="pb-2 font-medium pr-3">版本</th>
                        <th className="pb-2 font-medium pr-3">專業</th>
                        <th className="pb-2 font-medium pr-3">上載日期</th>
                        <th className="pb-2 font-medium pr-3">狀態</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawings.map((d) => (
                        <tr key={d.id} className={`border-b border-gray-50 hover:bg-gray-50 ${d.status === 'superseded' ? 'opacity-50' : ''}`}>
                          <td className="py-2.5 pr-3 font-mono text-xs text-gray-500">{d.drawingNo}</td>
                          <td className="py-2.5 pr-3 text-gray-800 font-medium max-w-[200px] truncate">{d.title}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${d.status === 'current' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                              {d.revision}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full ${DISC_COLOR[d.discipline]}`}>{DISC_ZH[d.discipline]}</span></td>
                          <td className="py-2.5 pr-3 text-xs text-gray-400">{d.uploadDate}</td>
                          <td className="py-2.5 pr-3"><DrawingStatusBadge status={d.status} /></td>
                          <td className="py-2.5">
                            <button className="text-gray-400 hover:text-emerald-600 transition-colors"><Eye size={15} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>提示：工頭和工人只能查看「現行版」圖則，廢除版本會自動鎖定，防止誤用舊圖。</span>
                </div>
              </div>
            )}

            {/* ===== TASKS TAB ===== */}
            {activeTab === 'tasks' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">工序任務</h2>
                  <button className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                    <Plus size={15} /> 指派任務
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="p-4 border border-gray-100 rounded-xl hover:border-emerald-200 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`w-1 h-full min-h-[40px] rounded-full flex-shrink-0 ${
                          t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : t.priority === 'normal' ? 'bg-blue-500' : 'bg-gray-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-800 text-sm">{t.title}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[t.priority]}`}>{PRIORITY_ZH[t.priority]}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_STATUS_STYLE[t.status]}`}>{TASK_STATUS_ZH[t.status]}</span>
                          </div>
                          <p className="text-xs text-gray-500 mb-1">{t.description}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                            <span>📍 {t.zone}</span>
                            <span>👷 {t.assignee}</span>
                            <span className={t.dueDate <= '2026-04-14' && t.status !== 'done' ? 'text-red-500 font-medium' : ''}>
                              📅 {t.dueDate}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== PROGRESS TAB ===== */}
            {activeTab === 'progress' && (
              <div>
                <div className="mb-4">
                  <h2 className="font-semibold text-gray-800">進度追蹤</h2>
                  <p className="text-xs text-gray-400 mt-0.5">查看及更新你負責的工序進度；可委派細項給判頭打理</p>
                </div>
                <ProgressTracker />
              </div>
            )}

            {/* ===== ISSUES TAB ===== */}
            {activeTab === 'issues' && (
              <div>
                {/* Incoming issues from sub-supervisors/workers escalated to foreman-PE */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-800 mb-1">問題追蹤</h2>
                  <p className="text-xs text-gray-400 mb-4">以下為上報至工頭/工程師層級的問題，可標記解決或再上報至總監</p>
                  <IssueBoard />
                </div>

                {/* Submit new issue to PM */}
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1">上報問題至總監</h3>
                  <p className="text-xs text-gray-400 mb-4">所上報問題將直接發送至項目總監層級</p>

                  {/* My submitted issues */}
                  {myIssues.length > 0 && (
                    <div className="mb-5 space-y-2">
                      <p className="text-xs font-semibold text-gray-500">我已上報至總監 ({myIssues.length} 項)</p>
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
                            {i.comments.length > 0 && <span className="text-emerald-600">{i.comments.length} 則回覆</span>}
                          </div>
                          <p className="font-semibold text-gray-700">{i.category} — {i.location}</p>
                          <p className="text-gray-500 truncate">{i.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {issueSubmitted ? (
                    <div className="text-center py-10">
                      <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                      <h3 className="font-bold text-gray-900">問題已成功上報</h3>
                      <p className="text-gray-500 text-sm mt-1">項目總監已收到通知，會盡快跟進。</p>
                      <button onClick={() => setIssueSubmitted(false)} className="mt-4 text-emerald-600 text-sm hover:underline">
                        再次上報
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 max-w-lg">
                      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">問題類別</label>
                          <select value={issueCategory} onChange={e => setIssueCategory(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400">
                            {['質量問題','安全隱患','物料不足','圖則不符','機械故障','其他'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">發生地點</label>
                          <select value={issueLocation} onChange={e => setIssueLocation(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400">
                            {['Zone C','Zone D','Zone E','Zone F','Zone G','其他'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">嚴重程度</label>
                        <div className="grid grid-cols-3 gap-2">
                          {([['normal','一般'],['serious','較嚴重'],['urgent','緊急']] as const).map(([v,l]) => (
                            <button key={v} onClick={() => setIssueSeverity(v)}
                              className={`py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                                issueSeverity === v
                                  ? v === 'urgent'  ? 'border-red-500 bg-red-50 text-red-700'
                                  : v === 'serious' ? 'border-orange-500 bg-orange-50 text-orange-700'
                                  :                   'border-gray-400 bg-gray-100 text-gray-700'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}>{l}</button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">相關圖則 (選填)</label>
                        <input type="text" value={issueDrawingRef} onChange={e => setIssueDrawingRef(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400"
                          placeholder="例：STR-C-28-001 Rev.C" />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">問題描述 *</label>
                        <textarea rows={3} value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 resize-none"
                          placeholder="請詳細描述問題情況..." />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5 block">
                          <Camera size={14} /> 現場照片
                        </label>
                        <button type="button" onClick={() => photoInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 text-center text-gray-400 text-sm hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                          <Camera size={22} className="mx-auto mb-1 text-gray-300" />
                          {issuePhotos.length > 0 ? `已選 ${issuePhotos.length} 張` : '拍照或上載圖片'}
                        </button>
                        {issuePhotos.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            {issuePhotos.map((src, idx) => (
                              <div key={idx} className="relative aspect-square">
                                <img src={src} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                                <button onClick={() => setIssuePhotos(prev => prev.filter((_,i) => i !== idx))}
                                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleSubmitIssue}
                        disabled={!issueDescription.trim() && issuePhotos.length === 0}
                        className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Send size={15} /> 提交上報至總監
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

// Missing import for Users icon
function Users({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  )
}
