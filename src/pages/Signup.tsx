import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { HardHat } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isValidHKPhone, normalizePhone } from '../lib/phone'
import { Spinner } from '../components/Spinner'
import { GlobalRole, SubRole, ROLE_ZH, SUB_ROLE_ZH } from '../types'

const SIGNUP_ROLES: { value: GlobalRole; label: string }[] = [
  { value: 'pm', label: ROLE_ZH.pm },
  { value: 'main_contractor', label: ROLE_ZH.main_contractor },
  { value: 'subcontractor', label: ROLE_ZH.subcontractor },
  { value: 'subcontractor_worker', label: ROLE_ZH.subcontractor_worker },
  { value: 'owner', label: ROLE_ZH.owner },
]

export default function Signup() {
  const navigate = useNavigate()
  const { session, signUp } = useAuth()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [globalRole, setGlobalRole] = useState<GlobalRole>('main_contractor')
  const [subRole, setSubRole] = useState<SubRole>(null)
  const [company, setCompany] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/home" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!isValidHKPhone(phone)) return setError('請輸入有效的 8 位香港手機號碼')
    if (!name.trim()) return setError('請輸入姓名')
    if (password.length < 6) return setError('密碼至少 6 個字符')
    if (password !== password2) return setError('兩次密碼不一致')
    if (globalRole === 'main_contractor' && !subRole) return setError('請選擇職位')

    setSubmitting(true)
    const { error } = await signUp({
      phone: normalizePhone(phone),
      password,
      name: name.trim(),
      global_role: globalRole,
      sub_role: globalRole === 'main_contractor' ? subRole : null,
      company: company.trim(),
    })
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      navigate('/home', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-site-50 flex flex-col px-5 pt-12 pb-10">
      <div className="max-w-sm w-full mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-safety-500 flex items-center justify-center text-white mb-3">
            <HardHat size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-site-900">申請帳號</h1>
          <p className="text-sm text-site-500 mt-1">註冊後再申請加入工地</p>
        </div>

        <form onSubmit={onSubmit} className="card p-5 space-y-4">
          <div>
            <label className="label">姓名 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="陳大文" className="input" />
          </div>

          <div>
            <label className="label">手機號碼 *</label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9123 4567"
              className="input"
            />
          </div>

          <div>
            <label className="label">職位類別 *</label>
            <div className="grid grid-cols-1 gap-2">
              {SIGNUP_ROLES.map(r => (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => { setGlobalRole(r.value); if (r.value !== 'main_contractor') setSubRole(null) }}
                  className={`text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                    globalRole === r.value
                      ? 'border-safety-500 bg-safety-50 text-safety-700 font-semibold'
                      : 'border-site-200 bg-white text-site-700 hover:border-site-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {globalRole === 'main_contractor' && (
            <div>
              <label className="label">職位 *</label>
              <div className="grid grid-cols-3 gap-2">
                {(['engineer', 'foreman', 'safety'] as const).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setSubRole(s)}
                    className={`px-2 py-2.5 rounded-xl border-2 text-sm transition-colors ${
                      subRole === s
                        ? 'border-safety-500 bg-safety-50 text-safety-700 font-semibold'
                        : 'border-site-200 bg-white text-site-700 hover:border-site-300'
                    }`}
                  >
                    {SUB_ROLE_ZH[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">公司名稱</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="例如：關春傑工程有限公司" className="input" />
          </div>

          <div>
            <label className="label">密碼 *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 個字符" className="input" />
          </div>

          <div>
            <label className="label">確認密碼 *</label>
            <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="再次輸入密碼" className="input" />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Spinner size={18} className="text-white" /> : '註冊'}
          </button>
        </form>

        <p className="text-center text-sm text-site-500 mt-5">
          已有帳號？{' '}
          <Link to="/login" className="text-safety-600 font-semibold">登入</Link>
        </p>
      </div>
    </div>
  )
}
