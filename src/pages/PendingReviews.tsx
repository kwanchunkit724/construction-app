// PendingReviews — 「待我審批」 cross-project feed (S8). One round trip
// (list_my_pending_reviews RPC, SECURITY DEFINER, gated on can_review_document)
// returns every submitted document version awaiting THIS reviewer across ALL
// their sites, so a PM running 3 工地 sees one combined list instead of opening
// each project's 文件總覽. Tapping a row deep-links into that project's register
// with ?doc=<id>, which opens the document detail sheet (ProjectFiles handles
// the param). Route /reviews, gated by <FilesGate> like /project/:id/files.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, FileText, ChevronRight, CalendarClock, Inbox } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { DOCUMENT_TYPE_ZH } from '../types'
import type { PendingReview } from '../types'

function todayHKTDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 死線 styling: red once past, amber within 3 days, plain otherwise.
function dueClass(due: string | null): string {
  if (!due) return 'text-site-400'
  const today = todayHKTDate()
  if (due < today) return 'text-red-600 font-semibold'
  const days = Math.round(
    (new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
  )
  if (days <= 3) return 'text-amber-700 font-semibold'
  return 'text-site-500'
}

export default function PendingReviews() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PendingReview[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.rpc('list_my_pending_reviews')
    if (error) {
      console.error('list_my_pending_reviews error:', error)
      setError(error.message)
      setRows([])
      return
    }
    setRows((data as PendingReview[] | null) ?? [])
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  async function manualRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // Group rows by project, preserving the RPC's due-date-first ordering.
  const groups = useMemo(() => {
    const byProject = new Map<string, { name: string; items: PendingReview[] }>()
    for (const r of rows) {
      const g = byProject.get(r.project_id) ?? { name: r.project_name, items: [] }
      g.items.push(r)
      byProject.set(r.project_id, g)
    }
    return Array.from(byProject.entries()).map(([projectId, g]) => ({ projectId, ...g }))
  }, [rows])

  return (
    <AppLayout title="待我審批">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-site-500">
          {loading ? '載入中…' : `共 ${rows.length} 份文件等你審批`}
        </p>
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          className="text-site-500 hover:text-site-800 p-2"
          aria-label="刷新"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
          ⚠ 讀取失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><Spinner size={32} /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center">
          <Inbox size={36} className="mx-auto text-site-300 mb-2" />
          <p className="text-sm text-site-600">冇文件等你審批</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <section key={g.projectId}>
              <div className="flex items-baseline justify-between px-1 mb-1.5">
                <h2 className="font-bold text-site-900 text-sm truncate">{g.name}</h2>
                <span className="text-[11px] text-site-500 flex-shrink-0 ml-2">{g.items.length} 份</span>
              </div>
              <div className="space-y-2">
                {g.items.map(r => (
                  <button
                    key={r.version_id}
                    type="button"
                    onClick={() => navigate(`/project/${r.project_id}/files?doc=${r.document_id}`)}
                    className="card w-full p-3 flex items-center gap-3 text-left hover:bg-site-50 transition-colors min-h-[44px]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-site-100 text-site-500 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.doc_number && (
                          <span className="text-[10px] font-mono text-site-400">{r.doc_number}</span>
                        )}
                        <span className="text-[10px] font-semibold bg-site-100 text-site-600 px-1 rounded">
                          {DOCUMENT_TYPE_ZH[r.document_type]}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-site-900 truncate">{r.title}</div>
                      <div className="text-[11px] text-site-500 flex items-center gap-2 flex-wrap">
                        <span>送審 {r.submitted_by_name ?? '前成員'} · {fmtDateTime(r.submitted_at)}</span>
                        {r.review_due_date && (
                          <span className={`inline-flex items-center gap-0.5 ${dueClass(r.review_due_date)}`}>
                            <CalendarClock size={11} /> 死線 {r.review_due_date}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-site-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
