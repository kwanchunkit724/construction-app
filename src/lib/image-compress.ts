// Browser-side image downscale + recompress.
// Used by PTW PPE/scene/worker photo upload paths to keep storage
// budget tight (Supabase Free tier 1GB total) — drawings + permit
// photos dominate. Original max-edge 4000+px iPhone shots ~5MB
// become ~300-600KB at 1920px / JPEG 0.8.
//
// Falls back to the original File if anything throws (corrupt file,
// HEIC unsupported in browser, etc.) so the upload still has a shot.

const DEFAULT_MAX_EDGE = 1920
const DEFAULT_QUALITY = 0.82

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts.quality ?? DEFAULT_QUALITY

  if (!file.type.startsWith('image/')) return file
  if (file.size < 200 * 1024) return file // <200KB: not worth recompressing

  try {
    const bitmap = await createImageBitmap(file)
    const { width: w0, height: h0 } = bitmap
    const scale = Math.min(1, maxEdge / Math.max(w0, h0))
    const w = Math.round(w0 * scale)
    const h = Math.round(h0 * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
    if (!blob) return file

    // Always end with .jpg — canvas re-encode is JPEG regardless of input.
    const stem = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

export async function compressImages(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) out.push(await compressImage(f))
  return out
}
