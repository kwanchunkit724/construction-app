import { useEffect, useState } from 'react'
import { UserCheck } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import type { Project, UserProfile } from '../types'

export function AssignPMModal({
  open, onClose, project,
}: {
  open: boolean
  onClose: () => void
  project: Project | null
}) {
  const { assignPMs } = useProjects()
  const [pms, setPMs] = useState<UserProfile[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !project) return
    setSelected(project.assigned_pm_ids ?? [])
    setError('')
    setLoading(true)
    supabase
      .from('user_profiles')
      .select('*')
      .eq('global_role', 'pm')
      .order('name')
      .then(({ data, error }) => {
        setLoading(false)
        if (error) setError(error.message)
        else setPMs(data as UserProfile[])
      })
  }, [open, project])

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    if (!project) return
    setSubmitting(true)
    const { error } = await assignPMs(project.id, selected)
    setSubmitting(false)
    if (error) setError(error)
    else onClose()
  }

  if (!project) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`指派 PM — ${project.name}`}
      footer={
        <button onClick={save} disabled={submitting || loading} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : `儲存（已選 ${selected.length} 人）`}
        </button>
      }
    >
      {loading ? (
        <div className="py-8 flex justify-center"><Spinner size={28} /></div>
      ) : pms.length === 0 ? (
        <div className="py-8 text-center text-sm text-site-500">
          目前沒有已註冊的 PM 用戶
        </div>
      ) : (
        <div className="space-y-2">
          {pms.map(pm => {
            const checked = selected.includes(pm.id)
            return (
              <label
                key={pm.id}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  checked ? 'border-safety-500 bg-safety-50' : 'border-site-200 bg-white hover:border-site-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(pm.id)}
                  className="accent-safety-600 w-5 h-5 flex-shrink-0"
                />
                <div className="w-10 h-10 rounded-full bg-safety-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {pm.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-site-900 text-sm">{pm.name}</p>
                  <p className="text-xs text-site-500">{pm.phone}{pm.company ? ` · ${pm.company}` : ''}</p>
                </div>
                {checked && <UserCheck size={18} className="text-safety-600" />}
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
