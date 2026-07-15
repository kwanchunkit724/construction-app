import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, ShieldQuestion } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Spinner } from './Spinner'
import { useStepUp } from '../contexts/StepUpContext'
import { verifyCredential, isCredentialValid, CREDENTIAL_TYPE_ZH } from '../lib/credentials'
import type { UserCredential } from '../types'

// Manager-only panel: lists UNVERIFIED credentials of project co-members and
// lets admin / PM / safety_officer vouch for them (verify_user_credential, which
// is step-up gated via assert_step_up('membership') server side — so we mint
// that grant client side first). RLS already scopes the readable set to the
// caller's co-members (user_credentials_select: shares_project_with). Kept
// minimal per the plan; rendered on EquipmentList only when canManage.

interface PendingCred extends UserCredential {
  _name?: string
}

export function VerifyCredentialsPanel() {
  const { requireStepUp } = useStepUp()
  const [pending, setPending] = useState<PendingCred[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Unverified credentials visible to me (RLS narrows to co-members + own).
    const { data, error: e } = await supabase
      .from('user_credentials')
      .select('*')
      .is('verified_at', null)
      .order('created_at', { ascending: false })
    if (e) {
      console.error('pending credentials fetch error:', e)
      setLoading(false)
      return
    }
    const rows = (data || []) as UserCredential[]
    // Resolve signer names in one round-trip.
    const ids = Array.from(new Set(rows.map(r => r.user_id)))
    const nameById: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('user_profiles').select('id, name').in('id', ids)
      ;(profs || []).forEach((p: any) => { nameById[p.id] = p.name })
    }
    setPending(rows.map(r => ({ ...r, _name: nameById[r.user_id] })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function verify(c: PendingCred) {
    setError('')
    // Identity vouching is high-risk → step-up (membership class) first.
    const ok = await requireStepUp('membership')
    if (!ok) return
    setBusyId(c.id)
    const { error: e } = await verifyCredential(c.id)
    setBusyId(null)
    if (e) { setError(e); return }
    await load()
  }

  if (loading) {
    return (
      <div className="card p-4 flex justify-center"><Spinner size={20} /></div>
    )
  }

  if (pending.length === 0) return null  // nothing to verify → hide entirely

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldQuestion size={16} className="text-amber-600" />
        <span className="text-sm font-semibold text-site-900">待核實證書 ({pending.length})</span>
      </div>
      <p className="text-xs text-site-500 mb-3 leading-relaxed">
        核實成員上載的合資格人士證書。核實後該成員便可簽署相應法定表格。請先核對實體證書。
      </p>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-2">{error}</p>
      )}
      <div className="space-y-1.5">
        {pending.map(c => (
          <div key={c.id} className="flex items-center gap-2 bg-site-50 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-site-900 truncate">
                {c._name || '成員'} · {c.cert_name_zh}
              </p>
              <p className="text-[10px] text-site-500 truncate">
                {CREDENTIAL_TYPE_ZH[c.credential_type] ?? c.credential_type}
                {c.cert_no && ` · ${c.cert_no}`}
                {c.valid_until && ` · 有效至 ${c.valid_until}`}
                {c.valid_until && !isCredentialValid({ ...c, verified_at: '1' }) && ' (已過期)'}
              </p>
            </div>
            <button
              onClick={() => verify(c)}
              disabled={busyId === c.id}
              className="text-xs font-semibold bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white rounded-lg px-3 py-1.5 flex items-center gap-1 flex-shrink-0"
            >
              {busyId === c.id ? <Spinner size={12} className="text-white" /> : <BadgeCheck size={12} />}
              核實
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
