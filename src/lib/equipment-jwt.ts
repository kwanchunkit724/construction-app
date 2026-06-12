import { supabase } from './supabase'

// Wrapper around server-side mint_equipment_jwt / verify_equipment_jwt RPCs.
// Mirrors src/lib/ptw-jwt.ts exactly — the signing secret never leaves the
// server; these helpers just call the SECURITY DEFINER functions.

// One form instance attached to the equipment, as returned by
// verify_equipment_jwt. `status` is the server-derived FormStatus bucket.
export interface EquipmentVerifyInstance {
  instance_id: string
  template_code: string
  template_name: string
  valid_until: string | null
  suspended: boolean
  status: string
}

export interface EquipmentVerifyResult {
  equipment_id: string
  ref_no: string
  name_zh: string
  kind: string
  location_zh: string | null
  instances: EquipmentVerifyInstance[]
}

export async function mintEquipmentQrToken(equipmentId: string): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('mint_equipment_jwt', { p_equipment_id: equipmentId })
  if (error) return { token: null, error: error.message }
  if (typeof data !== 'string' || data.length === 0) {
    return { token: null, error: 'mint returned empty token' }
  }
  return { token: data, error: null }
}

export async function verifyEquipmentQrToken(token: string): Promise<{ result: EquipmentVerifyResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('verify_equipment_jwt', { p_token: token })
  if (error) return { result: null, error: error.message }
  if (!data || typeof data !== 'object') {
    return { result: null, error: 'verify returned no payload' }
  }
  return { result: data as unknown as EquipmentVerifyResult, error: null }
}
