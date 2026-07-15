// Push notifications via Capacitor + OneSignal REST API
// Capacitor captures the native push token (APNs on iOS, FCM on Android);
// we register it with OneSignal v1 /players keyed by external_user_id =
// Supabase user_id, picking device_type=0 (iOS) or 1 (Android).
// DB triggers send pushes targeting external_id (no need to track player IDs).

import { PushNotifications, Token } from '@capacitor/push-notifications'
import { supabase } from './supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

let initialized = false

// Open Q 4 (Plan 02-09) — cold-launch deep-link race.
// When iOS/Android launches the app from a push notification, Capacitor
// delivers the notification BEFORE React Router's HashRouter has mounted.
// Writing window.location.hash that early gets clobbered by router init.
// We queue the deep link here and let AuthContext drain it once the
// session bootstrap completes (loading=false).
let _pendingDeepLink: string | null = null

function normaliseToHash(link: string): string {
  // Reject any link that contains a scheme/host (defence against malicious
  // deep_link payloads pointing at external URLs). Only in-app paths allowed.
  if (/^[a-z]+:\/\//i.test(link)) return '#/home'
  if (link.startsWith('#/')) return link
  if (link.startsWith('#')) return '#/' + link.slice(1).replace(/^\/+/, '')
  if (link.startsWith('/')) return '#' + link
  return '#/' + link
}

function applyDeepLink(link: string) {
  const target = normaliseToHash(link)
  _pendingDeepLink = target
  try { window.location.hash = target } catch {
    // Ignore — drain helper will retry post-mount.
  }
}

/**
 * Drains and returns the most recent queued deep link (or null).
 * AuthContext.bootstrap calls this AFTER setLoading(false) so the
 * HashRouter is guaranteed to be ready to consume the hash change.
 */
export function consumePendingDeepLink(): string | null {
  const link = _pendingDeepLink
  _pendingDeepLink = null
  return link
}

function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

/** Returns 'ios' | 'android' | 'web'. Used to pick OneSignal device_type. */
function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  const p = cap?.getPlatform?.()
  if (p === 'ios' || p === 'android') return p
  return 'web'
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
      if (!deepLink) return
      // Queue + best-effort write. AuthContext.bootstrap re-applies it once
      // the router has mounted (cold-launch race — Plan 02-09 / Open Q 4).
      applyDeepLink(deepLink)
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

    // OneSignal device_type: 0 = iOS APNs, 1 = Android FCM
    const platform = getPlatform()
    const deviceType = platform === 'android' ? 1 : 0

    const body = {
      app_id: ONESIGNAL_APP_ID,
      device_type: deviceType,
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
      return
    }

    let playerId: string | undefined
    try {
      const json = JSON.parse(text) as { id?: string }
      playerId = json.id
    } catch {
      console.error('[push] OneSignal returned non-JSON:', text)
    }

    // Only persist a valid OneSignal player ID. Errors stay in console.
    if (playerId) {
      await supabase
        .from('user_profiles')
        .update({ onesignal_id: playerId })
        .eq('id', userId)
    }
  } catch (e) {
    console.error('[push] registerDeviceWithOneSignal error:', e)
  }
}

/** Called on sign-in. Triggers permission + APNs registration. */
export async function pushLoginUser(_userId: string) {
  if (!isNative()) return
  await initPush()
  await requestPushPermission()
}

/**
 * Called on sign-out. Clears onesignal_id from user_profiles so the
 * shared device can't receive pushes for this user anymore. The actual
 * iOS APNs subscription stays — next user's login re-registers a new
 * OneSignal player and stores its ID under their own profile.
 */
export async function pushLogoutUser() {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (userId) {
      await supabase
        .from('user_profiles')
        .update({ onesignal_id: null })
        .eq('id', userId)
    }
  } catch (e) {
    console.error('[push] pushLogoutUser error:', e)
  }
}
