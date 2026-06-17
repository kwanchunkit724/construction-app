import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, Plus, Sparkles, ShieldCheck, Trash2, X, Camera, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { CleansingProvider, useCleansing } from '../contexts/CleansingContext'
import type { CleansingInput } from '../contexts/CleansingContext'
import { capturePhotoGeo, recordPhotoMeta } from '../lib/photoMeta'
import { signIssuePhoto, issuePhotoPath } from '../lib/issuePhotos'
import { useAuth } from '../contexts/AuthContext'
import {
  CLEANSING_FREQUENCY_ZH, CLEANSING_RESULT_ZH, CLEANSING_ITEM_STATUS_ZH,
  DEFAULT_CLEANSING_CHECKLIST,
} from '../types'
import type {
  CleansingInspection, CleansingChecklistItem, CleansingFrequency,
  CleansingResult, CleansingItemStatus,
} from '../types'

export default function CleansingListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <CleansingProvider projectId={id}>
      <CleansingInner projectId={id} />
    </CleansingProvider>
  )
}

function todayHK(): string {
  // YYYY-MM-DD in Asia/Hong_Kong (matches the dailies same-day convention).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return parts
}

function resultBadge(result: CleansingResult) {
  const map: Record<CleansingResult, string> = {
    pass: 'bg-green-100 text-green-700',
    pass_with_remarks: 'bg-amber-100 text-amber-700',
    fail: 'bg-red-50 text-red-600 border border-red-200',
  }
  return map[result]
}

function CleansingInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { inspections, loading, error, canManage, canVerify, deleteInspection, verifyInspection } = useCleansing()
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleVerify(id: string) {
    setBusyId(id)
    await verifyInspection(id)
    setBusyId(null)
  }
  async function handleDelete(id: string) {
    setBusyId(id)
    await deleteInspection(id)
    setConfirmDeleteId(null)
    setBusyId(null)
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
              <Sparkles size={20} className="text-cyan-600" /> 清潔檢查
            </h1>
            <p className="text-xs text-site-500 mt-0.5">每日 / 每週工地清潔巡查記錄 · 簽核存證 (DWSS 模組 ④)</p>
          </div>
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> 新增
            </button>
          )}
        </div>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && (
          <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>
        )}

        {!loading && inspections.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {canManage ? '仲未有清潔檢查記錄。撳「新增」開始第一張。' : '仲未有清潔檢查記錄。'}
          </div>
        )}

        <div className="space-y-2">
          {inspections.map(insp => (
            <CleansingCard
              key={insp.id}
              insp={insp}
              canVerify={canVerify}
              busy={busyId === insp.id}
              confirmDelete={confirmDeleteId === insp.id}
              onVerify={() => handleVerify(insp.id)}
              onAskDelete={() => setConfirmDeleteId(insp.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => handleDelete(insp.id)}
            />
          ))}
        </div>
      </div>

      {createOpen && (
        <CreateCleansingModal projectId={projectId} onClose={() => setCreateOpen(false)} />
      )}
    </AppLayout>
  )
}

