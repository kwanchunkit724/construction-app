import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, ClipboardCheck, X, Camera, CheckCircle2, ChevronRight } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { RiscProvider, useRisc } from '../contexts/RiscContext'
import type { RiscRaiseInput } from '../contexts/RiscContext'
import { capturePhotoGeo, recordPhotoMeta } from '../lib/photoMeta'
import { signIssuePhoto, issuePhotoPath } from '../lib/issuePhotos'
import { useAuth } from '../contexts/AuthContext'
import { RISC_WORK_TYPE_ZH, RISC_STATUS_ZH } from '../types'
import type { RiscWorkType, RiscStatus } from '../types'

export default function RiscListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <RiscProvider projectId={id}>
      <RiscListInner projectId={id} />
    </RiscProvider>
  )
}

export function riscStatusBadge(s: RiscStatus) {
  const map: Record<RiscStatus, string> = {
    submitted: 'bg-amber-100 text-amber-700',
    passed: 'bg-green-100 text-green-700',
    failed: 'bg-red-50 text-red-600 border border-red-200',
    cancelled: 'bg-site-100 text-site-400 line-through',
  }
  return map[s]
}

export function RiscThumb({ stored }: { stored: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signIssuePhoto(stored).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [stored])
  if (!url) return <div className="w-16 h-16 rounded-lg bg-site-100 animate-pulse" />
  return <img src={url} alt="檢查相片" className="w-16 h-16 rounded-lg object-cover border border-site-200" />
}

function RiscListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { riscs, loading, error, canManage } = useRisc()
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<RiscStatus | null>(null)

  const filtered = useMemo(
    () => statusFilter ? riscs.filter(r => r.status === statusFilter) : riscs,
    [riscs, statusFilter],
  )
  const pendingCount = riscs.filter(r => r.status === 'submitted').length

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
              <ClipboardCheck size={20} className="text-teal-600" /> 申請檢查 (RISC)
            </h1>
            <p className="text-xs text-site-500 mt-0.5">申請工序檢查 / 驗收 · 檢查員簽核通過 · {pendingCount} 項待檢查</p>
          </div>
          {canManage && (
            <button onClick={() => setRaiseOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> 申請
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {([null, 'submitted', 'passed', 'failed', 'cancelled'] as (RiscStatus | null)[]).map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setStatusFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-full font-medium min-h-[44px] ${
                statusFilter === s ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'
              }`}
            >
              {s === null ? '全部' : RISC_STATUS_ZH[s]}
            </button>
          ))}
        </div>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>}

        {!loading && filtered.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {riscs.length === 0
              ? (canManage ? '仲未有檢查申請。撳「申請」開第一張 RISC。' : '仲未有檢查申請。')
              : '沒有符合篩選的申請'}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => navigate(`/project/${projectId}/risc/${r.id}`)}
              className="card w-full p-3 flex items-start gap-3 text-left hover:bg-site-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-site-400">{r.number}</span>
                  <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">
                    {RISC_WORK_TYPE_ZH[r.work_type]}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${riscStatusBadge(r.status)}`}>
                    {RISC_STATUS_ZH[r.status]}
                  </span>
                </div>
                <p className="font-bold text-site-900 mt-1 truncate">{r.title}</p>
                <p className="text-xs text-site-500 truncate">
                  {[r.location, r.proposed_at ? `擬於 ${new Date(r.proposed_at).toLocaleString('zh-HK')}` : null].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <ChevronRight size={18} className="text-site-300 flex-shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>

      {raiseOpen && <RaiseRiscModal projectId={projectId} onClose={() => setRaiseOpen(false)} onDone={id => { setRaiseOpen(false); navigate(`/project/${projectId}/risc/${id}`) }} />}
    </AppLayout>
  )
}

function RaiseRiscModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: (id: string) => void }) {
  const { profile } = useAuth()
  const { raiseRisc, uploadPhoto } = useRisc()
  const [title, setTitle] = useState('')
  const [workType, setWorkType] = useState<RiscWorkType>('rebar')
  const [location, setLocation] = useState('')
  const [specRef, setSpecRef] = useState('')
  const [proposedAt, setProposedAt] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<{ id: string; path: string | null; uploading: boolean }[]>([])
  const [geo, setGeo] = useState<Awaited<ReturnType<typeof capturePhotoGeo>>>(null)
  const [geoAsked, setGeoAsked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (!geoAsked) { setGeoAsked(true); capturePhotoGeo().then(setGeo) }
    await Promise.all(files.map(async file => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setPhotos(prev => [...prev, { id, path: null, uploading: true }])
      const { path, error } = await uploadPhoto(file)
      if (error) setErr(error)
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, path, uploading: false } : p))
    }))
  }

  async function submit() {
    if (!profile) return
    if (!title.trim()) return setErr('請輸入標題')
    if (photos.some(p => p.uploading)) return setErr('照片仍在上傳中，請稍候')
    setSubmitting(true)
    setErr(null)
    const photoPaths = photos.map(p => p.path).filter((p): p is string => !!p)
    const input: RiscRaiseInput = {
      title,
      work_type: workType,
      location: location || null,
      spec_ref: specRef || null,
      proposed_at: proposedAt ? new Date(proposedAt).toISOString() : null,
      description: description || null,
      photos: photoPaths,
    }
    const { id, error } = await raiseRisc(input)
    if (error || !id) { setErr(error || '申請失敗'); setSubmitting(false); return }
    const capturedAt = new Date().toISOString()
    void Promise.all(photoPaths.map(path =>
      recordPhotoMeta({ projectId, bucket: 'issue-photos', photoPath: issuePhotoPath(path), capturedAt, geo, uploadedBy: profile.id }),
    ))
    onDone(id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900 flex items-center gap-2"><ClipboardCheck size={18} className="text-teal-600" /> 申請檢查 / 驗收</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="label">標題</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：3/F 樑柱鋼筋完成,申請檢查" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">工序類型</label>
              <select className="input" value={workType} onChange={e => setWorkType(e.target.value as RiscWorkType)}>
                {(Object.keys(RISC_WORK_TYPE_ZH) as RiscWorkType[]).map(w => (
                  <option key={w} value={w}>{RISC_WORK_TYPE_ZH[w]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">擬檢查時間（可選）</label>
              <input type="datetime-local" className="input" value={proposedAt} onChange={e => setProposedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">位置 / 區域</label>
              <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="例：3/F 東翼" />
            </div>
            <div>
              <label className="label">規範 / 圖則編號</label>
              <input className="input" value={specRef} onChange={e => setSpecRef(e.target.value)} placeholder="例：DWG S-203 / GS 16.3" />
            </div>
          </div>
          <div>
            <label className="label">說明（可選）</label>
            <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="檢查範圍 / 注意事項" />
          </div>

          <div>
            <label className="label">相片（可選）</label>
            <div className="flex gap-2 flex-wrap items-center">
              {photos.map((p) => (
                <div key={p.id} className="w-16 h-16 rounded-lg bg-site-100 flex items-center justify-center text-xs text-site-400">
                  {p.uploading ? <Spinner size={16} /> : p.path ? '✓' : <span className="text-red-500" title="上載失敗">⚠</span>}
                </div>
              ))}
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-site-200 flex items-center justify-center cursor-pointer hover:bg-site-50 text-site-400">
                <Camera size={20} />
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickPhotos} />
              </label>
            </div>
          </div>

          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />} 提交申請
          </button>
        </div>
      </div>
    </div>
  )
}
