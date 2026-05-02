import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Building2, AlertCircle, CheckCircle2, Clock,
  ChevronRight, TrendingUp, TrendingDown, Activity,
} from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { ProgressBar } from '../components/ProgressBar'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import {
  computeRollup, getZoneLeaves, PROGRESS_STATUS_ZH,
} from '../types'
import type { ProgressItem, ProgressStatus, Issue, UserProfile } from '../types'

interface ActivityEvent {
  id: string
  type: 'issue_created' | 'issue_resolved' | 'progress_updated' | 'membership_approved' | 'project_created'
  at: string
  title: string
  detail?: string
  link?: string
  user_id?: string
}

export default function Dashboard() {
  const { profile, loading: authLoading } = useAuth()
  const { projects, memberships, loading: projectsLoading } = useProjects()

  const [allItems, setAllItems] = useState<ProgressItem[]>([])
  const [allIssues, setAllIssues] = useState<Issue[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [users, setUsers] = useState<Record<string, UserProfile>>({})
  const [loading, setLoading] = useState(true)

  // Visible projects for this user (admin sees all)
  const visibleProjects = useMemo(() => {
    if (!profile) return []
    if (profile.global_role === 'admin') return projects
    return projects.filter(p => p.assigned_pm_ids.includes(profile.id))
  }, [profile, projects])

  // Stable key for project IDs — prevents re-running fetch when project array
  // reference changes but underlying ids didn't.
  const projectIdsKey = useMemo(
    () => visibleProjects.map(p => p.id).sort().join(','),
    [visibleProjects]
  )

  useEffect(() => {
    if (!profile || projectIdsKey === '') {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const projectIds = projectIdsKey.split(',')

    Promise.all([
      supabase.from('progress_items').select('*').in('project_id', projectIds),
      supabase.from('issues').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
    ]).then(async ([progRes, issueRes]) => {
      if (cancelled) return
      const items = (progRes.data ?? []) as ProgressItem[]
      const issues = (issueRes.data ?? []) as Issue[]
      setAllItems(items)
      setAllIssues(issues)
      setLoading(false)
    }).catch(e => {
      console.error('Dashboard fetch error:', e)
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [profile?.id, projectIdsKey])

  // Activity feed derived from current data (no separate fetch)
  useEffect(() => {
    if (!profile || projectIdsKey === '') return
    const projectIds = projectIdsKey.split(',')
    const events: ActivityEvent[] = []
    for (const i of allIssues.slice(0, 8)) {
      events.push({
        id: 'i-' + i.id,
        type: i.status === 'resolved' ? 'issue_resolved' : 'issue_created',
        at: i.status === 'resolved' && i.resolved_at ? i.resolved_at : i.created_at,
        title: i.status === 'resolved' ? '問題已解決' : '新問題報告',
        detail: i.title,
        link: `/project/${i.project_id}/issue/${i.id}`,
        user_id: i.status === 'resolved' ? (i.resolved_by ?? undefined) : i.reporter_id,
      })
    }
    memberships
      .filter(m => m.status === 'approved' && projectIds.includes(m.project_id))
      .slice(0, 5)
      .forEach(m => {
        events.push({
          id: 'm-' + m.id,
          type: 'membership_approved',
          at: m.approved_at ?? m.applied_at,
          title: '工地申請通過',
          detail: visibleProjects.find(p => p.id === m.project_id)?.name,
          user_id: m.user_id,
        })
      })
    allItems
      .slice()
      .sort((a, b) => b.last_updated_at.localeCompare(a.last_updated_at))
      .slice(0, 5)
      .forEach(it => {
        if (it.last_updated_at !== it.created_at) {
          events.push({
            id: 'p-' + it.id,
            type: 'progress_updated',
            at: it.last_updated_at,
            title: '進度更新',
            detail: `${it.code} ${it.title} → ${it.actual_progress}%`,
            link: `/project/${it.project_id}`,
            user_id: it.last_updated_by ?? undefined,
          })
        }
      })
    events.sort((a, b) => b.at.localeCompare(a.at))
    setActivity(events.slice(0, 15))
  }, [allItems, allIssues, memberships, profile?.id, projectIdsKey, visibleProjects])

  // Fetch missing user profiles for the activity feed
  useEffect(() => {
    const needed = Array.from(new Set(
      activity.map(e => e.user_id).filter((id): id is string => !!id && !users[id])
    ))
    if (needed.length === 0) return
    let cancelled = false
    supabase.from('user_profiles').select('*').in('id', needed).then(({ data }) => {
      if (cancelled || !data) return
      setUsers(prev => {
        const next = { ...prev }
        for (const u of data as UserProfile[]) next[u.id] = u
        return next
      })
    })
    return () => { cancelled = true }
  }, [activity, users])

  if (authLoading || projectsLoading) {
    return <AppLayout title="儀表板 Dashboard" wide><div className="py-20 flex justify-center"><Spinner size={32} /></div></AppLayout>
  }
  if (!profile) return <Navigate to="/login" replace />
  if (profile.global_role !== 'admin' && !projects.some(p => p.assigned_pm_ids.includes(profile.id))) {
    return <Navigate to="/home" replace />
  }

  // Aggregated stats
  const projectStats = visibleProjects.map(p => {
    const projectItems = allItems.filter(i => i.project_id === p.id)
    const allLeaves = p.zones.flatMap(z => getZoneLeaves(projectItems, z.id))
    const rollup = computeRollup(allLeaves)
    return { project: p, rollup, leafCount: allLeaves.length }
  })

  const totalProjects = projectStats.length
  const onTrack = projectStats.filter(s => s.rollup.status === 'in-progress' || s.rollup.status === 'completed').length
  const delayed = projectStats.filter(s => s.rollup.status === 'delayed').length
  const openIssues = allIssues.filter(i => i.status === 'open').length

  return (
    <AppLayout title="儀表板 Dashboard" wide>
      {/* Hero stats — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-5 md:mb-6">
        <StatCard label="工地總數" count={totalProjects} icon={Building2} color="bg-safety-50 text-safety-700 border-safety-200" />
        <StatCard label="進度正常" count={onTrack} icon={CheckCircle2} color="bg-green-50 text-green-700 border-green-200" />
        <StatCard label="進度落後" count={delayed} icon={TrendingDown} color="bg-red-50 text-red-700 border-red-200" />
        <StatCard label="處理中問題" count={openIssues} icon={AlertCircle} color="bg-amber-50 text-amber-700 border-amber-200" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Project progress overview — takes 2/3 on desktop */}
        <section className="lg:col-span-2">
          <h2 className="text-base font-bold text-site-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} /> 工地進度概覽
          </h2>
          {loading ? (
            <div className="py-8 flex justify-center"><Spinner size={24} /></div>
          ) : projectStats.length === 0 ? (
            <div className="card p-8 text-center text-sm text-site-500">未有工地</div>
          ) : (
            <div className="space-y-2">
              {projectStats.map(({ project, rollup, leafCount }) => (
                <Link
                  to={`/project/${project.id}`}
                  key={project.id}
                  className="card p-4 flex items-center gap-3 hover:border-safety-300 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-safety-100 text-safety-600 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-site-900 truncate">{project.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <ProgressBar value={rollup.actual} planned={rollup.planned} status={rollup.status} className="flex-1 max-w-[200px]" />
                      <span className="text-xs font-bold text-site-700 flex-shrink-0">{rollup.actual}%</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_PILL[rollup.status]}`}>
                        {PROGRESS_STATUS_ZH[rollup.status]}
                      </span>
                    </div>
                    <p className="text-[10px] text-site-400 mt-0.5">{leafCount} 個 leaf · {project.zones.length} 個分區</p>
                  </div>
                  <ChevronRight size={16} className="text-site-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Activity feed — 1/3 on desktop, full row on mobile */}
        <section>
          <h2 className="text-base font-bold text-site-900 mb-3 flex items-center gap-2">
            <Activity size={16} /> 最近動態
          </h2>
          {loading ? (
            <div className="py-8 flex justify-center"><Spinner size={24} /></div>
          ) : activity.length === 0 ? (
            <div className="card p-8 text-center text-sm text-site-500">未有動態</div>
          ) : (
            <div className="card divide-y divide-site-100">
              {activity.map(ev => (
                <ActivityRow key={ev.id} ev={ev} userName={ev.user_id ? users[ev.user_id]?.name : undefined} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}

const STATUS_PILL: Record<ProgressStatus, string> = {
  'not-started': 'bg-site-100 text-site-500',
  'in-progress': 'bg-blue-100 text-blue-700',
  'completed': 'bg-green-100 text-green-700',
  'delayed': 'bg-red-100 text-red-700',
  'blocked': 'bg-orange-100 text-orange-700',
}

function StatCard({
  label, count, icon: Icon, color,
}: {
  label: string; count: number; icon: typeof Building2; color: string
}) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium opacity-80">{label}</span>
        <Icon size={16} className="opacity-60" />
      </div>
      <p className="text-3xl md:text-4xl font-black leading-none">{count}</p>
    </div>
  )
}

function ActivityRow({ ev, userName }: { ev: ActivityEvent; userName?: string }) {
  const Icon = ev.type === 'issue_created' ? AlertCircle
    : ev.type === 'issue_resolved' ? CheckCircle2
    : ev.type === 'membership_approved' ? CheckCircle2
    : ev.type === 'progress_updated' ? TrendingUp
    : Activity
  const iconColor = ev.type === 'issue_created' ? 'text-amber-600 bg-amber-50'
    : ev.type === 'issue_resolved' || ev.type === 'membership_approved' ? 'text-green-600 bg-green-50'
    : 'text-blue-600 bg-blue-50'

  const content = (
    <div className="px-4 py-3 flex items-start gap-2.5">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-site-900">{ev.title}</p>
        {ev.detail && <p className="text-xs text-site-500 truncate mt-0.5">{ev.detail}</p>}
        <p className="text-[10px] text-site-400 mt-0.5">
          {userName ? `${userName} · ` : ''}{relativeTime(ev.at)}
        </p>
      </div>
      {ev.link && <ChevronRight size={14} className="text-site-300 mt-1 flex-shrink-0" />}
    </div>
  )

  if (ev.link) {
    return <Link to={ev.link} className="block hover:bg-site-50 transition-colors">{content}</Link>
  }
  return <div>{content}</div>
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} 日前`
  return new Date(iso).toLocaleDateString('zh-HK')
}
