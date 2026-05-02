// ─────────────────────────────────────────────────────────────
// Kill-switch service worker
// v1 of this app used vite-plugin-pwa which registered a SW that
// aggressively cached assets. v2 disabled PWA, but browsers that
// loaded v1 still have the old SW active and intercepting requests.
// This SW takes over the registration, then unregisters itself and
// clears all caches, forcing a clean reload to v2.
// ─────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach(c => c.navigate(c.url))
    } catch (e) {
      // best-effort cleanup; swallow errors so we don't block activation
    }
  })())
})

// Pass-through fetch — never intercept anything.
self.addEventListener('fetch', () => {})
