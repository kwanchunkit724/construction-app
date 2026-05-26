import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// Wrap fetch with a 15s timeout so a dropped connection doesn't leave
// the UI spinning indefinitely. Returns a "Network request failed" error
// that callers can surface to users.
const REQUEST_TIMEOUT_MS = 15000

const fetchWithTimeout: typeof fetch = (input, init) => {
  // Realtime websocket and OAuth callbacks shouldn't be aborted — only
  // REST calls need this. We can't easily distinguish here, but a 15s
  // timeout on websocket setup is also reasonable.
  const controller = new AbortController()
  const externalSignal = init?.signal
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', () => controller.abort())
  }
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Request timed out (15s)', 'TimeoutError'))
  }, REQUEST_TIMEOUT_MS)

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId)
  })
}

// Tab bleed fix (persona-sim 2026-05-26):
// Supabase persists auth tokens in localStorage by default + broadcasts
// SIGNED_IN events across tabs via BroadcastChannel. On the web that means
// signing in as user B in tab 2 flips tab 1's profile to user B.
// On Capacitor (single webview) we still want localStorage so session
// survives app cold-start. On the web we scope to sessionStorage so each
// browser tab gets its own session. Same-tab reload still works because
// sessionStorage survives reload (only closes the tab clears it).
const isNativeApp =
  typeof window !== 'undefined' &&
  // @ts-expect-error Capacitor adds this global at runtime
  typeof window.Capacitor !== 'undefined'

const authStorage =
  typeof window === 'undefined'
    ? undefined
    : isNativeApp
      ? window.localStorage
      : window.sessionStorage

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: authStorage,
    // Per-build storage key — also disables Supabase's default broadcast
    // channel keying which is what propagates SIGNED_IN across tabs.
    storageKey: 'ckcon-auth-v1',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: fetchWithTimeout,
  },
})
