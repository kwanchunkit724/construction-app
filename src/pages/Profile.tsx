import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Bell, Trash2, UserCog, Plus, Mail, ShieldCheck, ChevronRight } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { useStepUp } from '../contexts/StepUpContext'
import { DelegationsProvider, useDelegations } from '../contexts/DelegationsContext'
import { ROLE_ZH, SUB_ROLE_ZH } from '../types'
import type { UserProfile } from '../types'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'

const ONESIGNAL_APP_ID = '71f914a3-6dc3-4c4a-80e6-70df8f17d5d1'

function isNative(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return cap?.isNativePlatform?.() === true
}

export default function Profile() {
  return (
    <DelegationsProvider>
      <ProfileInner />
    </DelegationsProvider>
  )
}

function ProfileInner() {
  const { profile, signOut, refreshProfile } = useAuth()
  const { requireStepUp } = useStepUp()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteBlocked, setDeleteBlocked] = useState<{ pending: number; error: string } | null>(null)
  const [notifyBusy, setNotifyBusy] = useState(false)
  const [notifySent, setNotifySent] = useState(false)
  if (!profile) return null

  async function deleteAccount() {
    if (!(await requireStepUp('account_delete'))) return
    setDeleteBusy(true)
    setDeleteError('')
    setDeleteBlocked(null)
    try {
      const { data, error } = await supabase.rpc('delete_my_account')
      if (error) {
        setDeleteError(error.message || '刪除失敗，請稍後再試')
        setDeleteBusy(false)
        return
      }
      // delete_my_account now returns json (v9 extension). Three shapes:
      //   { ok: true }                                       → empty cascade ran (Apple compliance path)
      //   { ok: false, blocked: true, pending: N, error }    → in-flight approvals — admin must reroute first
      //   { ok: false, error }                               → other failure
      const resp = (data as any) || {}
      if (resp.blocked === true) {
        setDeleteBlocked({
          pending: Number(resp.pending) || 0,
          error: resp.error || '你尚有待處理嘅簽核工作，需要管理員重新分派後先可以刪除帳戶。',
        })
        setDeleteBusy(false)
        return
      }
      if (resp.ok === true) {
        // Account is gone — local session is now invalid. Sign out to clear it.
        await signOut()
        return
      }
      // Fallback for any other shape — preserve Apple compliance by surfacing the raw error.
      setDeleteError(resp.error || '刪除失敗，請稍後再試')
      setDeleteBusy(false)
    } catch (e) {
      setDeleteError((e as Error)?.message ?? '刪除失敗')
      setDeleteBusy(false)
    }
  }

  async function notifyAdmin() {
    if (!profile || !deleteBlocked) return
    setNotifyBusy(true)
    const body = `${profile.phone} 申請刪除帳戶但有 ${deleteBlocked.pending} 項待處理簽核，需要管理員重新分派`
    const { error } = await supabase.from('demo_feedback').insert({
      scenario: 'general',
      user_id: profile.id,
      username: profile.phone,
      user_name: profile.name,
      role_zh: ROLE_ZH[profile.global_role],
      rating: 3,
      category: '其他',
      message: body,
    })
    setNotifyBusy(false)
    if (!error) setNotifySent(true)
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

      {/* 二步驗證 (step-up 2FA) ─────────────────────────────── */}
      <Link
        to="/security-setup"
        className="card mt-3 p-4 flex items-center gap-3 hover:bg-site-50"
      >
        <div className="w-9 h-9 rounded-full bg-safety-50 text-safety-500 flex items-center justify-center shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-site-900">二步驗證</p>
          <p className="text-xs text-site-500">保護簽核 / 審批等高風險操作，即使密碼外洩亦安全。</p>
        </div>
        <ChevronRight size={18} className="text-site-400 shrink-0" />
      </Link>

      {/* 平安咭 (green card) ─────────────────────────────── */}
      <GreenCardSection />

      {/* Delegations section ─────────────────────────────── */}
      <DelegationsSection />

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
        onClick={() => { setDeleteError(''); setDeleteBlocked(null); setNotifySent(false); setShowDeleteConfirm(true) }}
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

            {deleteBlocked && (
              <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl p-3 mb-3">
                <p className="text-sm font-semibold mb-1">未能刪除帳戶</p>
                <p className="text-sm leading-relaxed">{deleteBlocked.error}</p>
                <button
                  onClick={notifyAdmin}
                  disabled={notifyBusy || notifySent}
                  className="mt-2 text-sm inline-flex items-center gap-1.5 text-red-700 underline disabled:no-underline disabled:opacity-70"
                >
                  {notifyBusy ? <Spinner size={14} /> : <Mail size={14} />}
                  {notifySent ? '已通知管理員' : '通知管理員'}
                </button>
              </div>
            )}

            {deleteError && !deleteBlocked && (
              <p className="text-sm text-red-600 mb-3 bg-red-50 rounded-lg p-2">{deleteError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteBusy}
                className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5"
              >
                {deleteBlocked ? '關閉' : '取消'}
              </button>
              {!deleteBlocked && (
                <button
                  onClick={deleteAccount}
                  disabled={deleteBusy}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
                >
                  {deleteBusy ? <Spinner size={16} /> : <Trash2 size={16} />}
                  確認刪除
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

// ── 平安咭 (green card) ─────────────────────────────────────
// S20: the card lives on the PERSON (valid across sites). Owner-editable here;
// surfaced to approvers via admin_or_pm_list_applicants. Days-to-expiry hint:
// amber within 30 days, red once expired.
function GreenCardSection() {
  const { profile, refreshProfile } = useAuth()
  const [no, setNo] = useState(profile?.green_card_no ?? '')
  const [expiry, setExpiry] = useState(profile?.green_card_expiry ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null

  const dirty = no !== (profile.green_card_no ?? '') || expiry !== (profile.green_card_expiry ?? '')

  const expiryHint: { text: string; cls: string } | null = (() => {
    if (!expiry) return null
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })
    if (expiry < today) return { text: '已過期', cls: 'bg-red-50 text-red-600 border-red-200' }
    const days = Math.round((new Date(expiry + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
    if (days <= 30) return { text: `將於 ${days} 日內到期`, cls: 'bg-amber-100 text-amber-700 border-amber-200' }
    return null
  })()

  async function save() {
    setError('')
    setSaving(true)
    const { error: e } = await supabase
      .from('user_profiles')
      .update({
        green_card_no: no.trim() || null,
        green_card_expiry: expiry || null,
      })
      .eq('id', profile!.id)
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true)
    await refreshProfile()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={16} className="text-site-500" />
        <span className="text-sm font-semibold text-site-900">平安咭（建造業安全卡）</span>
      </div>
      <p className="text-xs text-site-500 mb-3 leading-relaxed">
        登記後，工地審批人喺批核你嘅申請時可以見到，免得逐個問。
      </p>

      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-semibold text-site-500 block mb-1">證書號碼</label>
          <input
            value={no}
            onChange={e => setNo(e.target.value)}
            placeholder="例如：S123456"
            className="input"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-site-500 block mb-1">到期日</label>
          <input
            type="date"
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {expiryHint && (
        <p className={`mt-2 text-xs border rounded-lg px-2 py-1.5 ${expiryHint.cls}`}>
          {expiryHint.text}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="mt-3 w-full bg-safety-500 hover:bg-safety-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5"
      >
        {saving ? <Spinner size={14} className="text-white" /> : null}
        {saved ? '已儲存' : '儲存'}
      </button>
    </div>
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

// ── Delegations section ─────────────────────────────────────
function DelegationsSection() {
  const { profile } = useAuth()
  const { myDelegations, delegationsToMe, loading, addDelegation, removeDelegation } = useDelegations()
  const [showAdd, setShowAdd] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Load every user (admins may have many candidates; users see only project members).
    // RLS gates this naturally: users see all user_profiles (existing v1 policy).
    async function load() {
      const { data } = await supabase.from('user_profiles').select('*').order('name', { ascending: true })
      setUsers((data as UserProfile[]) || [])
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    const base = users.filter(u => u.id !== profile?.id)
    if (!q) return base.slice(0, 8)
    return base.filter(u =>
      u.name.toLowerCase().includes(q) || u.phone.includes(q)
    ).slice(0, 8)
  }, [users, userQuery, profile])

  const userById = useMemo(() => {
    const m: Record<string, UserProfile> = {}
    users.forEach(u => { m[u.id] = u })
    return m
  }, [users])

  const selectedUser = selectedUserId ? userById[selectedUserId] : null

  async function submit() {
    setError('')
    if (!selectedUserId) { setError('請選擇代理人'); return }
    if (!validFrom || !validUntil) { setError('請填寫生效及失效日期'); return }
    if (validUntil < validFrom) { setError('失效日期必須係生效日期之後'); return }
    setSubmitting(true)
    const { error: e } = await addDelegation(selectedUserId, validFrom, validUntil)
    setSubmitting(false)
    if (e) { setError(e); return }
    setSelectedUserId(null)
    setUserQuery('')
    setValidFrom('')
    setValidUntil('')
    setShowAdd(false)
  }

  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center gap-2 mb-3">
        <UserCog size={16} className="text-site-500" />
        <span className="text-sm font-semibold text-site-900">簽核代理 (Delegations)</span>
      </div>
      <p className="text-xs text-site-500 mb-3 leading-relaxed">
        將你嘅簽核權力暫時授權給其他人 — 例如放假或外出。代理期間，原本應該由你簽核嘅 SI / VO 會自動派去代理人。
      </p>

      {loading ? (
        <div className="py-4 flex justify-center"><Spinner size={20} /></div>
      ) : (
        <>
          {/* 我嘅代理 */}
          <div className="mb-3">
            <p className="text-xs font-bold text-site-700 mb-1.5">我嘅代理 (我授權其他人代行)</p>
            {myDelegations.length === 0 ? (
              <p className="text-xs text-site-400 bg-site-50 rounded-lg px-3 py-2">未有任何代理</p>
            ) : (
              <div className="space-y-1.5">
                {myDelegations.map(d => {
                  const u = userById[d.delegate_to]
                  return (
                    <div key={d.id} className="flex items-center gap-2 bg-site-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-site-900 truncate">
                          {u?.name || '未知用戶'}
                          {u && <span className="text-site-400 font-normal"> · {u.phone}</span>}
                        </p>
                        <p className="text-[10px] text-site-500">
                          {d.valid_from} → {d.valid_until}
                        </p>
                      </div>
                      <button
                        onClick={() => removeDelegation(d.id)}
                        className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg min-h-0"
                        aria-label="移除代理"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="mt-2 w-full text-sm border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2 flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> 加入代理
              </button>
            ) : (
              <div className="mt-2 border border-site-200 rounded-xl p-3 space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-site-500 block mb-1">代理人</label>
                  {selectedUser ? (
                    <div className="flex items-center gap-2 bg-site-100 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-site-900 truncate">{selectedUser.name}</p>
                        <p className="text-[10px] text-site-500 truncate">{selectedUser.phone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(null)}
                        className="text-xs text-site-500 px-2 py-1 border border-site-200 rounded-lg hover:bg-white"
                      >
                        更換
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={userQuery}
                        onChange={e => setUserQuery(e.target.value)}
                        placeholder="搜尋姓名或電話..."
                        className="input"
                      />
                      {userQuery && (
                        <div className="mt-1 border border-site-200 rounded-xl bg-white max-h-40 overflow-y-auto">
                          {filtered.length === 0 ? (
                            <p className="text-[10px] text-site-400 px-3 py-2">未有匹配</p>
                          ) : (
                            filtered.map(u => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => { setSelectedUserId(u.id); setUserQuery('') }}
                                className="w-full text-left px-3 py-2 hover:bg-site-50 border-b border-site-100 last:border-b-0"
                              >
                                <p className="text-xs font-semibold text-site-900">{u.name}</p>
                                <p className="text-[10px] text-site-500">{u.phone}</p>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-site-500 block mb-1">生效日期</label>
                    <input
                      type="date"
                      value={validFrom}
                      onChange={e => setValidFrom(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-site-500 block mb-1">失效日期</label>
                    <input
                      type="date"
                      value={validUntil}
                      onChange={e => setValidUntil(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowAdd(false); setError(''); setSelectedUserId(null); setUserQuery('') }}
                    className="flex-1 text-sm border border-site-200 text-site-700 hover:bg-site-50 rounded-lg py-2"
                  >
                    取消
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting}
                    className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5"
                  >
                    {submitting ? <Spinner size={14} className="text-white" /> : null}
                    提交
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 我係代理 */}
          <div>
            <p className="text-xs font-bold text-site-700 mb-1.5">我係代理 (我代行其他人)</p>
            {delegationsToMe.length === 0 ? (
              <p className="text-xs text-site-400 bg-site-50 rounded-lg px-3 py-2">未有需要代行嘅授權</p>
            ) : (
              <div className="space-y-1.5">
                {delegationsToMe.map(d => {
                  const u = userById[d.user_id]
                  return (
                    <div key={d.id} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-site-900 truncate">
                          代行 {u?.name || '未知用戶'}
                          {u && <span className="text-site-400 font-normal"> · {u.phone}</span>}
                        </p>
                        <p className="text-[10px] text-site-500">
                          {d.valid_from} → {d.valid_until}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
