import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, LogIn, ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/Spinner'

// 開發 / Demo 一鍵切換角色 (item #13). Logs in as a pre-seeded demo account for each
// role using a shared demo password, so a developer / sales demo can see every
// role's REAL view (backend RLS still applies to the logged-in account) without
// re-typing credentials. The demo accounts only belong to [DEMO] projects.
const DEMO_PASSWORD = 'CKdemo2026'

interface DemoAccount {
  phone: string
  role: string
  name: string
  hint: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { phone: '60000099', role: '系統管理員', name: '測試管理員', hint: 'admin · 全部工地' },
  { phone: '60001001', role: '項目經理 (PM)', name: '李 PM', hint: 'pm' },
  { phone: '60001002', role: '老總', name: '王老總', hint: 'general_foreman' },
  { phone: '60001003', role: '工程師', name: '陳工程師', hint: 'main_contractor · engineer' },
  { phone: '60001004', role: '管工 / 科文', name: '黃管工', hint: 'main_contractor · foreman' },
  { phone: '60001005', role: '判頭', name: '何判頭', hint: 'subcontractor' },
  { phone: '60001006', role: '判頭工人', name: '測試工人', hint: 'subcontractor_worker' },
  { phone: '60000004', role: '安全主任', name: '測試安全主任', hint: 'safety_officer' },
]

export default function RoleSwitch() {
  const navigate = useNavigate()
  const { signIn, profile } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loginAs(acc: DemoAccount) {
    setError(null)
    setBusy(acc.phone)
    const { error } = await signIn(acc.phone, DEMO_PASSWORD)
    setBusy(null)
    if (error) { setError(`${acc.role}：${error}`); return }
    navigate('/home')
  }

  return (
    <div className="min-h-screen bg-site-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Users className="text-safety-600" size={22} />
          <h1 className="text-xl font-bold text-site-900">一鍵切換角色</h1>
        </div>
        <p className="text-sm text-site-500 mb-3">
          開發 / Demo 專用 — 撳一下即以該角色登入，唔使重新打密碼。後端 RLS 仍按真實登入角色，所以你會睇到該角色實際睇到嘅資料。
        </p>
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs">
          <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
          <span>呢頁以共用 demo 密碼登入測試帳號（只連到 [DEMO] 工地）。正式用戶請用正常登入。</span>
        </div>
        {profile && (
          <p className="text-xs text-site-400 mb-3">目前登入：<span className="font-semibold text-site-700">{profile.name}</span></p>
        )}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">{error}</div>}
        <div className="space-y-2">
          {DEMO_ACCOUNTS.map(acc => (
            <button
              key={acc.phone}
              onClick={() => loginAs(acc)}
              disabled={!!busy}
              className="card w-full p-4 flex items-center gap-3 hover:bg-site-50 transition-colors text-left min-h-[44px] disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-xl bg-safety-100 text-safety-700 flex items-center justify-center flex-shrink-0 font-bold">
                {acc.role.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-site-900">{acc.role}</p>
                <p className="text-xs text-site-500 mt-0.5">{acc.name} · {acc.hint}</p>
              </div>
              {busy === acc.phone ? <Spinner size={18} /> : <LogIn size={18} className="text-site-300 flex-shrink-0" />}
            </button>
          ))}
          <div className="card w-full p-4 flex items-center gap-3 opacity-50 min-h-[44px]">
            <div className="w-11 h-11 rounded-xl bg-site-100 text-site-400 flex items-center justify-center flex-shrink-0 font-bold">業</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-site-600">業主</p>
              <p className="text-xs text-site-400 mt-0.5">未設定 demo 帳號（可補）</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
