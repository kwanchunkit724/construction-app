import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initPush } from './lib/push'

// Capacitor native: wait for deviceready before init OneSignal.
// Web: deviceready never fires, but initPush is a no-op there.
document.addEventListener('deviceready', initPush, false)
// Also try immediately in case deviceready already fired or we're on web.
initPush()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
