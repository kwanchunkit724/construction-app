import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ClipboardCheck, CheckCircle2, XCircle, Ban, Trash2 } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { RiscProvider, useRisc } from '../contexts/RiscContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { riscStatusBadge, RiscThumb } from './RiscList'
import { RISC_WORK_TYPE_ZH, RISC_STATUS_ZH } from '../types'

export default function RiscDetailPage() {
  const { id, riscId } = useParams<{ id: string; riscId: string }>()
  if (!id || !riscId) return <Spinner />
  return (
    <RiscProvider projectId={id}>
      <RiscDetailInner projectId={id} riscId={riscId} />
    </RiscProvider>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] text-site-400 font-medium">{label}</p>
      <p className="text-sm text-site-800 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function RiscDetailInner({ projectId, riscId }: { projectId: string; riscId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { riscs, loading, canInspect, inspectRisc, cancelRisc, deleteRisc } = useRisc()
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showInspect, setShowInspect] = useState(false)
  const [comment, setComment] = useState('')

  const risc = useMemo(() => riscs.find(r => r.id === riscId), [riscs, riscId])

  useEffect(() => {
    if (!risc) return
    const ids = [risc.raised_by, risc.inspected_by].filter((x): x is string => !!x)
    if (ids.length === 0) return
    supabase.from('user_profiles').select('id, name').in('id', ids).then(({ data }) => {
      const m: Record<string, string> = {}
      ;(data ?? []).forEach((r: { id: string; name: string | null }) => { m[r.id] = r.name || '—' })
      setNames(m)
    })
  }, [risc])

  if (loading && !risc) return <AppLayout><Spinner size={24} className="mx-auto my-12" /></AppLayout>
  if (!risc) return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3">
        <button onClick={() => navigate(`/project/${projectId}/risc`)} className="flex items-center gap-1.5 text-site-500 px-1 min-h-[44px]"><ChevronLeft size={18} /> 返回</button>
        <div className="card p-8 text-center text-site-400 text-sm mt-3">找不到此檢查申請</div>
      </div>
    </AppLayout>
  )

  const isRaiser = profile?.id === risc.raised_by
  const isAdmin = profile?.global_role === 'admin'
  const canCancel = (isRaiser || isAdmin) && risc.status === 'submitted'
  const canDelete = (isRaiser && risc.status === 'submitted') || isAdmin

  async function act(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setErr(null)
    const { error } = await fn()
    if (error) setErr(error)
    setBusy(false)
  }

  async function onInspect(result: 'pass' | 'fail') {
    if (result === 'fail' && !comment.trim()) { setErr('不通過時請填寫備註'); return }
    setBusy(true); setErr(null)
    const { error } = await inspectRisc(risc!.id, result, comment)
    if (error) { setErr(error); setBusy(false); return }
    setShowInspect(false); setBusy(false)
  }

  async function onDelete() {
    setBusy(true)
    const { error } = await deleteRisc(risc!.id)
    if (error) { setErr(error); setBusy(false); setConfirmDelete(false); return }
    navigate(`/project/${projectId}/risc`)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3 space-y-3">
        <button onClick={() => navigate(`/project/${projectId}/risc`)} className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]">
          <ChevronLeft size={18} /> 返回 RISC 清單
        </button>

        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-site-400">{risc.number}</span>
            <span className="text-[11px] bg-site-100 text-site-600 px-2 py-0.5 rounded-full">{RISC_WORK_TYPE_ZH[risc.work_type]}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${riscStatusBadge(risc.status)}`}>{RISC_STATUS_ZH[risc.status]}</span>
          </div>
          <h1 className="text-lg font-bold text-site-900 flex items-start gap-2">
            <ClipboardCheck size={20} className="text-teal-600 flex-shrink-0 mt-0.5" /> {risc.title}
          </h1>
          <Field label="說明" value={risc.description} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="位置 / 區域" value={risc.location} />
            <Field label="規範 / 圖則" value={risc.spec_ref} />
            <Field label="擬檢查時間" value={risc.proposed_at ? new Date(risc.proposed_at).toLocaleString('zh-HK') : null} />
          </div>
          <p className="text-[11px] text-site-400 border-t border-site-100 pt-2">
            由 {names[risc.raised_by] ?? '…'} 於 {new Date(risc.created_at).toLocaleString('zh-HK')} 申請
          </p>
          {risc.photos.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-1">{risc.photos.map((p, i) => <RiscThumb key={i} stored={p} />)}</div>
          )}
        </div>

        {/* Verdict result — once inspected */}
        {(risc.status === 'passed' || risc.status === 'failed') && (
          <div className={`rounded-xl px-4 py-3 text-sm flex items-start gap-2 ${
            risc.status === 'passed' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {risc.status === 'passed' ? <CheckCircle2 size={16} className="mt-0.5" /> : <XCircle size={16} className="mt-0.5" />}
            <div className="flex-1">
              <p className="font-semibold">{risc.status === 'passed' ? '檢查通過' : '檢查不通過'}</p>
              {risc.result_comment && <p className="mt-0.5 whitespace-pre-wrap">{risc.result_comment}</p>}
              {risc.inspected_at && (
                <p className="text-[11px] opacity-80 mt-1">
                  由 {names[risc.inspected_by ?? ''] ?? '…'} 於 {new Date(risc.inspected_at).toLocaleString('zh-HK')} 檢查
                </p>
              )}
            </div>
          </div>
        )}
        {risc.status === 'cancelled' && (
          <div className="bg-site-100 rounded-xl px-4 py-3 text-sm text-site-500 flex items-center gap-2"><Ban size={16} /> 此申請已取消</div>
        )}

        {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

        {/* Inspector verdict (submitted only) */}
        {risc.status === 'submitted' && canInspect && (
          showInspect ? (
            <div className="card p-4 space-y-3">
              <h2 className="font-bold text-site-900 text-sm">檢查結果</h2>
              <textarea className="input" rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="備註（不通過時必填）" />
              <div className="flex gap-2">
                <button onClick={() => onInspect('pass')} disabled={busy} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5">
                  {busy ? <Spinner size={16} className="text-white" /> : <CheckCircle2 size={16} />} 通過
                </button>
                <button onClick={() => onInspect('fail')} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5">
                  <XCircle size={16} /> 不通過
                </button>
              </div>
              <button onClick={() => setShowInspect(false)} className="btn-ghost w-full">取消</button>
            </div>
          ) : (
            <button onClick={() => setShowInspect(true)} className="btn-primary w-full flex items-center justify-center gap-2">
              <ClipboardCheck size={16} /> 檢查 / 驗收
            </button>
          )
        )}

        {/* Raiser / admin: cancel + delete */}
        {(canCancel || canDelete) && (
          <div className="flex items-center gap-2 pt-1">
            {canCancel && (
              <button onClick={() => act(() => cancelRisc(risc.id))} disabled={busy} className="text-sm text-site-500 hover:text-site-800 px-3 py-2 rounded-lg border border-site-200 min-h-[44px] inline-flex items-center gap-1.5">
                <Ban size={15} /> 取消申請
              </button>
            )}
            {canDelete && (
              confirmDelete ? (
                <>
                  <button onClick={onDelete} disabled={busy} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg min-h-[44px] font-medium">確認刪除</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-sm border border-site-200 text-site-500 px-3 py-2 rounded-lg min-h-[44px] font-medium">取消</button>
                </>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-red-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px] rounded-lg hover:bg-red-50 flex items-center justify-center" aria-label="刪除">
                  <Trash2 size={16} />
                </button>
              )
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
