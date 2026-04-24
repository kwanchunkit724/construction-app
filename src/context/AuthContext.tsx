import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Role, PendingUser } from '../types'

// ── Email convention: username@kwanchunkit.app ────────────────────────────────
const toEmail = (username: string) =>
  `${username.toLowerCase().trim()}@kwanchunkit.app`

export interface AuthUser {
  id: string
  username: string
  name: string
  role: Role
  roleZh: string
  trade: string
  company: string
  avatar: string
  permissions: string[]
  projectId: string
}

// ── All available permissions ─────────────────────────────────────────────────
export const ALL_PERMISSIONS: { key: string; label: string; group: string }[] = [
  { key: 'view:all',              label: '查看所有資訊',    group: '查看' },
  { key: 'view:dashboard',        label: '查看儀表板',      group: '查看' },
  { key: 'view:costs',            label: '查看成本',        group: '查看' },
  { key: 'view:safety',           label: '查看安全記錄',    group: '查看' },
  { key: 'view:progress',         label: '查看進度',        group: '查看' },
  { key: 'view:tasks',            label: '查看工序',        group: '查看' },
  { key: 'view:own-tasks',        label: '查看自己工序',    group: '查看' },
  { key: 'view:attendance',       label: '查看出勤',        group: '查看' },
  { key: 'view:all-zones',        label: '查看全部區域',    group: '查看' },
  { key: 'view:nearmiss',         label: '查看近乎意外',    group: '查看' },
  { key: 'view:inventory',        label: '查看庫存',        group: '查看' },
  { key: 'view:delegated-items',  label: '查看委派項目',    group: '查看' },
  { key: 'approve:reports',       label: '審批日報',        group: '審批' },
  { key: 'approve:budgets',       label: '審批預算',        group: '審批' },
  { key: 'approve:materials',     label: '審批物料',        group: '審批' },
  { key: 'approve:ptw',           label: '批准PTW',         group: '審批' },
  { key: 'approve:diary',         label: '審批施工日誌',    group: '審批' },
  { key: 'approve:valuation',     label: '審批估價',        group: '審批' },
  { key: 'reject:ptw',            label: '拒絕PTW',         group: '審批' },
  { key: 'manage:projects',       label: '管理項目',        group: '管理' },
  { key: 'manage:issues',         label: '管理問題',        group: '管理' },
  { key: 'manage:safety',         label: '管理安全',        group: '管理' },
  { key: 'manage:drawings',       label: '管理圖則',        group: '管理' },
  { key: 'manage:submittals',     label: '管理提交文件',    group: '管理' },
  { key: 'manage:boq',            label: '管理BOQ',         group: '管理' },
  { key: 'manage:vo',             label: '管理變更令',      group: '管理' },
  { key: 'manage:orders',         label: '管理訂單',        group: '管理' },
  { key: 'manage:attendance',     label: '管理出勤',        group: '管理' },
  { key: 'manage:ptw',            label: '管理PTW',         group: '管理' },
  { key: 'manage:own-workers',    label: '管理轄下工人',    group: '管理' },
  { key: 'manage:correspondence', label: '管理往來文件',    group: '管理' },
  { key: 'submit:reports',        label: '提交日報',        group: '操作' },
  { key: 'report:issues',         label: '上報問題',        group: '操作' },
  { key: 'upload:drawings',       label: '上載圖則',        group: '操作' },
  { key: 'assign:tasks',          label: '指派工序',        group: '操作' },
  { key: 'update:tasks',          label: '更新工序',        group: '操作' },
  { key: 'update:progress',       label: '更新進度',        group: '操作' },
  { key: 'request:materials',     label: '申請物料',        group: '操作' },
  { key: 'send:progress-report',  label: '發送進度報告',    group: '操作' },
  { key: 'create:safety-obs',     label: '建立安全觀察',    group: '操作' },
  { key: 'create:ncr',            label: '發出NCR',         group: '操作' },
  { key: 'close:ncr',             label: '關閉NCR',         group: '操作' },
  { key: 'create:inspection',     label: '建立質檢',        group: '操作' },
  { key: 'checkin',               label: '出勤打卡',        group: '工人' },
  { key: 'sos',                   label: 'SOS緊急求助',     group: '工人' },
]

