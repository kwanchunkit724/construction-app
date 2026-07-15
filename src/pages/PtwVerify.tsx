import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertOctagon, ArrowLeft } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { FullPageSpinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { verifyPtwQrToken, type PtwJwtPayload } from '../lib/ptw-jwt'
import { PTW_TYPE_ZH } from '../types'

export default function PtwVerifyPage() {
  const { token } = useParams<{ token: string }>()
  const { profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [payload, setPayload] = useState<PtwJwtPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!profile) {
      // Stash token and bounce to login — return path goes back to verify.
      navigate(`/login?next=${encodeURIComponent(`/verify/${token}`)}`, { replace: true })
      return
    }
    if (!token) {
      setError('沒有提供 QR token')
      setVerifying(false)
      return
    }
    verifyPtwQrToken(token).then(({ payload, error }) => {
      if (error) setError(error)
      else setPayload(payload)
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

  if (!payload) return null

  const expiresAt = new Date(payload.exp * 1000)
  const iatAt = new Date(payload.iat * 1000)
  const validNow = expiresAt.getTime() > Date.now()

  return (
    <AppLayout title="驗證工作許可證">
      <div className="space-y-4">
        <div className="card p-6 space-y-3 border-green-200">
          <div className="flex items-center gap-2 text-green-700">
            <ShieldCheck size={24} />
            <h2 className="text-xl font-semibold">{validNow ? '簽核有效' : '已過期'}</h2>
          </div>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-site-500">編號</dt>
              <dd className="font-semibold text-site-900">{payload.number}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-site-500">類型</dt>
              <dd className="text-site-900">{PTW_TYPE_ZH[payload.ptw_type as keyof typeof PTW_TYPE_ZH]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-site-500">發出時間</dt>
              <dd className="text-site-700">{iatAt.toLocaleString('zh-HK')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-site-500">有效至</dt>
              <dd className={validNow ? 'text-site-700' : 'text-red-600 font-semibold'}>
                {expiresAt.toLocaleString('zh-HK')} 香港時間
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => navigate(`/project/${payload.project_id}/ptw/${payload.permit_id}`)}
          >
            查看詳情
          </button>
        </div>
        <p className="text-xs text-site-500 text-center">
          此次掃描已記錄在 permit_scans 審計紀錄。
        </p>
      </div>
    </AppLayout>
  )
}
