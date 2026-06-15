import { useEffect, useState } from 'react'
import { Send, Check, Minus, Plus, Ban } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { ProgressBar } from './ProgressBar'
import { useProgress } from '../contexts/ProgressContext'
import { deriveStatus, floorsToProgress, plannedProgressOf, qtyToProgress, unitStatusToProgress, unitStatusCounts, UNIT_STATE_ORDER, UNIT_STATE_ZH } from '../types'
import type { ProgressItem, UnitState } from '../types'

// 受阻 reasons (渠務 staples). Free-form '其他' lets the foreman type a custom note.
const BLOCK_REASONS = ['雨天', '地下水', '掘路紙', '物料', '其他']

// P3: per-UnitState chip styling for the unit_status editor. The row's chip
// reflects the CURRENT state and a tap advances to the next state in
// UNIT_STATE_ORDER (cycling 已簽收 → 未處理). signed_off is the terminal/green.
const UNIT_STATE_STYLE: Record<UnitState, string> = {
  pending: 'bg-site-100 text-site-500 border-site-200',
  fixing: 'bg-blue-50 text-blue-700 border-blue-200',
  fixed: 'bg-amber-50 text-amber-700 border-amber-200',
  reinspect: 'bg-purple-50 text-purple-700 border-purple-200',
  signed_off: 'bg-green-50 text-green-700 border-green-300',
}

function nextUnitState(s: UnitState): UnitState {
  const i = UNIT_STATE_ORDER.indexOf(s)
  // Unknown legacy value (e.g. 'unprocessed') → indexOf returns -1 →
  // start from the first known state instead of wrapping to index 0 via (-1+1)%5.
  // (-1 + 1) % 5 happens to be 0 which is actually fine, but guard explicitly
  // so the intent is clear and future order changes don't silently break it.
  if (i === -1) return UNIT_STATE_ORDER[0]
  return UNIT_STATE_ORDER[(i + 1) % UNIT_STATE_ORDER.length]
}

