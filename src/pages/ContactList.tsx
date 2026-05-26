import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Phone, Plus, Edit3, Trash2, Search } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { AddContactModal } from '../components/contact/AddContactModal'
import { ContactsProvider, useContacts } from '../contexts/ContactsContext'
import type { Contact } from '../contexts/ContactsContext'

export default function ContactListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <ContactsProvider projectId={id}>
      <ContactListInner projectId={id} />
    </ContactsProvider>
  )
}

function ContactListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { contacts, loading, error, canManage, deleteContact } = useContacts()
  const [query, setQuery] = useState('')
  const [tradeFilter, setTradeFilter] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const trades = useMemo(() => {
    const set = new Set(contacts.map(c => c.trade))
    return Array.from(set).sort()
  }, [contacts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts.filter(c => {
      if (tradeFilter && c.trade !== tradeFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q)
        || c.trade.toLowerCase().includes(q)
        || c.phone.includes(q)
      )
    })
  }, [contacts, query, tradeFilter])

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(c: Contact) {
    setEditing(c)
    setModalOpen(true)
  }
  async function handleDelete(id: string) {
    await deleteContact(id)
    setConfirmDeleteId(null)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3 space-y-3">
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]"
        >
          <ChevronLeft size={18} /> 返回工地
        </button>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-site-900">聯絡人</h1>
          {canManage && (
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-1.5"
            >
              <Plus size={16} /> 新增
            </button>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
          <input
            type="text"
            className="input pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜尋名 / 行頭 / 電話"
          />
        </div>

        {trades.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setTradeFilter(null)}
              className={`text-sm px-3 py-1.5 rounded-full font-medium min-h-[44px] ${
                tradeFilter === null
                  ? 'bg-safety-500 text-white'
                  : 'bg-site-100 text-site-600 hover:bg-site-200'
              }`}
            >
              全部
            </button>
            {trades.map(t => (
              <button
                key={t}
                onClick={() => setTradeFilter(t)}
                className={`text-sm px-3 py-1.5 rounded-full font-medium min-h-[44px] ${
                  tradeFilter === t
                    ? 'bg-safety-500 text-white'
                    : 'bg-site-100 text-site-600 hover:bg-site-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {loading && <Spinner size={20} className="mx-auto my-8" />}

        {error && (
          <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {contacts.length === 0
              ? (canManage ? '仲未有聯絡人。撳「新增」加入第一位。' : '仲未有聯絡人。')
              : '搵唔到符合條件嘅聯絡人'}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-site-900">{c.name}</span>
                  <span className="text-[11px] bg-safety-50 text-safety-700 px-2 py-0.5 rounded-full font-medium">
                    {c.trade}
                  </span>
                </div>
                <a
                  href={`tel:${c.phone.replace(/\s+/g, '')}`}
                  className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1 min-h-[44px]"
                >
                  <Phone size={14} /> {c.phone}
                </a>
                {c.notes && (
                  <p className="text-xs text-site-500 mt-1 line-clamp-2">{c.notes}</p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-col gap-1.5">
                  {confirmDeleteId === c.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium"
                      >
                        確認刪除
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => openEdit(c)}
                        className="text-site-500 hover:text-site-800 p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-site-50 flex items-center justify-center"
                        aria-label="編輯"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="text-red-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-red-50 flex items-center justify-center"
                        aria-label="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <AddContactModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        initial={editing}
      />
    </AppLayout>
  )
}
