import { useState } from 'react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProjects } from '../contexts/ProjectsContext'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_ZH } from '../types'
import type { Project, ProjectRole } from '../types'

export function ApplyToProjectModal({
  open, onClose, availableProjects,
}: {
  open: boolean
  onClose: () => void
  availableProjects: Project[]
}) {
  const { profile } = useAuth()
  const { applyToProject } = useProjects()
  const defaultRole: ProjectRole | null =
    profile && profile.global_role !== 'admin' ? (profile.global_role as ProjectRole) : null

  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<ProjectRole | null>(defaultRole)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function close() {
    setProjectId('')
    setRole(defaultRole)
    setError('')
    onClose()
  }

  async function submit() {
    setError('')
    if (!projectId) return setError('請選擇工地')
    if (!role) return setError('請選擇角色')

    setSubmitting(true)
    const { error } = await applyToProject(projectId, role)
    setSubmitting(false)
    if (error) setError(error)
    else close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="申請加入工地"
      footer={
        <button onClick={submit} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '提交申請'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">選擇工地 *</label>
          {availableProjects.length === 0 ? (
            <p className="text-sm text-site-500 bg-site-100 rounded-xl px-3 py-3 text-center">
              暫時沒有可申請的工地
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableProjects.map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${
                    projectId === p.id
                      ? 'border-safety-500 bg-safety-50'
                      : 'border-site-200 bg-white hover:border-site-300'
                  }`}
                >
                  <p className="font-semibold text-site-900 text-sm">{p.name}</p>
                  <p className="text-xs text-site-500 mt-0.5">{p.zones.length} 個分區</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">申請角色 *</label>
          <p className="text-xs text-site-400 mb-2">這個工地對你的職位</p>
          <select
            value={role ?? ''}
            onChange={e => setRole(e.target.value as ProjectRole)}
            className="input"
          >
            <option value="">請選擇</option>
            {(['pm','main_contractor','subcontractor','subcontractor_worker','owner'] as const).map(r => (
              <option key={r} value={r}>{ROLE_ZH[r]}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
