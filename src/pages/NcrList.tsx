import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, ClipboardX, X, Camera, CheckCircle2, ChevronRight } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { NcrProvider, useNcr } from '../contexts/NcrContext'
import type { NcrRaiseInput } from '../contexts/NcrContext'
import { capturePhotoGeo, recordPhotoMeta } from '../lib/photoMeta'
import { signIssuePhoto, issuePhotoPath } from '../lib/issuePhotos'
import { useAuth } from '../contexts/AuthContext'
import { NCR_SEVERITY_ZH, NCR_STATUS_ZH } from '../types'
import type { Ncr, NcrSeverity, NcrStatus } from '../types'

export default function NcrListPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return (
    <NcrProvider projectId={id}>
      <NcrListInner projectId={id} />
    </NcrProvider>
  )
}

export function severityBadge(s: NcrSeverity) {
  const map: Record<NcrSeverity, string> = {
    minor: 'bg-site-100 text-site-600',
    major: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-50 text-red-600 border border-red-200',
  }
  return map[s]
}

export function statusBadge(s: NcrStatus) {
  const map: Record<NcrStatus, string> = {
    open: 'bg-amber-100 text-amber-700',
    corrective_submitted: 'bg-blue-50 text-blue-700',
    closed: 'bg-green-100 text-green-700',
    void: 'bg-site-100 text-site-400 line-through',
  }
  return map[s]
}

export function NcrThumb({ stored }: { stored: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signIssuePhoto(stored).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [stored])
  if (!url) return <div className="w-16 h-16 rounded-lg bg-site-100 animate-pulse" />
  return <img src={url} alt="NCR 相片" className="w-16 h-16 rounded-lg object-cover border border-site-200" />
}

function NcrListInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { ncrs, loading, error, canManage } = useNcr()
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<NcrStatus | null>(null)

  const filtered = useMemo(
    () => statusFilter ? ncrs.filter(n => n.status === statusFilter) : ncrs,
    [ncrs, statusFilter],
  )
  const openCount = ncrs.filter(n => n.status === 'open' || n.status === 'corrective_submitted').length

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
              <ClipboardX size={20} className="text-rose-600" /> 不符合事項 (NCR)
            </h1>
            <p className="text-xs text-site-500 mt-0.5">品質不符合報告 + 糾正措施 (CAR) · {openCount} 項未關閉</p>
          </div>
          {canManage && (
            <button onClick={() => setRaiseOpen(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> 開立
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {([null, 'open', 'corrective_submitted', 'closed', 'void'] as (NcrStatus | null)[]).map(s => (
            <button
              key={s ?? 'all'}
              onClick={() => setStatusFilter(s)}
              className={`text-sm px-3 py-1.5 rounded-full font-medium min-h-[44px] ${
                statusFilter === s ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'
              }`}
            >
              {s === null ? '全部' : NCR_STATUS_ZH[s]}
            </button>
          ))}
        </div>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>}

        {!loading && filtered.length === 0 && (
          <div className="card p-8 text-center text-site-400 text-sm">
            {ncrs.length === 0
              ? (canManage ? '仲未有不符合事項。撳「開立」記錄第一張 NCR。' : '仲未有不符合事項。')
              : '沒有符合篩選的 NCR'}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(n => (
            <button
              key={n.id}
              onClick={() => navigate(`/project/${projectId}/ncr/${n.id}`)}
              className="card w-full p-3 flex items-start gap-3 text-left hover:bg-site-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-site-400">{n.number}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${severityBadge(n.severity)}`}>
                    {NCR_SEVERITY_ZH[n.severity]}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(n.status)}`}>
                    {NCR_STATUS_ZH[n.status]}
                  </span>
                </div>
                <p className="font-bold text-site-900 mt-1 truncate">{n.title}</p>
                <p className="text-xs text-site-500 truncate">
                  {[n.location, n.responsible_party].filter(Boolean).join(' · ') || '—'}
                  {n.target_close_date ? ` · 限期 ${n.target_close_date}` : ''}
                </p>
              </div>
              <ChevronRight size={18} className="text-site-300 flex-shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>

      {raiseOpen && <RaiseNcrModal projectId={projectId} onClose={() => setRaiseOpen(false)} onDone={id => { setRaiseOpen(false); navigate(`/project/${projectId}/ncr/${id}`) }} />}
    </AppLayout>
  )
}

function RaiseNcrModal({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: (id: string) => void }) {
  const { profile } = useAuth()
  const { raiseNcr, uploadPhoto } = useNcr()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [specRef, setSpecRef] = useState('')
  const [severity, setSeverity] = useState<NcrSeverity>('major')
  const [responsible, setResponsible] = useState('')
  const [targetDate, setTargetDate] = useState('')
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
    // Stable id per file (not a stale positional index) so multi-select never
    // strands a slot in a permanent 'uploading' state.
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
    if (!description.trim()) return setErr('請描述不符合事項')
    if (photos.some(p => p.uploading)) return setErr('照片仍在上傳中，請稍候')
    setSubmitting(true)
    setErr(null)
    const photoPaths = photos.map(p => p.path).filter((p): p is string => !!p)
    const input: NcrRaiseInput = {
      title, description,
      location: location || null,
      spec_ref: specRef || null,
      severity,
      responsible_party: responsible || null,
      target_close_date: targetDate || null,
      photos: photoPaths,
    }
    const { id, error } = await raiseNcr(input)
    if (error || !id) { setErr(error || '開立失敗'); setSubmitting(false); return }
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
          <h2 className="font-bold text-site-900 flex items-center gap-2"><ClipboardX size={18} className="text-rose-600" /> 開立不符合事項</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="label">標題</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：3/F 石屎強度未達標" />
          </div>
          <div>
            <label className="label">不符合描述</label>
            <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="描述與圖則 / 規範 / 標準的偏差" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">位置 / 區域</label>
              <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="例：3/F 東翼" />
            </div>
            <div>
              <label className="label">規範 / 圖則編號</label>
              <input className="input" value={specRef} onChange={e => setSpecRef(e.target.value)} placeholder="例：GS 16.3 / DWG A-203" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">嚴重程度</label>
              <select className="input" value={severity} onChange={e => setSeverity(e.target.value as NcrSeverity)}>
                {(['minor', 'major', 'critical'] as NcrSeverity[]).map(s => (
                  <option key={s} value={s}>{NCR_SEVERITY_ZH[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">糾正限期（可選）</label>
              <input type="date" className="input" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">責任方（可選）</label>
            <input className="input" value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="例：ABC 水喉判 / 總承建商" />
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

          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />} 開立 NCR
          </button>
        </div>
      </div>
    </div>
  )
}

// Re-export the Ncr type for the detail page's convenience.
export type { Ncr }
