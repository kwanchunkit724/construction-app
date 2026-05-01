import { useMemo } from 'react'
import { Building2, Clock, ChevronRight } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'

export default function Home() {
  const { profile } = useAuth()
  const { loading, projects, memberships } = useProjects()

  const myApproved = useMemo(() => {
    if (!profile) return []
    return memberships
      .filter(m => m.user_id === profile.id && m.status === 'approved')
      .map(m => ({ membership: m, project: projects.find(p => p.id === m.project_id) }))
      .filter(x => x.project)
  }, [memberships, projects, profile])

  const myPending = useMemo(() => {
    if (!profile) return 0
    return memberships.filter(m => m.user_id === profile.id && m.status === 'pending').length
  }, [memberships, profile])

  return (
    <AppLayout title="首頁">
      {/* Welcome card */}
      <div className="card p-5">
        <p className="text-xs text-site-400 uppercase tracking-wide">歡迎</p>
        <h2 className="text-2xl font-extrabold text-site-900 mt-1">{profile?.name}</h2>
        <p className="text-sm text-site-500 mt-1">
          {profile && ROLE_ZH[profile.global_role]}
          {profile?.sub_role && ` · ${SUB_ROLE_ZH[profile.sub_role]}`}
        </p>
        {profile?.company && (
          <p className="text-sm text-site-500 mt-0.5">{profile.company}</p>
        )}
      </div>

      {/* My projects */}
      <div className="mt-5">
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="font-bold text-site-900">我的工地</h3>
          {myPending > 0 && (
            <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Clock size={11} />申請中 {myPending}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-8 flex justify-center"><Spinner size={24} /></div>
        ) : myApproved.length === 0 ? (
          <div className="card p-6 text-center">
            <Building2 size={32} className="mx-auto text-site-300 mb-2" />
            <p className="text-sm text-site-600">還未加入任何工地</p>
            <p className="text-xs text-site-400 mt-1">
              請到「工地」分頁申請加入
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {myApproved.map(({ project, membership }) => (
              <div key={membership!.id} className="card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-safety-100 text-safety-600 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-site-900 truncate">{project!.name}</p>
                  <p className="text-xs text-site-500 mt-0.5">{ROLE_ZH[membership!.role]}</p>
                </div>
                <ChevronRight size={18} className="text-site-300" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
