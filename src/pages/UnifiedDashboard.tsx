import { useState, useMemo } from 'react'
import {
  LayoutDashboard, TrendingUp, AlertCircle, Shield, BookOpen,
  Package, FileText, CheckSquare, ShoppingCart, LogOut,
  Building2, ChevronDown, Plus, X, Send, CheckCircle2,
  Clock, AlertTriangle, ClipboardList, Layers, MessageSquare, Star,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useIssues } from '../context/IssueContext'
import { useSafety } from '../context/SafetyContext'
import { useQC } from '../context/QCContext'
import { useDiary } from '../context/DiaryContext'
import { useProcurement } from '../context/ProcurementContext'
import { useCost } from '../context/CostContext'
import { useDocument } from '../context/DocumentContext'
import IssueBoard from '../components/IssueBoard'
import ProgressTracker from '../components/ProgressTracker'
import type { Role } from '../types'

// ── Permission helper ─────────────────────────────────────────────────────────
function usePerms() {
  const { user } = useAuth()
  const p = user?.permissions ?? []
  const has = (...keys: string[]) => keys.some(k => p.includes(k) || p.includes('view:all'))
  return { has, p, user }
}

// ── Module definitions ────────────────────────────────────────────────────────
type ModuleKey = 'overview' | 'progress' | 'issues' | 'safety' | 'diary' | 'materials' | 'documents' | 'qc' | 'procurement'

const MODULE_DEFS: { key: ModuleKey; label: string; icon: React.ElementType; perms: string[] }[] = [
  { key: 'overview',     label: '概覽',  icon: LayoutDashboard, perms: [] },
  { key: 'progress',     label: '進度',  icon: TrendingUp,      perms: ['view:progress', 'update:progress'] },
  { key: 'issues',       label: '問題',  icon: AlertCircle,     perms: ['manage:issues', 'report:issues'] },
  { key: 'safety',       label: '安全',  icon: Shield,          perms: ['manage:safety', 'approve:ptw', 'view:safety', 'manage:ptw', 'create:safety-obs'] },
  { key: 'diary',        label: '日誌',  icon: BookOpen,        perms: ['submit:reports', 'approve:diary', 'approve:reports'] },
  { key: 'materials',    label: '物料',  icon: Package,         perms: ['request:materials', 'approve:materials', 'view:inventory'] },
  { key: 'documents',    label: '文件',  icon: FileText,        perms: ['manage:drawings', 'upload:drawings', 'manage:submittals'] },
  { key: 'qc',           label: '質檢',  icon: CheckSquare,     perms: ['create:ncr', 'close:ncr', 'create:inspection'] },
  { key: 'procurement',  label: '採購',  icon: ShoppingCart,    perms: ['manage:boq', 'manage:vo', 'manage:orders', 'approve:valuation'] },
]

const PARTY_COLOR: Record<Role, string> = {
  'super-admin':    'bg-rose-600',
  'owner':          'bg-blue-600',
  'main-contractor':'bg-amber-600',
  'sub-contractor': 'bg-green-600',
}
const PARTY_ZH: Record<Role, string> = {
  'super-admin': '系統管理員', 'owner': '業主', 'main-contractor': '總承建商', 'sub-contractor': '判頭',
}

