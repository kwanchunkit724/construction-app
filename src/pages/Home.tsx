import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Clock, ChevronRight, CheckCircle2, XCircle, FileText } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { canAuthorDaily } from '../contexts/DailiesContext'
import { supabase } from '../lib/supabase'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'
import type { Project, ProjectRole } from '../types'

// 今日工地概況 — per-project "did I keep my records live today?" signal from the
// v94 get_my_site_status RPC. Input-only (showing up / logging), never output
// numbers — so it can't tempt fake progress ticks.
interface SiteTodayStatus {
  daily_done: boolean
  progress_today: boolean
  doc_24h: boolean
}

const PROGRESS_EDITOR_ROLES = ['pm', 'main_contractor', 'subcontractor', 'general_foreman']
function canEditProgressClient(
  profile: { id: string; global_role: string } | null,
  memberships: { user_id: string; project_id: string; status: string; role: string }[],
  projects: Project[],
  projectId: string,
): boolean {
  if (!profile) return false
  if (profile.global_role === 'admin') return true
  const project = projects.find(p => p.id === projectId)
  if (project?.assigned_pm_ids.includes(profile.id)) return true
  const m = memberships.find(mb => mb.user_id === profile.id && mb.project_id === projectId && mb.status === 'approved')
  return !!m && PROGRESS_EDITOR_ROLES.includes(m.role)
}

