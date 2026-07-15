import { ChangeEvent, FormEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, X, ImagePlus, Zap } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useIssues } from '../contexts/IssuesContext'
import { useAuth } from '../contexts/AuthContext'
import { capturePhotoGeo, recordPhotoMeta, PhotoGeo } from '../lib/photoMeta'
import { issuePhotoPath } from '../lib/issuePhotos'
import { SNAG_TYPE_ZH } from '../types'
import type { SnagType } from '../types'

// 即時問題 (snag) — a quick-mode of an issue logged in seconds: tap a category
// chip (it fills the title), tag a floor/location, snap a photo (optional), done.
// Self-handled + push-silent (is_quick=true) so it never enters the escalation
// chain or spams anyone; can be 升級為正式問題 later from IssueDetail.

interface PhotoSlot {
  localId: string
  preview: string
  url: string | null
  uploading: boolean
  error: string | null
  file: File
  capturedAt: string
}

const MAX_PHOTOS = 6
const SNAG_TYPES = Object.keys(SNAG_TYPE_ZH) as SnagType[]

export function CreateQuickSnagSheet({
  open, onClose, projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: string
}) {
  const navigate = useNavigate()
  const { createQuickIssue, uploadPhoto } = useIssues()
  const { profile } = useAuth()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [snagType, setSnagType] = useState<SnagType>('leak')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [photoGeo, setPhotoGeo] = useState<PhotoGeo | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function pickType(t: SnagType) {
    setSnagType(t)
    // Auto-fill the title with the category label until the user types their own.
    if (!titleTouched) setTitle(SNAG_TYPE_ZH[t])
  }

  function reset() {
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    setSnagType('leak')
    setTitle('')
    setTitleTouched(false)
    setLocation('')
    setDescription('')
    setPhotos([])
    setPhotoGeo(null)
    setError('')
  }

  function close() {
    reset()
    onClose()
  }

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const remaining = MAX_PHOTOS - photos.length
    const accepted = files.slice(0, remaining)
    const capturedAt = new Date().toISOString()
    const newSlots: PhotoSlot[] = accepted.map(f => ({
      localId: `${Date.now()}-${Math.random()}`,
      preview: URL.createObjectURL(f),
      url: null,
      uploading: true,
      error: null,
      file: f,
      capturedAt,
    }))
    setPhotos(prev => [...prev, ...newSlots])
    if (photos.length === 0) capturePhotoGeo().then(setPhotoGeo)
    for (const slot of newSlots) {
      const { url, error } = await uploadPhoto(slot.file)
      setPhotos(prev => prev.map(p => p.localId === slot.localId ? { ...p, uploading: false, url, error } : p))
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
    const finalTitle = title.trim() || SNAG_TYPE_ZH[snagType]
    if (photos.some(p => p.uploading)) return setError('照片仍在上傳中，請稍候')
    const failed = photos.filter(p => p.file && !p.url && !p.uploading && p.error)
    if (failed.length > 0) return setError(`有 ${failed.length} 張相片上傳失敗，請刪除後重試`)

    const urls = photos.map(p => p.url).filter((u): u is string => !!u)
    setSubmitting(true)
    const { error, id } = await createQuickIssue({
      title: finalTitle, snag_type: snagType, location, description, photos: urls,
    })
    setSubmitting(false)
    if (error) { setError(error); return }
    if (profile) {
      void Promise.all(photos.map(p =>
        p.url
          ? recordPhotoMeta({
              projectId, bucket: 'issue-photos', photoPath: issuePhotoPath(p.url),
              capturedAt: p.capturedAt, geo: photoGeo, uploadedBy: profile.id,
            })
          : Promise.resolve()))
    }
    close()
    if (id) navigate(`/project/${projectId}/issue/${id}`)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="即時問題"
      footer={
        <button onClick={onSubmit} disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-1.5">
          {submitting ? <Spinner size={18} className="text-white" /> : <><Zap size={16} /> 記錄</>}
        </button>
      }
    >
      <div className="text-xs text-site-500 mb-3 bg-blue-50 text-blue-700 rounded-lg p-2.5">
        即時記錄現場小問題（例：逐層漏水）。唔會上呈、唔會發通知；之後可以喺問題頁「升級為正式問題」。
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">類型</label>
          <div className="flex flex-wrap gap-1.5">
            {SNAG_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => pickType(t)}
                className={`text-sm px-3 py-2 rounded-full font-medium min-h-[44px] ${
                  snagType === t ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-600 hover:bg-site-200'
                }`}
              >
                {SNAG_TYPE_ZH[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">標題</label>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); setTitleTouched(true) }}
            placeholder={SNAG_TYPE_ZH[snagType]}
            className="input"
          />
        </div>

        <div>
          <label className="label">位置 / 樓層</label>
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="例如：3樓 A室 / 天台"
            maxLength={60}
            className="input"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">相片（可選）</label>
            <span className="text-xs text-site-400">{photos.length}/{MAX_PHOTOS}</span>
          </div>
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
          </div>
          {photos.length < MAX_PHOTOS && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-site-300 bg-site-50 hover:bg-site-100 flex items-center justify-center text-site-700 gap-1.5 py-3 font-medium text-sm min-h-0"
              >
                <Camera size={18} /> 拍照
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-site-300 bg-site-50 hover:bg-site-100 flex items-center justify-center text-site-700 gap-1.5 py-3 font-medium text-sm min-h-0"
              >
                <ImagePlus size={18} /> 從相簿選
              </button>
            </div>
          )}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onPickFiles} className="hidden" />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
        </div>

        <div>
          <label className="label">備註（可選）</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="補充說明..."
            className="input resize-none"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
        )}
      </form>
    </Modal>
  )
}
