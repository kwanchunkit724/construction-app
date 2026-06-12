import { createContext, useContext, useRef, useState, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'

// ── Step-up (二步驗證確認) client infrastructure ──────────────────────────
// High-risk RPCs (approve/reject SI·VO·PTW, membership role change, document
// review/withdraw, progress/account delete) call assert_step_up server-side and
// raise 此操作需要二步驗證確認 unless a non-expired grant exists for the matching
// action class. requireStepUp() is the single client entry point that mints
// that grant:
//   1. step_up_remaining(class) > 0  → a warm grant already covers this class
//      (grants are MULTI-USE within a 5-min TTL), so resolve true with zero
//      friction — no modal, batch-friendly.
//   2. otherwise open ONE provider-owned modal. If the user has no verified
//      TOTP factor, send them to /security-setup and resolve false on cancel.
//   3. if enrolled, take a 6-digit code → challengeAndVerify (elevates session
//      to AAL2) → mint_step_up_grant(class) → resolve true. Wrong code / cancel
//      surface inline and the promise resolves false on cancel.
// The provider renders the modal it controls; requireStepUp returns the promise
// the modal resolves.

// Mirrors the action_class values asserted by the v52 server contract.
export type StepUpActionClass =
  | 'approval'
  | 'membership'
  | 'document'
  | 'progress_delete'
  | 'account_delete'

// Friendly zh-HK labels surfaced in the modal so the user knows WHY they are
// being asked to confirm. Falls back to a generic line for any future class.
const ACTION_CLASS_ZH: Record<StepUpActionClass, string> = {
  approval: '簽核 / 審批操作',
  membership: '成員審批 / 角色變更',
  document: '文件審閱 / 撤回',
  progress_delete: '刪除進度項目',
  account_delete: '刪除帳戶',
}

interface StepUpContextType {
  // Returns true when the action is authorised (a warm grant exists, or the
  // user just verified a TOTP code and a fresh grant was minted). Returns
  // false when the user cancels or has not set up 二步驗證.
  requireStepUp: (actionClass: StepUpActionClass) => Promise<boolean>
}

const StepUpContext = createContext<StepUpContextType | null>(null)

// Internal modal state. `actionClass` null means the modal is closed.
interface ModalState {
  actionClass: StepUpActionClass
  // 'checking' while we listFactors, 'enroll' when no verified TOTP factor
  // exists (prompt to set up), 'verify' when ready for a code.
  phase: 'checking' | 'enroll' | 'verify'
  factorId: string | null
  code: string
  error: string
  busy: boolean
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  // The pending promise resolver. requireStepUp stashes it here so the modal's
  // submit / cancel handlers can settle the same promise the caller awaits.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  // Settle the in-flight promise exactly once, then tear the modal down.
  function settle(ok: boolean) {
    const resolve = resolverRef.current
    resolverRef.current = null
    setModal(null)
    if (resolve) resolve(ok)
  }

  async function requireStepUp(actionClass: StepUpActionClass): Promise<boolean> {
    // (a0) Rollout gate (v54): while server enforcement is OFF, assert_step_up is
    // a no-op — so demanding a code would be pointless friction. Skip the whole
    // flow when the flag reads false. On true / read-error we fall through and
    // prompt (fail-closed), so flipping the flag on takes effect immediately.
    try {
      const { data: enforced } = await supabase.rpc('get_step_up_enforced')
      if (enforced === false) return true
    } catch {
      // fall through — prompt rather than silently skip
    }

    // (a) Warm grant? step_up_remaining returns seconds left on the freshest
    // grant for this class (0 = none). Multi-use within TTL → zero friction.
    try {
      const { data, error } = await supabase.rpc('step_up_remaining', { p_action_class: actionClass })
      if (!error && typeof data === 'number' && data > 0) return true
    } catch {
      // Fall through to the modal — a failed remaining-check shouldn't strand
      // the user; the worst case is one extra TOTP entry.
    }

    // (b/c) Open the modal and hand back a promise the modal settles.
    return new Promise<boolean>((resolve) => {
      // Defensively settle any prior dangling promise as cancelled before we
      // overwrite the ref (only one step-up flow runs at a time).
      if (resolverRef.current) resolverRef.current(false)
      resolverRef.current = resolve
      setModal({ actionClass, phase: 'checking', factorId: null, code: '', error: '', busy: false })
      void detectFactor(actionClass)
    })
  }

  // Decide enroll vs verify by inspecting the user's verified TOTP factors.
  async function detectFactor(actionClass: StepUpActionClass) {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setModal({ actionClass, phase: 'verify', factorId: null, code: '', error: error.message, busy: false })
      return
    }
    // `data.totp` is typed verified-only by auth-js, so a present entry means
    // an enrolled, usable factor.
    const verified = (data?.totp ?? [])[0]
    if (!verified) {
      setModal({ actionClass, phase: 'enroll', factorId: null, code: '', error: '', busy: false })
      return
    }
    setModal({ actionClass, phase: 'verify', factorId: verified.id, code: '', error: '', busy: false })
  }

  async function submitCode() {
    // Read the freshest snapshot off the ref (avoids stale-closure `code`).
    const current = modalRef.current
    if (!current || !current.factorId) return
    const code = current.code.trim()
    if (code.length !== 6) {
      setModal((m) => (m ? { ...m, busy: false, error: '請輸入 6 位數字驗證碼' } : m))
      return
    }
    setModal((m) => (m ? { ...m, busy: true, error: '' } : m))
    // Verify the TOTP — this ELEVATES the session to AAL2, which
    // mint_step_up_grant then requires.
    const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: current.factorId,
      code,
    })
    if (verifyErr) {
      setModal((m) => (m ? { ...m, busy: false, error: '驗證碼不正確，請重新輸入' } : m))
      return
    }
    // Mint the grant for this action class (requires the AAL2 session above).
    const { error: mintErr } = await supabase.rpc('mint_step_up_grant', {
      p_action_class: current.actionClass,
    })
    if (mintErr) {
      setModal((m) => (m ? { ...m, busy: false, error: mintErr.message || '驗證失敗，請稍後再試' } : m))
      return
    }
    settle(true)
  }

  // Mirror modal into a ref so async handlers read the freshest snapshot
  // without stale-closure bugs on `code`.
  const modalRef = useRef<ModalState | null>(null)
  modalRef.current = modal

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

            {modal.phase === 'enroll' && (
              <div>
                <p className="text-sm text-site-700 mb-4 leading-relaxed">
                  你尚未啟用二步驗證。請先完成設定，之後簽核等高風險操作就會用驗證碼確認，即使密碼外洩亦能保障。
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

            {modal.phase === 'verify' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitCode()
                }}
              >
                <label className="text-[11px] font-semibold text-site-500 block mb-1">
                  驗證器 6 位數字驗證碼
                </label>
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={modal.code}
                  onChange={(e) =>
                    setModal((m) =>
                      m ? { ...m, code: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' } : m,
                    )
                  }
                  placeholder="000000"
                  className="input text-center tracking-[0.5em] font-mono text-lg"
                  disabled={modal.busy || !modal.factorId}
                />

                {modal.error && (
                  <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                    {modal.error}
                  </p>
                )}

                {!modal.factorId && !modal.error && (
                  <p className="mt-2 text-xs text-site-500">載入驗證器中...</p>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => settle(false)}
                    disabled={modal.busy}
                    className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={modal.busy || modal.code.length !== 6 || !modal.factorId}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                  >
                    {modal.busy ? <Spinner size={16} className="text-white" /> : <ShieldCheck size={16} />}
                    確認
                  </button>
                </div>
              </form>
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
