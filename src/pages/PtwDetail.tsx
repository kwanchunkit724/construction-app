import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Clock, Flame, Users, Shield } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { PtwApproverBar } from '../components/ptw/PtwApproverBar'
import { PtwSignaturePad } from '../components/ptw/PtwSignaturePad'
import { QrCard } from '../components/ptw/PtwQrCard'
import { Modal } from '../components/Modal'
import { PtwProvider, usePtw } from '../contexts/PtwContext'
import { ProjectsProvider } from '../contexts/ProjectsContext'
import { mintPtwQrToken } from '../lib/ptw-jwt'
import { remainingFireWatchSeconds, hotWorkFireWatchEligible } from '../lib/ptw'
import { PTW_TYPE_ZH, PTW_STATUS_ZH } from '../types'
import type { PTW, PtwPayload } from '../types'

function PtwDetailInner() {
  const { id: projectId, ptwId } = useParams<{ id: string; ptwId: string }>()
  const navigate = useNavigate()
  const { ptws, versionsByPtw, workersByPtw, approvalsByPtw, signoffsByPtw, scansByPtw, loading, startFireWatch, closeOut, refetch } = usePtw()

  const ptw = useMemo(() => ptws.find(p => p.id === ptwId), [ptws, ptwId])
  const currentVersion = useMemo(() => {
    if (!ptw) return null
    const versions = versionsByPtw[ptw.id] || []
    return versions.find(v => v.id === ptw.current_version_id) || versions[versions.length - 1] || null
  }, [ptw, versionsByPtw])

  const payload = currentVersion?.payload as PtwPayload | undefined

  const [qrToken, setQrToken] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [showCloseOut, setShowCloseOut] = useState(false)
  const [fireWatchSecRemaining, setFireWatchSecRemaining] = useState<number>(-1)

  useEffect(() => {
    if (ptw?.status === 'active' && qrToken === null && !qrError) {
      mintPtwQrToken(ptw.id).then(({ token, error }) => {
        if (error) setQrError(error)
        else setQrToken(token)
      })
    }
  }, [ptw?.id, ptw?.status, qrToken, qrError])

  useEffect(() => {
    if (!ptw || ptw.ptw_type !== 'hot_work') return
    if (!ptw.fire_watch_started_at) { setFireWatchSecRemaining(-1); return }
    const tick = () => setFireWatchSecRemaining(remainingFireWatchSeconds(ptw))
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [ptw])

  if (loading) {
    return <AppLayout title="工作許可證"><div className="py-12 text-center"><Spinner size={32} /></div></AppLayout>
  }
  if (!ptw) {
    return (
      <AppLayout title="工作許可證">
        <div className="card p-8 text-center text-sm text-site-500">找不到工作許可證</div>
      </AppLayout>
    )
  }

  const workers = workersByPtw[ptw.id] || []
  const approvals = approvalsByPtw[ptw.id] || []
  const signoffs = signoffsByPtw[ptw.id] || []
  const scans = scansByPtw[ptw.id] || []

  async function handleStartFireWatch() {
    if (!ptw) return
    const { error } = await startFireWatch(ptw.id)
    if (error) alert(error)
    else refetch()
  }

  async function handleCloseOutSign(b64: string) {
    if (!ptw) return
    const { error } = await closeOut(ptw.id, b64)
    if (error) {
      alert(error)
    } else {
      setShowCloseOut(false)
      refetch()
    }
  }

  return (
    <AppLayout title={ptw.number}>
      <div className="space-y-4 pb-24">
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/ptw`)}
          className="text-sm text-site-600 inline-flex items-center"
        >
          <ChevronLeft size={16} className="inline" />
          返回列表
        </button>

        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-site-900">{ptw.number}</h2>
            <span className="px-3 py-1 rounded-full bg-site-100 text-site-700 text-sm font-medium">
              {PTW_STATUS_ZH[ptw.status]}
            </span>
          </div>
          <p className="text-sm text-site-600">{PTW_TYPE_ZH[ptw.ptw_type]}</p>
          {ptw.status === 'active' && ptw.expires_at && (
            <p className="text-sm text-site-600 flex items-center gap-1">
              <Clock size={14} />
              <span>有效至 {new Date(ptw.expires_at).toLocaleString('zh-HK')} 香港時間</span>
            </p>
          )}
        </div>

        {/* Description + checklist */}
        {payload && (
          <div className="card p-4 space-y-3">
            <h3 className="text-base font-semibold text-site-900">工作內容</h3>
            <p className="whitespace-pre-wrap text-sm text-site-700">{payload.description}</p>

            {payload.checklist?.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-site-900 mt-2">安全核對</h4>
                <ul className="text-sm space-y-1">
                  {payload.checklist.map(c => (
                    <li key={c.key} className="flex items-center gap-2">
                      <span className={
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ' +
                        (c.value === true ? 'bg-green-500 text-white' : 'bg-site-200 text-site-500')
                      }>{c.value === true ? '✓' : '–'}</span>
                      <span className={c.required ? 'text-site-900' : 'text-site-600'}>{c.label_zh}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Workers */}
        {workers.length > 0 && (
          <div className="card p-4 space-y-2">
            <h3 className="text-base font-semibold text-site-900 flex items-center gap-2">
              <Users size={16} />
              工人名單 ({workers.length})
            </h3>
            <ul className="text-sm space-y-1">
              {workers.map(w => (
                <li key={w.id} className="text-site-700">
                  {w.worker_name}
                  {w.worker_phone && <span className="text-site-500 ml-2">({w.worker_phone})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* QR card (active only) */}
        {ptw.status === 'active' && (
          <QrCard token={qrToken} error={qrError} />
        )}

        {/* Fire-watch (hot_work + active only) */}
        {ptw.status === 'active' && ptw.ptw_type === 'hot_work' && (
          <div className="card p-4 space-y-2">
            <h3 className="text-base font-semibold text-site-900 flex items-center gap-2">
              <Flame size={16} className="text-red-500" />
              火警監察
            </h3>
            {!ptw.fire_watch_started_at ? (
              <button type="button" className="btn-ghost" onClick={handleStartFireWatch}>
                開始 30 分鐘火警監察
              </button>
            ) : fireWatchSecRemaining > 0 ? (
              <p className="text-sm text-amber-700">
                還需 {Math.floor(fireWatchSecRemaining / 60)} 分 {fireWatchSecRemaining % 60} 秒
              </p>
            ) : (
              <p className="text-sm text-green-700">火警監察已完成 — 可以關閉</p>
            )}
            {hotWorkFireWatchEligible(ptw) && (
              <button type="button" className="btn-primary mt-2" onClick={() => setShowCloseOut(true)}>
                關閉許可證
              </button>
            )}
          </div>
        )}

        {ptw.status === 'active' && ptw.ptw_type !== 'hot_work' && (
          <button type="button" className="btn-primary" onClick={() => setShowCloseOut(true)}>
            關閉許可證
          </button>
        )}

        {/* Approval timeline */}
        {approvals.length > 0 && (
          <div className="card p-4 space-y-2">
            <h3 className="text-base font-semibold text-site-900 flex items-center gap-2">
              <Shield size={16} />
              簽核紀錄 ({approvals.length})
            </h3>
            <ul className="text-sm space-y-1">
              {approvals
                .slice()
                .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
                .map(a => {
                  const sg = signoffs.find(s => s.approval_id === a.id)
                  return (
                    <li key={a.id} className="text-site-700">
                      Step {a.step_order + 1}: {a.action_type}
                      <span className="text-site-500 ml-2">
                        {new Date(a.created_at).toLocaleString('zh-HK')}
                      </span>
                      {sg && <span className="text-green-700 ml-2">✓ 簽名</span>}
                    </li>
                  )
                })}
            </ul>
          </div>
        )}

        {scans.length > 0 && (
          <div className="card p-4">
            <h3 className="text-base font-semibold text-site-900">巡查紀錄 ({scans.length})</h3>
            <p className="text-sm text-site-500">最近: {new Date(scans[0].scanned_at).toLocaleString('zh-HK')}</p>
          </div>
        )}

        <PtwApproverBar ptw={ptw} onAction={() => refetch()} />
      </div>

      <Modal open={showCloseOut} title="關閉工作許可證" onClose={() => setShowCloseOut(false)}>
        <PtwSignaturePad
          title="簽名以確認完工關閉"
          onSign={handleCloseOutSign}
          onCancel={() => setShowCloseOut(false)}
        />
      </Modal>
    </AppLayout>
  )
}

export default function PtwDetailPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  return (
    <ProjectsProvider>
      <PtwProvider projectId={projectId}>
        <PtwDetailInner />
      </PtwProvider>
    </ProjectsProvider>
  )
}
