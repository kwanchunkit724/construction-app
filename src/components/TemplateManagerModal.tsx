import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, PackagePlus, ChevronLeft } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import type { ProgressTemplate, Zone } from '../types'

// v108: 每地盤工序範本 (E4 project scope, E5 copy-in) — pre-set bundles like
// 走廊工作 / 垃圾房工作 / 𨋢大堂工作, then stamp them into the 進度表 in one
// tap. Applying inserts ordinary items under a chosen 大項/中項 (same numbering
// + audit as manual adds); editing a template later never touches what was
// already inserted.

type View =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'apply'; template: ProgressTemplate }

export function TemplateManagerModal({ open, onClose, zones }: {
  open: boolean
  onClose: () => void
  zones: Zone[]
}) {
  const { items, fetchTemplates, saveTemplate, deleteTemplate, applyTemplate } = useProgress()
  const [templates, setTemplates] = useState<ProgressTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // create form
  const [name, setName] = useState('')
  const [lines, setLines] = useState('')
  const [allAcceptance, setAllAcceptance] = useState(false)

  // apply form
  const [zoneId, setZoneId] = useState('')
  const [parentId, setParentId] = useState('')
  // E8 assign-by-range: stamp the template onto EVERY floor in a range
  // (B翼 8-15 樓一嘢過), instead of one parent at a time.
  const [applyMode, setApplyMode] = useState<'single' | 'range'>('single')
  const [floorFrom, setFloorFrom] = useState('')
  const [floorTo, setFloorTo] = useState('')

  async function reload() {
    setLoading(true)
    setTemplates(await fetchTemplates())
    setLoading(false)
  }
  useEffect(() => {
    if (open) {
      setView({ kind: 'list' }); setError(''); setOkMsg('')
      void reload()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsedLines = lines.split(/[\n,，]/).map(s => s.trim()).filter(Boolean)

  // apply target: non-leaf-capable parents in the chosen zone (大項/中項) —
  // template items land as their children.
  const parentOptions = useMemo(() => {
    if (!zoneId) return []
    return items
      .filter(i => i.zone_id === zoneId && i.level <= 2)
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [items, zoneId])

  // v109 floor nodes in the chosen zone, ordered bottom→top by sort_order.
  const floorNodes = useMemo(() => {
    if (!zoneId) return []
    return items
      .filter(i => i.zone_id === zoneId && i.parent_id === null && i.node_kind === 'floor')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }, [items, zoneId])
  const rangeFloors = useMemo(() => {
    if (applyMode !== 'range' || !floorFrom || !floorTo) return []
    const iFrom = floorNodes.findIndex(f => f.id === floorFrom)
    const iTo = floorNodes.findIndex(f => f.id === floorTo)
    if (iFrom === -1 || iTo === -1) return []
    const [lo, hi] = iFrom <= iTo ? [iFrom, iTo] : [iTo, iFrom]
    return floorNodes.slice(lo, hi + 1)
  }, [applyMode, floorFrom, floorTo, floorNodes])

  async function onCreate() {
    setError('')
    if (!name.trim()) return setError('請輸入範本名稱')
    if (parsedLines.length === 0) return setError('請至少輸入一項工序')
    setBusy(true)
    const { error } = await saveTemplate(name, parsedLines.map(t => ({
      title: t,
      tracking_mode: 'percentage',
      acceptance_required: allAcceptance,
    })))
    setBusy(false)
    if (error) return setError(error)
    setName(''); setLines(''); setAllAcceptance(false)
    setView({ kind: 'list' })
    void reload()
  }

  async function onDelete(id: string) {
    setBusy(true)
    const { error } = await deleteTemplate(id)
    setBusy(false)
    if (error) return setError(error)
    void reload()
  }

  async function onApply() {
    if (view.kind !== 'apply') return
    setError('')
    if (!zoneId) return setError('請揀分區')
    if (applyMode === 'range') {
      if (rangeFloors.length === 0) return setError('請揀樓層範圍')
      setBusy(true)
      let total = 0
      for (const fl of rangeFloors) {
        const { error, inserted } = await applyTemplate(view.template, fl.id, zoneId)
        total += inserted
        if (error) { setBusy(false); return setError(`${fl.title}：${error}（合共已加入 ${total} 項）`) }
      }
      setBusy(false)
      setOkMsg(`已加入 ${total} 項工序（${rangeFloors.length} 層）`)
      setView({ kind: 'list' })
      return
    }
    if (!parentId) return setError('請揀要加入去邊個項目下面')
    setBusy(true)
    const { error, inserted } = await applyTemplate(view.template, parentId, zoneId)
    setBusy(false)
    if (error) return setError(error)
    setOkMsg(`已加入 ${inserted} 項工序`)
    setView({ kind: 'list' })
  }

  const title = view.kind === 'create' ? '新增工序範本'
    : view.kind === 'apply' ? `套用「${view.template.name}」`
    : '工序範本'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        view.kind === 'create' ? (
          <button onClick={onCreate} disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner size={18} className="text-white" /> : '儲存範本'}
          </button>
        ) : view.kind === 'apply' ? (
          <button onClick={onApply} disabled={busy} className="btn-primary w-full">
            {busy
              ? <Spinner size={18} className="text-white" />
              : applyMode === 'range'
                ? `加入 ${view.template.items.length} 項 × ${rangeFloors.length} 層`
                : `加入 ${view.template.items.length} 項工序`}
          </button>
        ) : (
          <button
            onClick={() => { setError(''); setOkMsg(''); setView({ kind: 'create' }) }}
            className="btn-primary w-full"
          >
            <Plus size={16} /> 新增範本
          </button>
        )
      }
    >
      {view.kind !== 'list' && (
        <button
          onClick={() => { setError(''); setView({ kind: 'list' }) }}
          className="text-xs text-site-500 hover:text-site-800 inline-flex items-center gap-1 mb-3 min-h-0"
        >
          <ChevronLeft size={13} /> 返回範本列表
        </button>
      )}

      {view.kind === 'list' && (
        loading ? (
          <div className="py-8 flex justify-center"><Spinner size={24} /></div>
        ) : templates.length === 0 ? (
          <div className="text-center py-8">
            <PackagePlus size={32} className="mx-auto text-site-300 mb-2" />
            <p className="text-sm text-site-600">未有工序範本</p>
            <p className="text-xs text-site-400 mt-1">
              例如「走廊工作」「垃圾房工作」「𨋢大堂工作」— 設定一次，之後一撳即加入進度表
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="card p-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-site-900 truncate">{t.name}</p>
                    <p className="text-[11px] text-site-400 truncate">
                      {t.items.length} 項：{t.items.map(i => i.title).join('、')}
                    </p>
                  </div>
                  <button
                    onClick={() => { setError(''); setOkMsg(''); setZoneId(zones[0]?.id ?? ''); setParentId(''); setApplyMode('single'); setFloorFrom(''); setFloorTo(''); setView({ kind: 'apply', template: t }) }}
                    className="flex-shrink-0 text-xs font-semibold bg-safety-500 hover:bg-safety-600 text-white rounded-lg px-3 py-2 min-h-0"
                  >套用</button>
                  <button
                    onClick={() => void onDelete(t.id)}
                    disabled={busy}
                    className="flex-shrink-0 w-9 h-9 grid place-items-center text-site-400 hover:text-red-600 rounded-lg min-h-0"
                    aria-label="刪除範本"
                  ><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view.kind === 'create' && (
        <div className="space-y-4">
          <div>
            <label className="label">範本名稱 *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="例：走廊工作" />
          </div>
          <div>
            <label className="label">工序（每行一項）*</label>
            <textarea
              className="input resize-none"
              rows={6}
              value={lines}
              onChange={e => setLines(e.target.value)}
              placeholder={'例：\n批盪\n油漆\n鋪磚\n收口'}
            />
            {parsedLines.length > 0 && (
              <p className="text-[11px] text-site-400 mt-1">將建立 {parsedLines.length} 項工序</p>
            )}
          </div>
          <label className="flex items-center gap-2.5 rounded-xl bg-site-50 border border-site-100 p-3 cursor-pointer">
            <input type="checkbox" checked={allAcceptance} onChange={e => setAllAcceptance(e.target.checked)} className="accent-safety-600 h-4 w-4" />
            <span className="text-sm text-site-800">全部工序需要驗收</span>
          </label>
        </div>
      )}

      {view.kind === 'apply' && (
        <div className="space-y-4">
          <div className="text-xs text-site-500 bg-site-100 rounded-lg p-2.5">
            {view.template.items.map(i => i.title).join('、')}
          </div>
          <div>
            <label className="label">分區 *</label>
            <select className="input" value={zoneId} onChange={e => { setZoneId(e.target.value); setParentId(''); setFloorFrom(''); setFloorTo('') }}>
              <option value="">— 揀分區 —</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          {floorNodes.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setApplyMode('single')}
                className={`py-2 rounded-xl text-sm border font-semibold min-h-0 ${applyMode === 'single' ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}
              >單一項目</button>
              <button type="button" onClick={() => setApplyMode('range')}
                className={`py-2 rounded-xl text-sm border font-semibold min-h-0 ${applyMode === 'range' ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}
              >樓層範圍</button>
            </div>
          )}
          {applyMode === 'range' && floorNodes.length > 0 ? (
            <div>
              <label className="label">樓層範圍 *（每層各加一套工序）</label>
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={floorFrom} onChange={e => setFloorFrom(e.target.value)}>
                  <option value="">— 由 —</option>
                  {floorNodes.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
                <select className="input" value={floorTo} onChange={e => setFloorTo(e.target.value)}>
                  <option value="">— 至 —</option>
                  {floorNodes.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>
              {rangeFloors.length > 0 && (
                <p className="text-[11px] text-site-400 mt-1">
                  {rangeFloors.length} 層 × {view.template.items.length} 項 = 共 {rangeFloors.length * view.template.items.length} 項工序
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="label">加入去邊個項目下面 *</label>
              <select className="input" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">— 揀大項／中項／樓層 —</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {'　'.repeat(p.level - 1)}{p.title}
                  </option>
                ))}
              </select>
              {zoneId && parentOptions.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">呢個分區未有大項 — 請先加入大項（或用「總樓層設定」生成樓層）</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">{error}</div>
      )}
      {okMsg && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mt-3">✓ {okMsg}</div>
      )}
    </Modal>
  )
}
