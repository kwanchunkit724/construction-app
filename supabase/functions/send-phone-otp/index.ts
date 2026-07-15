// =============================================================
// supabase/functions/send-phone-otp/index.ts
//   (Signup SMS verification — send OTP to a phone before account creation)
// =============================================================
// Called from the Signup screen BEFORE an account exists.  NO auth is required.
// Guards sign-up behind phone ownership proof when signup_sms_required = true
// (v83 rollout flag). While the flag is OFF, clients may still call this for a
// soft verification step — it is harmless.
//
// Flow:
//   1. Validate the supplied phone number (HK 8-digit, starts 5/6/7/9).
//   2. Rate-limit: refuse if >3 unconsumed, non-expired rows exist for this phone
//      (purpose='signup') in the last 10 minutes.
//   3. Generate a 6-digit code via CSPRNG.
//   4. Store sha256(code) hex in phone_verifications(phone, purpose='signup',
//      user_id=null, expires_at=now+5min) via the service role.
//   5. Send the SMS via Twilio.
//   6. Return {ok:true}.  The code is NEVER returned or logged.
//
// Secrets (supabase secrets set):
//   SUPABASE_SERVICE_ROLE_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//   SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM       = Deno.env.get('TWILIO_FROM')!

const GRANT_MINUTES     = 5
const RATE_LIMIT_WINDOW = 10   // minutes
const RATE_LIMIT_MAX    = 3    // unconsumed sends allowed in window

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

function randomCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(arr[0] % 1_000_000).padStart(6, '0')
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

function isValidHKPhone(phone: string): boolean {
  return /^[5679]\d{7}$/.test(phone)
}

async function sendTwilioSms(to: string, body: string): Promise<void> {
  const url  = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`
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
  // No auth required — this is a pre-signup endpoint.

  let body: { phone?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const raw   = body.phone ?? ''
  const phone = normalizePhone(raw)
  if (!isValidHKPhone(phone)) return json({ ok: false, error: '請輸入有效的 8 位香港手機號碼' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Refuse entirely unless signup-SMS is actually enabled. While the flag is OFF
  // (the default) there is NO legitimate reason to send a signup OTP, so this
  // closes the unauthenticated SMS-bombing / Twilio-cost-abuse window completely
  // until the feature is turned on.
  const { data: required } = await admin.rpc('get_signup_sms_required')
  if (required !== true) return json({ ok: false, error: '此功能尚未啟用' }, 403)

  // Rate-limit: count unconsumed signup rows for this phone in the last 10 min.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW * 60_000).toISOString()
  const { count, error: cntErr } = await admin
    .from('phone_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('purpose', 'signup')
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

  // Generate code + store hash.
  const code      = randomCode()
  const codeHash  = await sha256Hex(code)
  const expiresAt = new Date(Date.now() + GRANT_MINUTES * 60_000).toISOString()

  const { error: insErr } = await admin.from('phone_verifications').insert({
    phone,
    purpose: 'signup',
    code_hash: codeHash,
    action_class: null,
    user_id: null,
    expires_at: expiresAt,
    max_attempts: 5,
  })
  if (insErr) {
    console.error('phone_verifications insert failed', insErr.message)
    return json({ ok: false, error: '無法發送驗證碼，請稍後再試' }, 500)
  }

  const smsBody = `【CK工程】您的註冊驗證碼為 ${code}，5 分鐘內有效。切勿告知他人。`
  try {
    await sendTwilioSms(phone, smsBody)
  } catch (e) {
    console.error('Twilio send failed', e instanceof Error ? e.message : String(e))
    await admin.from('phone_verifications').delete().eq('phone', phone).eq('code_hash', codeHash)
    return json({ ok: false, error: 'SMS 發送失敗，請稍後再試' }, 502)
  }

  return json({ ok: true })
})
