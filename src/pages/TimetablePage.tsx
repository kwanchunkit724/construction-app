import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Plus, Pencil } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import {
  EventsProvider,
  useEvents,
  EVENT_TYPE_ZH,
} from '../contexts/EventsContext'
import type { Event, EventType } from '../contexts/EventsContext'
import {
  TimetableProvider,
  useTimetable,
  defaultHktWeekRange,
} from '../contexts/TimetableContext'
import type { TimetableEntry, TimetableSource } from '../contexts/TimetableContext'
import { EventForm } from '../components/event/EventForm'

const SOURCE_LABEL: Record<TimetableSource, string> = {
  material: '物料',
  completion: '進度',
  event: '事件',
}

const SOURCE_BADGE_CLASS: Record<TimetableSource, string> = {
  // Per CLAUDE.md status colour map: blue=info, green=success, purple from
  // tailwind defaults to differentiate manual entries from system sources.
  material: 'bg-blue-50 text-blue-700',
  completion: 'bg-green-100 text-green-700',
  event: 'bg-purple-100 text-purple-700',
}

// ── Date helpers ────────────────────────────────────────────────────────────
const ONE_DAY_MS = 86_400_000

function isoToDateInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function localDateInputToIso(v: string, endOfDay = false): string | null {
  if (!v) return null
  // Interpret picker date as local midnight (or end-of-day) — the picker has
  // no timezone awareness anyway.
  const [y, m, d] = v.split('-').map(n => parseInt(n, 10))
  if (!y || !m || !d) return null
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0)
  return dt.toISOString()
}

function dayKey(iso: string): string {
  // Local-day key, so "Mon" entries group together for the viewer regardless
  // of UTC time. The list is already filtered to the chosen range.
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDateHeading(key: string): string {
  // key is YYYY-MM-DD local
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10))
  const dt = new Date(y, m - 1, d)
  const weekdayZh = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
  return `${y}年${m}月${d}日 (週${weekdayZh})`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ── Inner page ──────────────────────────────────────────────────────────────