// ── Demo accounts (UI display only — actual auth is via Supabase) ─────────────
export const DEMO_ACCOUNTS: Array<AuthUser & { password: string }> = [
  { id: 'bce56d41-45aa-4cca-8a8a-fccfa8fbb0de', username: 'superadmin',  password: 'Admin@2026', name: '系統管理員',   role: 'super-admin',    roleZh: '系統管理員',   trade: 'System Administrator',        company: 'System',          avatar: '管', projectId: '',        permissions: [] },
  { id: 'ac7f6845-6b01-4a4f-9fa8-b3f48404b080', username: 'pm.chan',      password: 'Admin@2026', name: '陳建文',       role: 'pm',             roleZh: '項目總監',     trade: 'Project Manager',             company: '關春傑工程',      avatar: '陳', projectId: 'PROJ001', permissions: [] },
  { id: '0933e255-8a73-493a-a4c2-a590215e1ad3', username: 'pe.lee',       password: 'Admin@2026', name: '李志強',       role: 'pe',             roleZh: '工程師',       trade: 'Project Engineer',            company: '關春傑工程',      avatar: '李', projectId: 'PROJ001', permissions: [] },
  { id: 'e287e880-23e9-40ae-8e02-32111ed8e03d', username: 'cp.wong',      password: 'Admin@2026', name: '黃安全',       role: 'cp',             roleZh: '安全主任',     trade: 'Competent Person (Safety)',   company: '關春傑工程',      avatar: '黃', projectId: 'PROJ001', permissions: [] },
  { id: '0499c22d-970c-41e5-be11-5f6fb47e4893', username: 'foreman.lam',  password: 'Admin@2026', name: '林工頭',       role: 'foreman',        roleZh: '工頭',         trade: 'Site Foreman',                company: '關春傑工程',      avatar: '林', projectId: 'PROJ001', permissions: [] },
  { id: '0909cf1c-c7be-4d6f-a3d6-a550596d27de', username: 'worker.ng',    password: 'Admin@2026', name: '吳大文',       role: 'worker',         roleZh: '工人',         trade: 'Steel Fixer',                 company: '金輝紮鐵',        avatar: '吳', projectId: 'PROJ001', permissions: [] },
  { id: 'c38697aa-fb9b-4d70-ad95-cb6bc2381cba', username: 'sub.cheung',   password: 'Admin@2026', name: '張小督',       role: 'sub-supervisor', roleZh: '分判督導',     trade: 'Sub-contractor Site Manager', company: '華信建築',        avatar: '張', projectId: 'PROJ001', permissions: [] },
  { id: 'b3a1d106-1705-4589-8ad6-8541bb934e78', username: 'qs.ho',        password: 'Admin@2026', name: '何量師',       role: 'qs',             roleZh: '工料測量師',   trade: 'Quantity Surveyor',           company: '關春傑工程',      avatar: '何', projectId: 'PROJ001', permissions: [] },
  { id: '0bbf0f64-a5e8-4666-a149-2a467d84c809', username: 'agent.yip',    password: 'Admin@2026', name: '葉地盤代表',   role: 'site-agent',     roleZh: '地盤代表',     trade: 'Site Agent',                  company: '業主方',          avatar: '葉', projectId: 'PROJ001', permissions: [] },
  { id: 'e4846403-7301-48f7-8526-7438e3d69efb', username: 'doc.fong',     password: 'Admin@2026', name: '方文控',       role: 'doc-controller', roleZh: '文件控制員',   trade: 'Document Controller',         company: '關春傑工程',      avatar: '方', projectId: 'PROJ001', permissions: [] },
  { id: '9eabbfc9-11ad-42b5-b70d-027faade4d9f', username: 'qc.tse',       password: 'Admin@2026', name: '謝質量',       role: 'qc',             roleZh: '質量管理員',   trade: 'QC Inspector',                company: '關春傑工程',      avatar: '謝', projectId: 'PROJ001', permissions: [] },
  { id: 'afc42808-8dea-46bb-851d-ebb0996fdd43', username: 'proc.kwok',    password: 'Admin@2026', name: '郭採購',       role: 'procurement',    roleZh: '採購員',       trade: 'Procurement Officer',         company: '關春傑工程',      avatar: '郭', projectId: 'PROJ001', permissions: [] },
  { id: 'c6588438-37ef-4e6d-8c7f-9a02505e73c5', username: 'er.wang',      password: 'Admin@2026', name: '王工程代表',   role: 'er',             roleZh: '工程代表',     trade: "Employer's Representative",   company: '業主方',          avatar: '王', projectId: 'PROJ001', permissions: [] },
]

