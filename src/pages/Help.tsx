import { useState } from 'react'
import { ChevronDown, ChevronRight, GraduationCap, Camera } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { orderedTutorials } from '../lib/tutorials'
import { TutorialView, tutorialIcon } from '../components/tutorial/TutorialView'

export default function Help() {
  const tutorials = orderedTutorials()
  const [openKey, setOpenKey] = useState<string | null>(tutorials[0]?.key ?? null)
  const [expandAll, setExpandAll] = useState(false)

  return (
    <AppLayout title="教學">
      <div className="max-w-2xl mx-auto">
        {/* Intro */}
        <div className="card p-4 mb-4 bg-safety-50/50 border-safety-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-safety-500 text-white grid place-items-center flex-shrink-0">
              <GraduationCap size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-site-900">使用教學</h1>
              <p className="text-sm text-site-600 mt-0.5">
                每個功能都有清楚流程圖：邊個做、跟住點流轉、邊個睇到結果。第一次用唔使估。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => { setExpandAll(v => !v); setOpenKey(null) }}
              className="btn-ghost text-xs inline-flex items-center gap-1"
            >
              {expandAll ? '收起全部' : '全部展開'}
            </button>
            <span className="inline-flex items-center gap-1 text-[11px] text-site-400">
              <Camera size={13} /> 任何流程圖都可截圖俾客戶睇
            </span>
          </div>
        </div>

        {/* Catalogue */}
        <div className="space-y-2">
          {tutorials.map(t => {
            const Icon = tutorialIcon(t.icon)
            const open = expandAll || openKey === t.key
            return (
              <div key={t.key} className="card p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setExpandAll(false); setOpenKey(open && !expandAll ? null : t.key) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-site-50"
                >
                  <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center flex-shrink-0">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-site-900 text-sm">{t.title}</p>
                    <p className="text-xs text-site-500 truncate">{t.summary}</p>
                  </div>
                  {open ? <ChevronDown size={18} className="text-site-400 flex-shrink-0" /> : <ChevronRight size={18} className="text-site-400 flex-shrink-0" />}
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-site-100">
                    <TutorialView tutorial={t} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppLayout>
  )
}
