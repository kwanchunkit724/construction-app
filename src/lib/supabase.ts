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

// Tab bleed fix (persona-sim R2 + R3 root cause):
// supabase-js creates `new BroadcastChannel(storageKey)` whenever
// `persistSession && storageKey` are truthy. Tab B's SIGNED_IN event
// fires `_notifyAllSubscribers` in Tab A with Tab B's session → Tab A's
// AuthContext re-fetches profile for the new auth.uid → identity flip.
// Renaming storageKey (R2 attempt) doesn't help — both tabs still share
// the channel by name.
//
// Real fix:
//   - Per-tab unique storageKey: each tab generates its own UUID stored
//     in sessionStorage (survives reload, dies with tab) and suffixes it
//     onto the storageKey. Tab A and Tab B then have DIFFERENT channels
//     and don't cross-talk. Session also stays per-tab.
//   - Native (Capacitor) single webview keeps a stable shared key in
//     localStorage so cold-launch session restoration still works.
const isNativeApp =
  typeof window !== 'undefined' &&
  // @ts-expect-error Capacitor adds this global at runtime
  typeof window.Capacitor !== 'undefined'

function getOrCreateTabId(): string {
  if (typeof window === 'undefined') return 'ssr'
  // sessionStorage is per-tab and survives reload — perfect for tab-id.
  let id = window.sessionStorage.getItem('ckcon-tab-id')
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    window.sessionStorage.setItem('ckcon-tab-id', id)
  }
  return id
}

const authStorage =
  typeof window === 'undefined'
    ? undefined
    : isNativeApp
      ? window.localStorage
      : window.sessionStorage

const authStorageKey = isNativeApp
  ? 'ckcon-auth-native-v1'
  : `ckcon-auth-tab-${getOrCreateTabId()}`

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: authStorage,
    storageKey: authStorageKey,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: fetchWithTimeout,
  },
})
