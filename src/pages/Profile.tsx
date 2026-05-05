import { useState } from 'react'
import { LogOut, Bell, Trash2 } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

export default function Profile() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  if (!profile) return null

  async function deleteAccount() {
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) {
        setDeleteError(error.message || '刪除失敗，請稍後再試')
        setDeleteBusy(false)
        return
      }
      // Account is gone — local session is now invalid. Sign out to clear it.
      await signOut()
    } catch (e) {
      setDeleteError((e as Error)?.message ?? '刪除失敗')
      setDeleteBusy(false)
    }
  }

  const initial = profile.name.slice(0, 1)
  const onesignalStatus = profile.onesignal_id ?? '—'

  async function reRegisterPush() {
    setPushBusy(true)
    const log: string[] = []
    const append = (line: string) => {
      log.push(line)
      setPushMsg(log.join('\n'))
    }

    try {
      append(`1. isNative: ${isNative()}`)
      if (!isNative()) { setPushBusy(false); return }

      // Capture token via a one-shot listener
      let tokenReceived: string | null = null
      let regError: string | null = null

      const tokenSub = await PushNotifications.addListener('registration', (t) => {
        tokenReceived = t.value
      })
      const errSub = await PushNotifications.addListener('registrationError', (e) => {
        regError = JSON.stringify(e)
      })

      append('2. 請求權限...')
      const perm = await PushNotifications.requestPermissions()
      append(`   結果: ${perm.receive}`)
      if (perm.receive !== 'granted') {
        append('終止：權限被拒絕')
        await tokenSub.remove(); await errSub.remove()
        setPushBusy(false); return
      }

      append('3. PushNotifications.register()...')
      await PushNotifications.register()

      append('4. 等 APNs token (最多 8 秒)...')
      const start = Date.now()
      while (!tokenReceived && !regError && Date.now() - start < 8000) {
        await new Promise(r => setTimeout(r, 200))
      }
      await tokenSub.remove(); await errSub.remove()

      if (regError) { append(`✗ APNs 錯誤: ${regError}`); setPushBusy(false); return }
      if (!tokenReceived) { append('✗ 8 秒內收唔到 APNs token'); setPushBusy(false); return }

      append(`5. APNs token 收到 (${(tokenReceived as string).slice(0, 12)}...)`)

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) { append('✗ 冇 session'); setPushBusy(false); return }

      append('6. POST 去 OneSignal /players...')
      const resp = await fetch('https://onesignal.com/api/v1/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          device_type: 0,
          identifier: tokenReceived,
          external_user_id: userId,
          language: 'zh-Hant',
        }),
      })
      const respText = await resp.text()
      append(`   HTTP ${resp.status}: ${respText.slice(0, 200)}`)
      if (!resp.ok) { setPushBusy(false); return }

      let playerId = ''
      try {
        const j = JSON.parse(respText) as { id?: string }
        playerId = j.id ?? ''
      } catch { /* ignore */ }

      append(`7. 寫入 user_profiles.onesignal_id = ${playerId}`)
      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({ onesignal_id: playerId || `OK no-id` })
        .eq('id', userId)
      if (upErr) append(`✗ DB update error: ${upErr.message}`)
      else append('✓ 完成！按「刷新狀態」見最新值')
    } catch (e) {
      append(`✗ 例外：${(e as Error)?.message ?? String(e)}`)
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
          <pre className="mt-2 text-[11px] text-site-700 bg-site-100 rounded-lg p-2 whitespace-pre-wrap break-all font-mono leading-relaxed">{pushMsg}</pre>
        )}
      </div>

      <button
        onClick={signOut}
        className="mt-5 w-full flex items-center justify-center gap-2 text-red-600 bg-white border border-red-200 hover:bg-red-50 font-semibold rounded-xl py-3"
      >
        <LogOut size={18} /> 登出
      </button>

      <button
        onClick={() => { setDeleteError(''); setShowDeleteConfirm(true) }}
        className="mt-3 w-full flex items-center justify-center gap-2 text-red-700 bg-white border border-red-300 hover:bg-red-50 font-semibold rounded-xl py-3"
      >
        <Trash2 size={18} /> 刪除帳號
      </button>
      <p className="mt-2 text-xs text-site-500 text-center px-4">
        永久刪除你的帳號及個人資料。已建立的工程記錄會保留作審計用途，但作者欄會顯示為「已移除」。
      </p>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={20} className="text-red-600" />
              <h3 className="text-lg font-bold text-site-900">確定刪除帳號？</h3>
            </div>
            <p className="text-sm text-site-700 mb-4 leading-relaxed">
              此操作<span className="font-bold text-red-600">無法復原</span>。刪除後：
            </p>
            <ul className="text-sm text-site-700 list-disc pl-5 space-y-1 mb-4">
              <li>你的登入帳號及個人資料會永久刪除</li>
              <li>你會即時登出，無法再使用此帳號登入</li>
              <li>之前建立的工程、進度、問題記錄會保留，但作者欄顯示為「已移除」</li>
              <li>推送通知訂閱會解除</li>
            </ul>
            {deleteError && (
              <p className="text-sm text-red-600 mb-3 bg-red-50 rounded-lg p-2">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteBusy}
                className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
              >
                取消
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleteBusy}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
              >
                {deleteBusy ? <Spinner size={16} /> : <Trash2 size={16} />}
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}
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
