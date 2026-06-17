import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Clock, Flame, Users, Shield, Download } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { PtwApproverBar } from '../components/ptw/PtwApproverBar'
import { PtwSignaturePad } from '../components/ptw/PtwSignaturePad'
import { SignatureProofCard } from '../components/SignatureProofCard'
import { QrCard } from '../components/ptw/PtwQrCard'
import { Modal } from '../components/Modal'
import { OfflineBanner } from '../components/OfflineBanner'
import { useIsOnline } from '../hooks/useIsOnline'
import { PtwProvider, usePtw } from '../contexts/PtwContext'
import { mintPtwQrToken } from '../lib/ptw-jwt'
import { remainingFireWatchSeconds, hotWorkFireWatchEligible, isPtwExpired, effectivePtwStatus } from '../lib/ptw'
import { PTW_TYPE_ZH, PTW_STATUS_ZH, ROLE_ZH } from '../types'
import { dwssRef } from '../lib/dwss'
import { exportComplianceProofPack } from '../lib/export'
import type { PTW, PtwPayload } from '../types'

function PtwDetailInner() {
  const { id: projectId, ptwId } = useParams<{ id: string; ptwId: string }>()
  const navigate = useNavigate()
  const { ptws, versionsByPtw, workersByPtw, approvalsByPtw, signoffsByPtw, scansByPtw, loading, startFireWatch, closeOut, refetch } = usePtw()
  const online = useIsOnline()

  const ptw = useMemo(() => ptws.find(p => p.id === ptwId), [ptws, ptwId])
  const currentVersion = useMemo(() => {
    if (!ptw) return null
    const versions = versionsByPtw[ptw.id] || []
    return versions.find(v => v.id === ptw.current_version_id) || versions[versions.length - 1] || null
  }, [ptw, versionsByPtw])

  const payload = currentVersion?.payload as PtwPayload | undefined

  // Derive expiry client-side — no cron flips an over-time 'active' permit, so
  // an expired permit must not keep showing 生效中 with a verifying QR.
  const expired = ptw ? isPtwExpired(ptw) : false
  const displayStatus = ptw ? effectivePtwStatus(ptw) : null

  const [qrToken, setQrToken] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [showCloseOut, setShowCloseOut] = useState(false)
  const [fireWatchSecRemaining, setFireWatchSecRemaining] = useState<number>(-1)

  useEffect(() => {
    if (ptw?.status === 'active' && !expired && qrToken === null && !qrError) {
      mintPtwQrToken(ptw.id).then(({ token, error }) => {
        if (error) setQrError(error)
        else setQrToken(token)
      })
    }
  }, [ptw?.id, ptw?.status, expired, qrToken, qrError])

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
            <span className={
              'px-3 py-1 rounded-full text-sm font-medium ' +
              (expired ? 'bg-red-50 text-red-600' : 'bg-site-100 text-site-700')
            }>
              {displayStatus ? PTW_STATUS_ZH[displayStatus] : PTW_STATUS_ZH[ptw.status]}
            </span>
          </div>
          {/* DWSS Annex A §3.1.8 format reference (derived from the serial) */}
          <p className="text-xs font-mono text-site-400">DWSS: {dwssRef('ptw', parseInt(ptw.number.match(/\d+/)?.[0] ?? '0', 10))}</p>
          <p className="text-sm text-site-600">{PTW_TYPE_ZH[ptw.ptw_type]}</p>
          <button
            type="button"
            onClick={() => exportComplianceProofPack({
              docKindZh: '工作許可證 (PTW)',
              docNumber: ptw.number,
              dwssRefStr: dwssRef('ptw', parseInt(ptw.number.match(/\d+/)?.[0] ?? '0', 10)),
              statusZh: PTW_STATUS_ZH[ptw.status],
              detailZh: PTW_TYPE_ZH[ptw.ptw_type],
              chainRolesZh: Array.isArray(ptw.chain_snapshot)
                ? (ptw.chain_snapshot as any[]).map(s => ROLE_ZH[s?.required_role as keyof typeof ROLE_ZH] ?? s?.required_role ?? '—')
                : undefined,
            })}
            className="btn-ghost w-full mt-1 inline-flex items-center justify-center gap-1.5 text-xs"
          >
            <Download size={14} /> 匯出合規證明 (PDF)
          </button>
          {ptw.status === 'active' && ptw.expires_at && (
            <p className={'text-sm flex items-center gap-1 ' + (expired ? 'text-red-600' : 'text-site-600')}>
              <Clock size={14} />
              <span>
                {expired ? '已過期：' : '有效至 '}
                {new Date(ptw.expires_at).toLocaleString('zh-HK')} 香港時間
              </span>
            </p>
          )}
          {expired && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              此許可證已過期，二維碼已失效，不可再憑此證施工。請重新申請。
            </div>
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

            {/* 有效時段 (confined_space / excavation permits carry an explicit window) */}
            {(payload.valid_from || payload.valid_to) && (
              <>
                <h4 className="text-sm font-semibold text-site-900 mt-2">有效時段</h4>
                <p className="text-sm text-site-700 flex items-center gap-1">
                  <Clock size={14} />
                  <span>
                    {payload.valid_from ? new Date(payload.valid_from).toLocaleString('zh-HK') : '—'}
                    {' 至 '}
                    {payload.valid_to ? new Date(payload.valid_to).toLocaleString('zh-HK') : '—'}
                  </span>
                </p>
              </>
            )}

            {/* 氣體測試 (密閉空間) */}
            {payload.gas_test && (
              payload.gas_test.o2 || payload.gas_test.h2s || payload.gas_test.co || payload.gas_test.lel
            ) && (
              <>
                <h4 className="text-sm font-semibold text-site-900 mt-2">氣體測試</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  <GasReading label="O₂" value={payload.gas_test.o2} unit="%" />
                  <GasReading label="H₂S" value={payload.gas_test.h2s} unit="ppm" />
                  <GasReading label="CO" value={payload.gas_test.co} unit="ppm" />
                  <GasReading label="LEL" value={payload.gas_test.lel} unit="%" />
                </div>
              </>
            )}

            {/* 危害 hazards */}
            {payload.hazards && payload.hazards.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-site-900 mt-2">已識別危害</h4>
                <ul className="text-sm space-y-1 list-disc pl-5 text-site-700">
                  {payload.hazards.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </>
            )}

            {/* 控制措施 controls */}
            {payload.controls && payload.controls.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-site-900 mt-2">控制措施</h4>
                <ul className="text-sm space-y-1 list-disc pl-5 text-site-700">
                  {payload.controls.map((c, i) => <li key={i}>{c}</li>)}
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

        {/* QR card (active and not past expiry — an expired permit must not verify) */}
        {ptw.status === 'active' && !expired && (
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
              <button type="button" className="btn-ghost" disabled={!online} onClick={handleStartFireWatch}>
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
              <button type="button" className="btn-primary mt-2" disabled={!online} onClick={() => setShowCloseOut(true)}>
                關閉許可證
              </button>
            )}
            {!online && <OfflineBanner />}
          </div>
        )}

        {ptw.status === 'active' && ptw.ptw_type !== 'hot_work' && (
          <>
            <button type="button" className="btn-primary" disabled={!online} onClick={() => setShowCloseOut(true)}>
              關閉許可證
            </button>
            {!online && <OfflineBanner />}
          </>
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

        {/* 簽名證明 (本人 proof) — one certificate per recorded signoff */}
        {signoffs.length > 0 && (
          <div className="space-y-3">
            {signoffs
              .slice()
              .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
              .map(sg => (
                <SignatureProofCard key={sg.id} kind="ptw" signoffId={sg.id} />
              ))}
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

function GasReading({ label, value, unit }: { label: string; value?: string; unit: string }) {
  return (
    <div className="rounded-xl border border-site-200 bg-site-50 px-3 py-2 text-center">
      <div className="text-xs text-site-500">{label}</div>
      <div className="font-semibold text-site-900">
        {value ? `${value} ${unit}` : '—'}
      </div>
    </div>
  )
}

export default function PtwDetailPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  return (
    <PtwProvider projectId={projectId}>
      <PtwDetailInner />
    </PtwProvider>
  )
}