function CleansingCard({
  insp, canVerify, busy, confirmDelete, onVerify, onAskDelete, onCancelDelete, onDelete,
}: {
  insp: CleansingInspection
  canVerify: boolean
  busy: boolean
  confirmDelete: boolean
  onVerify: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const failCount = insp.checklist.filter(c => c.status === 'fail').length
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-site-400">{insp.number}</span>
            <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">
              {CLEANSING_FREQUENCY_ZH[insp.frequency]}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${resultBadge(insp.result)}`}>
              {CLEANSING_RESULT_ZH[insp.result]}
            </span>
            {insp.verified_at && (
              <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                <ShieldCheck size={11} /> 已核實
              </span>
            )}
          </div>
          <p className="font-bold text-site-900 mt-1">{insp.area}</p>
          <p className="text-xs text-site-500">{insp.inspected_on}</p>
        </div>
      </div>

      <div className="space-y-1">
        {insp.checklist.map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <ItemStatusDot status={c.status} />
            <span className="flex-1 text-site-700">{c.label}</span>
            {c.remark && <span className="text-xs text-site-400 italic">{c.remark}</span>}
          </div>
        ))}
      </div>

      {insp.photos.length > 0 && (
        <div className="flex gap-2 flex-wrap pt-1">
          {insp.photos.map((p, i) => <CleansingThumb key={i} stored={p} />)}
        </div>
      )}

      {insp.notes && <p className="text-xs text-site-500 border-t border-site-100 pt-2">{insp.notes}</p>}

      {failCount > 0 && !insp.verified_at && (
        <p className="text-xs text-red-600 inline-flex items-center gap-1">
          <AlertTriangle size={12} /> {failCount} 項不合格 — 需跟進
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {canVerify && !insp.verified_at && (
          <button
            onClick={onVerify}
            disabled={busy}
            className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium inline-flex items-center gap-1.5"
          >
            <ShieldCheck size={15} /> {busy ? '...' : '核實'}
          </button>
        )}
        {!insp.verified_at && (
          confirmDelete ? (
            <>
              <button onClick={onDelete} disabled={busy} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium">確認刪除</button>
              <button onClick={onCancelDelete} className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium">取消</button>
            </>
          ) : (
            <button onClick={onAskDelete} className="text-red-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-red-50 flex items-center justify-center" aria-label="刪除">
              <Trash2 size={16} />
            </button>
          )
        )}
      </div>
    </div>
  )
}

function ItemStatusDot({ status }: { status: CleansingItemStatus }) {
  const map: Record<CleansingItemStatus, string> = {
    pass: 'bg-green-500',
    fail: 'bg-red-500',
    na: 'bg-site-300',
  }
  return <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${map[status]}`} aria-label={CLEANSING_ITEM_STATUS_ZH[status]} />
}

function CleansingThumb({ stored }: { stored: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signIssuePhoto(stored).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [stored])
  if (!url) return <div className="w-16 h-16 rounded-lg bg-site-100 animate-pulse" />
  return <img src={url} alt="清潔檢查相片" className="w-16 h-16 rounded-lg object-cover border border-site-200" />
}

function CreateCleansingModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { profile } = useAuth()
  const { createInspection, uploadPhoto } = useCleansing()
  const [inspectedOn, setInspectedOn] = useState(todayHK())
  const [frequency, setFrequency] = useState<CleansingFrequency>('daily')
  const [area, setArea] = useState('')
  const [items, setItems] = useState<CleansingChecklistItem[]>(
    DEFAULT_CLEANSING_CHECKLIST.map(label => ({ label, status: 'pass' as CleansingItemStatus, remark: '' })),
  )
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<{ path: string | null; uploading: boolean }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const geoRef = useState<{ done: boolean }>({ done: false })[0]
  const [geo, setGeo] = useState<Awaited<ReturnType<typeof capturePhotoGeo>>>(null)

  // Overall result is derived from the checklist but stays editable.
  const derivedResult: CleansingResult = useMemo(() => {
    if (items.some(i => i.status === 'fail')) return 'fail'
    if (items.some(i => (i.remark ?? '').trim().length > 0)) return 'pass_with_remarks'
    return 'pass'
  }, [items])
  const [result, setResult] = useState<CleansingResult | null>(null)
  const effectiveResult = result ?? derivedResult

  function setItemStatus(idx: number, status: CleansingItemStatus) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, status } : it))
  }
  function setItemRemark(idx: number, remark: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, remark } : it))
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (!geoRef.done) { geoRef.done = true; capturePhotoGeo().then(setGeo) }
    for (const file of files) {
      const slotIndex = photos.length
      setPhotos(prev => [...prev, { path: null, uploading: true }])
      const { path, error } = await uploadPhoto(file)
      if (error) setErr(error)
      setPhotos(prev => prev.map((p, i) => i === slotIndex ? { path, uploading: false } : p))
    }
  }

  async function submit() {
    if (!profile) return
    if (!area.trim()) return setErr('請輸入檢查範圍')
    if (photos.some(p => p.uploading)) return setErr('照片仍在上傳中，請稍候')
    setSubmitting(true)
    setErr(null)
    const photoPaths = photos.map(p => p.path).filter((p): p is string => !!p)
    const input: CleansingInput = {
      inspected_on: inspectedOn,
      frequency,
      area,
      checklist: items.map(it => ({ label: it.label, status: it.status, remark: (it.remark ?? '').trim() || undefined })),
      result: effectiveResult,
      notes,
      photos: photoPaths,
    }
    const { error } = await createInspection(input)
    if (error) { setErr(error); setSubmitting(false); return }
    // Best-effort capture metadata (B2 / DWSS §3.3.3) — never blocks the record.
    const capturedAt = new Date().toISOString()
    void Promise.all(photoPaths.map(path =>
      recordPhotoMeta({
        projectId, bucket: 'issue-photos', photoPath: issuePhotoPath(path),
        capturedAt, geo, uploadedBy: profile.id,
      }),
    ))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900 flex items-center gap-2"><Sparkles size={18} className="text-cyan-600" /> 新增清潔檢查</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">檢查日期</label>
              <input type="date" className="input" value={inspectedOn} onChange={e => setInspectedOn(e.target.value)} />
            </div>
            <div>
              <label className="label">頻率</label>
              <select className="input" value={frequency} onChange={e => setFrequency(e.target.value as CleansingFrequency)}>
                {(['daily', 'weekly', 'ad_hoc'] as CleansingFrequency[]).map(f => (
                  <option key={f} value={f}>{CLEANSING_FREQUENCY_ZH[f]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">檢查範圍</label>
            <input className="input" value={area} onChange={e => setArea(e.target.value)} placeholder="例：3/F 走廊、地盤出入口、垃圾站" />
          </div>

          <div>
            <label className="label">檢查項目</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="border border-site-200 rounded-xl p-2.5 space-y-1.5">
                  <p className="text-sm text-site-800">{it.label}</p>
                  <div className="flex gap-1.5">
                    {(['pass', 'fail', 'na'] as CleansingItemStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setItemStatus(idx, s)}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium min-h-[36px] transition-colors ${
                          it.status === s
                            ? (s === 'pass' ? 'bg-green-500 text-white' : s === 'fail' ? 'bg-red-500 text-white' : 'bg-site-400 text-white')
                            : 'bg-site-100 text-site-600 hover:bg-site-200'
                        }`}
                      >
                        {CLEANSING_ITEM_STATUS_ZH[s]}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input text-sm"
                    value={it.remark ?? ''}
                    onChange={e => setItemRemark(idx, e.target.value)}
                    placeholder={it.status === 'fail' ? '備註 / 跟進（不合格須說明）' : '備註（可選）'}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">整體結果</label>
            <select className="input" value={effectiveResult} onChange={e => setResult(e.target.value as CleansingResult)}>
              {(['pass', 'pass_with_remarks', 'fail'] as CleansingResult[]).map(r => (
                <option key={r} value={r}>{CLEANSING_RESULT_ZH[r]}</option>
              ))}
            </select>
            <p className="text-[11px] text-site-400 mt-1">系統按檢查項目建議「{CLEANSING_RESULT_ZH[derivedResult]}」，可手動調整。</p>
          </div>

          <div>
            <label className="label">相片（可選）</label>
            <div className="flex gap-2 flex-wrap items-center">
              {photos.map((p, i) => (
                <div key={i} className="w-16 h-16 rounded-lg bg-site-100 flex items-center justify-center text-xs text-site-400">
                  {p.uploading ? <Spinner size={16} /> : '✓'}
                </div>
              ))}
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-site-200 flex items-center justify-center cursor-pointer hover:bg-site-50 text-site-400">
                <Camera size={20} />
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
              </label>
            </div>
          </div>

          <div>
            <label className="label">備註（可選）</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="其他觀察 / 跟進事項" />
          </div>

          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
            提交清潔檢查
          </button>
        </div>
      </div>
    </div>
  )
}
