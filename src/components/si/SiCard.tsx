import { ChevronRight, FileText } from 'lucide-react'
import { SI_STATUS_ZH } from '../../types'
import type { SI, SIVersion, SiStatus } from '../../types'

// Status pill colour mapping consistent with IssueCard idiom.
function statusStyle(status: SiStatus): string {
  switch (status) {
    case 'draft': return 'bg-site-100 text-site-700'
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'in_review': return 'bg-amber-100 text-amber-700'
    case 'approved': return 'bg-green-100 text-green-700'
    case 'locked': return 'bg-site-900 text-white'
    case 'revision_requested': return 'bg-orange-100 text-orange-700'
    case 'rejected': return 'bg-red-100 text-red-700'
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(1, Math.floor((now - then) / 1000))
  if (diffSec < 60) return `${diffSec} 秒前`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分鐘前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小時前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} 日前`
  return new Date(iso).toLocaleDateString('zh-HK')
}

export interface SiCardProps {
  si: SI
  latestVersion?: SIVersion
  creatorName?: string
  onTap: (siId: string) => void
}

export function SiCard({ si, latestVersion, creatorName, onTap }: SiCardProps) {
  const title = latestVersion?.payload?.title || '(未填寫標題)'
  const stepLabel =
    si.status === 'in_review' && si.chain_snapshot && si.chain_snapshot.length > 0
      ? `步驟 ${Math.min(si.current_step + 1, si.chain_snapshot.length)}/${si.chain_snapshot.length}`
      : null

  return (
    <button
      type="button"
      onClick={() => onTap(si.id)}
      className="card p-3 hover:border-safety-300 transition-colors mb-2 w-full text-left block"
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-site-100 text-site-600">
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle(
                si.status,
              )}`}
            >
              {SI_STATUS_ZH[si.status]}
            </span>
            <span className="text-[11px] font-mono text-site-500">{si.number}</span>
            <span className="text-[10px] text-site-400">{relativeTime(si.created_at)}</span>
          </div>
          <p className="font-semibold text-site-900 line-clamp-2 mt-1">{title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-site-500">
            {stepLabel && (
              <span className="inline-flex items-center bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                {stepLabel}
              </span>
            )}
            {creatorName && <span>由 {creatorName} 建立</span>}
          </div>
        </div>
        <ChevronRight size={18} className="text-site-300 self-center flex-shrink-0" />
      </div>
    </button>
  )
}

export default SiCard
