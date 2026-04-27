import { useState, useRef, useEffect } from 'react'
import {
  ClipboardList, Users, Package, AlertTriangle,
  CheckCircle, Clock, XCircle, Plus, ChevronRight,
  QrCode, Send, PhoneCall, ListTree, Shield, FileText
} from 'lucide-react'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import ProgressTracker from '../components/ProgressTracker'
import IssueBoard from '../components/IssueBoard'
import { tasks, workers, materials, notifications } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useIssues } from '../context/IssueContext'
import { useProgress } from '../context/ProgressContext'
import { useSafety } from '../context/SafetyContext'
import { useDiary } from '../context/DiaryContext'
import { useProcurement } from '../context/ProcurementContext'
import type { PTWRequest } from '../types'

type Tab = 'tasks' | 'attendance' | 'materials' | 'progress' | 'issues' | 'ptw' | 'diary'

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  normal: 'border-l-blue-400',
  low: 'border-l-gray-300',
}
const PRIORITY_BG: Record<string, string> = {
  urgent: 'bg-red-50',
  high: 'bg-orange-50',
  normal: 'bg-blue-50',
  low: 'bg-gray-50',
}
const PRIORITY_ZH: Record<string, string> = {
  urgent: '🔴 緊急', high: '🟠 高', normal: '🔵 一般', low: '⚪ 低'
}
const TASK_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  'in-progress': 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}
const TASK_STATUS_ZH: Record<string, string> = {
  pending: '待開始', 'in-progress': '進行中', done: '已完成', blocked: '受阻'
}
const MAT_STATUS: Record<string, { style: string; zh: string }> = {
  sufficient: { style: 'bg-green-100 text-green-700', zh: '充足' },
  low: { style: 'bg-orange-100 text-orange-700', zh: '偏低' },
  critical: { style: 'bg-red-100 text-red-700', zh: '告急' },
}
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
const MR_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  ordered: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const MR_STATUS_ZH: Record<string, string> = {
  pending: '待審批', approved: '已批准', ordered: '已訂購', delivered: '已到貨', rejected: '已拒絕'
}

function AttendanceAvatar({ worker }: { worker: typeof workers[0] }) {
  const initials = worker.name.slice(0, 1)
  return (
    <div className="flex flex-col items-center gap-1 w-16">
      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${worker.checkedIn ? 'bg-green-500' : 'bg-gray-300'}`}>
        {initials}
        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${worker.checkedIn ? 'bg-green-400' : 'bg-gray-400'}`} />
      </div>
      <span className="text-xs text-gray-600 text-center leading-tight truncate w-full text-center">{worker.name}</span>
      {worker.checkedIn
        ? <span className="text-[10px] text-green-600">{worker.checkInTime}</span>
        : <span className="text-[10px] text-gray-400">未打卡</span>}
    </div>
  )
}

