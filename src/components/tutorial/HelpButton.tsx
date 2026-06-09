import { useState, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { SCREEN_TUTORIAL, hasTutorial } from '../../lib/tutorialKeys'

// Heavy content (TutorialView + the 80KB dataset) is split into a lazy chunk so
// the always-mounted HelpButton (in AppLayout) keeps the entry bundle lean.
const TutorialModalContent = lazy(() => import('./TutorialModalContent'))

// Infer the tutorial screen key from the current hash route.
function screenFromPath(pathname: string): string | null {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  const m = pathname.match(/^\/project\/[^/]+\/([^/]+)/)
  if (m) {
    const seg = m[1]
    if (['si', 'vo', 'ptw', 'daily', 'materials', 'timetable', 'contacts', 'drawings'].includes(seg)) return seg
    if (seg === 'issue') return 'issues'
    return null
  }
  if (/^\/project\/[^/]+$/.test(pathname)) return 'progress'
  return null
}

// A "?教學" button. Pass an explicit tutorialKey/screenKey, or let it auto-detect
// from the route so EVERY section gets a contextual tutorial from one mount.
export function HelpButton({
  tutorialKey, screenKey, variant = 'icon', label = '教學',
}: {
  tutorialKey?: string
  screenKey?: string
  variant?: 'icon' | 'pill'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const resolvedKey =
    tutorialKey ??
    (screenKey ? SCREEN_TUTORIAL[screenKey] : undefined) ??
    (() => { const s = screenFromPath(location.pathname); return s ? SCREEN_TUTORIAL[s] : undefined })()

  function onClick() {
    if (hasTutorial(resolvedKey)) setOpen(true)
    else navigate('/help') // no specific match → full 教學 index
  }

  return (
    <>
      {variant === 'pill' ? (
        <button type="button" onClick={onClick}
          className="inline-flex items-center gap-1 text-xs font-semibold text-safety-600 bg-safety-50 hover:bg-safety-100 rounded-full px-2.5 py-1 min-h-0">
          <HelpCircle size={14} /> {label}
        </button>
      ) : (
        <button type="button" onClick={onClick} aria-label="教學"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-site-500 hover:text-safety-600 hover:bg-safety-50">
          <HelpCircle size={20} />
        </button>
      )}

      {open && resolvedKey && (
        <Suspense fallback={null}>
          <TutorialModalContent
            tutorialKey={resolvedKey}
            onClose={() => setOpen(false)}
            onSeeAll={() => { setOpen(false); navigate('/help') }}
          />
        </Suspense>
      )}
    </>
  )
}
