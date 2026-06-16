import { ChangeEvent, useContext, useMemo, useRef, useState } from 'react'
import { X, Camera, Image as ImageIcon, FileUp, Trash2, Plus } from 'lucide-react'
import { useSi } from '../../contexts/SiContext'
import { useDrawings } from '../../contexts/DrawingsContext'
import { DocumentsContext } from '../../contexts/DocumentsContext'
import { uploadSiPhotos, uploadSiVoice } from '../../lib/si'
import { Spinner } from '../Spinner'
import { VoiceRecorder } from './VoiceRecorder'
import { GeoPicker, type GeoValue } from './GeoPicker'
import type { SiPayload } from '../../types'

const MAX_TITLE = 120
const MAX_DESC = 4000

export interface SiSubmitFormProps {
  projectId: string
  onSubmitted: (siId: string) => void
  onCancel: () => void
}

// Minimal shape the drawing-reference picker needs — both DrawingsContext and
// (files_enabled) DocumentsContext adapt into this so the JSX has one path.
interface PinDrawing {
  id: string
  title: string
  current_version_id: string | null
}
interface PinVersion {
  id: string
  version_no: number
}

export function SiSubmitForm({ projectId, onSubmitted, onCancel }: SiSubmitFormProps) {
  const { createDraftSi, saveVersion, submitSi } = useSi()
  const { drawings, versionsByDrawing } = useDrawings()
  // Optional — null when no DocumentsProvider is mounted (older mount sites).
  const documentsCtx = useContext(DocumentsContext)
  // Files mode when a DocumentsProvider is in scope (the 文件 module is now gated
  // solely by the per-project module switch; the files_enabled flag was removed).
  const filesMode = !!documentsCtx

  // Source the drawing-reference picker from documents (document_type==='drawing')
  // when in files mode, else from drawings. version ids are identical post-backfill
  // so SiPayload.drawing_version_ids is unchanged either way.
  const pinDrawings: PinDrawing[] = useMemo(() => {
    if (filesMode && documentsCtx) {
      return documentsCtx.documents
        .filter(d => d.document_type === 'drawing')
        .map(d => ({ id: d.id, title: d.title, current_version_id: d.current_version_id }))
    }
    return drawings.map(d => ({
      id: d.id,
      title: d.title,
      current_version_id: d.current_version_id,
    }))
  }, [filesMode, documentsCtx, drawings])

  const versionsByPinDrawing: Record<string, PinVersion[]> = useMemo(() => {
    if (filesMode && documentsCtx) {
      const out: Record<string, PinVersion[]> = {}
      for (const [docId, vers] of Object.entries(documentsCtx.versionsByDocument)) {
        out[docId] = vers.map(v => ({ id: v.id, version_no: v.version_no }))
      }
      return out
    }
    const out: Record<string, PinVersion[]> = {}
    for (const [drId, vers] of Object.entries(versionsByDrawing)) {
      out[drId] = vers.map(v => ({ id: v.id, version_no: v.version_no }))
    }
    return out
  }, [filesMode, documentsCtx, versionsByDrawing])

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [geo, setGeo] = useState<GeoValue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Drawing pin picker — default to each drawing's current_version_id
  const defaultPinIds = useMemo(() => {
    return pinDrawings
      .map(d => d.current_version_id)
      .filter((id): id is string => !!id)
  }, [pinDrawings])

  const [pickedVersionIds, setPickedVersionIds] = useState<string[]>(defaultPinIds)
  const [expandedDrawingId, setExpandedDrawingId] = useState<string | null>(null)

  // Keep picked ids in sync the first time drawings load
  const hydratedRef = useRef(false)
  if (!hydratedRef.current && pinDrawings.length > 0) {
    hydratedRef.current = true
    setPickedVersionIds(defaultPinIds)
  }

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    pickedVersionIds.length > 0 &&
    !submitting

  function handlePickFile(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const next = [...photos]
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i)
      if (f) next.push(f)
    }
    setPhotos(next)
    e.target.value = ''
    setPhotoSheetOpen(false)
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  function toggleVersionPin(versionId: string) {
    setPickedVersionIds(prev =>
      prev.includes(versionId) ? prev.filter(id => id !== versionId) : [...prev, versionId],
    )
  }

  // Choose which version of `drawingId` is currently pinned (replace others
  // of the same drawing in the picked set). If none of this drawing's versions
  // is currently pinned, just add the chosen version.
  function pickVersionForDrawing(drawingId: string, versionId: string) {
    const versions = versionsByPinDrawing[drawingId] || []
    const versionIdsOfThisDrawing = new Set(versions.map(v => v.id))
    setPickedVersionIds(prev => {
      const withoutThisDrawing = prev.filter(id => !versionIdsOfThisDrawing.has(id))
      return [...withoutThisDrawing, versionId]
    })
  }

  async function onSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { id: siId, error: e1 } = await createDraftSi()
      if (e1 || !siId) {
        setError(e1 ?? '建立草稿失敗')
        return
      }
      const versionNo = 1
      const { paths: photoPaths, error: e2 } = await uploadSiPhotos(
        projectId, siId, versionNo, photos,
      )
      if (e2) {
        setError(e2)
        return
      }
      let voicePath: string | null = null
      if (voiceBlob) {
        const { path, error: e3 } = await uploadSiVoice(
          projectId, siId, versionNo, voiceBlob,
        )
        if (e3) {
          setError(e3)
          return
        }
        voicePath = path
      }
      const payload: SiPayload = {
        title: title.trim(),
        description: description.trim(),
        drawing_version_ids: pickedVersionIds,
        photo_paths: photoPaths,
        voice_path: voicePath,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        accuracy_m: geo?.accuracy_m ?? null,
      }
      const { error: e4 } = await saveVersion(siId, payload)
      if (e4) {
        setError(e4)
        return
      }
      const { error: e5 } = await submitSi(siId)
      if (e5) {
        setError(e5)
        return
      }
      onSubmitted(siId)
    } catch (e: any) {
      console.error('SiSubmitForm submit error:', e)
      setError(e?.message ?? '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="bg-site-50 w-full sm:max-w-md md:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-site-100 bg-white rounded-t-2xl">
          <h3 className="font-bold text-site-900">新增工地指令</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-site-400 hover:text-site-700 -mr-2"
            aria-label="關閉"
          >
            <X size={22} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* 1. 標題 */}
          <div>
            <label className="label">標題</label>
            <input
              type="text"
              className="input"
              value={title}
              maxLength={MAX_TITLE}
              onChange={e => setTitle(e.target.value)}
              placeholder="例：地面層柱位修訂"
            />
            <p className="text-[10px] text-site-400 mt-1 text-right">
              {title.length}/{MAX_TITLE}
            </p>
          </div>

          {/* 2. 描述 */}
          <div>
            <label className="label">描述</label>
            <textarea
              className="input min-h-[112px]"
              rows={4}
              maxLength={MAX_DESC}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="詳細說明工地指令內容…"
            />
            <p className="text-[10px] text-site-400 mt-1 text-right">
              {description.length}/{MAX_DESC}
            </p>
          </div>

          {/* 3. 圖則參照 */}
          <div className="card p-3">
            <p className="label mb-2">
              圖則參照 <span className="text-red-500">*</span>
            </p>
            {pinDrawings.length === 0 ? (
              <p className="text-xs text-site-500">此項目尚未有圖則。</p>
            ) : (
              <div className="space-y-2">
                {pinDrawings.map(d => {
                  const versions = (versionsByPinDrawing[d.id] || []).slice().sort((a, b) => b.version_no - a.version_no)
                  const current = versions.find(v => v.id === d.current_version_id) ?? versions[0]
                  const pickedForThisDrawing = versions.find(v => pickedVersionIds.includes(v.id))
                  const expanded = expandedDrawingId === d.id
                  const active = !!pickedForThisDrawing
                  const isCurrent = pickedForThisDrawing?.id === current?.id
                  return (
                    <div key={d.id} className="border border-site-200 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedDrawingId(expanded ? null : d.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left ${
                          active ? 'bg-safety-50' : 'bg-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-site-900 truncate text-sm">{d.title}</p>
                          {pickedForThisDrawing && (
                            <p className="text-[11px] text-site-600">
                              v{pickedForThisDrawing.version_no}
                              {isCurrent && ' (提交時最新)'}
                            </p>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={e => {
                            e.stopPropagation()
                            if (active && pickedForThisDrawing) {
                              toggleVersionPin(pickedForThisDrawing.id)
                            } else if (current) {
                              toggleVersionPin(current.id)
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-5 h-5"
                        />
                      </button>
                      {expanded && versions.length > 0 && (
                        <div className="border-t border-site-100 bg-site-50 px-3 py-2 space-y-1">
                          {versions.map(v => {
                            const picked = pickedVersionIds.includes(v.id)
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => pickVersionForDrawing(d.id, v.id)}
                                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${
                                  picked
                                    ? 'bg-safety-100 text-safety-700 font-semibold'
                                    : 'text-site-700 hover:bg-white'
                                }`}
                              >
                                <span>
                                  v{v.version_no}
                                  {v.id === d.current_version_id && ' (現行)'}
                                </span>
                                {picked && <span>✓</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {pickedVersionIds.length === 0 && (
              <p className="mt-2 text-[11px] text-amber-700">至少選擇一份圖則參照</p>
            )}
          </div>

          {/* 4. 相片 */}
          <div className="card p-3">
            <p className="label mb-2">相片 (選填)</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={`${p.name}-${i}`} className="relative w-16 h-16">
                  <img
                    src={URL.createObjectURL(p)}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg border border-site-200"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-xs"
                    aria-label="移除相片"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPhotoSheetOpen(true)}
                className="w-16 h-16 border-2 border-dashed border-site-300 rounded-lg flex items-center justify-center text-site-500"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* 5. 語音備忘 */}
          <VoiceRecorder onRecorded={setVoiceBlob} existingBlob={voiceBlob} />

          {/* 6. 位置 */}
          <GeoPicker value={geo} onChange={setGeo} />

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="px-5 py-3 border-t border-site-100 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-ghost flex-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size={16} className="text-white" />}
            <span>提交</span>
          </button>
        </div>
      </div>

      {/* Photo source bottom-sheet */}
      {photoSheetOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setPhotoSheetOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-4 space-y-2"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-center text-sm font-semibold text-site-700 pb-2">
              加入相片
            </p>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="btn-ghost w-full inline-flex items-center justify-center gap-2"
            >
              <Camera size={18} />
              <span>拍攝</span>
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="btn-ghost w-full inline-flex items-center justify-center gap-2"
            >
              <ImageIcon size={18} />
              <span>從相簿選擇</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost w-full inline-flex items-center justify-center gap-2"
            >
              <FileUp size={18} />
              <span>從檔案選擇</span>
            </button>
            <button
              type="button"
              onClick={() => setPhotoSheetOpen(false)}
              className="w-full text-site-500 text-sm py-2"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePickFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePickFile}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePickFile}
      />
    </div>
  )
}

// Silence "unused" warnings for icons reserved for the future expanded UX.
void Trash2
void Spinner

export default SiSubmitForm
