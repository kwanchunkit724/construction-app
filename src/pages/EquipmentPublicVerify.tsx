import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck, AlertOctagon, Wrench } from 'lucide-react'
import { Spinner } from '../components/Spinner'
import { verifyEquipmentPublic, type EquipmentPublicResult } from '../lib/publicVerify'
import { EQUIPMENT_KIND_ZH, FORM_STATUS_ZH, FORM_STATUS_BADGE_CLASS } from '../types'
import type { EquipmentKind, FormStatus } from '../types'

// PUBLIC equipment/statutory-form verification — no login. Reached by scanning an
// equipment QR (/#/pe/:token). Shows the machine + each statutory form's live
// status so any inspector can confirm the 棚 / 吊機 / 挖掘 cert is in date.
const ATTENTION: FormStatus[] = ['expiring', 'expired', 'missing', 'suspended']

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-site-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-4 text-site-700">
          <Wrench size={22} className="text-safety-600" />
          <span className="font-heading font-bold">CK工程 · 機械 / 法定表格驗證</span>
        </div>
        {children}
        <p className="text-[11px] text-site-400 text-center mt-6">
          公開驗證頁 · 無需登入 · 由 CK工程系統簽發及核實
        </p>
      </div>
    </div>
  )
}

export default function EquipmentPublicVerify() {
  const { token } = useParams<{ token: string }>()
  const [result, setResult] = useState<EquipmentPublicResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('沒有 QR token'); setLoading(false); return }
    verifyEquipmentPublic(token).then(({ result, error }) => {
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

  const attention = result.instances.some(i => ATTENTION.includes(i.status as FormStatus))

  return (
    <Shell>
      <div className={`card p-6 space-y-2 ${attention ? 'border-amber-300' : 'border-green-300'}`}>
        <div className={`flex items-center gap-2 ${attention ? 'text-amber-700' : 'text-green-700'}`}>
          {attention ? <AlertOctagon size={26} /> : <ShieldCheck size={26} />}
          <h1 className="text-xl font-bold">{attention ? '注意：有表格到期 / 停用' : '表格齊全有效'}</h1>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="font-mono text-xs text-site-500">{result.ref_no}</span>
          <span className="text-[10px] bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full">
            {EQUIPMENT_KIND_ZH[result.equipment_kind as EquipmentKind] ?? result.equipment_kind}
          </span>
        </div>
        <p className="text-lg font-bold text-site-900">{result.name_zh}</p>
      </div>

      <h2 className="text-sm font-semibold text-site-700 mt-4 mb-2">法定表格狀態 ({result.instances.length})</h2>
      {result.instances.length === 0 ? (
        <div className="card p-6 text-center text-sm text-site-500">此機械尚未登記任何法定表格</div>
      ) : (
        <div className="space-y-2">
          {result.instances.map((inst, i) => {
            const st = inst.status as FormStatus
            return (
              <div key={i} className="card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-site-500">{inst.template_code}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FORM_STATUS_BADGE_CLASS[st]}`}>
                    {FORM_STATUS_ZH[st]}
                  </span>
                </div>
                <p className="font-semibold text-site-900 mt-0.5 text-sm">{inst.template_name}</p>
                <p className="text-[11px] text-site-500 mt-0.5">
                  {inst.valid_until ? `有效至：${new Date(inst.valid_until).toLocaleDateString('zh-HK')}` : '未簽署'}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
