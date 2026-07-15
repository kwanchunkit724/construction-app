import { createContext, useContext, useRef, useState, ReactNode } from 'react'
import { KeyRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'

// ── Sign re-auth (簽名前重新驗證密碼) client infrastructure ──────────────────
// Signature non-repudiation (#9): to prove a signature is from 本人 (the actual
// account holder) for a 勞工處 dispute, we require the signer to RE-ENTER their
// login password at the moment of signing. The server-side record_ptw_signoff /
// record_form_signoff RPCs call assert_sign_reauth() and raise
// 簽名前需要重新輸入密碼確認身份 unless a live (≤5-min) grant exists. That grant is
// minted ONLY by the verify-sign-password Edge Function, which checks the
// password against GoTrue and writes sign_reauth_grants via the service role.
//
// requireSignReauth() is the single client entry point a sign flow awaits right
// before the signoff RPC:
//   1. get_sign_reauth_enforced() === false → enforcement OFF, assert_sign_reauth
//      is a no-op server-side, so prompting would be pointless friction. Resolve
//      true immediately, no modal (mirrors StepUp's rollout gate). On true /
//      read-error we fall through and prompt (fail-closed), so flipping the flag
//      on takes effect immediately.
//   2. otherwise open ONE provider-owned password modal. The user enters their
//      login password → verify-sign-password Edge Function → on { ok:true } a
//      grant is minted and we resolve true. Wrong password / network error
//      surface inline; cancel resolves false (the caller aborts the signoff).
// The provider renders the modal it controls; requireSignReauth returns the
// promise the modal settles.

interface SignReauthContextType {
  // Returns true when signing is authorised (enforcement OFF, or the user just
  // re-entered their password and a fresh grant was minted). Returns false when
  // the user cancels or verification fails — the caller must then abort the
  // signoff RPC.
  requireSignReauth: () => Promise<boolean>
}

const SignReauthContext = createContext<SignReauthContextType | null>(null)

// Internal modal state. `open` false means the modal is closed.
interface ModalState {
  open: boolean
  password: string
  error: string
  busy: boolean
}

export function SignReauthProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  // The pending promise resolver. requireSignReauth stashes it here so the
  // modal's submit / cancel handlers can settle the same promise the caller
  // awaits.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  // Mirror modal into a ref so async handlers read the freshest snapshot
  // without stale-closure bugs on `password`.
  const modalRef = useRef<ModalState | null>(null)
  modalRef.current = modal

  // Settle the in-flight promise exactly once, then tear the modal down.
  function settle(ok: boolean) {
    const resolve = resolverRef.current
    resolverRef.current = null
    setModal(null)
    if (resolve) resolve(ok)
  }

  async function requireSignReauth(): Promise<boolean> {
    // (a) Rollout gate (v60): while server enforcement is OFF, assert_sign_reauth
    // is a no-op — so demanding a password would be pointless friction. Skip the
    // whole flow when the flag reads false. On true / read-error we fall through
    // and prompt (fail-closed), so flipping the flag on takes effect immediately.
    try {
      const { data: enforced } = await supabase.rpc('get_sign_reauth_enforced')
      if (enforced === false) return true
    } catch {
      // fall through — prompt rather than silently skip
    }

    // (b) Open the modal and hand back a promise the modal settles.
    return new Promise<boolean>((resolve) => {
      // Defensively settle any prior dangling promise as cancelled before we
      // overwrite the ref (only one re-auth flow runs at a time).
      if (resolverRef.current) resolverRef.current(false)
      resolverRef.current = resolve
      setModal({ open: true, password: '', error: '', busy: false })
    })
  }

  async function submitPassword() {
    // Read the freshest snapshot off the ref (avoids stale-closure `password`).
    const current = modalRef.current
    if (!current) return
    const password = current.password
    if (!password) {
      setModal((m) => (m ? { ...m, busy: false, error: '請輸入密碼' } : m))
      return
    }
    setModal((m) => (m ? { ...m, busy: true, error: '' } : m))
    // Verify the password against GoTrue via the Edge Function. On success it
    // mints the sign_reauth_grant (service-role write) that assert_sign_reauth
    // will see; the password never touches our DB and is never logged.
    const { data, error } = await supabase.functions.invoke('verify-sign-password', {
      body: { password },
    })
    if (error) {
      // FunctionsHttpError (non-2xx) lands here; surface a generic line — the
      // body may carry a zh error but we don't want to leak verification detail.
      setModal((m) => (m ? { ...m, busy: false, error: '密碼錯誤或驗證失敗，請重試' } : m))
      return
    }
    const ok = (data as { ok?: boolean } | null)?.ok === true
    if (!ok) {
      const serverMsg = (data as { error?: string } | null)?.error
      setModal((m) => (m ? { ...m, busy: false, error: serverMsg || '密碼錯誤' } : m))
      return
    }
    settle(true)
  }

  return (
    <SignReauthContext.Provider value={{ requireSignReauth }}>
      {children}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <KeyRound size={20} className="text-safety-500" />
                <h3 className="text-lg font-bold text-site-900">簽名前確認身份</h3>
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
              為確保此簽名由本人簽署，請重新輸入你嘅登入密碼。
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submitPassword()
              }}
            >
              <label className="text-[11px] font-semibold text-site-500 block mb-1">
                登入密碼
              </label>
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                value={modal.password}
                onChange={(e) =>
                  setModal((m) => (m ? { ...m, password: e.target.value, error: '' } : m))
                }
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
                  onClick={() => settle(false)}
                  disabled={modal.busy}
                  className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={modal.busy || !modal.password}
                  className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                >
                  {modal.busy ? <Spinner size={16} className="text-white" /> : <KeyRound size={16} />}
                  確認簽署
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SignReauthContext.Provider>
  )
}

export function useSignReauth(): SignReauthContextType {
  const v = useContext(SignReauthContext)
  if (!v) throw new Error('useSignReauth must be used inside SignReauthProvider')
  return v
}
