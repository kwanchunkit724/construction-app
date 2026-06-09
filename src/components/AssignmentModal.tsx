import { useEffect, useState } from 'react'
import { Users, UserPlus } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import type { ProgressItem, UserProfile } from '../types'

export function AssignmentModal({
  open, onClose, item,
}: {
  open: boolean
  onClose: () => void
  item: ProgressItem | null
}) {
  const { setAssignment } = useProgress()
  const { memberships } = useProjects()
  const [tab, setTab] = useState<'assign' | 'delegate'>('assign')
  const [assigned, setAssigned] = useState<string[]>([])
  const [delegated, setDelegated] = useState<string[]>([])
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({})
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && item) {
      setAssigned([...item.assigned_to])
      setDelegated([...item.delegated_to])
      setError('')
    }
  }, [open, item])

  // Eligible candidates: approved members of this project
  const projectMembers = item ? memberships.filter(
    m => m.project_id === item.project_id && m.status === 'approved'
  ) : []

  const ownerCandidateIds = projectMembers.filter(m => m.role === 'main_contractor').map(m => m.user_id)
  // Delegate to 判頭 AND 判頭工人 — workers gain per-row update rights only via
  // assigned_to/delegated_to (canUpdateItem), and only a supervisor can open
  // this modal, so without workers here a worker's core job is unreachable.
  const delegateeCandidateIds = projectMembers
    .filter(m => m.role === 'subcontractor' || m.role === 'subcontractor_worker')
    .map(m => m.user_id)

  const allIds = Array.from(new Set([...ownerCandidateIds, ...delegateeCandidateIds]))

  useEffect(() => {
    if (!open || allIds.length === 0) return
    const missing = allIds.filter(id => !profiles[id])
    if (missing.length === 0) return
    setLoadingProfiles(true)
    supabase.from('user_profiles').select('*').in('id', missing).then(({ data }) => {
      setLoadingProfiles(false)
      if (!data) return
      setProfiles(prev => {
        const next = { ...prev }
        for (const u of data as UserProfile[]) next[u.id] = u
        return next
      })
    })
  }, [open, allIds, profiles])

  if (!item) return null

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  async function save() {
    if (!item) return
    setError('')
    setSubmitting(true)
    const { error } = await setAssignment(item.id, assigned, delegated)
    setSubmitting(false)
    if (error) setError(error)
    else onClose()
  }

  const candidateIds = tab === 'assign' ? ownerCandidateIds : delegateeCandidateIds
  const selected = tab === 'assign' ? assigned : delegated
  const setSelected = tab === 'assign' ? setAssigned : setDelegated

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="指派 / 委派"
      footer={
        <button onClick={save} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '儲存'}
        </button>
      }
    >
      <div className="text-sm font-semibold text-site-900 mb-3 bg-site-100 rounded-lg p-2.5">
        <span className="font-mono text-site-500">{item.code}</span> · {item.title}
      </div>

      {/* Tabs */}
      <div className="flex bg-site-100 rounded-xl p-1 mb-3">
        <button
          type="button"
          onClick={() => setTab('assign')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold min-h-0 ${
            tab === 'assign' ? 'bg-white text-safety-600 shadow-card' : 'text-site-500'
          }`}
        >
          <Users size={14} /> 負責人 ({assigned.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('delegate')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold min-h-0 ${
            tab === 'delegate' ? 'bg-white text-amber-700 shadow-card' : 'text-site-500'
          }`}
        >
          <UserPlus size={14} /> 委派判頭/工人 ({delegated.length})
        </button>
      </div>

      <p className="text-xs text-site-400 mb-2">
        {tab === 'assign' ? '從總承建商員工選擇負責人（可多選）' : '從判頭或工人選擇委派對象（可多選）'}
      </p>

      {loadingProfiles && candidateIds.some(id => !profiles[id]) ? (
        <div className="py-8 flex justify-center"><Spinner size={24} /></div>
      ) : candidateIds.length === 0 ? (
        <div className="py-8 text-center text-sm text-site-500">
          {tab === 'assign' ? '此工地暫無已批准的總承建商員工' : '此工地暫無已批准的判頭或工人'}
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {candidateIds.map(id => {
            const u = profiles[id]
            if (!u) return null
            const checked = selected.includes(id)
            return (
              <label
                key={id}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  checked
                    ? tab === 'assign'
                      ? 'border-safety-500 bg-safety-50'
                      : 'border-amber-500 bg-amber-50'
                    : 'border-site-200 bg-white hover:border-site-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(selected, setSelected, id)}
                  className="accent-safety-600 w-5 h-5 flex-shrink-0"
                />
                <div className="w-9 h-9 rounded-full bg-safety-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                  {u.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-site-900 truncate">{u.name}</p>
                  <p className="text-xs text-site-500 truncate">{u.phone}{u.company ? ` · ${u.company}` : ''}</p>
                </div>
              </label>
            )
          })}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
          {error}
        </div>
      )}
    </Modal>
  )
}
