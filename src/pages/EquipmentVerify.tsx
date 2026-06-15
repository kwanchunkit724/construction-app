import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertOctagon, ArrowLeft, Wrench, PenLine } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { FullPageSpinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { verifyEquipmentQrToken, type EquipmentVerifyResult } from '../lib/equipment-jwt'
import {
  EQUIPMENT_KIND_ZH, FORM_STATUS_ZH, FORM_STATUS_BADGE_CLASS,
} from '../types'
import type { EquipmentKind, FormStatus } from '../types'

// Mirrors src/pages/PtwVerify.tsx. The phone's native camera opens the QR's
// URL (#/equipment-verify/<token>) which deep-links here; we also accept a
// pasted token via the same route. Login-gated (ProtectedRoute wraps it; this
// also bounces to /login?next= so the scan resumes after sign-in). Calls
// verify_equipment_jwt (login + membership gated, writes equipment_scans) and
// shows the equipment + its form instances with status chips + a 去簽署 deep
// link per due instance.

// Statuses that need attention — surface a 去簽署 CTA for these.
const DUE_STATUSES: FormStatus[] = ['expiring', 'expired', 'missing', 'suspended']

export default function EquipmentVerifyPage() {
  const { token } = useParams<{ token: string }>()
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [result, setResult] = useState<EquipmentVerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)
  // verify_equipment_jwt intentionally omits project_id from its public payload.
  // The 去簽署 deep link is project-scoped (/project/:id/equipment/:equipmentId),
  // so resolve the project from equipment_register (membership-gated read — the
  // same RLS that let verify succeed) once we have the equipment_id.
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!profile) {
      // Stash token and bounce to login — return path goes back to verify.
      navigate(`/login?next=${encodeURIComponent(`/equipment-verify/${token}`)}`, { replace: true })
      return
    }
    if (!token) {
      setError('沒有提供 QR token')
      setVerifying(false)
      return
    }
    verifyEquipmentQrToken(token).then(async ({ result, error }) => {
      if (error) {
        setError(error)
      } else if (result) {
        setResult(result)
        // Best-effort project resolution for the deep link (non-fatal).
        const { data } = await supabase
          .from('equipment_register')
          .select('project_id')
          .eq('id', result.equipment_id)
          .maybeSingle()
        if (data?.project_id) setProjectId(data.project_id as string)
      }
      setVerifying(false)
    })
  }, [token, profile, authLoading, navigate])

  if (authLoading || verifying) {
    return <FullPageSpinner label="驗證中..." />
  }

  if (error) {
    return (
      <AppLayout title="驗證失敗">
        <div className="card p-6 space-y-3 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertOctagon size={20} />
            <h2 className="text-lg font-semibold">驗證失敗</h2>
          </div>
          <p className="text-sm text-red-600">{error}</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/home')}
          >
            <ArrowLeft size={14} className="inline mr-1" />
            返回首頁
          </button>
        </div>
      </AppLayout>
    )
  }

  if (!result) return null

  const anySuspended = result.instances.some(i => i.suspended || i.status === 'suspended')

  return (
    <AppLayout title="核實機械表格">
      <div className="space-y-4">
        {/* Equipment header */}
        <div className={`card p-6 space-y-2 ${anySuspended ? 'border-red-200' : 'border-green-200'}`}>
          <div className={`flex items-center gap-2 ${anySuspended ? 'text-red-700' : 'text-green-700'}`}>
            {anySuspended ? <AlertOctagon size={24} /> : <ShieldCheck size={24} />}
            <h2 className="text-xl font-semibold">{anySuspended ? '注意：有表格停用' : '已核實'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-site-400" />
            <span className="font-mono text-xs text-site-500">{result.ref_no}</span>
            <span className="text-[10px] bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full">
              {EQUIPMENT_KIND_ZH[result.kind as EquipmentKind] ?? result.kind}
            </span>
          </div>
          <p className="text-lg font-bold text-site-900">{result.name_zh}</p>
          {result.location_zh && (
            <p className="text-[11px] text-site-500">位置：{result.location_zh}</p>
          )}
        </div>

        {/* Form instances */}
        <div>
          <h3 className="text-base font-semibold text-site-900 mb-2">表格狀態 ({result.instances.length})</h3>
          {result.instances.length === 0 ? (
            <div className="card p-6 text-center text-sm text-site-500">
              此機械尚未加入任何表格
            </div>
          ) : (
            <div className="space-y-3">
              {result.instances.map(inst => {
                const status = inst.status as FormStatus
                const due = DUE_STATUSES.includes(status)
                return (
                  <div key={inst.instance_id} className="card p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-site-500">{inst.template_code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FORM_STATUS_BADGE_CLASS[status]}`}>
                        {FORM_STATUS_ZH[status]}
                      </span>
                    </div>
                    <p className="font-bold text-site-900 mt-0.5">{inst.template_name}</p>
                    <p className="text-[11px] text-site-500 mt-1">
                      {inst.valid_until
                        ? `有效至：${new Date(inst.valid_until).toLocaleDateString('zh-HK')}`
                        : '未簽署'}
                    </p>
                    {due && projectId && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/project/${projectId}/equipment/${result.equipment_id}`)
                          }
                          className="btn-primary w-full"
                        >
                          <PenLine size={16} className="inline mr-1" /> 去簽署
                        </button>
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5 leading-relaxed">
                          需合資格人士持有相關證書方可簽署
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-site-500 text-center">
          此次掃描已記錄在 equipment_scans 審計紀錄。
        </p>
      </div>
    </AppLayout>
  )
}
