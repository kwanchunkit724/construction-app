import { supabase } from './supabase'

// issue-photos is (becoming) a PRIVATE bucket — photos are rendered via short-lived
// signed URLs, never public URLs. A stored photo value can be one of:
//   - a bare storage path: "<uploaderId>/<file>.jpg"  (uploads after the v74 flip)
//   - a legacy full PUBLIC url: ".../object/public/issue-photos/<path>"  (pre-v74 rows)
//   - a signed url: ".../object/sign/issue-photos/<path>?token=..."
// signIssuePhoto normalises any of these to a path, then signs it — so the read
// path works for BOTH old and new values without a DB backfill.

const BUCKET = 'issue-photos'
const TTL_SECONDS = 3600

export function issuePhotoPath(stored: string): string {
  if (!stored) return stored
  for (const marker of [`/object/public/${BUCKET}/`, `/object/sign/${BUCKET}/`, `/${BUCKET}/`]) {
    const i = stored.indexOf(marker)
    if (i >= 0) return stored.slice(i + marker.length).split('?')[0]
  }
  return stored // already a bare path
}

// Resolve a stored value to a displayable signed URL. Falls back to the stored
// value on error (offline, or the bucket is still public pre-flip) so we never
// render a broken <img> for a value that may still be a working URL.
export async function signIssuePhoto(stored: string): Promise<string> {
  if (!stored) return stored
  const path = issuePhotoPath(stored)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error || !data?.signedUrl) return stored
  return data.signedUrl
}
