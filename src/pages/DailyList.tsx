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
import { useProjects } from '../contexts/ProjectsContext'

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

// Weather pill: 上晝X · 下晝Y when the new AM field is present (v45+ rows);
// otherwise the single legacy `weather` value (pre-v45 / old-client rows).
function weatherLabel(d: Daily): string {
  if (d.weather_am) {
    return d.weather_pm ? `上晝${d.weather_am} · 下晝${d.weather_pm}` : `上晝${d.weather_am}`
  }
  return d.weather
}

// Severe HKO signals get a red badge; the rest are amber.
function isSevereSignal(sig: string): boolean {
  return sig === '八號或以上風球' || sig === '黑雨' || sig === '紅雨'
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

  // Explain to the current user WHY they can't author a daily, so the
  // "新增" CTA absence isn't a silent UX dead-end. (persona-sim 2026-05-26)
  const cannotAuthorReason: string | null = (() => {
    if (!profile) return null
    if (canAuthor) return null
    if (profile.global_role === 'subcontractor' || profile.global_role === 'subcontractor_worker') {
      return '判頭 / 工人唔可以寫日誌 — 由總承建商管工或工程師代為填寫。'
    }
    if (profile.global_role === 'owner') {
      return '業主只能閱讀日誌。'
    }
    if (profile.global_role === 'main_contractor') {
      return '只有 sub_role 為「管工」或「工程師」嘅總承建商員工可以寫日誌。'
    }
    return '你嘅角色唔可以寫每日日誌，只能閱讀。'
  })()

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

  // ── Resolve referenced progress item titles + zone ──────────
  const { projects } = useProjects()
  const project = projects.find(p => p.id === projectId)
  const zoneNameById = useMemo(() => {
    const m: Record<string, string> = {}
    project?.zones.forEach(z => { m[z.id] = z.name })
    return m
  }, [project])

  type ItemLite = Pick<ProgressItem, 'id' | 'code' | 'title' | 'zone_id'>
  const [itemsById, setItemsById] = useState<Record<string, ItemLite>>({})
  useEffect(() => {
    const ids = Array.from(new Set(dailies.flatMap(d => d.progress_item_ids)))
    if (ids.length === 0) {
      setItemsById({})
      return
    }
    let mounted = true
    supabase
      .from('progress_items')
      .select('id,code,title,zone_id')
      .in('id', ids)
      .then(({ data }) => {
        if (!mounted || !data) return
        const map: Record<string, ItemLite> = {}
        for (const row of data as ItemLite[]) map[row.id] = row
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

      {cannotAuthorReason && isToday && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-3 py-2 text-xs mb-3">
          {cannotAuthorReason}
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
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
                      <CloudSun size={12} />
                      {weatherLabel(d)}
                    </span>
                    {d.warning_signals && d.warning_signals.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1 max-w-[160px]">
                        {d.warning_signals.map(sig => (
                          <span
                            key={sig}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                              isSevereSignal(sig)
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <DailyBody daily={d} itemsById={itemsById} zoneNameById={zoneNameById} />

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
  zoneNameById,
}: {
  daily: Daily
  itemsById: Record<string, Pick<ProgressItem, 'id' | 'code' | 'title' | 'zone_id'>>
  zoneNameById: Record<string, string>
}) {
  const manpower = daily.manpower ?? []
  const plant = daily.plant ?? []
  const hasManpower = manpower.length > 0
  const hasPlant = plant.length > 0
  const hasProgress = daily.progress_item_ids.length > 0
  const hasFreeform = daily.freeform_items.length > 0
  const hasNotes = daily.notes.trim().length > 0
  if (!hasManpower && !hasPlant && !hasProgress && !hasFreeform && !hasNotes) {
    return <p className="text-sm text-site-500">未有內容</p>
  }
  const manpowerTotal = manpower.reduce((s, r) => s + (r.count || 0), 0)
  const plantTotal = plant.reduce((s, r) => s + (r.count || 0), 0)
  return (
    <div className="space-y-2">
      {hasManpower && (
        <div>
          <p className="label mb-1">出勤</p>
          <p className="text-sm text-site-800 break-words">
            {manpower.map(r => `${r.trade} ${r.count}人`).join(' · ')}
            <span className="text-site-400"> ・合共 {manpowerTotal} 人</span>
          </p>
        </div>
      )}
      {hasPlant && (
        <div>
          <p className="label mb-1">機械</p>
          <p className="text-sm text-site-800 break-words">
            {plant.map(r => `${r.type} ${r.count}部`).join(' · ')}
            <span className="text-site-400"> ・合共 {plantTotal} 部</span>
          </p>
        </div>
      )}
      {hasProgress && (
        <div>
          <p className="label mb-1">已處理進度項目</p>
          <ul className="space-y-0.5">
            {daily.progress_item_ids.map(id => {
              const it = itemsById[id]
              const zoneName = it?.zone_id ? zoneNameById[it.zone_id] : null
              return (
                <li key={id} className="text-sm text-site-800 flex items-start gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-site-400 mt-0.5">
                    {it?.code || '—'}
                  </span>
                  {zoneName && (
                    <span className="text-[10px] font-semibold bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full mt-0.5">
                      {zoneName}
                    </span>
                  )}
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
