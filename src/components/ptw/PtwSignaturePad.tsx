import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { X, Eraser, Check } from 'lucide-react'

interface PtwSignaturePadProps {
  onSign: (b64: string) => void | Promise<void>
  onCancel?: () => void
  title?: string
}

export function PtwSignaturePad({ onSign, onCancel, title = '請簽名' }: PtwSignaturePadProps) {
  const padRef = useRef<SignatureCanvas | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClear = () => {
    padRef.current?.clear()
    setError(null)
  }

  const handleSubmit = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('請先簽名')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Use the raw canvas, NOT getTrimmedCanvas(): the latter pulls in the
      // `trim-canvas` package whose default export breaks under the Vite/ESM
      // build ("import_trim_canvas.default is not a function"), throwing on every
      // sign. The full-canvas PNG embeds fine in the PDF / signoff record.
      const dataUrl = padRef.current.getCanvas().toDataURL('image/png')
      // Strip "data:image/png;base64," prefix so backend gets pure base64
      const b64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
      await onSign(b64)
    } catch (e) {
      setError(e instanceof Error ? e.message : '簽署失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-site-900">{title}</h3>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="取消">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="rounded-xl border-2 border-dashed border-site-300 bg-site-50 overflow-hidden">
        <SignatureCanvas
          ref={padRef}
          penColor="#0f172a"
          canvasProps={{
            className: 'w-full h-44 sm:h-56 touch-none',
            'aria-label': '簽名區',
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={handleClear}
          disabled={submitting}
        >
          <Eraser size={16} className="inline mr-1" />
          清除
        </button>
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={handleSubmit}
          disabled={submitting}
        >
          <Check size={16} className="inline mr-1" />
          {submitting ? '處理中...' : '確認簽名'}
        </button>
      </div>
    </div>
  )
}
