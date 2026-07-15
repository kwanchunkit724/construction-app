import { useState, useMemo, useRef } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { Modal } from '../Modal'
import { usePtw } from '../../contexts/PtwContext'
import { PTW_TYPE_ZH, PTW_TYPE_V1 } from '../../types'
import type { PtwType, PtwChecklistItem, PtwPayload } from '../../types'
import { checklistTemplate, uploadPpePhotos, uploadScenePhotos, uploadWorkerPhoto } from '../../lib/ptw'
import { useIsOnline } from '../../hooks/useIsOnline'
import { OfflineBanner } from '../OfflineBanner'
import { PtwPhotoPicker } from './PtwPhotoPicker'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { capturePhotoGeo, recordPhotoMeta } from '../../lib/photoMeta'

interface WorkerDraft {
  name: string
  phone: string
  photo: File | null
}

interface PtwSubmitFormProps {
  open: boolean
  onClose: () => void
  onSubmitted: (ptwId: string) => void
}

export function PtwSubmitForm({ open, onClose, onSubmitted }: PtwSubmitFormProps) {
  const { createDraft, saveVersion, submit, addWorker, projectId } = usePtw()
  const { profile } = useAuth()
  const online = useIsOnline()
  const [ptwType, setPtwType] = useState<PtwType>('hot_work')
  const [description, setDescription] = useState('')
  const [checklist, setChecklist] = useState<PtwChecklistItem[]>(() => checklistTemplate('hot_work'))
  const [workers, setWorkers] = useState<WorkerDraft[]>([{ name: '', phone: '', photo: null }])
  const [ppePhotos, setPpePhotos] = useState<File[]>([])
  const [scenePhotos, setScenePhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [progressMsg, setProgressMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allRequiredChecked = useMemo(
    () => checklist.filter(c => c.required).every(c => c.value === true),
    [checklist],
  )

  const validWorkers = useMemo(
    () => workers.filter(w => w.name.trim().length > 0),
    [workers],
  )

  const canSubmit = description.trim().length > 0 && allRequiredChecked && validWorkers.length > 0 && online

  function handleTypeChange(t: PtwType) {
    setPtwType(t)
    setChecklist(checklistTemplate(t))
  }

  function toggleCheck(key: string) {
    setChecklist(prev => prev.map(c => c.key === key ? { ...c, value: c.value === true ? false : true } : c))
  }

  function updateWorker(idx: number, field: 'name' | 'phone', value: string) {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w))
  }

  function setWorkerPhoto(idx: number, file: File | null) {
    setWorkers(prev => prev.map((w, i) => i === idx ? { ...w, photo: file } : w))
  }

  function addWorkerRow() {
    setWorkers(prev => [...prev, { name: '', phone: '', photo: null }])
  }

  function removeWorker(idx: number) {
    setWorkers(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setProgressMsg(null)
    // B2 (DWSS §3.3.3): capture coarse GPS once, non-blocking, for the photos on
    // this permit. recordPhotoMeta is best-effort and never blocks submit.
    const geoPromise = (ppePhotos.length > 0 || scenePhotos.length > 0 || validWorkers.some(w => w.photo))
      ? capturePhotoGeo()
      : Promise.resolve(null)
    const workerPhotoPaths: string[] = []
    try {
      setProgressMsg('建立草稿...')
      const { id, error: createErr } = await createDraft(ptwType)
      if (createErr || !id) {
        setError(createErr || '建立失敗')
        return
      }

      // Photos must land before saveVersion so the payload references real
      // storage paths. Use versionNo=1 — fresh draft, no prior versions.
      let ppePaths: string[] = []
      let scenePaths: string[] = []
      // B2 helper: fire-and-forget metadata record for a single path.
      // Defined here so it shares geoPromise + profile closure and can be
      // called right after each individual upload, avoiding the stranded-
      // metadata problem when an early-return halts the submit mid-way.
      function persistMeta(path: string) {
        if (!profile) return
        void geoPromise.then(geo => {
          void recordPhotoMeta({
            projectId, bucket: 'project-si-vo', photoPath: path,
            capturedAt: new Date().toISOString(), geo, uploadedBy: profile.id,
          })
        })
      }

      if (ppePhotos.length > 0) {
        setProgressMsg(`上載 PPE 相片 (${ppePhotos.length}) ...`)
        const r = await uploadPpePhotos(projectId, id, 1, ppePhotos)
        if (r.error) { setError(r.error); return }
        ppePaths = r.paths
        ppePaths.forEach(persistMeta)
      }
      if (scenePhotos.length > 0) {
        setProgressMsg(`上載現場相片 (${scenePhotos.length}) ...`)
        const r = await uploadScenePhotos(projectId, id, 1, scenePhotos)
        if (r.error) { setError(r.error); return }
        scenePaths = r.paths
        scenePaths.forEach(persistMeta)
      }

      setProgressMsg('儲存版本...')
      const payload: PtwPayload = {
        description: description.trim(),
        checklist,
        ppe_photo_paths: ppePaths,
        scene_photo_paths: scenePaths,
        drawing_version_ids: [],
      }
      const { error: vErr } = await saveVersion(id, payload)
      if (vErr) { setError(vErr); return }

      // Workers: insert without photo, get id, upload photo, update row.
      for (const [i, w] of validWorkers.entries()) {
        setProgressMsg(`新增工人 ${i + 1}/${validWorkers.length} ...`)
        const { id: workerId, error: wErr } = await addWorker(id, w.name.trim(), w.phone.trim() || null, null)
        if (wErr || !workerId) { setError(wErr || '工人新增失敗'); return }
        if (w.photo) {
          const up = await uploadWorkerPhoto(projectId, id, workerId, w.photo)
          if (up.error || !up.path) { setError(up.error || '工人相片上載失敗'); return }
          workerPhotoPaths.push(up.path)
          // Fire metadata right after this worker's upload succeeds so a later
          // worker failure doesn't strand this photo without a metadata record.
          persistMeta(up.path)
          const { error: updErr } = await supabase
            .from('permit_workers')
            .update({ worker_photo_path: up.path })
            .eq('id', workerId)
          if (updErr) { setError(updErr.message); return }
        }
      }

      setProgressMsg('提交簽核...')
      const { error: subErr } = await submit(id)
      if (subErr) { setError(subErr); return }
      onSubmitted(id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失敗')
    } finally {
      setSubmitting(false)
      setProgressMsg(null)
    }
  }

  return (
    <Modal open={open} title="新增工作許可證" onClose={onClose}>
      <div className="space-y-4">
        {/* PTW type */}
        <div>
          <label className="label">許可證類型</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
            {(Object.keys(PTW_TYPE_ZH) as PtwType[]).map(t => {
              const enabled = (PTW_TYPE_V1 as readonly PtwType[]).includes(t)
              const selected = ptwType === t
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && handleTypeChange(t)}
                  className={
                    selected
                      ? 'rounded-xl border-2 border-safety-500 bg-safety-50 px-3 py-2 text-sm font-medium text-safety-700'
                      : enabled
                        ? 'rounded-xl border border-site-200 bg-white px-3 py-2 text-sm text-site-700 hover:border-safety-300'
                        : 'rounded-xl border border-site-100 bg-site-50 px-3 py-2 text-xs text-site-400 cursor-not-allowed'
                  }
                >
                  {PTW_TYPE_ZH[t]}
                  {!enabled && <div className="text-[10px] mt-0.5">敬請期待</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="label">工作描述</label>
          <textarea
            className="input"
            rows={3}
            placeholder="說明工作範圍、地點、時段..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={4000}
          />
          <p className="text-xs text-site-500 text-right">{description.length}/4000</p>
        </div>

        {/* Checklist */}
        {checklist.length > 0 && (
          <div>
            <label className="label">安全核對清單</label>
            <div className="space-y-2 mt-1">
              {checklist.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleCheck(item.key)}
                  className={
                    'w-full flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ' +
                    (item.value === true
                      ? 'border-green-300 bg-green-50 text-green-900'
                      : item.required
                        ? 'border-amber-200 bg-amber-50 text-site-900'
                        : 'border-site-200 bg-white text-site-700')
                  }
                >
                  <span
                    className={
                      'inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ' +
                      (item.value === true
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-site-300 bg-white text-transparent')
                    }
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="flex-1">
                    {item.label_zh}
                    {item.required && <span className="ml-1 text-red-500">*</span>}
                  </span>
                </button>
              ))}
            </div>
            {!allRequiredChecked && (
              <p className="mt-2 text-xs text-amber-700">
                必須勾選所有 <span className="text-red-500">*</span> 必填項目先可以提交
              </p>
            )}
          </div>
        )}

        {/* PPE photos */}
        <PtwPhotoPicker
          label="PPE 相片"
          files={ppePhotos}
          onChange={setPpePhotos}
          hint="工人配戴安全帶/安全帽/反光衣等實況"
        />

        {/* Scene photos */}
        <PtwPhotoPicker
          label="現場相片"
          files={scenePhotos}
          onChange={setScenePhotos}
          hint="工作範圍 + 周圍環境 + 滅火器/標示等"
        />

        {/* Workers */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label">工人名單</label>
            <button type="button" className="btn-ghost text-sm" onClick={addWorkerRow}>
              <Plus size={14} className="inline mr-1" />
              加入工人
            </button>
          </div>
          <div className="space-y-2 mt-1">
            {workers.map((w, idx) => (
              <WorkerRow
                key={idx}
                worker={w}
                canDelete={workers.length > 1}
                onName={(v) => updateWorker(idx, 'name', v)}
                onPhone={(v) => updateWorker(idx, 'phone', v)}
                onPhoto={(f) => setWorkerPhoto(idx, f)}
                onDelete={() => removeWorker(idx)}
              />
            ))}
          </div>
          {validWorkers.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">最少加入一名工人</p>
          )}
        </div>

        {!online && <OfflineBanner />}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (progressMsg ?? '提交中...') : '提交'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

interface WorkerRowProps {
  worker: WorkerDraft
  canDelete: boolean
  onName: (v: string) => void
  onPhone: (v: string) => void
  onPhoto: (f: File | null) => void
  onDelete: () => void
}

function WorkerRow({ worker, canDelete, onName, onPhone, onPhoto, onDelete }: WorkerRowProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null
    e.target.value = ''
    if (!f) return
    const { compressImage } = await import('../../lib/image-compress')
    const small = await compressImage(f, { maxEdge: 1280, quality: 0.78 })
    onPhoto(small)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(small))
  }

  function clearPhoto() {
    onPhoto(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
  }

  return (
    <div className="flex gap-2 items-start">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex-shrink-0 w-12 h-12 rounded-xl bg-site-100 hover:bg-site-200 flex items-center justify-center overflow-hidden"
        aria-label="工人相片"
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <Plus size={18} className="text-site-500" />
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handlePick}
      />
      <div className="flex-1 flex flex-col gap-1">
        <input
          className="input"
          placeholder="工人姓名"
          value={worker.name}
          onChange={e => onName(e.target.value)}
        />
        <div className="flex gap-1">
          <input
            className="input flex-1"
            placeholder="電話 (選填)"
            value={worker.phone}
            onChange={e => onPhone(e.target.value)}
          />
          {worker.photo && (
            <button type="button" className="btn-ghost text-xs text-site-500 px-2" onClick={clearPhoto}>
              移除相片
            </button>
          )}
        </div>
      </div>
      {canDelete && (
        <button
          type="button"
          className="btn-ghost text-red-600 flex-shrink-0"
          onClick={onDelete}
          aria-label="刪除工人"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}
