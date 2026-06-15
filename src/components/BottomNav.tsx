import { NavLink, useLocation } from 'react-router-dom'
import { Home, Building2, User, Shield, FileCheck2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModules } from '../contexts/ModulesContext'

type NavItem = { to: string; label: string; icon: typeof Home }

export function BottomNav() {
  const { profile } = useAuth()
  const location = useLocation()
  const isAdmin = profile?.global_role === 'admin'

  // When inside a project, surface a 簽核 entry that lands on the SI list
  // by default (per Plan 02-09 Task 1 — mobile bottom nav can't fit both SI and VO).
  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/)
  const projectId = projectMatch?.[1] ?? null

  // Global (non-project) tabs — always safe, no module context required.
  const leadingTabs: NavItem[] = [
    { to: '/home', label: '首頁', icon: Home },
    { to: '/projects', label: '工地', icon: Building2 },
  ]
  const trailingTabs: NavItem[] = [
    ...(isAdmin ? [{ to: '/admin', label: '管理', icon: Shield }] : []),
    { to: '/profile', label: '個人', icon: User },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-site-200 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* auto-cols-fr + grid-flow-col size every tab to an equal share, so the
          column count no longer needs to be precomputed — the 簽核 entry can
          appear/disappear (module-gated) without a hardcoded length. */}
      <div className="max-w-2xl mx-auto grid grid-flow-col auto-cols-fr">
        {leadingTabs.map(t => <BottomNavLink key={t.to} item={t} />)}
        {/* 簽核 fronts SI/VO/PTW — only when at least one of those modules is on.
            Mounted only in a project scope so useModules() never runs on a
            global page that has no ModulesProvider. */}
        {projectId && <SignoffNavLink projectId={projectId} />}
        {trailingTabs.map(t => <BottomNavLink key={t.to} item={t} />)}
      </div>
    </nav>
  )
}

function BottomNavLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <NavLink
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
  )
}

// The mobile 簽核 entry. Visible only when at least one of the SI / VO / PTW
// modules is enabled for this project (default-true while the RPC loads).
function SignoffNavLink({ projectId }: { projectId: string }) {
  const { isModuleEnabled } = useModules()
  if (!isModuleEnabled('si') && !isModuleEnabled('vo') && !isModuleEnabled('ptw')) return null
  return <BottomNavLink item={{ to: `/project/${projectId}/si`, label: '簽核', icon: FileCheck2 }} />
}