// ── Overview section ──────────────────────────────────────────────────────────
function OverviewSection({ projectId }: { projectId: string }) {
  const { issues } = useIssues()
  const { items: progressItems } = useProgress()
  const { ptwRequests } = useSafety()
  const { ncrs } = useQC()

  const projIssues = issues.filter(i => i.projectId === projectId)
  const projItems  = progressItems.filter(i => i.projectId === projectId)
  const projPTW    = ptwRequests.filter(p => p.projectId === projectId)
  const projNCRs   = ncrs.filter(n => n.projectId === projectId)

  const openIssues   = projIssues.filter(i => i.status === 'open' || i.status === 'in-progress').length
  const avgProgress  = projItems.length ? Math.round(projItems.reduce((s, i) => s + i.actualProgress, 0) / projItems.length) : 0
  const pendingPTW   = projPTW.filter(p => p.status === 'pending').length
  const openNCRs     = projNCRs.filter(n => n.status !== 'closed').length

  const stats = [
    { label: '待處理問題', value: openIssues,   color: 'text-orange-600', bg: 'bg-orange-50', icon: AlertCircle },
    { label: '整體進度',   value: `${avgProgress}%`, color: 'text-blue-600', bg: 'bg-blue-50', icon: TrendingUp },
    { label: '待批PTW',    value: pendingPTW,   color: 'text-red-600',    bg: 'bg-red-50',    icon: Shield },
    { label: '開放NCR',    value: openNCRs,     color: 'text-purple-600', bg: 'bg-purple-50', icon: CheckSquare },
  ]

  const recentIssues = projIssues
    .filter(i => i.status !== 'closed')
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 flex flex-col gap-2`}>
              <Icon size={18} className={s.color} />
              <p className="text-2xl font-black text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          )
        })}
      </div>

      {recentIssues.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">最近問題</p>
          <div className="space-y-2">
            {recentIssues.map(issue => (
              <div key={issue.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  issue.severity === 'urgent' ? 'bg-red-100 text-red-700' :
                  issue.severity === 'serious' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}>{issue.severity === 'urgent' ? '緊急' : issue.severity === 'serious' ? '較嚴重' : '一般'}</span>
                <p className="text-sm text-gray-800 flex-1 truncate">{issue.category} — {issue.description.slice(0, 50)}</p>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{issue.submittedAt.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Safety section ────────────────────────────────────────────────────────────
function SafetySection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { ptwRequests, approvePTW, rejectPTW, submitPTW, toolboxTalks, addToolboxTalk } = useSafety()
  const perms = user?.permissions ?? []
  const canApprove = perms.includes('approve:ptw') || perms.includes('view:all')
  const canSubmit  = perms.includes('manage:ptw')
  const canTBT     = perms.includes('manage:safety') || perms.includes('view:all')

  const [tab, setTab]           = useState<'ptw' | 'tbt'>('ptw')
  const [showPTWForm, setShowPTWForm] = useState(false)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // PTW form state
  const [ptwWork, setPtwWork]   = useState('')
  const [ptwLoc, setPtwLoc]     = useState('')
  const [ptwStart, setPtwStart] = useState('')
  const [ptwEnd, setPtwEnd]     = useState('')

  const projPTW = ptwRequests.filter(p => p.projectId === projectId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  const projTBT = toolboxTalks.filter(t => t.projectId === projectId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const submitNewPTW = () => {
    if (!user || !ptwWork || !ptwLoc || !ptwStart || !ptwEnd) return
    submitPTW({
      projectId, workType: ptwWork, location: ptwLoc, zone: '', description: ptwWork,
      hazards: [], requiredPPE: [], requestedBy: user.id, requestedByName: user.name,
      startTime: ptwStart, endTime: ptwEnd, riskLevel: 'medium',
    })
    setPtwWork(''); setPtwLoc(''); setPtwStart(''); setPtwEnd('')
    setShowPTWForm(false)
  }

  const PTW_STATUS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700', active: 'bg-blue-100 text-blue-700',
    completed: 'bg-gray-100 text-gray-500', expired: 'bg-gray-100 text-gray-400',
  }
  const PTW_ZH: Record<string, string> = {
    pending: '待批', approved: '已批', rejected: '拒絕', active: '進行中', completed: '完成', expired: '過期',
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['ptw', 'tbt'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'ptw' ? '工作許可 PTW' : '工具箱會議'}
          </button>
        ))}
        {canSubmit && tab === 'ptw' && (
          <button onClick={() => setShowPTWForm(v => !v)}
            className="ml-auto flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-sm font-semibold">
            <Plus size={14} /> 申請PTW
          </button>
        )}
      </div>

      {showPTWForm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-bold text-red-800">申請工作許可 (PTW)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">工作類型 *</label>
              <input value={ptwWork} onChange={e => setPtwWork(e.target.value)} placeholder="例：高空作業"
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">工作地點 *</label>
              <input value={ptwLoc} onChange={e => setPtwLoc(e.target.value)} placeholder="例：A區 7樓"
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">開始時間 *</label>
              <input type="datetime-local" value={ptwStart} onChange={e => setPtwStart(e.target.value)}
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">結束時間 *</label>
              <input type="datetime-local" value={ptwEnd} onChange={e => setPtwEnd(e.target.value)}
                className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={submitNewPTW} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm font-semibold">提交申請</button>
            <button onClick={() => setShowPTWForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      {tab === 'ptw' && (
        <div className="space-y-3">
          {projPTW.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無PTW記錄</p>}
          {projPTW.map(ptw => (
            <div key={ptw.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{ptw.ptwNo} — {ptw.workType}</p>
                  <p className="text-xs text-gray-500">{ptw.location} · {ptw.requestedByName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ptw.startTime?.slice(0, 16).replace('T', ' ')} → {ptw.endTime?.slice(0, 16).replace('T', ' ')}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${PTW_STATUS[ptw.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {PTW_ZH[ptw.status] ?? ptw.status}
                </span>
              </div>
              {canApprove && ptw.status === 'pending' && (
                rejectId === ptw.id ? (
                  <div className="mt-2 space-y-2">
                    <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="拒絕原因..."
                      className="w-full text-sm border border-red-300 rounded-lg px-3 py-2 focus:outline-none" />
                    <div className="flex gap-2">
                      <button onClick={() => { rejectPTW(ptw.id, rejectReason); setRejectId(null); setRejectReason('') }}
                        className="flex-1 bg-red-600 text-white py-1.5 rounded-lg text-sm font-semibold">確認拒絕</button>
                      <button onClick={() => setRejectId(null)} className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => approvePTW(ptw.id, user!.id, user!.name)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-semibold">批准</button>
                    <button onClick={() => setRejectId(ptw.id)}
                      className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-1.5 rounded-lg text-sm font-semibold">拒絕</button>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'tbt' && (
        <div className="space-y-3">
          {projTBT.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無工具箱會議記錄</p>}
          {projTBT.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.topic}</p>
                  <p className="text-xs text-gray-500">{t.conductedByName} · {t.date} · {t.duration}分鐘</p>
                  {t.attendeeNames.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">出席：{t.attendeeNames.slice(0, 3).join('、')}{t.attendeeNames.length > 3 ? ` +${t.attendeeNames.length - 3}` : ''}</p>
                  )}
                </div>
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                  {t.attendeeNames.length}人出席
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Diary section ─────────────────────────────────────────────────────────────
function DiarySection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { diaries, submitDiary } = useDiary()
  const { projects } = useProgress()
  const perms = user?.permissions ?? []
  const canSubmit = perms.includes('submit:reports')

  const proj = projects.find(p => p.id === projectId)
  const [showForm, setShowForm] = useState(false)
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [weather, setWeather]   = useState<'sunny'|'cloudy'|'rainy'|'stormy'>('sunny')
  const [temp, setTemp]         = useState(28)
  const [manpower, setManpower] = useState(0)
  const [workDone, setWorkDone] = useState('')
  const [issues, setIssues]     = useState('')
  const [zone, setZone]         = useState(proj?.zones[0]?.name ?? '')

  const projDiaries = diaries.filter(d => d.projectId === projectId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const handleSubmit = () => {
    if (!user || !workDone.trim()) return
    submitDiary({
      projectId, date, authorId: user.id, authorName: user.name,
      zone, weather, temperature: temp, manpowerTotal: manpower,
      equipment: '', workDone: workDone.trim(), issues: issues.trim(),
    })
    setWorkDone(''); setIssues(''); setShowForm(false)
  }

  const WEATHER_ZH = { sunny: '晴天', cloudy: '多雲', rainy: '雨天', stormy: '惡劣天氣' }

  return (
    <div>
      {canSubmit && (
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-semibold mb-4">
          <Plus size={14} /> 提交施工日誌
        </button>
      )}

      {showForm && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-bold text-green-800">新施工日誌</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">日期</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">天氣</label>
              <select value={weather} onChange={e => setWeather(e.target.value as typeof weather)}
                className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none">
                {Object.entries(WEATHER_ZH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">溫度 (°C)</label>
              <input type="number" value={temp} onChange={e => setTemp(Number(e.target.value))}
                className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">總人手</label>
              <input type="number" value={manpower} onChange={e => setManpower(Number(e.target.value))}
                className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">今日工作 *</label>
            <textarea value={workDone} onChange={e => setWorkDone(e.target.value)} rows={3} placeholder="描述今日施工內容..."
              className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">問題記錄</label>
            <textarea value={issues} onChange={e => setIssues(e.target.value)} rows={2} placeholder="如有問題請記錄..."
              className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-sm font-semibold">提交</button>
            <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {projDiaries.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無施工日誌</p>}
        {projDiaries.map(d => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{d.date} — {d.zone}</p>
                <p className="text-xs text-gray-500">{d.authorName} · {WEATHER_ZH[d.weather]} {d.temperature}°C · {d.manpowerTotal}人</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${d.status === 'submitted' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                {d.status === 'submitted' ? '已提交' : '已批准'}
              </span>
            </div>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5">{d.workDone}</p>
            {d.issues && <p className="text-xs text-orange-700 bg-orange-50 rounded-lg p-2 mt-2">問題：{d.issues}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Materials section ─────────────────────────────────────────────────────────
function MaterialsSection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { requests, submitRequest, approveRequest, rejectRequest } = useProcurement()
  const perms = user?.permissions ?? []
  const canRequest = perms.includes('request:materials')
  const canApprove = perms.includes('approve:materials') || perms.includes('view:all')

  const [showForm, setShowForm] = useState(false)
  const [matName, setMatName]   = useState('')
  const [matUnit, setMatUnit]   = useState('')
  const [matQty, setMatQty]     = useState(1)
  const [matUrgent, setMatUrgent] = useState(false)

  const projReqs = requests.filter(r => r.projectId === projectId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))

  const submitNew = () => {
    if (!user || !matName.trim()) return
    submitRequest({
      projectId, requestedBy: user.id, requestedByName: user.name,
      requestedByRole: user.role, zone: '',
      items: [{ material: matName.trim(), unit: matUnit || '個', quantity: matQty, urgency: matUrgent ? 'urgent' : 'normal' }],
      notes: '',
    })
    setMatName(''); setMatUnit(''); setMatQty(1); setMatUrgent(false)
    setShowForm(false)
  }

  const REQ_STATUS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700',
    ordered: 'bg-blue-100 text-blue-700', delivered: 'bg-gray-100 text-gray-600',
    rejected: 'bg-red-100 text-red-700',
  }
  const REQ_ZH: Record<string, string> = {
    pending: '待批', approved: '已批', ordered: '已訂購', delivered: '已送達', rejected: '拒絕',
  }

  return (
    <div>
      {canRequest && (
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold mb-4">
          <Plus size={14} /> 申請物料
        </button>
      )}

      {showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-bold text-amber-800">物料申請</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">物料名稱 *</label>
              <input value={matName} onChange={e => setMatName(e.target.value)} placeholder="例：螺紋鋼筋"
                className="w-full px-3 py-2 border border-amber-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">單位</label>
              <input value={matUnit} onChange={e => setMatUnit(e.target.value)} placeholder="噸"
                className="w-full px-3 py-2 border border-amber-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">數量</label>
              <input type="number" min={1} value={matQty} onChange={e => setMatQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-amber-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div className="col-span-2 flex items-center gap-2 pt-5">
              <input type="checkbox" id="urgent" checked={matUrgent} onChange={e => setMatUrgent(e.target.checked)} className="w-4 h-4 accent-amber-600" />
              <label htmlFor="urgent" className="text-sm text-gray-700">緊急申請</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={submitNew} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-xl text-sm font-semibold">提交</button>
            <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {projReqs.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無物料申請</p>}
        {projReqs.map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{r.requestNo}</p>
                <p className="text-xs text-gray-500">{r.requestedByName} · {r.requestedAt.slice(0, 10)}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.items.map((item, idx) => (
                    <span key={idx} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.urgency === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {item.material} × {item.quantity} {item.unit}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${REQ_STATUS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {REQ_ZH[r.status] ?? r.status}
              </span>
            </div>
            {canApprove && r.status === 'pending' && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => approveRequest(r.id, user!.name, '')}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-semibold">批准</button>
                <button onClick={() => rejectRequest(r.id)}
                  className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-1.5 rounded-lg text-sm font-semibold">拒絕</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Documents section ─────────────────────────────────────────────────────────
function DocumentsSection({ projectId }: { projectId: string }) {
  const { drawings, submittals } = useDocument()
  const [tab, setTab] = useState<'drawings' | 'submittals'>('drawings')

  const projDrawings   = drawings.filter(d => d.projectId === projectId)
  const projSubmittals = submittals.filter(s => s.projectId === projectId)

  const DISC_ZH: Record<string, string> = { structural: '結構', architectural: '建築', mep: 'M&E', civil: '土木' }
  const STATUS_STYLE: Record<string, string> = {
    current: 'bg-green-100 text-green-700', superseded: 'bg-gray-100 text-gray-500', 'under-review': 'bg-yellow-100 text-yellow-700',
  }
  const STATUS_ZH: Record<string, string> = { current: '最新版', superseded: '已取代', 'under-review': '審查中' }
  const SUB_STATUS: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-500', submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', resubmit: 'bg-orange-100 text-orange-700',
  }
  const SUB_ZH: Record<string, string> = { pending: '待提交', submitted: '已提交', approved: '已批', rejected: '拒絕', resubmit: '需重提' }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['drawings', 'submittals'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'drawings' ? '圖則登記冊' : '提交文件'}
          </button>
        ))}
      </div>

      {tab === 'drawings' && (
        <div className="space-y-2">
          {projDrawings.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無圖則記錄</p>}
          {projDrawings.map(d => (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{d.drawingNo} — {d.title}</p>
                <p className="text-xs text-gray-500">{DISC_ZH[d.discipline] ?? d.discipline} · Rev {d.revision} · {d.issueDate}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLE[d.status]}`}>
                {STATUS_ZH[d.status]}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'submittals' && (
        <div className="space-y-2">
          {projSubmittals.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無提交文件</p>}
          {projSubmittals.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{s.submittalNo} — {s.title}</p>
                <p className="text-xs text-gray-500">{s.category} · {s.submittedAt.slice(0, 10)}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${SUB_STATUS[s.status]}`}>
                {SUB_ZH[s.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── QC section ────────────────────────────────────────────────────────────────
function QCSection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { ncrs, raiseNCR, closeNCR } = useQC()
  const perms = user?.permissions ?? []
  const canRaise = perms.includes('create:ncr')
  const canClose = perms.includes('close:ncr') || perms.includes('view:all')
  const { projects } = useProgress()
  const proj = projects.find(p => p.id === projectId)

  const [showForm, setShowForm] = useState(false)
  const [workItem, setWorkItem] = useState('')
  const [desc, setDesc]         = useState('')
  const [severity, setSeverity] = useState<'minor'|'major'|'critical'>('minor')
  const [zone, setZone]         = useState(proj?.zones[0]?.name ?? '')

  const projNCRs = ncrs.filter(n => n.projectId === projectId)
    .sort((a, b) => b.date.localeCompare(a.date))

  const handleRaise = () => {
    if (!user || !workItem.trim() || !desc.trim()) return
    raiseNCR({
      projectId, date: new Date().toISOString().slice(0, 10),
      raisedBy: user.id, raisedByName: user.name,
      zone, workItem: workItem.trim(), description: desc.trim(),
      severity, photos: [],
    })
    setWorkItem(''); setDesc(''); setShowForm(false)
  }

  const SEV_STYLE: Record<string, string> = {
    minor: 'bg-yellow-100 text-yellow-700', major: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  }
  const SEV_ZH: Record<string, string> = { minor: '輕微', major: '主要', critical: '嚴重' }
  const STATUS_STYLE: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700', 'corrective-action': 'bg-yellow-100 text-yellow-700',
    verification: 'bg-purple-100 text-purple-700', closed: 'bg-gray-100 text-gray-500',
  }
  const STATUS_ZH: Record<string, string> = { open: '開放', 'corrective-action': '糾正行動', verification: '核查中', closed: '已關閉' }

  return (
    <div>
      {canRaise && (
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-semibold mb-4">
          <Plus size={14} /> 發出 NCR
        </button>
      )}

      {showForm && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-bold text-cyan-800">新不符合報告 (NCR)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">工作項目 *</label>
              <input value={workItem} onChange={e => setWorkItem(e.target.value)} placeholder="例：混凝土澆築"
                className="w-full px-3 py-2 border border-cyan-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">嚴重程度</label>
              <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)}
                className="w-full px-3 py-2 border border-cyan-200 rounded-xl text-sm focus:outline-none">
                <option value="minor">輕微</option>
                <option value="major">主要</option>
                <option value="critical">嚴重</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">不符合描述 *</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="詳細描述不符合情況..."
              className="w-full px-3 py-2 border border-cyan-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleRaise} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl text-sm font-semibold">發出</button>
            <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {projNCRs.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無NCR記錄</p>}
        {projNCRs.map(n => (
          <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{n.ncrNo} — {n.workItem}</p>
                <p className="text-xs text-gray-500">{n.raisedByName} · {n.zone} · {n.date}</p>
                <p className="text-xs text-gray-600 mt-1">{n.description.slice(0, 80)}{n.description.length > 80 ? '…' : ''}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEV_STYLE[n.severity]}`}>{SEV_ZH[n.severity]}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[n.status]}`}>{STATUS_ZH[n.status]}</span>
              </div>
            </div>
            {canClose && n.status !== 'closed' && (
              <button onClick={() => closeNCR(n.id)}
                className="mt-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-semibold">
                關閉 NCR
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Procurement section ───────────────────────────────────────────────────────
function ProcurementSection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { boqItems, variationOrders, addVO, approveVO, rejectVO } = useCost()
  const perms = user?.permissions ?? []
  const canVO      = perms.includes('manage:vo') || perms.includes('view:all')
  const canApprove = perms.includes('approve:valuation') || perms.includes('view:all')

  const [tab, setTab] = useState<'boq' | 'vo'>('boq')
  const [showVOForm, setShowVOForm] = useState(false)
  const [voDesc, setVoDesc]         = useState('')
  const [voAmount, setVoAmount]     = useState('')
  const [voType, setVoType]         = useState<'addition'|'omission'|'substitution'>('addition')

  const projBOQ = boqItems.filter(b => b.projectId === projectId)
  const projVOs  = variationOrders.filter(v => v.projectId === projectId)
    .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))

  const totalContract  = projBOQ.reduce((s, b) => s + b.contractAmount, 0)
  const totalCompleted = projBOQ.reduce((s, b) => s + b.completedAmount, 0)

  const submitVO = () => {
    if (!user || !voDesc.trim() || !voAmount) return
    addVO({
      projectId, voNo: '', description: voDesc.trim(), raisedBy: user.id,
      raisedByName: user.name, amount: Number(voAmount), type: voType,
    })
    setVoDesc(''); setVoAmount(''); setShowVOForm(false)
  }

  const VO_STATUS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-500', submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  }
  const VO_ZH: Record<string, string> = { draft: '草稿', submitted: '已提交', approved: '已批', rejected: '拒絕' }
  const VO_TYPE_ZH: Record<string, string> = { addition: '增加', omission: '刪減', substitution: '替換' }

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['boq', 'vo'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'boq' ? 'BOQ 工程量清單' : '變更令 VO'}
          </button>
        ))}
        {canVO && tab === 'vo' && (
          <button onClick={() => setShowVOForm(v => !v)}
            className="ml-auto flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl text-sm font-semibold">
            <Plus size={14} /> 新增VO
          </button>
        )}
      </div>

      {tab === 'boq' && (
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">合約總額</p>
              <p className="text-lg font-black text-blue-700">HK${(totalContract / 1e6).toFixed(1)}M</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">已完成金額</p>
              <p className="text-lg font-black text-green-700">HK${(totalCompleted / 1e6).toFixed(1)}M</p>
            </div>
          </div>
          <div className="space-y-2">
            {projBOQ.slice(0, 20).map(b => (
              <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{b.code} — {b.description}</p>
                  <p className="text-[10px] text-gray-400">{b.contractQty} {b.unit} @ ${b.rate.toLocaleString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-gray-800">HK${b.contractAmount.toLocaleString()}</p>
                  <p className="text-[10px] text-green-600">{b.contractAmount > 0 ? Math.round((b.completedAmount / b.contractAmount) * 100) : 0}% 完成</p>
                </div>
              </div>
            ))}
            {projBOQ.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無BOQ資料</p>}
          </div>
        </div>
      )}

      {tab === 'vo' && (
        <div>
          {showVOForm && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-4 space-y-3">
              <p className="text-sm font-bold text-purple-800">新增變更令 (VO)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">類型</label>
                  <select value={voType} onChange={e => setVoType(e.target.value as typeof voType)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl text-sm focus:outline-none">
                    <option value="addition">增加</option>
                    <option value="omission">刪減</option>
                    <option value="substitution">替換</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">金額 (HKD)</label>
                  <input type="number" value={voAmount} onChange={e => setVoAmount(e.target.value)} placeholder="例：500000"
                    className="w-full px-3 py-2 border border-purple-200 rounded-xl text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">描述 *</label>
                <textarea value={voDesc} onChange={e => setVoDesc(e.target.value)} rows={2} placeholder="描述變更內容..."
                  className="w-full px-3 py-2 border border-purple-200 rounded-xl text-sm focus:outline-none resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={submitVO} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl text-sm font-semibold">提交</button>
                <button onClick={() => setShowVOForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">取消</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {projVOs.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">暫無變更令</p>}
            {projVOs.map(vo => (
              <div key={vo.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{vo.voNo} — {VO_TYPE_ZH[vo.type]}</p>
                    <p className="text-xs text-gray-500">{vo.raisedByName} · {vo.raisedAt.slice(0, 10)}</p>
                    <p className="text-xs text-gray-700 mt-1">{vo.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${VO_STATUS[vo.status]}`}>{VO_ZH[vo.status]}</span>
                    <span className={`text-sm font-bold ${vo.type === 'omission' ? 'text-red-600' : 'text-green-600'}`}>
                      {vo.type === 'omission' ? '-' : '+'}HK${vo.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
                {canApprove && vo.status === 'submitted' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => approveVO(vo.id, user!.name)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg text-sm font-semibold">批准</button>
                    <button onClick={() => rejectVO(vo.id)}
                      className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-1.5 rounded-lg text-sm font-semibold">拒絕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Issues section wrapper (with report form) ─────────────────────────────────
function IssuesSection({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const { submitIssue } = useIssues()
  const { projects } = useProgress()
  const proj = projects.find(p => p.id === projectId)
  const perms = user?.permissions ?? []
  const canReport = perms.includes('report:issues')

  const [showForm, setShowForm] = useState(false)
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState<'normal'|'serious'|'urgent'>('normal')
  const [location, setLocation] = useState('')
  const [desc, setDesc]         = useState('')

  const handleSubmit = () => {
    if (!user || !category.trim() || !desc.trim() || !location.trim()) return
    submitIssue({
      projectId, category: category.trim(), severity, location: location.trim(),
      drawingRef: '', description: desc.trim(),
      submittedBy: user.id, submittedByName: user.name, submittedByRole: user.role,
      notifyIds: [], photos: [],
    })
    setCategory(''); setDesc(''); setLocation(''); setShowForm(false)
  }

  return (
    <div>
      {canReport && (
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-semibold mb-4">
          <Plus size={14} /> 上報問題
        </button>
      )}

      {showForm && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4 space-y-3">
          <p className="text-sm font-bold text-orange-800">上報新問題</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">問題類別 *</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="例：安全隱患"
                className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">嚴重程度</label>
              <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)}
                className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none">
                <option value="normal">一般</option>
                <option value="serious">較嚴重</option>
                <option value="urgent">緊急</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">地點 *</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder={proj?.zones[0]?.name ? `例：${proj.zones[0].name}` : '例：A區 5樓'}
                className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">詳細描述 *</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="詳細描述問題情況..."
              className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-xl text-sm font-semibold">提交</button>
            <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">取消</button>
          </div>
        </div>
      )}

      <IssueBoard projectId={projectId} />
    </div>
  )
}

