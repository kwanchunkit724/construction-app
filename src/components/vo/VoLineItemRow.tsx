import { useState } from 'react'
import { Trash2, Link2, X } from 'lucide-react'
import { LINE_ITEM_CATEGORY_ZH } from '../../types'
import type { VoLineItem, LineItemCategory, ProgressItem } from '../../types'
import { formatHKD, parseHKD, multiplyCents } from '../../lib/currency'
import { isLeaf } from '../../types'

const CATEGORIES: LineItemCategory[] = ['labour', 'material', 'preliminaries', 'contingency']

export interface VoLineItemRowProps {
  item: VoLineItem
  index: number
  onChange: (next: VoLineItem) => void
  onRemove: () => void
  progressItems: ProgressItem[]
}

export function VoLineItemRow({ item, index, onChange, onRemove, progressItems }: VoLineItemRowProps) {
  const [priceText, setPriceText] = useState<string>(
    item.unit_price_cents > 0 ? (item.unit_price_cents / 100).toFixed(2) : '',
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  const subtotal = multiplyCents(item.quantity, item.unit_price_cents)

  // Keep payload subtotal_cents in sync for display continuity (server recomputes anyway).
  function update<K extends keyof VoLineItem>(k: K, v: VoLineItem[K]) {
    const next = { ...item, [k]: v }
    next.subtotal_cents = multiplyCents(next.quantity, next.unit_price_cents)
    onChange(next)
  }

  function commitPrice() {
    const cents = parseHKD(priceText)
    update('unit_price_cents', cents)
    setPriceText(cents > 0 ? (cents / 100).toFixed(2) : '')
  }

  const linkedItem = item.progress_leaf_item_id
    ? progressItems.find(p => p.id === item.progress_leaf_item_id)
    : null

  return (
    <div className="card p-3 space-y-2">
      {/* Header: # + category + remove */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-site-500 w-8">#{index + 1}</span>
        <select
          className="input flex-1 text-sm"
          value={item.category}
          onChange={e => update('category', e.target.value as LineItemCategory)}
          aria-label="類別"
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{LINE_ITEM_CATEGORY_ZH[c]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="w-9 h-9 rounded-xl border border-site-200 text-red-600 flex items-center justify-center"
          aria-label="移除項目"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Description */}
      <div>
        <label className="label">描述</label>
        <input
          type="text"
          className="input"
          value={item.description}
          maxLength={200}
          onChange={e => update('description', e.target.value)}
          placeholder="例：拆除舊牆 / 加裝防火門"
        />
      </div>

      {/* Quantity + Unit (md+: side-by-side) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">數量</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="input"
            value={Number.isFinite(item.quantity) ? item.quantity : 0}
            onChange={e => update('quantity', Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className="label">單位</label>
          <input
            type="text"
            className="input"
            value={item.unit}
            maxLength={20}
            onChange={e => update('unit', e.target.value)}
            placeholder="人日 / 批 / m² …"
          />
        </div>
      </div>

      {/* Unit price */}
      <div>
        <label className="label">單價 (HK$)</label>
        <div className="flex items-center gap-2">
          <span className="text-site-500 text-sm">HK$</span>
          <input
            type="text"
            inputMode="decimal"
            className="input flex-1"
            value={priceText}
            onChange={e => setPriceText(e.target.value)}
            onBlur={commitPrice}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Subtotal preview */}
      <div className="flex items-center justify-between bg-site-50 border border-site-100 rounded-xl px-3 py-2">
        <span className="text-xs text-site-600">小計 (預覽)</span>
        <span className="font-semibold text-site-900 tabular-nums">{formatHKD(subtotal)}</span>
      </div>

      {/* Optional progress link */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="text-xs text-blue-700 inline-flex items-center gap-1 hover:underline"
      >
        <Link2 size={12} />
        <span>🔗 連結進度 {linkedItem ? `· ${linkedItem.code} ${linkedItem.title}` : '(選填)'}</span>
      </button>

      {pickerOpen && (
        <ProgressLeafPicker
          progressItems={progressItems}
          selectedId={item.progress_leaf_item_id}
          onPick={pid => {
            update('progress_leaf_item_id', pid)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function ProgressLeafPicker({
  progressItems, selectedId, onPick, onClose,
}: {
  progressItems: ProgressItem[]
  selectedId: string | null
  onPick: (id: string | null) => void
  onClose: () => void
}) {
  const leaves = progressItems.filter(p => isLeaf(p, progressItems))

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-5 py-3 border-b border-site-100 flex items-center justify-between">
          <h3 className="font-bold text-site-900">連結進度項目</h3>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-site-400">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-1">
          {selectedId && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="w-full text-left text-sm text-red-600 px-3 py-2 rounded-lg border border-red-200"
            >
              清除連結
            </button>
          )}
          {leaves.length === 0 ? (
            <p className="text-sm text-site-500 text-center py-4">此項目尚未有進度項目</p>
          ) : (
            leaves.map(l => {
              const active = selectedId === l.id
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onPick(l.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg ${
                    active ? 'bg-safety-100 text-safety-700 font-semibold' : 'hover:bg-site-50'
                  }`}
                >
                  <span className="font-mono text-xs text-site-500">{l.code}</span>
                  <span className="ml-2">{l.title}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default VoLineItemRow
