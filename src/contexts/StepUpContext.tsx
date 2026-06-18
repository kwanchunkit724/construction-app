import { createContext, useContext, useRef, useState, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, KeyRound, Fingerprint, Smartphone, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'
import {
  isBiometricAvailable,
  saveBiometricCredential,
  verifyAndGetCredential,
} from '../lib/biometric'

// ── Step-up (二步驗證確認) client infrastructure — FALLBACK CHAIN ──────────────
// High-risk RPCs (approve/reject SI·VO·PTW, membership role change, document
// review/withdraw, progress/account delete) call assert_step_up server-side and
// raise 此操作需要二步驗證確認 unless a non-expired grant exists for the matching
// action class. requireStepUp() is the single client entry point that mints
// that grant. It tries factors in order of LEAST friction:
//   0. Rollout gate (v54): get_step_up_enforced() === false → no-op server-side,
//      so resolve true with zero friction.
//   1. Warm grant: step_up_remaining(class) > 0 → a fresh grant already covers
//      this class (MULTI-USE within a 5-min TTL) → resolve true, no modal.
//   2. otherwise open ONE provider-owned modal offering, in order:
//      (a) 生物認證  — native only, when isBiometricAvailable() AND the user has
//           previously opted in: biometric unlocks an on-device password →
//           verify-stepup-password {password, action_class} → grant.
//      (b) 密碼重輸  — type the login password → verify-stepup-password. On the
//           first success (native + biometric hardware + not yet opted-in) we
//           OFFER to enable biometric next time → saveBiometricCredential.
//      (c) SMS 短訊  — send-stepup-sms {action_class} → enter the 6-digit code →
//           verify-stepup-sms {action_class, code} → grant.
//      (d) TOTP 驗證器 — the original AAL2 path kept for advanced users / the
//           classes the weaker factors are NOT allow-listed for: a 6-digit code →
//           challengeAndVerify (AAL2) → mint_step_up_grant.
//
// account_delete + membership are EXCLUDED from the password/biometric/SMS edge
// allow-list (verify-stepup-password / *-sms only accept approval/document/
// progress_delete/form_signoff). For those classes the modal SKIPS the weaker
// factors entirely and goes straight to the TOTP path.
//
// The provider renders the modal it controls; requireStepUp returns the promise
// the modal resolves. The promise settles EXACTLY ONCE (settle()).

// Mirrors the action_class values asserted by the v52 server contract.
export type StepUpActionClass =
  | 'approval'
  | 'membership'
  | 'document'
  | 'progress_delete'
  | 'account_delete'
  | 'form_signoff'

// Friendly zh-HK labels surfaced in the modal so the user knows WHY they are
// being asked to confirm. Falls back to a generic line for any future class.
const ACTION_CLASS_ZH: Record<StepUpActionClass, string> = {
  approval: '簽核 / 審批操作',
  membership: '成員審批 / 角色變更',
  document: '文件審閱 / 撤回',
  progress_delete: '刪除進度項目',
  account_delete: '刪除帳戶',
  form_signoff: '法定表格簽署',
}

// The weaker-factor (password / biometric / SMS) edge functions allow ONLY these
// classes — mirror verify-stepup-password / send-stepup-sms / verify-stepup-sms.
// Any class NOT in this set must use the TOTP (AAL2) path.
const WEAK_FACTOR_CLASSES = new Set<StepUpActionClass>([
  'approval',
  'document',
  'progress_delete',
  'form_signoff',
])

// localStorage flag: has the user opted in to biometric step-up on THIS device?
// We can't enumerate Keychain entries, so we remember the opt-in here and gate
// the 生物認證 button on it (plus a live isBiometricAvailable() check).
const BIOMETRIC_OPTIN_KEY = 'ck_stepup_biometric_optin'

function biometricOptedIn(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_OPTIN_KEY) === '1'
  } catch {
    return false
  }
}

function setBiometricOptedIn(on: boolean) {
  try {
    if (on) localStorage.setItem(BIOMETRIC_OPTIN_KEY, '1')
    else localStorage.removeItem(BIOMETRIC_OPTIN_KEY)
  } catch {
    // localStorage unavailable — degrade silently (biometric button just hides).
  }
}

interface StepUpContextType {
  // Returns true when the action is authorised (a warm grant exists, or the user
  // just verified via biometric / password / SMS / TOTP and a fresh grant was
  // minted). Returns false when the user cancels or has no usable factor.
  requireStepUp: (actionClass: StepUpActionClass) => Promise<boolean>
}

