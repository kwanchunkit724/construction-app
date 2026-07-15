import { useEffect, useMemo, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { useProgress } from '../contexts/ProgressContext'
import { useAuth } from '../contexts/AuthContext'
import { useTrades } from '../lib/trades'
import { supabase } from '../lib/supabase'
import type { Zone } from '../types'

// T2 判紙批量指派 (E8, panel hybrid). 分區 × 樓層範圍 × 工種 → preview → 揀
// 判頭公司 + 邊啲人 → 一撳寫入所有命中 leaf 嘅 assigned_to (append, 唔清舊),
// 同時落一行 assignment_batches 判紙記錄 (append-only — 判錯就再出一張新,
// 舊嗰張留喺 trail)。公司 = 商業責任, 人 = 報數人, 分兩層。

type Handler = { user_id: string; name: string; role: string }
type Company = { id: string; name: string; kind: 'nsc' | 'labour' }

export function BatchAssignModal({ open, onClose, zones, projectId }: {
  open: boolean
  onClose: () => void
  zones: Zone[]
  projectId: string
}) {
  const { items, refetch } = useProgress()
  const { profile } = useAuth()
  const trades = useTrades()

  const [zoneId, setZoneId] = useState('')
  const [floorFrom, setFloorFrom] = useState('')
  const [floorTo, setFloorTo] = useState('')
  const [trade, setTrade] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [newCompany, setNewCompany] = useState('')
  const [handlers, setHandlers] = useState<Handler[]>([])
  const [pickedPeople, setPickedPeople] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    if (!open) return
    setZoneId(zones[0]?.id ?? ''); setFloorFrom(''); setFloorTo(''); setTrade('')
    setCompanyId(''); setPickedPeople([]); setError(''); setOkMsg(''); setNewCompany('')
    supabase.from('subcontractor_companies').select('id,name,kind').eq('project_id', projectId)
      .order('created_at').then(({ data }) => setCompanies((data ?? []) as Company[]))
    supabase.rpc('get_project_handlers', { p_project_id: projectId })
      .then(({ data }) => setHandlers(((data ?? []) as Handler[])))
  }, [open, projectId, zones])

  const floorNodes = useMemo(() =>
    items.filter(i => i.zone_id === zoneId && i.parent_id === null && i.node_kind === 'floor')
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  [items, zoneId])

  // matched leaves: in zone, under the floor range (when set), matching trade (when set)
  const matched = useMemo(() => {
    if (!zoneId) return []
    const isLeaf = (id: string) => !items.some(i => i.parent_id === id)
    let floorSet: Set<string> | null = null
    if (floorFrom && floorTo && floorNodes.length > 0) {
      const iF = floorNodes.findIndex(f => f.id === floorFrom)
      const iT = floorNodes.findIndex(f => f.id === floorTo)
      if (iF !== -1 && iT !== -1) {
        const [lo, hi] = iF <= iT ? [iF, iT] : [iT, iF]
        floorSet = new Set(floorNodes.slice(lo, hi + 1).map(f => f.id))
      }
    }
    const underFloor = (id: string | null): boolean => {
      if (!floorSet) return true
      let cur = id ? items.find(i => i.id === id) : undefined
      while (cur) {
        if (floorSet.has(cur.id)) return true
        cur = cur.parent_id ? items.find(i => i.id === cur!.parent_id) : undefined
      }
      return false
    }
    return items.filter(i =>
      i.zone_id === zoneId
      && isLeaf(i.id)
      && i.node_kind !== 'floor'
      && (!trade || i.trade === trade)
      && underFloor(i.id))
  }, [items, zoneId, trade, floorFrom, floorTo, floorNodes])

  async function addCompany() {
    if (!newCompany.trim() || !profile) return
    const { data, error } = await supabase.from('subcontractor_companies')
      .insert({ project_id: projectId, name: newCompany.trim(), kind: 'labour', created_by: profile.id })
      .select('id,name,kind').single()
    if (error) return setError(error.message)
    setCompanies(c => [...c, data as Company])
    setCompanyId((data as Company).id)
    setNewCompany('')
  }

  function togglePerson(id: string) {
    setPickedPeople(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function onExecute() {
    setError('')
    if (!profile) return
    if (matched.length === 0) return setError('冇命中任何工序')
    if (pickedPeople.length === 0) return setError('請至少揀一個人')
    setBusy(true)
    // append people to each matched leaf's assigned_to (dedup, never wipe)
    for (const leaf of matched) {
      const merged = [...new Set([...(leaf.assigned_to ?? []), ...pickedPeople])]
      const { error: uErr } = await supabase.from('progress_items').update({
        assigned_to: merged,
        last_updated_by: profile.id,
        last_updated_at: new Date().toISOString(),
      }).eq('id', leaf.id)
      if (uErr) { setBusy(false); return setError(`${leaf.title}：${uErr.message}`) }
    }
    // the 判紙 record (append-only trail)
    const fromLabel = floorNodes.find(f => f.id === floorFrom)?.title ?? null
    const toLabel = floorNodes.find(f => f.id === floorTo)?.title ?? null
    const { error: bErr } = await supabase.from('assignment_batches').insert({
      project_id: projectId,
      zone_id: zoneId,
      floor_from: fromLabel,
      floor_to: toLabel,
      trade: trade || null,
      company_id: companyId || null,
      assignee_ids: pickedPeople,
      item_count: matched.length,
      created_by: profile.id,
    })
    await refetch()
    setBusy(false)
    if (bErr) return setError(`已指派 ${matched.length} 項，但判紙記錄失敗：${bErr.message}`)
    setOkMsg(`已指派 ${matched.length} 項工序畀 ${pickedPeople.length} 人`)
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose() }}
      title="批量指派（判紙）"
      footer={
        <button onClick={onExecute} disabled={busy || matched.length === 0 || pickedPeople.length === 0} className="btn-primary w-full">
          {busy ? <Spinner size={18} className="text-white" /> : `指派 ${matched.length} 項工序`}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">分區 *</label>
          <select className="input" value={zoneId} onChange={e => { setZoneId(e.target.value); setFloorFrom(''); setFloorTo('') }}>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>

        {floorNodes.length > 0 && (
          <div>
            <label className="label">樓層範圍（可選 — 唔揀 = 成個分區）</label>
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
          </div>
        )}

        <div>
          <label className="label">工種（可選）</label>
          <select className="input" value={trade} onChange={e => setTrade(e.target.value)}>
            <option value="">全部工種</option>
            {trades.map(t => <option key={t.code} value={t.code}>{t.group_zh} · {t.name_zh}</option>)}
          </select>
        </div>

        {/* live preview — the 判紙's exact hit list size, before anything writes */}
        <div className={`rounded-xl border px-3 py-2.5 text-sm ${matched.length > 0 ? 'bg-safety-50 border-safety-200 text-safety-800' : 'bg-site-50 border-site-200 text-site-500'}`}>
          命中 <span className="font-bold">{matched.length}</span> 項工序
          {matched.length > 0 && (
            <span className="block text-xs text-site-500 mt-0.5 truncate">
              {matched.slice(0, 5).map(m => m.title).join('、')}{matched.length > 5 ? ` …+${matched.length - 5}` : ''}
            </span>
          )}
        </div>

        <div>
          <label className="label">判頭公司（可選）</label>
          <select className="input" value={companyId} onChange={e => setCompanyId(e.target.value)}>
            <option value="">— 唔記錄公司 —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.kind === 'nsc' ? '（NSC）' : ''}</option>)}
          </select>
          <div className="flex gap-2 mt-2">
            <input className="input flex-1" placeholder="新增公司名（例：陳記泥水）" value={newCompany} onChange={e => setNewCompany(e.target.value)} />
            <button type="button" onClick={() => void addCompany()} disabled={!newCompany.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40">
              <Plus size={14} /> 加
            </button>
          </div>
        </div>

        <div>
          <label className="label">指派畀（報數人，可多選）*</label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto bg-site-50 border border-site-200 rounded-xl p-2">
            {handlers.map(h => {
              const on = pickedPeople.includes(h.user_id)
              return (
                <label key={h.user_id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${on ? 'bg-white border border-safety-300' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => togglePerson(h.user_id)} className="accent-safety-600 h-4 w-4" />
                  <Users size={12} className="text-site-400" />
                  <span className="text-sm text-site-800 flex-1 truncate">{h.name}</span>
                  <span className="text-[10px] text-site-400">{h.role}</span>
                </label>
              )
            })}
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
        {okMsg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">✓ {okMsg}</div>}
      </div>
    </Modal>
  )
}
