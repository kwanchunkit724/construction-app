import { useState, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { SCREEN_TUTORIAL, hasTutorial } from '../../lib/tutorialKeys'

// Heavy content (TutorialView + the 80KB dataset) is split into a lazy chunk so
// the always-mounted HelpButton (in AppLayout) keeps the entry bundle lean.
const TutorialModalContent = lazy(() => import('./TutorialModalContent'))

// Screens that aren't in SCREEN_TUTORIAL's section map but still want a tutorial.
const EXTRA_SCREEN: Record<string, string> = {
  'admin-users': 'user-role-management',
  'admin-chains': 'approval-chain-config',
  'projects-list': 'apply-join-project',
}

// Infer the tutorial screen key from the current hash route. ORDER MATTERS:
// match the specific admin sub-routes BEFORE the bare /admin, else they all
// resolve to the project-management tutorial (wrong tutorial is worse than none).
function screenFromPath(pathname: string): string | null {
  if (pathname.startsWith('/admin/users')) return 'admin-users'
  if (/^\/admin\/projects\/[^/]+\/chains/.test(pathname)) return 'admin-chains'
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
  if (pathname.startsWith('/projects')) return 'projects-list'
  return null
}

function keyForScreen(screen: string | null): string | undefined {
  if (!screen) return undefined
  return SCREEN_TUTORIAL[screen] ?? EXTRA_SCREEN[screen]
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
    (screenKey ? keyForScreen(screenKey) : undefined) ??
    keyForScreen(screenFromPath(location.pathname))

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
