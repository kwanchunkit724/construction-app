import { useState } from 'react'
import { ChevronDown, ChevronRight, GraduationCap, Camera, Search } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH } from '../types'
import { orderedTutorials } from '../lib/tutorials'
import { TutorialView, tutorialIcon } from '../components/tutorial/TutorialView'

// Tutorials everyone should see regardless of role filter.
const ALWAYS = ['quick-start', 'auth-register-login', 'apply-join-project', 'account-deletion', 'push-notifications', 'offline-readonly-cache']

export default function Help() {
  const { profile } = useAuth()
  const all = orderedTutorials()
  const myLabel = profile ? ROLE_ZH[profile.global_role] : ''
  const [query, setQuery] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(all[0]?.key ?? null)
  const [expandAll, setExpandAll] = useState(false)

  const tutorials = all.filter(t => {
    const q = query.trim()
    if (q && !(t.title.includes(q) || t.summary.includes(q))) return false
    if (mineOnly && myLabel && !ALWAYS.includes(t.key)) {
      const inRoles = t.roles.some(r => r.role.includes(myLabel) || myLabel.includes(r.role))
      if (!inRoles) return false
    }
    return true
  })

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

        {/* Search + role filter */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜尋功能…"
              className="input pl-9 py-2"
            />
          </div>
          {myLabel && (
            <button
              type="button"
              onClick={() => setMineOnly(v => !v)}
              className={`text-xs font-semibold rounded-full px-3 py-2 border whitespace-nowrap min-h-0 ${mineOnly ? 'bg-safety-500 text-white border-safety-500' : 'bg-white text-site-600 border-site-200'}`}
            >
              我相關
            </button>
          )}
        </div>

        {/* Catalogue */}
        {tutorials.length === 0 && (
          <p className="text-sm text-site-400 text-center py-8">冇符合嘅教學</p>
        )}
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
