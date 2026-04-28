import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Role, PendingUser } from '../types'

const toEmail = (username: string) =>
  `${username.toLowerCase().trim()}@kwanchunkit.app`

// Map legacy role values (from old DB rows) to new 3-party system
function mapLegacyRole(r: string): Role {
  if (r === 'super-admin') return 'super-admin'
  if (r === 'owner' || r === 'site-agent' || r === 'er') return 'owner'
  if (r === 'sub-contractor' || r === 'sub-supervisor' || r === 'foreman' || r === 'worker') return 'sub-contractor'
  // pm, pe, cp, qs, doc-controller, qc, procurement, main-contractor → main-contractor
  return 'main-contractor'
}

export interface AuthUser {
  id: string
  username: string
  name: string
  role: Role
  roleZh: string
  trade: string      // job title (free text)
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

// ── Demo accounts (4 representative accounts matching Supabase) ───────────────
export const DEMO_ACCOUNTS: Array<AuthUser & { password: string }> = [
  {
    id: 'bce56d41-45aa-4cca-8a8a-fccfa8fbb0de', username: 'superadmin', password: 'Admin@2026',
    name: '系統管理員', role: 'super-admin', roleZh: '系統管理員',
    trade: 'System Administrator', company: 'System', avatar: '管', projectId: '', permissions: [],
  },
  {
    id: 'ac7f6845-6b01-4a4f-9fa8-b3f48404b080', username: 'pm.chan', password: 'Admin@2026',
    name: '陳建文', role: 'main-contractor', roleZh: '總承建商',
    trade: '項目總監', company: '關春傑工程', avatar: '陳', projectId: 'PROJ001', permissions: [],
  },
  {
    id: '0bbf0f64-a5e8-4666-a149-2a467d84c809', username: 'agent.yip', password: 'Admin@2026',
    name: '葉地盤代表', role: 'owner', roleZh: '業主',
    trade: '地盤代表', company: '業主方', avatar: '葉', projectId: 'PROJ001', permissions: [],
  },
  {
    id: 'c38697aa-fb9b-4d70-ad95-cb6bc2381cba', username: 'sub.cheung', password: 'Admin@2026',
    name: '張小督', role: 'sub-contractor', roleZh: '判頭',
    trade: '分判商現場主任', company: '華信建築', avatar: '張', projectId: 'PROJ001', permissions: [],
  },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToAuthUser(row: any): AuthUser {
  return {
    id:          row.id,
    username:    row.username,
    name:        row.name,
    role:        mapLegacyRole(row.role),
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
  const [user, setUser]                 = useState<AuthUser | null>(null)
  const [loading, setLoading]           = useState(true)
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [allUsers, setAllUsers]         = useState<AuthUser[]>([])

  const loadProfile = useCallback(async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', userId).eq('approved', true).single()
    if (error || !data) return false
    setUser(rowToAuthUser(data))
    return true
  }, [])

  const loadPendingUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles').select('*').eq('approved', false).order('created_at', { ascending: false })
    setPendingUsers((data ?? []).map(row => ({
      id: row.id, username: row.username, email: row.email ?? '',
      name: row.name, role: mapLegacyRole(row.role),
      roleZh: row.role_zh, trade: row.trade, company: row.company,
      projectId: row.project_id, requestedAt: row.created_at,
    })))
  }, [])

  const loadAllUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles').select('*').eq('approved', true).order('created_at', { ascending: true })
    setAllUsers((data ?? []).map(rowToAuthUser))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadProfile(session.user.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) await loadProfile(session.user.id)
      else if (event === 'SIGNED_OUT') setUser(null)
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

  useEffect(() => {
    if (user?.role === 'super-admin' || user?.role === 'main-contractor') {
      loadPendingUsers()
      loadAllUsers()
    }
  }, [user?.role, loadPendingUsers, loadAllUsers])

  const login = async (username: string, password: string) => {
    const email = username.includes('@') ? username.trim() : toEmail(username)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: '用戶名或密碼錯誤，請重試。' }
    return { ok: true }
  }

  const logout = async () => { await supabase.auth.signOut() }

  const register = async (data: Omit<PendingUser, 'id' | 'requestedAt'>) => {
    const email = data.email.trim().toLowerCase()
    const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password: data.password ?? '' })
    if (signUpError || !authData.user) return { ok: false, error: signUpError?.message ?? '申請失敗，請重試。' }
    if (!authData.session) {
      const { data: signInData } = await supabase.auth.signInWithPassword({ email, password: data.password ?? '' })
      if (!signInData?.session) return { ok: false, error: '請先確認電郵後再提交申請。如未收到確認電郵，請聯絡管理員關閉 Supabase 電郵驗證設定。' }
    }
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id, username: data.username.toLowerCase().trim(),
      name: data.name, role: data.role, role_zh: data.roleZh,
      trade: data.trade, company: data.company,
      avatar: data.name.slice(0, 1), project_id: data.projectId,
      approved: false, permissions: [],
    })
    if (profileError) { await supabase.auth.signOut(); return { ok: false, error: '申請失敗，請重試。' } }
    await supabase.auth.signOut()
    return { ok: true }
  }

  const approveUser = async (id: string) => {
    const pending = pendingUsers.find(p => p.id === id)
    // Default permissions by new party type
    const defaultPerms: Record<string, string[]> = {
      'owner':            ['view:all', 'view:dashboard', 'view:costs', 'view:progress', 'view:safety', 'approve:diary'],
      'main-contractor':  ['view:all', 'manage:issues', 'submit:reports', 'approve:reports', 'update:progress',
                           'view:progress', 'manage:safety', 'approve:ptw', 'reject:ptw', 'manage:drawings',
                           'view:costs', 'manage:boq', 'manage:vo', 'create:ncr', 'close:ncr', 'approve:materials'],
      'sub-contractor':   ['report:issues', 'update:progress', 'view:delegated-items', 'request:materials',
                           'submit:reports', 'view:own-tasks', 'create:safety-obs'],
      'super-admin':      [],
    }
    const role = pending ? mapLegacyRole(pending.role as string) : 'sub-contractor'
    await supabase.from('profiles').update({
      approved: true, permissions: defaultPerms[role] ?? [],
    }).eq('id', id)
    await loadPendingUsers()
    await loadAllUsers()
  }

  const rejectUser = async (id: string) => {
    await supabase.from('profiles').delete().eq('id', id)
    await loadPendingUsers()
  }

  const updateUserPermissions = async (userId: string, permissions: string[]) => {
    await supabase.from('profiles').update({ permissions }).eq('id', userId)
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions } : u))
    if (user?.id === userId) setUser(prev => prev ? { ...prev, permissions } : null)
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
