import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, PenLine, ShieldAlert, X, Check } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import { PtwSignaturePad } from '../components/ptw/PtwSignaturePad'
import { EquipmentProvider, useEquipment } from '../contexts/EquipmentContext'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import {
  EQUIPMENT_KIND_ZH, FORM_STATUS_ZH, FORM_STATUS_BADGE_CLASS, FORM_RESULT_ZH, deriveFormStatus,
} from '../types'
import type {
  EquipmentKind, FormInstance, FormTemplate, FormSignoffResult, UserCredential,
} from '../types'
import {
  fetchMyCredentials, hasMatchingCredential, credentialTypeLabel,
} from '../lib/credentials'
import { shareFormSignoffPdf } from '../lib/export'

const RESULT_OPTIONS: FormSignoffResult[] = ['pass', 'pass_with_remarks', 'fail']

function EquipmentDetailInner() {
  const { id: projectId, equipmentId } = useParams<{ id: string; equipmentId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { projects } = useProjects()
  const projectName = projects.find(p => p.id === projectId)?.name ?? ''
  const {
    equipment, instances, templates, templateById, signoffsByInstance,
    loading, canManage, addInstance,
  } = useEquipment()

  const eq = useMemo(() => equipment.find(e => e.id === equipmentId), [equipment, equipmentId])
  const myInstances = useMemo(
    () => instances.filter(i => i.equipment_id === equipmentId),
    [instances, equipmentId],
  )

  // The current user's own credentials (drives the 簽署 gate; the RPC re-checks).
  const [myCredentials, setMyCredentials] = useState<UserCredential[]>([])
  useEffect(() => {
    if (!profile) return
    fetchMyCredentials(profile.id).then(setMyCredentials)
  }, [profile])

  const [signing, setSigning] = useState<FormInstance | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  if (!projectId || !equipmentId) return null

  if (loading) {
    return <AppLayout title="機械"><div className="py-12 text-center"><Spinner size={32} /></div></AppLayout>
  }

  if (!eq) {
    return (
      <AppLayout title="機械">
        <div className="card p-8 text-center">
          <p className="text-sm text-site-600 mb-3">找不到此機械</p>
          <button onClick={() => navigate(`/project/${projectId}/equipment`)} className="btn-ghost">
            返回登記冊
          </button>
        </div>
      </AppLayout>
    )
  }

  // Templates not yet attached to this equipment, matching its kind first.
  const attachedTemplateIds = new Set(myInstances.map(i => i.template_id))
  const availableTemplates = templates.filter(t => !attachedTemplateIds.has(t.id))

  return (
    <AppLayout title="機械 / 表格" wide>
      <button
        onClick={() => navigate(`/project/${projectId}/equipment`)}
        className="inline-flex items-center gap-1 text-sm text-site-600 hover:text-site-900 mb-3"
      >
        <ChevronLeft size={16} /> 機械登記冊
      </button>

      {/* Equipment header */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-site-500">{eq.ref_no}</span>
          <span className="text-[10px] bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full">
            {EQUIPMENT_KIND_ZH[eq.kind as EquipmentKind] ?? eq.kind}
          </span>
        </div>
        <h2 className="text-lg font-bold text-site-900 mt-1">{eq.name_zh}</h2>
        <div className="text-[11px] text-site-500 mt-1 space-y-0.5">
          {eq.location_zh && <p>位置：{eq.location_zh}</p>}
          {eq.brand_model && <p>型號：{eq.brand_model}</p>}
          {eq.serial_no && <p>機身編號：{eq.serial_no}</p>}
        </div>
      </div>

      {/* Form instances */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-site-900">需簽署表格</h3>
        {canManage && availableTemplates.length > 0 && (
          <button type="button" className="btn-ghost text-sm" onClick={() => setShowAddForm(true)}>
            <Plus size={14} className="inline mr-1" /> 加入表格
          </button>
        )}
      </div>

      {myInstances.length === 0 ? (
        <div className="card p-8 text-center text-sm text-site-500">
          尚未為此機械加入任何表格
          {canManage && availableTemplates.length > 0 && (
            <p className="text-xs text-site-400 mt-1">按「加入表格」選擇法定週期檢查表格</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {myInstances.map(inst => {
            const tmpl = templateById[inst.template_id]
            if (!tmpl) return null
            const status = deriveFormStatus(inst, tmpl.remind_before_days)
            const signoffs = signoffsByInstance[inst.id] ?? []
            const last = signoffs[0]
            const credOk = hasMatchingCredential(myCredentials, tmpl.required_credential)
            return (
              <div key={inst.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-site-500">{tmpl.code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FORM_STATUS_BADGE_CLASS[status]}`}>
                        {FORM_STATUS_ZH[status]}
                      </span>
                    </div>
                    <p className="font-bold text-site-900 mt-0.5">{tmpl.name_zh}</p>
                    {tmpl.statutory_ref && (
                      <p className="text-[11px] text-site-400 mt-0.5">{tmpl.statutory_ref}</p>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-site-500 mt-2 space-y-0.5">
                  {inst.valid_until
                    ? <p>有效至：{new Date(inst.valid_until).toLocaleDateString('zh-HK')}</p>
                    : <p>未簽署</p>}
                  {last && (
                    <p>
                      上次：{FORM_RESULT_ZH[last.result]} · {new Date(last.signed_at).toLocaleDateString('zh-HK')}
                    </p>
                  )}
                  <p>需要資格：{credentialTypeLabel(tmpl.required_credential)}</p>
                </div>

                {/* Sign button — disabled with a reason when the user lacks a
                    verified matching credential. The RPC is the hard gate. */}
                {credOk ? (
                  <button
                    type="button"
                    onClick={() => setSigning(inst)}
                    className="btn-primary w-full mt-3"
                  >
                    <PenLine size={16} className="inline mr-1" /> 簽署
                  </button>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled
                      className="w-full bg-site-100 text-site-400 font-semibold rounded-xl py-2.5 cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <ShieldAlert size={16} /> 簽署
                    </button>
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5 leading-relaxed">
                      你未有已核實的「{credentialTypeLabel(tmpl.required_credential)}」資格。請於「個人」頁上載證書並由管理員 / PM / 安全主任核實後再簽署。
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {signing && (
        <SignSheet
          instance={signing}
          template={templateById[signing.template_id]!}
          equipmentName={eq.name_zh}
          equipmentRef={eq.ref_no}
          projectName={projectName}
          credential={myCredentials.find(
            c => c.credential_type === templateById[signing.template_id]?.required_credential,
          ) ?? null}
          onClose={() => setSigning(null)}
        />
      )}

      {showAddForm && (
        <AddFormModal
          equipmentId={equipmentId}
          templates={availableTemplates}
          onAdd={addInstance}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </AppLayout>
  )
}

// ── Sign sheet ───────────────────────────────────────────────
// Renders the template checklist (PtwChecklistItem shape), a result picker, and
// PtwSignaturePad. The pad's onSign callback runs signOff (step-up →
// record_form_signoff), then generates the approved-form PDF replica.
function SignSheet({
  instance, template, equipmentName, equipmentRef, projectName, credential, onClose,
}: {
  instance: FormInstance
  template: FormTemplate
  equipmentName: string
  equipmentRef: string
  projectName: string
  credential: UserCredential | null
  onClose: () => void
}) {
  const { profile } = useAuth()
  const { signOff } = useEquipment()
  // Per-item tick state (true / false / null) + optional remark.
  const [values, setValues] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(template.checklist.map(c => [c.key, null])),
  )
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [result, setResult] = useState<FormSignoffResult>('pass')
  const [error, setError] = useState('')
  const [showPad, setShowPad] = useState(false)

  function setItem(key: string, v: boolean | null) {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  function proceedToSign() {
    setError('')
    // Required items must be ticked (pass or fail explicitly). A required item
    // left blank is ambiguous — block it.
    const missing = template.checklist.filter(c => c.required && values[c.key] === null)
    if (missing.length > 0) {
      setError(`請完成所有必填項目：${missing.map(m => m.label_zh).join('、')}`)
      return
    }
    setShowPad(true)
  }

  async function handleSign(signatureB64: string) {
    setError('')
    const payload = {
      checklist: template.checklist.map(c => ({
        key: c.key,
        label_zh: c.label_zh,
        value: values[c.key],
        remark: remarks[c.key]?.trim() || undefined,
      })),
    }
    const { error: e } = await signOff(instance.id, result, payload, signatureB64)
    if (e) { setError(e); setShowPad(false); return }

    // §5 step 7: generate the approved-form PDF replica (print-and-post).
    // Best-effort — a PDF failure must not undo the signoff that already landed.
    try {
      await shareFormSignoffPdf({
        projectName,
        templateName: template.name_zh,
        templateCode: template.code,
        statutoryRef: template.statutory_ref,
        equipmentName,
        equipmentRef,
        location: instance.location_zh,
        resultZh: FORM_RESULT_ZH[result],
        checklist: template.checklist.map(c => ({
          label_zh: c.label_zh,
          value: values[c.key],
          remark: remarks[c.key]?.trim() || undefined,
        })),
        signerName: profile?.name ?? '',
        signedAt: new Date().toISOString(),
        validUntil: template.frequency_days
          ? new Date(Date.now() + template.frequency_days * 86400000).toISOString()
          : null,
        certNo: credential?.cert_no ?? null,
        signatureB64,
      })
    } catch (pdfErr) {
      console.warn('form PDF replica generation failed (signoff still saved):', pdfErr)
    }

    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`簽署 — ${template.name_zh}`}>
      {showPad ? (
        <PtwSignaturePad
          title="請合資格人士簽名"
          onSign={handleSign}
          onCancel={() => setShowPad(false)}
        />
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-site-500">
            {equipmentRef} {equipmentName}
            {instance.location_zh && ` · ${instance.location_zh}`}
          </div>

          {/* Checklist */}
          <div className="space-y-2">
            {template.checklist.map(c => (
              <div key={c.key} className="border border-site-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-site-900 flex-1">
                    {c.label_zh}
                    {c.required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setItem(c.key, true)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        values[c.key] === true
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-site-500 border-site-200'
                      }`}
                    >
                      <Check size={12} className="inline" /> 合格
                    </button>
                    <button
                      type="button"
                      onClick={() => setItem(c.key, false)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        values[c.key] === false
                          ? 'bg-red-50 text-red-600 border-red-300'
                          : 'bg-white text-site-500 border-site-200'
                      }`}
                    >
                      <X size={12} className="inline" /> 不合格
                    </button>
                  </div>
                </div>
                <input
                  value={remarks[c.key] ?? ''}
                  onChange={e => setRemarks(prev => ({ ...prev, [c.key]: e.target.value }))}
                  placeholder="備註 (可選)"
                  className="input mt-2 text-sm"
                />
              </div>
            ))}
          </div>

          {/* Result picker */}
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">整體結果</label>
            <div className="flex gap-2">
              {RESULT_OPTIONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResult(r)}
                  className={`flex-1 px-2 py-2 rounded-xl text-sm font-semibold border ${
                    result === r
                      ? r === 'fail'
                        ? 'bg-red-50 text-red-600 border-red-300'
                        : 'bg-safety-50 text-safety-700 border-safety-300'
                      : 'bg-white text-site-500 border-site-200'
                  }`}
                >
                  {FORM_RESULT_ZH[r]}
                </button>
              ))}
            </div>
            {result === 'fail' && (
              <p className="text-[11px] text-red-600 mt-1.5 leading-relaxed">
                標記不合格後，此機械會即時標記為「停用」，並通知安全主任及 PM。
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
          )}

          <button type="button" onClick={proceedToSign} className="btn-primary w-full">
            <PenLine size={16} className="inline mr-1" /> 下一步：簽名
          </button>
        </div>
      )}
    </Modal>
  )
}

// ── Add-form-instance modal ──────────────────────────────────
function AddFormModal({
  equipmentId, templates, onAdd, onClose,
}: {
  equipmentId: string
  templates: FormTemplate[]
  onAdd: (equipmentId: string, templateId: string, locationZh?: string | null) => Promise<{ id: string | null; error: string | null }>
  onClose: () => void
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!templateId) { setError('請選擇表格'); return }
    setSaving(true)
    const { error: e } = await onAdd(equipmentId, templateId)
    setSaving(false)
    if (e) { setError(e); return }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="加入表格">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold text-site-500 block mb-1">法定表格</label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="input">
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.code} — {t.name_zh}</option>
            ))}
          </select>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5">
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
          >
            {saving ? <Spinner size={16} className="text-white" /> : <Plus size={16} />}
            加入
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function EquipmentDetailPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  return (
    <EquipmentProvider projectId={projectId}>
      <EquipmentDetailInner />
    </EquipmentProvider>
  )
}
