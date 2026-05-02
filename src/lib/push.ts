// Push notifications via Capacitor + OneSignal REST API
// Capacitor handles APNs token capture; we register the token with
// OneSignal's public /players endpoint (no auth needed) to get a
// subscription ID that DB triggers use to send pushes.

import { PushNotifications, Token } from '@capacitor/push-notifications'
import { supabase } from './supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

let initialized = false
let registrationListener: { remove: () => Promise<void> } | null = null
let errorListener: { remove: () => Promise<void> } | null = null

function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

/** Initialize push handlers. Idempotent. */
export async function initPush() {
  if (initialized) return
  if (!isNative()) return  // Web — skip silently

  try {
    // When the device gets an APNs token, register it with OneSignal.
    registrationListener = await PushNotifications.addListener('registration', (token: Token) => {
      void registerDeviceWithOneSignal(token.value)
    })

    errorListener = await PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err)
    })

    // (Tap handler — could navigate to deep link)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data as { deep_link?: string } | null | undefined
      const deepLink = data?.deep_link
      if (deepLink) {
        window.location.hash = deepLink
      }
    })

    initialized = true
  } catch (e) {
    console.error('initPush error:', e)
  }
}

/** Ask the user for notification permission and register with APNs. */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative()) return false
  try {
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return false
    await PushNotifications.register()
    return true
  } catch (e) {
    console.error('requestPushPermission error:', e)
    return false
  }
}

/** Register the iOS device token with OneSignal and persist subscription ID. */
async function registerDeviceWithOneSignal(deviceToken: string) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id

    const response = await fetch('https://onesignal.com/api/v1/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        device_type: 0,  // iOS
        identifier: deviceToken,
        ...(userId ? { external_user_id: userId } : {}),
        language: 'zh-Hant',
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('OneSignal register failed:', response.status, text)
      return
    }

    const json = await response.json() as { id?: string; success?: boolean }
    const playerId = json.id
    if (!playerId) {
      console.error('OneSignal register returned no id:', json)
      return
    }

    if (userId) {
      const { error } = await supabase
        .from('user_profiles')
        .update({ onesignal_id: playerId })
        .eq('id', userId)
      if (error) console.error('Save onesignal_id failed:', error)
    }
  } catch (e) {
    console.error('registerDeviceWithOneSignal error:', e)
  }
}

/** Called on sign-in. Triggers permission prompt + APNs registration. */
export async function pushLoginUser(_userId: string) {
  if (!isNative()) return
  await initPush()
  await requestPushPermission()
}

/** Called on sign-out. */
export async function pushLogoutUser() {
  // Capacitor PushNotifications has no explicit logout — just stop receiving.
  // We could clear onesignal_id here but leaving it lets pushes still arrive
  // if the user signs back in.
  if (registrationListener) {
    await registrationListener.remove()
    registrationListener = null
  }
  if (errorListener) {
    await errorListener.remove()
    errorListener = null
  }
  initialized = false
}
