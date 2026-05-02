// Push notifications via Capacitor + OneSignal REST API
// Capacitor captures the iOS APNs token; we register the token with
// OneSignal v1 /players keyed by external_user_id = Supabase user_id.
// DB triggers send pushes targeting external_id (no need to track player IDs).

import { PushNotifications, Token } from '@capacitor/push-notifications'
import { supabase } from './supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

let initialized = false

function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

/** Initialize push handlers. Idempotent. */
export async function initPush() {
  if (initialized) return
  if (!isNative()) return

  try {
    await PushNotifications.addListener('registration', (token: Token) => {
      void registerDeviceWithOneSignal(token.value)
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registrationError:', err)
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as { deep_link?: string } | null | undefined
      const deepLink = data?.deep_link
      if (deepLink) window.location.hash = deepLink
    })

    initialized = true
  } catch (e) {
    console.error('[push] initPush error:', e)
  }
}

/** Ask user for permission and register with APNs. Returns granted. */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return false
    await PushNotifications.register()
    return true
  } catch (e) {
    console.error('[push] requestPushPermission error:', e)
    return false
  }
}

/** Register an iOS APNs token with OneSignal, keyed by external user id. */
async function registerDeviceWithOneSignal(deviceToken: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      console.warn('[push] register: no session, skipping OneSignal register')
      return
    }

    const body = {
      app_id: ONESIGNAL_APP_ID,
      device_type: 0, // iOS
      identifier: deviceToken,
      external_user_id: userId,
      language: 'zh-Hant',
    }

    const response = await fetch('https://onesignal.com/api/v1/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    if (!response.ok) {
      console.error('[push] OneSignal register failed:', response.status, text)
      // Mark error in user_profiles for visibility
      await supabase
        .from('user_profiles')
        .update({ onesignal_id: `ERROR ${response.status}: ${text.slice(0, 80)}` })
        .eq('id', userId)
      return
    }

    let playerId: string | undefined
    try {
      const json = JSON.parse(text) as { id?: string }
      playerId = json.id
    } catch {
      console.error('[push] OneSignal returned non-JSON:', text)
    }

    // Mark this device's player_id (informational); triggers route by external_user_id
    await supabase
      .from('user_profiles')
      .update({ onesignal_id: playerId ?? `OK no-id: ${text.slice(0, 80)}` })
      .eq('id', userId)
  } catch (e) {
    console.error('[push] registerDeviceWithOneSignal error:', e)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (userId) {
        await supabase
          .from('user_profiles')
          .update({ onesignal_id: `EXCEPTION: ${(e as Error)?.message?.slice(0, 100) ?? 'unknown'}` })
          .eq('id', userId)
      }
    } catch { /* ignore */ }
  }
}

/** Called on sign-in. Triggers permission + APNs registration. */
export async function pushLoginUser(_userId: string) {
  if (!isNative()) return
  await initPush()
  await requestPushPermission()
}

/** Called on sign-out. (No-op for now.) */
export async function pushLogoutUser() {
  // Native push permission is per-device, not per-user.
  // Leaving init in place lets re-login pick up tokens.
}
