import { supabase } from './supabase'

const BUCKET = 'project-files'

/**
 * Upload a file to Supabase Storage and return its public URL.
 * Returns null if the upload fails.
 */
export async function uploadFile(file: File, path: string): Promise<string | null> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, cacheControl: '3600' })

  if (error) {
    console.error('Storage upload error:', error)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Build a storage path for issue photos */
export function issuePhotoPath(projectId: string, filename: string) {
  return `${projectId}/issues/${Date.now()}-${filename.replace(/\s+/g, '_')}`
}

/** Build a storage path for NCR photos */
export function ncrPhotoPath(projectId: string, filename: string) {
  return `${projectId}/ncr/${Date.now()}-${filename.replace(/\s+/g, '_')}`
}
