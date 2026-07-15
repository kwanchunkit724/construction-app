import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck, AlertOctagon, HardHat } from 'lucide-react'
import { Spinner } from '../components/Spinner'
import { verifyPtwPublic, type PtwPublicResult } from '../lib/publicVerify'
import { PTW_TYPE_ZH } from '../types'

// PUBLIC permit verification — no login. Reached by scanning a PTW QR
// (/#/p/:token). Shows a MINIMAL authenticity + validity card so any inspector
// (勞工處 / client / 查冊) can confirm the permit is genuine and currently valid.
const PTW_STATUS_ZH: Record<string, string> = {
  active: '生效中', closed_out: '已關閉', expired: '已過期', draft: '草稿',
  submitted: '已提交', in_review: '審批中', approved: '已批核',
  rejected: '已拒絕', revision_requested: '要求修改',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-site-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-4 text-site-700">
          <HardHat size={22} className="text-safety-600" />
          <span className="font-heading font-bold">CK工程 · 工作許可證驗證</span>
        </div>
        {children}
        <p className="text-[11px] text-site-400 text-center mt-6">
          公開驗證頁 · 無需登入 · 由 CK工程系統簽發及核實
        </p>
      </div>
    </div>
  )
}

export default function PtwPublicVerify() {
  const { token } = useParams<{ token: string }>()
  const [result, setResult] = useState<PtwPublicResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('沒有 QR token'); setLoading(false); return }
    verifyPtwPublic(token).then(({ result, error }) => {
      if (error) setError(error); else setResult(result)
      setLoading(false)
    })
  }, [token])

  if (loading) return <Shell><div className="card p-8 flex justify-center"><Spinner size={28} /></div></Shell>

  if (error || !result) {
    return (
      <Shell>
        <div className="card p-6 space-y-2 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertOctagon size={22} />
            <h1 className="text-lg font-semibold">驗證失敗</h1>
          </div>
          <p className="text-sm text-red-600">{error ?? 'QR 無效'}</p>
          <p className="text-xs text-site-500">此 QR 無法核實，可能係偽造、損壞或已作廢。</p>
        </div>
      </Shell>
    )
  }

  const valid = result.valid
  const issued = new Date(result.issued_at * 1000)
  const expires = result.expires_at ? new Date(result.expires_at) : null

  return (
    <Shell>
      <div className={`card p-6 space-y-4 ${valid ? 'border-green-300' : 'border-amber-300'}`}>
        <div className={`flex items-center gap-2 ${valid ? 'text-green-700' : 'text-amber-700'}`}>
          {valid ? <ShieldCheck size={28} /> : <AlertOctagon size={28} />}
          <h1 className="text-2xl font-bold">{valid ? '有效' : '不在生效中'}</h1>
        </div>
        <dl className="text-sm divide-y divide-site-100">
          <Row label="許可證編號" value={result.number} strong />
          <Row label="類型" value={PTW_TYPE_ZH[result.ptw_type as keyof typeof PTW_TYPE_ZH] ?? result.ptw_type} />
          <Row label="狀態" value={PTW_STATUS_ZH[result.status] ?? result.status} />
          <Row label="發出時間" value={issued.toLocaleString('zh-HK')} />
          {expires && (
            <Row
              label="有效至"
              value={`${expires.toLocaleString('zh-HK')} 香港時間`}
              danger={!valid}
            />
          )}
        </dl>
        {!valid && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            此許可證並非生效中（已關閉 / 已過期 / 未批核）。施工前請向地盤管理人員確認。
          </p>
        )}
      </div>
    </Shell>
  )
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-site-500 flex-shrink-0">{label}</dt>
      <dd className={`text-right ${danger ? 'text-red-600 font-semibold' : strong ? 'text-site-900 font-bold' : 'text-site-800'}`}>{value}</dd>
    </div>
  )
}
