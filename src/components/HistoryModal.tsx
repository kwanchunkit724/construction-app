import { useEffect, useState } from 'react'
import { Clock, Check, DoorOpen } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { supabase } from '../lib/supabase'
import { UNIT_STATE_ZH } from '../types'
import type { ProgressItem, ProgressHistoryEntry, UserProfile, UnitState } from '../types'

// Diff a unit_status history row against the chronologically-previous row's
// label_status map → the labels whose state CHANGED, as { label, from, to }.
// `entries` is newest-first, so the previous-in-time row is the NEXT index.
// First-ever tick (no prior) shows every non-pending label as "→ state".
function unitStatusDiff(
  cur: Record<string, UnitState> | null | undefined,
  prev: Record<string, UnitState> | null | undefined,
): Array<{ label: string; from: UnitState | null; to: UnitState }> {
  const curMap = cur ?? {}
  const prevMap = prev ?? {}
  const out: Array<{ label: string; from: UnitState | null; to: UnitState }> = []
  for (const label of Object.keys(curMap)) {
    const to = curMap[label]
    const from = prevMap[label] ?? null
    if (from === to) continue
    // Suppress noise: a label that was implicitly 'pending' and is still
    // 'pending' isn't a change worth showing.
    if (from === null && to === 'pending') continue
    out.push({ label, from, to })
  }
  return out
}

// zh-HK labels for the keys recorded in a 'meta' (rename / date-change) history row.
const META_LABEL: Record<string, string> = {
  title: '名稱',
  planned_start: '計劃開始',
  planned_end: '計劃完成',
}

export function HistoryModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { fetchHistory } = useProgress()
  const [entries, setEntries] = useState<ProgressHistoryEntry[]>([])
  const [users, setUsers] = useState<Record<string, UserProfile>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !item) return
    let cancelled = false
    setLoading(true)
    fetchHistory(item.id).then(async (rows) => {
      if (cancelled) return
      setEntries(rows)
      const ids = Array.from(new Set(rows.map(r => r.updated_by).filter(Boolean) as string[]))
      if (ids.length > 0) {
        const { data } = await supabase.from('user_profiles').select('*').in('id', ids)
        if (!cancelled && data) {
          const map: Record<string, UserProfile> = {}
          for (const u of data as UserProfile[]) map[u.id] = u
          setUsers(map)
        }
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, item, fetchHistory])

  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title="進度更新歷史">
      <div className="text-sm font-semibold text-site-900 mb-3 bg-site-100 rounded-lg p-2.5">
        <span className="font-mono text-site-500">{item.code}</span> · {item.title}
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Spinner size={24} /></div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center">
          <Clock size={28} className="mx-auto text-site-300 mb-2" />
          <p className="text-sm text-site-500">尚未有更新記錄</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, idx) => {
            const u = e.updated_by ? users[e.updated_by] : null
            // unit_status rows carry a label_status map; diff against the
            // chronologically-previous row (next index, since newest-first).
            const unitChanges = e.label_status
              ? unitStatusDiff(e.label_status, entries[idx + 1]?.label_status)
              : []
            return (
              <div key={e.id} className="border border-site-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-safety-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {u?.name.slice(0, 1) ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-site-900 truncate">{u?.name ?? '...'}</p>
                      <p className="text-[10px] text-site-400">{new Date(e.created_at).toLocaleString('zh-HK')}</p>
                    </div>
                  </div>
                  {e.change_type === 'meta' ? (
                    <span className="text-[11px] font-bold text-site-500 bg-site-100 px-2 py-0.5 rounded flex-shrink-0">✎ 編輯</span>
                  ) : (
                    <span className="text-base font-black text-safety-600 flex-shrink-0">{e.actual_progress}%</span>
                  )}
                </div>
                {e.change_type === 'meta' && e.meta && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(e.meta).map(([k, [oldV, newV]]) => (
                      <p key={k} className="text-xs text-site-600">
                        {META_LABEL[k] ?? k}：
                        <span className="line-through text-site-400">{oldV || '—'}</span>
                        {' → '}
                        <span className="font-semibold text-site-800">{newV || '—'}</span>
                      </p>
                    ))}
                  </div>
                )}
                {/* unit_status rows: show the per-室 state CHANGES (not the raw
                    signed-off floor chips, which would just repeat 已簽收 labels). */}
                {e.label_status ? (
                  unitChanges.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {unitChanges.map(c => (
                        <span key={c.label} className="inline-flex items-center gap-0.5 text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-semibold">
                          <DoorOpen size={9} />
                          {c.label}：{c.from ? `${UNIT_STATE_ZH[c.from]}→` : ''}{UNIT_STATE_ZH[c.to]}
                        </span>
                      ))}
                    </div>
                  )
                ) : (
                  e.floors_completed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.floors_completed.map(f => (
                        <span key={f} className="inline-flex items-center gap-0.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                          <Check size={9} />{f}
                        </span>
                      ))}
                    </div>
                  )
                )}
                {e.notes && (
                  <p className="text-xs text-site-600 mt-2 whitespace-pre-wrap">{e.notes}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
