import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Contact, ContactInput } from '../../contexts/ContactsContext'
import { TRADE_SUGGESTIONS, useContacts } from '../../contexts/ContactsContext'

// Create / edit a single contact. The trade input is a free-text field
// backed by a <datalist> of TRADE_SUGGESTIONS so common trades are one
// tap, but operators can type custom labels (e.g. specific subcon names).

interface Props {
  open: boolean
  onClose: () => void
  initial?: Contact | null
}

export function AddContactModal({ open, onClose, initial }: Props) {
  const { createContact, updateContact } = useContacts()
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setTrade(initial?.trade ?? '')
    setPhone(initial?.phone ?? '')
    setNotes(initial?.notes ?? '')
    setError(null)
  }, [open, initial])

  if (!open) return null

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) { setError('請輸入姓名'); return }
    if (!trade.trim()) { setError('請輸入行頭'); return }
    if (!phone.trim()) { setError('請輸入電話'); return }
    setSaving(true)
    const payload: ContactInput = { name, trade, phone, notes }
    const res = initial
      ? await updateContact(initial.id, payload)
      : await createContact(payload)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-site-900">
            {initial ? '編輯聯絡人' : '新增聯絡人'}
          </h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="關閉">
            <X size={20} />
          </button>
        </div>

        <datalist id="trade-suggestions">
          {TRADE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
        </datalist>

        <div className="space-y-3">
          <div>
            <label className="label">姓名 *</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="陳先生 / 李師傅"
            />
          </div>

          <div>
            <label className="label">行頭 *</label>
            <input
              type="text"
              list="trade-suggestions"
              className="input"
              value={trade}
              onChange={e => setTrade(e.target.value)}
              placeholder="電工 / 水喉 / 紮鐵 ..."
            />
            <p className="text-[11px] text-site-400 mt-1">由建議揀，或自己打字</p>
          </div>

          <div>
            <label className="label">電話 *</label>
            <input
              type="tel"
              inputMode="tel"
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9123 4567"
            />
          </div>

          <div>
            <label className="label">備註</label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="公司、報價、合作經驗等"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-ghost flex-1"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary flex-1"
            >
              {saving ? '儲存中...' : (initial ? '更新' : '加入')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
