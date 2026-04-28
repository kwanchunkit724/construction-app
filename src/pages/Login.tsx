import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Building2, LogIn, Shield, HardHat, Wrench, UserPlus, CheckCircle, ChevronRight } from 'lucide-react'
import { useAuth, DEMO_ACCOUNTS } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import type { Role } from '../types'

const PARTY_OPTIONS: { value: Role; label: string; desc: string }[] = [
  { value: 'owner',            label: '業主',     desc: '發展商 / 業主代表 / 工程師代表' },
  { value: 'main-contractor',  label: '總承建商', desc: '主承建商旗下人員（PM / PE / QS 等）' },
  { value: 'sub-contractor',   label: '判頭',     desc: '分判商 / 判頭 / 地盤工人' },
]

const PARTY_META: Record<Role, { icon: React.ElementType; gradient: string; bg: string; color: string }> = {
  'super-admin':    { icon: Shield,    gradient: 'from-rose-600 to-rose-800',   bg: 'bg-rose-50 border-rose-200',   color: 'text-rose-600' },
  'owner':          { icon: Building2, gradient: 'from-blue-600 to-blue-800',   bg: 'bg-blue-50 border-blue-200',   color: 'text-blue-600' },
  'main-contractor':{ icon: HardHat,   gradient: 'from-amber-500 to-amber-700', bg: 'bg-amber-50 border-amber-200', color: 'text-amber-600' },
  'sub-contractor': { icon: Wrench,    gradient: 'from-green-600 to-green-800', bg: 'bg-green-50 border-green-200', color: 'text-green-600' },
}

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated, user, register } = useAuth()
  const { projects } = useProgress()

  const [mode, setMode] = useState<'login' | 'register'>('login')

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [shake, setShake]       = useState(false)

  // Register state
  const [regName, setRegName]           = useState('')
  const [regParty, setRegParty]         = useState<Role>('main-contractor')
  const [regTitle, setRegTitle]         = useState('')
  const [regUsername, setRegUsername]   = useState('')
  const [regPassword, setRegPassword]   = useState('')
  const [regConfirm, setRegConfirm]     = useState('')
  const [regCompany, setRegCompany]     = useState('')
  const [regEmail, setRegEmail]         = useState('')
  const [regProjectId, setRegProjectId] = useState('')
  const [regError, setRegError]         = useState('')
  const [regSuccess, setRegSuccess]     = useState(false)

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.role === 'super-admin' ? '/admin' : '/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) { setError('請輸入用戶名和密碼。'); triggerShake(); return }
    setLoading(true); setError('')
    const result = await login(username, password)
    setLoading(false)
    if (!result.ok) { setError(result.error ?? '登入失敗'); triggerShake() }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (!regUsername.trim() || !regPassword || !regName.trim() || !regCompany.trim() || !regEmail.trim()) {
      setRegError('請填寫所有必填欄位'); return
    }
    if (!regEmail.includes('@') || !regEmail.includes('.')) { setRegError('請輸入有效的電郵地址'); return }
    if (!regProjectId) { setRegError('請選擇所屬項目'); return }
    if (regPassword !== regConfirm) { setRegError('兩次輸入的密碼不一致'); return }
    if (regPassword.length < 6) { setRegError('密碼至少需要6位'); return }
    setLoading(true)
    const partyZh = PARTY_OPTIONS.find(p => p.value === regParty)?.label ?? ''
    const result = await register({
      username: regUsername.trim(), email: regEmail.trim(), password: regPassword,
      name: regName.trim(), role: regParty, roleZh: partyZh,
      company: regCompany.trim(), trade: regTitle.trim() || partyZh,
      projectId: regProjectId,
    })
    setLoading(false)
    if (!result.ok) { setRegError(result.error ?? '申請失敗'); return }
    setRegSuccess(true)
  }

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500) }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-900">
      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <div className="lg:w-[440px] bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%">
            <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
            </pattern></defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative p-8 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2.5 bg-blue-600 rounded-xl">
                <Building2 size={26} className="text-white" />
              </div>
              <div>
                <p className="text-white font-black text-lg leading-tight">Kwan Chun Kit Limited</p>
                <p className="text-blue-400 text-xs">Construction Management Platform</p>
              </div>
            </div>

            <h2 className="text-white text-2xl font-bold mb-2">三方協作平台</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              業主、總承建商、判頭三方共用一個平台，<br/>
              由管理員靈活分配每位用戶的功能權限。
            </p>

            {/* 3 parties visual */}
            <div className="space-y-3 mb-8">
              {PARTY_OPTIONS.map(p => {
                const meta = PARTY_META[p.value]
                const Icon = meta.icon
                return (
                  <div key={p.value} className="flex items-center gap-3 text-sm">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.gradient} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={15} className="text-white" />
                    </div>
                    <div>
                      <span className="text-white font-semibold">{p.label}</span>
                      <span className="text-slate-400 text-xs ml-2">{p.desc}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1.5 mb-6">
              {[
                { icon: '📊', text: '進度 S-Curve、WBS 進度樹、里程碑' },
                { icon: '🛡️', text: '電子PTW、安全觀察、工具箱會議' },
                { icon: '📋', text: '施工日誌、NCR、BOQ、變更令' },
                { icon: '📄', text: '圖則版控、提交文件、物料申請' },
              ].map(f => (
                <div key={f.text} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="flex-shrink-0">{f.icon}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Demo accounts */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">演示帳戶 — 點擊填入</p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map(acc => {
                const meta = PARTY_META[acc.role]
                const Icon = meta.icon
                return (
                  <button key={acc.id} onClick={() => { setUsername(acc.username); setPassword(acc.password); setError('') }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 transition-all group text-left">
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

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="p-2 bg-blue-600 rounded-xl"><Building2 size={22} className="text-white" /></div>
            <span className="font-black text-gray-800 text-lg">Kwan Chun Kit Management</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
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

            {/* ── Login ── */}
            {mode === 'login' && (
              <>
                <div className="mb-7">
                  <h1 className="text-2xl font-black text-gray-900">登入系統</h1>
                  <p className="text-gray-400 text-sm mt-1">輸入用戶名或電郵及密碼</p>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className={`space-y-5 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">用戶名 / 電郵</label>
                      <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
                        placeholder="輸入用戶名或電郵" autoComplete="username"
                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${error ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:ring-blue-200 focus:border-blue-400'}`} />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">密碼</label>
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
                      {loading
                        ? <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>驗證中...</>
                        : <><LogIn size={19} />登入</>}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Register ── */}
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
                    <p className="text-gray-500 text-sm mt-1">請等待管理員審批。</p>
                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-left">
                      <p className="text-blue-800 text-xs font-semibold mb-1">審批通過後登入方法：</p>
                      <p className="text-blue-700 text-xs">在登入欄輸入您的電郵地址</p>
                      <p className="text-blue-900 text-sm font-mono font-bold mt-1 break-all">{regEmail}</p>
                    </div>
                    <button onClick={() => { setMode('login'); setRegSuccess(false) }}
                      className="mt-4 text-blue-600 text-sm hover:underline">返回登入</button>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} noValidate className="space-y-3">
                    {/* Party selector */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">所屬方 *</label>
                      <div className="grid grid-cols-3 gap-2">
                        {PARTY_OPTIONS.map(p => {
                          const meta = PARTY_META[p.value]
                          const Icon = meta.icon
                          const on = regParty === p.value
                          return (
                            <button key={p.value} type="button" onClick={() => setRegParty(p.value)}
                              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${on ? `${meta.bg} ${meta.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                              <Icon size={18} />
                              {p.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">真實姓名 *</label>
                        <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="例：陳大文"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">職位 / 工種</label>
                        <input value={regTitle} onChange={e => setRegTitle(e.target.value)} placeholder="例：項目總監"
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">公司名稱 *</label>
                      <input value={regCompany} onChange={e => setRegCompany(e.target.value)} placeholder="例：金輝紮鐵有限公司"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>

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

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">用戶名 *</label>
                      <input value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="例：w.chan2"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">工作電郵 *</label>
                      <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="例：w.chan@company.com"
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

                    {regError && (
                      <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠ {regError}</div>
                    )}
                    <button type="submit" disabled={loading}
                      className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 mt-1">
                      <UserPlus size={16} /> 提交申請
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
          <p className="text-center text-slate-500 text-xs mt-5">
            建築工程管理平台 v2.0 · Kwan Chun Kit Limited · 2026
          </p>
        </div>
      </div>
    </div>
  )
}
