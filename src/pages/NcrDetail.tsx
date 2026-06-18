import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, ClipboardX, ShieldCheck, RotateCcw, Ban, Trash2, Send, AlertTriangle,
} from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { NcrProvider, useNcr } from '../contexts/NcrContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { severityBadge, statusBadge, NcrThumb } from './NcrList'
import { NCR_SEVERITY_ZH, NCR_STATUS_ZH } from '../types'

export default function NcrDetailPage() {
  const { id, ncrId } = useParams<{ id: string; ncrId: string }>()
  if (!id || !ncrId) return <Spinner />
  return (
    <NcrProvider projectId={id}>
      <NcrDetailInner projectId={id} ncrId={ncrId} />
    </NcrProvider>
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

function NcrDetailInner({ projectId, ncrId }: { projectId: string; ncrId: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { ncrs, loading, canManage, canVerify, submitCorrective, closeNcr, reopenNcr, voidNcr, deleteNcr } = useNcr()
  const [names, setNames] = useState<Record<string, string>>({})
  const [showCorrective, setShowCorrective] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // CAR form
  const [rootCause, setRootCause] = useState('')
  const [corrective, setCorrective] = useState('')
  const [preventive, setPreventive] = useState('')

  const ncr = useMemo(() => ncrs.find(n => n.id === ncrId), [ncrs, ncrId])

  useEffect(() => {
    if (!ncr) return
    const ids = [ncr.raised_by, ncr.corrective_by, ncr.closed_by].filter((x): x is string => !!x)
    if (ids.length === 0) return
    supabase.from('user_profiles').select('id, name').in('id', ids).then(({ data }) => {
      const m: Record<string, string> = {}
      ;(data ?? []).forEach((r: { id: string; name: string | null }) => { m[r.id] = r.name || '—' })
      setNames(m)
    })
  }, [ncr])

  if (loading && !ncr) return <AppLayout><Spinner size={24} className="mx-auto my-12" /></AppLayout>
  if (!ncr) return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3">
        <button onClick={() => navigate(`/project/${projectId}/ncr`)} className="flex items-center gap-1.5 text-site-500 px-1 min-h-[44px]"><ChevronLeft size={18} /> 返回</button>
        <div className="card p-8 text-center text-site-400 text-sm mt-3">找不到此 NCR</div>
      </div>
    </AppLayout>
  )

  const isRaiser = profile?.id === ncr.raised_by
  const isAdmin = profile?.global_role === 'admin'
  // Raiser may void only while still 'open' (cannot dodge the verifier once a
  // corrective action exists); admin may void any non-terminal NCR. Mirrors void_ncr.
  const canVoid = (isAdmin && ncr.status !== 'closed' && ncr.status !== 'void')
    || (isRaiser && ncr.status === 'open')
  const canDelete = (isRaiser && ncr.status === 'open') || isAdmin

  async function act(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setErr(null)
    const { error } = await fn()
    if (error) setErr(error)
    setBusy(false)
  }

  async function onSubmitCorrective() {
    if (!corrective.trim()) { setErr('請填寫糾正措施'); return }
    setBusy(true); setErr(null)
    const { error } = await submitCorrective(ncr!.id, { root_cause: rootCause, corrective_action: corrective, preventive_action: preventive })
    if (error) { setErr(error); setBusy(false); return }
    setShowCorrective(false); setBusy(false)
  }

  async function onDelete() {
    setBusy(true)
    const { error } = await deleteNcr(ncr!.id)
    if (error) { setErr(error); setBusy(false); setConfirmDelete(false); return }
    navigate(`/project/${projectId}/ncr`)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-3 space-y-3">
        <button onClick={() => navigate(`/project/${projectId}/ncr`)} className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]">
          <ChevronLeft size={18} /> 返回 NCR 清單
        </button>

        {/* Header */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-site-400">{ncr.number}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${severityBadge(ncr.severity)}`}>{NCR_SEVERITY_ZH[ncr.severity]}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(ncr.status)}`}>{NCR_STATUS_ZH[ncr.status]}</span>
          </div>
          <h1 className="text-lg font-bold text-site-900 flex items-start gap-2">
            <ClipboardX size={20} className="text-rose-600 flex-shrink-0 mt-0.5" /> {ncr.title}
          </h1>
          <Field label="不符合描述" value={ncr.description} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="位置 / 區域" value={ncr.location} />
            <Field label="規範 / 圖則" value={ncr.spec_ref} />
            <Field label="責任方" value={ncr.responsible_party} />
            <Field label="糾正限期" value={ncr.target_close_date} />
          </div>
          <p className="text-[11px] text-site-400 border-t border-site-100 pt-2">
            由 {names[ncr.raised_by] ?? '…'} 於 {new Date(ncr.created_at).toLocaleString('zh-HK')} 開立
          </p>
          {ncr.photos.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-1">{ncr.photos.map((p, i) => <NcrThumb key={i} stored={p} />)}</div>
          )}
        </div>

        {/* CAR (corrective action) — shown once submitted */}
        {(ncr.corrective_action || ncr.root_cause) && (
          <div className="card p-4 space-y-2 border-l-4 border-blue-300">
            <h2 className="font-bold text-site-900 text-sm">糾正措施 (CAR)</h2>
            <Field label="根本原因" value={ncr.root_cause} />
            <Field label="糾正措施" value={ncr.corrective_action} />
            <Field label="預防措施" value={ncr.preventive_action} />
            {ncr.corrective_at && (
              <p className="text-[11px] text-site-400 border-t border-site-100 pt-2">
                由 {names[ncr.corrective_by ?? ''] ?? '…'} 於 {new Date(ncr.corrective_at).toLocaleString('zh-HK')} 提交
              </p>
            )}
          </div>
        )}

        {/* Closed banner */}
        {ncr.status === 'closed' && ncr.closed_at && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <ShieldCheck size={16} /> 已由 {names[ncr.closed_by ?? ''] ?? '…'} 於 {new Date(ncr.closed_at).toLocaleString('zh-HK')} 核實關閉
          </div>
        )}
        {ncr.status === 'void' && (
          <div className="bg-site-100 rounded-xl px-4 py-3 text-sm text-site-500 flex items-center gap-2">
            <Ban size={16} /> 此 NCR 已作廢
          </div>
        )}

        {err && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{err}</div>}

        {/* Corrective submission form (editors, while open) */}
        {ncr.status === 'open' && canManage && (
          showCorrective ? (
            <div className="card p-4 space-y-3">
              <h2 className="font-bold text-site-900 text-sm">提交糾正措施</h2>
              <div>
                <label className="label">根本原因</label>
                <textarea className="input" rows={2} value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="為何會發生此不符合？" />
              </div>
              <div>
                <label className="label">糾正措施（必填）</label>
                <textarea className="input" rows={2} value={corrective} onChange={e => setCorrective(e.target.value)} placeholder="如何修正此不符合？" />
              </div>
              <div>
                <label className="label">預防措施</label>
                <textarea className="input" rows={2} value={preventive} onChange={e => setPreventive(e.target.value)} placeholder="如何防止再發生？" />
              </div>
              <div className="flex gap-2">
                <button onClick={onSubmitCorrective} disabled={busy} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
                  {busy ? <Spinner size={16} /> : <Send size={15} />} 提交
                </button>
                <button onClick={() => setShowCorrective(false)} className="btn-ghost">取消</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCorrective(true)} className="btn-primary w-full flex items-center justify-center gap-2">
              <Send size={16} /> 提交糾正措施 (CAR)
            </button>
          )
        )}

        {/* Verifier actions */}
        {ncr.status === 'corrective_submitted' && canVerify && (
          <div className="flex gap-2">
            <button onClick={() => act(() => closeNcr(ncr.id))} disabled={busy} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
              {busy ? <Spinner size={16} /> : <ShieldCheck size={16} />} 核實關閉
            </button>
            <button onClick={() => act(() => reopenNcr(ncr.id))} disabled={busy} className="btn-ghost flex items-center gap-1.5">
              <RotateCcw size={15} /> 退回重開
            </button>
          </div>
        )}
        {ncr.status === 'closed' && canVerify && (
          <button onClick={() => act(() => reopenNcr(ncr.id))} disabled={busy} className="btn-ghost w-full flex items-center justify-center gap-1.5">
            <RotateCcw size={15} /> 重開 NCR
          </button>
        )}

        {/* Raiser / admin: void + delete */}
        {(canVoid || canDelete) && (
          <div className="flex items-center gap-2 pt-1">
            {canVoid && (
              <button onClick={() => act(() => voidNcr(ncr.id))} disabled={busy} className="text-sm text-site-500 hover:text-site-800 px-3 py-2 rounded-lg border border-site-200 min-h-[44px] inline-flex items-center gap-1.5">
                <Ban size={15} /> 作廢
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

        {ncr.status === 'open' && ncr.severity === 'critical' && (
          <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertTriangle size={12} /> 重大不符合 — 應儘快糾正</p>
        )}
      </div>
    </AppLayout>
  )
}
