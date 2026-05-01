import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X, Image as ImageIcon } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useIssues } from '../contexts/IssuesContext'
import { ISSUE_HANDLER_ZH, getInitialHandler } from '../types'

interface PhotoSlot {
  localId: string
  preview: string  // object URL for preview
  url: string | null  // public URL after upload
  uploading: boolean
  error: string | null
  file: File
}

const MAX_PHOTOS = 6

export function CreateIssueModal({
  open, onClose, projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: string
}) {
  const navigate = useNavigate()
  const { createIssue, uploadPhoto, myRoleInProject } = useIssues()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const targetHandler = myRoleInProject ? getInitialHandler(myRoleInProject) : null

  function reset() {
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    setTitle('')
    setDescription('')
    setPhotos([])
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''  // allow re-picking the same file
    if (files.length === 0) return

    const remainingSlots = MAX_PHOTOS - photos.length
    const accepted = files.slice(0, remainingSlots)

    const newSlots: PhotoSlot[] = accepted.map(f => ({
      localId: `${Date.now()}-${Math.random()}`,
      preview: URL.createObjectURL(f),
      url: null,
      uploading: true,
      error: null,
      file: f,
    }))
    setPhotos(prev => [...prev, ...newSlots])

    // Upload each
    for (const slot of newSlots) {
      const { url, error } = await uploadPhoto(slot.file)
      setPhotos(prev => prev.map(p =>
        p.localId === slot.localId
          ? { ...p, uploading: false, url, error }
          : p
      ))
    }
  }

  function removePhoto(localId: string) {
    setPhotos(prev => {
      const target = prev.find(p => p.localId === localId)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter(p => p.localId !== localId)
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('請輸入問題標題')
    if (photos.length === 0) return setError('必須上傳至少一張現場照片')
    if (photos.some(p => p.uploading)) return setError('照片仍在上傳中，請稍候')
    const failed = photos.filter(p => !p.url)
    if (failed.length > 0) return setError(`有 ${failed.length} 張相片上傳失敗，請刪除後重試`)

    const urls = photos.map(p => p.url!)
    setSubmitting(true)
    const { error, id } = await createIssue(title, description, urls)
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

        {/* Photos — required */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">現場照片 *</label>
            <span className="text-xs text-site-400">{photos.length}/{MAX_PHOTOS}</span>
          </div>
          <p className="text-xs text-site-400 mb-2">必須上傳至少一張照片作為記錄</p>

          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.localId} className="relative aspect-square rounded-xl overflow-hidden border border-site-200 bg-site-100">
                <img src={p.preview} alt="" className="w-full h-full object-cover" />
                {p.uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Spinner size={20} className="text-white" />
                  </div>
                )}
                {p.error && (
                  <div className="absolute inset-0 bg-red-600/70 flex items-center justify-center text-white text-[10px] px-2 text-center">
                    上傳失敗
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.localId)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center min-h-0 min-w-0"
                  aria-label="移除"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-site-300 bg-site-50 hover:bg-site-100 flex flex-col items-center justify-center text-site-500 gap-1 min-h-0"
              >
                <Camera size={22} />
                <span className="text-[11px]">加照片</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onPickFiles}
            className="hidden"
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
