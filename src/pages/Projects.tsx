import { useEffect, useMemo, useState } from 'react'
import { Building2, Clock, CheckCircle2, XCircle, UserPlus, ShieldCheck } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { ApplyToProjectModal } from '../components/ApplyToProjectModal'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { ROLE_ZH } from '../types'
import type { Project, ProjectMember } from '../types'
import { supabase } from '../lib/supabase'

// Subset returned by the admin_or_pm_list_applicants RPC (v30).
type Applicant = { id: string; name: string; phone: string; company: string | null }

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}
const STATUS_ZH: Record<string, string> = {
  pending: '待審核',
  approved: '已加入',
  rejected: '已拒絕',
}

export default function Projects() {
  const { profile } = useAuth()
  const { loading, projects, memberships, approveMembership, rejectMembership, refetch } = useProjects()
  const [applyOpen, setApplyOpen] = useState(false)

  const myMemberships = useMemo(
    () => memberships.filter(m => m.user_id === profile?.id),
    [memberships, profile?.id]
  )

  const myApprovedProjectIds = new Set(
    myMemberships.filter(m => m.status === 'approved').map(m => m.project_id)
  )
  const myAppliedProjectIds = new Set(myMemberships.map(m => m.project_id))

  // Projects user can apply to (not already a member)
  const availableProjects = projects.filter(p => !myAppliedProjectIds.has(p.id))

  // Pending applications I can approve (PM in project, or subcontractor in project)
  const pendingForMe = useMemo(() => {
    if (!profile) return [] as ProjectMember[]
    return memberships.filter(m => {
      if (m.status !== 'pending') return false
      if (m.user_id === profile.id) return false
      const project = projects.find(p => p.id === m.project_id)
      if (!project) return false
      // Admin sees all
      if (profile.global_role === 'admin') return true
      // PM sees pending in their projects
      if (project.assigned_pm_ids.includes(profile.id)) return true
      // Subcontractor sees pending workers in their project
      if (m.role === 'subcontractor_worker') {
        const myMembership = memberships.find(
          mm => mm.user_id === profile.id && mm.project_id === m.project_id && mm.role === 'subcontractor' && mm.status === 'approved'
        )
        if (myMembership) return true
      }
      return false
    })
  }, [memberships, projects, profile])

  // Approved members in projects I manage as an assigned PM (or admin), shown
  // so the PM can designate a 安全主任 for the PTW 簽核 chain (NEW-1). Gating
  // mirrors the assigned-PM / admin branches of `pendingForMe` above. A member
  // who is already 安全主任 is excluded — there is nothing left to designate.
  const designatableMembers = useMemo(() => {
    if (!profile) return [] as ProjectMember[]
    const isAdmin = profile.global_role === 'admin'
    return memberships.filter(m => {
      if (m.status !== 'approved') return false
      if (m.role === 'safety_officer') return false
      const project = projects.find(p => p.id === m.project_id)
      if (!project) return false
      if (isAdmin) return true
      return project.assigned_pm_ids.includes(profile.id)
    })
  }, [memberships, projects, profile])

  return (
    <AppLayout title="工地">
      {/* Apply button */}
      <button
        onClick={() => setApplyOpen(true)}
        className="btn-primary w-full mb-4"
      >
        <UserPlus size={20} /> 申請加入工地
      </button>

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={28} /></div>
      ) : (
        <>
          {/* My memberships */}
          <Section title="我的工地" count={myMemberships.length}>
            {myMemberships.length === 0 ? (
              <EmptyCard icon={Building2} text="還未加入任何工地" />
            ) : (
              <div className="space-y-2">
                {myMemberships.map(m => {
                  const project = projects.find(p => p.id === m.project_id)
                  return (
                    <MembershipCard
                      key={m.id}
                      project={project}
                      membership={m}
                    />
                  )
                })}
              </div>
            )}
          </Section>

          {/* Pending approvals (only shown if there are any) */}
          {pendingForMe.length > 0 && (
            <Section title="待審核申請" count={pendingForMe.length} highlight>
              <div className="space-y-2">
                {pendingForMe.map(m => {
                  const project = projects.find(p => p.id === m.project_id)
                  return (
                    <PendingApprovalCard
                      key={m.id}
                      project={project}
                      membership={m}
                      onApprove={() => approveMembership(m.id)}
                      onReject={() => rejectMembership(m.id)}
                    />
                  )
                })}
              </div>
            </Section>
          )}

          {/* Designate safety officer (PTW 簽核) — assigned PM / admin only */}
          {designatableMembers.length > 0 && (
            <Section title="委派安全主任（PTW 簽核）" count={designatableMembers.length}>
              <div className="space-y-2">
                {designatableMembers.map(m => {
                  const project = projects.find(p => p.id === m.project_id)
                  return (
                    <DesignateSafetyOfficerCard
                      key={m.id}
                      project={project}
                      membership={m}
                      onDone={refetch}
                    />
                  )
                })}
              </div>
            </Section>
          )}
        </>
      )}

      <ApplyToProjectModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        availableProjects={availableProjects}
      />
    </AppLayout>
  )
}

