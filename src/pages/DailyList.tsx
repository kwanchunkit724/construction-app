import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus, CloudSun } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import {
  DailiesProvider,
  useDailies,
  todayHKT,
  type Daily,
} from '../contexts/DailiesContext'
import { supabase } from '../lib/supabase'
import type { UserProfile, ProgressItem } from '../types'

function relativeTime(iso: string): string {
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.max(0, now - t)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 日前`
  return new Date(iso).toLocaleDateString('zh-HK')
}

function DailyListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { dailies, selectedDate, setSelectedDate, loading, fetchError } = useDailies()

  const today = todayHKT()
  const isToday = selectedDate === today

  const canAuthor =
    !!profile &&
    profile.global_role === 'main_contractor' &&
    (profile.sub_role === 'foreman' || profile.sub_role === 'engineer')

  const myDaily = useMemo(
    () => (profile ? dailies.find(d => d.user_id === profile.id) ?? null : null),
    [dailies, profile],
  )

  // ── Resolve submitter names ────────────────────────────────
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>({})
  useEffect(() => {
    const ids = Array.from(new Set(dailies.map(d => d.user_id)))
    if (ids.length === 0) {
      setUsersById({})
      return
    }
    let mounted = true
    supabase
      .from('user_profiles')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        if (!mounted || !data) return
        const map: Record<string, UserProfile> = {}
        for (const row of data as UserProfile[]) map[row.id] = row
        setUsersById(map)
      })
    return () => {
      mounted = false
    }
  }, [dailies])

  // ── Resolve referenced progress item titles ────────────────
  const [itemsById, setItemsById] = useState<Record<string, Pick<ProgressItem, 'id' | 'code' | 'title'>>>({})
  useEffect(() => {
    const ids = Array.from(new Set(dailies.flatMap(d => d.progress_item_ids)))
    if (ids.length === 0) {
      setItemsById({})
      return
    }
    let mounted = true
    supabase
      .from('progress_items')
      .select('id,code,title')
      .in('id', ids)
      .then(({ data }) => {
        if (!mounted || !data) return
        const map: Record<string, Pick<ProgressItem, 'id' | 'code' | 'title'>> = {}
        for (const row of data as Pick<ProgressItem, 'id' | 'code' | 'title'>[]) map[row.id] = row
        setItemsById(map)
      })
    return () => {
      mounted = false
    }
  }, [dailies])

  return (
    <>
      {/* Header / back link */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}`)}
          className="inline-flex items-center gap-1 text-sm text-site-600 mb-2"
        >
          <ChevronLeft size={16} />
          <span>返回項目</span>
        </button>
        <h2 className="text-lg font-bold text-site-900">每日日誌</h2>
      </div>

      {/* Date picker */}
      <div className="card p-3 mb-3 flex items-center gap-3">
        <label htmlFor="daily-date" className="label !mb-0 whitespace-nowrap">
          日期
        </label>
        <input
          id="daily-date"
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => setSelectedDate(e.target.value || today)}
          className="input flex-1"
        />
        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(today)}
            className="text-xs text-safety-700 underline whitespace-nowrap"
          >
            返回今日
          </button>
        )}
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">
          {fetchError}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} />
        </div>
      ) : dailies.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-site-500">
            {isToday ? '今日未有日誌' : '當日未有日誌'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {dailies.map(d => {
            const submitter = usersById[d.user_id]
            const mine = profile?.id === d.user_id
            return (
              <li key={d.id} className="card p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-site-900 text-sm truncate">
                      {submitter?.name || '—'}
                      {submitter?.company && (
                        <span className="text-site-400 font-normal"> · {submitter.company}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-site-400">
                      更新於 {relativeTime(d.updated_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
                    <CloudSun size={12} />
                    {d.weather}
                  </span>
                </div>

                <DailyBody daily={d} itemsById={itemsById} />

                {mine && isToday && (
                  <div className="mt-3 pt-3 border-t border-site-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => navigate(`/project/${projectId}/daily/edit`)}
                      className="btn-ghost inline-flex items-center gap-1 text-sm"
                    >
                      <Pencil size={14} />
                      編輯我嘅日誌
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Floating CTA — show only on today + role-allowed + has no daily yet */}
      {isToday && canAuthor && !myDaily && (
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/daily/edit`)}
          className="btn-primary fixed bottom-24 md:bottom-8 right-4 md:right-8 z-40 inline-flex items-center gap-2 shadow-card-md"
        >
          <Plus size={18} />
          填寫今日日誌
        </button>
      )}
    </>
  )
}

function DailyBody({
  daily,
  itemsById,
}: {
  daily: Daily
  itemsById: Record<string, Pick<ProgressItem, 'id' | 'code' | 'title'>>
}) {
  const hasProgress = daily.progress_item_ids.length > 0
  const hasFreeform = daily.freeform_items.length > 0
  const hasNotes = daily.notes.trim().length > 0
  if (!hasProgress && !hasFreeform && !hasNotes) {
    return <p className="text-sm text-site-500">未有內容</p>
  }
  return (
    <div className="space-y-2">
      {hasProgress && (
        <div>
          <p className="label mb-1">已處理進度項目</p>
          <ul className="space-y-0.5">
            {daily.progress_item_ids.map(id => {
              const it = itemsById[id]
              return (
                <li key={id} className="text-sm text-site-800 flex items-start gap-2">
                  <span className="font-mono text-[11px] text-site-400 mt-0.5">
                    {it?.code || '—'}
                  </span>
                  <span className="flex-1 break-words">{it?.title || `(${id.slice(0, 8)})`}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {hasFreeform && (
        <div>
          <p className="label mb-1">其他事項</p>
          <ul className="list-disc list-inside space-y-0.5">
            {daily.freeform_items.map((line, i) => (
              <li key={i} className="text-sm text-site-800 break-words">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasNotes && (
        <div>
          <p className="label mb-1">備註</p>
          <p className="text-sm text-site-800 whitespace-pre-wrap break-words">{daily.notes}</p>
        </div>
      )}
    </div>
  )
}

export default function DailyListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <AppLayout title="每日日誌">
        <p className="text-site-500">缺少項目編號</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="每日日誌">
      <DailiesProvider projectId={id}>
        <DailyListInner projectId={id} />
      </DailiesProvider>
    </AppLayout>
  )
}
