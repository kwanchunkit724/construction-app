import { useState } from 'react'
import { LogOut, Bell } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'
import { initPush, requestPushPermission } from '../lib/push'

export default function Profile() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  if (!profile) return null

  const initial = profile.name.slice(0, 1)
  const onesignalStatus = profile.onesignal_id ?? '—'

  async function reRegisterPush() {
    setPushBusy(true)
    setPushMsg('')
    try {
      await initPush()
      const granted = await requestPushPermission()
      setPushMsg(granted ? '已重新觸發推送註冊。等幾秒再 refresh 個人頁睇下狀態。' : '無法獲取推送權限。請去 iOS 設定 → 通知 → CK Construction 開啟。')
    } catch (e) {
      setPushMsg(`錯誤：${(e as Error)?.message ?? 'unknown'}`)
    } finally {
      setPushBusy(false)
    }
  }

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

      {/* Push diagnostics */}
      <div className="card mt-3 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={16} className="text-site-500" />
          <span className="text-sm font-semibold text-site-900">推送通知</span>
        </div>
        <p className="text-xs text-site-500 break-all mb-3">
          狀態：<span className="font-mono">{onesignalStatus}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={reRegisterPush}
            disabled={pushBusy}
            className="flex-1 text-sm font-semibold border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2 flex items-center justify-center gap-1.5"
          >
            {pushBusy ? <Spinner size={14} /> : <Bell size={14} />}
            重新註冊推送
          </button>
          <button
            onClick={() => refreshProfile()}
            className="text-sm font-semibold border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2 px-3"
          >
            刷新狀態
          </button>
        </div>
        {pushMsg && (
          <p className="mt-2 text-xs text-site-600 bg-site-100 rounded-lg p-2">{pushMsg}</p>
        )}
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
