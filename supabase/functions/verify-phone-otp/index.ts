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

  // Verify atomically server-side (v86 verify_phone_code): row-locked attempt
  // spend + single-use consume, so parallel guesses cannot bypass max_attempts.
  const suppliedHash = await sha256Hex(code)
  const { data: verdict, error: rpcErr } = await admin.rpc('verify_phone_code', {
    p_phone: phone,
    p_purpose: 'signup',
    p_action_class: null,
    p_code_hash: suppliedHash,
    p_user_id: null,
  })
  if (rpcErr) {
    console.error('verify_phone_code failed', rpcErr.message)
    return json({ ok: false, error: '驗證失敗，請稍後再試' }, 500)
  }
  if (verdict === 'ok') return json({ ok: true })  // client may now call supabase.auth.signUp()
  if (verdict === 'locked') return json({ ok: false, error: '嘗試次數過多，請重新發送驗證碼' }, 429)
  if (verdict === 'expired') return json({ ok: false, error: '驗證碼已過期或不存在，請重新發送' }, 400)
  return json({ ok: false, error: '驗證碼不正確' }, 401)
})