const StepUpContext = createContext<StepUpContextType | null>(null)

// Which screen the modal is showing.
//   'checking'  — initial async probe (biometric availability + TOTP factors).
//   'choose'    — factor picker (weaker-factor classes that have ≥1 option).
//   'password'  — login-password entry.
//   'sms'       — 6-digit SMS code entry (after a successful send).
//   'totp'      — TOTP verifier code entry.
//   'enroll'    — no usable factor (must set up 二步驗證 first).
type StepUpPhase = 'checking' | 'choose' | 'password' | 'sms' | 'totp' | 'enroll'

interface ModalState {
  actionClass: StepUpActionClass
  phase: StepUpPhase
  // Whether the weaker factors (biometric/password/SMS) are allowed for this class.
  weakAllowed: boolean
  // Biometric is offerable: native hardware present AND user has opted in.
  biometricOfferable: boolean
  // A verified TOTP factor id, or null if none enrolled.
  totpFactorId: string | null
  // Text inputs.
  password: string
  code: string
  // After a successful password step-up on a biometric-capable device, offer to
  // remember the password for next time (then resolve true).
  offerBiometricSave: boolean
  pendingPassword: string
  error: string
  busy: boolean
  // true once the SMS has been dispatched (drives the 'sms' phase copy + resend).
  smsSent: boolean
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  // The pending promise resolver. requireStepUp stashes it here so the modal's
  // submit / cancel handlers can settle the same promise the caller awaits.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  // Mirror modal into a ref so async handlers read the freshest snapshot without
  // stale-closure bugs on `password` / `code`.
  const modalRef = useRef<ModalState | null>(null)
  modalRef.current = modal

  // Settle the in-flight promise exactly once, then tear the modal down.
  function settle(ok: boolean) {
    const resolve = resolverRef.current
    resolverRef.current = null
    setModal(null)
    if (resolve) resolve(ok)
  }

  // Patch the current modal state (no-op if the modal is already gone).
  function patch(p: Partial<ModalState>) {
    setModal((m) => (m ? { ...m, ...p } : m))
  }

  async function requireStepUp(actionClass: StepUpActionClass): Promise<boolean> {
    // (0) Rollout gate (v54): while server enforcement is OFF, assert_step_up is
    // a no-op — so demanding a factor would be pointless friction. Skip the whole
    // flow when the flag reads false. On true / read-error we fall through and
    // prompt (fail-closed), so flipping the flag on takes effect immediately.
    try {
      const { data: enforced } = await supabase.rpc('get_step_up_enforced')
      if (enforced === false) return true
    } catch {
      // fall through — prompt rather than silently skip
    }

    // (1) Warm grant? step_up_remaining returns seconds left on the freshest
    // grant for this class (0 = none). Multi-use within TTL → zero friction.
    try {
      const { data, error } = await supabase.rpc('step_up_remaining', { p_action_class: actionClass })
      if (!error && typeof data === 'number' && data > 0) return true
    } catch {
      // Fall through to the modal — a failed remaining-check shouldn't strand the
      // user; the worst case is one extra verification.
    }

    // (2) Open the modal and hand back a promise the modal settles.
    return new Promise<boolean>((resolve) => {
      // Defensively settle any prior dangling promise as cancelled before we
      // overwrite the ref (only one step-up flow runs at a time).
      if (resolverRef.current) resolverRef.current(false)
      resolverRef.current = resolve
      const weakAllowed = WEAK_FACTOR_CLASSES.has(actionClass)
      setModal({
        actionClass,
        phase: 'checking',
        weakAllowed,
        biometricOfferable: false,
        totpFactorId: null,
        password: '',
        code: '',
        offerBiometricSave: false,
        pendingPassword: '',
        error: '',
        busy: false,
        smsSent: false,
      })
      void detectFactors(actionClass, weakAllowed)
    })
  }

  // Probe the device's available factors, then pick the opening phase.
  async function detectFactors(actionClass: StepUpActionClass, weakAllowed: boolean) {
    // Biometric is only offerable for weak-factor classes, on native hardware,
    // when the user has previously opted in on this device.
    let biometricOfferable = false
    if (weakAllowed && biometricOptedIn()) {
      try {
        biometricOfferable = await isBiometricAvailable()
      } catch {
        biometricOfferable = false
      }
    }

    // Look up the caller's verified TOTP factor (the AAL2 path).
    let totpFactorId: string | null = null
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      // `data.totp` is typed verified-only by auth-js, so a present entry means
      // an enrolled, usable factor.
      totpFactorId = (data?.totp ?? [])[0]?.id ?? null
    } catch {
      totpFactorId = null
    }

