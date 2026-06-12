import { lazy, Suspense } from 'react'
import { Printer, X } from 'lucide-react'
import { Spinner } from '../Spinner'

// Printable A6-ish grid of equipment QR cards. Reuses the same qrcode.react
// QRCodeSVG as EquipmentQrCard / PtwQrCard. Rendered as a full-screen overlay
// with print-CSS (matches src/pages/Takeaway.tsx's window.print() approach —
// the codebase has no PDF-QR path, so print-to-PDF is the established pattern).
//
// Used by:
//   - EquipmentDetail 「列印」 (single card)
//   - EquipmentList 「列印全部 QR」 (every equipment in the project)
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
)

export interface QrPrintCard {
  equipmentId: string
  refNo: string
  nameZh: string
  token: string | null
  error: string | null
}

interface Props {
  cards: QrPrintCard[]
  title: string
  onClose: () => void
}

export function EquipmentQrPrintSheet({ cards, title, onClose }: Props) {
  const ready = cards.length > 0 && cards.every(c => c.token !== null || c.error !== null)

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto print:static print:overflow-visible">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .qr-sheet { padding: 0 !important; }
        }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-site-200 px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-site-600">{title} — 列印或另存 PDF</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => window.print()}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-60"
          >
            <Printer size={16} /> 列印 / 存 PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost text-sm px-3 py-2 flex items-center gap-1"
            aria-label="關閉"
          >
            <X size={16} /> 關閉
          </button>
        </div>
      </div>

      {!ready && (
        <div className="no-print py-8 text-center">
          <Spinner size={28} />
          <p className="text-xs text-site-500 mt-2">產生 QR 中...</p>
        </div>
      )}

      {/* The grid — two columns at A6-ish per cell. */}
      <div className="qr-sheet p-4 grid grid-cols-2 gap-4">
        {cards.map(c => (
          <div
            key={c.equipmentId}
            className="border border-site-300 rounded-xl p-4 flex flex-col items-center text-center break-inside-avoid"
            style={{ pageBreakInside: 'avoid' }}
          >
            {c.error ? (
              <p className="text-xs text-red-600 py-8">產生 QR 失敗：{c.error}</p>
            ) : c.token ? (
              <Suspense fallback={<Spinner size={24} />}>
                <div className="bg-white p-2 rounded-lg border border-site-200">
                  <QRCodeSVG
                    value={`${window.location.origin}/#/equipment-verify/${c.token}`}
                    size={160}
                    level="M"
                    includeMargin
                  />
                </div>
              </Suspense>
            ) : (
              <div className="py-8"><Spinner size={24} /></div>
            )}
            <p className="font-mono text-xs text-site-500 mt-2">{c.refNo}</p>
            <p className="text-sm font-bold text-site-900">{c.nameZh}</p>
            <p className="text-[10px] text-site-400 mt-1">掃描以核實表格狀態</p>
          </div>
        ))}
      </div>
    </div>
  )
}
