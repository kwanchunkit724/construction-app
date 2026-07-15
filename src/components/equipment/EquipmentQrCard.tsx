import { lazy, Suspense } from 'react'
import { Printer } from 'lucide-react'
import { Spinner } from '../Spinner'
import { equipmentPublicUrl } from '../../lib/publicVerify'

// Lazy-load qrcode.react so the ~6 KB stays out of entry chunk.
// Mirrors src/components/ptw/PtwQrCard.tsx — same QR rendering, tuned for
// equipment (ref_no + name + a 列印 button that opens the print sheet).
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
)

interface Props {
  token: string | null
  error: string | null
  refNo: string
  nameZh: string
  onPrint?: () => void
}

export function EquipmentQrCard({ token, error, refNo, nameZh, onPrint }: Props) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-site-900">機械 QR</h3>
        {token && onPrint && (
          <button type="button" className="btn-ghost text-sm" onClick={onPrint}>
            <Printer size={14} className="inline mr-1" /> 列印
          </button>
        )}
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : token ? (
        <div className="flex flex-col items-center gap-2">
          <Suspense fallback={<Spinner size={32} />}>
            <div className="bg-white p-3 rounded-xl border border-site-200">
              <QRCodeSVG
                value={equipmentPublicUrl(token)}
                size={208}
                level="M"
                includeMargin
              />
            </div>
          </Suspense>
          <p className="font-mono text-xs text-site-500">{refNo}</p>
          <p className="text-sm font-semibold text-site-900 text-center">{nameZh}</p>
          <p className="text-xs text-site-500 text-center max-w-xs">
            貼於機械上，任何人用手機掃描即可核實法定表格狀態（無需登入）。每次掃描會寫入 equipment_scans 審計紀錄。
          </p>
        </div>
      ) : (
        <Spinner size={16} />
      )}
    </div>
  )
}
