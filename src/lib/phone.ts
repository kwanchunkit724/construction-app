// Phone <-> email conversion. We use phone+password auth but Supabase needs an
// email under the hood. We synthesize a stable fake email per phone so users
// only ever see their phone number.

const PHONE_DOMAIN = 'phone.local'

export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_DOMAIN}`
}

export function emailToPhone(email: string): string | null {
  if (!email.endsWith(`@${PHONE_DOMAIN}`)) return null
  return email.slice(0, -(`@${PHONE_DOMAIN}`).length)
}

export function isValidHKPhone(phone: string): boolean {
  const digits = normalizePhone(phone)
  // Hong Kong mobile: 8 digits, starts with 5/6/7/9
  return /^[5679]\d{7}$/.test(digits)
}
