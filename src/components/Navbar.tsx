import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, LogOut, HardHat, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { notifications } from '../data/mockData'

interface NavbarProps {
  accentColor?: string  // optional override, e.g. 'bg-safety-500'
  bgColor?: string      // optional override; defaults to construction dark
}

// Role → safety-orange accent vs site-slate accent
const ROLE_ACCENT: Record<string, string> = {
  worker:           'bg-safety-500',
  foreman:          'bg-amber-600',
  cp:               'bg-red-600',
  'sub-supervisor': 'bg-purple-600',
  pe:               'bg-emerald-600',
  pm:               'bg-site-600',
  qs:               'bg-teal-600',
  'site-agent':     'bg-site-500',
  'doc-controller': 'bg-indigo-600',
  qc:               'bg-cyan-600',
  procurement:      'bg-amber-700',
  er:               'bg-blue-700',
}

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-safety-400',
  low:    'bg-site-300',
}

export default function Navbar({ accentColor, bgColor }: NavbarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const unread = notifications.filter(n => !n.read)
  const roleAccent = accentColor ?? ROLE_ACCENT[user?.role ?? ''] ?? 'bg-site-600'
  const navBg = bgColor ?? 'bg-site-900'

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className={`${navBg} text-white shadow-lg sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-3">

          {/* Left: Logo + project */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-safety-500 flex items-center justify-center flex-shrink-0">
              <HardHat size={18} className="text-white" />
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-heading font-bold text-sm leading-none truncate">
                Kwan Chun Kit Ltd.
              </span>
              <span className="text-white/45 text-[11px] leading-none mt-0.5 hidden sm:block">
                Victoria Harbour New Shore Complex
              </span>
            </div>
          </div>

          {/* Right: role badge + bell + user */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`${roleAccent} text-white text-[11px] font-semibold px-2.5 py-1 rounded-full hidden sm:inline`}>
              {user?.roleZh}
            </span>

            {/* Notification bell */}
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="relative w-9 h-9 flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="通知"
            >
              <Bell size={19} />
              {unread.length > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread.length}
                </span>
              )}
            </button>

            {/* User pill */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-white/20 border border-white/25 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {user?.avatar}
              </div>
              <span className="text-sm font-medium hidden sm:inline leading-none">{user?.name}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Notification Panel ── */}
      {notifOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)}>
          <div
            className="absolute right-3 top-16 w-80 bg-white rounded-2xl shadow-2xl border border-site-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-site-100">
              <p className="font-heading font-semibold text-site-900 text-sm">最新通知</p>
              <button onClick={() => setNotifOpen(false)} className="w-7 h-7 flex items-center justify-center text-site-400 hover:text-site-600 hover:bg-site-100 rounded-lg transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin divide-y divide-site-50">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 text-xs ${!n.read ? 'bg-orange-50' : 'bg-white'}`}>
                  <div className="flex items-start gap-2.5">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[n.priority] ?? 'bg-site-300'}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-site-800 leading-snug">{n.title}</p>
                      <p className="text-site-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-site-400 mt-1">{n.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-site-100 text-center">
              <button className="text-xs text-safety-600 hover:text-safety-700 font-medium hover:underline">查看全部通知</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logout Confirm Modal ── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-site-100 flex items-center justify-center text-xl font-bold text-site-700 flex-shrink-0">
                {user?.avatar}
              </div>
              <div>
                <p className="font-heading font-semibold text-site-900">{user?.name}</p>
                <p className="text-site-500 text-sm">{user?.roleZh} · {user?.company}</p>
              </div>
            </div>

            {/* Permissions */}
            <div className="bg-site-50 rounded-xl p-3 mb-5">
              <p className="text-[11px] font-semibold text-site-400 uppercase tracking-wider mb-2">目前帳戶權限</p>
              <div className="flex flex-wrap gap-1.5">
                {user?.permissions.map(p => (
                  <span key={p} className="text-[11px] bg-white border border-site-200 text-site-600 px-2 py-0.5 rounded-full">
                    {PERM_LABELS[p] ?? p}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-site-700 font-semibold text-center mb-5">確認登出系統？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 border border-site-200 text-site-600 py-3 rounded-xl text-sm font-medium hover:bg-site-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut size={15} /> 登出
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const PERM_LABELS: Record<string, string> = {
  'view:all':           '查看全局',
  'approve:reports':    '審批日報',
  'approve:budgets':    '審批預算',
  'view:costs':         '查看成本',
  'manage:issues':      '管理問題',
  'view:safety':        '查看安全',
  'submit:reports':     '提交日報',
  'upload:drawings':    '上載圖則',
  'assign:tasks':       '指派工序',
  'approve:materials':  '審批物料',
  'approve:ptw':        '批准 PTW',
  'reject:ptw':         '拒絕 PTW',
  'create:safety-obs':  '建立安全觀察',
  'view:nearmiss':      '查看近乎意外',
  'manage:safety':      '管理安全',
  'view:all-zones':     '查看全部區域',
  'view:tasks':         '查看工序',
  'update:tasks':       '更新工序',
  'request:materials':  '申請物料',
  'manage:attendance':  '管理出勤',
  'report:issues':      '上報問題',
  'checkin':            '出勤打卡',
  'view:own-tasks':     '查看工作',
  'sos':                'SOS 緊急求助',
}
