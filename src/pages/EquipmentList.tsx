import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Wrench, ChevronRight, X, QrCode } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { EquipmentProvider, useEquipment } from '../contexts/EquipmentContext'
import { EquipmentQrPrintSheet, type QrPrintCard } from '../components/equipment/EquipmentQrPrintSheet'
import { mintEquipmentQrToken } from '../lib/equipment-jwt'
import { VerifyCredentialsPanel } from '../components/VerifyCredentialsPanel'
import {
  EQUIPMENT_KIND_ZH, FORM_STATUS_ZH, FORM_STATUS_BADGE_CLASS, deriveFormStatus,
} from '../types'
import type { EquipmentKind, FormStatus } from '../types'

const KIND_OPTIONS: EquipmentKind[] = ['scaffold', 'excavation', 'lifting_appliance', 'swp', 'other']

// Dashboard stat tiles, in the order the boss reads them (有效→停用), with the
// CLAUDE.md badge palette.
const STAT_TILES: { key: FormStatus; color: string }[] = [
  { key: 'valid', color: 'text-green-700 bg-green-50 border-green-200' },
  { key: 'expiring', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { key: 'expired', color: 'text-red-600 bg-red-50 border-red-200' },
  { key: 'missing', color: 'text-site-600 bg-site-50 border-site-200' },
  { key: 'suspended', color: 'text-red-700 bg-red-50 border-red-300' },
]

function daysRemaining(validUntil: string | null): number | null {
  if (!validUntil) return null
  const ms = new Date(validUntil).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / 86400000)
}

