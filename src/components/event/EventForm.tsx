import { FormEvent, useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { useEvents, EVENT_TYPE_ZH } from '../../contexts/EventsContext'
import type { Event, EventType } from '../../contexts/EventsContext'

// datetime-local <input> uses the user's local clock with no timezone suffix.
// We render existing UTC ISO strings into that local-clock representation and
// convert back to ISO on submit. This keeps "what the user sees in the form"
// consistent with what's in the DB once it round-trips through Supabase.
function isoToLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputValueToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function EventForm({
  open,
  onClose,
  event,
}: {
  open: boolean
  onClose: () => void
  /** When set, the form edits this event; when null/undefined, it creates a new one. */
  event?: Event | null
}) {
  const { createEvent, updateEvent, deleteEvent } = useEvents()
  const isEdit = !!event

  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState<EventType>('meeting')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Reset form whenever modal opens or the edit target changes.
  useEffect(() => {
    if (!open) return
    setTitle(event?.title ?? '')
    setEventType(event?.event_type ?? 'meeting')
    setStartsAt(isoToLocalInputValue(event?.starts_at ?? null))
    setEndsAt(isoToLocalInputValue(event?.ends_at ?? null))
    setLocation(event?.location ?? '')
    setDescription(event?.description ?? '')
    setError('')
    setSubmitting(false)
    setDeleting(false)
  }, [open, event])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('請輸入標題')
      return
    }
    const startsIso = localInputValueToIso(startsAt)
    if (!startsIso) {
      setError('請選擇開始時間')
      return
    }
    const endsIso = endsAt ? localInputValueToIso(endsAt) : null
    if (endsAt && !endsIso) {
      setError('結束時間格式無效')
      return
    }
    if (endsIso && new Date(endsIso) < new Date(startsIso)) {
      setError('結束時間不可早於開始時間')
      return
    }

    setSubmitting(true)
    const payload = {
      title: trimmedTitle,
      event_type: eventType,
      starts_at: startsIso,
      ends_at: endsIso,
      location: location.trim() ? location.trim() : null,
      description: description.trim() ? description.trim() : null,
    }
    const { error: err } = isEdit && event
      ? await updateEvent(event.id, payload)
      : await createEvent(payload)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    onClose()
  }

  async function onDelete() {
    if (!event) return
    if (!window.confirm(`確定刪除事件「${event.title}」？`)) return
    setDeleting(true)
    setError('')
    const { error: err } = await deleteEvent(event.id)
    setDeleting(false)
    if (err) {
      setError(err)
      return
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '編輯事件' : '新增事件'}
      footer={
        <div className="flex gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting || submitting}
              className="btn-ghost text-red-600 border-red-200"
            >
              {deleting ? <Spinner size={16} className="text-red-600" /> : '刪除'}
            </button>
          )}
          <button
            type="submit"
            form="event-form"
            disabled={submitting || deleting}
            className="btn-primary flex-1"
          >
            {submitting ? <Spinner size={18} className="text-white" /> : (isEdit ? '儲存' : '建立')}
          </button>
        </div>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">標題 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例：地盤週會"
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label className="label">類型</label>
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value as EventType)}
            className="input"
          >
            {(Object.keys(EVENT_TYPE_ZH) as EventType[]).map(k => (
              <option key={k} value={k}>{EVENT_TYPE_ZH[k]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">開始時間 *</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={e => setStartsAt(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">結束時間（可選）</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={e => setEndsAt(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">地點（可選）</label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="例：地盤辦公室"
            className="input"
          />
        </div>

        <div>
          <label className="label">描述（可選）</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="議程、注意事項..."
            className="input resize-none"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
