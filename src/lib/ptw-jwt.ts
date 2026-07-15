import { supabase } from './supabase'

// Wrapper around server-side mint_ptw_jwt / verify_ptw_jwt RPCs.
// Secret never leaves the server — these helpers just call the
// SECURITY DEFINER functions.

export interface PtwJwtPayload {
  permit_id: string
  project_id: string
  ptw_type: string
  number: string
  iat: number
  exp: number
}

export async function mintPtwQrToken(permitId: string): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('mint_ptw_jwt', { p_permit_id: permitId })
  if (error) return { token: null, error: error.message }
  if (typeof data !== 'string' || data.length === 0) {
    return { token: null, error: 'mint returned empty token' }
  }
  return { token: data, error: null }
}

export async function verifyPtwQrToken(token: string): Promise<{ payload: PtwJwtPayload | null; error: string | null }> {
  const { data, error } = await supabase.rpc('verify_ptw_jwt', { p_token: token })
  if (error) return { payload: null, error: error.message }
  if (!data || typeof data !== 'object') {
    return { payload: null, error: 'verify returned no payload' }
  }
  return { payload: data as PtwJwtPayload, error: null }
}

// Decode JWT payload locally for display ONLY (no signature check).
// Use for showing permit number/type before round-tripping to server.
// Trust ONLY verifyPtwQrToken for authoritative validity.
export function decodeJwtPayloadUnsafe(token: string): PtwJwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as PtwJwtPayload
  } catch {
    return null
  }
}
