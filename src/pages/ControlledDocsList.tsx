import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, FileStack, X, GitBranch, Ban, Trash2, CheckCircle2 } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { ControlledDocsProvider, useControlledDocs } from '../contexts/ControlledDocsContext'
import type { CdInput } from '../contexts/ControlledDocsContext'
import { CONTROLLED_DOC_CATEGORY_ZH, CONTROLLED_DOC_STATUS_ZH } from '../types'
import type { ControlledDoc, ControlledDocCategory, ControlledDocStatus } from '../types'

export default function ControlledDocsListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <ControlledDocsProvider projectId={id}>
      <ControlledDocsInner projectId={id} />
    </ControlledDocsProvider>
  )
}

function statusBadge(s: ControlledDocStatus) {
  const map: Record<ControlledDocStatus, string> = {
    current: 'bg-green-100 text-green-700',
    superseded: 'bg-site-100 text-site-500',
    withdrawn: 'bg-red-50 text-red-600 border border-red-200',
  }
  return map[s]
}

function ControlledDocsInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { docs, loading, error, canManage, canWithdraw, deleteDoc, withdrawDoc } = useControlledDocs()
  const [createOpen, setCreateOpen] = useState(false)
  const [reviseFor, setReviseFor] = useState<ControlledDoc | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showSuperseded, setShowSuperseded] = useState(false)

  const shown = useMemo(
    () => showSuperseded ? docs : docs.filter(d => d.status !== 'superseded'),
    [docs, showSuperseded],
  )

  async function run(id: string, fn: () => Promise<{ error: string | null }>) {
    setBusyId(id)
    await fn()
    setBusyId(null)
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
          <div>
            <h1 className="text-xl font-bold text-site-900 flex items-center gap-2">
              <FileStack size={20} className="text-violet-600" /> 受控文件登記冊
            </h1>
            <p className="text-xs text-site-500 mt-0.5">受控文件版本 · 生效 / 取代 / 撤回 · 持有人記錄</p>
          </div>
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> 登記
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-site-600 px-1">
          <input type="checkbox" checked={showSuperseded} onChange={e => setShowSuperseded(e.target.checked)} />
          顯示已被取代版本
        </label>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>}

        {!loading && shown.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {docs.length === 0
              ? (canManage ? '仲未有受控文件。撳「登記」加入第一份。' : '仲未有受控文件。')
              : '冇生效中嘅受控文件'}
          </div>
        )}

        <div className="space-y-2">
          {shown.map(d => (
            <div key={d.id} className="card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-site-400">{d.number}</span>
                    <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">{CONTROLLED_DOC_CATEGORY_ZH[d.doc_category]}</span>
                    <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">版本 {d.revision}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(d.status)}`}>{CONTROLLED_DOC_STATUS_ZH[d.status]}</span>
                  </div>
                  <p className="font-bold text-site-900 mt-1">{d.title}</p>
                  {d.holders && <p className="text-xs text-site-500 mt-0.5">持有人：{d.holders}</p>}
                  {d.notes && <p className="text-xs text-site-500 mt-0.5">{d.notes}</p>}
                </div>
              </div>

              {d.status === 'current' && (canManage || canWithdraw) && (
                <div className="flex items-center gap-2 pt-1 border-t border-site-100">
                  {canManage && (
                    <button onClick={() => setReviseFor(d)} disabled={busyId === d.id} className="text-sm text-blue-600 hover:text-blue-800 px-2 py-2 rounded-lg min-h-[44px] inline-flex items-center gap-1.5">
                      <GitBranch size={15} /> 發出新版本
                    </button>
                  )}
                  {canWithdraw && (
                    <button onClick={() => run(d.id, () => withdrawDoc(d.id))} disabled={busyId === d.id} className="text-sm text-site-500 hover:text-site-800 px-2 py-2 rounded-lg min-h-[44px] inline-flex items-center gap-1.5">
                      <Ban size={15} /> 撤回
                    </button>
                  )}
                  {confirmDeleteId === d.id ? (
                    <>
                      <button onClick={() => run(d.id, () => deleteDoc(d.id))} disabled={busyId === d.id} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium ml-auto">確認刪除</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium">取消</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(d.id)} className="text-red-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-red-50 flex items-center justify-center ml-auto" aria-label="刪除">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {createOpen && <CreateCdModal onClose={() => setCreateOpen(false)} />}
      {reviseFor && <ReviseCdModal doc={reviseFor} onClose={() => setReviseFor(null)} />}
    </AppLayout>
  )
}

function CreateCdModal({ onClose }: { onClose: () => void }) {
  const { createDoc } = useControlledDocs()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ControlledDocCategory>('drawing')
  const [revision, setRevision] = useState('A')
  const [holders, setHolders] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) return setErr('請輸入文件名稱')
    setSubmitting(true); setErr(null)
    const input: CdInput = { title, doc_category: category, revision, holders: holders || null, notes: notes || null }
    const { error } = await createDoc(input)
    if (error) { setErr(error); setSubmitting(false); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900 flex items-center gap-2"><FileStack size={18} className="text-violet-600" /> 登記受控文件</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="label">文件名稱</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：地基結構圖則" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">類別</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value as ControlledDocCategory)}>
                {(Object.keys(CONTROLLED_DOC_CATEGORY_ZH) as ControlledDocCategory[]).map(c => (
                  <option key={c} value={c}>{CONTROLLED_DOC_CATEGORY_ZH[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">版本</label>
              <input className="input" value={revision} onChange={e => setRevision(e.target.value)} placeholder="A" />
            </div>
          </div>
          <div>
            <label className="label">受控副本持有人（可選）</label>
            <input className="input" value={holders} onChange={e => setHolders(e.target.value)} placeholder="例：地盤主任、結構工程師" />
          </div>
          <div>
            <label className="label">備註（可選）</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}
          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />} 登記
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviseCdModal({ doc, onClose }: { doc: ControlledDoc; onClose: () => void }) {
  const { reviseDoc } = useControlledDocs()
  const [revision, setRevision] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!revision.trim()) return setErr('請輸入新版本')
    setSubmitting(true); setErr(null)
    const { error } = await reviseDoc(doc.id, revision, note)
    if (error) { setErr(error); setSubmitting(false); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900 flex items-center gap-2"><GitBranch size={18} className="text-blue-600" /> 發出新版本</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-site-500">
            {doc.number}「{doc.title}」現時版本 <span className="font-mono">{doc.revision}</span> 將標記為已被取代。
          </p>
          <div>
            <label className="label">新版本</label>
            <input className="input" autoFocus value={revision} onChange={e => setRevision(e.target.value)} placeholder="例：B" />
          </div>
          <div>
            <label className="label">變更說明（可選）</label>
            <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}
          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <GitBranch size={16} />} 發出新版本
          </button>
        </div>
      </div>
    </div>
  )
}