// ── Feedback Modal ────────────────────────────────────────────────────────────
const SCENARIOS = [
  { value: 'short',   label: '短期合約 (1-6個月)' },
  { value: 'mid',     label: '中期合約 (6-12個月)' },
  { value: 'long',    label: '長期合約 (12-36個月)' },
  { value: 'general', label: '一般使用' },
]
const CATEGORIES = ['工作流程', '功能缺失', '介面設計', '其他']

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [rating, setRating]     = useState(0)
  const [hovered, setHovered]   = useState(0)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [scenario, setScenario] = useState('general')
  const [message, setMessage]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (rating === 0) { setError('請選擇星級評分'); return }
    if (!message.trim()) { setError('請填寫意見'); return }
    setSubmitting(true); setError('')
    const { error: dbErr } = await supabase.from('demo_feedback').insert({
      scenario, user_id: user?.id, username: user?.username,
      user_name: user?.name, role_zh: user?.roleZh,
      rating, category, message: message.trim(),
    })
    setSubmitting(false)
    if (dbErr) { setError('提交失敗，請稍後再試'); return }
    setDone(true)
    setTimeout(onClose, 1800)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-600" />
            <span className="font-bold text-gray-900">提交使用意見</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3 text-green-500" />
            <p className="font-bold text-gray-900">感謝您的意見！</p>
            <p className="text-sm text-gray-400 mt-1">您的回饋已成功提交</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">使用場景</label>
              <select value={scenario} onChange={e => setScenario(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SCENARIOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">整體評分</label>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n}
                    onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(n)}
                    className="transition-transform hover:scale-110">
                    <Star size={28} className={`${n <= (hovered || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} transition-colors`} />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="text-xs text-gray-500 self-center ml-1">
                    {['', '非常差', '較差', '一般', '良好', '非常好'][rating]}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">意見類別</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${category === c ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">詳細意見</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                rows={4} placeholder="請描述您的使用體驗、遇到的問題或改善建議…"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-300" />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button onClick={submit} disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {submitting ? <Clock size={14} className="animate-spin" /> : <Send size={14} />}
              {submitting ? '提交中…' : '提交意見'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Unified Dashboard ────────────────────────────────────────────────────
export default function UnifiedDashboard() {
  const { user, logout } = useAuth()
  const { projects, currentProjectId, switchProject } = useProgress()

  const { has } = usePerms()

  // Visible modules based on permissions
  const visibleModules = MODULE_DEFS.filter(m =>
    m.perms.length === 0 || has(...m.perms)
  )

  const [activeModule, setActiveModule] = useState<ModuleKey>('overview')
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

  // Which projects this user can see
  const myProjects = useMemo(() => {
    if (!user) return []
    if (user.role === 'super-admin' || user.role === 'owner') return projects
    if (user.role === 'main-contractor') {
      const assigned = projects.filter(p => p.assignedPmIds?.includes(user.id))
      return assigned.length > 0 ? assigned : projects.filter(p => p.id === user.projectId)
    }
    return projects.filter(p => p.id === user.projectId)
  }, [projects, user])

  const currentProject = myProjects.find(p => p.id === currentProjectId) ?? myProjects[0]

  const partyColor = user ? PARTY_COLOR[user.role] : 'bg-gray-600'

  const renderSection = () => {
    const pid = currentProject?.id ?? ''
    switch (activeModule) {
      case 'overview':     return <OverviewSection projectId={pid} />
      case 'progress':     return <ProgressTracker />
      case 'issues':       return <IssuesSection projectId={pid} />
      case 'safety':       return <SafetySection projectId={pid} />
      case 'diary':        return <DiarySection projectId={pid} />
      case 'materials':    return <MaterialsSection projectId={pid} />
      case 'documents':    return <DocumentsSection projectId={pid} />
      case 'qc':           return <QCSection projectId={pid} />
      case 'procurement':  return <ProcurementSection projectId={pid} />
      default:             return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top header ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 size={15} className="text-white" />
            </div>
            <span className="font-black text-gray-900 text-sm hidden sm:block">關春傑工程</span>
          </div>

          {/* Project selector */}
          <div className="relative flex-1 max-w-xs">
            <button onClick={() => setShowProjectPicker(v => !v)}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-1.5 text-sm font-semibold text-gray-800 transition-colors w-full">
              <Layers size={13} className="text-gray-500 flex-shrink-0" />
              <span className="truncate">{currentProject?.name ?? '選擇項目'}</span>
              <ChevronDown size={13} className="text-gray-400 flex-shrink-0 ml-auto" />
            </button>
            {showProjectPicker && myProjects.length > 1 && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {myProjects.map(p => (
                  <button key={p.id} onClick={() => { switchProject(p.id); setShowProjectPicker(false) }}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${p.id === currentProjectId ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full ${partyColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {user?.avatar}
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-xs font-bold text-gray-900 leading-tight">{user?.name}</p>
                <p className="text-[10px] text-gray-400">{user ? PARTY_ZH[user.role] : ''} · {user?.trade}</p>
              </div>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <LogOut size={13} /> <span className="hidden sm:inline">登出</span>
            </button>
          </div>
        </div>

        {/* Module tabs */}
        <div className="border-t border-gray-100 overflow-x-auto">
          <div className="flex max-w-6xl mx-auto px-4">
            {visibleModules.map(m => {
              const Icon = m.icon
              const active = activeModule === m.key
              return (
                <button key={m.key} onClick={() => setActiveModule(m.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${
                    active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}>
                  <Icon size={13} />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {myProjects.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ClipboardList size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">尚未獲指派任何項目</p>
            <p className="text-sm mt-1">請聯絡系統管理員為您指派項目</p>
          </div>
        ) : (
          renderSection()
        )}
      </main>

      {/* ── Floating feedback button ───────────────────────────────────── */}
      <button
        onClick={() => setShowFeedback(true)}
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        className="fixed right-5 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl active:scale-95">
        <MessageSquare size={14} />
        提交意見
      </button>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  )
}
