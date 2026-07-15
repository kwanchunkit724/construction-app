import { supabase } from './supabase'
import { compressImage } from './image-compress'
import { signIssuePhoto } from './issuePhotos'
import type { UserCredential } from '../types'

// Cert proof docs reuse the app's private docs bucket (issue-photos, private
// since v74). signIssuePhoto / issuePhotoPath normalise + sign any value, so a
// stored doc_path renders via a short-lived signed URL. PDFs upload as-is;
// images are compressed first (Supabase Free 1GB budget — CLAUDE.md).
export { signIssuePhoto as signCredentialDoc }

const CRED_DOC_BUCKET = 'issue-photos'

// Owner-upload a credential proof (image or PDF). Returns the storage PATH to
// persist into user_credentials.doc_path. Compresses images; PDFs pass through.
export async function uploadCredentialDoc(
  file: File,
  userId: string,
): Promise<{ path: string | null; error: string | null }> {
  const toUpload = file.type.startsWith('image/') ? await compressImage(file) : file
  const ext = toUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${userId}/cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from(CRED_DOC_BUCKET)
    .upload(fileName, toUpload, { contentType: toUpload.type, upsert: false })
  if (error) return { path: null, error: error.message }
  return { path: fileName, error: null }
}

// Helpers around user_credentials (v55). The DB is the authority — the
// record_form_signoff RPC re-checks that the signer holds a verified, in-date
// credential matching template.required_credential. These client helpers only
// drive UI affordance (disable the 簽署 button with a reason).

export function isCredentialValid(c: UserCredential): boolean {
  if (!c.verified_at) return false
  if (!c.valid_until) return true
  // Compare on date (HK), mirroring the SQL `c.valid_until >= current_date`.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })
  return c.valid_until >= today
}

// All of the CURRENT user's own credentials (RLS lets the owner read own rows).
export async function fetchMyCredentials(userId: string): Promise<UserCredential[]> {
  const { data, error } = await supabase
    .from('user_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('user_credentials fetch error:', error)
    return []
  }
  return (data || []) as UserCredential[]
}

// Does the user hold a verified, in-date credential of the required type?
export function hasMatchingCredential(
  credentials: UserCredential[],
  requiredType: string,
): boolean {
  return credentials.some(c => c.credential_type === requiredType && isCredentialValid(c))
}

// Owner-insert a credential (RLS: with check user_id = auth.uid()). verified_*
// stay null — only verify_user_credential sets them.
export async function addMyCredential(input: {
  user_id: string
  credential_type: string
  cert_name_zh: string
  cert_no?: string | null
  issuer?: string | null
  valid_from?: string | null
  valid_until?: string | null
  doc_path?: string | null
}): Promise<{ error: string | null }> {
  if (!input.cert_name_zh.trim()) return { error: '請輸入證書名稱' }
  if (!input.credential_type.trim()) return { error: '請選擇證書類別' }
  const { error } = await supabase.from('user_credentials').insert({
    user_id: input.user_id,
    credential_type: input.credential_type,
    cert_name_zh: input.cert_name_zh.trim(),
    cert_no: input.cert_no?.trim() || null,
    issuer: input.issuer?.trim() || null,
    valid_from: input.valid_from || null,
    valid_until: input.valid_until || null,
    doc_path: input.doc_path || null,
  })
  if (error) {
    if (error.message.toLowerCase().includes('row-level security')) {
      return { error: '只能新增自己的證書' }
    }
    return { error: error.message }
  }
  return { error: null }
}

// Admin / PM / safety_officer vouches for a credential (step-up gated server
// side via assert_step_up('membership')). The caller must mint that grant
// first (requireStepUp('membership')).
export async function verifyCredential(credentialId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('verify_user_credential', { p_credential_id: credentialId })
  if (error) return { error: error.message }
  return { error: null }
}

// Credential types known to the v1 template seed (required_credential values).
export const CREDENTIAL_TYPE_ZH: Record<string, string> = {
  competent_person: '合資格人員 (Competent Person)',
  competent_examiner: '合資格驗船 / 驗機師 (Competent Examiner)',
  rpe: '註冊專業工程師 (RPE)',
}

export function credentialTypeLabel(type: string): string {
  return CREDENTIAL_TYPE_ZH[type] ?? type
}
