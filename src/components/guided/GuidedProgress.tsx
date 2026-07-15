import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Eye, Edit3, Map as MapIcon, Check } from 'lucide-react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { SiteMapView } from './SiteMap'
import { useProgress } from '../../contexts/ProgressContext'
import { useDicts, guidedLeaves, guidedPct, guidedPctOf, distinctValues, unionOrdered } from '../../lib/guided'
import { supabase } from '../../lib/supabase'
import type { Project, ProgressItem, Zone, ZoneKind } from '../../types'

// Guided 進度表 (v112) — button-drill navigation over flat leaves.
//   只看:  大樓/外圍 → 分區 → 工種 → 樓層 → 位置 → 工序   (每頁純 %)
//   更新:  大樓/外圍 → 分區 → 工種 → 位置 → 工序 → 剔樓層
// 外圍 zones have no floors: their processes tick 位置 labels instead, and
// both flows skip the 位置 page (the ticks ARE the 位置).

type Mode = 'view' | 'update'

interface Sel {
  kind?: ZoneKind
  zoneId?: string
  tradeLabel?: string
  floor?: string
  location?: string
}

type Page = 'kind' | 'zone' | 'trade' | 'floor' | 'location' | 'process'

const KIND_ZH: Record<ZoneKind, string> = { building: '大樓', external: '外圍' }

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-site-300'
  if (pct >= 100) return 'text-green-600'
  if (pct > 0) return 'text-blue-600'
  return 'text-site-400'
}

