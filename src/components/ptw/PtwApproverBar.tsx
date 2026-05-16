import { useState } from 'react'
import { Check, ArrowLeftToLine, X as XIcon, Shield } from 'lucide-react'
import { Modal } from '../Modal'
import { PtwSignaturePad } from './PtwSignaturePad'
import { usePtw } from '../../contexts/PtwContext'
import { useAuth } from '../../contexts/AuthContext'
import { useIsOnline } from '../../hooks/useIsOnline'
import { OfflineBanner } from '../OfflineBanner'
import { supabase } from '../../lib/supabase'
import type { PTW } from '../../types'

interface Props {
  ptw: PTW
  onAction: () => void
}

type Action = 'sign' | 'revision' | 'reject' | 'admin_override' | null

export function PtwApproverBar({ ptw, onAction }: Props) {
  const { profile } = useAuth()
  const { approve, requestRevision, reject, adminOverride } = usePtw()
  const online = useIsOnline()
  const [activeAction, setActiveAction] = useState<Action>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Can act only when status is in_review (chain advancing).
  if (ptw.status !== 'in_review') return null

  const isAdmin = profile?.global_role === 'admin'

  async function handleSign(b64: string) {
    setSubmitting(true)
    setError(null)
    try {
      const { error: aErr } = await approve(ptw.id)
      if (aErr) throw new Error(aErr)
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
        {isAdmin && (
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
