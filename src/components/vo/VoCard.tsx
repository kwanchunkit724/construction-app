import { ChevronRight, FileText } from 'lucide-react'
import { VO_STATUS_ZH } from '../../types'
import type { VO, VoStatus } from '../../types'
import { formatHKD } from '../../lib/currency'

function statusStyle(status: VoStatus): string {
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

export interface VoCardProps {
  vo: VO
  parentSiNumber?: string
  creatorName?: string
  onTap: (voId: string) => void
}

export function VoCard({ vo, parentSiNumber, creatorName, onTap }: VoCardProps) {
  const stepLabel =
    vo.status === 'in_review' && vo.chain_snapshot && vo.chain_snapshot.length > 0
      ? `步驟 ${Math.min(vo.current_step + 1, vo.chain_snapshot.length)}/${vo.chain_snapshot.length}`
      : null

  return (
    <button
      type="button"
      onClick={() => onTap(vo.id)}
      className="card p-3 hover:border-safety-300 transition-colors mb-2 w-full text-left block"
    >
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-700">
          <FileText size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle(
                vo.status,
              )}`}
            >
              {VO_STATUS_ZH[vo.status]}
            </span>
            <span className="text-[11px] font-mono text-site-500">{vo.number}</span>
            <span className="text-[10px] text-site-400">{relativeTime(vo.created_at)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-bold text-site-900 tabular-nums">
              {formatHKD(vo.total_amount_cents)}
            </span>
            {stepLabel && (
              <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">
                {stepLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-site-500">
            {parentSiNumber && (
              <span>源於 <span className="font-mono">{parentSiNumber}</span></span>
            )}
            {creatorName && <span>· 由 {creatorName} 提出</span>}
          </div>
        </div>
        <ChevronRight size={18} className="text-site-300 self-center flex-shrink-0" />
      </div>
    </button>
  )
}

export default VoCard
