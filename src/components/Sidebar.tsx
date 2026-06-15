import { NavLink, useLocation } from 'react-router-dom'
import { Home, Building2, User, Shield, ShieldCheck, HardHat, LogOut, LayoutDashboard, Users, FileText, Receipt, BookOpen, Package, CalendarDays, Contact as ContactIcon, GraduationCap, FolderOpen, Wrench } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { usePtwFlag } from '../contexts/PtwFlagContext'
import { useFilesFlag } from '../contexts/FilesFlagContext'
import { useModules } from '../contexts/ModulesContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'

const FORMS_MANAGE_ROLES = ['pm', 'main_contractor', 'safety_officer']

type NavItem = { to: string; label: string; icon: typeof Home }

/**
 * Desktop-only sidebar nav. Hidden below md (768px).
 * Mobile uses BottomNav instead.
 */
export function Sidebar() {
  const { profile, signOut } = useAuth()
  const { projects, memberships } = useProjects()
  const { enabled: ptwEnabled } = usePtwFlag()
  const { enabled: filesEnabled } = useFilesFlag()
  const location = useLocation()
  const isAdmin = profile?.global_role === 'admin'
  const showPtw = ptwEnabled || isAdmin
  const showFiles = filesEnabled || isAdmin
  const isPM = !!profile && projects.some(p => p.assigned_pm_ids.includes(profile.id))
  const showDashboard = isAdmin || isPM

  // Detect /project/:id scope (hash router path) so we can surface SI/VO links
  // when the user is inside a project. Match hash too because HashRouter
  // routes are encoded in window.location.hash but `useLocation` returns
  // the pathname of the in-router path.
  const projectMatch = location.pathname.match(/^\/project\/([^/]+)/)
  const projectId = projectMatch?.[1] ?? null

  // 機械/表格 entry: manager-gated (no forms_enabled flag RPC in v55 — see
  // EquipmentList route note). admin OR assigned PM OR approved
  // pm/main_contractor/safety_officer member of THIS project.
  const showEquipment = !!profile && !!projectId && (
    isAdmin
    || projects.some(p => p.id === projectId && p.assigned_pm_ids.includes(profile.id))
    || memberships.some(m =>
      m.user_id === profile.id && m.project_id === projectId
      && m.status === 'approved' && FORMS_MANAGE_ROLES.includes(m.role))
  )

  // Non-project nav (always safe — no module context needed). The per-project
  // module links live in <ProjectNavLinks>, which is only mounted when there is
  // a projectId in scope; that keeps useModules() out of the global pages
  // (/home, /projects, /admin…) where no ModulesProvider exists.
  const topTabs: NavItem[] = [
    { to: '/home', label: '首頁', icon: Home },
    ...(showDashboard ? [{ to: '/dashboard', label: '儀表板', icon: LayoutDashboard }] : []),
    { to: '/projects', label: '工地', icon: Building2 },
  ]
  const bottomTabs: NavItem[] = [
    ...(isAdmin ? [
      { to: '/admin', label: '管理', icon: Shield },
      { to: '/admin/users', label: '用戶', icon: Users },
      { to: '/admin/integrity', label: '資料完整性', icon: ShieldCheck },
    ] : []),
    { to: '/help', label: '教學', icon: GraduationCap },
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
        {topTabs.map(t => <SidebarLink key={t.to} item={t} />)}
        {projectId && (
          <ProjectNavLinks
            projectId={projectId}
            showPtw={showPtw}
            showFiles={showFiles}
            showEquipment={showEquipment}
          />
        )}
        {bottomTabs.map(t => <SidebarLink key={t.to} item={t} />)}
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

// One sidebar row. Shared so the global + per-project link groups render
// identically.
function SidebarLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <NavLink
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
  )
}

// Per-project module links. Mounted ONLY inside a /project/:id scope, so it is
// the single place useModules() runs in the sidebar — never on a global page
// where there is no ModulesProvider. Each module link only renders when its
// module is enabled (default-true while the RPC loads, so nothing flickers off).
function ProjectNavLinks({
  projectId, showPtw, showFiles, showEquipment,
}: {
  projectId: string
  showPtw: boolean
  showFiles: boolean
  showEquipment: boolean
}) {
  const { isModuleEnabled } = useModules()
  const items: NavItem[] = [
    ...(isModuleEnabled('si') ? [{ to: `/project/${projectId}/si`, label: '工地指令', icon: FileText }] : []),
    ...(isModuleEnabled('vo') ? [{ to: `/project/${projectId}/vo`, label: '變更指令', icon: Receipt }] : []),
    ...(showPtw && isModuleEnabled('ptw') ? [{ to: `/project/${projectId}/ptw`, label: '工作許可證', icon: HardHat }] : []),
    ...(showEquipment && isModuleEnabled('equipment') ? [{ to: `/project/${projectId}/equipment`, label: '機械/表格', icon: Wrench }] : []),
    ...(isModuleEnabled('dailies') ? [{ to: `/project/${projectId}/daily`, label: '每日日誌', icon: BookOpen }] : []),
    ...(isModuleEnabled('materials') ? [{ to: `/project/${projectId}/materials`, label: '物料', icon: Package }] : []),
    ...(isModuleEnabled('timetable') ? [{ to: `/project/${projectId}/timetable`, label: '行事曆', icon: CalendarDays }] : []),
    ...(isModuleEnabled('contacts') ? [{ to: `/project/${projectId}/contacts`, label: '聯絡人', icon: ContactIcon }] : []),
    ...(showFiles && isModuleEnabled('documents') ? [{ to: `/project/${projectId}/files`, label: '文件', icon: FolderOpen }] : []),
  ]
  return <>{items.map(t => <SidebarLink key={t.to} item={t} />)}</>
}
