import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { compressImages } from '../../lib/image-compress'

// Multi-photo capture for PTW submit form.
// - Uses native <input type="file" accept="image/*" capture="environment">
//   which Capacitor WebView (WKWebView / Android Chrome WebView) supports
//   end-to-end — opens the camera UI on iOS + Android and the file picker
//   on desktop. No @capacitor/camera dependency needed for this entry flow.
// - Compresses each shot to ~1920px / JPEG 0.82 before staging — keeps
//   Supabase storage budget tight.
// - Preview tiles are object-URL <img> elements, revoked on remove/unmount.

interface Props {
  label: string
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  hint?: string
}

export function PtwPhotoPicker({ label, files, onChange, max = 6, hint }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [previews, setPreviews] = useState<string[]>([])

  function syncPreviews(next: File[]) {
    // Revoke old URLs to avoid memory leak (mobile WebView limited).
    previews.forEach(URL.revokeObjectURL)
    setPreviews(next.map((f) => URL.createObjectURL(f)))
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // reset so same file can be re-picked
    if (picked.length === 0) return
    setBusy(true)
    try {
      const compressed = await compressImages(picked)
      const next = [...files, ...compressed].slice(0, max)
      onChange(next)
      syncPreviews(next)
    } finally {
      setBusy(false)
    }
  }

  function removeAt(idx: number) {
    const next = files.filter((_, i) => i !== idx)
    onChange(next)
    syncPreviews(next)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy || files.length >= max}
        >
          <Camera size={14} className="inline mr-1" />
          {busy ? '處理中...' : `加入相片 (${files.length}/${max})`}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handlePick}
      />
      {hint && <p className="text-xs text-site-500 mt-1">{hint}</p>}
      {previews.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {previews.map((src, idx) => (
            <div key={src} className="relative aspect-square rounded-xl overflow-hidden bg-site-100">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="刪除"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
