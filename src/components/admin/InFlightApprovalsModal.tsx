import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { supabase } from '../../lib/supabase'
import type { ChainStep, GlobalRole, UserProfile } from '../../types'
import { ROLE_ZH, APPROVAL_ACTION_ZH } from '../../types'

type DocType = 'si' | 'vo'

interface InFlightRow {
  doc_type: DocType
  id: string
  number: string
  project_id: string
  current_step: number
  chain_snapshot: ChainStep[] | null
  status: string
}

interface Props {
  userId: string
  userName: string
  open: boolean
  onClose: () => void
}

const ACTIVE_STATUSES = ['submitted', 'in_review', 'revision_requested']

export function InFlightApprovalsModal({ userId, userName, open, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<InFlightRow[]>([])
  const [target, setTarget] = useState<UserProfile | null>(null)
  const [memberRoles, setMemberRoles] = useState<Record<string, GlobalRole>>({})
  const [overrideRow, setOverrideRow] = useState<InFlightRow | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setToast(null)
    let cancelled = false
    async function load() {
      setLoading(true)

      // Load target user profile
      const { data: u } = await supabase
        .from('user_profiles').select('*').eq('id', userId).single()
      if (cancelled) return
      setTarget((u as UserProfile) || null)

      // Per-project role for the target via project_members
      const { data: mems } = await supabase
        .from('project_members')
        .select('project_id, role, status')
        .eq('user_id', userId)
        .eq('status', 'approved')
      const roleMap: Record<string, GlobalRole> = {}
      ;(mems || []).forEach((m: any) => {
        if (m.project_id && m.role) roleMap[m.project_id] = m.role as GlobalRole
      })
      if (cancelled) return
      setMemberRoles(roleMap)

      // Pending SI + VO (admin RLS sees all)
      const [siRes, voRes] = await Promise.all([
        supabase
          .from('site_instructions')
          .select('id, project_id, number, current_step, chain_snapshot, status, created_by')
          .in('status', ACTIVE_STATUSES),
        supabase
          .from('variation_orders')
          .select('id, project_id, number, current_step, chain_snapshot, status, created_by')
          .in('status', ACTIVE_STATUSES),
      ])

      const all: InFlightRow[] = []
      ;(siRes.data || []).forEach((r: any) => {
        if (matchesUser(r, userId, roleMap, (u as UserProfile)?.global_role)) {
          all.push({ doc_type: 'si', id: r.id, number: r.number, project_id: r.project_id, current_step: r.current_step, chain_snapshot: r.chain_snapshot, status: r.status })
        }
      })
      ;(voRes.data || []).forEach((r: any) => {
        if (matchesUser(r, userId, roleMap, (u as UserProfile)?.global_role)) {
          all.push({ doc_type: 'vo', id: r.id, number: r.number, project_id: r.project_id, current_step: r.current_step, chain_snapshot: r.chain_snapshot, status: r.status })
        }
      })

      if (cancelled) return
      setRows(all)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, userId])

  async function submitOverride() {
    if (!overrideRow) return
    if (reason.trim().length < 10) {
      setToast({ kind: 'err', msg: '原因需至少 10 個字元' })
      return
    }
    setSubmitting(true)
    setToast(null)
    const { error } = await supabase.rpc('submit_approval', {
      p_doc_type: overrideRow.doc_type,
      p_doc_id: overrideRow.id,
      p_action_type: 'admin_override',
      p_reason: reason.trim(),
      p_edits_jsonb: null,
    })
    setSubmitting(false)
    if (error) {
      setToast({ kind: 'err', msg: `失敗：${error.message}` })
      return
    }
    setToast({ kind: 'ok', msg: `已對 ${overrideRow.doc_type.toUpperCase()}-${overrideRow.number} 執行管理員介入` })
    setOverrideRow(null)
    setReason('')
    // Refresh list
    setRows(prev => prev.filter(r => !(r.doc_type === overrideRow.doc_type && r.id === overrideRow.id)))
  }

  return (
    <Modal open={open} onClose={onClose} title={`待處理簽核 — ${userName}`}>
      {loading ? (
        <div className="py-8 flex justify-center"><Spinner size={24} /></div>
      ) : (
        <>
          <p className="text-xs text-site-500 mb-3 leading-relaxed">
            列出所有等待 {target?.name || userName} 處理嘅 SI / VO。如該用戶離職或長期請假，可用「管理員介入」 ({APPROVAL_ACTION_ZH.admin_override}) 重新分派 — 此動作會記入審計日誌。
          </p>

          {rows.length === 0 ? (
            <div className="card p-6 text-center text-sm text-site-500">
              未有任何待處理簽核工作
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <InFlightRowCard
                  key={`${r.doc_type}-${r.id}`}
                  row={r}
                  onOverride={() => { setOverrideRow(r); setReason(''); setToast(null) }}
                />
              ))}
            </div>
          )}

          {toast && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${
              toast.kind === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {toast.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {toast.msg}
            </div>
          )}
        </>
      )}

      {/* Override reason modal */}
      {overrideRow && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={18} className="text-amber-600" />
              <h4 className="text-base font-bold text-site-900">管理員介入</h4>
            </div>
            <p className="text-xs text-site-600 mb-3">
              將會對 <span className="font-bold">{overrideRow.doc_type.toUpperCase()}-{overrideRow.number}</span> 執行 admin_override 重新分派。請輸入原因 (至少 10 字元，將記入審計日誌)。
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="例如：張三 已離職，重新分派到 李四..."
              className="input"
            />
            <p className="text-[10px] text-site-400 mt-1">{reason.trim().length} / 10 字元</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setOverrideRow(null); setReason('') }}
                disabled={submitting}
                className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
              >
                取消
              </button>
              <button
                onClick={submitOverride}
                disabled={submitting || reason.trim().length < 10}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
              >
                {submitting ? <Spinner size={14} className="text-white" /> : <ShieldAlert size={14} />}
                確認介入
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Match logic: a pending doc applies to `userId` if any of:
//   - they created the doc (subcon awaiting decisions tracks back too)
//   - the current chain step's optional_user_id == userId
//   - their per-project member role matches the current chain step's required_role
//   - they are global admin (admin shows up on everyone's queue conceptually — we exclude)
function matchesUser(
  row: any,
  userId: string,
  roleMap: Record<string, GlobalRole>,
  _globalRole?: GlobalRole,
): boolean {
  if (!row) return false
  const snapshot: ChainStep[] | null = row.chain_snapshot
  const step = snapshot?.[row.current_step]
  if (!step) {
    // No live step (e.g., revision_requested back at step 0 with no snapshot) —
    // surface to creator so admin can see the doc they originated.
    return row.created_by === userId
  }
  if (step.optional_user_id && step.optional_user_id === userId) return true
  const projectRole = roleMap[row.project_id]
  if (projectRole && projectRole === step.required_role) return true
  // Also surface the creator (they "own" the doc; they may want re-routing because they're blocked)
  if (row.created_by === userId) return true
  return false
}

function InFlightRowCard({ row, onOverride }: { row: InFlightRow; onOverride: () => void }) {
  const step = useMemo(() => row.chain_snapshot?.[row.current_step] || null, [row])
  const roleLabel = step ? ROLE_ZH[step.required_role as GlobalRole] || step.required_role : null
  return (
    <div className="card p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-site-900">
          <span className="font-mono">{row.doc_type.toUpperCase()}-{row.number}</span>
          {roleLabel && <span className="ml-2 text-xs text-site-500 font-normal">(待 {roleLabel} 批准)</span>}
        </p>
        <p className="text-[10px] text-site-400 mt-0.5">
          狀態: {row.status} · 步驟 {row.current_step + 1}
        </p>
      </div>
      <button
        onClick={onOverride}
        className="text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-3 py-2 rounded-lg flex items-center gap-1 flex-shrink-0 min-h-0"
      >
        <ShieldAlert size={12} /> 重新分派
      </button>
    </div>
  )
}
