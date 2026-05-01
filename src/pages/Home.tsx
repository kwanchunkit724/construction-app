import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'

export default function Home() {
  const { profile } = useAuth()

  return (
    <AppLayout title="首頁">
      <div className="card p-5">
        <p className="text-xs text-site-400 uppercase tracking-wide">歡迎</p>
        <h2 className="text-2xl font-extrabold text-site-900 mt-1">{profile?.name}</h2>
        <p className="text-sm text-site-500 mt-1">
          {profile && ROLE_ZH[profile.global_role]}
          {profile?.sub_role && ` · ${SUB_ROLE_ZH[profile.sub_role]}`}
        </p>
        {profile?.company && (
          <p className="text-sm text-site-500 mt-0.5">{profile.company}</p>
        )}
      </div>

      <div className="card p-5 mt-3">
        <h3 className="text-base font-bold text-site-900 mb-2">下一步</h3>
        <p className="text-sm text-site-600">
          請到「工地」分頁申請加入你正在工作的工地。獲審核通過後，便可使用進度追蹤等功能。
        </p>
      </div>
    </AppLayout>
  )
}
