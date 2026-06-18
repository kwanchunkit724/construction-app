// =============================================================
// supabase/functions/verify-stepup-password/index.ts
//   (Easier step-up — password / biometric factor, NO Twilio)
// =============================================================
// Mints a STEP-UP grant (step_up_grants, v52) from a verified login PASSWORD,
// without requiring an AAL2 (TOTP) session. This is the server path shared by two
// client factors in the new fallback chain:
//   * 密碼重輸  — the user types their login password (web / biometric unavailable).
//   * 生物認證  — biometric unlocks a securely-stored password on-device, which the
//                 client forwards here (the device proves presence; the server still
//                 verifies the real secret). Same endpoint, password auto-filled.
//
// Mirrors verify-sign-password (v60): the ONLY new privilege is that it inserts a
// step_up_grant for a given action_class. step_up_grants has NO client write
// policy (v52), so only this service-role insert can mint one — exactly how
// sign_reauth_grants is minted. mint_step_up_grant (the AAL2/TOTP path) stays
// untouched; this is an additional, weaker-but-easier mint path that only takes
// effect when step_up_enforced is ON (until then the client skips step-up).
//
// Flow:
//   1. Identify the caller from the forwarded user JWT (anon client + getUser).
//   2. Verify the supplied password against GoTrue /token?grant_type=password
//      using the caller's synthetic-email login (<digits>@phone.local). 200 = ok.
//   3. On success, service-role INSERT step_up_grants(user_id, action_class,
//      expires_at = now + 5 min) after clearing the caller's expired grants.
//
// SECURITY: password verified against GoTrue, NEVER logged/echoed/stored/returned.
// No session is created from the check. action_class is allow-listed.
//
// Secrets: SUPABASE_SERVICE_ROLE_KEY. SUPABASE_URL / SUPABASE_ANON_KEY injected.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GRANT_MINUTES = 5

// Password/biometric is a WEAKER factor than TOTP (it's the same secret an AAL1
// phone+password thief already holds). The highest-impact classes — account
// deletion and membership/role changes — therefore REQUIRE the TOTP (AAL2) path
// (mint_step_up_grant) and are intentionally EXCLUDED from this weaker path.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: '未登入' }, 401)

  let body: { password?: string; action_class?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }
  const password = body.password
  const actionClass = body.action_class
  if (!password || typeof password !== 'string') return json({ ok: false, error: '請輸入密碼' }, 400)
  if (!actionClass || !ACTION_CLASSES.has(actionClass)) return json({ ok: false, error: '缺少或無效操作類別' }, 400)

  // 1) Identify the caller from the forwarded user JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  const user = authData.user
  if (authErr || !user) return json({ ok: false, error: '未登入' }, 401)
  const email = user.email
  if (!email) return json({ ok: false, error: '帳戶無法以密碼驗證' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // App-level lockout (defence-in-depth atop GoTrue's own /token rate-limit):
  // refuse if there have been >=5 failed step-up password attempts for this user
  // in the last 15 minutes (v88 stepup_pw_attempts).
  const lockWindow = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count: failCount } = await admin
    .from('stepup_pw_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('failed_at', lockWindow)
  if ((failCount ?? 0) >= 5) return json({ ok: false, error: '嘗試次數過多，請稍後再試' }, 429)

  // 2) Verify the password against GoTrue WITHOUT minting a session.
  let pwOk = false
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    pwOk = resp.status === 200
    await resp.text().catch(() => '')
  } catch (e) {
    console.error('stepup password verify request failed', e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: '密碼驗證服務暫時無法使用' }, 502)
  }
  if (!pwOk) {
    // Record the failed attempt (feeds the lockout above).
    await admin.from('stepup_pw_attempts').insert({ user_id: user.id })
    return json({ ok: false, error: '密碼錯誤' }, 401)
  }

  // 3) Mint the step-up grant via the SERVICE ROLE (table has no client write policy).
  // Correct password — clear this user's failed-attempt streak.
  await admin.from('stepup_pw_attempts').delete().eq('user_id', user.id)
  // Clear this caller's expired grants first (mirrors mint_step_up_grant).
  await admin.from('step_up_grants').delete().eq('user_id', user.id).lte('expires_at', new Date().toISOString())
  const expires = new Date(Date.now() + GRANT_MINUTES * 60_000)
  const { error: insErr } = await admin.from('step_up_grants').insert({
    user_id: user.id,
    action_class: actionClass,
    expires_at: expires.toISOString(),
  })
  if (insErr) {
    console.error('step_up grant insert failed', insErr.message)
    return json({ ok: false, error: '未能建立驗證憑證' }, 500)
  }

  return json({ ok: true, expires_at: expires.toISOString() })
})
