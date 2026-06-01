import { WifiOff } from 'lucide-react'
import { useOnline } from '../lib/offline'

// App-wide connectivity indicator (distinct from the static PTW-surface
// OfflineBanner). Renders nothing while online; shows a thin amber bar when
// connectivity drops so users understand why saving is blocked and that the
// data on screen is the last-synced copy.
export function OfflineBar() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      className="bg-amber-100 border-b border-amber-200 text-amber-800"
      role="status"
    >
      <div className="max-w-2xl md:max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <WifiOff size={16} className="flex-shrink-0" />
        <span>離線中 — 顯示最後同步資料，無法儲存變更。</span>
      </div>
    </div>
  )
}