    // If the modal was cancelled while we were probing, don't touch state.
    if (!modalRef.current || modalRef.current.actionClass !== actionClass) return

    // Weak-factor classes: password + SMS are always offerable (server verifies),
    // so there is at least one option → show the picker. Strong-only classes fall
    // back to TOTP: verify if enrolled, else prompt to enroll.
    if (weakAllowed) {
      patch({ phase: 'choose', biometricOfferable, totpFactorId })
      return
    }
    if (totpFactorId) {
      patch({ phase: 'totp', biometricOfferable: false, totpFactorId })
      return
    }
    patch({ phase: 'enroll', biometricOfferable: false, totpFactorId: null })
  }

  // ── Factor (a): biometric → unlock stored password → verify-stepup-password ──
  async function runBiometric() {
    const current = modalRef.current
    if (!current) return
    patch({ busy: true, error: '' })
    let password: string | null = null
    try {
      password = await verifyAndGetCredential()
    } catch {
      password = null
    }
    if (!modalRef.current) return
    if (!password) {
      // Cancelled / failed / no stored credential — let the user fall back.
      patch({ busy: false, error: '生物認證未完成，請改用其他方式' })
      return
    }
    await verifyPassword(current.actionClass, password, false)
  }

  // ── Factor (b): manual password entry ──
  async function submitPassword() {
    const current = modalRef.current
    if (!current) return
    const password = current.password
    if (!password) {
      patch({ busy: false, error: '請輸入密碼' })
      return
    }
    await verifyPassword(current.actionClass, password, true)
  }

  // Shared password verification (used by both biometric-unlock and manual entry).
  // `manual` true means the secret came from a typed login password → eligible to
  // offer biometric-save afterwards.
  async function verifyPassword(actionClass: StepUpActionClass, password: string, manual: boolean) {
    patch({ busy: true, error: '' })
    let ok = false
    let serverMsg: string | undefined
    try {
      const { data, error } = await supabase.functions.invoke('verify-stepup-password', {
        body: { password, action_class: actionClass },
      })
      if (error) {
        // FunctionsHttpError (non-2xx) lands here.
        serverMsg = '密碼錯誤或驗證失敗，請重試'
      } else {
        ok = (data as { ok?: boolean } | null)?.ok === true
        if (!ok) serverMsg = (data as { error?: string } | null)?.error || '密碼錯誤'
      }
    } catch {
      serverMsg = '驗證服務暫時無法使用，請稍後再試'
    }
    if (!modalRef.current) return
    if (!ok) {
      patch({ busy: false, error: serverMsg || '密碼錯誤' })
      return
    }
    // Grant minted. If this was a manual entry on a biometric-capable device and
    // the user hasn't opted in yet, offer to remember the password for next time.
    if (manual && !biometricOptedIn()) {
      let canBio = false
      try {
        canBio = await isBiometricAvailable()
      } catch {
        canBio = false
      }
      if (canBio && modalRef.current) {
        patch({ busy: false, offerBiometricSave: true, pendingPassword: password, error: '' })
        return
      }
    }
    settle(true)
  }

  // The user accepted / declined the post-password biometric-save offer.
  async function confirmBiometricSave(enable: boolean) {
    const current = modalRef.current
    if (!current) return
    if (enable) {
      patch({ busy: true })
      let saved = false
      try {
        saved = await saveBiometricCredential(current.pendingPassword)
      } catch {
        saved = false
      }
      if (saved) setBiometricOptedIn(true)
    }
    // Either way the step-up itself already succeeded — resolve true.
    settle(true)
  }

  // ── Factor (c): SMS — send code, then verify ──
  async function sendSms() {
    const current = modalRef.current
    if (!current) return
    patch({ busy: true, error: '' })
    let ok = false
    let serverMsg: string | undefined
    try {
      const { data, error } = await supabase.functions.invoke('send-stepup-sms', {
        body: { action_class: current.actionClass },
      })
      if (error) {
        serverMsg = '無法發送驗證碼，請稍後再試'
      } else {
        ok = (data as { ok?: boolean } | null)?.ok === true
        if (!ok) serverMsg = (data as { error?: string } | null)?.error || '無法發送驗證碼'
      }
    } catch {
      serverMsg = '發送服務暫時無法使用，請稍後再試'
    }
    if (!modalRef.current) return
    if (!ok) {
      // Stay on whatever phase we're on (choose or sms) and surface the error.
      patch({ busy: false, error: serverMsg || '無法發送驗證碼' })
      return
    }
    patch({ phase: 'sms', smsSent: true, code: '', busy: false, error: '' })
  }

  async function submitSms() {
    const current = modalRef.current
    if (!current) return
    const code = current.code.trim()
    if (code.length !== 6) {
      patch({ busy: false, error: '請輸入 6 位數字驗證碼' })
      return
    }
    patch({ busy: true, error: '' })
    let ok = false
    let serverMsg: string | undefined
    try {
      const { data, error } = await supabase.functions.invoke('verify-stepup-sms', {
        body: { action_class: current.actionClass, code },
      })
      if (error) {
        serverMsg = '驗證碼不正確或已過期，請重試'
      } else {
        ok = (data as { ok?: boolean } | null)?.ok === true
        if (!ok) serverMsg = (data as { error?: string } | null)?.error || '驗證碼不正確'
      }
    } catch {
      serverMsg = '驗證服務暫時無法使用，請稍後再試'
    }
    if (!modalRef.current) return
    if (!ok) {
      patch({ busy: false, error: serverMsg || '驗證碼不正確' })
      return
    }
    settle(true)
  }

  // ── Factor (d): TOTP — challengeAndVerify (AAL2) → mint_step_up_grant ──
  async function submitTotp() {
    const current = modalRef.current
    if (!current || !current.totpFactorId) return
    const code = current.code.trim()
    if (code.length !== 6) {
      patch({ busy: false, error: '請輸入 6 位數字驗證碼' })
      return
    }
    patch({ busy: true, error: '' })
    // Verify the TOTP — this ELEVATES the session to AAL2, which
    // mint_step_up_grant then requires.
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: current.totpFactorId,
      code,
    })
    if (!modalRef.current) return
    if (verifyErr) {
      patch({ busy: false, error: '驗證碼不正確，請重新輸入' })
      return
    }
    // Mint the grant for this action class (requires the AAL2 session above).
    const { error: mintErr } = await supabase.rpc('mint_step_up_grant', {
      p_action_class: current.actionClass,
    })
    if (!modalRef.current) return
    if (mintErr) {
      patch({ busy: false, error: mintErr.message || '驗證失敗，請稍後再試' })
      return
    }
    settle(true)
  }

  return (
    <StepUpContext.Provider value={{ requireStepUp }}>
      {children}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-safety-500" />
                <h3 className="text-lg font-bold text-site-900">二步驗證確認</h3>
              </div>
              <button
                onClick={() => settle(false)}
                className="text-site-400 hover:text-site-700 p-1 -mr-1 min-h-0"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-site-500 mb-4 leading-relaxed">
              此操作（{ACTION_CLASS_ZH[modal.actionClass]}）需要二步驗證確認。
            </p>

            {modal.phase === 'checking' && (
              <div className="py-6 flex justify-center">
                <Spinner size={24} />
              </div>
            )}

            {/* (a/b/c/d) Factor picker — weaker-factor classes. */}
            {modal.phase === 'choose' && !modal.offerBiometricSave && (
              <div className="space-y-2">
                {modal.error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {modal.error}
                  </p>
                )}

                {modal.biometricOfferable && (
                  <button
                    onClick={() => void runBiometric()}
                    disabled={modal.busy}
                    className="w-full bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <Fingerprint size={16} />}
                    用生物認證確認
                  </button>
                )}

                <button
                  onClick={() => patch({ phase: 'password', error: '', password: '' })}
                  disabled={modal.busy}
                  className="w-full border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                >
                  <KeyRound size={16} /> 用登入密碼確認
                </button>

                <button
                  onClick={() => void sendSms()}
                  disabled={modal.busy}
                  className="w-full border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                >
                  {modal.busy ? <Spinner size={16} /> : <Smartphone size={16} />}
                  用短訊驗證碼
                </button>

                {modal.totpFactorId && (
                  <button
                    onClick={() => patch({ phase: 'totp', error: '', code: '' })}
                    disabled={modal.busy}
                    className="w-full text-sm text-site-500 hover:text-site-700 py-2 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck size={14} /> 用驗證器（TOTP）確認
                  </button>
                )}
              </div>
            )}

            {/* Post-password offer to remember the password behind biometric. */}
            {modal.offerBiometricSave && (
              <div>
                <p className="text-sm text-site-700 mb-4 leading-relaxed">
                  要唔要喺呢部裝置啟用生物認證？下次高風險操作就可以用 Face ID／指紋快速確認，唔使再輸入密碼。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void confirmBiometricSave(false)}
                    disabled={modal.busy}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5"
                  >
                    暫時唔使
                  </button>
                  <button
                    onClick={() => void confirmBiometricSave(true)}
                    disabled={modal.busy}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <Fingerprint size={16} />}
                    啟用
                  </button>
                </div>
              </div>
            )}

            {/* (b) Manual password entry. */}
            {modal.phase === 'password' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitPassword()
                }}
              >
                <label className="text-[11px] font-semibold text-site-500 block mb-1">登入密碼</label>
                <input
                  autoFocus
                  type="password"
                  autoComplete="current-password"
                  value={modal.password}
                  onChange={(e) => patch({ password: e.target.value, error: '' })}
                  placeholder="••••••••"
                  className="input"
                  disabled={modal.busy}
                />

                {modal.error && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {modal.error}
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() =>
                      modal.weakAllowed
                        ? patch({ phase: 'choose', error: '' })
                        : settle(false)
                    }
                    disabled={modal.busy}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5"
                  >
                    返回
                  </button>
                  <button
                    type="submit"
                    disabled={modal.busy || !modal.password}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <KeyRound size={16} />}
                    確認
                  </button>
                </div>
              </form>
            )}

            {/* (c) SMS code entry. */}
            {modal.phase === 'sms' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitSms()
                }}
              >
                <label className="text-[11px] font-semibold text-site-500 block mb-1">短訊 6 位數字驗證碼</label>
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={modal.code}
                  onChange={(e) => patch({ code: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' })}
                  placeholder="000000"
                  className="input text-center tracking-[0.5em] font-mono text-lg"
                  disabled={modal.busy}
                />

                {modal.error && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {modal.error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void sendSms()}
                  disabled={modal.busy}
                  className="mt-2 text-xs text-site-500 hover:text-site-700 disabled:opacity-60"
                >
                  重新發送驗證碼
                </button>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() =>
                      modal.weakAllowed
                        ? patch({ phase: 'choose', error: '' })
                        : settle(false)
                    }
                    disabled={modal.busy}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5"
                  >
                    返回
                  </button>
                  <button
                    type="submit"
                    disabled={modal.busy || modal.code.length !== 6}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <Smartphone size={16} />}
                    確認
                  </button>
                </div>
              </form>
            )}

            {/* (d) TOTP verifier code entry. */}
            {modal.phase === 'totp' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitTotp()
                }}
              >
                <label className="text-[11px] font-semibold text-site-500 block mb-1">驗證器 6 位數字驗證碼</label>
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={modal.code}
                  onChange={(e) => patch({ code: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' })}
                  placeholder="000000"
                  className="input text-center tracking-[0.5em] font-mono text-lg"
                  disabled={modal.busy || !modal.totpFactorId}
                />

                {modal.error && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {modal.error}
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() =>
                      modal.weakAllowed
                        ? patch({ phase: 'choose', error: '' })
                        : settle(false)
                    }
                    disabled={modal.busy}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 disabled:opacity-60 font-semibold rounded-xl py-2.5"
                  >
                    返回
                  </button>
                  <button
                    type="submit"
                    disabled={modal.busy || modal.code.length !== 6 || !modal.totpFactorId}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <ShieldCheck size={16} />}
                    確認
                  </button>
                </div>
              </form>
            )}

            {/* No usable factor — strong-only class without an enrolled TOTP. */}
            {modal.phase === 'enroll' && (
              <div>
                <p className="text-sm text-site-700 mb-4 leading-relaxed">
                  此操作必須使用驗證器（TOTP）二步驗證。你尚未啟用，請先完成設定，之後即使密碼外洩亦能保障。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => settle(false)}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
                  >
                    取消
                  </button>
                  <Link
                    to="/security-setup"
                    onClick={() => settle(false)}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck size={16} /> 設定二步驗證
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </StepUpContext.Provider>
  )
}

export function useStepUp(): StepUpContextType {
  const v = useContext(StepUpContext)
  if (!v) throw new Error('useStepUp must be used inside StepUpProvider')
  return v
}
