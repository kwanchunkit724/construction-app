import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, HardHat, LogIn, Building2, Shield, Wrench, UserCheck, BarChart3, ChevronRight, Hammer, UserPlus, CheckCircle } from 'lucide-react'
import { useAuth, DEMO_ACCOUNTS } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import type { Role } from '../types'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'pm', label: '項目總監' },
  { value: 'pe', label: '工程師' },
  { value: 'cp', label: '安全主任' },
  { value: 'foreman', label: '工頭' },
  { value: 'worker', label: '工人' },
  { value: 'sub-supervisor', label: '判頭打理' },
  { value: 'qs', label: '工料測量師' },
  { value: 'site-agent', label: '地盤主任' },
  { value: 'doc-controller', label: '文件控制員' },
  { value: 'qc', label: '質量檢查員' },
  { value: 'procurement', label: '採購主任' },
  { value: 'er', label: '客戶代表' },
]

const ROLE_META: Record<Role, { icon: React.ElementType; color: string; bg: string; gradient: string }> = {
  'super-admin':    { icon: Shield,    color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-200',       gradient: 'from-rose-600 to-rose-800' },
  pm:               { icon: BarChart3, color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',      gradient: 'from-blue-600 to-blue-800' },
  pe:               { icon: Wrench,    color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', gradient: 'from-emerald-600 to-emerald-800' },
  cp:               { icon: Shield,    color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200',   gradient: 'from-orange-500 to-red-600' },
  foreman:          { icon: HardHat,   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     gradient: 'from-amber-500 to-amber-700' },
  worker:           { icon: UserCheck, color: 'text-green-600',   bg: 'bg-green-50 border-green-200',     gradient: 'from-green-600 to-green-800' },
  'sub-supervisor': { icon: Hammer,    color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-200',   gradient: 'from-purple-600 to-purple-800' },
  qs:               { icon: BarChart3, color: 'text-teal-600',    bg: 'bg-teal-50 border-teal-200',       gradient: 'from-teal-600 to-teal-800' },
  'site-agent':     { icon: Building2, color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200',     gradient: 'from-slate-600 to-slate-800' },
  'doc-controller': { icon: Wrench,    color: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-200',   gradient: 'from-indigo-600 to-indigo-800' },
  qc:               { icon: CheckCircle, color: 'text-cyan-600',  bg: 'bg-cyan-50 border-cyan-200',       gradient: 'from-cyan-600 to-cyan-800' },
  procurement:      { icon: HardHat,   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     gradient: 'from-amber-600 to-amber-800' },
  er:               { icon: UserCheck, color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       gradient: 'from-blue-700 to-blue-900' },
}

const ROLE_ROUTE: Record<Role, string> = {
  'super-admin': '/admin',
  pm: '/pm', pe: '/pe', cp: '/cp', foreman: '/foreman', worker: '/worker',
  'sub-supervisor': '/sub-supervisor',
  qs: '/qs', 'site-agent': '/site-agent', 'doc-controller': '/doc-controller',
  qc: '/qc', procurement: '/procurement', er: '/er',
}

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated, user, register } = useAuth()
  const { projects } = useProgress()

  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [shake, setShake]     = useState(false)

  // Register state
  const [regUsername, setRegUsername]   = useState('')
  const [regPassword, setRegPassword]   = useState('')
  const [regConfirm, setRegConfirm]     = useState('')
  const [regName, setRegName]           = useState('')
  const [regRole, setRegRole]           = useState<Role>('worker')
  const [regCompany, setRegCompany]     = useState('')
  const [regTrade, setRegTrade]         = useState('')
  const [regProjectId, setRegProjectId] = useState('')
  const [regEmail, setRegEmail]         = useState('')
  const [regError, setRegError]         = useState('')
  const [regSuccess, setRegSuccess]     = useState(false)

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (!regUsername.trim() || !regPassword || !regName.trim() || !regCompany.trim() || !regEmail.trim()) {
      setRegError('請填寫所有必填欄位'); return
    }
    if (!regEmail.includes('@') || !regEmail.includes('.')) {
      setRegError('請輸入有效的電郵地址'); return
    }
    if (regRole !== 'pm' && !regProjectId) {
      setRegError('請選擇所屬項目'); return
    }
    if (regPassword !== regConfirm) {
      setRegError('兩次輸入的密碼不一致'); return
    }
    if (regPassword.length < 6) {
      setRegError('密碼至少需要6位'); return
    }
    setLoading(true)
    const result = await register({
      username: regUsername.trim(),
      email: regEmail.trim(),
      password: regPassword,
      name: regName.trim(),
      role: regRole,
      roleZh: ROLE_OPTIONS.find(r => r.value === regRole)?.label ?? '',
      company: regCompany.trim(),
      trade: regTrade.trim() || regRole,
      projectId: regRole === 'pm' ? '' : regProjectId,
    })
    setLoading(false)
    if (!result.ok) { setRegError(result.error ?? '申請失敗'); return }
    setRegSuccess(true)
  }

  // If already logged in, skip to their dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(ROLE_ROUTE[user.role], { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('請輸入用戶名和密碼。')
      triggerShake()
      return
    }
    setLoading(true)
    setError('')
    const result = await login(username, password)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? '登入失敗')
      triggerShake()
    }
    // on success, the useEffect above handles redirect
  }

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const fillDemo = (uname: string, pw: string) => {
    setUsername(uname)
    setPassword(pw)
    setError('')
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-900">
      {/* ── Left panel (branding + demo accounts) ─────────────────────── */}
      <div className="lg:w-[480px] bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex flex-col relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative p-8 flex-1 flex flex-col justify-between">
          {/* Branding */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-blue-600 rounded-xl">
                <Building2 size={26} className="text-white" />
              </div>
              <div>
                <p className="text-white font-black text-lg leading-tight">Kwan Chun Kit Limited Company</p>
                <p className="text-blue-400 text-xs">Construction Management Platform</p>
              </div>
            </div>

            <h2 className="text-white text-2xl font-bold mb-1">多角色協作平台</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              整合項目總監、工程師、安全主任、工頭及工人，<br/>
              實現實時進度共享、安全管理與現場溝通。
            </p>

            {/* Feature highlights */}
            <div className="space-y-2.5 mb-8">
              {[
                { icon: '📊', text: '實時進度 S-Curve 及各區域追蹤' },
                { icon: '🛡️', text: '電子工作許可 (PTW) 及安全管理' },
                { icon: '📋', text: '數字化施工日報及圖則版本控制' },
                { icon: '📱', text: '工人友好介面：語音、拍照、一鍵 SOS' },
              ].map(f => (
                <div key={f.text} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="text-base flex-shrink-0">{f.icon}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Demo accounts */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              演示帳戶 — 點擊即可填入
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const meta = ROLE_META[acc.role]
                const Icon = meta.icon
                return (
                  <button
                    key={acc.id}
                    onClick={() => fillDemo(acc.username, acc.password)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 transition-all group text-left`}
                  >
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-semibold">{acc.name}</span>
                        <span className="text-slate-400 text-xs">{acc.roleZh}</span>
                      </div>
                      <div className="flex gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{acc.username}</span>
                        <span>/</span>
                        <span className="font-mono">{acc.password}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="p-2 bg-blue-600 rounded-xl">
              <Building2 size={22} className="text-white" />
            </div>
            <span className="font-black text-gray-800 text-lg">Kwan Chun Kit Management Platform</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
              <button onClick={() => { setMode('login'); setRegSuccess(false) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                登入
              </button>
              <button onClick={() => setMode('register')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'register' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                申請帳戶
              </button>
            </div>

            {/* ── Login form ── */}
            {mode === 'login' && (
              <>
                <div className="mb-7">
                  <h1 className="text-2xl font-black text-gray-900">登入系統</h1>
                  <p className="text-gray-400 text-sm mt-1">請輸入您的用戶名及密碼</p>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className={`space-y-5 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        用戶名 <span className="text-gray-400 font-normal">(Username)</span>
                      </label>
                      <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
                        placeholder="例：pm.lee" autoComplete="username"
                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${error ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:ring-blue-200 focus:border-blue-400'}`} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        密碼 <span className="text-gray-400 font-normal">(Password)</span>
                      </label>
                      <div className="relative">
                        <input type={showPw ? 'text' : 'password'} value={password}
                          onChange={e => { setPassword(e.target.value); setError('') }}
                          placeholder="••••••••" autoComplete="current-password"
                          className={`w-full px-4 py-3 pr-12 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${error ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:ring-blue-200 focus:border-blue-400'}`} />
                        <button type="button" onClick={() => setShowPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1" tabIndex={-1}>
                          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                        <span>⚠</span><span>{error}</span>
                      </div>
                    )}
                    <button type="submit" disabled={loading}
                      className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 transition-colors shadow-sm">
                      {loading ? (<><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>驗證中...</>) : (<><LogIn size={19} />登入</>)}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Register form ── */}
            {mode === 'register' && (
              <>
                <div className="mb-5">
                  <h1 className="text-2xl font-black text-gray-900">申請帳戶</h1>
                  <p className="text-gray-400 text-sm mt-1">申請後須由管理員審批方可登入</p>
                </div>

                {regSuccess ? (
                  <div className="text-center py-10">
                    <CheckCircle size={52} className="text-green-500 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900 text-lg">申請已提交</h3>
                    <p className="text-gray-500 text-sm mt-1">請等待管理員審批，審批後即可使用帳戶登入。</p>
                    <button onClick={() => { setMode('login'); setRegSuccess(false) }}
                      className="mt-4 text-blue-600 text-sm hover:underline">返回登入</button>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} noValidate className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">真實姓名 *</label>
                        <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="例：陳大文"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">角色 *</label>
                        <select value={regRole} onChange={e => setRegRole(e.target.value as Role)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400">
                          {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">用戶名 *</label>
                      <input value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="例：w.chan2"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">密碼 *</label>
                        <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="至少6位"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">確認密碼 *</label>
                        <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="重複輸入"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">公司名稱 *</label>
                      <input value={regCompany} onChange={e => setRegCompany(e.target.value)} placeholder="例：金輝紮鐵有限公司"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">工作電郵 *</label>
                      <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="例：w.chan@company.com"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">職位 / 工種</label>
                      <input value={regTrade} onChange={e => setRegTrade(e.target.value)} placeholder="例：鋼筋工 (選填)"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>
                    {regRole !== 'pm' && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">所屬項目 *</label>
                        <select value={regProjectId} onChange={e => setRegProjectId(e.target.value)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400">
                          <option value="">-- 請選擇項目 --</option>
                          {(projects.length > 0 ? projects : [{ id: 'PROJ001', name: 'Victoria Harbour New Shore Complex' }]).map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {regError && (
                      <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {regError}</div>
                    )}
                    <button type="submit"
                      className="w-full bg-blue-700 hover:bg-blue-800 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 mt-1">
                      <UserPlus size={16} /> 提交申請
                    </button>
                  </form>
                )}
              </>
            )}

            {/* Role permission table */}
            <div className="mt-7 pt-6 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">各角色權限一覽</p>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.filter(acc => acc.role !== 'super-admin').map(acc => {
                  const meta = ROLE_META[acc.role]
                  const Icon = meta.icon
                  const permLabels: Record<string, string[]> = {
                    'super-admin':    ['建立項目', '審批用戶', '模組設定'],
                    pm:               ['全局 Dashboard', '成本監控', '進度總表'],
                    pe:               ['日報管理', '圖則版控', '進度指派'],
                    cp:               ['PTW 審批', '安全巡查', '事故統計'],
                    foreman:          ['工序管理', '出勤打卡', '委派判頭'],
                    worker:           ['今日工作', '打卡', 'SOS 求助'],
                    'sub-supervisor': ['進度更新', '工人管理', '通訊匯報'],
                    qs:               ['工料測量', '變更令', 'BOQ 管理'],
                    'site-agent':     ['日報審批', '現場巡查', '進度確認'],
                    'doc-controller': ['圖則登記', '提交管理', '版本控制'],
                    qc:               ['NCR 發出', '質檢巡查', '合規追蹤'],
                    procurement:      ['採購申請', '供應商管理', '訂單跟進'],
                    er:               ['進度審閱', '成本查看', '竣工報告'],
                  }
                  return (
                    <div key={acc.id} className="flex items-center gap-3 text-xs">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={13} className="text-white" />
                      </div>
                      <span className="text-gray-600 font-semibold w-16 flex-shrink-0">{acc.roleZh}</span>
                      <div className="flex flex-wrap gap-1">
                        {permLabels[acc.role].map(p => (
                          <span key={p} className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${meta.bg} ${meta.color}`}>{p}</span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-center text-slate-500 text-xs mt-5">
            建築工程管理平台 v1.0 · Kwan Chun Kit Limited Company · 2026
          </p>
        </div>
      </div>
    </div>
  )
}
