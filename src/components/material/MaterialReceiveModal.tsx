import { useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import {
  useMaterials,
  MATERIAL_STATUS_ZH,
} from '../../contexts/MaterialsContext'
import type { Material, MaterialStatus } from '../../contexts/MaterialsContext'

export interface MaterialReceiveModalProps {
  material: Material
  onClose: () => void
  onDone: () => void
}

// Mirror of the Postgres GENERATED status expression so the preview matches
// what the row will look like after the update lands.
function projectStatus(arrived: number, needed: number): MaterialStatus {
  if (arrived >= needed && needed > 0) return 'arrived'
  if (arrived > 0) return 'partial'
  return 'requested'
}

export function MaterialReceiveModal({
  material,
  onClose,
  onDone,
}: MaterialReceiveModalProps) {
  const { receiveMaterial } = useMaterials()

  const remaining = Math.max(0, Number(material.qty_needed) - Number(material.qty_arrived))
  const [qtyStr, setQtyStr] = useState<string>(remaining > 0 ? String(remaining) : '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qty = Number(qtyStr)
  const validQty = qtyStr !== '' && Number.isFinite(qty) && qty > 0

  const preview = useMemo(() => {
    const nextArrived = Number(material.qty_arrived) + (validQty ? qty : 0)
    const nextStatus = projectStatus(nextArrived, Number(material.qty_needed))
    return { nextArrived, nextStatus }
  }, [material.qty_arrived, material.qty_needed, qty, validQty])

  async function handleSubmit() {
    if (!validQty || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: e } = await receiveMaterial(material.id, qty)
    setSubmitting(false)
    if (e) {
      setError(e)
      return
    }
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="入貨記錄"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-ghost flex-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!validQty || submitting}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size={16} className="text-white" />}
            <span>確認入貨</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-site-100 rounded-xl p-3">
          <p className="font-semibold text-site-900 break-words">{material.name}</p>
          <p className="text-xs text-site-600 mt-1">
            目前到貨：
            <span className="font-mono">{material.qty_arrived}</span>
            <span className="text-site-400"> / </span>
            <span className="font-mono">{material.qty_needed}</span>
            <span> {material.unit}</span>
          </p>
        </div>

        <div>
          <label className="label">今次到貨數量 ({material.unit})</label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="input"
            value={qtyStr}
            onChange={e => setQtyStr(e.target.value)}
            placeholder="0"
            autoFocus
          />
          {qtyStr !== '' && !validQty && (
            <p className="text-[11px] text-red-600 mt-1">到貨數量需大於 0</p>
          )}
          {validQty && qty > remaining && remaining > 0 && (
            <p className="text-[11px] text-amber-700 mt-1">
              數量超出剩餘需要 ({remaining} {material.unit})，仍會記錄為實際到貨。
            </p>
          )}
        </div>

        <div className="border border-site-200 rounded-xl p-3 text-sm">
          <p className="text-site-500 text-xs mb-1">預覽</p>
          <p className="text-site-900">
            到貨後總數：
            <span className="font-mono font-bold">{preview.nextArrived}</span>
            <span className="text-site-400"> / </span>
            <span className="font-mono font-bold">{material.qty_needed}</span>
            <span className="text-site-500"> {material.unit}</span>
          </p>
          <p className="text-site-900 mt-1">
            狀態變：
            <span className="ml-1 inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold bg-site-100 text-site-700">
              {MATERIAL_STATUS_ZH[material.status]}
            </span>
            <span className="mx-1 text-site-400">→</span>
            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold bg-safety-100 text-safety-700">
              {MATERIAL_STATUS_ZH[preview.nextStatus]}
            </span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default MaterialReceiveModal
