import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldOff, Copy, Check } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'

// ── 二步驗證 (TOTP) 設定 ─────────────────────────────────────────────────
// Authenticator-app based 2FA. TOTP is app-to-app (no email / SMS), so the
// synthetic <digits>@phone.local emails are fine. Once enabled, high-risk
// operations (簽核 / 審批 / 刪除) prompt for a 6-digit code via the step-up
// flow — protecting them even if the password leaks. Stage 2 biometric is out
// of scope here; this is TOTP code entry only.

type View = 'loading' | 'enrolled' | 'enroll' | 'done'

interface EnrollData {
  factorId: string
  qrCode: string
  secret: string
}

export default function SecuritySetup() {
  const [view, setView] = useState<View>('loading')
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<EnrollData | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // On mount, decide which view to show by listing the user's TOTP factors.
  useEffect(() => {
    void refreshFactors()
  }, [])

  async function refreshFactors() {
    setError('')
    const { data, error: e } = await supabase.auth.mfa.listFactors()
    if (e) {
      setError(e.message)
      setView('enroll')
      return
    }
    // `data.totp` is typed verified-only by auth-js — a present entry means an
    // active, usable factor.
    const verified = (data?.totp ?? [])[0]
    if (verified) {
      setEnrolledFactorId(verified.id)
      setView('enrolled')
    } else {
      setView('enroll')
    }
  }

  // Begin enrolment: create a TOTP factor and render its QR + secret.
  async function startEnroll() {
    setBusy(true)
    setError('')
    // Clean up any half-finished (unverified) factor first — Supabase rejects a
    // second enrol with the same friendlyName while one is pending. `data.totp`
    // is verified-only; the full status set lives on `data.all`.
    const { data: list } = await supabase.auth.mfa.listFactors()
    const stale = (list?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'unverified')
    if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id })

    const { data, error: e } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'CK工程 二步驗證',
    })
    setBusy(false)
    if (e || !data) {
      setError(e?.message || '無法開始設定，請稍後再試')
      return
    }
    setEnroll({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
  }

  // Verify the 6-digit code against the pending factor — this completes
  // enrolment and elevates the session to AAL2.
  async function verify() {
    if (!enroll) return
    const trimmed = code.trim()
    if (trimmed.length !== 6) {
      setError('請輸入 6 位數字驗證碼')
      return
    }
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.factorId,
      code: trimmed,
    })
    setBusy(false)
    if (e) {
      setError('驗證碼不正確，請重新輸入')
      return
    }
    setEnroll(null)
    setCode('')
    setView('done')
  }

  // Disable 2FA by unenrolling the verified factor.
  async function disable() {
    if (!enrolledFactorId) return
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.mfa.unenroll({ factorId: enrolledFactorId })
    setBusy(false)
    if (e) {
      setError(e.message || '取消啟用失敗，請稍後再試')
      return
    }
    setEnrolledFactorId(null)
    await refreshFactors()
  }

  async function copySecret() {
    if (!enroll) return
    try {
      await navigator.clipboard.writeText(enroll.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — user can read the secret manually */
    }
  }

  return (
    <AppLayout title="二步驗證">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-safety-500" />
          <span className="text-base font-bold text-site-900">二步驗證 (2FA)</span>
        </div>
        <p className="text-sm text-site-500 leading-relaxed">
          啟用後，簽核 / 審批等高風險操作會要求輸入驗證器嘅 6 位數字驗證碼 — 即使密碼外洩，他人亦無法替你簽核。
        </p>
      </div>

      {view === 'loading' && (
        <div className="card mt-3 p-8 flex justify-center">
          <Spinner size={28} />
        </div>
      )}

      {/* Already enabled ─────────────────────────────── */}
      {view === 'enrolled' && (
        <div className="card mt-3 p-5">
          <div className="flex items-center gap-2 mb-3 text-green-700 bg-green-100 rounded-lg px-3 py-2">
            <ShieldCheck size={18} />
            <span className="text-sm font-semibold">已啟用二步驗證</span>
          </div>
          {error && (
            <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
              {error}
            </p>
          )}
          <button
            onClick={disable}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-red-700 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-60 font-semibold rounded-xl py-3"
          >
            {busy ? <Spinner size={16} /> : <ShieldOff size={16} />}
            取消啟用
          </button>
        </div>
      )}

      {/* Not enrolled ─────────────────────────────── */}
      {view === 'enroll' && (
        <div className="card mt-3 p-5">
          {!enroll ? (
            <>
              <p className="text-sm text-site-700 mb-4 leading-relaxed">
                使用驗證器 App（如 Google Authenticator、Microsoft Authenticator）掃描 QR code 完成設定。
              </p>
              {error && (
                <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  {error}
                </p>
              )}
              <button
                onClick={startEnroll}
                disabled={busy}
                className="w-full bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-1.5"
              >
                {busy ? <Spinner size={16} className="text-white" /> : <ShieldCheck size={16} />}
                開始設定
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-site-700 mb-3 leading-relaxed">
                1. 用驗證器 App 掃描下方 QR code：
              </p>
              <div className="flex justify-center mb-4">
                <img
                  src={enroll.qrCode}
                  alt="二步驗證 QR code"
                  className="w-48 h-48 border border-site-200 rounded-xl bg-white p-2"
                />
              </div>

              <p className="text-sm text-site-700 mb-1.5 leading-relaxed">
                或手動輸入密鑰：
              </p>
              <div className="flex items-center gap-2 mb-4">
                <code className="flex-1 text-xs font-mono bg-site-100 text-site-800 rounded-lg px-3 py-2 break-all">
                  {enroll.secret}
                </code>
                <button
                  onClick={copySecret}
                  className="shrink-0 text-site-600 border border-site-200 hover:bg-site-50 rounded-lg p-2.5"
                  aria-label="複製密鑰"
                >
                  {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
              </div>

              <label className="text-[11px] font-semibold text-site-500 block mb-1">
                2. 輸入驗證器顯示嘅 6 位數字驗證碼：
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setError('')
                }}
                placeholder="000000"
                className="input text-center tracking-[0.5em] font-mono text-lg"
                disabled={busy}
              />

              {error && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                  {error}
                </p>
              )}

              <button
                onClick={verify}
                disabled={busy || code.length !== 6}
                className="mt-4 w-full bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-1.5"
              >
                {busy ? <Spinner size={16} className="text-white" /> : <ShieldCheck size={16} />}
                驗證並啟用
              </button>
            </>
          )}
        </div>
      )}

      {/* Success ─────────────────────────────── */}
      {view === 'done' && (
        <div className="card mt-3 p-5">
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mb-3">
              <ShieldCheck size={28} />
            </div>
            <p className="text-base font-bold text-site-900 mb-1">已成功啟用二步驗證</p>
            <p className="text-sm text-site-500 leading-relaxed">
              之後進行簽核 / 審批等高風險操作時，系統會要求輸入驗證碼確認。
            </p>
            <button
              onClick={() => void refreshFactors()}
              className="mt-4 w-full bg-safety-500 hover:bg-safety-600 text-white font-semibold rounded-xl py-3"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
