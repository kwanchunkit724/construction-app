// =============================================================
// supabase/functions/verify-phone-otp/index.ts
//   (Signup SMS verification — verify the OTP; client may then create the account)
// =============================================================
// Called from the Signup screen after the user enters the OTP they received from
// send-phone-otp.  NO auth is required — no account exists yet.
//
// Flow:
//   1. Validate the supplied phone (HK 8-digit) and code (6-digit string).
//   2. Find the newest non-expired, non-consumed phone_verifications row for
//      (phone, purpose='signup').
//   3. Increment attempts; if attempts > max_attempts → fail (lockout).
//   4. Compare sha256(supplied_code) against code_hash.
//   5. On match: mark consumed_at = now. Return {ok:true}.
//      The client may then call supabase.auth.signUp() normally.
//   6. On mismatch: return {ok:false, error:'驗證碼不正確'}.
//
// Secrets (supabase secrets set): SUPABASE_SERVICE_ROLE_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

function isValidHKPhone(phone: string): boolean {
  return /^[5679]\d{7}$/.test(phone)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  // No auth required — this is a pre-signup endpoint.

  let body: { phone?: string; code?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const raw   = body.phone ?? ''
  const phone = normalizePhone(raw)
  if (!isValidHKPhone(phone)) return json({ ok: false, error: '請輸入有效的 8 位香港手機號碼' }, 400)

  const code = body.code ?? ''
  if (!/^\d{6}$/.test(code)) return json({ ok: false, error: '驗證碼格式錯誤' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Find the newest non-expired, non-consumed signup row for this phone.
  const now = new Date().toISOString()
  const { data: rows, error: selErr } = await admin
    .from('phone_verifications')
    .select('id, code_hash, attempts, max_attempts')
    .eq('phone', phone)
    .eq('purpose', 'signup')
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

  // Increment attempts before comparing (prevent timing-based retries).
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

  // Compare hashes.
  const suppliedHash = await sha256Hex(code)
  if (suppliedHash !== row.code_hash) {
    return json({ ok: false, error: '驗證碼不正確' }, 401)
  }

  // Mark consumed.
  const { error: consumeErr } = await admin
    .from('phone_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
  if (consumeErr) {
    console.error('consume mark failed', consumeErr.message)
    return json({ ok: false, error: '驗證失敗，請稍後再試' }, 500)
  }

  // Return success — client may now call supabase.auth.signUp().
  return json({ ok: true })
})
