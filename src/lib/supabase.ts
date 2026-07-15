import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { getOnline, OFFLINE_WRITE_MSG } from './offline'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

// Wrap fetch with a 15s timeout so a dropped connection doesn't leave
// the UI spinning indefinitely. Returns a "Network request failed" error
// that callers can surface to users.
const REQUEST_TIMEOUT_MS = 15000

// REST methods that MUTATE data. When offline we reject these immediately
// (Option A: offline mode is read-only) so all contexts surface one clear
// zh-HK message instead of spinning for 15s and silently dropping the
// write. Reads (GET) are left to fail naturally so callers can fall back
// to the read-cache.
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function isOfflineBlockedWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
  const url =
    typeof input === 'string' ? input :
    input instanceof URL ? input.href :
    input instanceof Request ? input.url : String(input)
  // Guard PostgREST *table* writes and Storage uploads. Auth (/auth/v1/)
  // and realtime are left alone. RPC (/rest/v1/rpc/) is excluded because an
  // RPC POST can be a READ (e.g. get_visible_progress_items) — those should
  // fail naturally offline so the caller can fall back to its read-cache,
  // not get a "write blocked" message.
  const isRest = url.includes('/rest/v1/') && !url.includes('/rest/v1/rpc/')
  const isStorage = url.includes('/storage/v1/') // object uploads/removes
  if (!isRest && !isStorage) return false
  const method = (
    init?.method ?? (input instanceof Request ? input.method : 'GET')
  ).toUpperCase()
  return WRITE_METHODS.has(method)
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  // Offline write-guard: bail out before touching the network. Return a
  // synthetic PostgREST-shaped error response (not a rejected Error) so
  // supabase-js parses `error.message` to the bare zh-HK string instead of
  // stringifying a thrown Error into "Error: 離線中…".
  if (!getOnline() && isOfflineBlockedWrite(input, init)) {
    return Promise.resolve(new Response(
      JSON.stringify({ message: OFFLINE_WRITE_MSG, code: 'OFFLINE', details: null, hint: null }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ))
  }

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
// MUST use isNativePlatform() — `typeof window.Capacitor !== 'undefined'`
// is truthy on Capacitor's WEB runtime too (getPlatform() === 'web'), which
// would make web pick the shared native auth key and defeat the per-tab
// tab-bleed fix on the only platform that has tabs.
const isNativeApp = Capacitor.isNativePlatform()

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
