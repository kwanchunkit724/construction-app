// DocumentUploadSheet — successor of DrawingUploadSheet for the documents
// register. Adds, over the drawings sheet:
//   • a 類型 (document_type) picker — 圖則 is HIDDEN unless canUploadDrawingType
//     (D-25: only pm/main_contractor may issue drawings; never burn a DWG number
//     on a write the RPC would reject).
//   • an optional 進度項目 picker (leaf items only) used only when the sheet is
//     NOT pre-linked to an item (Phase D files page). DocumentsSection always
//     pre-links, so it never shows the picker.
//   • an auto doc_number preview — shows the type prefix (MAT/MS/DWG/INS/DOC),
//     resolved to the real next number lazily on demand via next_document_number.
//
// Retains the DrawingUploadSheet UX verbatim: 5MB amber soft-warn / 25MB hard
// reject, camera / album / file pickers, per-file progress. Image compression
// happens inside DocumentsContext.uploadDocument/uploadVersion (kept invisible
// here — the copy still warns about large files).

import { ChangeEvent, useRef, useState } from 'react'
import { Camera as CameraIcon, FileUp, Image as ImageIcon, X } from 'lucide-react'
import { useDocuments } from '../../contexts/DocumentsContext'
import { DOC_PREFIX } from '../../lib/documents'
import { DOCUMENT_TYPE_ZH } from '../../types'
import { Spinner } from '../Spinner'
import type { DocumentType } from '../../types'

export interface DocumentUploadLeafItem {
  id: string
  code: string
  title: string
}

export interface DocumentUploadSheetProps {
  open: boolean
  // Pre-linked item — when supplied, the 進度項目 picker is hidden and every new
  // document attaches to this leaf. DocumentsSection always passes this.
  progressItemId?: string
  // Upload a new VERSION of an existing document instead of a new document.
  existingDocumentId?: string
  // Leaf items for the optional 進度項目 picker (only used when NOT pre-linked).
  leafItems?: DocumentUploadLeafItem[]
  onClose(): void
  onUploaded?(documentId: string): void
}

interface FileSlot {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  tooLarge: boolean
  softWarn: boolean
}

const MAX_FILES = 5
const HARD_LIMIT = 25 * 1024 * 1024
const SOFT_LIMIT = 5 * 1024 * 1024
// CANONICAL strings (drawings parity, ISSUE-04 pin) — half-width parens/'>',
// full-width comma.
const ERR_TOO_LARGE = '檔案太大 (>25MB)，請壓縮後再上載'
const WARN_LARGE = '檔案較大，可能會慢'

// Type options in register order. 圖則 (drawing) is filtered out below when the
// caller lacks the drawing carve-out.
const TYPE_OPTIONS: DocumentType[] = [
  'material_submission',
  'method_statement',
  'drawing',
  'inspection',
  'other',
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function newSlot(file: File): FileSlot {
  const tooLarge = file.size > HARD_LIMIT
  const softWarn = !tooLarge && file.size > SOFT_LIMIT
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    status: tooLarge ? 'error' : 'pending',
    progress: 0,
    error: tooLarge ? ERR_TOO_LARGE : undefined,
    tooLarge,
    softWarn,
  }
}

