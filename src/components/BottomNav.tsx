import { NavLink, useLocation } from 'react-router-dom'
import { Home, Building2, User, Shield, FileCheck2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function BottomNav() {
  const { profile } = useAuth()
  const location = useLocation()
  const isAdmin = profile?.global_role === 'admin'

  // When inside a project, surface a 簽核 entry that lands on the SI list
  // by default (per Plan 02-09 Task 1 — mobile bottom nav can't fit both SI and VO).
  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/)
  const projectId = projectMatch?.[1] ?? null

  const tabs = [
    { to: '/home', label: '首頁', icon: Home },
    { to: '/projects', label: '工地', icon: Building2 },
    ...(projectId ? [{ to: `/project/${projectId}/si`, label: '簽核', icon: FileCheck2 }] : []),
    ...(isAdmin ? [{ to: '/admin', label: '管理', icon: Shield }] : []),
    { to: '/profile', label: '個人', icon: User },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-site-200 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="max-w-2xl mx-auto grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-safety-600' : 'text-site-400 hover:text-site-700'
              }`
            }
          >
            <Icon size={22} />
            <span className="text-[11px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
