import { lazy, Suspense } from 'react'
import { Spinner } from '../Spinner'

// Lazy-load qrcode.react so the ~6 KB stays out of entry chunk.
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(m => ({ default: m.QRCodeSVG }))
)

interface Props {
  token: string | null
  error: string | null
}

export function QrCard({ token, error }: Props) {
  return (
    <div className="card p-4 space-y-2">
      <h3 className="text-base font-semibold text-site-900">驗證 QR</h3>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : token ? (
        <div className="flex flex-col items-center gap-2">
          <Suspense fallback={<Spinner size={32} />}>
            <div className="bg-white p-3 rounded-xl border border-site-200">
              <QRCodeSVG
                value={`${window.location.origin}/#/verify/${token}`}
                size={208}
                level="M"
                includeMargin
              />
            </div>
          </Suspense>
          <p className="text-xs text-site-500 text-center max-w-xs">
            巡查員以已登入帳號掃描以驗證。每次掃描會寫入 permit_scans 審計紀錄。
          </p>
        </div>
      ) : (
        <Spinner size={16} />
      )}
    </div>
  )
}
