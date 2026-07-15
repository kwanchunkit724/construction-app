import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import type { ChainStep, UserProfile, GlobalRole } from '../../types'
import { ROLE_ZH } from '../../types'

// safety_officer is now a real GlobalRole (added Phase 3 Plan 03-01).
// Keep the local widening alias since other phases may have their own
// chain-only pseudo-roles in the future.
type ChainRole = GlobalRole

const CHAIN_ROLE_ZH: Record<ChainRole, string> = ROLE_ZH

const CHAIN_ROLE_OPTIONS: ChainRole[] = [
  'pm',
  'main_contractor',
  'subcontractor',
  'safety_officer',
  'owner',
]

interface Props {
  step: ChainStep
  index: number
  isFirst: boolean
  isLast: boolean
  canRemove: boolean
  projectMembers: UserProfile[]
  onChange: (next: ChainStep) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function ChainStepRow({
  step,
  index,
  isFirst,
  isLast,
  canRemove,
  projectMembers,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  const [userQuery, setUserQuery] = useState('')

  const filteredMembers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return projectMembers.slice(0, 8)
    return projectMembers.filter(u =>
      u.name.toLowerCase().includes(q) || u.phone.includes(q)
    ).slice(0, 8)
  }, [projectMembers, userQuery])

  const selectedUser = projectMembers.find(u => u.id === step.optional_user_id) || null

  return (
    <div className="card p-3 md:p-4">
      <div className="flex items-start gap-2">
        {/* Step number + arrows */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-[10px] font-bold text-site-400 leading-none mt-1">#{index + 1}</span>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 rounded border border-site-200 text-site-600 hover:bg-site-50 disabled:opacity-30 disabled:cursor-not-allowed min-h-0"
              aria-label="上移"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 rounded border border-site-200 text-site-600 hover:bg-site-50 disabled:opacity-30 disabled:cursor-not-allowed min-h-0"
              aria-label="下移"
            >
              <ArrowDown size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Role dropdown */}
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">所需角色</label>
            <select
              value={step.required_role}
              onChange={e => onChange({ ...step, required_role: e.target.value as GlobalRole })}
              className="input"
            >
              {CHAIN_ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{CHAIN_ROLE_ZH[r]}</option>
              ))}
            </select>
          </div>

          {/* Optional specific user */}
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">
              指定特定用戶 (可選)
            </label>
            {selectedUser ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-site-100 rounded-lg px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-safety-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {selectedUser.name.slice(0,1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-site-900 truncate">{selectedUser.name}</p>
                    <p className="text-[10px] text-site-500 truncate">{selectedUser.phone}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ ...step, optional_user_id: null })}
                  className="text-xs text-site-500 px-2 py-1 border border-site-200 rounded-lg hover:bg-site-50"
                >
                  清除
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  placeholder="搜尋姓名或電話..."
                  className="input"
                />
                {userQuery && filteredMembers.length > 0 && (
                  <div className="mt-1 border border-site-200 rounded-xl bg-white max-h-40 overflow-y-auto">
                    {filteredMembers.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { onChange({ ...step, optional_user_id: u.id }); setUserQuery('') }}
                        className="w-full text-left px-3 py-2 hover:bg-site-50 border-b border-site-100 last:border-b-0"
                      >
                        <p className="text-xs font-semibold text-site-900">{u.name}</p>
                        <p className="text-[10px] text-site-500">{u.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
                {userQuery && filteredMembers.length === 0 && (
                  <p className="text-[10px] text-site-400 mt-1">未有匹配嘅用戶</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex-shrink-0 p-2 text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed min-h-0"
          aria-label="移除步驟"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

export { CHAIN_ROLE_OPTIONS, CHAIN_ROLE_ZH }
export type { ChainRole }
