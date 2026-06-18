import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Footprints, Camera, CheckCircle2, XCircle, MinusCircle, Ban, ExternalLink, X } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { InspectionProvider, useInspection } from '../contexts/InspectionContext'
import { inspectionStatusBadge } from './InspectionList'
import { capturePhotoGeo, recordPhotoMeta } from '../lib/photoMeta'
import { signIssuePhoto, issuePhotoPath } from '../lib/issuePhotos'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  INSPECTION_CATEGORY_ZH,
  INSPECTION_ROUND_STATUS_ZH,
  INSPECTION_RESULT_ZH,
} from '../types'
import type { InspectionRound, InspectionMark, InspectionResult } from '../types'

export default function InspectionDetailPage() {
  const { id, inspectionId } = useParams<{ id: string; inspectionId: string }>()
  if (!id || !inspectionId) return <Spinner />
  return (
    <InspectionProvider projectId={id}>
      <InspectionDetailInner projectId={id} roundId={inspectionId} />
    </InspectionProvider>
  )
}

function InspectionThumb({ stored }: { stored: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signIssuePhoto(stored).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [stored])
  if (!url) return <div className="w-16 h-16 rounded-lg bg-site-100 animate-pulse" />
  return <img src={url} alt="巡查相片" className="w-16 h-16 rounded-lg object-cover border border-site-200" />
}

