import { WifiOff } from 'lucide-react'

// Shown above any PTW state-changing surface when device is offline.
// Server RPCs (submit/approve/close-out/sign) require network — without
// this gate the action would silently fail at fetch timeout (15s).

export function OfflineBanner() {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center gap-2">
      <WifiOff size={18} className="flex-shrink-0" />
      <span>需要網絡連接才能完成此操作</span>
    </div>
  )
}
