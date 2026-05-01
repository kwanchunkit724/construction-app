import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useIssues } from '../contexts/IssuesContext'
import { ISSUE_HANDLER_ZH, getInitialHandler } from '../types'

export function CreateIssueModal({
  open, onClose, projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: string
}) {
  const navigate = useNavigate()
  const { createIssue, myRoleInProject } = useIssues()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const targetHandler = myRoleInProject ? getInitialHandler(myRoleInProject) : null

  function reset() {
    setTitle('')
    setDescription('')
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('請輸入問題標題')

    setSubmitting(true)
    const { error, id } = await createIssue(title, description)
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      close()
      if (id) navigate(`/project/${projectId}/issue/${id}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="報告新問題"
      footer={
        <button onClick={onSubmit} disabled={submitting} className="btn-primary w-full">
          {submitting ? <Spinner size={18} className="text-white" /> : '提交'}
        </button>
      }
    >
      {targetHandler && (
        <div className="text-xs text-site-500 mb-3 bg-site-100 rounded-lg p-2.5">
          將自動發送到：<span className="font-semibold text-site-700">{ISSUE_HANDLER_ZH[targetHandler]}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">問題標題 *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例：1F 砂漿不足"
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="label">詳細描述</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="描述問題、位置、影響、建議方案..."
            className="input resize-none"
          />
        </div>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </form>
    </Modal>
  )
}
