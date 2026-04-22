import { useState } from 'react'
import { LayoutDashboard, BookOpen, Shield } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useSafety } from '../context/SafetyContext'
import { useDiary } from '../context/DiaryContext'

type Tab = 'overview' | 'diary' | 'ptw'

const WEATHER_ICON: Record<string, string> = {
  sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️'
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  'on-track': 'bg-blue-500',
  behind: 'bg-orange-500',
  critical: 'bg-red-500',
}
const STATUS_ZH: Record<string, string> = {
  completed: '已完成', 'on-track': '如期進行', behind: '落後', critical: '嚴重落後'
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

export default function SiteAgentApp() {
  const { user } = useAuth()
  const { items } = useProgress()
  const { ptwRequests } = useSafety()
  const { diaries } = useDiary()

  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const today = new Date().toISOString().slice(0, 10)
  const todayDiaries = diaries.filter(d => d.date === today)
  const activePTW = ptwRequests.filter(p => p.status === 'active').length
  const pendingPTW = ptwRequests.filter(p => p.status === 'pending').length

  // Derive zone status live from level-1 ProgressContext items
  const zoneStatus = items
    .filter(i => i.level === 1)
    .map(z => ({
      zone: z.zone,
      pct: z.actualProgress,
      status: (
        z.actualProgress >= 100 ? 'completed' as const
        : z.actualProgress < z.plannedProgress - 10 ? 'critical' as const
        : z.actualProgress < z.plannedProgress - 3 ? 'behind' as const
        : 'on-track' as const
      ),
    }))

  const tabs = [
    { id: 'overview' as Tab, label: '地盤概覽', icon: LayoutDashboard },
    { id: 'diary' as Tab, label: '施工日誌', icon: BookOpen, badge: diaries.length },
    { id: 'ptw' as Tab, label: 'PTW狀況', icon: Shield, badge: pendingPTW },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar accentColor="bg-slate-600" bgColor="bg-slate-800" />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Identity card */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {user?.avatar}
          </div>
          <div>
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.roleZh} · {user?.company}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400">{today}</p>
            <p className="text-sm font-medium text-slate-700">已提交 {diaries.length} 份日誌</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 justify-center ${
                    isActive ? 'border-slate-600 text-slate-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}>
                  <Icon size={15} />
                  {tab.label}
                  {'badge' in tab && (tab as { badge: number }).badge > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-500'}`}>
                      {(tab as { badge: number }).badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-5">
            {/* ===== OVERVIEW ===== */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h2 className="font-semibold text-gray-800">地盤概覽</h2>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-700">{diaries.length}</p>
                    <p className="text-xs text-gray-600 mt-1">已提交日誌</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-green-700">{activePTW}</p>
                    <p className="text-xs text-gray-600 mt-1">生效 PTW</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-700">{pendingPTW}</p>
                    <p className="text-xs text-gray-600 mt-1">待審批 PTW</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">各區域進度狀況</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {zoneStatus.map(z => (
                      <div key={z.zone} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_DOT[z.status]}`} />
                        <span className="text-sm font-medium text-gray-700 w-16">{z.zone}</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${
                            z.status === 'completed' ? 'bg-green-500' :
                            z.status === 'on-track' ? 'bg-blue-500' :
                            z.status === 'behind' ? 'bg-orange-500' : 'bg-red-500'
                          }`} style={{ width: `${z.pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{z.pct}%</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          z.status === 'completed' ? 'bg-green-100 text-green-700' :
                          z.status === 'on-track' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>{STATUS_ZH[z.status]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===== DIARY ===== */}
            {activeTab === 'diary' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">施工日誌記錄</h2>
                {diaries.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p>暫無施工日誌</p>
                    <p className="text-xs mt-1">工頭或工程師提交後可在此查閱</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {diaries.map(d => (
                      <div key={d.id} className="p-4 border border-gray-100 rounded-xl hover:border-slate-200 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-800">{d.date}</span>
                              <span className="text-sm">{WEATHER_ICON[d.weather]}</span>
                              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{d.zone}</span>
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">已提交</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-2">
                              <span>👤 {d.authorName}</span>
                              <span>🌡 {d.temperature}°C</span>
                              <span>👷 {d.manpowerTotal} 人</span>
                            </div>
                            <p className="text-sm text-gray-700 line-clamp-2">{d.workDone}</p>
                          </div>
                        </div>
                        {d.equipment && (
                          <p className="text-xs text-gray-400 mt-2">機械：{d.equipment}</p>
                        )}
                        {d.issues && (
                          <div className="mt-2 text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg">問題：{d.issues}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== PTW STATUS ===== */}
            {activeTab === 'ptw' && (
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">PTW 狀況總覽</h2>
                {ptwRequests.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Shield size={40} className="mx-auto mb-3 opacity-30" />
                    <p>暫無 PTW 記錄</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ptwRequests.map(ptw => (
                      <div key={ptw.id} className="p-4 border border-gray-100 rounded-xl">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-gray-500">{ptw.ptwNo}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PTW_STATUS_STYLE[ptw.status]}`}>
                                {PTW_STATUS_ZH[ptw.status]}
                              </span>
                            </div>
                            <p className="font-semibold text-gray-800">{ptw.workType}</p>
                            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                              <span>📍 {ptw.location}</span>
                              <span>👷 {ptw.requestedByName}</span>
                              <span>📅 {ptw.requestedAt.slice(0, 10)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
