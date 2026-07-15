import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

// Online/offline detection.
// - Native (iOS/Android): @capacitor/network plugin
// - Web: browser `navigator.onLine` + window online/offline events
//
// PTW state-changing actions (submit, approve, close-out, sign) should be
// gated on this — server-side RPCs will fail with timeouts otherwise.

export function useIsOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    let cleanup: (() => void) | undefined

    if (Capacitor.isNativePlatform()) {
      // Dynamic import — avoids bundling the plugin shim into web entry chunk.
      let handle: { remove: () => void } | undefined
      ;(async () => {
        const { Network } = await import('@capacitor/network')
        const status = await Network.getStatus()
        setOnline(status.connected)
        handle = await Network.addListener('networkStatusChange', (s) => {
          setOnline(s.connected)
        })
      })().catch(() => { /* noop — fall back to navigator.onLine */ })
      cleanup = () => { handle?.remove() }
    } else {
      const on = () => setOnline(true)
      const off = () => setOnline(false)
      window.addEventListener('online', on)
      window.addEventListener('offline', off)
      cleanup = () => {
        window.removeEventListener('online', on)
        window.removeEventListener('offline', off)
      }
    }

    return cleanup
  }, [])

  return online
}
