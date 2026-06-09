import { X } from 'lucide-react'
import { getTutorial } from '../../lib/tutorials'
import { TutorialView } from './TutorialView'

// Lazy-loaded modal body for a single tutorial. Importing this pulls the full
// tutorial dataset + TutorialView into a separate chunk (see HelpButton).
export default function TutorialModalContent({
  tutorialKey, onClose, onSeeAll,
}: {
  tutorialKey: string
  onClose: () => void
  onSeeAll: () => void
}) {
  const tutorial = getTutorial(tutorialKey)
  if (!tutorial) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-site-100 sticky top-0 bg-white rounded-t-2xl">
          <span className="font-bold text-site-900">教學</span>
          <button type="button" onClick={onClose} className="text-site-400 hover:text-site-700 -mr-2" aria-label="關閉">
            <X size={22} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <TutorialView tutorial={tutorial} />
        </div>
        <div className="px-5 py-3 border-t border-site-100 bg-white">
          <button type="button" onClick={onSeeAll} className="btn-ghost w-full">查看全部教學</button>
        </div>
      </div>
    </div>
  )
}
