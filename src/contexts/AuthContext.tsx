import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { phoneToEmail, normalizePhone } from '../lib/phone'
import { pushLoginUser, pushLogoutUser, requestPushPermission } from '../lib/push'
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
      console.error('Failed to load profile:', error)
      setProfile(null)
      return
    }
    setProfile(data as UserProfile)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) {
        setSession({ user_id: user.id })
        loadProfile(user.id).finally(() => setLoading(false))
        // Best-effort: associate OneSignal subscription with this user
        void pushLoginUser(user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      const user = sess?.user
      if (user) {
        setSession({ user_id: user.id })
        loadProfile(user.id)
        if (event === 'SIGNED_IN') {
          // Ask for push permission on first sign-in (no-op on web)
          void requestPushPermission().then(() => pushLoginUser(user.id))
        } else {
          void pushLoginUser(user.id)
        }
      } else {
        setSession(null)
        setProfile(null)
        if (event === 'SIGNED_OUT') void pushLogoutUser()
      }
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signUp(input: SignUpInput): Promise<{ error: string | null }> {
    const phone = normalizePhone(input.phone)
    const email = phoneToEmail(phone)

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
      console.error(profileError)
      return { error: `資料儲存失敗：${profileError.message}` }
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
    await supabase.auth.signOut()
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
