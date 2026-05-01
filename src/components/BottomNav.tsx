import { NavLink } from 'react-router-dom'
import { Home, Building2, User, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function BottomNav() {
  const { profile } = useAuth()
  const isAdmin = profile?.global_role === 'admin'

  const tabs = [
    { to: '/home', label: '首頁', icon: Home },
    { to: '/projects', label: '工地', icon: Building2 },
    ...(isAdmin ? [{ to: '/admin', label: '管理', icon: Shield }] : []),
    { to: '/profile', label: '個人', icon: User },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-site-200 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-2xl mx-auto grid grid-cols-4">
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
