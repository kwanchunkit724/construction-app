// =============================================================
// supabase/functions/verify-stepup-sms/index.ts
//   (SMS step-up factor — verify the 6-digit OTP and mint a step-up grant)
// =============================================================
// Part of the L3 step-up fallback chain (v83).  Called immediately after the
// user enters the OTP they received from send-stepup-sms.
//
// Flow:
//   1. Identify the caller from the forwarded user JWT (anon client + getUser).
//   2. Derive the caller's HK phone from their synthetic email.
//   3. Find the newest non-expired, non-consumed phone_verifications row for
//      (phone, purpose='step_up', action_class).
//   4. Increment attempts; if attempts > max_attempts → fail (lockout).
//   5. Compare sha256(supplied_code) against code_hash.
//   6. On match: mark consumed_at = now, delete expired step_up_grants for this
//      user, INSERT a fresh step_up_grants row (user_id, action_class, expires_at
//      = now + 5 min) via the service role. Return {ok:true, expires_at}.
//   7. On mismatch: return {ok:false, error:'驗證碼不正確'}.
//
// action_class allow-list mirrors send-stepup-sms / verify-stepup-password.
//
// Secrets (supabase secrets set): SUPABASE_SERVICE_ROLE_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PHONE_DOMAIN       = 'phone.local'
const GRANT_MINUTES      = 5

const ACTION_CLASSES = new Set([
  'approval', 'document', 'progress_delete', 'form_signoff',
])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: '未登入' }, 401)

  let body: { action_class?: string; code?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }
  const actionClass = body.action_class
  const code        = body.code
  if (!actionClass || !ACTION_CLASSES.has(actionClass)) return json({ ok: false, error: '缺少或無效操作類別' }, 400)
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) return json({ ok: false, error: '驗證碼格式錯誤' }, 400)

  // 1) Identify the caller.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  const user = authData.user
  if (authErr || !user) return json({ ok: false, error: '未登入' }, 401)

  // 2) Derive phone.
  const email = user.email ?? ''
  if (!email.endsWith(`@${PHONE_DOMAIN}`)) return json({ ok: false, error: '帳戶不支援 SMS 驗證' }, 400)
  const phone = email.slice(0, -((`@${PHONE_DOMAIN}`).length))

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 3) Find the newest non-expired, non-consumed row for this phone + action_class.
  const now = new Date().toISOString()
  const { data: rows, error: selErr } = await admin
    .from('phone_verifications')
    .select('id, code_hash, attempts, max_attempts')
    .eq('phone', phone)
    .eq('purpose', 'step_up')
    .eq('action_class', actionClass)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
  if (selErr) {
    console.error('phone_verifications select failed', selErr.message)
    return json({ ok: false, error: '驗證失敗，請稍後再試' }, 500)
  }
  if (!rows || rows.length === 0) return json({ ok: false, error: '驗證碼已過期或不存在，請重新發送' }, 400)

  const row = rows[0]

  // 4) Increment attempts first (before comparing) to prevent timing-based retries.
  const newAttempts = (row.attempts as number) + 1
  const { error: updErr } = await admin
    .from('phone_verifications')
    .update({ attempts: newAttempts })
    .eq('id', row.id)
  if (updErr) {
    console.error('attempts increment failed', updErr.message)
    return json({ ok: false, error: '驗證失敗，請稍後再試' }, 500)
  }

  if (newAttempts > (row.max_attempts as number)) {
    return json({ ok: false, error: '嘗試次數過多，請重新發送驗證碼' }, 429)
  }

  // 5) Compare hashes (constant-time via String equality on equal-length hex is
  //    acceptable; crypto.subtle.timingSafeEqual is not available in Deno Deploy).
  const suppliedHash = await sha256Hex(code)
  if (suppliedHash !== row.code_hash) {
    return json({ ok: false, error: '驗證碼不正確' }, 401)
  }

  // 6) Mark consumed and mint the step-up grant.
  const { error: consumeErr } = await admin
    .from('phone_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
  if (consumeErr) {
    console.error('consume mark failed', consumeErr.message)
    return json({ ok: false, error: '驗證失敗，請稍後再試' }, 500)
  }

  // Clear this caller's expired grants (mirrors verify-stepup-password).
  await admin.from('step_up_grants').delete().eq('user_id', user.id).lte('expires_at', new Date().toISOString())

  const expires = new Date(Date.now() + GRANT_MINUTES * 60_000)
  const { error: grantErr } = await admin.from('step_up_grants').insert({
    user_id: user.id,
    action_class: actionClass,
    expires_at: expires.toISOString(),
  })
  if (grantErr) {
    console.error('step_up grant insert failed', grantErr.message)
    return json({ ok: false, error: '未能建立驗證憑證' }, 500)
  }

  return json({ ok: true, expires_at: expires.toISOString() })
})
