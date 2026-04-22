import { useNavigate } from 'react-router-dom'
import {
  BarChart3, HardHat, Shield, Wrench, UserCheck,
  Building2, ArrowRight, Clock
} from 'lucide-react'
import { project } from '../data/mockData'

const roles = [
  {
    id: 'pm',
    title: '項目總監',
    titleEn: 'Project Manager',
    description: '全局進度追蹤、成本管控、風險概覽及業主報告',
    icon: BarChart3,
    bg: 'from-blue-600 to-blue-800',
    accent: 'bg-blue-600',
    border: 'border-blue-200 hover:border-blue-400',
    features: ['實時進度 Dashboard', 'S-Curve 分析', '成本追蹤', '通知中心'],
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'pe',
    title: '工程師',
    titleEn: 'Project Engineer',
    description: '施工日報管理、圖則版本控制、工序安排及問題追蹤',
    icon: Wrench,
    bg: 'from-emerald-600 to-emerald-800',
    accent: 'bg-emerald-600',
    border: 'border-emerald-200 hover:border-emerald-400',
    features: ['數字化日報', '圖則版本控制', '工序指派', '問題管理'],
    badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    id: 'cp',
    title: '安全主任',
    titleEn: 'Competent Person (Safety)',
    description: '工作許可審批、安全巡查記錄、近乎意外報告及安全統計',
    icon: Shield,
    bg: 'from-orange-500 to-red-600',
    accent: 'bg-orange-500',
    border: 'border-orange-200 hover:border-orange-400',
    features: ['電子工作許可 (PTW)', '安全巡查 Checklist', '匿名近乎意外報告', '安全 KPI 統計'],
    badge: 'bg-orange-100 text-orange-700',
  },
  {
    id: 'foreman',
    title: '工頭',
    titleEn: 'Foreman',
    description: '今日工序派工、工人出勤管理、物料申請及問題上報',
    icon: HardHat,
    bg: 'from-amber-500 to-amber-700',
    accent: 'bg-amber-500',
    border: 'border-amber-200 hover:border-amber-400',
    features: ['工序任務卡', '出勤打卡管理', '物料申請', '即時問題上報'],
    badge: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'worker',
    title: '工人',
    titleEn: 'Worker',
    description: '今日工作查看、電子打卡、問題上報及緊急求助',
    icon: UserCheck,
    bg: 'from-green-600 to-green-800',
    accent: 'bg-green-600',
    border: 'border-green-200 hover:border-green-400',
    features: ['今日工作一覽', 'QR 打卡', '拍照報告問題', '緊急 SOS 按鈕'],
    badge: 'bg-green-100 text-green-700',
  },
]

export default function RoleSelect() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-blue-600 rounded-xl">
              <Building2 size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{project.name}</h1>
              <p className="text-blue-300 text-sm">{project.nameEn}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: '整體進度', value: `${project.currentProgress}%`, sub: `計劃 ${project.plannedProgress}%`, color: project.currentProgress < project.plannedProgress ? 'text-orange-400' : 'text-green-400' },
              { label: '預算使用', value: `HKD ${(project.spentBudget / 1_000_000).toFixed(0)}M`, sub: `預算 HKD ${(project.totalBudget / 1_000_000).toFixed(0)}M`, color: 'text-blue-300' },
              { label: '連續無意外', value: `${project.safetyDaysWithoutIncident} 天`, sub: '安全日數', color: 'text-green-400' },
              { label: '地盤位置', value: project.location, sub: project.client, color: 'text-slate-300' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4">
                <p className="text-white/50 text-xs mb-1">{stat.label}</p>
                <p className={`font-bold text-sm sm:text-base ${stat.color}`}>{stat.value}</p>
                <p className="text-white/40 text-xs mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Clock size={14} />
            <span>今日: 2026年4月14日 (星期二) — 項目第 14 個月</span>
          </div>
        </div>
      </div>

      {/* Role selection */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h2 className="text-white text-xl font-bold">選擇您的角色</h2>
          <p className="text-slate-400 text-sm mt-1">請選擇您在項目中的職位，進入對應的工作介面</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {roles.map((role) => {
            const Icon = role.icon
            return (
              <button
                key={role.id}
                onClick={() => navigate(`/${role.id}`)}
                className={`group relative bg-white rounded-2xl border-2 ${role.border} transition-all duration-200 hover:shadow-xl hover:-translate-y-1 text-left overflow-hidden`}
              >
                {/* Color header */}
                <div className={`bg-gradient-to-br ${role.bg} p-5 flex items-center justify-between`}>
                  <div className="bg-white/20 rounded-xl p-2.5">
                    <Icon size={24} className="text-white" />
                  </div>
                  <ArrowRight size={18} className="text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 text-base">{role.title}</h3>
                  <p className="text-gray-400 text-xs mb-3">{role.titleEn}</p>
                  <p className="text-gray-600 text-xs leading-relaxed mb-3">{role.description}</p>

                  <div className="space-y-1">
                    {role.features.map((f) => (
                      <div key={f} className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-gray-500 text-xs">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <p className="text-center text-slate-600 text-xs mt-8">
          建築工程管理平台 v1.0 · Kwan Chun Kit Limited Company · 2026
        </p>
      </div>
    </div>
  )
}
