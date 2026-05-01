import { useEffect, useState } from 'react'
import { Clock, Check } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, ProgressHistoryEntry, UserProfile } from '../types'

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
          {entries.map(e => {
            const u = e.updated_by ? users[e.updated_by] : null
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
                  <span className="text-base font-black text-safety-600 flex-shrink-0">{e.actual_progress}%</span>
                </div>
                {e.floors_completed.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {e.floors_completed.map(f => (
                      <span key={f} className="inline-flex items-center gap-0.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">
                        <Check size={9} />{f}
                      </span>
                    ))}
                  </div>
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
