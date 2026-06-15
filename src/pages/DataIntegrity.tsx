// DataIntegrity — admin "資料完整性" screen (Security Phase 1 / Part B).
// Calls verify_integrity() to prove the tamper-evident hash-chain ledger is
// intact (or pinpoint where it was altered), and lets an admin export the
// cryptographic proof (export_ledger_proof) for offline / third-party
// re-verification. This is the demo-able "我哋啲資料改唔到而唔被發現" surface.

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, RefreshCw, Download } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { shareOrDownloadBlob } from '../lib/export'

interface VerifyResult {
  intact: boolean
  break_at: number | null
  reason?: string
  count: number
  head_seq?: number | null
  head_hash?: string | null
  verified_at?: string
}

export default function DataIntegrity() {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const verify = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('verify_integrity', { p_from: 0 })
    if (error) {
      console.error('verify_integrity error:', error)
      setError(error.message)
      setResult(null)
    } else {
      setResult(data as VerifyResult)
    }
    setLoading(false)
  }, [])

  useEffect(() => { verify() }, [verify])

  async function exportProof() {
    setExporting(true)
    const { data, error } = await supabase.rpc('export_ledger_proof')
    setExporting(false)
    if (error) { window.alert('匯出失敗：' + error.message); return }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const filename = `審計證明_${new Date().toISOString().slice(0, 10)}.json`
    await shareOrDownloadBlob(blob, filename, '防篡改審計證明')
  }

  const intact = result?.intact === true

  return (
    <AppLayout title="資料完整性">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-site-500" />
          <h2 className="font-bold text-site-900">防篡改審計帳本</h2>
        </div>
        <p className="text-sm text-site-500 leading-relaxed">
          每一個關鍵改動（簽核、進度、文件、成員角色…）都會封入一條密封嘅 hash
          記錄鏈。改或者刪任何一筆舊記錄，條鏈即刻斷，下面一驗就查得到 —— 連用後台
          改都唔例外。
        </p>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Spinner size={28} /></div>
      ) : error ? (
        <div className="card mt-3 p-4 bg-red-50 border-red-200 text-red-600 text-sm">
          ⚠ 驗證失敗：{error}
        </div>
      ) : result ? (
        <div
          className={`card mt-3 p-5 border-2 ${
            intact ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {intact ? (
              <ShieldCheck size={36} className="text-green-600 flex-shrink-0" />
            ) : (
              <ShieldAlert size={36} className="text-red-600 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className={`text-lg font-bold ${intact ? 'text-green-800' : 'text-red-800'}`}>
                {intact ? '記錄完整，未被篡改 ✓' : '偵測到篡改 ✗'}
              </p>
              <p className="text-sm text-site-600 mt-0.5">
                已驗證 {result.count} 筆記錄
                {!intact && result.break_at != null && (
                  <span className="text-red-700 font-semibold"> · 喺第 {result.break_at} 筆斷咗（{result.reason}）</span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-site-200/60 space-y-1.5 text-xs text-site-600">
            {result.head_seq != null && (
              <p>最新記錄序號：<span className="font-mono">{result.head_seq}</span></p>
            )}
            {result.head_hash && (
              <p className="break-all">
                鏈頭指紋 (sha256)：<span className="font-mono">{result.head_hash}</span>
              </p>
            )}
            {result.verified_at && <p>驗證時間：{result.verified_at}（UTC）</p>}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 mt-4">
        <button
          onClick={verify}
          disabled={loading}
          className="btn-ghost flex-1 inline-flex items-center justify-center gap-1.5"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 重新驗證
        </button>
        <button
          onClick={exportProof}
          disabled={exporting}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
        >
          {exporting ? <Spinner size={16} className="!text-white" /> : <Download size={16} />}
          匯出證明
        </button>
      </div>
      <p className="text-[11px] text-site-400 text-center mt-2 px-4">
        匯出嘅 JSON 包含每筆記錄嘅指紋（唔含內容），第三方可離線重新核實成條鏈。
      </p>
    </AppLayout>
  )
}
