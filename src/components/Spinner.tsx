import { Loader2 } from 'lucide-react'

export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin text-site-400 ${className}`} />
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-site-50">
      <Spinner size={32} />
      {label && <p className="text-sm text-site-500">{label}</p>}
    </div>
  )
}
