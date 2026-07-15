import { APPROVAL_ACTION_ZH } from '../../types'
import type { Approval, ApprovalActionType, UserProfile } from '../../types'

function actionStyle(action: ApprovalActionType): string {
  switch (action) {
    case 'approve': return 'bg-green-100 text-green-700'
    case 'approve_with_edits': return 'bg-blue-50 text-blue-700'
    case 'request_revision': return 'bg-amber-100 text-amber-700'
    case 'reject': return 'bg-red-100 text-red-700'
    case 'admin_override': return 'bg-purple-100 text-purple-700'
    case 'delegate': return 'bg-site-100 text-site-700'
  }
}

function relativeTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (diff < 60) return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 日前`
  return new Date(iso).toLocaleDateString('zh-HK')
}

export interface SiTimelineProps {
  approvals: Approval[]
  usersById: Record<string, UserProfile>
}

export function SiTimeline({ approvals, usersById }: SiTimelineProps) {
  if (approvals.length === 0) {
    return <p className="text-sm text-site-500 py-4 text-center">尚未有簽核紀錄</p>
  }

  const sorted = approvals
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <ol className="space-y-3">
      {sorted.map(a => {
        const actor = usersById[a.actor_id]
        const initial = (actor?.name || '?').slice(0, 1)
        return (
          <li key={a.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-site-200 text-site-700 flex items-center justify-center font-semibold text-sm">
                {initial}
              </div>
              <div className="flex-1 w-px bg-site-200 mt-1" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 pb-3 border-b border-site-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${actionStyle(
                    a.action_type,
                  )}`}
                >
                  {APPROVAL_ACTION_ZH[a.action_type]}
                </span>
                <span className="text-sm text-site-800">{actor?.name || '未知用戶'}</span>
                <span className="text-[11px] text-site-400">{relativeTime(a.created_at)}</span>
              </div>
              {a.reason && (
                <p className="mt-1 text-sm text-site-700 whitespace-pre-wrap">{a.reason}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default SiTimeline
