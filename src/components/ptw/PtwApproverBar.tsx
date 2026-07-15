import { useEffect, useMemo, useState } from 'react'
import { Check, ArrowLeftToLine, X as XIcon, Shield } from 'lucide-react'
import { Modal } from '../Modal'
import { PtwSignaturePad } from './PtwSignaturePad'
import { usePtw } from '../../contexts/PtwContext'
import { useAuth } from '../../contexts/AuthContext'
import { useProjects } from '../../contexts/ProjectsContext'
import { useStepUp } from '../../contexts/StepUpContext'
import { useSignReauth } from '../../contexts/SignReauthContext'
import { useIsOnline } from '../../hooks/useIsOnline'
import { OfflineBanner } from '../OfflineBanner'
import { supabase } from '../../lib/supabase'
import type { PTW, ChainStep } from '../../types'

interface Props {
  ptw: PTW
  onAction: () => void
}

type Action = 'sign' | 'revision' | 'reject' | 'admin_override' | null

export function PtwApproverBar({ ptw, onAction }: Props) {
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const { approve, requestRevision, reject, adminOverride } = usePtw()
  const { requireStepUp } = useStepUp()
  const { requireSignReauth } = useSignReauth()
  const online = useIsOnline()
  const [activeAction, setActiveAction] = useState<Action>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = profile?.global_role === 'admin'

  // chain_snapshot is typed `unknown` on PTW; narrow defensively to the same
  // ChainStep shape SI/VO use. The active chain step dictates who may act.
  const chain = Array.isArray(ptw.chain_snapshot) ? (ptw.chain_snapshot as ChainStep[]) : null
  const step = chain?.[ptw.current_step] ?? null
  const requiredRole = step?.required_role
  const optionalUser = step?.optional_user_id ?? null

  // Active delegations TO this user (delegate_to = me, today within validity).
  // Fetched inline to avoid new provider plumbing. RLS lets the delegate read
  // their own rows. We only need the grantor id (user_id) to check role holding.
  const [delegators, setDelegators] = useState<string[]>([])
  useEffect(() => {
    if (!profile) {
      setDelegators([])
      return
    }
    let cancelled = false
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('delegations')
      .select('user_id')
      .eq('delegate_to', profile.id)
      .lte('valid_from', today)
      .gte('valid_until', today)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('delegations fetch error:', error)
          setDelegators([])
          return
        }
        setDelegators(((data as { user_id: string }[] | null) ?? []).map(d => d.user_id))
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  // Mirror server-side active_role_holders(project_id, required_role): admin,
  // assigned PM (when required_role='pm'), approved project_member with matching
  // role, the chain step's optional_user_id, OR a delegate whose grantor holds
  // required_role on the project. Server stays source of truth — this gate just
  // avoids showing the signature step to members the RPC would later reject.
  const canAct = useMemo(() => {
    if (!profile) return false
    if (ptw.status !== 'in_review') return false
    if (isAdmin) return true
    if (!requiredRole) return false
    if (optionalUser) return optionalUser === profile.id
    const proj = projects.find(p => p.id === ptw.project_id)
    const holdsRole = (uid: string) =>
      (requiredRole === 'pm' && (proj?.assigned_pm_ids.includes(uid) ?? false)) ||
      memberships.some(
        m =>
          m.project_id === ptw.project_id &&
          m.user_id === uid &&
          m.status === 'approved' &&
          m.role === requiredRole,
      )
    if (holdsRole(profile.id)) return true
    return delegators.some(holdsRole)
  }, [profile, isAdmin, requiredRole, optionalUser, projects, memberships, ptw.project_id, ptw.status, delegators])

  // Can act only when status is in_review (chain advancing) AND the user is in
  // the active role (admin, role holder, optional signer, or delegate). The
  // admin_override affordance below stays available to admins regardless.
  if (ptw.status !== 'in_review') return null
  if (!canAct && !isAdmin) return null

  async function handleSign(b64: string) {
    if (!(await requireStepUp('approval'))) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: aErr } = await approve(ptw.id)
      if (aErr) throw new Error(aErr)
      // Sign re-auth (#9) right before the signoff RPC: when enforcement is ON,
      // the signer re-enters their login password so the signature stands up as
      // 本人 for a 勞工處 dispute. record_ptw_signoff re-asserts assert_sign_reauth
      // server-side, so a false here (cancel / wrong password) MUST abort —
      // otherwise the RPC would just raise 簽名前需要重新輸入密碼確認身份.
      if (!(await requireSignReauth())) {
        setSubmitting(false)
        return
      }
      const { error: sErr } = await supabase.rpc('record_ptw_signoff', {
        p_ptw_id: ptw.id,
        p_signature_b64: b64,
      })
      if (sErr) throw new Error(sErr.message)
      setActiveAction(null)
      onAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : '簽核失敗')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReasonAction() {
    if (reason.trim().length < 10) {
      setError('需要至少 10 個字元嘅原因')
      return
    }
    if (!(await requireStepUp('approval'))) return
    setSubmitting(true)
    setError(null)
    try {
      let res: { error: string | null }
      if (activeAction === 'revision') res = await requestRevision(ptw.id, reason)
      else if (activeAction === 'reject') res = await reject(ptw.id, reason)
      else if (activeAction === 'admin_override') res = await adminOverride(ptw.id, reason)
      else return
      if (res.error) throw new Error(res.error)
      setReason('')
      setActiveAction(null)
      onAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {!online && <div className="mb-2"><OfflineBanner /></div>}
      <div className="card p-3 flex flex-wrap gap-2 sticky bottom-0">
        {canAct && (
          <>
            <button
              type="button"
              className="btn-primary flex-1 min-w-[8rem]"
              disabled={!online}
              onClick={() => setActiveAction('sign')}
            >
              <Check size={16} className="inline mr-1" />
              簽署批准
            </button>
            <button
              type="button"
              className="btn-ghost flex-1 min-w-[7rem] text-amber-700"
              disabled={!online}
              onClick={() => setActiveAction('revision')}
            >
              <ArrowLeftToLine size={16} className="inline mr-1" />
              退回
            </button>
            <button
              type="button"
              className="btn-ghost flex-1 min-w-[6rem] text-red-700"
              disabled={!online}
              onClick={() => setActiveAction('reject')}
            >
              <XIcon size={16} className="inline mr-1" />
              拒絕
            </button>
          </>
        )}
        {/* v76: a mandatory safety_officer PTW step cannot be satisfied by
            admin_override (server-enforced in submit_approval) — hide the
            affordance so an admin isn't offered a button that would error. */}
        {isAdmin && requiredRole !== 'safety_officer' && (
          <button
            type="button"
            className="btn-ghost flex-1 min-w-[8rem] text-purple-700"
            disabled={!online}
            onClick={() => setActiveAction('admin_override')}
          >
            <Shield size={16} className="inline mr-1" />
            管理員指派
          </button>
        )}
      </div>

      {activeAction === 'sign' && (
        <Modal open title="簽署批准" onClose={() => setActiveAction(null)}>
          <PtwSignaturePad
            title="簽名以批准呢張工作許可證"
            onSign={handleSign}
            onCancel={() => setActiveAction(null)}
          />
          {submitting && <p className="mt-2 text-sm text-site-500">處理中...</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </Modal>
      )}

      {(activeAction === 'revision' || activeAction === 'reject' || activeAction === 'admin_override') && (
        <Modal
          open
          title={
            activeAction === 'revision' ? '退回' :
            activeAction === 'reject' ? '拒絕' :
            '管理員指派'
          }
          onClose={() => { setActiveAction(null); setReason(''); setError(null) }}
        >
          <div className="space-y-3">
            <label className="label">原因 (最少 10 個字元)</label>
            <textarea
              className="input"
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="說明原因..."
            />
            <p className="text-xs text-site-500 text-right">{reason.length}/10+</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost flex-1"
                onClick={() => { setActiveAction(null); setReason(''); setError(null) }}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleReasonAction}
                disabled={submitting || reason.trim().length < 10}
              >
                {submitting ? '處理中...' : '確認'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
