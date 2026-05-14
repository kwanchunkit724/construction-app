import { Check } from 'lucide-react'
import { formatHKD } from '../../lib/currency'

export interface VoConfirmationScreenProps {
  voId: string
  serverTotal: number
  voNumber: string
  onClose: () => void
  onViewDetail?: (voId: string) => void
}

/**
 * Post-submit confirmation (VO-06 / D-19).
 *
 * Renders the server-confirmed total — NOT the client preview — so that
 * any discrepancy between client and server computation is immediately
 * visible to the submitter. The label `經系統核算總額` is the exact zh-HK
 * string from VO-06 acceptance criteria.
 */
export function VoConfirmationScreen({
  voId, serverTotal, voNumber, onClose, onViewDetail,
}: VoConfirmationScreenProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 text-green-700 flex items-center justify-center mb-3">
          <Check size={32} />
        </div>
        <h2 className="text-lg font-bold text-site-900">
          變更指令 <span className="font-mono">{voNumber}</span> 已提交
        </h2>
        <p className="text-sm text-site-600 mt-1">已送出至審批流程</p>

        <div className="my-5 py-4 border-y border-site-100">
          <p className="text-sm text-site-600">經系統核算總額</p>
          <p className="text-2xl font-bold text-site-900 tabular-nums mt-1">
            {formatHKD(serverTotal)}
          </p>
          <p className="text-[10px] text-site-400 mt-1">
            (以系統計算為準)
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1"
          >
            關閉
          </button>
          {onViewDetail && (
            <button
              type="button"
              onClick={() => onViewDetail(voId)}
              className="btn-primary flex-1"
            >
              查看詳情
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VoConfirmationScreen
