import { useEffect, useState } from 'react'

// Offline-mode primitives (read-only cache strategy / "Option A").
//
// Three jobs:
//   1. Online/offline detection — Capacitor Network on native, the
//      navigator online/offline events on web. One module-level source of
//      truth other modules can read synchronously (getOnline) or subscribe
//      to (subscribeOnline / useOnline).
//   2. A tiny localStorage read-cache so contexts can show last-synced
//      data when a fetch fails offline.
//   3. The canonical zh-HK message shown when a write is attempted offline.
//
// We deliberately do NOT queue writes — offline mode is read-only. Writes
// are blocked at the supabase fetch layer (see src/lib/supabase.ts) and
// surface OFFLINE_WRITE_MSG.

export const OFFLINE_WRITE_MSG = '離線中：此操作需要網絡連線，請連線後再試。'

// ── Online state ────────────────────────────────────────────
let _online = typeof navigator === 'undefined' ? true : navigator.onLine
const _subs = new Set<(online: boolean) => void>()

function setOnline(next: boolean) {
  if (next === _online) return
  _online = next
  _subs.forEach(cb => { try { cb(next) } catch { /* noop */ } })
}

export function getOnline(): boolean {
  return _online
}

export function subscribeOnline(cb: (online: boolean) => void): () => void {
  _subs.add(cb)
  return () => { _subs.delete(cb) }
}

// Wire up the underlying sources once at module load.
function initDetection() {
  if (typeof window === 'undefined') return

  // Web events — always available, also fire inside the Capacitor WebView.
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))

  // Capacitor Network plugin — more reliable than navigator.onLine on
  // native (navigator.onLine can report stale "true" on iOS). Loaded
  // lazily so web builds don't hard-depend on the native bridge.
  // @ts-expect-error Capacitor global is injected at runtime on native.
  const isNative = typeof window.Capacitor !== 'undefined'
  if (isNative) {
    import('@capacitor/network')
      .then(({ Network }) => {
        Network.getStatus().then(s => setOnline(s.connected)).catch(() => {})
        Network.addListener('networkStatusChange', s => setOnline(s.connected))
      })
      .catch(() => { /* plugin missing — fall back to navigator events */ })
  }
}
initDetection()

/** React hook: re-renders when connectivity flips. */
export function useOnline(): boolean {
  const [online, setLocal] = useState(_online)
  useEffect(() => subscribeOnline(setLocal), [])
  return online
}

// ── Read cache ──────────────────────────────────────────────
const CACHE_PREFIX = 'ckcon-cache-'

interface CacheEntry<T> {
  data: T
  ts: number
}

export function cacheSet<T>(key: string, data: T): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>))
  } catch {
    // Quota exceeded or serialization failure — caching is best-effort.
  }
}

export function cacheGet<T>(key: string): { data: T; ts: number } | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    return { data: parsed.data, ts: parsed.ts }
  } catch {
    return null
  }
}

export function cacheClearAll(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    /* noop */
  }
}
