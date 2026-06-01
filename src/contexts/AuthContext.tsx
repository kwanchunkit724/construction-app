import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { phoneToEmail, normalizePhone } from '../lib/phone'
import { pushLoginUser, pushLogoutUser, consumePendingDeepLink } from '../lib/push'
import { cacheGet, cacheSet, cacheClearAll, getOnline } from '../lib/offline'
import type { UserProfile, GlobalRole, SubRole } from '../types'

interface AuthContextType {
  loading: boolean
  session: { user_id: string } | null
  profile: UserProfile | null
  signUp: (input: SignUpInput) => Promise<{ error: string | null }>
  signIn: (phone: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

interface SignUpInput {
  phone: string
  password: string
  name: string
  global_role: GlobalRole
  sub_role: SubRole
  company: string
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<{ user_id: string } | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      // Only trust the cached profile when actually OFFLINE — so a logged-in
      // user opening the app offline keeps their role/identity instead of
      // being bounced from gated routes. When online, a failed fetch (e.g.
      // an admin revoked the role, expired token) must NOT re-pin a stale
      // role: fall through to setProfile(null).
      if (!getOnline()) {
        const cached = cacheGet<UserProfile>(`profile:${userId}`)
        if (cached && cached.data.id === userId) {
          console.warn('Offline — using cached profile:', error.message)
          setProfile(cached.data)
          return
        }
      }
      console.error('Failed to load profile:', error)
      setProfile(null)
      return
    }
    setProfile(data as UserProfile)
    cacheSet(`profile:${userId}`, data as UserProfile)
  }

  // Drain any cold-launch deep link queued by src/lib/push.ts BEFORE the
  // HashRouter mounted. Safe to call multiple times — consumePendingDeepLink
  // returns null after the first drain. Plan 02-09 / Open Q 4.
  function drainPendingDeepLink() {
    const pending = consumePendingDeepLink()
    if (!pending) return
    const link = pending.startsWith('#/')
      ? pending
      : (pending.startsWith('/') ? '#' + pending : '#/' + pending)
    try { window.location.hash = link } catch { /* noop */ }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) {
        setSession({ user_id: user.id })
        loadProfile(user.id).finally(() => {
          setLoading(false)
          drainPendingDeepLink()
        })
        // Best-effort: associate OneSignal subscription with this user
        void pushLoginUser(user.id)
      } else {
        setLoading(false)
        drainPendingDeepLink()
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      const user = sess?.user
      if (user) {
        setSession({ user_id: user.id })
        loadProfile(user.id)
        // Only run push registration on actual sign-in, not on every token refresh.
        if (event === 'SIGNED_IN') {
          void pushLoginUser(user.id)
        }
      } else {
        setSession(null)
        setProfile(null)
        // pushLogoutUser is called from signOut() before the auth state changes,
        // so we don't need to call it here again.
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signUp(input: SignUpInput): Promise<{ error: string | null }> {
    const phone = normalizePhone(input.phone)
    const email = phoneToEmail(phone)

    // Pre-check duplicate phone to avoid creating an orphan auth.users
    // row that would block re-registration.
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()
    if (existing) {
      return { error: '此手機號碼已註冊。請改用登入。' }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
    })
    if (error) return { error: error.message }
    if (!data.user) return { error: '註冊失敗' }

    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: data.user.id,
      phone,
      name: input.name,
      global_role: input.global_role,
      sub_role: input.sub_role,
      company: input.company || null,
    })
    if (profileError) {
      // Rollback: sign out so the orphan auth.users row at least doesn't
      // leave the user "logged in" without a profile. (We can't delete
      // the auth.users row from the client; admin needs to clean up.)
      console.error('signUp profile insert failed:', profileError)
      await supabase.auth.signOut().catch(() => {})
      return { error: `資料儲存失敗：${profileError.message}。請聯絡管理員清理舊紀錄。` }
    }

    return { error: null }
  }

  async function signIn(phone: string, password: string): Promise<{ error: string | null }> {
    const email = phoneToEmail(phone)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: '手機號或密碼錯誤' }
    return { error: null }
  }

  async function signOut() {
    // Clear OneSignal binding BEFORE auth.signOut so we still have a
    // valid session to update user_profiles. Errors are logged, not
    // surfaced — sign-out should always succeed.
    await pushLogoutUser().catch(() => {})
    await supabase.auth.signOut()
    // Drop all cached reads (profile + data) so the next user on a shared
    // device never sees the previous user's offline data.
    cacheClearAll()
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user_id)
  }

  return (
    <AuthContext.Provider value={{ loading, session, profile, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
