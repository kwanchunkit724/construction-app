import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronRight, ArrowUp, MessageCircle } from 'lucide-react'
import { ISSUE_HANDLER_ZH, ISSUE_STATUS_ZH } from '../types'
import type { Issue } from '../types'

export function IssueCard({ issue, projectId }: { issue: Issue; projectId: string }) {
  const isOpen = issue.status === 'open'
  const Icon = isOpen ? AlertCircle : CheckCircle2
  const statusStyle = isOpen
    ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700'

  return (
    <Link
      to={`/project/${projectId}/issue/${issue.id}`}
      className="card p-4 flex gap-3 hover:border-safety-300 transition-colors mb-2"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isOpen ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
      }`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-site-900 truncate">{issue.title}</p>
        {issue.description && (
          <p className="text-xs text-site-500 mt-0.5 line-clamp-1">{issue.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle}`}>
            <Icon size={10} /> {ISSUE_STATUS_ZH[issue.status]}
          </span>
          {isOpen && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              <ArrowUp size={10} /> 處理層：{ISSUE_HANDLER_ZH[issue.current_handler_role]}
            </span>
          )}
          <span className="text-[10px] text-site-400">
            {new Date(issue.created_at).toLocaleDateString('zh-HK')}
          </span>
        </div>
      </div>
      <ChevronRight size={18} className="text-site-300 self-center flex-shrink-0" />
    </Link>
  )
}