// Compact "today" pills on each project card. Each pill only renders for a user
// who can actually act on it (canDaily / canProgress), so a read-only role never
// sees a permanent red 日誌. 新文件 is purely informational (shown only when true).
function SitePills({ status, canDaily, canProgress }: {
  status?: SiteTodayStatus
  canDaily: boolean
  canProgress: boolean
}) {
  if (!status) return null
  const showDoc = status.doc_24h
  if (!canDaily && !canProgress && !showDoc) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {canDaily && (
        <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
          status.daily_done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {status.daily_done ? <CheckCircle2 size={11} /> : <XCircle size={11} />} 日誌
        </span>
      )}
      {canProgress && (
        <span className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
          status.progress_today ? 'bg-green-100 text-green-700' : 'bg-site-100 text-site-500'
        }`}>
          {status.progress_today ? <CheckCircle2 size={11} /> : <Clock size={11} />} 進度
        </span>
      )}
      {showDoc && (
        <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
          <FileText size={11} /> 新文件
        </span>
      )}
    </div>
  )
}

const RECENT_MS = 24 * 60 * 60 * 1000  // 24h

interface MyProject {
  project: Project
  roleLabel: string
}

export default function Home() {
  const { profile } = useAuth()
  const { loading, projects, memberships } = useProjects()

  const myProjects = useMemo<MyProject[]>(() => {
    if (!profile) return []

    if (profile.global_role === 'admin') {
      return projects.map(p => ({ project: p, roleLabel: '系統管理員' }))
    }

    const list: MyProject[] = []
    const seen = new Set<string>()

    // Approved memberships
    memberships
      .filter(m => m.user_id === profile.id && m.status === 'approved')
      .forEach(m => {
        const project = projects.find(p => p.id === m.project_id)
        if (project && !seen.has(project.id)) {
          seen.add(project.id)
          list.push({ project, roleLabel: ROLE_ZH[m.role as ProjectRole] })
        }
      })

    // PM assignment (in case PM hasn't applied as member)
    projects
      .filter(p => p.assigned_pm_ids.includes(profile.id))
      .forEach(project => {
        if (!seen.has(project.id)) {
          seen.add(project.id)
          list.push({ project, roleLabel: '項目經理 (PM)' })
        }
      })

    return list
  }, [memberships, projects, profile])

  const myPending = useMemo(() => {
    if (!profile) return 0
    return memberships.filter(m => m.user_id === profile.id && m.status === 'pending').length
  }, [memberships, profile])

  const [siteStatus, setSiteStatus] = useState<Record<string, SiteTodayStatus>>({})
  useEffect(() => {
    if (!profile) return
    let alive = true
    supabase.rpc('get_my_site_status').then(({ data, error }) => {
      if (!alive || error || !data) return
      const m: Record<string, SiteTodayStatus> = {}
      for (const r of data as Array<{ project_id: string } & SiteTodayStatus>) {
        m[r.project_id] = { daily_done: r.daily_done, progress_today: r.progress_today, doc_24h: r.doc_24h }
      }
      setSiteStatus(m)
    })
    return () => { alive = false }
  }, [profile])

  // Recently-decided memberships in the last 24h — fall-back signal for
  // users whose push notifications are off or delayed.
  const recentDecisions = useMemo(() => {
    if (!profile) return []
    const cutoff = Date.now() - RECENT_MS
    return memberships
      .filter(m =>
        m.user_id === profile.id
        && (m.status === 'approved' || m.status === 'rejected')
        && m.approved_at
        && new Date(m.approved_at).getTime() > cutoff
      )
      .map(m => ({
        membership: m,
        project: projects.find(p => p.id === m.project_id),
      }))
      .filter(x => x.project)
      .sort((a, b) => (b.membership.approved_at ?? '').localeCompare(a.membership.approved_at ?? ''))
  }, [memberships, projects, profile])

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

      {/* 待我審批 — pull-side surface for the documents review queue (S8) */}
      <PendingReviewsTile />

      {/* Recent membership decisions — visible even if push notification missed */}
      {recentDecisions.length > 0 && (
        <div className="mt-3 space-y-2">
          {recentDecisions.map(({ membership, project }) => {
            const approved = membership.status === 'approved'
            const Icon = approved ? CheckCircle2 : XCircle
            return (
              <div
                key={membership.id}
                className={`rounded-2xl border p-4 flex items-start gap-3 ${
                  approved
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <Icon size={20} className={approved ? 'text-green-600 mt-0.5 flex-shrink-0' : 'text-red-600 mt-0.5 flex-shrink-0'} />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${approved ? 'text-green-800' : 'text-red-800'}`}>
                    {approved ? '工地申請已通過 ✓' : '工地申請被拒絕'}
                  </p>
                  <p className="text-sm text-site-700 mt-0.5 truncate">{project!.name}</p>
                  <p className="text-[10px] text-site-500 mt-0.5">
                    {membership.approved_at ? new Date(membership.approved_at).toLocaleString('zh-HK') : ''}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
        ) : myProjects.length === 0 ? (
          <div className="card p-6 text-center">
            <Building2 size={32} className="mx-auto text-site-300 mb-2" />
            <p className="text-sm text-site-600">還未加入任何工地</p>
            <p className="text-xs text-site-400 mt-1">
              請到「工地」分頁申請加入
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {myProjects.map(({ project, roleLabel }) => (
              <Link
                key={project.id}
                to={`/project/${project.id}`}
                className="card p-4 flex items-center gap-3 hover:border-safety-300 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-safety-100 text-safety-600 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-site-900 truncate">{project.name}</p>
                  <p className="text-xs text-site-500 mt-0.5">{roleLabel}</p>
                  <SitePills
                    status={siteStatus[project.id]}
                    canDaily={canAuthorDaily(profile, memberships, projects, project.id)}
                    canProgress={canEditProgressClient(profile, memberships, projects, project.id)}
                  />
                </div>
                <ChevronRight size={18} className="text-site-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// Flag-gated 待我審批 tile. Calls list_my_pending_reviews once; renders only
// when files_enabled AND the reviewer has ≥1 document waiting. The push from
// v41 deep-links into /project/:id/files; this is the pull-side counterpart.
function PendingReviewsTile() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('list_my_pending_reviews').then(({ data, error }) => {
      if (cancelled || error || !data) return
      setCount((data as unknown[]).length)
    })
    return () => { cancelled = true }
  }, [])

  if (count === 0) return null

  return (
    <Link
      to="/reviews"
      className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3 hover:bg-amber-100 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
        <FileText size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800">📄 待我審批 {count} 份文件</p>
        <p className="text-xs text-amber-700/80 mt-0.5">跨工地文件審批，撳入去逐份處理</p>
      </div>
      <ChevronRight size={18} className="text-amber-400" />
    </Link>
  )
}
