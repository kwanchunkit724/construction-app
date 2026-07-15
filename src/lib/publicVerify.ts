import { supabase } from './supabase'

// Public, NO-LOGIN QR verification. Anyone (勞工處 / client / inspector) scans the
// QR → opens a minimal page showing authenticity + validity. The server-signed
// JWT is the security (only the server can mint a valid token), so showing the
// token's own permit/equipment to anonymous viewers is safe; the backend RPCs
// (verify_ptw_public / verify_equipment_public, v104) return only a MINIMAL set.
//
// The QR encodes a URL on the PUBLIC production web domain — NOT
// window.location.origin, which on the native (Capacitor) app is capacitor://…
// and cannot be opened by a phone camera. This fixed base is the same public web
// build linked from /sell.
export const PUBLIC_WEB_BASE = 'https://construction-app-lime-six.vercel.app'

export const ptwPublicUrl = (token: string) => `${PUBLIC_WEB_BASE}/#/p/${token}`
export const equipmentPublicUrl = (token: string) => `${PUBLIC_WEB_BASE}/#/pe/${token}`

export interface PtwPublicResult {
  kind: 'ptw'
  number: string
  ptw_type: string
  status: string
  issued_at: number
  expires_at: string | null
  valid: boolean
}

export interface EquipmentFormStatus {
  template_code: string
  template_name: string
  status: string
  valid_until: string | null
}

export interface EquipmentPublicResult {
  kind: 'equipment'
  ref_no: string
  name_zh: string
  equipment_kind: string
  instances: EquipmentFormStatus[]
}

export async function verifyPtwPublic(token: string): Promise<{ result: PtwPublicResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('verify_ptw_public', { p_token: token })
  if (error) return { result: null, error: error.message }
  if (!data || typeof data !== 'object') return { result: null, error: 'QR 無效' }
  return { result: data as PtwPublicResult, error: null }
}

export async function verifyEquipmentPublic(token: string): Promise<{ result: EquipmentPublicResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('verify_equipment_public', { p_token: token })
  if (error) return { result: null, error: error.message }
  if (!data || typeof data !== 'object') return { result: null, error: 'QR 無效' }
  return { result: data as EquipmentPublicResult, error: null }
}
