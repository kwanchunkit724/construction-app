import { useState } from 'react'
import { X } from 'lucide-react'
import { useVo } from '../../contexts/VoContext'
import { VoLineItemsEditor, validateLineItems } from './VoLineItemsEditor'
import { Spinner } from '../Spinner'
import type { SI, VoLineItem, VoPayload, ProgressItem } from '../../types'

const MAX_DESC = 4000

export interface VoSubmitFormProps {
  projectId: string
  parentSi?: SI
  progressItems?: ProgressItem[]
  onSubmitted: (voId: string, total: number) => void
  onCancel: () => void
}

export function VoSubmitForm({ projectId: _projectId, parentSi, progressItems, onSubmitted, onCancel }: VoSubmitFormProps) {
  const { createDraftVo, saveVersion, submitVo, refetch, vos } = useVo()

  const [description, setDescription] = useState('')
  const [lineItems, setLineItems] = useState<VoLineItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lineItemError = validateLineItems(lineItems)
  const canSubmit =
    description.trim().length > 0 &&
    lineItemError === null &&
    !submitting

  async function onSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { id: voId, error: e1 } = await createDraftVo(parentSi?.id ?? null)
      if (e1 || !voId) {
        setError(e1 ?? '建立草稿失敗')
        return
      }
      const payload: VoPayload = {
        description: description.trim(),
        line_items: lineItems,
        total_amount_cents: 0, // server trigger recomputes
      }
      const { error: e2 } = await saveVersion(voId, payload)
      if (e2) {
        setError(e2)
        return
      }
      const { error: e3 } = await submitVo(voId)
      if (e3) {
        setError(e3)
        return
      }
      // Refetch to read server-computed total_amount_cents.
      await refetch()
      const fresh = vos.find(v => v.id === voId)
      // refetch updates state asynchronously — re-read via direct query as fallback
      let serverTotal = fresh?.total_amount_cents ?? 0
      if (!serverTotal) {
        // Direct read fallback (state may not have flushed yet)
        const { supabase } = await import('../../lib/supabase')
        const { data } = await supabase
          .from('variation_orders')
          .select('total_amount_cents')
          .eq('id', voId)
          .single()
        serverTotal = data?.total_amount_cents ?? 0
      }
      onSubmitted(voId, serverTotal)
    } catch (e: any) {
      console.error('VoSubmitForm submit error:', e)
      setError(e?.message ?? '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="bg-site-50 w-full sm:max-w-md md:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-site-100 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-bold text-site-900">新增變更指令（變更工程估價）</h3>
            <p className="text-[11px] text-site-500 mt-0.5">
              {parentSi
                ? <>引用工地指令 <span className="font-mono">{parentSi.number}</span></>
                : '獨立變更（不引用工地指令）'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-site-400 hover:text-site-700 -mr-2"
            aria-label="關閉"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="label">描述</label>
            <textarea
              className="input min-h-[112px]"
              rows={4}
              maxLength={MAX_DESC}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="說明變更原因及範圍…"
            />
            <p className="text-[10px] text-site-400 mt-1 text-right">
              {description.length}/{MAX_DESC}
            </p>
          </div>

          <div>
            <p className="label mb-2">項目</p>
            <VoLineItemsEditor
              value={lineItems}
              onChange={setLineItems}
              progressItems={progressItems ?? []}
            />
            {lineItemError && lineItems.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700">{lineItemError}</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-site-100 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-ghost flex-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size={16} className="text-white" />}
            <span>提交</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default VoSubmitForm
