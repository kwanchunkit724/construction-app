import type { ProgressStatus } from '../types'

const BAR_COLOR: Record<ProgressStatus, string> = {
  'not-started': 'bg-site-300',
  'in-progress': 'bg-blue-500',
  'completed': 'bg-green-500',
  'delayed': 'bg-red-500',
  'blocked': 'bg-orange-500',
}

export function ProgressBar({
  value, planned, status, className = 'w-full',
}: {
  value: number
  planned: number
  status: ProgressStatus
  className?: string
}) {
  return (
    <div className={`relative h-2 bg-site-100 rounded-full overflow-hidden ${className}`}>
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-site-500 z-10"
        style={{ left: `${Math.min(planned, 100)}%` }}
        aria-label="計劃進度"
      />
      <div
        className={`h-full rounded-full transition-all ${BAR_COLOR[status]}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}
