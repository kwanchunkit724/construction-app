import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Building2, Shield, CheckCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useSafety } from '../context/SafetyContext'
import { useQC } from '../context/QCContext'

const MILESTONES = [
  { name: '樁基礎工程完成', date: '2026-01-10', status: 'completed' as const },
  { name: '地下室結構封頂', date: '2026-02-28', status: 'completed' as const },
  { name: 'Zone A 上蓋結構完成', date: '2026-04-01', status: 'completed' as const },
]

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  'on-track': 'bg-blue-500',
  behind: 'bg-orange-500',
  critical: 'bg-red-500',
}
const STATUS_ZH: Record<string, string> = {
  completed: '已完成', 'on-track': '如期', behind: '落後', critical: '嚴重落後'
}
const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  'on-track': 'bg-blue-100 text-blue-700',
  behind: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

export default function ERDashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { items } = useProgress()
  const { ptwRequests } = useSafety()
  const { ncrs } = useQC()

  const openNCRs = ncrs.filter(n => n.status !== 'closed').length
  const [expandedZone, setExpandedZone] = useState<string | null>(null)

  // Derive zone data live from ProgressContext level-1 items
  const zoneItems = items.filter(i => i.level === 1)
  const zoneData = zoneItems.map(z => ({
    name: z.title,
    planned: z.plannedProgress,
    actual: z.actualProgress,
    status: z.status === 'completed' ? 'completed' as const
      : z.status === 'delayed' ? 'behind' as const
      : z.actualProgress < z.plannedProgress - 10 ? 'critical' as const
      : z.actualProgress < z.plannedProgress - 3 ? 'behind' as const
      : 'on-track' as const,
    notes: z.notes,
  }))

  const overallProgress = zoneData.length > 0
    ? Math.round(zoneData.reduce((s, z) => s + z.actual, 0) / zoneData.length)
    : 0

  const activePTW = ptwRequests.filter(p => p.status === 'active').length

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }) }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-800 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-700 rounded-lg">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Kwan Chun Kit Limited Company</p>
              <p className="text-blue-300 text-xs mt-0.5">Victoria Harbour New Shore Complex — Employer Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-blue-700/50 px-3 py-1.5 rounded-full">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                {user?.avatar}
              </div>
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-blue-300 text-xs">{user?.roleZh}</span>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors text-sm px-2 py-1.5">
              <LogOut size={16} /> 登出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero progress */}
        <div className="bg-gradient-to-br from-blue-800 to-blue-900 text-white rounded-2xl p-8 mb-6 shadow-lg">
          <p className="text-blue-300 text-sm mb-2">整體項目完成率</p>
          <div className="flex items-end gap-4 mb-4">
            <p className="text-7xl font-black">{overallProgress}%</p>
            <div className="mb-2">
              <p className="text-blue-200 text-sm">Victoria Harbour New Shore Complex</p>
              <p className="text-blue-300 text-xs">截至 2026年4月16日</p>
            </div>
          </div>
          <div className="h-4 bg-blue-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all"
              style={{ width: `${overallProgress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-blue-400 mt-1">
            <span>0%</span>
            <span>整體目標：100%</span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
            <p className="text-4xl font-black text-green-700">127</p>
            <p className="text-sm text-gray-500 mt-1">連續無意外日數</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-green-600">安全表現優良</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
            <p className="text-4xl font-black text-blue-700">{activePTW}</p>
            <p className="text-sm text-gray-500 mt-1">生效中工作許可</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              <Shield size={12} className="text-blue-500" />
              <span className="text-xs text-blue-600">PTW</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
            <p className={`text-4xl font-black ${openNCRs > 0 ? 'text-red-600' : 'text-green-600'}`}>{openNCRs}</p>
            <p className="text-sm text-gray-500 mt-1">未解決 NCR</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              <AlertTriangle size={12} className={openNCRs > 0 ? 'text-red-500' : 'text-green-500'} />
              <span className={`text-xs ${openNCRs > 0 ? 'text-red-600' : 'text-green-600'}`}>{openNCRs > 0 ? '需跟進糾正' : '質量合格'}</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
            <p className="text-4xl font-black text-amber-700">{zoneData.filter(z => z.status === 'behind' || z.status === 'critical').length}</p>
            <p className="text-sm text-gray-500 mt-1">進度落後區域</p>
            <div className="flex items-center justify-center gap-1 mt-2">
              <AlertTriangle size={12} className="text-amber-500" />
              <span className="text-xs text-amber-600">需關注</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Zone progress table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4">各區域進度</h2>
            <div className="space-y-3">
              {zoneData.map(z => {
                const isBehind = z.status === 'behind' || z.status === 'critical'
                const isExpanded = expandedZone === z.name
                return (
                  <div key={z.name}>
                    <div
                      className={`flex items-center justify-between mb-1 ${isBehind ? 'cursor-pointer' : ''}`}
                      onClick={() => isBehind && setExpandedZone(isExpanded ? null : z.name)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[z.status]}`} />
                        <span className="text-sm text-gray-700">{z.name}</span>
                        {isBehind && (
                          isExpanded
                            ? <ChevronDown size={13} className="text-orange-400" />
                            : <ChevronRight size={13} className="text-orange-400" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">計劃 {z.planned}%</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[z.status]}`}>{STATUS_ZH[z.status]}</span>
                      </div>
                    </div>
                    <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute top-0 left-0 h-full bg-gray-200 rounded-full"
                        style={{ width: `${z.planned}%` }} />
                      <div className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                        z.status === 'completed' ? 'bg-green-500' :
                        z.status === 'on-track' ? 'bg-blue-500' :
                        z.status === 'critical' ? 'bg-red-500' : 'bg-orange-500'
                      }`} style={{ width: `${z.actual}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>實際：<strong className="text-gray-600">{z.actual}%</strong></span>
                      {z.planned > z.actual && (
                        <span className="text-orange-500">差距 {z.planned - z.actual}%</span>
                      )}
                    </div>
                    {isBehind && isExpanded && (
                      <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-800 space-y-1">
                        <p className="font-semibold">落後詳情</p>
                        <p>計劃進度：{z.planned}% ／ 實際進度：{z.actual}%</p>
                        <p>差距：{z.planned - z.actual} 個百分點</p>
                        {z.notes && <p className="text-orange-700 italic">備注：{z.notes}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Milestones */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4">已完成里程碑</h2>
            <div className="space-y-3 mb-6">
              {MILESTONES.map(m => (
                <div key={m.name} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
                  <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{m.name}</p>
                    <p className="text-xs text-green-600">{m.date} 完成</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="font-semibold text-gray-700 mb-3 text-sm">安全表現摘要</h3>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-center">
                  <p className="text-3xl font-black text-green-700">127</p>
                  <p className="text-xs text-green-600">無意外日數</p>
                </div>
                <div className="flex-1 text-sm text-green-700 space-y-1">
                  <p>✓ PTW 合規率 97%</p>
                  <p>✓ 本月工具箱會議 8 次</p>
                  <p>✓ 安全觀察報告 12 份</p>
                </div>
              </div>
              <div className="h-2 bg-green-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '97%' }} />
              </div>
              <p className="text-xs text-green-600 mt-1 text-right">安全合規率 97%</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
