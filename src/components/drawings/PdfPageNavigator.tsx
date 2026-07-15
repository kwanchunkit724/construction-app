import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PdfPageNavigatorProps {
  current: number
  total: number
  onChange(next: number): void
}

export function PdfPageNavigator({ current, total, onChange }: PdfPageNavigatorProps) {
  const prevDisabled = current <= 1
  const nextDisabled = current >= total

  return (
    <div className="flex items-center justify-center gap-4 bg-black/70 text-white rounded-full px-4 py-2">
      <button
        type="button"
        onClick={() => onChange(current - 1)}
        disabled={prevDisabled}
        aria-label="上一頁"
        className="disabled:opacity-30 px-2"
      >
        <ChevronLeft size={22} />
      </button>
      <span className="text-base tabular-nums">
        {current} / {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(current + 1)}
        disabled={nextDisabled}
        aria-label="下一頁"
        className="disabled:opacity-30 px-2"
      >
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

export default PdfPageNavigator
