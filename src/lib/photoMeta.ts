import { Geolocation } from '@capacitor/geolocation'
import { supabase } from './supabase'

// B2 / DWSS §3.3.3 — capture date/time + WGS84 GPS for site photos at the moment
// of capture, persisted append-only in photo_metadata (v79). Best-effort: GPS is
// optional (non-blocking on permission denial), recording never blocks the parent
// record (issue / PTW / etc.).

export interface PhotoGeo {
  lat: number
  lng: number
  accuracy_m: number
}

// Coarse WGS84 location (mirrors GeoPicker's D-09/D-19 settings). Returns null on
// denial / timeout so callers can proceed without a location.
export async function capturePhotoGeo(): Promise<PhotoGeo | null> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60000,
    })
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: Math.round(pos.coords.accuracy ?? 0),
    }
  } catch (e) {
    console.warn('capturePhotoGeo skipped:', e)
    return null
  }
}

// Append-only metadata insert. Idempotent on (bucket, photo_path); a duplicate
// (23505) is ignored. All failures are logged + swallowed — metadata must never
// block the photo's parent record.
export async function recordPhotoMeta(args: {
  projectId: string
  bucket: string
  photoPath: string
  capturedAt: string // ISO 8601
  geo: PhotoGeo | null
  uploadedBy: string
}): Promise<void> {
  try {
    const { error } = await supabase.from('photo_metadata').insert({
      project_id: args.projectId,
      bucket: args.bucket,
      photo_path: args.photoPath,
      captured_at: args.capturedAt,
      gps_lat: args.geo?.lat ?? null,
      gps_lng: args.geo?.lng ?? null,
      gps_accuracy_m: args.geo?.accuracy_m ?? null,
      uploaded_by: args.uploadedBy,
    })
    if (error && error.code !== '23505') {
      console.warn('recordPhotoMeta error:', error.message)
    }
  } catch (e) {
    console.warn('recordPhotoMeta failed:', e)
  }
}
