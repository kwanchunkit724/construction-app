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

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: fetchWithTimeout,
  },
})