function TimetableInner({ projectId }: { projectId: string }) {
  const { profile } = useAuth()
  const {
    entries, loading, fetchError,
    rangeFrom, rangeTo, setRange,
  } = useTimetable()
  const { events } = useEvents()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)

  const canWrite = !!profile && ['admin', 'pm', 'main_contractor', 'general_foreman'].includes(profile.global_role)

  // Range picker derived state — represent endpoints as local YYYY-MM-DD.
  const fromDateValue = useMemo(() => isoToDateInputValue(rangeFrom), [rangeFrom])
  const toDateValue = useMemo(() => isoToDateInputValue(rangeTo), [rangeTo])

  function shiftWeek(direction: -1 | 1) {
    const from = new Date(rangeFrom).getTime() + direction * 7 * ONE_DAY_MS
    const to = new Date(rangeTo).getTime() + direction * 7 * ONE_DAY_MS
    setRange(new Date(from).toISOString(), new Date(to).toISOString())
  }

  function resetThisWeek() {
    const { from, to } = defaultHktWeekRange()
    setRange(from, to)
  }

  function onFromChange(v: string) {
    const iso = localDateInputToIso(v, false)
    if (iso) setRange(iso, rangeTo)
  }

  function onToChange(v: string) {
    const iso = localDateInputToIso(v, true)
    if (iso) setRange(rangeFrom, iso)
  }

  // Group entries by local day. The RPC already returned them in range; we
  // sort within each day by occurs_at ascending.
  const groups = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>()
    // Walk every day in range so empty days render with the "冇安排" note.
    const startMs = new Date(rangeFrom).getTime()
    const endMs = new Date(rangeTo).getTime()
    const startDay = new Date(startMs)
    startDay.setHours(0, 0, 0, 0)
    for (let t = startDay.getTime(); t <= endMs; t += ONE_DAY_MS) {
      const key = dayKey(new Date(t).toISOString())
      if (!map.has(key)) map.set(key, [])
    }
    for (const e of entries) {
      const key = dayKey(e.occurs_at)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.occurs_at.localeCompare(b.occurs_at))
    }
    // Sort the day-keys ascending.
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries, rangeFrom, rangeTo])

  function openEditFor(entry: TimetableEntry) {
    if (entry.source !== 'event') return
    const ev = events.find(e => e.id === entry.ref_id)
    if (!ev) return
    setEditing(ev)
    setFormOpen(true)
  }

  return (
    <div className="pb-24">
      {/* Range picker */}
      <div className="card p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={18} className="text-site-500" />
          <h2 className="text-sm font-semibold text-site-900">時段</h2>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-sm"
            aria-label="上一週"
          >
            <ChevronLeft size={16} />
            <span>上週</span>
          </button>
          <button
            type="button"
            onClick={resetThisWeek}
            className="btn-ghost px-3 py-2 text-sm"
          >
            本週
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="btn-ghost inline-flex items-center gap-1 px-3 py-2 text-sm"
            aria-label="下一週"
          >
            <span>下週</span>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <div>
            <label className="label text-xs">由</label>
            <input
              type="date"
              value={fromDateValue}
              onChange={e => onFromChange(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label text-xs">至</label>
            <input
              type="date"
              value={toDateValue}
              onChange={e => onToChange(e.target.value)}
              className="input"
            />
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([key, list]) => (
            <section key={key}>
              <h3 className="text-sm font-semibold text-site-700 mb-2">
                {formatDateHeading(key)}
              </h3>
              {list.length === 0 ? (
                <p className="text-xs text-site-400 px-3 py-2">— 冇安排 —</p>
              ) : (
                <ul className="space-y-2">
                  {list.map(entry => (
                    <li
                      key={`${entry.source}-${entry.ref_id}-${entry.occurs_at}`}
                      className="card p-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${SOURCE_BADGE_CLASS[entry.source]}`}
                        >
                          {SOURCE_LABEL[entry.source]}
                        </span>
                        <span className="text-xs font-mono text-site-600">
                          {formatTime(entry.occurs_at)}
                        </span>
                        {entry.source === 'event' && canWrite && (
                          <button
                            type="button"
                            onClick={() => openEditFor(entry)}
                            className="ml-auto inline-flex items-center gap-1 text-xs text-site-600 hover:text-site-900 min-h-0"
                            aria-label="編輯事件"
                          >
                            <Pencil size={12} />
                            <span>編輯</span>
                          </button>
                        )}
                      </div>
                      <p className="font-semibold text-site-900 mt-1 break-words">
                        {entry.title}
                      </p>
                      <EntryMeta entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {canWrite && (
        <button
          type="button"
          onClick={() => { setEditing(null); setFormOpen(true) }}
          className="fixed right-4 bottom-24 md:bottom-10 z-40 btn-primary rounded-full shadow-card-md inline-flex items-center gap-1 px-4 py-3"
          aria-label="新增事件"
        >
          <Plus size={18} />
          <span>新增事件</span>
        </button>
      )}

      <EventForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        event={editing}
      />

      {/* Silence "unused" until project-scoped views show project header */}
      <span className="hidden">{projectId}</span>
    </div>
  )
}

function EntryMeta({ entry }: { entry: TimetableEntry }) {
  const meta = entry.meta ?? {}
  if (entry.source === 'material') {
    const status = String(meta.status ?? '—')
    const qtyArrived = meta.qty_arrived ?? '—'
    const qtyNeeded = meta.qty_needed ?? '—'
    const linked = Array.isArray(meta.item_ids) ? meta.item_ids.length : (meta.linked_count ?? 0)
    return (
      <p className="text-xs text-site-600 mt-1">
        狀態：{status} | 已到 {String(qtyArrived)}/{String(qtyNeeded)} 單位 | 影響 {String(linked)} 個進度項目
      </p>
    )
  }
  if (entry.source === 'completion') {
    const planned = meta.planned_progress ?? meta.planned ?? '—'
    const actual = meta.actual_progress ?? meta.actual ?? '—'
    const status = String(meta.status ?? '—')
    return (
      <p className="text-xs text-site-600 mt-1">
        計劃進度 {String(planned)}% / 實際 {String(actual)}% | 狀態 {status}
      </p>
    )
  }
  // event
  const location = meta.location ? String(meta.location) : null
  const typeRaw = meta.event_type ? String(meta.event_type) : null
  const typeLabel = typeRaw && (typeRaw in EVENT_TYPE_ZH)
    ? EVENT_TYPE_ZH[typeRaw as EventType]
    : (typeRaw ?? '—')
  const description = meta.description ? String(meta.description) : null
  const parts: string[] = []
  if (location) parts.push(`地點：${location}`)
  parts.push(`類型：${typeLabel}`)
  if (description) parts.push(`描述：${description}`)
  return (
    <p className="text-xs text-site-600 mt-1 whitespace-pre-wrap break-words">
      {parts.join(' | ')}
    </p>
  )
}

// ── Page entry ──────────────────────────────────────────────────────────────
export default function TimetablePage() {
  const { id } = useParams<{ id: string }>()
  if (!id) {
    return (
      <AppLayout title="行事曆">
        <p className="text-site-500">缺少項目編號</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="行事曆">
      <EventsProvider projectId={id}>
        <TimetableProvider projectId={id}>
          <TimetableInner projectId={id} />
        </TimetableProvider>
      </EventsProvider>
    </AppLayout>
  )
}