export default function ForemanApp() {
  const { user } = useAuth()
  const { submitIssue, issues } = useIssues()
  const { currentProjectId } = useProgress()
  const { ptwRequests, submitPTW } = useSafety()
  const { diaries, submitDiary } = useDiary()
  const { requests: materialRequests, submitRequest } = useProcurement()

  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({})
  const [showQR, setShowQR] = useState(false)

  // Sub-supervisor list for issue assignment
  const [subSups, setSubSups] = useState<{id:string;name:string;company:string}[]>([])
  useEffect(() => {
    supabase.from('profiles').select('id,name,company').eq('role','sub-supervisor')
      .then(({ data }) => { if (data) setSubSups(data) })
  }, [])
  const [issueAssignTo, setIssueAssignTo] = useState('')

  // Issue form state
  const [issueCategory, setIssueCategory]     = useState('質量問題')
  const [issueSeverity, setIssueSeverity]     = useState<'normal'|'serious'|'urgent'>('normal')
  const [issueLocation, setIssueLocation]     = useState('Zone C')
  const [issueTask, setIssueTask]             = useState('')
  const [issueDescription, setIssueDescription] = useState('')
  const [issuePhotos, setIssuePhotos]         = useState<string[]>([])
  const [issueSubmitted, setIssueSubmitted]   = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // PTW form state
  const [ptwWorkType, setPtwWorkType]     = useState('高空作業')
  const [ptwLocation, setPtwLocation]     = useState('')
  const [ptwZone, setPtwZone]             = useState('Zone A')
  const [ptwDescription, setPtwDescription] = useState('')
  const [ptwHazards, setPtwHazards]       = useState('')
  const [ptwStartTime, setPtwStartTime]   = useState('')
  const [ptwEndTime, setPtwEndTime]       = useState('')
  const [ptwRiskLevel, setPtwRiskLevel]   = useState<PTWRequest['riskLevel']>('medium')
  const [ptwSubmitted, setPtwSubmitted]   = useState(false)

  // Diary form state
  const today = new Date().toISOString().slice(0, 10)
  const [diaryDate, setDiaryDate]         = useState(today)
  const [diaryZone, setDiaryZone]         = useState('Zone C')
  const [diaryWeather, setDiaryWeather]   = useState<'sunny'|'cloudy'|'rainy'|'stormy'>('sunny')
  const [diaryTemp, setDiaryTemp]         = useState(26)
  const [diaryManpower, setDiaryManpower] = useState(0)
  const [diaryEquipment, setDiaryEquipment] = useState('')
  const [diaryWorkDone, setDiaryWorkDone] = useState('')
  const [diaryIssues, setDiaryIssues]     = useState('')
  const [diarySubmitted, setDiarySubmitted] = useState(false)

  const myIssues = issues.filter(i => i.submittedBy === user?.id)
  const myPTWs = ptwRequests.filter(p => p.requestedBy === user?.id)
  const myDiaries = diaries.filter(d => d.authorId === user?.id)
  const myMRs = materialRequests.filter(r => r.requestedBy === user?.id)

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
    const assignedSup = subSups.find(s => s.id === issueAssignTo)
    submitIssue({
      projectId: currentProjectId,
      category: issueCategory,
      severity: issueSeverity,
      location: issueLocation,
      drawingRef: issueTask,
      description: issueDescription.trim() || `【${issueCategory}】現場照片記錄`,
      submittedBy: user?.id ?? '',
      submittedByName: user?.name ?? '',
      submittedByRole: user?.role ?? 'foreman',
      notifyIds: [],
      photos: issuePhotos,
      assignedToId: assignedSup?.id,
      assignedToName: assignedSup?.name,
    })
    setIssueDescription('')
    setIssuePhotos([])
    setIssueTask('')
    setIssueSeverity('normal')
    setIssueAssignTo('')
    setIssueSubmitted(true)
  }

  const handleSubmitPTW = () => {
    if (!ptwLocation.trim() || !ptwDescription.trim() || !ptwStartTime || !ptwEndTime || !user) return
    submitPTW({
      projectId: currentProjectId,
      workType: ptwWorkType,
      location: ptwLocation.trim(),
      zone: ptwZone,
      description: ptwDescription.trim(),
      hazards: ptwHazards.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      requiredPPE: [],
      requestedBy: user.id,
      requestedByName: user.name,
      startTime: ptwStartTime,
      endTime: ptwEndTime,
      riskLevel: ptwRiskLevel,
    })
    setPtwLocation(''); setPtwDescription(''); setPtwHazards('')
    setPtwStartTime(''); setPtwEndTime('')
    setPtwSubmitted(true)
  }

  const handleSubmitDiary = () => {
    if (!diaryWorkDone.trim() || !user) return
    submitDiary({
      projectId: currentProjectId,
      date: diaryDate,
      authorId: user.id,
      authorName: user.name,
      zone: diaryZone,
      weather: diaryWeather,
      temperature: diaryTemp,
      manpowerTotal: diaryManpower,
      equipment: diaryEquipment.trim(),
      workDone: diaryWorkDone.trim(),
      issues: diaryIssues.trim(),
    })
    setDiaryWorkDone(''); setDiaryEquipment(''); setDiaryIssues('')
    setDiarySubmitted(true)
  }

  const myTasks = tasks.filter(t => t.assignee === '麥工頭' || t.zone === 'Zone D' || t.zone === 'Zone C')
  const checkedInCount = workers.filter(w => w.checkedIn).length
  const totalWorkers = workers.length

  const getTaskStatus = (task: typeof tasks[0]) => taskStatuses[task.id] || task.status

  const [localMaterialRequests, setLocalMaterialRequests] = useState<Record<string, boolean>>({})
  const [showReportForm, setShowReportForm] = useState(false)

  const tabs = [
    { id: 'tasks' as Tab, label: '今日工序', icon: ClipboardList, count: myTasks.filter(t => getTaskStatus(t) !== 'done').length },
    { id: 'attendance' as Tab, label: '出勤管理', icon: Users, count: totalWorkers - checkedInCount },
    { id: 'materials' as Tab, label: '物料申請', icon: Package, count: materials.filter(m => m.status !== 'sufficient').length },
    { id: 'progress' as Tab, label: '進度追蹤', icon: ListTree, count: 0 },
    { id: 'issues' as Tab, label: '問題&上報', icon: AlertTriangle, count: myIssues.filter(i => i.status === 'open').length },
    { id: 'ptw' as Tab, label: 'PTW申請', icon: Shield, count: myPTWs.filter(p => p.status === 'pending').length },
    { id: 'diary' as Tab, label: '施工日誌', icon: FileText, count: 0 },
  ]

  return (
    <div className="min-h-screen bg-amber-50">
      <Navbar accentColor="bg-amber-600" bgColor="bg-amber-700" />

      <main className="max-w-4xl mx-auto px-4 py-5">
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-amber-100 p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-amber-700">{myTasks.filter(t => getTaskStatus(t) !== 'done').length}</p>
            <p className="text-xs text-gray-500">待完成工序</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-100 p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">{checkedInCount}</p>
            <p className="text-xs text-gray-500">已打卡 / {totalWorkers}人</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-100 p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-red-500">{materials.filter(m => m.status === 'critical').length}</p>
            <p className="text-xs text-gray-500">物料告急</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="grid grid-flow-col auto-cols-fr border-b border-gray-100">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-4 py-2 sm:py-3.5 text-[10px] sm:text-sm font-medium border-b-2 transition-colors flex-1 ${
                    isActive ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="leading-tight text-center">{tab.label}</span>
                  {tab.count > 0 && (
                    <span className={`absolute top-0.5 right-0.5 text-[9px] px-1 rounded-full font-bold ${isActive ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== TASKS ===== */}
            {activeTab === 'tasks' && (
              <div>
                <h2 className="font-bold text-gray-800 mb-4">今日工序安排</h2>
                <div className="space-y-3">
                  {myTasks.map((task) => {
                    const status = getTaskStatus(task)
                    return (
                      <div key={task.id} className={`border-l-4 ${PRIORITY_COLOR[task.priority]} ${PRIORITY_BG[task.priority]} rounded-r-xl p-4`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs text-gray-500">{PRIORITY_ZH[task.priority]}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_STATUS_STYLE[status]}`}>
                                {TASK_STATUS_ZH[status]}
                              </span>
                            </div>
                            <p className="font-bold text-gray-900">{task.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
                          <span>📍 {task.zone}</span>
                          <span className={task.dueDate <= '2026-04-14' && status !== 'done' ? 'text-red-600 font-semibold' : ''}>
                            📅 {task.dueDate}
                          </span>
                        </div>
                        {status !== 'done' && (
                          <div className="flex gap-2">
                            {status !== 'in-progress' && (
                              <button onClick={() => setTaskStatuses(prev => ({ ...prev, [task.id]: 'in-progress' }))}
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                                開始工作
                              </button>
                            )}
                            <button onClick={() => setTaskStatuses(prev => ({ ...prev, [task.id]: 'done' }))}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                              <CheckCircle size={12} /> 標記完成
                            </button>
                            <button onClick={() => setTaskStatuses(prev => ({ ...prev, [task.id]: 'blocked' }))}
                              className="text-xs border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                              <XCircle size={12} /> 受阻
                            </button>
                          </div>
                        )}
                        {status === 'done' && (
                          <div className="flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                            <CheckCircle size={14} /> 已完成
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ===== ATTENDANCE ===== */}
            {activeTab === 'attendance' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-gray-800">出勤管理</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      已打卡 {checkedInCount} / {totalWorkers} 人 —
                      <span className="text-red-500 ml-1">{totalWorkers - checkedInCount} 人未打卡</span>
                    </p>
                  </div>
                  <button onClick={() => setShowQR(!showQR)}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                    <QrCode size={15} /> QR 打卡
                  </button>
                </div>

                {showQR && (
                  <div className="mb-4 bg-gray-900 rounded-xl p-6 text-center">
                    <div className="inline-block bg-white p-3 rounded-lg mb-2">
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        <rect width="100" height="100" fill="white"/>
                        <rect x="8" y="8" width="34" height="34" fill="none" stroke="#000" strokeWidth="3"/>
                        <rect x="14" y="14" width="22" height="22" fill="#000"/>
                        <rect x="18" y="18" width="14" height="14" fill="white"/>
                        <rect x="58" y="8" width="34" height="34" fill="none" stroke="#000" strokeWidth="3"/>
                        <rect x="64" y="14" width="22" height="22" fill="#000"/>
                        <rect x="68" y="18" width="14" height="14" fill="white"/>
                        <rect x="8" y="58" width="34" height="34" fill="none" stroke="#000" strokeWidth="3"/>
                        <rect x="14" y="64" width="22" height="22" fill="#000"/>
                        <rect x="18" y="68" width="14" height="14" fill="white"/>
                      </svg>
                    </div>
                    <p className="text-white font-bold">今日出勤打卡</p>
                    <p className="text-gray-400 text-xs mt-1">工人掃描此 QR Code 完成打卡</p>
                  </div>
                )}

                {workers.filter(w => !w.checkedIn).length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    ⚠ 以下工人未打卡：{workers.filter(w => !w.checkedIn).map(w => w.name).join('、')}
                  </div>
                )}

                <div className="flex flex-wrap gap-4">
                  {workers.map(w => <AttendanceAvatar key={w.id} worker={w} />)}
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">各區域人數</h3>
                  <div className="space-y-2">
                    {['Zone C', 'Zone D', 'Zone E', 'Zone F', 'Zone G'].map(zone => {
                      const inZone = workers.filter(w => w.zone === zone)
                      const checked = inZone.filter(w => w.checkedIn).length
                      return (
                        <div key={zone} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-16">{zone}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all"
                              style={{ width: inZone.length ? `${(checked / inZone.length) * 100}%` : '0%' }} />
                          </div>
                          <span className="text-xs text-gray-500 w-12 text-right">{checked}/{inZone.length} 人</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ===== MATERIALS ===== */}
            {activeTab === 'materials' && (
              <div>
                <h2 className="font-bold text-gray-800 mb-4">物料庫存及申請</h2>
                {myMRs.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 mb-2">我的物料申請狀態</p>
                    <div className="space-y-1">
                      {myMRs.map(mr => (
                        <div key={mr.id} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-gray-500">{mr.requestNo}</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${MR_STATUS_STYLE[mr.status]}`}>{MR_STATUS_ZH[mr.status]}</span>
                          <span className="text-gray-500 truncate">{mr.items[0]?.material}{mr.items.length > 1 ? ` +${mr.items.length - 1}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {materials.map(mat => (
                    <div key={mat.id} className={`p-4 rounded-xl border ${mat.status === 'critical' ? 'border-red-200 bg-red-50' : mat.status === 'low' ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-800 text-sm">{mat.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MAT_STATUS[mat.status].style}`}>{MAT_STATUS[mat.status].zh}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                            <span>庫存: <strong>{mat.onHand} {mat.unit}</strong></span>
                            <span>所需: {mat.required} {mat.unit}</span>
                            {mat.ordered > 0 && <span className="text-blue-600">已訂: {mat.ordered} {mat.unit}</span>}
                          </div>
                          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${mat.status === 'critical' ? 'bg-red-500' : mat.status === 'low' ? 'bg-orange-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, (mat.onHand / mat.required) * 100)}%` }} />
                          </div>
                        </div>
                        {mat.status !== 'sufficient' && (
                          <button
                            disabled={!!localMaterialRequests[mat.id]}
                            onClick={() => {
                              if (localMaterialRequests[mat.id] || !user) return
                              submitRequest({
                                projectId: currentProjectId,
                                requestedBy: user.id,
                                requestedByName: user.name,
                                requestedByRole: user.role,
                                zone: diaryZone,
                                items: [{ material: mat.name, unit: mat.unit, quantity: mat.required - mat.onHand, urgency: mat.status === 'critical' ? 'urgent' : 'normal' }],
                                notes: `庫存不足自動申請：${mat.name}`,
                              })
                              setLocalMaterialRequests(prev => ({ ...prev, [mat.id]: true }))
                            }}
                            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                              localMaterialRequests[mat.id] ? 'bg-green-100 text-green-700 cursor-default' : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}>
                            {localMaterialRequests[mat.id] ? '✓ 已申請' : '申請補料'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  💡 提示：物料申請需工程師審批，緊急情況請直接聯絡工程師。
                </div>
              </div>
            )}


            {/* ===== PROGRESS TRACKER ===== */}
            {activeTab === 'progress' && (
              <div>
                <div className="mb-4">
                  <h2 className="font-bold text-gray-800">進度追蹤</h2>
                  <p className="text-xs text-gray-400 mt-0.5">查看及更新你負責的工序進度；可委派細項給判頭打理</p>
                </div>
                <ProgressTracker />
              </div>
            )}

            {/* ===== ISSUES + REPORT (merged) ===== */}
            {activeTab === 'issues' && (
              <div>
                {/* Issue board */}
                <div className="mb-6 pb-6 border-b border-gray-200">
                  <h2 className="font-bold text-gray-800 mb-1">問題追蹤</h2>
                  <p className="text-xs text-gray-400 mb-4">以下為上報至工頭/工程師層級的問題，可標記解決或再上報至總監</p>
                  <IssueBoard />
                </div>

                {/* My reports to PM */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-700">我已上報至總監</h3>
                    <button onClick={() => setShowReportForm(v => !v)}
                      className="text-xs text-amber-600 hover:underline flex items-center gap-1">
                      <Plus size={12} /> {showReportForm ? '收起' : '新增上報'}
                    </button>
                  </div>
                  {myIssues.length === 0 && !showReportForm ? (
                    <p className="text-xs text-gray-400 py-3">暫無上報記錄</p>
                  ) : (
                    <div className="space-y-2">
                      {myIssues.map(i => (
                        <div key={i.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50 text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              i.status === 'open' ? 'bg-blue-100 text-blue-700' :
                              i.status === 'in-progress' ? 'bg-yellow-100 text-yellow-700' :
                              i.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {i.status === 'open' ? '待處理' : i.status === 'in-progress' ? '處理中' : i.status === 'resolved' ? '已解決' : '已關閉'}
                            </span>
                            <span className="text-gray-400">{i.submittedAt.slice(0, 16).replace('T', ' ')}</span>
                            {i.comments.length > 0 && <span className="text-amber-600">{i.comments.length} 則回覆</span>}
                          </div>
                          <p className="font-semibold text-gray-700">{i.category} — {i.location}</p>
                          <p className="text-gray-500 truncate">{i.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inline report form */}
                {showReportForm && (
                  <div className="max-w-lg border-t border-gray-200 pt-5">
                    <h3 className="font-bold text-gray-800 mb-1">上報問題至總監</h3>
                    <p className="text-xs text-gray-400 mb-3">所上報問題將直接發送至項目總監層級</p>
                    {issueSubmitted ? (
                      <div className="text-center py-8">
                        <CheckCircle size={44} className="text-green-500 mx-auto mb-3" />
                        <h3 className="font-bold text-gray-900">問題已成功上報</h3>
                        <p className="text-gray-500 text-sm mt-1">項目總監已收到通知，會盡快跟進。</p>
                        <button onClick={() => { setIssueSubmitted(false); setShowReportForm(false) }}
                          className="mt-4 text-amber-600 text-sm hover:underline">關閉</button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">問題類別</label>
                            <select value={issueCategory} onChange={e => setIssueCategory(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
                              {['質量問題','安全隱患','物料不足','圖則不符','機械故障','其他'].map(o => <option key={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">發生地點</label>
                            <select value={issueLocation} onChange={e => setIssueLocation(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
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
                                    ? v === 'urgent' ? 'border-red-500 bg-red-50 text-red-700'
                                    : v === 'serious' ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-gray-400 bg-gray-100 text-gray-700'
                                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                }`}>{l}</button>
                            ))}
                          </div>
                        </div>
                        {subSups.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">指派判頭（選填）</label>
                            <select value={issueAssignTo} onChange={e => setIssueAssignTo(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
                              <option value="">不指派 / 視情況處理</option>
                              {subSups.map(s => (
                                <option key={s.id} value={s.id}>{s.name}（{s.company}）</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="text-sm font-medium text-gray-700 mb-1 block">問題描述 *</label>
                          <textarea rows={3} value={issueDescription} onChange={e => setIssueDescription(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                            placeholder="請描述問題詳情..." />
                        </div>
                        <div className="flex gap-3">
                          <button onClick={handleSubmitIssue}
                            disabled={!issueDescription.trim() && issuePhotos.length === 0}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                            <Send size={15} /> 提交上報至總監
                          </button>
                          <a href="tel:12345678"
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-colors">
                            <PhoneCall size={15} /> 緊急
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ===== PTW TAB ===== */}
            {activeTab === 'ptw' && (
              <div>
                <h2 className="font-bold text-gray-800 mb-3">工作許可 (PTW) 申請</h2>

                <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <p className="font-semibold mb-1">📋 如何申請 PTW？</p>
                  <p>填寫以下表格以申請進行高風險工序（如高空作業、電氣工作等）。提交後由安全主任審批，<strong>批准後方可開始工作</strong>。</p>
                </div>

                {ptwSubmitted ? (
                  <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">PTW 申請已提交</p>
                      <p className="text-xs text-green-700">安全主任將盡快審批，請等候通知。</p>
                    </div>
                    <button onClick={() => setPtwSubmitted(false)} className="ml-auto text-xs text-green-700 hover:underline">再申請</button>
                  </div>
                ) : (
                  <div className="max-w-lg space-y-3 mb-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">工作類型</label>
                        <select value={ptwWorkType} onChange={e => setPtwWorkType(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
                          {['高空作業','電氣工作','熱工作 (焊接/切割)','密閉空間','吊裝工作','爆破工作','挖掘工作','其他'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">作業區域</label>
                        <select value={ptwZone} onChange={e => setPtwZone(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
                          {['Zone A','Zone B','Zone C','Zone D','Zone E','Zone F','Zone G'].map(z => <option key={z}>{z}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">確切地點 *</label>
                      <input value={ptwLocation} onChange={e => setPtwLocation(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                        placeholder="例：Zone C 28-30/F 樓板" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">工作描述 *</label>
                      <textarea rows={3} value={ptwDescription} onChange={e => setPtwDescription(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                        placeholder="描述需要進行的工作..." />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">已識別危害 (逗號分隔)</label>
                      <input value={ptwHazards} onChange={e => setPtwHazards(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                        placeholder="例：高空墜落, 物件墜落, 電氣危險" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">開始時間 *</label>
                        <input type="datetime-local" value={ptwStartTime} onChange={e => setPtwStartTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">結束時間 *</label>
                        <input type="datetime-local" value={ptwEndTime} onChange={e => setPtwEndTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">風險等級</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['low','medium','high','critical'] as const).map(r => (
                          <button key={r} onClick={() => setPtwRiskLevel(r)}
                            className={`py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                              ptwRiskLevel === r
                                ? r === 'critical' ? 'border-red-600 bg-red-50 text-red-700'
                                : r === 'high' ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : r === 'medium' ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                                : 'border-green-500 bg-green-50 text-green-700'
                                : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            }`}>
                            {r === 'critical' ? '極高' : r === 'high' ? '高' : r === 'medium' ? '中' : '低'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleSubmitPTW}
                      disabled={!ptwLocation.trim() || !ptwDescription.trim() || !ptwStartTime || !ptwEndTime}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                      提交 PTW 申請
                    </button>
                  </div>
                )}

                {/* My PTW list */}
                {myPTWs.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3">我的 PTW 申請</h3>
                    <div className="space-y-2">
                      {myPTWs.map(ptw => (
                        <div key={ptw.id} className={`p-3 border rounded-xl text-xs ${
                          ptw.status === 'approved' ? 'border-green-300 bg-green-50' :
                          ptw.status === 'active'   ? 'border-blue-300 bg-blue-50' :
                          ptw.status === 'rejected' ? 'border-red-200 bg-red-50' :
                          'border-gray-100'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-gray-500">{ptw.ptwNo}</span>
                            <span className={`px-2 py-0.5 rounded-full font-medium ${PTW_STATUS_STYLE[ptw.status]}`}>{PTW_STATUS_ZH[ptw.status]}</span>
                            {ptw.status === 'approved' && <span className="text-green-700 font-semibold">✅ 可開始工作</span>}
                            {ptw.status === 'active' && <span className="text-blue-700 font-semibold">🔵 工作進行中</span>}
                          </div>
                          <p className="font-semibold text-gray-700">{ptw.workType} — {ptw.location}</p>
                          {ptw.rejectionReason && <p className="text-red-600 mt-1">拒絕原因：{ptw.rejectionReason}</p>}
                          {ptw.conditions && <p className="text-blue-600 mt-1">條件：{ptw.conditions}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===== DIARY TAB ===== */}
            {activeTab === 'diary' && (
              <div>
                <h2 className="font-bold text-gray-800 mb-4">施工日誌</h2>

                {diarySubmitted ? (
                  <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">日誌已成功提交</p>
                    </div>
                    <button onClick={() => setDiarySubmitted(false)} className="ml-auto text-xs text-green-700 hover:underline">再記錄</button>
                  </div>
                ) : (
                  <div className="max-w-lg space-y-3 mb-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">日期</label>
                        <input type="date" value={diaryDate} onChange={e => setDiaryDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">區域</label>
                        <select value={diaryZone} onChange={e => setDiaryZone(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
                          {['Zone A','Zone B','Zone C','Zone D','Zone E','Zone F','Zone G'].map(z => <option key={z}>{z}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">天氣</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([['sunny','☀️ 晴'],['cloudy','⛅ 多雲'],['rainy','🌧️ 雨天'],['stormy','⛈️ 暴雨']] as const).map(([v,l]) => (
                          <button key={v} onClick={() => setDiaryWeather(v)}
                            className={`py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                              diaryWeather === v ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-amber-300'
                            }`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">溫度 (°C)</label>
                        <input type="number" min={0} max={45} value={diaryTemp} onChange={e => setDiaryTemp(Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700 mb-1 block">今日人數</label>
                        <input type="number" min={0} value={diaryManpower} onChange={e => setDiaryManpower(Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">機械設備</label>
                      <input value={diaryEquipment} onChange={e => setDiaryEquipment(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                        placeholder="例：塔吊 2 台, 挖掘機 1 台" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">今日工作內容 *</label>
                      <textarea rows={3} value={diaryWorkDone} onChange={e => setDiaryWorkDone(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                        placeholder="描述今日完成的工作..." />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">問題 / 延誤</label>
                      <textarea rows={2} value={diaryIssues} onChange={e => setDiaryIssues(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 resize-none"
                        placeholder="如無問題可留空" />
                    </div>
                    <button onClick={handleSubmitDiary} disabled={!diaryWorkDone.trim()}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white py-3 rounded-xl text-sm font-bold transition-colors">
                      提交施工日誌
                    </button>
                  </div>
                )}

                {/* My diaries */}
                {myDiaries.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3">已提交日誌</h3>
                    <div className="space-y-2">
                      {myDiaries.map(d => (
                        <div key={d.id} className="p-3 border border-gray-100 rounded-xl text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-700">{d.date}</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{d.zone}</span>
                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已提交</span>
                          </div>
                          <p className="text-gray-600 line-clamp-2">{d.workDone}</p>
                          <div className="flex gap-2 text-gray-400 mt-1">
                            <span>👷 {d.manpowerTotal} 人</span>
                            <span>🌡 {d.temperature}°C</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Recent notifications */}
        <div className="mt-5 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-bold text-gray-700 text-sm mb-3">最新通知</h3>
          <div className="space-y-2">
            {notifications.slice(0, 3).map(n => (
              <div key={n.id} className={`text-xs p-2.5 rounded-lg border ${!n.read ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className={`font-semibold ${n.priority === 'high' ? 'text-red-700' : 'text-gray-700'}`}>{n.title}</p>
                <p className="text-gray-500 mt-0.5">{n.time}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
