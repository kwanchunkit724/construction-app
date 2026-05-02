import { NavLink } from 'react-router-dom'
import { Home, Building2, User, Shield, HardHat, LogOut, LayoutDashboard, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'

/**
 * Desktop-only sidebar nav. Hidden below md (768px).
 * Mobile uses BottomNav instead.
 */
export function Sidebar() {
  const { profile, signOut } = useAuth()
  const { projects } = useProjects()
  const isAdmin = profile?.global_role === 'admin'
  const isPM = !!profile && projects.some(p => p.assigned_pm_ids.includes(profile.id))
  const showDashboard = isAdmin || isPM

  const tabs = [
    { to: '/home', label: '首頁', icon: Home },
    ...(showDashboard ? [{ to: '/dashboard', label: '儀表板', icon: LayoutDashboard }] : []),
    { to: '/projects', label: '工地', icon: Building2 },
    ...(isAdmin ? [
      { to: '/admin', label: '管理', icon: Shield },
      { to: '/admin/users', label: '用戶', icon: Users },
    ] : []),
    { to: '/profile', label: '個人', icon: User },
  ]

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 lg:w-64 bg-white border-r border-site-200 z-40">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-site-100 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-safety-500 flex items-center justify-center text-white">
          <HardHat size={20} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-site-900 text-sm leading-tight truncate">建築工程管理</p>
          <p className="text-[10px] text-site-400 leading-tight">Construction Mgmt</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-safety-50 text-safety-700'
                  : 'text-site-600 hover:bg-site-50 hover:text-site-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User card + signout */}
      {profile && (
        <div className="border-t border-site-100 p-3">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-safety-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {profile.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-site-900 truncate">{profile.name}</p>
              <p className="text-[10px] text-site-500 truncate">
                {ROLE_ZH[profile.global_role]}
                {profile.sub_role && ` · ${SUB_ROLE_ZH[profile.sub_role]}`}
              </p>
            </div>
            <button
              onClick={signOut}
              className="text-site-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50"
              aria-label="登出"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
