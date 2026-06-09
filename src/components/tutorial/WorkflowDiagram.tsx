import { ArrowDown, Eye } from 'lucide-react'
import type { TutorialFlowNode } from '../../lib/tutorials'

// Map a zh-HK role label to a brand colour by keyword. Falls back to neutral.
const ROLE_STYLES: { match: string; cls: string }[] = [
  { match: '管理員', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { match: 'admin', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { match: '項目經理', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { match: 'PM', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { match: '老總', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { match: '主任', cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { match: '安全', cls: 'bg-red-100 text-red-700 border-red-200' },
  { match: '總承建商', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  { match: '工程師', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  { match: '管工', cls: 'bg-teal-100 text-teal-700 border-teal-200' },
  { match: '判頭工人', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { match: '工人', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { match: '判頭', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { match: '業主', cls: 'bg-green-100 text-green-700 border-green-200' },
  { match: '系統', cls: 'bg-site-200 text-site-700 border-site-300' },
  { match: '訪客', cls: 'bg-site-100 text-site-600 border-site-200' },
]
export function roleStyle(label: string): string {
  for (const r of ROLE_STYLES) if (label.includes(r.match)) return r.cls
  return 'bg-site-100 text-site-700 border-site-200'
}

export function RoleBadge({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${roleStyle(label)} ${className}`}>
      {label}
    </span>
  )
}

// Renders a function's lifecycle as a clean, presentation-ready vertical flow:
// numbered step → actor badge + action → who can SEE the result → optional note.
export function WorkflowDiagram({ flow }: { flow: TutorialFlowNode[] }) {
  if (!flow || flow.length === 0) {
    return <p className="text-sm text-site-400">（暫無流程圖）</p>
  }
  return (
    <div className="flex flex-col items-stretch">
      {flow.map((node, i) => (
        <div key={i}>
          <div className="flex gap-3">
            {/* step index rail */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-safety-500 text-white grid place-items-center text-xs font-bold shadow-card">
                {i + 1}
              </div>
            </div>
            {/* step card */}
            <div className="flex-1 min-w-0 card p-3 mb-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <RoleBadge label={node.actor} />
                <span className="text-sm font-semibold text-site-900">{node.action}</span>
              </div>
              <div className="flex items-start gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-site-500 mt-0.5">
                  <Eye size={12} /> 可見：
                </span>
                {node.seenBy.length === 0 ? (
                  <span className="text-[10px] text-site-400">—</span>
                ) : (
                  node.seenBy.map((r, j) => (
                    <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${roleStyle(r)}`}>{r}</span>
                  ))
                )}
              </div>
              {node.note && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2">
                  {node.note}
                </p>
              )}
            </div>
          </div>
          {i < flow.length - 1 && (
            <div className="flex justify-start pl-[14px] py-0.5">
              <ArrowDown size={16} className="text-site-300" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
