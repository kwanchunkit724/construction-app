// =============================================================
// supabase/functions/send-stepup-sms/index.ts
//   (SMS step-up factor — send a 6-digit OTP to the caller's phone)
// =============================================================
// Part of the L3 step-up fallback chain (v83):
//   生物認證 → 密碼重輸 → SMS 6-digit (this function sends that SMS).
//
// Flow:
//   1. Identify the caller from the forwarded user JWT (anon client + getUser).
//   2. Derive the caller's HK phone from their synthetic email (<digits>@phone.local).
//   3. Rate-limit: refuse if >3 unconsumed, non-expired phone_verifications rows
//      for this phone (purpose='step_up') were created in the last 10 minutes.
//   4. Generate a 6-digit code using crypto.getRandomValues (CSPRNG).
//   5. Store sha256(code) hex in phone_verifications via the service role.
//   6. Send the SMS via Twilio REST (Basic auth, urlencoded body).
//   7. Return {ok:true}. The code is NEVER returned, logged, or stored in plaintext.
//
// action_class allow-list mirrors verify-stepup-password (weaker factor set):
//   'approval' | 'document' | 'progress_delete' | 'form_signoff'
//   (account_delete / membership EXCLUDED — those require TOTP/AAL2.)
//
// Secrets (supabase secrets set):
//   SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID         = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN       = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM        = Deno.env.get('TWILIO_FROM')!

const PHONE_DOMAIN       = 'phone.local'
const GRANT_MINUTES      = 5
const RATE_LIMIT_WINDOW  = 10   // minutes
const RATE_LIMIT_MAX     = 3    // unconsumed sends allowed in window

// Mirrors verify-stepup-password: weaker-factor classes only.
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

/** Return the hex-encoded SHA-256 of an ASCII string. */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Generate a cryptographically random 6-digit string (zero-padded). */
function randomCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(arr[0] % 1_000_000).padStart(6, '0')
}

/** Send an SMS via Twilio REST API. Throws on non-2xx. */
async function sendTwilioSms(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)
  const params = new URLSearchParams({ To: `+852${to}`, From: TWILIO_FROM, Body: body })
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Twilio ${resp.status}: ${txt.slice(0, 200)}`)
  }
  await resp.text().catch(() => '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: '未登入' }, 401)

  let body: { action_class?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }
  const actionClass = body.action_class
  if (!actionClass || !ACTION_CLASSES.has(actionClass)) return json({ ok: false, error: '缺少或無效操作類別' }, 400)

  // 1) Identify the caller from the forwarded user JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  const user = authData.user
  if (authErr || !user) return json({ ok: false, error: '未登入' }, 401)

  // 2) Derive phone from synthetic email (<digits>@phone.local).
  const email = user.email ?? ''
  if (!email.endsWith(`@${PHONE_DOMAIN}`)) return json({ ok: false, error: '帳戶不支援 SMS 驗證' }, 400)
  const phone = email.slice(0, -((`@${PHONE_DOMAIN}`).length))
  if (!/^[5679]\d{7}$/.test(phone)) return json({ ok: false, error: '帳戶手機號碼無效' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 3) Rate-limit: count unconsumed step_up rows for this phone in the last 10 min.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW * 60_000).toISOString()
  const { count, error: cntErr } = await admin
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('purpose', 'step_up')
    .is('consumed_at', null)
    .gte('created_at', windowStart)
  if (cntErr) {
    console.error('rate-limit count failed', cntErr.message)
    return json({ ok: false, error: '無法發送驗證碼，請稍後再試' }, 500)
  }
  if ((count ?? 0) >= RATE_LIMIT_MAX) return json({ ok: false, error: '發送次數過多，請稍後再試' }, 429)

  // Global send cap (anti mass-abuse / Twilio cost guard): refuse if total OTP
  // sends across ALL phones in the last 10 min exceed a ceiling.
  const { count: globalCount } = await admin
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', windowStart)
  if ((globalCount ?? 0) >= 100) return json({ ok: false, error: '系統繁忙，請稍後再試' }, 429)

  // 4) Generate code + 5) store hash via service role.
  const code     = randomCode()
  const codeHash = await sha256Hex(code)
  const expiresAt = new Date(Date.now() + GRANT_MINUTES * 60_000).toISOString()

  const { error: insErr } = await admin.from('phone_verifications').insert({
    phone,
    purpose: 'step_up',
    code_hash: codeHash,
    action_class: actionClass,
    user_id: user.id,
    expires_at: expiresAt,
    max_attempts: 5,
  })
  if (insErr) {
    console.error('phone_verifications insert failed', insErr.message)
    return json({ ok: false, error: '無法發送驗證碼，請稍後再試' }, 500)
  }

  // 6) Send the SMS.
  const smsBody = `【CK工程】您的驗證碼為 ${code}，5 分鐘內有效。切勿告知他人。`
  try {
    await sendTwilioSms(phone, smsBody)
  } catch (e) {
    console.error('Twilio send failed', e instanceof Error ? e.message : String(e))
    // Clean up the row we just inserted so the rate-limit counter isn't inflated.
    await admin.from('phone_verifications').delete().eq('phone', phone).eq('code_hash', codeHash)
    return json({ ok: false, error: 'SMS 發送失敗，請稍後再試' }, 502)
  }

  // 7) Return success. Never return the code.
  return json({ ok: true })
})
