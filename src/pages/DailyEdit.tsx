import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Plus, Search, Trash2, X } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import {
  DailiesProvider,
  useDailies,
  todayHKT,
  yesterdayHKT,
  WEATHER_OPTIONS,
  WARNING_SIGNAL_OPTIONS,
  type Weather,
  type ManpowerRow,
  type PlantRow,
} from '../contexts/DailiesContext'
import { supabase } from '../lib/supabase'
import { isLeaf } from '../types'
import type { ProgressItem } from '../types'
import { useProjects } from '../contexts/ProjectsContext'

function DailyEditInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { dailies, loading, upsertMyDaily, fetchMyDailyFor } = useDailies()
  const { projects } = useProjects()
  const project = projects.find(p => p.id === projectId)
  const zoneNameById = useMemo(() => {
    const m: Record<string, string> = {}
    project?.zones.forEach(z => { m[z.id] = z.name })
    return m
  }, [project])

  const today = todayHKT()

  const canAuthor =
    !!profile &&
    profile.global_role === 'main_contractor' &&
    (profile.sub_role === 'foreman' || profile.sub_role === 'engineer')

  // Today's own row (provider is already scoped to today by default).
  const existing = useMemo(
    () => (profile ? dailies.find(d => d.user_id === profile.id) ?? null : null),
    [dailies, profile],
  )

  // Form state — seeded from existing row on first load.
  const [weatherAm, setWeatherAm] = useState<Weather | null>(null)
  const [weatherPm, setWeatherPm] = useState<Weather | null>(null)
  const [warningSignals, setWarningSignals] = useState<Set<string>>(new Set())
  const [manpower, setManpower] = useState<ManpowerRow[]>([])
  const [plant, setPlant] = useState<PlantRow[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [freeform, setFreeform] = useState<string[]>([''])
  const [notes, setNotes] = useState('')
  const [seeded, setSeeded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  // Seed all form state from a daily row (own today row on load, or yesterday's
  // on 複製琴日). weather_am/pm fall back from the legacy `weather` for pre-v45 rows.
  function seedFrom(d: {
    weather: Weather
    weather_am: Weather | null
    weather_pm: Weather | null
    warning_signals: string[]
    manpower: ManpowerRow[]
    plant: PlantRow[]
    progress_item_ids: string[]
    freeform_items: string[]
    notes: string
  }) {
    setWeatherAm(d.weather_am ?? d.weather ?? null)
    setWeatherPm(d.weather_pm ?? null)
    setWarningSignals(new Set(d.warning_signals ?? []))
    setManpower(d.manpower ?? [])
    setPlant(d.plant ?? [])
    setSelectedItemIds(new Set(d.progress_item_ids))
    setFreeform(d.freeform_items.length > 0 ? d.freeform_items : [''])
    setNotes(d.notes)
  }

  useEffect(() => {
    if (seeded) return
    if (loading) return
    if (existing) seedFrom(existing)
    setSeeded(true)
  }, [existing, loading, seeded])

  // Does the form already hold any content? (gate the 複製琴日 overwrite confirm)
  function formHasContent(): boolean {
    return (
      !!weatherAm || !!weatherPm || warningSignals.size > 0 ||
      manpower.length > 0 || plant.length > 0 || selectedItemIds.size > 0 ||
      freeform.some(s => s.trim()) || notes.trim().length > 0
    )
  }

  async function copyYesterday() {
    setCopyNotice(null)
    if (formHasContent() && !window.confirm('會覆蓋目前內容，繼續？')) return
    const y = await fetchMyDailyFor(yesterdayHKT())
    if (!y) {
      setCopyNotice('琴日冇你嘅日誌')
      return
    }
    seedFrom(y)
  }

  // ── Progress items (leaves only) ───────────────────────────
  const [items, setItems] = useState<ProgressItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemSearch, setItemSearch] = useState('')

  useEffect(() => {
    let mounted = true
    setItemsLoading(true)
    // Use the visibility RPC so non-supervisor roles (foreman, engineer,
    // 判頭, worker, owner, safety_officer) only see their assigned items
    // when picking what they worked on today. Supervisors still get the
    // full project tree.
    supabase
      .rpc('get_visible_progress_items', { p_project_id: projectId })
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          console.error('progress_items fetch error:', error)
          setItems([])
        } else {
          const rows = ((data || []) as ProgressItem[]).slice().sort(
            (a, b) => a.code.localeCompare(b.code),
          )
          setItems(rows)
        }
        setItemsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [projectId])

  const leafItems = useMemo(() => items.filter(it => isLeaf(it, items)), [items])

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return leafItems
    return leafItems.filter(
      it => it.code.toLowerCase().includes(q) || it.title.toLowerCase().includes(q),
    )
  }, [leafItems, itemSearch])

  // ── Handlers ───────────────────────────────────────────────
  function toggleItem(id: string) {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addFreeformRow() {
    setFreeform(prev => [...prev, ''])
  }
  function updateFreeformRow(i: number, val: string) {
    setFreeform(prev => prev.map((v, idx) => (idx === i ? val : v)))
  }
  function removeFreeformRow(i: number) {
    setFreeform(prev => (prev.length <= 1 ? [''] : prev.filter((_, idx) => idx !== i)))
  }

  function toggleWarning(sig: string) {
    setWarningSignals(prev => {
      const next = new Set(prev)
      if (next.has(sig)) next.delete(sig)
      else next.add(sig)
      return next
    })
  }

  // ── 出勤人數 (manpower) rows ────────────────────────────────
  function addManpowerRow() {
    setManpower(prev => [...prev, { trade: '', count: 1 }])
  }
  function updateManpowerRow(i: number, patch: Partial<ManpowerRow>) {
    setManpower(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeManpowerRow(i: number) {
    setManpower(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── 機械 (plant) rows ──────────────────────────────────────
  function addPlantRow() {
    setPlant(prev => [...prev, { type: '', count: 1 }])
  }
  function updatePlantRow(i: number, patch: Partial<PlantRow>) {
    setPlant(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removePlantRow(i: number) {
    setPlant(prev => prev.filter((_, idx) => idx !== i))
  }

  const dateBlocked = false // We always edit today's row; provider scoped to today.
  // (If the server rejects because dev clock drift, we surface it on submit.)

  async function onSave() {
    setSubmitError(null)
    if (!weatherAm) {
      setSubmitError('請揀上晝天氣')
      return
    }
    if (!canAuthor) {
      setSubmitError('只有總承建商管工或工程師可以填寫日誌')
      return
    }
    setSubmitting(true)
    const cleanedFreeform = freeform.map(s => s.trim()).filter(s => s.length > 0)
    // Drop empty-trade / non-positive rows; coerce counts to >=1 integers.
    const cleanedManpower = manpower
      .map(r => ({ trade: r.trade.trim(), count: Math.floor(r.count) }))
      .filter(r => r.trade.length > 0 && r.count >= 1)
    const cleanedPlant = plant
      .map(r => ({ type: r.type.trim(), count: Math.floor(r.count) }))
      .filter(r => r.type.length > 0 && r.count >= 1)
    const { error } = await upsertMyDaily({
      weather: weatherAm,
      weather_am: weatherAm,
      weather_pm: weatherPm,
      warning_signals: Array.from(warningSignals),
      manpower: cleanedManpower,
      plant: cleanedPlant,
      progress_item_ids: Array.from(selectedItemIds),
      freeform_items: cleanedFreeform,
      notes: notes.trim(),
    })
    setSubmitting(false)
    if (error) {
      // RLS rejects edits to yesterday's row (date != today HKT) with
      // a sparse error message; map to readable Chinese fallback.
      // (persona-sim engineer round 1 C5.)
      const msg = error.toLowerCase()
      const friendly =
        msg.includes('row-level security') || msg.includes('rls') || msg.trim() === ''
          ? '尋日嘅日誌已鎖，唔可以再改。'
          : error
      setSubmitError(friendly)
      return
    }
    navigate(`/project/${projectId}/daily`)
  }

  if (loading || itemsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/daily`)}
          className="inline-flex items-center gap-1 text-sm text-site-600 mb-2"
        >
          <ChevronLeft size={16} />
          <span>返回日誌列表</span>
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-site-900">
              {existing ? '編輯今日日誌' : '填寫今日日誌'}
            </h2>
            <p className="text-xs text-site-500 mt-0.5">{today}（香港時間）</p>
          </div>
          {canAuthor && (
            <button
              type="button"
              onClick={copyYesterday}
              className="btn-ghost inline-flex items-center gap-1 text-sm shrink-0"
            >
              <Copy size={14} />
              複製琴日
            </button>
          )}
        </div>
        {copyNotice && (
          <div className="mt-2 bg-amber-100 text-amber-700 border border-amber-200 rounded-xl px-3 py-2 text-sm">
            {copyNotice}
          </div>
        )}
      </div>

      {!canAuthor && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">
          只有總承建商管工或工程師可以填寫日誌。
        </div>
      )}

      {dateBlocked && (
        <div className="bg-amber-100 text-amber-700 border border-amber-200 rounded-xl px-3 py-2 text-sm mb-3">
          今日嘅日誌先可以修改
        </div>
      )}

      {/* Weather: 上晝 (required) + 下晝 (optional) + 天文台警告信號 */}
      <div className="card p-3 mb-3">
        <p className="label mb-2">上晝天氣 <span className="text-red-500">*</span></p>
        <div className="flex flex-wrap gap-2">
          {WEATHER_OPTIONS.map(w => {
            const active = weatherAm === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWeatherAm(w)}
                aria-pressed={active}
                className={`px-4 min-w-[64px] rounded-full border text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-safety-600 text-white border-safety-600'
                    : 'bg-white text-site-700 border-site-200 hover:bg-site-50'
                }`}
              >
                {w}
              </button>
            )
          })}
        </div>

        <div className="flex items-baseline justify-between mt-4 mb-2">
          <p className="label !mb-0">下晝天氣（選填）</p>
          {weatherPm && (
            <button
              type="button"
              onClick={() => setWeatherPm(null)}
              className="text-[11px] text-site-500 inline-flex items-center gap-0.5"
            >
              <X size={12} /> 清除
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {WEATHER_OPTIONS.map(w => {
            const active = weatherPm === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => setWeatherPm(active ? null : w)}
                aria-pressed={active}
                className={`px-4 min-w-[64px] rounded-full border text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-site-700 text-white border-site-700'
                    : 'bg-white text-site-700 border-site-200 hover:bg-site-50'
                }`}
              >
                {w}
              </button>
            )
          })}
        </div>

        <p className="label mt-4 mb-2">天文台警告信號（選填）</p>
        <div className="flex flex-wrap gap-2">
          {WARNING_SIGNAL_OPTIONS.map(sig => {
            const active = warningSignals.has(sig)
            return (
              <button
                key={sig}
                type="button"
                onClick={() => toggleWarning(sig)}
                aria-pressed={active}
                className={`px-3 rounded-full border text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-site-700 border-site-200 hover:bg-site-50'
                }`}
              >
                {sig}
              </button>
            )
          })}
        </div>
      </div>

      {/* 出勤人數 (manpower) */}
      <div className="card p-3 mb-3">
        <p className="label mb-2">出勤人數</p>
        {manpower.length === 0 ? (
          <p className="text-sm text-site-400 mb-2">未填寫</p>
        ) : (
          <ul className="space-y-2">
            {manpower.map((row, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.trade}
                  onChange={e => updateManpowerRow(i, { trade: e.target.value })}
                  placeholder="工種，例如：紮鐵"
                  className="input flex-1"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={row.count}
                  onChange={e => updateManpowerRow(i, { count: Number(e.target.value) })}
                  className="input w-20 text-center"
                  aria-label="人數"
                />
                <span className="text-sm text-site-500 shrink-0">人</span>
                <button
                  type="button"
                  onClick={() => removeManpowerRow(i)}
                  aria-label="移除此工種"
                  className="btn-ghost !min-h-[44px] !px-3"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addManpowerRow}
          className="btn-ghost inline-flex items-center gap-1 mt-2 text-sm"
        >
          <Plus size={14} />
          新增工種
        </button>
      </div>

      {/* 機械 (plant) */}
      <div className="card p-3 mb-3">
        <p className="label mb-2">機械</p>
        {plant.length === 0 ? (
          <p className="text-sm text-site-400 mb-2">未填寫</p>
        ) : (
          <ul className="space-y-2">
            {plant.map((row, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.type}
                  onChange={e => updatePlantRow(i, { type: e.target.value })}
                  placeholder="機械類型，例如：天秤"
                  className="input flex-1"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={row.count}
                  onChange={e => updatePlantRow(i, { count: Number(e.target.value) })}
                  className="input w-20 text-center"
                  aria-label="數量"
                />
                <span className="text-sm text-site-500 shrink-0">部</span>
                <button
                  type="button"
                  onClick={() => removePlantRow(i)}
                  aria-label="移除此機械"
                  className="btn-ghost !min-h-[44px] !px-3"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addPlantRow}
          className="btn-ghost inline-flex items-center gap-1 mt-2 text-sm"
        >
          <Plus size={14} />
          新增機械
        </button>
      </div>

      {/* Progress items */}
      <div className="card p-3 mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <p className="label !mb-0">已處理進度項目</p>
          <p className="text-[11px] text-site-400">已選 {selectedItemIds.size}</p>
        </div>
        <div className="relative mb-2">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400 pointer-events-none"
          />
          <input
            type="text"
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            placeholder="搜尋編號或標題…"
            className="input pl-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto border border-site-100 rounded-xl divide-y divide-site-100">
          {visibleItems.length === 0 ? (
            <p className="text-sm text-site-500 text-center py-6">沒有可選項目</p>
          ) : (
            visibleItems.map(it => {
              const checked = selectedItemIds.has(it.id)
              return (
                <label
                  key={it.id}
                  className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-site-50 min-h-[44px]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(it.id)}
                    className="mt-1 h-5 w-5 accent-safety-600"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-[11px] text-site-400">
                      {it.code}
                      {it.zone_id && zoneNameById[it.zone_id] && (
                        <span className="ml-1.5 inline-block text-[10px] font-semibold bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full">
                          {zoneNameById[it.zone_id]}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-site-800 break-words">{it.title}</span>
                  </span>
                </label>
              )
            })
          )}
        </div>
      </div>

      {/* Freeform list */}
      <div className="card p-3 mb-3">
        <p className="label mb-2">其他事項</p>
        <ul className="space-y-2">
          {freeform.map((row, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={row}
                onChange={e => updateFreeformRow(i, e.target.value)}
                placeholder="例如：吊機保養、安全會議…"
                className="input flex-1"
              />
              <button
                type="button"
                onClick={() => removeFreeformRow(i)}
                aria-label="移除此項"
                className="btn-ghost !min-h-[44px] !px-3"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addFreeformRow}
          className="btn-ghost inline-flex items-center gap-1 mt-2 text-sm"
        >
          <Plus size={14} />
          新增一項
        </button>
      </div>

      {/* Notes */}
      <div className="card p-3 mb-3">
        <label htmlFor="daily-notes" className="label mb-2 block">
          備註
        </label>
        <textarea
          id="daily-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          placeholder="今日工地情況、特別事項…"
          className="input"
        />
      </div>

      {submitError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">
          {submitError}
        </div>
      )}

      {/* Spacer so form content isn't hidden behind the sticky action bar
          (persona-sim 2026-05-26: foreman's 儲存 was overlapping BottomNav). */}
      <div className="h-24 md:h-16" aria-hidden />

      {/* Sticky action bar — sits ABOVE the fixed BottomNav (h-16 = 64px) on
          mobile; on md+ there's no BottomNav so stick directly to bottom. */}
      <div
        className="sticky bottom-16 md:bottom-0 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white border-t border-site-200 flex gap-2 z-30"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/daily`)}
          className="btn-ghost flex-1"
          disabled={submitting}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={submitting || dateBlocked || !canAuthor || !weatherAm}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
        >
          {submitting && <Spinner size={16} className="!text-white" />}
          儲存
        </button>
      </div>
    </>
  )
}

export default function DailyEditPage() {
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
        <DailyEditInner projectId={id} />
      </DailiesProvider>
    </AppLayout>
  )
}
