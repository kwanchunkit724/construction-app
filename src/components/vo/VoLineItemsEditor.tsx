import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { VoLineItemRow } from './VoLineItemRow'
import type { VoLineItem, ProgressItem } from '../../types'
import { formatHKD } from '../../lib/currency'

export interface VoLineItemsEditorProps {
  value: VoLineItem[]
  onChange: (next: VoLineItem[]) => void
  progressItems: ProgressItem[]
}

function makeBlankItem(): VoLineItem {
  return {
    category: 'labour',
    description: '',
    quantity: 0,
    unit: '',
    unit_price_cents: 0,
    subtotal_cents: 0,
    progress_leaf_item_id: null,
  }
}

export function VoLineItemsEditor({ value, onChange, progressItems }: VoLineItemsEditorProps) {
  const totalPreviewCents = useMemo(
    () => value.reduce((sum, li) => sum + (li.subtotal_cents || 0), 0),
    [value],
  )

  function replaceAt(idx: number, next: VoLineItem) {
    const arr = value.slice()
    arr[idx] = next
    onChange(arr)
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function addRow() {
    onChange([...value, makeBlankItem()])
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-site-500 mb-3">尚未有項目</p>
          <button
            type="button"
            onClick={addRow}
            className="btn-primary inline-flex items-center gap-1"
          >
            <Plus size={16} />
            <span>新增項目</span>
          </button>
        </div>
      ) : (
        <>
          {value.map((item, i) => (
            <VoLineItemRow
              key={i}
              item={item}
              index={i}
              onChange={n => replaceAt(i, n)}
              onRemove={() => removeAt(i)}
              progressItems={progressItems}
            />
          ))}
          <button
            type="button"
            onClick={addRow}
            className="btn-ghost w-full inline-flex items-center justify-center gap-1"
          >
            <Plus size={16} />
            <span>新增項目</span>
          </button>
        </>
      )}

      {/* Sticky-ish footer with client-preview total */}
      <div className="sticky bottom-0 bg-white border border-site-200 rounded-xl px-4 py-3 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-sm text-site-600">經系統核算總額 (預覽)</span>
          <span className="text-lg font-bold text-site-900 tabular-nums">
            {formatHKD(totalPreviewCents)}
          </span>
        </div>
        <p className="text-[10px] text-site-400 mt-1">
          *提交後以系統核算為準
        </p>
      </div>
    </div>
  )
}

// Validation helper used by VoSubmitForm.
export function validateLineItems(items: VoLineItem[]): string | null {
  if (items.length === 0) return '至少新增一個項目'
  for (let i = 0; i < items.length; i++) {
    const li = items[i]
    if (!li.description.trim()) return `項目 #${i + 1} 缺少描述`
    if (!(li.quantity > 0)) return `項目 #${i + 1} 數量必須大於 0`
    if (!li.unit.trim()) return `項目 #${i + 1} 缺少單位`
    if (!(li.unit_price_cents > 0)) return `項目 #${i + 1} 單價必須大於 0`
  }
  return null
}

export default VoLineItemsEditor
