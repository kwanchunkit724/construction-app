import { Link } from 'react-router-dom'
import { Clock, AlertTriangle } from 'lucide-react'
import { PTW_TYPE_ZH, PTW_STATUS_ZH } from '../../types'
import type { PTW } from '../../types'
import { isPtwExpired, effectivePtwStatus } from '../../lib/ptw'

function statusPill(status: PTW['status']): string {
  switch (status) {
    case 'draft':
    case 'revision_requested':
      return 'bg-amber-100 text-amber-700'
    case 'submitted':
    case 'in_review':
    case 'approved':
      return 'bg-blue-100 text-blue-700'
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'closed_out':
      return 'bg-site-100 text-site-700'
    case 'expired':
    case 'rejected':
      return 'bg-red-50 text-red-600'
    default:
      return 'bg-site-100 text-site-700'
  }
}

function formatExpiry(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function PtwCard({ ptw, projectId }: { ptw: PTW; projectId: string }) {
  // Stored status is 'active', but derive expiry client-side (no cron flips it).
  const expired = isPtwExpired(ptw)
  const displayStatus = effectivePtwStatus(ptw)
  const isActive = ptw.status === 'active' && !expired
  // Only warn 即將到期 for a still-valid permit within the last hour — a past
  // expiry must read 已過期, never 即將到期.
  const isExpiring = isActive && ptw.expires_at
    ? new Date(ptw.expires_at).getTime() - Date.now() < 60 * 60 * 1000
    : false

  return (
    <Link
      to={`/project/${projectId}/ptw/${ptw.id}`}
      className="card p-4 flex flex-col gap-2 transition-shadow hover:shadow-card-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-site-900">{ptw.number}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(displayStatus)}`}>
              {PTW_STATUS_ZH[displayStatus]}
            </span>
          </div>
          <p className="mt-1 text-sm text-site-600">{PTW_TYPE_ZH[ptw.ptw_type]}</p>
        </div>
        {ptw.status === 'active' && ptw.expires_at && (
          <div className={`text-right text-xs ${expired || isExpiring ? 'text-red-600' : 'text-site-500'}`}>
            <div className="flex items-center gap-1 justify-end">
              <Clock size={12} />
              <span>{expired ? '已過期' : '有效至'}</span>
            </div>
            <div className="font-medium">{formatExpiry(ptw.expires_at)}</div>
          </div>
        )}
      </div>
      {isActive && isExpiring && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle size={12} />
          <span>即將到期</span>
        </div>
      )}
      {expired && (
        <div className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle size={12} />
          <span>已過期 — 不可再施工</span>
        </div>
      )}
    </Link>
  )
}
