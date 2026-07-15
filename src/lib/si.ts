import { supabase } from './supabase'

// Private storage bucket created in Plan 02-01 (v9-si-vo-storage-bucket.sql).
// Path scheme per D-09: {project_id}/si/{si_id}/v{n}/photos/{filename}
//                       {project_id}/si/{si_id}/v{n}/voice.m4a
const BUCKET = 'project-si-vo'

function siBasePath(projectId: string, siId: string, versionNo: number): string {
  return `${projectId}/si/${siId}/v${versionNo}`
}

export async function uploadSiPhotos(
  projectId: string,
  siId: string,
  versionNo: number,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  const out: string[] = []
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      return { paths: out, error: '相片大過 10 MB，請壓縮後再上載' }
    }
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const path = `${siBasePath(projectId, siId, versionNo)}/photos/${safe}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f, { cacheControl: '3600', upsert: false, contentType: f.type })
    if (error) return { paths: out, error: error.message }
    out.push(path)
  }
  return { paths: out, error: null }
}

export async function uploadSiVoice(
  projectId: string,
  siId: string,
  versionNo: number,
  blob: Blob,
): Promise<{ path: string | null; error: string | null }> {
  if (blob.size > 5 * 1024 * 1024) {
    return { path: null, error: '錄音大過 5 MB，請縮短後重錄' }
  }
  const path = `${siBasePath(projectId, siId, versionNo)}/voice.m4a`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: 'audio/m4a' })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function signedUrlFor(path: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// Defence-in-depth: refuse any path not starting with this project's UUID.
// Mirrors Phase 1 T-01-06 spoofing mitigation. Storage RLS is the primary
// gate; this just stops obviously-wrong client requests before they hit
// the network.
export function validateSiPath(projectId: string, path: string): boolean {
  return path.startsWith(`${projectId}/`)
}
