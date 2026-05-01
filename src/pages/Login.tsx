import { FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { HardHat } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isValidHKPhone, normalizePhone } from '../lib/phone'
import { Spinner } from '../components/Spinner'

export default function Login() {
  const { session, signIn } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/home" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!isValidHKPhone(phone)) {
      setError('請輸入有效的 8 位香港手機號碼')
      return
    }
    setSubmitting(true)
    const { error } = await signIn(normalizePhone(phone), password)
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <div className="min-h-screen bg-site-50 flex flex-col px-5 pt-20 pb-10">
      <div className="max-w-sm w-full mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-safety-500 flex items-center justify-center text-white mb-3">
            <HardHat size={32} />
          </div>
          <h1 className="text-2xl font-extrabold text-site-900">建築工程管理</h1>
          <p className="text-sm text-site-500 mt-1">登入以繼續</p>
        </div>

        <form onSubmit={onSubmit} className="card p-5 space-y-4">
          <div>
            <label className="label">手機號碼</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="9123 4567"
              className="input"
            />
          </div>
          <div>
            <label className="label">密碼</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="輸入密碼"
              className="input"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Spinner size={18} className="text-white" /> : '登入'}
          </button>
        </form>

        <p className="text-center text-sm text-site-500 mt-5">
          還未有帳號？{' '}
          <Link to="/signup" className="text-safety-600 font-semibold">立即申請</Link>
        </p>
      </div>
    </div>
  )
}
