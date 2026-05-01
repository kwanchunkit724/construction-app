import { LogOut } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'

export default function Profile() {
  const { profile, signOut } = useAuth()
  if (!profile) return null

  const initial = profile.name.slice(0, 1)

  return (
    <AppLayout title="個人">
      <div className="card p-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-safety-500 text-white flex items-center justify-center text-2xl font-bold mb-3">
          {initial}
        </div>
        <p className="text-xl font-bold text-site-900">{profile.name}</p>
        <p className="text-sm text-site-500 mt-1">
          {ROLE_ZH[profile.global_role]}
          {profile.sub_role && ` · ${SUB_ROLE_ZH[profile.sub_role]}`}
        </p>
      </div>

      <div className="card mt-3 divide-y divide-site-100">
        <Row label="手機號碼" value={profile.phone} />
        <Row label="公司" value={profile.company || '—'} />
        <Row label="加入時間" value={new Date(profile.created_at).toLocaleDateString('zh-HK')} />
      </div>

      <button
        onClick={signOut}
        className="mt-5 w-full flex items-center justify-center gap-2 text-red-600 bg-white border border-red-200 hover:bg-red-50 font-semibold rounded-xl py-3"
      >
        <LogOut size={18} /> 登出
      </button>
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-5 py-3">
      <span className="text-sm text-site-500">{label}</span>
      <span className="text-sm text-site-900 font-medium">{value}</span>
    </div>
  )
}
