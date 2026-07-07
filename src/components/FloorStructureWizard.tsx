import { useMemo, useState } from 'react'
import { Layers } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { generateFloorLabels } from '../types'
import type { Zone } from '../types'
import { supabase } from '../lib/supabase'

// v109 總樓層設定 wizard (E7 opt-in). Tell it 地庫幾層 / 非正常樓層 / 標準幾層 /
// 天面幾層 → it stamps ONE floor node per 層 into the chosen 分區 (ordinary
// level-1 progress_items tagged node_kind='floor', ordered by sort_order).
// After that you add 工序 under the floor you're working on — or stamp a whole
// 工序範本 onto a floor range in one tap (TemplateManagerModal). Existing
// projects are untouched until someone runs this — 唔會逼你重建.

export function FloorStructureWizard({ open, onClose, zones, projectId }: {
  open: boolean
  onClose: () => void
  zones: Zone[]
  projectId: string
}) {
  const { addItem, items } = useProgress()
  const [zoneId, setZoneId] = useState('')
  const [basements, setBasements] = useState(0)
  const [irregular, setIrregular] = useState('G/F')
  const [standardCount, setStandardCount] = useState(18)
  const [roofCount, setRoofCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState('')

  const preset = useMemo(() => ({
    basements: Math.max(0, basements),
    irregular: irregular.split(/[,，\n]/).map(s => s.trim()).filter(Boolean),
    standardCount: Math.max(0, standardCount),
    roofCount: Math.max(0, roofCount),
  }), [basements, irregular, standardCount, roofCount])
  const floors = useMemo(() => generateFloorLabels(preset), [preset])
  const existingFloorLabels = useMemo(() => {
    if (!zoneId) return new Set<string>()
    return new Set(items.filter(i => i.zone_id === zoneId && i.parent_id === null && i.node_kind === 'floor').map(i => i.title))
  }, [items, zoneId])
  const toCreate = floors.filter(f => !existingFloorLabels.has(f.label))

  async function onGenerate() {
    setError('')
    if (!zoneId) return setError('請揀分區')
    if (toCreate.length === 0) return setError('冇新樓層需要建立')
    setBusy(true)
    let done = 0
    for (const f of toCreate) {
      setProgressMsg(`建立中 ${f.label}（${done + 1}/${toCreate.length}）…`)
      const { data: code, error: codeErr } = await supabase.rpc('next_progress_code', {
        p_project_id: projectId, p_zone_id: zoneId, p_parent_id: null,
      })
      if (codeErr) { setBusy(false); return setError(`編號失敗：${codeErr.message}（已建立 ${done} 層）`) }
      const r = await addItem({
        parent_id: null,
        code: (code as string) ?? '',
        title: f.label,
        zone_id: zoneId,
        node_kind: 'floor',
        sort_order: f.sort,
      })
      if (r.error) { setBusy(false); return setError(`${r.error}（已建立 ${done} 層）`) }
      done++
    }
    // remember the wizard inputs for next time (best-effort; RLS may limit to admin/PM)
    await supabase.from('projects').update({ floor_preset: preset }).eq('id', projectId)
    setBusy(false)
    setProgressMsg('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose() }}
      title="總樓層設定"
      footer={
        <button onClick={onGenerate} disabled={busy || !zoneId || toCreate.length === 0} className="btn-primary w-full">
          {busy ? <Spinner size={18} className="text-white" /> : `生成 ${toCreate.length} 層`}
        </button>
      }
    >
      <p className="text-xs text-site-500 mb-3">
        每層會成為分區內嘅一個樓層項目，之後喺相應樓層下面加工序（或用工序範本一次過套用到樓層範圍），唔使另創樓層。
      </p>
      <div className="space-y-4">
        <div>
          <label className="label">分區（座／翼）*</label>
          <select className="input" value={zoneId} onChange={e => setZoneId(e.target.value)}>
            <option value="">— 揀分區 —</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label">地庫層數</label>
            <input type="number" min={0} max={10} className="input" value={basements}
              onChange={e => setBasements(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div>
            <label className="label">標準樓層數</label>
            <input type="number" min={0} max={99} className="input" value={standardCount}
              onChange={e => setStandardCount(Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div>
            <label className="label">天面層數</label>
            <input type="number" min={0} max={5} className="input" value={roofCount}
              onChange={e => setRoofCount(Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>
        <div>
          <label className="label">非正常樓層（逗號分隔，排喺地庫之後、標準層之前）</label>
          <input className="input" value={irregular} onChange={e => setIrregular(e.target.value)} placeholder="例：G/F, UG/F, 平台" />
        </div>
        {floors.length > 0 && (
          <div>
            <p className="text-xs text-site-500 mb-1.5 flex items-center gap-1">
              <Layers size={12} /> 預覽（{floors.length} 層{existingFloorLabels.size > 0 ? `，${floors.length - toCreate.length} 層已存在會跳過` : ''}）
            </p>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {floors.map(f => (
                <span key={f.label} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  existingFloorLabels.has(f.label)
                    ? 'bg-site-100 border-site-200 text-site-400 line-through'
                    : 'bg-white border-purple-200 text-purple-600'
                }`}>{f.label}</span>
              ))}
            </div>
          </div>
        )}
        {progressMsg && <p className="text-xs text-site-500">{progressMsg}</p>}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}
