// OneSignal push notifications setup
// Only initializes on Capacitor native (iOS/Android), no-op on web.

import OneSignal from 'onesignal-cordova-plugin'
import { supabase } from './supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

let initialized = false

function isNative(): boolean {
  // Capacitor native runs in `capacitor://` or `file://` protocol on iOS
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'capacitor:'
    || window.location.protocol === 'file:'
    || (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() === true
}

/**
 * Initialize OneSignal SDK. Idempotent. Safe to call multiple times.
 * Should be invoked once after Capacitor is ready.
 */
export function initPush() {
  if (initialized) return
  if (!isNative()) {
    // Web — push not supported on file:// preview, skip silently
    return
  }

  try {
    OneSignal.initialize(ONESIGNAL_APP_ID)
    initialized = true

    // Track subscription changes — write OneSignal subscription ID to user_profiles
    OneSignal.User.pushSubscription.addEventListener('change', (event) => {
      const id = event.current?.id ?? null
      void persistSubscriptionId(id)
    })

    // Set up tap handler — could navigate to deep link in the future
    OneSignal.Notifications.addEventListener('click', (event) => {
      const data = event.notification.additionalData as { deep_link?: string } | null | undefined
      const deepLink = data?.deep_link
      if (deepLink) {
        // HashRouter — set hash to navigate
        window.location.hash = deepLink
      }
    })
  } catch (e) {
    console.error('OneSignal init error:', e)
  }
}

/** Ask the user for notification permission (call from a user-interaction context). */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative() || !initialized) return false
  try {
    const granted = await OneSignal.Notifications.requestPermission(true)
    return granted === true
  } catch (e) {
    console.error('OneSignal requestPermission error:', e)
    return false
  }
}

/** Get current OneSignal subscription ID (the "player ID"), or null. */
export async function getSubscriptionId(): Promise<string | null> {
  if (!isNative() || !initialized) return null
  try {
    const id = await OneSignal.User.pushSubscription.getIdAsync()
    return id ?? null
  } catch (e) {
    console.error('OneSignal getSubscriptionId error:', e)
    return null
  }
}

async function persistSubscriptionId(subscriptionId: string | null) {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) return
  if (!subscriptionId) return

  await supabase
    .from('user_profiles')
    .update({ onesignal_id: subscriptionId })
    .eq('id', userId)
}

/**
 * Login a user to OneSignal (associate their OneSignal subscription
 * with their Supabase user_id) and persist the subscription ID.
 * Call after sign-in.
 */
export async function pushLoginUser(userId: string) {
  if (!isNative() || !initialized) return
  try {
    OneSignal.login(userId)
    const id = await getSubscriptionId()
    if (id) await persistSubscriptionId(id)
  } catch (e) {
    console.error('OneSignal login error:', e)
  }
}

/** Logout from OneSignal (call after sign-out). */
export async function pushLogoutUser() {
  if (!isNative() || !initialized) return
  try {
    OneSignal.logout()
  } catch (e) {
    console.error('OneSignal logout error:', e)
  }
}