function EquipmentListInner() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    equipment, instances, templateById, dashboard, loading, fetchError, canManage,
  } = useEquipment()
  const [showAdd, setShowAdd] = useState(false)

  // 列印全部 QR (managers): mint a token per equipment, then open the print
  // sheet. Cards start token=null and stream in as each mint resolves so the
  // sheet can show its own spinner until ready.
  const [printCards, setPrintCards] = useState<QrPrintCard[] | null>(null)
  const [minting, setMinting] = useState(false)

  async function printAllQr() {
    if (minting || equipment.length === 0) return
    setMinting(true)
    setPrintCards(equipment.map(eq => ({
      equipmentId: eq.id, refNo: eq.ref_no, nameZh: eq.name_zh, token: null, error: null,
    })))
    const minted = await Promise.all(
      equipment.map(async eq => {
        const { token, error } = await mintEquipmentQrToken(eq.id)
        return { equipmentId: eq.id, refNo: eq.ref_no, nameZh: eq.name_zh, token, error } as QrPrintCard
      }),
    )
    setPrintCards(minted)
    setMinting(false)
  }

  // Instances grouped by equipment for the per-card status chips.
  const instancesByEquipment = useMemo(() => {
    const m: Record<string, typeof instances> = {}
    instances.forEach(i => {
      if (!i.equipment_id) return
      ;(m[i.equipment_id] ||= []).push(i)
    })
    return m
  }, [instances])

  if (!projectId) return null

  return (
    <AppLayout title="機械 / 表格" wide>
      <div className="space-y-4">
        {fetchError && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {/* Dashboard header — colored stat tiles from get_forms_dashboard. */}
        {dashboard && (
          <div className="grid grid-cols-5 gap-2">
            {STAT_TILES.map(t => (
              <div key={t.key} className={`rounded-xl border p-2 text-center ${t.color}`}>
                <p className="text-xl font-black leading-none">{dashboard.counts[t.key] ?? 0}</p>
                <p className="text-[10px] mt-1 font-medium">{FORM_STATUS_ZH[t.key]}</p>
              </div>
            ))}
          </div>
        )}

        {/* Managers: verify members' uploaded credentials. Hidden when none. */}
        {canManage && <VerifyCredentialsPanel />}

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-site-900">機械登記冊</h2>
          {canManage && (
            <div className="flex items-center gap-2">
              {equipment.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={minting}
                  onClick={printAllQr}
                >
                  {minting
                    ? <Spinner size={14} className="inline mr-1" />
                    : <QrCode size={14} className="inline mr-1" />}
                  列印全部 QR
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
                <Plus size={16} className="inline mr-1" />
                新增機械
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center"><Spinner size={32} /></div>
        ) : equipment.length === 0 ? (
          <div className="card p-8 text-center">
            <Wrench size={36} className="mx-auto text-site-300 mb-2" />
            <p className="text-sm text-site-600">尚未登記機械</p>
            {canManage && (
              <p className="text-xs text-site-400 mt-1">按「新增機械」加入第一部機械 / 結構</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {equipment.map(eq => (
              <button
                key={eq.id}
                type="button"
                onClick={() => navigate(`/project/${projectId}/equipment/${eq.id}`)}
                className="card p-4 text-left hover:bg-site-50 transition-colors min-h-[44px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-site-500 flex-shrink-0">{eq.ref_no}</span>
                      <span className="text-[10px] bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full">
                        {EQUIPMENT_KIND_ZH[eq.kind as EquipmentKind] ?? eq.kind}
                      </span>
                    </div>
                    <p className="font-bold text-site-900 truncate mt-0.5">{eq.name_zh}</p>
                    {(eq.location_zh || eq.brand_model) && (
                      <p className="text-[11px] text-site-500 truncate mt-0.5">
                        {[eq.location_zh, eq.brand_model].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-site-300 flex-shrink-0 mt-1" />
                </div>

                {/* Per-instance status chips with days-remaining. */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(instancesByEquipment[eq.id] ?? []).map(inst => {
                    const tmpl = templateById[inst.template_id]
                    const status = deriveFormStatus(inst, tmpl?.remind_before_days ?? 3)
                    const days = daysRemaining(inst.valid_until)
                    const daysLabel =
                      status === 'missing' ? '' :
                      status === 'expired' && days !== null ? ` ${Math.abs(days)} 日前` :
                      days !== null ? ` 餘 ${days} 日` : ''
                    return (
                      <span
                        key={inst.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${FORM_STATUS_BADGE_CLASS[status]}`}
                      >
                        {tmpl?.code ?? '表格'} · {FORM_STATUS_ZH[status]}{daysLabel}
                      </span>
                    )
                  })}
                  {(instancesByEquipment[eq.id] ?? []).length === 0 && (
                    <span className="text-[10px] text-site-400">尚未加入表格</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddEquipmentModal onClose={() => setShowAdd(false)} />
      )}

      {printCards && (
        <EquipmentQrPrintSheet
          title="列印全部機械 QR"
          cards={printCards}
          onClose={() => setPrintCards(null)}
        />
      )}
    </AppLayout>
  )
}

function AddEquipmentModal({ onClose }: { onClose: () => void }) {
  const { addEquipment } = useEquipment()
  const [kind, setKind] = useState<EquipmentKind>('scaffold')
  const [nameZh, setNameZh] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [serialNo, setSerialNo] = useState('')
  const [locationZh, setLocationZh] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (!nameZh.trim()) { setError('請輸入機械名稱'); return }
    setSaving(true)
    const { error: e } = await addEquipment({
      kind, name_zh: nameZh, brand_model: brandModel, serial_no: serialNo, location_zh: locationZh,
    })
    setSaving(false)
    if (e) { setError(e); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-site-900">新增機械</h3>
          <button onClick={onClose} className="text-site-400 hover:text-site-700 p-1 -mr-1 min-h-0" aria-label="關閉">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">類別</label>
            <select value={kind} onChange={e => setKind(e.target.value as EquipmentKind)} className="input">
              {KIND_OPTIONS.map(k => (
                <option key={k} value={k}>{EQUIPMENT_KIND_ZH[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">名稱 *</label>
            <input value={nameZh} onChange={e => setNameZh(e.target.value)} placeholder="例如：A 座外牆棚架" className="input" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">品牌 / 型號</label>
            <input value={brandModel} onChange={e => setBrandModel(e.target.value)} placeholder="(可選)" className="input" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">機身編號</label>
            <input value={serialNo} onChange={e => setSerialNo(e.target.value)} placeholder="(可選)" className="input" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-site-500 block mb-1">位置</label>
            <input value={locationZh} onChange={e => setLocationZh(e.target.value)} placeholder="例如：3/F 東面" className="input" />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">{error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-site-200 text-site-700 hover:bg-site-50 font-semibold rounded-xl py-2.5">
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 flex items-center justify-center gap-1.5"
          >
            {saving ? <Spinner size={16} className="text-white" /> : <Plus size={16} />}
            新增
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EquipmentListPage() {
  const { id: projectId } = useParams<{ id: string }>()
  if (!projectId) return null
  return (
    <EquipmentProvider projectId={projectId}>
      <EquipmentListInner />
    </EquipmentProvider>
  )
}