function PctRow({ label, pct, sub, onClick, onDelete }: {
  label: string
  pct: number | null
  sub?: string
  onClick?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onClick}
        disabled={!onClick}
        className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-white border border-site-200 rounded-xl px-4 py-3.5 text-left hover:border-safety-300 active:bg-safety-50 disabled:active:bg-white"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-[15px] text-site-900 truncate">{label}</span>
          {sub && <span className="block text-[11px] text-site-400 mt-0.5 truncate">{sub}</span>}
        </span>
        <span className={`flex-shrink-0 text-lg font-bold ${pctColor(pct)}`}>
          {pct === null ? '—' : `${pct}%`}
        </span>
      </button>
      {onDelete && (
        <button onClick={onDelete} className="flex-shrink-0 w-10 h-10 grid place-items-center text-site-300 hover:text-red-600" aria-label="刪除">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

export function GuidedProgress({ project }: {
  project: Project
}) {
  const { items, canEdit, canUpdateItem, addItem, updateFloors, deleteItem } = useProgress()
  const { byKind, add: addDict, remove: removeDict } = useDicts(project.id)

  const [mode, setMode] = useState<Mode>('view')
  const [sel, setSel] = useState<Sel>({})
  const [showMap, setShowMap] = useState(false)
  const [ticking, setTicking] = useState<ProgressItem | null>(null)
  const [addingProcess, setAddingProcess] = useState(false)
  const [err, setErr] = useState('')

  const zones = project.zones
  const zone: Zone | undefined = sel.zoneId ? zones.find(z => z.id === sel.zoneId) : undefined
  const isExternal = zone?.kind === 'external'

  // Page = first unset dimension in the mode's drill order. 外圍 skips
  // floor AND location (its ticks are the 位置). 更新 skips floor.
  const page: Page = useMemo(() => {
    if (!sel.kind) return 'kind'
    if (!sel.zoneId) return 'zone'
    if (!sel.tradeLabel) return 'trade'
    if (isExternal) return 'process'
    if (mode === 'view' && !sel.floor) return 'floor'
    if (!sel.location) return 'location'
    return 'process'
  }, [sel, mode, isExternal])

  function back() {
    setErr('')
    setSel(prev => {
      const n = { ...prev }
      if (page === 'process') {
        if (isExternal) { delete n.tradeLabel; return n }
        delete n.location
        return n
      }
      if (page === 'location') { mode === 'view' ? delete n.floor : delete n.tradeLabel; return n }
      if (page === 'floor') { delete n.tradeLabel; return n }
      if (page === 'trade') { delete n.zoneId; return n }
      if (page === 'zone') { delete n.kind; return n }
      return n
    })
  }

  function switchMode(m: Mode) {
    setMode(m)
    setErr('')
    // floor is a view-only dimension — drop it so update-mode drilling never
    // filters by a floor the user can't see selected.
    setSel(prev => { const n = { ...prev }; delete n.floor; return n })
  }

  const crumbs = [
    sel.kind && KIND_ZH[sel.kind],
    zone?.name,
    sel.tradeLabel,
    sel.floor,
    sel.location,
  ].filter(Boolean).join(' › ')

  // ── rows per page ───────────────────────────────────────────
  const kindsPresent = useMemo(() => {
    const ks: ZoneKind[] = []
    if (zones.some(z => (z.kind ?? 'building') === 'building')) ks.push('building')
    if (zones.some(z => z.kind === 'external')) ks.push('external')
    return ks
  }, [zones])

  const zonesOfKind = useMemo(
    () => zones.filter(z => (z.kind ?? 'building') === sel.kind),
    [zones, sel.kind],
  )

  const zoneLeaves = useMemo(
    () => guidedLeaves(items, sel.zoneId ? { zoneIds: [sel.zoneId] } : {}),
    [items, sel.zoneId],
  )

  const tradeRows = useMemo(() => {
    if (page !== 'trade') return []
    const dictLabels = byKind('trade').map(d => d.label)
    return unionOrdered(dictLabels, distinctValues(zoneLeaves, 'trade_label'))
  }, [page, byKind, zoneLeaves])

  const floorRows = useMemo(() => {
    if (page !== 'floor' || !zone) return []
    if (zone.floors && zone.floors.length > 0) return zone.floors
    const s = new Set<string>()
    for (const l of guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel })) {
      for (const f of l.floor_labels ?? []) s.add(f)
    }
    return [...s]
  }, [page, zone, zoneLeaves, sel.tradeLabel])

  const locationRows = useMemo(() => {
    if (page !== 'location') return []
    const dictLabels = byKind('location').map(d => d.label)
    const data = distinctValues(guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel }), 'location')
    return unionOrdered(dictLabels, data)
  }, [page, byKind, zoneLeaves, sel.tradeLabel])

  const processLeaves = useMemo(() => {
    if (page !== 'process') return []
    return guidedLeaves(zoneLeaves, {
      tradeLabel: sel.tradeLabel,
      location: isExternal ? undefined : sel.location,
    })
  }, [page, zoneLeaves, sel.tradeLabel, sel.location, isExternal])

  // ── dictionary add inputs (工種 / 位置 pages, update mode) ──
  const [newLabel, setNewLabel] = useState('')
  async function onAddDict(kind: 'trade' | 'location') {
    const r = await addDict(kind, newLabel)
    if (r.error) setErr(r.error)
    else setNewLabel('')
  }

  const dictIdOf = (kind: 'trade' | 'location', label: string) =>
    byKind(kind).find(d => d.label === label)?.id

  // ── render ──────────────────────────────────────────────────
  const titleByPage: Record<Page, string> = {
    kind: '揀範圍', zone: '揀分區', trade: '揀工種',
    floor: '揀樓層', location: '揀位置', process: mode === 'view' ? '工序進度' : '更新工序',
  }

  if (showMap) {
    return (
      <SiteMapView
        project={project}
        items={items}
        canEdit={canEdit}
        onBack={() => setShowMap(false)}
        onPickZone={z => {
          setSel({ kind: z.kind ?? 'building', zoneId: z.kind === 'external' ? undefined : z.id })
          setShowMap(false)
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* mode switch + map */}
      <div className="flex gap-2">
        <div className="flex-1 grid grid-cols-2 bg-site-100 rounded-xl p-1">
          <button
            onClick={() => switchMode('view')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold ${mode === 'view' ? 'bg-white shadow-card text-site-900' : 'text-site-500'}`}
          >
            <Eye size={15} /> 只看進度
          </button>
          <button
            onClick={() => switchMode('update')}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold ${mode === 'update' ? 'bg-white shadow-card text-safety-700' : 'text-site-500'}`}
          >
            <Edit3 size={15} /> 更新進度
          </button>
        </div>
        <button onClick={() => setShowMap(true)} className="flex-shrink-0 w-11 grid place-items-center bg-white border border-site-200 rounded-xl text-site-600 hover:text-safety-600" aria-label="地盤地圖">
          <MapIcon size={18} />
        </button>
      </div>

      {/* back + breadcrumb */}
      <div className="flex items-center gap-2 min-h-[36px]">
        {page !== 'kind' && (
          <button onClick={back} className="flex-shrink-0 flex items-center gap-1 text-sm font-semibold text-site-600 bg-white border border-site-200 rounded-lg px-3 py-1.5 hover:bg-site-50 min-h-0">
            <ArrowLeft size={15} /> 返上一頁
          </button>
        )}
        <span className="text-xs text-site-400 truncate">{crumbs}</span>
      </div>

      <h3 className="text-sm font-bold text-site-700">{titleByPage[page]}</h3>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</div>}

      {/* ── kind page ── */}
      {page === 'kind' && (
        <div className="space-y-2">
          {kindsPresent.map(k => {
            const ids = zones.filter(z => (z.kind ?? 'building') === k).map(z => z.id)
            const p = guidedPct(items, { zoneIds: ids })
            return <PctRow key={k} label={KIND_ZH[k]} sub={`${ids.length} 個分區`} pct={p.pct} onClick={() => setSel({ kind: k })} />
          })}
          {kindsPresent.length === 0 && <p className="text-sm text-site-400 text-center py-6">未設定分區</p>}
        </div>
      )}

      {/* ── zone page ── */}
      {page === 'zone' && (
        <div className="space-y-2">
          {zonesOfKind.map(z => {
            const p = guidedPct(items, { zoneIds: [z.id] })
            return <PctRow key={z.id} label={z.name} sub={z.kind === 'external' ? undefined : `${(z.floors ?? []).length} 層`} pct={p.pct} onClick={() => setSel({ ...sel, zoneId: z.id })} />
          })}
        </div>
      )}

      {/* ── trade page ── */}
      {page === 'trade' && (
        <div className="space-y-2">
          {tradeRows.map(t => {
            const p = guidedPct(zoneLeaves, { tradeLabel: t })
            const dictId = dictIdOf('trade', t)
            return (
              <PctRow
                key={t} label={t} pct={p.pct}
                onClick={() => setSel({ ...sel, tradeLabel: t })}
                onDelete={mode === 'update' && canEdit && dictId ? async () => { const r = await removeDict(dictId); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {mode === 'update' && canEdit && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增工種（例：消防）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddDict('trade')} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
        </div>
      )}

      {/* ── floor page (view, building) ── */}
      {page === 'floor' && (
        <div className="grid grid-cols-2 gap-2">
          {floorRows.map(f => {
            const p = guidedPctOf(guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel }), f)
            return <PctRow key={f} label={f} pct={p.pct} onClick={() => setSel({ ...sel, floor: f })} />
          })}
          {floorRows.length === 0 && <p className="text-sm text-site-400 text-center py-6 col-span-2">未有樓層資料</p>}
        </div>
      )}

      {/* ── location page ── */}
      {page === 'location' && (
        <div className="space-y-2">
          {locationRows.map(loc => {
            const leaves = guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel, location: loc })
            const p = guidedPctOf(leaves, mode === 'view' ? sel.floor : undefined)
            const dictId = dictIdOf('location', loc)
            return (
              <PctRow
                key={loc} label={loc} pct={p.pct}
                onClick={() => setSel({ ...sel, location: loc })}
                onDelete={mode === 'update' && canEdit && dictId ? async () => { const r = await removeDict(dictId); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {mode === 'update' && canEdit && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增位置（例：走廊）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddDict('location')} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
          {locationRows.length === 0 && mode === 'view' && <p className="text-sm text-site-400 text-center py-6">未有位置資料</p>}
        </div>
      )}

      {/* ── process page ── */}
      {page === 'process' && (
        <div className="space-y-2">
          {processLeaves.map(l => {
            const p = guidedPctOf([l], mode === 'view' ? sel.floor : undefined)
            const done = (l.floors_completed ?? []).length
            const total = (l.floor_labels ?? []).length
            return (
              <PctRow
                key={l.id}
                label={l.title}
                sub={mode === 'view' && sel.floor ? undefined : `${done}/${total} ${isExternal ? '個位置' : '層'}`}
                pct={p.pct}
                onClick={mode === 'update' && canUpdateItem(l) ? () => setTicking(l) : undefined}
              />
            )
          })}
          {processLeaves.length === 0 && <p className="text-sm text-site-400 text-center py-6">未有工序</p>}
          {mode === 'update' && canEdit && (
            <button onClick={() => setAddingProcess(true)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2.5 rounded-xl">
              <Plus size={16} /> 新增工序
            </button>
          )}
        </div>
      )}

      {ticking && (
        <TickSheet
          leaf={ticking}
          unitZh={isExternal ? '位置' : '樓層'}
          canDelete={canEdit}
          onClose={() => setTicking(null)}
          onSave={async picked => {
            const r = await updateFloors(ticking.id, picked, '')
            if (r.error) { setErr(r.error); return false }
            setTicking(null)
            return true
          }}
          onDelete={async () => {
            const r = await deleteItem(ticking.id)
            if (r.error) setErr(r.error)
            setTicking(null)
          }}
        />
      )}

      {addingProcess && zone && sel.tradeLabel && (
        <AddProcessSheet
          project={project}
          zone={zone}
          tradeLabel={sel.tradeLabel}
          location={isExternal ? null : (sel.location ?? null)}
          processDict={byKind('process').map(d => d.label)}
          locationDict={byKind('location').map(d => d.label)}
          onAddDict={addDict}
          onClose={() => setAddingProcess(false)}
          onCreate={async (title, labels) => {
            const { data: code, error: codeErr } = await supabase.rpc('next_progress_code', {
              p_project_id: project.id, p_zone_id: zone.id, p_parent_id: null,
            })
            if (codeErr) return codeErr.message
            const r = await addItem({
              parent_id: null,
              code: (code as string) ?? '',
              title,
              zone_id: zone.id,
              tracking_mode: 'floors',
              floor_labels: labels,
              trade_label: sel.tradeLabel,
              location: isExternal ? null : (sel.location ?? null),
            })
            return r.error
          }}
        />
      )}
    </div>
  )
}

// ── 剔格 sheet: tick completed 樓層 (or 位置 for 外圍) ─────────
function TickSheet({ leaf, unitZh, canDelete, onClose, onSave, onDelete }: {
  leaf: ProgressItem
  unitZh: string
  canDelete: boolean
  onClose: () => void
  onSave: (picked: string[]) => Promise<boolean>
  onDelete: () => Promise<void>
}) {
  const labels = leaf.floor_labels ?? []
  const [picked, setPicked] = useState<string[]>(leaf.floors_completed ?? [])
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  function toggle(f: string) {
    setPicked(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title={leaf.title}
      footer={
        <button
          onClick={async () => { setBusy(true); const ok = await onSave(picked); if (!ok) setBusy(false) }}
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? <Spinner size={18} className="text-white" /> : `儲存（${picked.length}/${labels.length} 完成）`}
        </button>
      }
    >
      <p className="text-xs text-site-400 mb-3">剔咗 = 該{unitZh}呢個工序做完（100%）</p>
      <div className="grid grid-cols-3 gap-2">
        {labels.map(f => {
          const on = picked.includes(f)
          return (
            <button
              key={f}
              onClick={() => toggle(f)}
              className={`flex items-center justify-center gap-1 py-2.5 rounded-xl border-2 text-sm font-semibold ${on ? 'border-green-500 bg-green-50 text-green-700' : 'border-site-200 text-site-500'}`}
            >
              {on && <Check size={13} />} {f}
            </button>
          )
        })}
      </div>
      {canDelete && (
        <div className="mt-4 pt-3 border-t border-site-100 flex items-center justify-between">
          {confirmDel ? (
            <>
              <span className="text-xs text-red-600 font-semibold">確認刪除呢個工序？</span>
              <div className="flex gap-2">
                <button onClick={() => void onDelete()} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg">刪除</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-site-500 px-2">取消</button>
              </div>
            </>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="text-xs text-site-400 hover:text-red-600 flex items-center gap-1 min-h-0">
              <Trash2 size={13} /> 刪除工序
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── 新增工序 sheet ───────────────────────────────────────────
function AddProcessSheet({ project: _project, zone, tradeLabel, location, processDict, locationDict, onAddDict, onClose, onCreate }: {
  project: Project
  zone: Zone
  tradeLabel: string
  location: string | null
  processDict: string[]
  locationDict: string[]
  onAddDict: (kind: 'process' | 'location', label: string) => Promise<{ error: string | null }>
  onClose: () => void
  onCreate: (title: string, labels: string[]) => Promise<string | null>
}) {
  const isExternal = zone.kind === 'external'
  const [title, setTitle] = useState('')
  // building: labels = the zone's immutable floors. external: user picks which
  // 位置 this process covers (they become the tick list).
  const [extLabels, setExtLabels] = useState<string[]>(locationDict)
  const [newLoc, setNewLoc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const labels = isExternal ? extLabels : (zone.floors ?? [])

  async function submit() {
    setError('')
    const clean = title.trim()
    if (!clean) return setError('請輸入工序名稱')
    if (labels.length === 0) return setError(isExternal ? '請至少揀一個位置' : '呢個分區未設定樓層')
    setBusy(true)
    // remember the 工序 name in the dictionary for next time (best-effort)
    if (!processDict.includes(clean)) await onAddDict('process', clean)
    const err = await onCreate(clean, labels)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title="新增工序"
      footer={
        <button onClick={() => void submit()} disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={18} className="text-white" /> : '加入工序'}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-site-400">
          {zone.name} · {tradeLabel}{location ? ` · ${location}` : ''}
        </p>
        <div>
          <label className="label">工序名稱 *</label>
          <input className="input" list="guided-process-dict" placeholder="例：批盪 / 油漆" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <datalist id="guided-process-dict">
            {processDict.map(p => <option key={p} value={p} />)}
          </datalist>
          {processDict.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {processDict.map(p => (
                <button key={p} type="button" onClick={() => setTitle(p)} className="text-[11px] bg-site-100 text-site-600 px-2 py-1 rounded-full min-h-0">{p}</button>
              ))}
            </div>
          )}
        </div>

        {isExternal ? (
          <div>
            <label className="label">適用位置（剔格清單）*</label>
            <div className="grid grid-cols-2 gap-2">
              {extLabels.length === 0 && locationDict.length === 0 && (
                <p className="text-xs text-site-400 col-span-2">未有位置 — 喺下面加</p>
              )}
              {unionOrdered(locationDict, extLabels).map(loc => {
                const on = extLabels.includes(loc)
                return (
                  <button key={loc} type="button" onClick={() => setExtLabels(p => on ? p.filter(x => x !== loc) : [...p, loc])}
                    className={`py-2 rounded-xl border-2 text-sm font-semibold ${on ? 'border-safety-500 bg-safety-50 text-safety-700' : 'border-site-200 text-site-500'}`}>
                    {loc}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <input className="input flex-1" placeholder="新增位置（例：井1）" value={newLoc} onChange={e => setNewLoc(e.target.value)} />
              <button
                type="button"
                onClick={async () => {
                  const clean = newLoc.trim()
                  if (!clean) return
                  await onAddDict('location', clean)
                  setExtLabels(p => p.includes(clean) ? p : [...p, clean])
                  setNewLoc('')
                }}
                className="btn-ghost px-3 flex items-center gap-1"
              ><Plus size={14} /> 加</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-site-500 bg-site-50 border border-site-100 rounded-xl px-3 py-2">
            剔格清單 = {zone.name} 全部 {labels.length} 層（{labels[0]} … {labels[labels.length - 1]}）
          </p>
        )}

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
      </div>
    </Modal>
  )
}
