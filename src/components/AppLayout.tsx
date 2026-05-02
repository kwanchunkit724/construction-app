import { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'

/**
 * Mobile: header + main + bottom nav (unchanged)
 * Desktop (md+): sidebar on left + wider main content, no bottom nav
 */
export function AppLayout({
  children, title, wide = false,
}: {
  children: ReactNode
  title?: string
  /** Use wide container on desktop (max-w-7xl) for data-heavy pages */
  wide?: boolean
}) {
  const desktopMaxWidth = wide ? 'md:max-w-7xl' : 'md:max-w-5xl'

  return (
    <div className="min-h-screen bg-site-50 flex flex-col">
      <Sidebar />

      {/* Content area — pushed right on desktop to clear sidebar */}
      <div className="flex-1 flex flex-col md:pl-60 lg:pl-64">
        {title && (
          <header
            className="sticky top-0 z-30 bg-white border-b border-site-200"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className={`max-w-2xl ${desktopMaxWidth} mx-auto px-4 md:px-6 py-3`}>
              <h1 className="text-lg md:text-xl font-bold text-site-900">{title}</h1>
            </div>
          </header>
        )}
        <main className={`flex-1 max-w-2xl ${desktopMaxWidth} w-full mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-10`}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