export function DocumentUploadSheet({
  open,
  progressItemId,
  existingDocumentId,
  leafItems,
  onClose,
  onUploaded,
}: DocumentUploadSheetProps) {
  const { uploadDocument, uploadVersion, canUploadDrawingType } = useDocuments()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [slots, setSlots] = useState<FileSlot[]>([])
  const [title, setTitle] = useState('')
  const [revisionLabel, setRevisionLabel] = useState('')
  const [docType, setDocType] = useState<DocumentType>('material_submission')
  const [pickedItemId, setPickedItemId] = useState<string>(progressItemId ?? '')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [softWarnNotice, setSoftWarnNotice] = useState<string | null>(null)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isNewVersion = Boolean(existingDocumentId)
  const heading = isNewVersion ? '上載新版本' : '上載文件'
  const isUploading = slots.some(s => s.status === 'uploading')

  // 圖則 hidden unless the user holds the drawing carve-out (D-25).
  const typeOptions = TYPE_OPTIONS.filter(
    t => t !== 'drawing' || canUploadDrawingType,
  )

  // 進度項目 picker only when NOT pre-linked and we have leaf items to offer.
  const showItemPicker = !progressItemId && !isNewVersion && !!leafItems && leafItems.length > 0
  // The item this document will attach to (pre-linked > picked > none).
  const effectiveItemId = progressItemId ?? (pickedItemId || undefined)

  if (!open) return null

  function reset() {
    setSlots([])
    setTitle('')
    setRevisionLabel('')
    setDocType('material_submission')
    setPickedItemId(progressItemId ?? '')
    setSubmitError(null)
    setSoftWarnNotice(null)
    setBatchError(null)
    setSubmitting(false)
  }

  function close() {
    if (isUploading) return
    reset()
    onClose()
  }

  function ingestFiles(files: File[]) {
    setSubmitError(null)
    setBatchError(null)
    if (files.length === 0) return
    const remaining = MAX_FILES - slots.length
    if (remaining <= 0) {
      setBatchError('每批最多 5 個檔案')
      return
    }
    const accepted = files.slice(0, remaining)
    if (files.length > remaining) {
      setBatchError('每批最多 5 個檔案')
    }
    const newSlots = accepted.map(newSlot)
    if (newSlots.some(s => s.softWarn)) {
      setSoftWarnNotice(WARN_LARGE)
    }
    setSlots(prev => [...prev, ...newSlots])
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    ingestFiles(files)
  }

  async function onTakePhoto() {
    setSubmitError(null)
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      })
      if (!photo.webPath) return
      const blob = await (await fetch(photo.webPath)).blob()
      const ext = photo.format || 'jpg'
      const file = new File([blob], `photo.${ext}`, { type: blob.type || 'image/jpeg' })
      ingestFiles([file])
    } catch (err) {
      cameraInputRef.current?.click()
    }
  }

  async function onPickFromAlbum() {
    setSubmitError(null)
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const photo = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos,
      })
      if (!photo.webPath) return
      const blob = await (await fetch(photo.webPath)).blob()
      const ext = photo.format || 'jpg'
      const file = new File([blob], `photo.${ext}`, { type: blob.type || 'image/jpeg' })
      ingestFiles([file])
    } catch (err) {
      galleryInputRef.current?.click()
    }
  }

  function removeSlot(id: string) {
    setSlots(prev => prev.filter(s => s.id !== id))
  }

  async function onSubmit() {
    setSubmitError(null)
    const uploadable = slots.filter(s => !s.tooLarge && s.status !== 'done')
    if (uploadable.length === 0) {
      setSubmitError('沒有可上載的檔案')
      return
    }
    if (!isNewVersion && !title.trim()) {
      setSubmitError('請輸入文件名稱')
      return
    }
    setSubmitting(true)

    const tasks = uploadable.map(async slot => {
      setSlots(prev =>
        prev.map(s => (s.id === slot.id ? { ...s, status: 'uploading', progress: 0 } : s)),
      )
      const onProgress = (pct: number) => {
        setSlots(prev =>
          prev.map(s => (s.id === slot.id ? { ...s, progress: pct } : s)),
        )
      }
      if (isNewVersion && existingDocumentId) {
        const { versionId, error } = await uploadVersion({
          documentId: existingDocumentId,
          file: slot.file,
          revisionLabel: revisionLabel.trim() || undefined,
          onProgress,
        })
        setSlots(prev =>
          prev.map(s =>
            s.id === slot.id
              ? {
                  ...s,
                  status: error ? 'error' : 'done',
                  progress: error ? s.progress : 100,
                  error: error ?? undefined,
                }
              : s,
          ),
        )
        return { ok: !error, documentId: versionId ? existingDocumentId : null }
      }
      const { documentId, error } = await uploadDocument({
        documentType: docType,
        title: title.trim(),
        file: slot.file,
        progressItemId: effectiveItemId,
        revisionLabel: revisionLabel.trim() || undefined,
        onProgress,
      })
      setSlots(prev =>
        prev.map(s =>
          s.id === slot.id
            ? {
                ...s,
                status: error ? 'error' : 'done',
                progress: error ? s.progress : 100,
                error: error ?? undefined,
              }
            : s,
        ),
      )
      return { ok: !error, documentId }
    })

    const results = await Promise.all(tasks)
    setSubmitting(false)
    const firstOk = results.find(r => r.ok && r.documentId)
    if (firstOk?.documentId) onUploaded?.(firstOk.documentId)
    if (results.every(r => r.ok)) {
      reset()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={close}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-site-100">
          <h3 className="font-bold text-site-900">{heading}</h3>
          <button
            type="button"
            onClick={close}
            className="text-site-400 hover:text-site-700 -mr-2"
            aria-label="關閉"
            disabled={isUploading}
          >
            <X size={22} />
          </button>
        </div>

        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={onTakePhoto}
              className="min-h-16 w-full rounded-xl border border-site-200 hover:bg-site-50 flex items-center gap-3 px-4 text-site-900 font-medium"
            >
              <CameraIcon size={22} className="text-safety-600" />
              <span>📷 拍攝</span>
            </button>
            <button
              type="button"
              onClick={onPickFromAlbum}
              className="min-h-16 w-full rounded-xl border border-site-200 hover:bg-site-50 flex items-center gap-3 px-4 text-site-900 font-medium"
            >
              <ImageIcon size={22} className="text-safety-600" />
              <span>🖼️ 從相簿選擇</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-16 w-full rounded-xl border border-site-200 hover:bg-site-50 flex items-center gap-3 px-4 text-site-900 font-medium"
            >
              <FileUp size={22} className="text-safety-600" />
              <span>📁 從檔案選擇</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFiles}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickFiles}
            className="hidden"
          />

          {!isNewVersion && (
            <>
              <div>
                <label className="label">類型</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value as DocumentType)}
                  className="input"
                >
                  {typeOptions.map(t => (
                    <option key={t} value={t}>
                      {DOCUMENT_TYPE_ZH[t]}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-site-400 mt-1">
                  文件編號：{DOC_PREFIX[docType]}-（提交後自動產生）
                </p>
              </div>

              {showItemPicker && leafItems && (
                <div>
                  <label className="label">進度項目 (選填)</label>
                  <select
                    value={pickedItemId}
                    onChange={e => setPickedItemId(e.target.value)}
                    className="input"
                  >
                    <option value="">不指定（項目層級）</option>
                    {leafItems.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.code} {it.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">文件名稱</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="文件名稱"
                  maxLength={120}
                  className="input"
                />
              </div>
            </>
          )}

          <div>
            <label className="label">版本標籤 (選填)</label>
            <input
              type="text"
              value={revisionLabel}
              onChange={e => setRevisionLabel(e.target.value)}
              placeholder="例如: Rev A 或 V1.2"
              maxLength={16}
              className="input"
            />
          </div>

          {batchError && (
            <div className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
              {batchError}
            </div>
          )}
          {softWarnNotice && (
            <div className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
              {softWarnNotice}
            </div>
          )}

          {slots.length > 0 && (
            <ul className="space-y-2">
              {slots.map(s => (
                <li
                  key={s.id}
                  className={`rounded-xl border p-3 ${
                    s.tooLarge || s.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'border-site-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-site-900 truncate">
                        {s.file.name}
                      </div>
                      <div className="text-xs text-site-500">
                        {formatSize(s.file.size)}
                      </div>
                      {s.error && (
                        <div className="text-xs text-red-600 mt-1">{s.error}</div>
                      )}
                      {s.status === 'uploading' && (
                        <div className="mt-2 h-1.5 rounded-full bg-site-100 overflow-hidden">
                          <div
                            className="h-full bg-safety-500 transition-all"
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                      )}
                      {s.status === 'done' && (
                        <div className="text-xs text-green-700 mt-1">已上載</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSlot(s.id)}
                      disabled={s.status === 'uploading'}
                      className="text-site-400 hover:text-site-700 disabled:opacity-30"
                      aria-label="移除"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {submitError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-site-100 flex gap-2">
          <button
            type="button"
            onClick={close}
            disabled={isUploading}
            className="btn-ghost flex-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              submitting ||
              isUploading ||
              slots.length === 0 ||
              slots.every(s => s.tooLarge)
            }
            className="btn-primary flex-1"
          >
            {submitting ? <Spinner size={18} className="text-white" /> : '上載'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DocumentUploadSheet