// ── Context type ──────────────────────────────────────────────────────────────
interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  register: (data: Omit<PendingUser, 'id' | 'requestedAt'>) => Promise<{ ok: boolean; error?: string }>
  pendingUsers: PendingUser[]
  approveUser: (id: string) => Promise<void>
  rejectUser: (id: string) => Promise<void>
  allUsers: AuthUser[]
  updateUserPermissions: (userId: string, permissions: string[]) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// ── Helper: map Supabase profile row → AuthUser ───────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAuthUser(row: any): AuthUser {
  return {
    id:          row.id,
    username:    row.username,
    name:        row.name,
    role:        row.role as Role,
    roleZh:      row.role_zh,
    trade:       row.trade,
    company:     row.company,
    avatar:      row.avatar,
    permissions: row.permissions ?? [],
    projectId:   row.project_id,
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null)
  const [loading, setLoading]         = useState(true)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [allUsers, setAllUsers]       = useState<AuthUser[]>([])

  // ── Load profile for a given auth user id ──────────────────────────────────
  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('approved', true)
      .single()

    if (error || !data) return false
    setUser(rowToAuthUser(data))
    return true
  }, [])

  // ── Load pending users (for super-admin / PM) ──────────────────────────────
  const loadPendingUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('approved', false)
      .order('created_at', { ascending: false })

    setPendingUsers((data ?? []).map(row => ({
      id:          row.id,
      username:    row.username,
      email:       row.email ?? '',
      name:        row.name,
      role:        row.role as Role,
      roleZh:      row.role_zh,
      trade:       row.trade,
      company:     row.company,
      projectId:   row.project_id,
      requestedAt: row.created_at,
    })))
  }, [])

  // ── Load all approved users (for PM permission management) ─────────────────
  const loadAllUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('approved', true)
      .order('created_at', { ascending: true })

    setAllUsers((data ?? []).map(rowToAuthUser))
  }, [])

  // ── Bootstrap: check existing Supabase session ─────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await loadProfile(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [loadProfile])

  // ── Load admin data when a super-admin or PM logs in ──────────────────────
  useEffect(() => {
    if (user?.role === 'super-admin' || user?.role === 'pm') {
      loadPendingUsers()
      loadAllUsers()
    }
  }, [user?.role, loadPendingUsers, loadAllUsers])

  // ── login ──────────────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    // Accept real email directly (for newly registered users) or convert username
    const email = username.includes('@') ? username.trim() : toEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Distinguish "pending" from "wrong password"
      const { data: profile } = await supabase
        .from('profiles')
        .select('approved')
        .eq('username', username.toLowerCase().trim())
        .maybeSingle()

      if (profile && !profile.approved) {
        return { ok: false, error: '帳戶正待管理員審批，請稍候。' }
      }
      return { ok: false, error: '用戶名或密碼錯誤，請重試。' }
    }

    // Double-check approval (edge case: auth succeeded but profile not approved)
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved')
      .eq('id', data.user.id)
      .single()

    if (!profile?.approved) {
      await supabase.auth.signOut()
      return { ok: false, error: '帳戶正待管理員審批，請稍候。' }
    }

    return { ok: true }
  }

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = async () => {
    await supabase.auth.signOut()
  }

  // ── register (creates Supabase auth user + pending profile) ───────────────
  const register = async (data: Omit<PendingUser, 'id' | 'requestedAt'>) => {
    // Use the real email provided by the user (not the username@domain convention).
    // Supabase's unique-email constraint is the duplicate guard.
    const email = data.email.trim().toLowerCase()
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: data.password ?? '',
    })

    if (signUpError || !authData.user) {
      return { ok: false, error: signUpError?.message ?? '申請失敗，請重試。' }
    }

    // If Supabase requires email confirmation, signUp returns no session.
    // Sign in immediately to get a session so the profile insert passes RLS.
    if (!authData.session) {
      await supabase.auth.signInWithPassword({ email, password: data.password ?? '' })
    }

    // Insert profile (approved = false — pending admin review)
    const { error: profileError } = await supabase.from('profiles').insert({
      id:         authData.user.id,
      username:   data.username.toLowerCase().trim(),
      name:       data.name,
      role:       data.role,
      role_zh:    data.roleZh,
      trade:      data.trade,
      company:    data.company,
      avatar:     data.name.slice(0, 1),
      project_id: data.projectId,
      approved:   false,
      permissions: [],
    })

    if (profileError) {
      // Clean up the dangling auth user so the username can be retried
      await supabase.auth.signOut()
      return { ok: false, error: '申請失敗，請重試。如問題持續請聯絡管理員。' }
    }

    // Sign out immediately — cannot use app until approved
    await supabase.auth.signOut()
    return { ok: true }
  }

  // ── approveUser ────────────────────────────────────────────────────────────
  const approveUser = async (id: string) => {
    // Set default permissions based on role
    const pending = pendingUsers.find(p => p.id === id)
    const defaultPerms: Record<string, string[]> = {
      pm:               ['view:all','approve:reports','approve:budgets','view:costs','manage:issues','view:safety'],
      pe:               ['submit:reports','approve:reports','upload:drawings','assign:tasks','manage:issues','approve:materials'],
      cp:               ['approve:ptw','reject:ptw','create:safety-obs','view:nearmiss','manage:safety','view:all-zones'],
      foreman:          ['view:tasks','update:tasks','request:materials','submit:reports','manage:attendance','report:issues'],
      worker:           ['checkin','view:own-tasks','report:issues','sos'],
      'sub-supervisor': ['update:progress','manage:own-workers','report:issues','send:progress-report','view:delegated-items'],
      qs:               ['view:costs','manage:boq','manage:vo','approve:valuation'],
      'site-agent':     ['view:all','approve:diary','manage:ptw','view:attendance'],
      'doc-controller': ['manage:drawings','manage:submittals','manage:correspondence'],
      qc:               ['create:ncr','close:ncr','create:inspection','view:all-zones'],
      procurement:      ['approve:materials','manage:orders','view:inventory'],
      er:               ['view:dashboard','view:progress','view:safety'],
    }

    await supabase.from('profiles').update({
      approved:    true,
      permissions: pending ? (defaultPerms[pending.role] ?? []) : [],
    }).eq('id', id)

    await loadPendingUsers()
    await loadAllUsers()
  }

  // ── rejectUser ─────────────────────────────────────────────────────────────
  const rejectUser = async (id: string) => {
    await supabase.from('profiles').delete().eq('id', id)
    await loadPendingUsers()
  }

  // ── updateUserPermissions ──────────────────────────────────────────────────
  const updateUserPermissions = async (userId: string, permissions: string[]) => {
    await supabase.from('profiles').update({ permissions }).eq('id', userId)

    // Update local state
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions } : u))

    // If this is the current user, update their session too
    if (user?.id === userId) {
      setUser(prev => prev ? { ...prev, permissions } : null)
    }
  }

  return (
    <AuthContext.Provider value={{
      user, loading, isAuthenticated: !!user,
      login, logout, register,
      pendingUsers, approveUser, rejectUser,
      allUsers, updateUserPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
