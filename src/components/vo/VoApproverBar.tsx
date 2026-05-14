import { useMemo, useState } from 'react'
import { Check, Edit3, CornerUpLeft, X, ShieldAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useVo } from '../../contexts/VoContext'
import { Spinner } from '../Spinner'
import { VoLineItemsEditor, validateLineItems } from './VoLineItemsEditor'
import type { VO, VOVersion, VoPayload, VoLineItem, ProgressItem } from '../../types'

const MIN_REASON = 10

type ModalKind = null | 'reason-revision' | 'reason-reject' | 'reason-admin' | 'edits'

export interface VoApproverBarProps {
  vo: VO
  latestVersion?: VOVersion
  progressItems?: ProgressItem[]
}

export function VoApproverBar({ vo, latestVersion, progressItems }: VoApproverBarProps) {
  const { profile } = useAuth()
  const { approve, requestRevision, reject, adminOverride } = useVo()

  const requiredRole = vo.chain_snapshot?.[vo.current_step]?.required_role
  const optionalUser = vo.chain_snapshot?.[vo.current_step]?.optional_user_id ?? null
  const isAdmin = profile?.global_role === 'admin'

  const canAct = useMemo(() => {
    if (!profile || !requiredRole) return false
    if (vo.status !== 'in_review') return false
    if (optionalUser) return optionalUser === profile.id || isAdmin
    return profile.global_role === requiredRole || isAdmin
  }, [profile, requiredRole, optionalUser, isAdmin, vo.status])

  const [modal, setModal] = useState<ModalKind>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [edited, setEdited] = useState<VoPayload | null>(null)

  function openReason(kind: 'reason-revision' | 'reason-reject' | 'reason-admin') {
    setReason('')
    setError(null)
    setModal(kind)
  }

  function openEdits() {
    setEdited(
      latestVersion
        ? { ...latestVersion.payload, line_items: latestVersion.payload.line_items.map(li => ({ ...li })) }
        : { description: '', line_items: [], total_amount_cents: 0 },
    )
    setError(null)
    setModal('edits')
  }

  async function runAction(fn: () => Promise<{ error: string | null }>) {
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await fn()
      if (e) {
        setError(e)
        return
      }
      setModal(null)
      setReason('')
      setEdited(null)
    } finally {
      setBusy(false)
    }
  }

  if (!canAct && !isAdmin) return null
  if (!canAct && isAdmin && vo.status !== 'in_review') return null

  return (
    <>
      <div
        className="sticky bottom-0 left-0 right-0 z-30 bg-white border-t border-site-200 p-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {canAct ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(() => approve(vo.id))}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-green-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              <Check size={16} />
              <span>批准</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openEdits}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              <Edit3 size={16} />
              <span>批准並修訂</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openReason('reason-revision')}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-amber-500 text-white font-semibold text-sm disabled:opacity-50"
            >
              <CornerUpLeft size={16} />
              <span>退回</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openReason('reason-reject')}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              <X size={16} />
              <span>拒絕</span>
            </button>
          </div>
        ) : (
          isAdmin && (
            <button
              type="button"
              disabled={busy}
              onClick={() => openReason('reason-admin')}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-purple-600 text-white font-semibold text-sm disabled:opacity-50"
            >
              <ShieldAlert size={16} />
              <span>管理員介入</span>
            </button>
          )
        )}
        {error && (
          <p className="mt-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
            {error}
          </p>
        )}
      </div>

      {(modal === 'reason-revision' || modal === 'reason-reject' || modal === 'reason-admin') && (
        <ReasonModal
          title={
            modal === 'reason-revision'
              ? '退回 (要求修訂)'
              : modal === 'reason-reject'
              ? '拒絕'
              : '管理員介入'
          }
          reason={reason}
          setReason={setReason}
          busy={busy}
          error={error}
          onClose={() => setModal(null)}
          onSubmit={() => {
            if (reason.trim().length < MIN_REASON) return
            if (modal === 'reason-revision') {
              return runAction(() => requestRevision(vo.id, reason.trim()))
            }
            if (modal === 'reason-reject') {
              return runAction(() => reject(vo.id, reason.trim()))
            }
            return runAction(() => adminOverride(vo.id, reason.trim()))
          }}
        />
      )}

      {modal === 'edits' && edited && (
        <EditPayloadModal
          payload={edited}
          setPayload={setEdited}
          progressItems={progressItems ?? []}
          busy={busy}
          error={error}
          onClose={() => setModal(null)}
          onSubmit={editedPayload => runAction(() => approve(vo.id, editedPayload))}
        />
      )}
    </>
  )
}

function ReasonModal({
  title, reason, setReason, busy, error, onClose, onSubmit,
}: {
  title: string
  reason: string
  setReason: (v: string) => void
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: () => void
}) {
  const ok = reason.trim().length >= MIN_REASON
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-5 py-3 border-b border-site-100">
          <h3 className="font-bold text-site-900">{title}</h3>
        </div>
        <div className="px-5 py-4">
          <label className="label">原因 (最少 {MIN_REASON} 字)</label>
          <textarea
            rows={4}
            className="input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="請填寫具體原因…"
            autoFocus
          />
          <p className="text-[10px] text-site-400 mt-1 text-right">
            ({reason.trim().length}/{MIN_REASON} chars min)
          </p>
          {error && (
            <p className="mt-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-site-100 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost flex-1">
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!ok || busy}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-1"
          >
            {busy && <Spinner size={14} className="text-white" />}
            <span>提交</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function EditPayloadModal({
  payload, setPayload, progressItems, busy, error, onClose, onSubmit,
}: {
  payload: VoPayload
  setPayload: (p: VoPayload | null) => void
  progressItems: ProgressItem[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (editedPayload: VoPayload) => void
}) {
  function updateDescription(v: string) {
    setPayload({ ...payload, description: v })
  }
  function updateLineItems(next: VoLineItem[]) {
    setPayload({ ...payload, line_items: next })
  }
  const lineItemError = validateLineItems(payload.line_items)
  const ok = payload.description.trim().length > 0 && lineItemError === null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-site-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-5 py-3 border-b border-site-100 bg-white rounded-t-2xl">
          <h3 className="font-bold text-site-900">批准並修訂</h3>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
          <div>
            <label className="label">描述</label>
            <textarea
              rows={4}
              className="input"
              maxLength={4000}
              value={payload.description}
              onChange={e => updateDescription(e.target.value)}
            />
          </div>
          <div>
            <p className="label mb-2">項目</p>
            <VoLineItemsEditor
              value={payload.line_items}
              onChange={updateLineItems}
              progressItems={progressItems}
            />
            {lineItemError && payload.line_items.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700">{lineItemError}</p>
            )}
          </div>
          {error && (
            <p className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-site-100 bg-white flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost flex-1">
            取消
          </button>
          <button
            type="button"
            onClick={() => onSubmit(payload)}
            disabled={!ok || busy}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-1"
          >
            {busy && <Spinner size={14} className="text-white" />}
            <span>批准並修訂</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoApproverBar
