import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, LogIn, ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/Spinner'

// /test-roles — one-tap role switch for the [TEST] 測試大廈項目 permission test rig
// (see .planning/TEST-PROGRAM.md). Logs in as a pre-seeded sandboxed account using
// the shared test password; backend RLS still applies to the logged-in account, so
// each role shows its REAL view. All 20 accounts are members of [TEST] ONLY.
// admin is intentionally EXCLUDED — an admin is not project-scoped, so it must
// never be reachable from a switcher; test the admin view via a direct login.
const TEST_PASSWORD = 'CKtest2026'

interface TestAccount {
  phone: string
  role: string
  name: string
  hint: string
}

// 4 全地盤角色 + 4 區 ×（工程師 / 管工 / 判頭 / 工人）= 20。
const TEST_ACCOUNTS: TestAccount[] = [
  { phone: '62000001', role: '項目經理 (PM)', name: '測 PM', hint: 'pm · 睇晒全部' },
  { phone: '62000002', role: '老總', name: '測 老總', hint: 'general_foreman · 睇晒全部' },
  { phone: '62000003', role: '業主', name: '測 業主', hint: 'owner · 唯讀（進度樹應空白）' },
  { phone: '62000004', role: '安全主任', name: '測 安全主任', hint: 'safety_officer · PTW 簽核' },

  { phone: '62010001', role: '一座 · 工程師', name: '一座工程師', hint: 'main_contractor · engineer' },
  { phone: '62010002', role: '一座 · 管工', name: '一座管工', hint: 'main_contractor · foreman' },
  { phone: '62010003', role: '一座 · 判頭', name: '一座判頭', hint: 'subcontractor' },
  { phone: '62010004', role: '一座 · 工人', name: '一座工人', hint: 'subcontractor_worker' },

  { phone: '62020001', role: '二座 · 工程師', name: '二座工程師', hint: 'main_contractor · engineer' },
  { phone: '62020002', role: '二座 · 管工', name: '二座管工', hint: 'main_contractor · foreman' },
  { phone: '62020003', role: '二座 · 判頭', name: '二座判頭', hint: 'subcontractor' },
  { phone: '62020004', role: '二座 · 工人', name: '二座工人', hint: 'subcontractor_worker' },

  { phone: '62030001', role: '三座 · 工程師', name: '三座工程師', hint: 'main_contractor · engineer' },
  { phone: '62030002', role: '三座 · 管工', name: '三座管工', hint: 'main_contractor · foreman' },
  { phone: '62030003', role: '三座 · 判頭', name: '三座判頭', hint: 'subcontractor' },
  { phone: '62030004', role: '三座 · 工人', name: '三座工人', hint: 'subcontractor_worker' },

  { phone: '62040001', role: '外圍 · 工程師', name: '外圍工程師', hint: 'main_contractor · engineer' },
  { phone: '62040002', role: '外圍 · 管工', name: '外圍管工', hint: 'main_contractor · foreman' },
  { phone: '62040003', role: '外圍 · 判頭', name: '外圍判頭', hint: 'subcontractor' },
  { phone: '62040004', role: '外圍 · 工人', name: '外圍工人', hint: 'subcontractor_worker' },
]

export default function TestRoleSwitch() {
  const navigate = useNavigate()
  const { signIn, profile } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loginAs(acc: TestAccount) {
    setError(null)
    setBusy(acc.phone)
    const { error } = await signIn(acc.phone, TEST_PASSWORD)
    setBusy(null)
    if (error) { setError(`${acc.role}：${error}`); return }
    navigate('/home')
  }

  return (
    <div className="min-h-screen bg-site-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="text-safety-600" size={22} />
          <h1 className="text-xl font-bold text-site-900">測試一鍵切換角色</h1>
        </div>
        <p className="text-sm text-site-500 mb-3">
          權限測試專用（[TEST] 測試大廈項目）。撳一下即以該角色登入，後端 RLS 仍按真實角色，所以你會睇到該角色實際睇到嘅嘢。
        </p>
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs">
          <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
          <span>呢 20 個測試帳號只連到 [TEST] 工地（共用密碼）。admin 唔喺度（用正常登入測試 admin）。</span>
        </div>
        {profile && (
          <p className="text-xs text-site-400 mb-3">目前登入：<span className="font-semibold text-site-700">{profile.name}</span></p>
        )}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm mb-3">{error}</div>}
        <div className="space-y-2">
          {TEST_ACCOUNTS.map(acc => (
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
        </div>
      </div>
    </div>
  )
}