function InspectionDetailInner({ projectId, roundId }: { projectId: string; roundId: string }) {
  const navigate = useNavigate()
  const { rounds, marksByRound, coverage, loading, canManage, fetchMarks, closeRound, cancelRound } = useInspection()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [markFloor, setMarkFloor] = useState<string | null>(null)

  const round = useMemo(() => rounds.find(r => r.id === roundId), [rounds, roundId])
  const marks = marksByRound[roundId] ?? []
  const marksByLabel = useMemo(() => {
    const m: Record<string, InspectionMark> = {}
    marks.forEach(mk => { m[mk.floor_label] = mk })
    return m
  }, [marks])

  useEffect(() => { void fetchMarks(roundId) }, [fetchMarks, roundId])

  if (loading && !round) return <AppLayout><Spinner size={24} className="mx-auto my-12" /></AppLayout>
  if (!round) return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3">
        <button onClick={() => navigate(`/project/${projectId}/inspection`)} className="flex items-center gap-1.5 text-site-500 px-1 min-h-[44px]"><ChevronLeft size={18} /> 返回</button>
        <div className="card p-8 text-center text-site-400 text-sm mt-3">找不到此巡查</div>
      </div>
    </AppLayout>
  )

  const isOpen = round.status === 'open'
  const editable = isOpen && canManage
  const cov = coverage[roundId]
  const total = cov?.total ?? round.floor_labels.length
  const marked = cov?.marked ?? 0
  const failed = cov?.failed ?? 0
  const pct = total > 0 ? Math.round((marked / total) * 100) : 0

  async function act(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setErr(null)
    const { error } = await fn()
    if (error) setErr(error)
    setBusy(false)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3 space-y-3">
        <button onClick={() => navigate(`/project/${projectId}/inspection`)} className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]">
          <ChevronLeft size={18} /> 返回巡查清單
        </button>

        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">{INSPECTION_CATEGORY_ZH[round.category]}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${inspectionStatusBadge(round.status)}`}>{INSPECTION_ROUND_STATUS_ZH[round.status]}</span>
          </div>
          <h1 className="text-lg font-bold text-site-900 flex items-start gap-2">
            <Footprints size={20} className="text-indigo-600 flex-shrink-0 mt-0.5" /> {round.title}
          </h1>
          {round.notes && <p className="text-sm text-site-700 whitespace-pre-wrap">{round.notes}</p>}
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-site-500">{marked} / {total} 層 ({pct}%)</span>
              {failed > 0 && <span className="text-red-600 font-semibold">{failed} 項不合格</span>}
            </div>
            <div className="mt-1 h-2 rounded-full bg-site-100 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <p className="text-[11px] text-site-400 border-t border-site-100 pt-2">
            於 {new Date(round.opened_at).toLocaleString('zh-HK')} 開始
          </p>
        </div>

        {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

        {/* Floor grid — coloured by each floor's mark */}
        <div className="card p-4">
          <label className="label">逐層核查</label>
          <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto pr-1">
            {round.floor_labels.map(label => {
              const mk = marksByLabel[label]
              const cls = !mk
                ? 'bg-white border-site-200 text-site-500 hover:border-indigo-300'
                : mk.result === 'pass'
                  ? 'bg-green-500 border-green-500 text-white'
                  : mk.result === 'fail'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-site-300 border-site-300 text-white'
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!editable}
                  onClick={() => editable && setMarkFloor(label)}
                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border-2 transition-colors min-h-[44px] flex items-center justify-center ${cls} ${!editable ? 'cursor-default' : ''}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {!editable && (
            <p className="text-[11px] text-site-400 mt-2">
              {!isOpen ? '此巡查已結束,唯讀。' : '你沒有標記權限,唯讀。'}
            </p>
          )}
        </div>

        {/* Failed marks → quick link to the auto-spawned 即時問題 */}
        {marks.some(m => m.result === 'fail' && m.linked_issue_id) && (
          <div className="card p-4 space-y-2">
            <label className="label">不合格 · 已開即時問題</label>
            {marks.filter(m => m.result === 'fail' && m.linked_issue_id).map(m => (
              <button
                key={m.id}
                onClick={() => navigate(`/project/${projectId}/issue/${m.linked_issue_id}`)}
                className="w-full flex items-center justify-between text-left text-sm px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 min-h-[44px]"
              >
                <span className="font-medium truncate">{m.floor_label} 不合格{m.note ? ` · ${m.note}` : ''}</span>
                <span className="flex items-center gap-1 flex-shrink-0 ml-2"><ExternalLink size={14} /> 查看即時問題</span>
              </button>
            ))}
          </div>
        )}

        {/* Open + canManage: close / cancel the round */}
        {editable && (
          <div className="flex items-center gap-2 pt-1">
            {confirmClose ? (
              <>
                <button onClick={() => act(() => closeRound(round.id))} disabled={busy} className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium inline-flex items-center gap-1.5">
                  {busy ? <Spinner size={15} className="text-white" /> : <CheckCircle2 size={15} />} 確認結束
                </button>
                <button onClick={() => setConfirmClose(false)} className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium">返回</button>
              </>
            ) : (
              <button onClick={() => { setConfirmCancel(false); setConfirmClose(true) }} className="btn-primary flex items-center gap-1.5">
                <CheckCircle2 size={16} /> 結束巡查
              </button>
            )}
            {confirmCancel ? (
              <>
                <button onClick={() => act(() => cancelRound(round.id))} disabled={busy} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium inline-flex items-center gap-1.5">
                  <Ban size={15} /> 確認取消
                </button>
                <button onClick={() => setConfirmCancel(false)} className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium">返回</button>
              </>
            ) : !confirmClose && (
              <button onClick={() => { setErr(null); setConfirmCancel(true) }} className="text-sm text-site-500 hover:text-site-800 px-3 py-2 rounded-lg border border-site-200 min-h-[44px] inline-flex items-center gap-1.5">
                <Ban size={15} /> 取消
              </button>
            )}
          </div>
        )}
      </div>

      {markFloor && round && (
        <MarkFloorSheet
          round={round}
          floorLabel={markFloor}
          existing={marksByLabel[markFloor] ?? null}
          onClose={() => setMarkFloor(null)}
        />
      )}
    </AppLayout>
  )
}

function MarkFloorSheet({ round, floorLabel, existing, onClose }: {
  round: InspectionRound
  floorLabel: string
  existing: InspectionMark | null
  onClose: () => void
}) {
  const { profile } = useAuth()
  const { markFloor, uploadPhoto } = useInspection()
  const [result, setResult] = useState<InspectionResult>(existing?.result ?? 'pass')
  const [note, setNote] = useState(existing?.note ?? '')
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
      const { url, error } = await uploadPhoto(file)
      if (error) setErr(error)
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, path: url, uploading: false } : p))
    }))
  }

  async function submit() {
    if (!profile) return
    if (photos.some(p => p.uploading)) return setErr('照片仍在上傳中,請稍候')
    setSubmitting(true)
    setErr(null)
    const photoPaths = photos.map(p => p.path).filter((p): p is string => !!p)
    const { error } = await markFloor({
      round,
      floor_label: floorLabel,
      result,
      note: note || null,
      photos: photoPaths,
    })
    if (error) { setErr(error); setSubmitting(false); return }
    const capturedAt = new Date().toISOString()
    void Promise.all(photoPaths.map(path =>
      recordPhotoMeta({ projectId: round.project_id, bucket: 'issue-photos', photoPath: issuePhotoPath(path), capturedAt, geo, uploadedBy: profile.id }),
    ))
    onClose()
  }

  const resultBtn = (r: InspectionResult, icon: JSX.Element, activeCls: string) => (
    <button
      type="button"
      onClick={() => setResult(r)}
      className={`flex-1 rounded-xl py-2.5 font-semibold border-2 flex items-center justify-center gap-1.5 min-h-[44px] ${
        result === r ? activeCls : 'bg-white border-site-200 text-site-500'
      }`}
    >
      {icon} {INSPECTION_RESULT_ZH[r]}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-site-100 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-site-900">{floorLabel} 層核查</h2>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="label">結果</label>
            <div className="flex gap-2">
              {resultBtn('pass', <CheckCircle2 size={16} />, 'bg-green-600 border-green-600 text-white')}
              {resultBtn('fail', <XCircle size={16} />, 'bg-red-600 border-red-600 text-white')}
              {resultBtn('na', <MinusCircle size={16} />, 'bg-site-400 border-site-400 text-white')}
            </div>
            {result === 'fail' && (
              <p className="text-[11px] text-red-600 mt-1.5">會自動開即時問題</p>
            )}
          </div>

          <div>
            <label className="label">備註（可選）</label>
            <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="位置 / 情況描述" />
          </div>

          <div>
            <label className="label">相片（可選）</label>
            <div className="flex gap-2 flex-wrap items-center">
              {photos.map(p => (
                <div key={p.id} className="w-16 h-16 rounded-lg bg-site-100 flex items-center justify-center text-xs text-site-400">
                  {p.uploading ? <Spinner size={16} /> : p.path ? '✓' : <span className="text-red-500" title="上載失敗">⚠</span>}
                </div>
              ))}
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-site-200 flex items-center justify-center cursor-pointer hover:bg-site-50 text-site-400">
                <Camera size={20} />
                <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPickPhotos} />
              </label>
            </div>
          </div>

          {existing && existing.photos.length > 0 && (
            <div>
              <label className="label">現有相片</label>
              <div className="flex gap-2 flex-wrap">{existing.photos.map((p, i) => <InspectionThumb key={i} stored={p} />)}</div>
            </div>
          )}

          {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

          <button onClick={submit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
            {submitting ? <Spinner size={16} /> : <CheckCircle2 size={16} />} 儲存
          </button>
        </div>
      </div>
    </div>
  )
}