export function UpdateProgressModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { updateProgress, updateFloors, updateQuantity, updateUnitStatus, setBlocked } = useProgress()
  const [actual, setActual] = useState(0)
  const [floorsCompleted, setFloorsCompleted] = useState<string[]>([])
  const [qtyDone, setQtyDone] = useState('')
  // P3: unit_status editor — a live { label: UnitState } map seeded from the
  // item, mutated by tapping each row's chip, persisted via updateUnitStatus.
  const [labelStatus, setLabelStatus] = useState<Record<string, UnitState>>({})
  const [notes, setNotes] = useState('')
  // 受阻 (blocked) toggle + reason. Seeded from the item's current blocked_reason
  // so reopening shows the live state; clearing the toggle clears the reason.
  const [blocked, setBlockedOn] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && item) {
      setActual(item.actual_progress)
      setFloorsCompleted([...item.floors_completed])
      setQtyDone(item.qty_done != null ? String(item.qty_done) : '')
      // Seed the unit_status map: start from the stored map, then default any
      // label missing from it to 'pending' so newly-added 室 are tappable.
      const seed: Record<string, UnitState> = {}
      for (const l of item.floor_labels ?? []) {
        seed[l] = (item.label_status?.[l] as UnitState) ?? 'pending'
      }
      setLabelStatus(seed)
      setNotes(item.notes)
      const r = (item.blocked_reason ?? '').trim()
      setBlockedOn(!!r)
      setBlockReason(r)
      setError('')
    }
  }, [open, item])

  if (!item) return null

  // 'checklist' shares the floors storage + derivation; it differs only in
  // rendering (a vertical tick-list of 工序 rather than the 樓層 grid).
  const isFloors = item.tracking_mode === 'floors'
  const isChecklist = item.tracking_mode === 'checklist'
  const isQuantity = item.tracking_mode === 'quantity'
  const isUnitStatus = item.tracking_mode === 'unit_status'
  // isLabelMode = the floor-grid / checklist tick path (boolean floors_completed).
  // unit_status has its OWN editor (state chips) so it is NOT a tick-list label mode.
  const isLabelMode = isFloors || isChecklist
  const qtyDoneNum = Number(qtyDone)
  const unitCounts = unitStatusCounts(labelStatus, item.floor_labels)
  const computedActual = isLabelMode
    ? floorsToProgress(floorsCompleted, item.floor_labels)
    : isQuantity
      ? qtyToProgress(Number.isFinite(qtyDoneNum) ? qtyDoneNum : 0, item.qty_total)
      : isUnitStatus
        ? unitStatusToProgress(labelStatus, item.floor_labels)
        : actual
  const planned = plannedProgressOf(item)
  const status = deriveStatus(computedActual, planned)

  function toggleFloor(label: string) {
    setFloorsCompleted(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    )
  }

  // P3: advance one 室 to the next state in the cycle (未處理→…→已簽收→未處理).
  function cycleUnit(label: string) {
    setLabelStatus(prev => ({ ...prev, [label]: nextUnitState(prev[label] ?? 'pending') }))
  }

  // Stepper for the quantity input — gloved-finger friendly. Clamps at 0 and
  // (when sized) at qty_total so a tap can't push it past the run length.
  function stepQty(delta: number) {
    setQtyDone(prev => {
      const cur = Number(prev)
      const base = Number.isFinite(cur) ? cur : 0
      let next = base + delta
      if (next < 0) next = 0
      if (item && item.qty_total != null && next > item.qty_total) next = item.qty_total
      return String(next)
    })
  }

  async function save() {
    if (!item) return
    setError('')
    if (isQuantity) {
      const n = Number(qtyDone)
      if (qtyDone.trim() === '' || !Number.isFinite(n) || n < 0) {
        setError('請輸入有效的已完成數量')
        return
      }
    }
    setSubmitting(true)
    // Persist the progress tick first, in its mode-specific shape.
    const { error } = isLabelMode
      ? await updateFloors(item.id, floorsCompleted, notes)
      : isQuantity
        ? await updateQuantity(item.id, Number(qtyDone), notes)
        : isUnitStatus
          ? await updateUnitStatus(item.id, labelStatus, notes)
          : await updateProgress(item.id, actual, notes)
    if (error) {
      setSubmitting(false)
      setError(error)
      return
    }
    // Then reconcile the 受阻 flag if it changed (presentation-only; never
    // blocks the % save above). Writes/clears blocked_reason + a history row.
    const nextReason = blocked ? (blockReason.trim() || '其他') : null
    const curReason = (item.blocked_reason ?? '').trim() || null
    if (nextReason !== curReason) {
      const { error: bErr } = await setBlocked(item.id, nextReason)
      if (bErr) {
        setSubmitting(false)
        setError(bErr)
        return
      }
    }
    setSubmitting(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="更新進度"
      footer={
        <button onClick={save} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : <><Send size={16} /> 儲存更新</>}
        </button>
      }
    >
      <div className="text-sm font-semibold text-site-900 mb-3 bg-site-100 rounded-lg p-2.5 flex items-center justify-between gap-2">
        <span><span className="font-mono text-site-500">{item.code}</span> · {item.title}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          isLabelMode ? 'bg-purple-100 text-purple-700'
            : isQuantity ? 'bg-teal-100 text-teal-700'
            : isUnitStatus ? 'bg-rose-100 text-rose-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {isChecklist
            ? `清單模式 · ${item.floor_labels.length} 項`
            : isFloors
              ? `樓層模式 · ${item.floor_labels.length} 層`
              : isQuantity
                ? `數量模式 · 總 ${item.qty_total ?? '?'}${item.qty_unit ?? ''}`
                : isUnitStatus
                  ? `單位狀態 · ${item.floor_labels.length} 室`
                  : '百分比模式'}
        </span>
      </div>

      {isChecklist ? (
        /* ── Checklist tick-list (工序) — vertical 44px rows ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">已完成工序</label>
            <span className="text-2xl font-black text-purple-600">
              {floorsCompleted.length}/{item.floor_labels.length}
              <span className="text-xs font-normal text-site-400 ml-1">({computedActual}%)</span>
            </span>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {item.floor_labels.map(label => {
              const done = floorsCompleted.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleFloor(label)}
                  className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors text-left ${
                    done
                      ? 'bg-green-50 border-green-500 text-green-800'
                      : 'bg-white border-site-200 text-site-600 hover:border-green-300'
                  }`}
                >
                  <span className={`flex-shrink-0 w-5 h-5 rounded grid place-items-center border-2 ${
                    done ? 'bg-green-500 border-green-500 text-white' : 'border-site-300 text-transparent'
                  }`}>
                    <Check size={13} />
                  </span>
                  <span className="flex-1 min-w-0 truncate">{label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : isFloors ? (
        /* ── Floor grid ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">已完成樓層</label>
            <span className="text-2xl font-black text-purple-600">
              {floorsCompleted.length}/{item.floor_labels.length}
              <span className="text-xs font-normal text-site-400 ml-1">({computedActual}%)</span>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {item.floor_labels.map(label => {
              const done = floorsCompleted.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleFloor(label)}
                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border-2 transition-colors min-h-0 flex items-center justify-center gap-1 ${
                    done
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-site-200 text-site-500 hover:border-green-300'
                  }`}
                >
                  {done && <Check size={11} />} {label}
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : isQuantity ? (
        /* ── Quantity editor (渠務) — big numeric 已完成 + stepper ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">已完成數量</label>
            <span className="text-2xl font-black text-teal-600">
              {qtyDone || 0}
              <span className="text-sm font-normal text-site-500 ml-1">{item.qty_unit ?? ''}</span>
              <span className="text-xs font-normal text-site-400 ml-1">({computedActual}%)</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepQty(-10)}
              className="flex-shrink-0 w-12 h-12 grid place-items-center rounded-xl border-2 border-site-200 text-site-600 hover:border-teal-300 bg-white"
              aria-label="減 10"
            >
              <Minus size={18} />
            </button>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={qtyDone}
              onChange={e => setQtyDone(e.target.value)}
              placeholder="0"
              className="input text-center text-lg font-bold flex-1"
              aria-label="已完成數量"
            />
            <button
              type="button"
              onClick={() => stepQty(10)}
              className="flex-shrink-0 w-12 h-12 grid place-items-center rounded-xl border-2 border-site-200 text-site-600 hover:border-teal-300 bg-white"
              aria-label="加 10"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex justify-between text-xs text-site-400 mt-1">
            <span>0 {item.qty_unit ?? ''}</span>
            <span className="text-teal-600">總數量：{item.qty_total ?? '?'} {item.qty_unit ?? ''}</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : isUnitStatus ? (
        /* ── Unit-status editor (大樓維修) — per-室 5-state segmented chip ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">各單位狀態</label>
            <span className="text-right">
              <span className="text-2xl font-black text-green-600">
                {unitCounts.signedOff}/{unitCounts.total}
              </span>
              <span className="text-xs font-normal text-site-400 ml-1">已簽收 ({computedActual}%)</span>
            </span>
          </div>
          <p className="text-[11px] text-site-500 mb-2">
            已修復 {unitCounts.fixed} · 已簽收 {unitCounts.signedOff} / 共 {unitCounts.total}（點一下切換狀態）
          </p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {item.floor_labels.map(label => {
              const st = labelStatus[label] ?? 'pending'
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => cycleUnit(label)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2.5 px-3 rounded-xl border-2 border-site-200 bg-white text-sm font-semibold transition-colors text-left hover:border-rose-300"
                >
                  <span className="flex-1 min-w-0 truncate text-site-700">{label}</span>
                  <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${UNIT_STATE_STYLE[st] ?? 'bg-site-100 text-site-500 border-site-200'}`}>
                    {UNIT_STATE_ZH[st] ?? st}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <ProgressBar value={computedActual} planned={planned} status={status} />
          </div>
        </div>
      ) : (
        /* ── Percentage slider ── */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">實際完成進度</label>
            <span className="text-2xl font-black text-safety-600">{actual}%</span>
          </div>
          {/* Tap target: native range track is ~4px; thumb size browser-defined.
              Wrap in py-3 (24px) so vertical hit area is 44px+, matching HIG.
              `touch-none` so swipes don't scroll the modal. */}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={actual}
            onChange={e => setActual(Number(e.target.value))}
            className="w-full accent-safety-600 h-12 touch-none cursor-pointer"
            aria-label="實際完成進度"
          />
          {/* Quick-tap chips so foreman with gloves can land 50/75/100 without
              sliding the thin native thumb. */}
          <div className="flex gap-2 mt-1">
            {[25, 50, 75, 100].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setActual(v)}
                className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold border transition-colors ${
                  actual === v
                    ? 'bg-safety-600 text-white border-safety-600'
                    : 'bg-white text-site-700 border-site-200 hover:bg-site-50'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-site-400 mt-1">
            <span>0%</span>
            <span className="text-orange-500">計劃: {planned}%</span>
            <span>100%</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={actual} planned={planned} status={status} />
          </div>
        </div>
      )}

      {computedActual < planned - 5 && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
          ⚠ 進度落後計劃 {planned - computedActual}%，請說明原因
        </div>
      )}

      {/* ── 受阻 (blocked) toggle + reason picker ── */}
      <div className={`mb-3 rounded-xl border p-3 ${blocked ? 'border-amber-300 bg-amber-50' : 'border-site-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => setBlockedOn(o => !o)}
          className="w-full flex items-center justify-between gap-2 min-h-0"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-site-800">
            <Ban size={16} className={blocked ? 'text-amber-600' : 'text-site-400'} />
            標記為受阻
          </span>
          <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${blocked ? 'bg-amber-500' : 'bg-site-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${blocked ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </span>
        </button>
        {blocked && (
          <div className="mt-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setBlockReason(r)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border min-h-0 ${
                    blockReason === r
                      ? 'border-amber-500 bg-white text-amber-700 font-semibold'
                      : 'border-site-200 bg-white text-site-600'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              placeholder="受阻原因（例：地下水）"
              className="input bg-white"
            />
          </div>
        )}
      </div>

      <div>
        <label className="label">備注 / 說明</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="請說明最新進展或影響因素..."
          className="input resize-none"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
          {error}
        </div>
      )}
    </Modal>
  )
}
