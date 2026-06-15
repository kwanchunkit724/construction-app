// =============================================================
// supabase/functions/verify-sign-password/index.ts   (Signature non-repudiation #9)
// =============================================================
// Mints a fresh-password "re-auth" grant bound to the SIGNING moment, so a
// signature stands up to a 勞工處 dispute (proof the 本人 / actual account holder
// was present). The client calls this RIGHT BEFORE a record_ptw_signoff /
// record_form_signoff RPC when get_sign_reauth_enforced() is true.
//
// Flow:
//   1. Identify the caller from the forwarded user JWT (anon client + getUser).
//   2. Verify the SUPPLIED password by POSTing the caller's synthetic-email login
//      (<digits>@phone.local; see src/lib/phone.ts) to the project's GoTrue
//      /auth/v1/token?grant_type=password. 200 => correct password.
//   3. On success, use the SERVICE ROLE to upsert sign_reauth_grants(user_id =
//      caller, granted_at = now, expires_at = now + 5 min). The grant table has
//      NO client write policy (v60-sign-reauth.sql) — only the service role can
//      mint it. assert_sign_reauth() then sees a live grant.
//
// SECURITY: the password is verified against GoTrue and NEVER logged, echoed,
// stored, or returned. We do not create a session from the password check; we
// only read the 200/4xx outcome.
//
// Secrets (supabase secrets set): SUPABASE_SERVICE_ROLE_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GRANT_MINUTES = 5

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

  let body: { password?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }
  const password = body.password
  if (!password || typeof password !== 'string') return json({ ok: false, error: '請輸入密碼' }, 400)

  // 1) Identify the caller from the forwarded user JWT (RLS-bounded anon client).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  const user = authData.user
  if (authErr || !user) return json({ ok: false, error: '未登入' }, 401)
  // The login identity is the synthetic email (<digits>@phone.local). No email →
  // this account can't be password-verified through GoTrue here.
  const email = user.email
  if (!email) return json({ ok: false, error: '帳戶無法以密碼驗證' }, 400)

  // 2) Verify the password against GoTrue WITHOUT minting a session: a 200 means
  //    the supplied password is correct for this exact account. We never log the
  //    password, and we discard any tokens the endpoint returns.
  let pwOk = false
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    pwOk = resp.status === 200
    // Drain the body so the connection can be reused; do NOT inspect/return it.
    await resp.text().catch(() => '')
  } catch (e) {
    // Network/GoTrue failure — never leak the password; log only the failure.
    console.error('password verify request failed', e instanceof Error ? e.message : String(e))
    return json({ ok: false, error: '密碼驗證服務暫時無法使用' }, 502)
  }
  if (!pwOk) return json({ ok: false, error: '密碼錯誤' }, 401)

  // 3) Mint the grant via the SERVICE ROLE (the table has no client write policy).
  //    PK is user_id → upsert on conflict refreshes granted_at + expires_at.
  const now = new Date()
  const expires = new Date(now.getTime() + GRANT_MINUTES * 60_000)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error: upErr } = await admin.from('sign_reauth_grants')
    .upsert(
      { user_id: user.id, granted_at: now.toISOString(), expires_at: expires.toISOString() },
      { onConflict: 'user_id' },
    )
  if (upErr) {
    console.error('grant upsert failed', upErr.message)
    return json({ ok: false, error: '未能建立驗證憑證' }, 500)
  }

  return json({ ok: true, expires_at: expires.toISOString() })
})
