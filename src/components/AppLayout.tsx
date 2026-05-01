import { ReactNode } from 'react'
import { BottomNav } from './BottomNav'

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      {title && (
        <header
          className="sticky top-0 z-30 bg-white border-b border-site-200"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3">
            <h1 className="text-lg font-bold text-site-900">{title}</h1>
          </div>
        </header>
      )}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-4 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
