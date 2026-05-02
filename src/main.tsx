import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPush } from './lib/push'

// Best-effort init for push (no-op on web, listens for tokens on native).
void initPush()

// One-time cleanup of any leftover service workers from v1's vite-plugin-pwa.
// v2 does not register a SW; a kill-switch SW at /sw.js takes over and removes
// itself. This block is a belt-and-braces fallback.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator
    && window.location.protocol !== 'file:'
    && window.location.protocol !== 'capacitor:') {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister().catch(() => {}))
  }).catch(() => {})
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k).catch(() => {}))).catch(() => {})
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