function Section({ title, count, highlight, children }: { title: string; count?: number; highlight?: boolean; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className={`font-bold ${highlight ? 'text-amber-700' : 'text-site-900'}`}>{title}</h2>
        {typeof count === 'number' && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${highlight ? 'bg-amber-100 text-amber-700' : 'bg-site-100 text-site-600'}`}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyCard({ icon: Icon, text }: { icon: typeof Building2; text: string }) {
  return (
    <div className="card p-8 text-center">
      <Icon size={32} className="mx-auto text-site-300 mb-2" />
      <p className="text-sm text-site-500">{text}</p>
    </div>
  )
}

function MembershipCard({ project, membership }: { project: Project | undefined; membership: ProjectMember }) {
  if (!project) return null
  const Icon = membership.status === 'approved' ? CheckCircle2 : membership.status === 'rejected' ? XCircle : Clock
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-safety-100 text-safety-600 flex items-center justify-center flex-shrink-0">
          <Building2 size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-site-900 truncate">{project.name}</p>
          <p className="text-xs text-site-500 mt-0.5">{ROLE_ZH[membership.role]}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium ${STATUS_STYLE[membership.status]}`}>
          <Icon size={12} />{STATUS_ZH[membership.status]}
        </span>
      </div>
    </div>
  )
}

function PendingApprovalCard({
  project, membership, onApprove, onReject,
}: {
  project: Project | undefined
  membership: ProjectMember
  onApprove: () => Promise<{ error: string | null }>
  onReject: () => Promise<{ error: string | null }>
}) {
  const [applicant, setApplicant] = useState<Applicant | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // v17 narrowed the user_profiles SELECT policy so a brand-new applicant
    // who shares no approved project with the approver is invisible to a
    // direct SELECT (admin / subcontractor approvers in particular).
    // Read via the SECURITY DEFINER RPC that gates on the same approver
    // predicate as `pendingForMe`. See supabase/v30-applicant-visibility.sql.
    supabase.rpc('admin_or_pm_list_applicants', { p_project_id: membership.project_id })
      .then(({ data, error }) => {
        if (error) {
          console.error('applicant rpc error:', error)
          setLoadError(true)
          setApplicant(null)
          return
        }
        const rows = (data as Applicant[] | null) ?? []
        const found = rows.find(r => r.id === membership.user_id) ?? null
        setLoadError(!found)
        setApplicant(found)
      })
  }, [membership.user_id, membership.project_id])

  if (!project) return null

  return (
    <div className="card p-4 border-amber-200">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-site-200 flex items-center justify-center text-site-700 font-bold flex-shrink-0">
          {applicant?.name.slice(0, 1) ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-site-900 truncate">{applicant?.name ?? '載入中...'}</p>
          <p className="text-xs text-site-500 mt-0.5">
            {applicant?.phone}{applicant?.company ? ` · ${applicant.company}` : ''}
          </p>
          <p className="text-xs text-site-700 mt-1">
            申請 <span className="font-semibold">{project.name}</span> · {ROLE_ZH[membership.role]}
          </p>
        </div>
      </div>
      {loadError && (
        <p className="text-xs text-red-600 mt-2">無法載入申請人資料</p>
      )}
      <div className="flex gap-2 mt-3 pt-3 border-t border-site-100">
        <button
          onClick={async () => { setBusy(true); await onReject(); setBusy(false) }}
          disabled={busy}
          className="flex-1 text-sm font-semibold border border-site-200 text-site-600 hover:bg-site-50 py-2 rounded-lg disabled:opacity-50"
        >
          拒絕
        </button>
        <button
          onClick={async () => { setBusy(true); await onApprove(); setBusy(false) }}
          disabled={busy || !applicant}
          className="flex-1 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? <Spinner size={16} className="text-white mx-auto" /> : '批准'}
        </button>
      </div>
    </div>
  )
}

function DesignateSafetyOfficerCard({
  project, membership, onDone,
}: {
  project: Project | undefined
  membership: ProjectMember
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // An assigned PM / admin may read the profile of an approved member of
    // their project (v17 is_pm_of_applicant). Resolve the name for display.
    supabase.from('user_profiles').select('name').eq('id', membership.user_id).maybeSingle()
      .then(({ data }) => {
        setName((data as { name: string } | null)?.name ?? null)
      })
  }, [membership.user_id])

  if (!project) return null

  async function handleAssign() {
    setBusy(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('pm_assign_safety_officer', {
      p_project_id: membership.project_id,
      p_user_id: membership.user_id,
    })
    if (rpcErr) {
      setError(rpcErr.message)
      setBusy(false)
      return
    }
    setConfirmOpen(false)
    setBusy(false)
    await onDone()
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-site-200 flex items-center justify-center text-site-700 font-bold flex-shrink-0">
          {name?.slice(0, 1) ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-site-900 truncate">{name ?? '載入中...'}</p>
          <p className="text-xs text-site-700 mt-0.5">
            <span className="font-semibold">{project.name}</span> · {ROLE_ZH[membership.role]}
          </p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-site-100">
        <button
          onClick={() => { setError(null); setConfirmOpen(true) }}
          className="w-full text-sm font-semibold border border-safety-200 text-safety-700 hover:bg-safety-50 py-2 rounded-lg inline-flex items-center justify-center gap-1"
        >
          <ShieldCheck size={16} /> 設為安全主任（PTW 簽核）
        </button>
      </div>

      {confirmOpen && (
        <Modal open title="委派安全主任" onClose={() => { if (!busy) setConfirmOpen(false) }}>
          <div className="space-y-3">
            <p className="text-sm text-site-700">
              確認將 <span className="font-semibold">{name ?? '此成員'}</span> 於工地{' '}
              <span className="font-semibold">{project.name}</span> 的角色更改為{' '}
              <span className="font-semibold">安全主任</span>？此後該成員可簽核此工地的工作許可證（PTW）。
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={handleAssign}
              >
                {busy ? <Spinner size={16} className="text-white mx-auto" /> : '確認委派'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
