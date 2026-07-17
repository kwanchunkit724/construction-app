import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Map as MapIcon, Check, Users, History as HistoryIcon, PackagePlus, Settings2, Loader2 } from 'lucide-react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { SiteMapView } from './SiteMap'
import { AddZoneSheet, ZoneSettingsSheet } from './ZoneManage'
import { HistoryModal } from '../HistoryModal'
import { useAuth } from '../../contexts/AuthContext'
import { useProgress } from '../../contexts/ProgressContext'
import { useDicts, guidedLeaves, guidedPct, guidedPctOf, distinctValues, unionOrdered } from '../../lib/guided'
import { supabase } from '../../lib/supabase'
import type { ProgressTemplate, Project, ProgressItem, Zone, ZoneKind } from '../../types'

// Guided 進度表 (v112, v2 after user feedback) — ONE drill for everyone:
//   大樓/外圍 → 分區 → 工種 → 位置 → 工序
// (外圍 skips 位置 — its ticks ARE the 位置.) Every 工序 row wears a per-floor
// cell strip (the paper-sketch look: labels over boxes, filled = done) plus
// its %, so a read-only user sees floor-level truth without a separate
// "只看" mode. Tap a row (with update rights) → tick sheet.

interface Sel {
  kind?: ZoneKind
  zoneId?: string
  tradeLabel?: string
  location?: string
}

type Page = 'kind' | 'zone' | 'trade' | 'location' | 'process'

const KIND_ZH: Record<ZoneKind, string> = { building: '大樓', external: '外圍' }

// ui-ux-pro-max palette (industrial grey + safety orange): orange =
// in-progress (brand), emerald = done — matches the PDF report 1:1.
function pctColor(pct: number | null): string {
  if (pct === null) return 'text-site-300'
  if (pct >= 100) return 'text-emerald-600'
  if (pct > 0) return 'text-safety-600'
  return 'text-site-400'
}

// B2 → B2, G/F → G, 12/F → 12, R/F → R, R2/F → R2 — cell labels must fit 12px.
function abbrevFloor(label: string): string {
  return label.replace('/F', '') || label
}

function PctRow({ label, pct, sub, onClick, onDelete, onAssign, onSettings }: {
  label: string
  pct: number | null
  sub?: string
  onClick?: () => void
  onDelete?: () => void
  onAssign?: () => void
  onSettings?: () => void
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
      {onAssign && (
        <button onClick={onAssign} className="flex-shrink-0 w-10 h-10 grid place-items-center text-site-400 hover:text-blue-600" aria-label="指派分區">
          <Users size={16} />
        </button>
      )}
      {onSettings && (
        <button onClick={onSettings} className="flex-shrink-0 w-10 h-10 grid place-items-center text-site-400 hover:text-site-700" aria-label="分區設定">
          <Settings2 size={16} />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="flex-shrink-0 w-10 h-10 grid place-items-center text-site-300 hover:text-red-600" aria-label="刪除">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

// The sketch row: 工序 name · label-over-box strip · big %.
function ProcessRow({ leaf, onClick }: { leaf: ProgressItem; onClick?: () => void }) {
  const labels = leaf.floor_labels ?? []
  const done = new Set(leaf.floors_completed ?? [])
  // v113 半態: 進行中 floors show orange but NEVER count into %
  const working = new Set(leaf.floors_in_progress ?? [])
  const workingCount = labels.filter(f => !done.has(f) && working.has(f)).length
  const p = guidedPctOf([leaf])
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full bg-white border border-site-200 rounded-xl px-3.5 py-3 text-left hover:border-safety-300 active:bg-safety-50 disabled:active:bg-white"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-[15px] text-site-900 truncate">{leaf.title}</span>
        <span className={`flex-shrink-0 text-lg font-bold ${pctColor(p.pct)}`}>
          {p.pct === null ? '—' : `${p.pct}%`}
        </span>
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {labels.map(f => (
          <span
            key={f}
            className={`inline-flex items-center justify-center min-w-[19px] px-0.5 h-[17px] rounded-[4px] border text-[8px] font-bold leading-none ${done.has(f) ? 'bg-emerald-500 border-emerald-600 text-white' : working.has(f) ? 'bg-orange-400 border-orange-500 text-white' : 'bg-site-50 border-site-200 text-site-400'}`}
          >
            {abbrevFloor(f)}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-site-400 mt-1.5">
        {done.size}/{labels.length} 完成{workingCount > 0 ? ` · ${workingCount} 進行中` : ''}
      </p>
    </button>
  )
}

export function GuidedProgress({ project }: {
  project: Project
}) {
  const {
    items, canEdit, canUpdateItem, addItem, updateFloors, deleteItem,
    fetchTemplates, saveTemplate, deleteTemplate,
  } = useProgress()
  const { byKind, add: addDict, remove: removeDict } = useDicts(project.id)

  const [sel, setSel] = useState<Sel>({})
  const [showMap, setShowMap] = useState(false)
  const [ticking, setTicking] = useState<ProgressItem | null>(null)
  const [addingProcess, setAddingProcess] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [assigningZone, setAssigningZone] = useState<Zone | null>(null)
  const [settingsZone, setSettingsZone] = useState<Zone | null>(null)
  const [addZoneOpen, setAddZoneOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<ProgressItem | null>(null)
  const [err, setErr] = useState('')

  const { profile } = useAuth()
  // zone STRUCTURE edits (加減分區 / 改樓層) write the projects row — gate to
  // admin / assigned PM, matching that row's RLS.
  const canManageZones = !!profile && (
    profile.global_role === 'admin' || project.assigned_pm_ids.includes(profile.id)
  )

  const zones = project.zones
  const zone: Zone | undefined = sel.zoneId ? zones.find(z => z.id === sel.zoneId) : undefined
  const isExternal = zone?.kind === 'external'

  const page: Page = useMemo(() => {
    if (!sel.kind) return 'kind'
    if (!sel.zoneId) return 'zone'
    if (!sel.tradeLabel) return 'trade'
    if (isExternal) return 'process'
    if (!sel.location) return 'location'
    return 'process'
  }, [sel, isExternal])

  function back() {
    setErr('')
    setSel(prev => {
      const n = { ...prev }
      if (page === 'process') {
        if (isExternal) { delete n.tradeLabel; return n }
        delete n.location
        return n
      }
      if (page === 'location') { delete n.tradeLabel; return n }
      if (page === 'trade') { delete n.zoneId; return n }
      if (page === 'zone') { delete n.kind; return n }
      return n
    })
  }

  const crumbs = [
    sel.kind && KIND_ZH[sel.kind],
    zone?.name,
    sel.tradeLabel,
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
    return unionOrdered(byKind('trade').map(d => d.label), distinctValues(zoneLeaves, 'trade_label'))
  }, [page, byKind, zoneLeaves])

  const locationRows = useMemo(() => {
    if (page !== 'location') return []
    const data = distinctValues(guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel }), 'location')
    return unionOrdered(byKind('location').map(d => d.label), data)
  }, [page, byKind, zoneLeaves, sel.tradeLabel])

  const processLeaves = useMemo(() => {
    if (page !== 'process') return []
    return guidedLeaves(zoneLeaves, {
      tradeLabel: sel.tradeLabel,
      location: isExternal ? undefined : sel.location,
    })
  }, [page, zoneLeaves, sel.tradeLabel, sel.location, isExternal])

  // ── dictionary add inputs ───────────────────────────────────
  const [newLabel, setNewLabel] = useState('')
  async function onAddDict(kind: 'trade' | 'location') {
    const r = await addDict(kind, newLabel)
    if (r.error) setErr(r.error)
    else setNewLabel('')
  }

  const dictIdOf = (kind: 'trade' | 'location', label: string) =>
    byKind(kind).find(d => d.label === label)?.id

  // the zone's assignees = the union of its leaves' assigned_to. Leaves are
  // the single source of truth (RLS reads them) — no separate storage.
  const zoneAssignees = (z: Zone): string[] => {
    const s = new Set<string>()
    for (const l of guidedLeaves(items, { zoneIds: [z.id] })) {
      for (const u of l.assigned_to ?? []) s.add(u)
    }
    return [...s]
  }

  // create one guided leaf (shared by 新增工序 + 範本 apply). New leaves
  // inherit the zone's assignees so 分區指派 covers later-added 工序 too.
  async function createLeaf(title: string, labels: string[]): Promise<string | null> {
    if (!zone || !sel.tradeLabel) return '未揀工種'
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
      assigned_to: zoneAssignees(zone),
    })
    return r.error
  }

  const titleByPage: Record<Page, string> = {
    kind: '揀範圍', zone: '揀分區', trade: '揀工種', location: '揀位置', process: '工序',
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
      {/* back + breadcrumb + map */}
      <div className="flex items-center gap-2 min-h-[40px]">
        {page !== 'kind' && (
          <button onClick={back} className="flex-shrink-0 flex items-center gap-1 text-sm font-semibold text-site-600 bg-white border border-site-200 rounded-lg px-3 py-1.5 hover:bg-site-50 min-h-0">
            <ArrowLeft size={15} /> 返上一頁
          </button>
        )}
        <span className="text-xs text-site-400 truncate flex-1">{crumbs}</span>
        <button onClick={() => setShowMap(true)} className="flex-shrink-0 w-10 h-10 grid place-items-center bg-white border border-site-200 rounded-xl text-site-600 hover:text-safety-600" aria-label="地盤地圖">
          <MapIcon size={18} />
        </button>
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
            const nAssigned = zoneAssignees(z).length
            const subParts = [
              z.kind === 'external' ? null : `${(z.floors ?? []).length} 層`,
              nAssigned > 0 ? `已指派 ${nAssigned} 人` : null,
            ].filter(Boolean)
            return (
              <PctRow
                key={z.id}
                label={z.name}
                sub={subParts.join(' · ') || undefined}
                pct={p.pct}
                onClick={() => setSel({ ...sel, zoneId: z.id })}
                onAssign={canEdit ? () => setAssigningZone(z) : undefined}
                onSettings={canManageZones ? () => setSettingsZone(z) : undefined}
              />
            )
          })}
          {canManageZones && (
            <button onClick={() => setAddZoneOpen(true)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2.5 rounded-xl">
              <Plus size={16} /> 新增分區
            </button>
          )}
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
                onDelete={canEdit && dictId ? async () => { const r = await removeDict(dictId); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {canEdit && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增工種（例：消防）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddDict('trade')} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
        </div>
      )}

      {/* ── location page ── */}
      {page === 'location' && (
        <div className="space-y-2">
          {locationRows.map(loc => {
            const leaves = guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel, location: loc })
            const p = guidedPctOf(leaves)
            const dictId = dictIdOf('location', loc)
            return (
              <PctRow
                key={loc} label={loc} pct={p.pct}
                onClick={() => setSel({ ...sel, location: loc })}
                onDelete={canEdit && dictId ? async () => { const r = await removeDict(dictId); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {canEdit && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增位置（例：走廊）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddDict('location')} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
          {locationRows.length === 0 && !canEdit && <p className="text-sm text-site-400 text-center py-6">未有位置資料</p>}
        </div>
      )}

      {/* ── process page — sketch rows ── */}
      {page === 'process' && (
        <div className="space-y-2">
          {processLeaves.map(l => (
            <ProcessRow
              key={l.id}
              leaf={l}
              onClick={canUpdateItem(l) ? () => setTicking(l) : undefined}
            />
          ))}
          {processLeaves.length === 0 && <p className="text-sm text-site-400 text-center py-6">未有工序</p>}
          {canEdit && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAddingProcess(true)} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2.5 rounded-xl">
                <Plus size={16} /> 新增工序
              </button>
              <button onClick={() => setTemplatesOpen(true)} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-site-600 bg-white border border-site-200 hover:bg-site-50 py-2.5 rounded-xl">
                <PackagePlus size={16} /> 工序範本
              </button>
            </div>
          )}
        </div>
      )}

      {ticking && (
        <TickSheet
          leaf={ticking}
          unitZh={isExternal ? '位置' : '樓層'}
          canDelete={canEdit}
          onClose={() => setTicking(null)}
          onSave={async (picked, working) => {
            const r = await updateFloors(ticking.id, picked, '', working)
            if (r.error) { setErr(r.error); return false }
            setTicking(null)
            return true
          }}
          onDelete={async () => {
            const r = await deleteItem(ticking.id)
            if (r.error) setErr(r.error)
            setTicking(null)
          }}
          onHistory={() => { setHistoryItem(ticking); setTicking(null) }}
        />
      )}

      {addingProcess && zone && sel.tradeLabel && (
        <AddProcessSheet
          zone={zone}
          tradeLabel={sel.tradeLabel}
          location={isExternal ? null : (sel.location ?? null)}
          processDict={byKind('process').map(d => d.label)}
          locationDict={byKind('location').map(d => d.label)}
          onAddDict={addDict}
          onClose={() => setAddingProcess(false)}
          onCreate={createLeaf}
        />
      )}

      {templatesOpen && zone && sel.tradeLabel && (
        <GuidedTemplateSheet
          contextLabel={`${zone.name} · ${sel.tradeLabel}${sel.location ? ` · ${sel.location}` : ''}`}
          defaultLabels={isExternal ? byKind('location').map(d => d.label) : (zone.floors ?? [])}
          currentTitles={processLeaves.map(l => l.title)}
          fetchTemplates={fetchTemplates}
          saveTemplate={saveTemplate}
          deleteTemplate={deleteTemplate}
          canEdit={canEdit}
          onClose={() => setTemplatesOpen(false)}
          onApply={async (tpl, labels) => {
            let added = 0
            for (const it of tpl.items) {
              if (processLeaves.some(l => l.title === it.title)) continue
              const e = await createLeaf(it.title, labels)
              if (e) return { error: `${it.title}：${e}（已加入 ${added} 項）`, added }
              added++
            }
            return { error: null, added }
          }}
        />
      )}

      {assigningZone && (
        <ZoneAssignSheet
          projectId={project.id}
          zone={assigningZone}
          leaves={guidedLeaves(items, { zoneIds: [assigningZone.id] })}
          onClose={() => setAssigningZone(null)}
        />
      )}
      {settingsZone && (
        <ZoneSettingsSheet
          project={project}
          zone={settingsZone}
          leaves={guidedLeaves(items, { zoneIds: [settingsZone.id] })}
          onClose={() => setSettingsZone(null)}
        />
      )}
      {addZoneOpen && (
        <AddZoneSheet project={project} onClose={() => setAddZoneOpen(false)} />
      )}
      <HistoryModal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        item={historyItem}
      />
    </div>
  )
}

// ── 剔格 sheet ───────────────────────────────────────────────
function TickSheet({ leaf, unitZh, canDelete, onClose, onSave, onDelete, onHistory }: {
  leaf: ProgressItem
  unitZh: string
  canDelete: boolean
  onClose: () => void
  onSave: (picked: string[], working: string[]) => Promise<boolean>
  onDelete: () => Promise<void>
  onHistory: () => void
}) {
  const labels = leaf.floor_labels ?? []
  const origPicked = leaf.floors_completed ?? []
  const origWorking = (leaf.floors_in_progress ?? []).filter(f => !origPicked.includes(f))
  const [picked, setPicked] = useState<string[]>(origPicked)
  // v113 半態: 進行中 — display-only, not counted into %
  const [working, setWorking] = useState<string[]>(origWorking)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  // 綠格兩步清除: first tap arms the cell (red), second tap within 2.5s clears
  const [armClear, setArmClear] = useState<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // unsaved-changes guard: closing with edits asks first
  const [confirmLeave, setConfirmLeave] = useState(false)
  const dirty =
    JSON.stringify([...picked].sort()) !== JSON.stringify([...origPicked].sort())
    || JSON.stringify([...working].sort()) !== JSON.stringify([...origWorking].sort())

  function armClearCell(f: string) {
    if (armTimer.current) clearTimeout(armTimer.current)
    setArmClear(f)
    armTimer.current = setTimeout(() => setArmClear(null), 2500)
  }

  // tap cycles the site's natural progression: 未做 → 進行中 → 完成 → 未做
  // (完成 → 未做 needs a second tap on the armed red cell — 誤撳唔會即刻清零)
  function toggle(f: string) {
    if (picked.includes(f)) {
      if (armClear === f) {
        setPicked(p => p.filter(x => x !== f))
        setArmClear(null)
        if (armTimer.current) clearTimeout(armTimer.current)
      } else {
        armClearCell(f)
      }
      return
    }
    if (armClear) { setArmClear(null); if (armTimer.current) clearTimeout(armTimer.current) }
    if (working.includes(f)) {
      setWorking(w => w.filter(x => x !== f))
      setPicked(p => [...p, f])
    } else {
      setWorking(w => [...w, f])
    }
  }

  function requestClose() {
    if (busy) return
    if (dirty && !confirmLeave) { setConfirmLeave(true); return }
    onClose()
  }

  return (
    <Modal
      open
      onClose={requestClose}
      title={leaf.title}
      footer={
        <button
          onClick={async () => { setBusy(true); const ok = await onSave(picked, working); if (!ok) setBusy(false) }}
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? <Spinner size={18} className="text-white" /> : `儲存（${picked.length}/${labels.length} 完成${working.length > 0 ? ` · ${working.length} 進行中` : ''}）`}
        </button>
      }
    >
      {confirmLeave && (
        <div className="mb-3 bg-amber-50 border border-amber-300 rounded-xl p-3">
          <p className="text-sm font-semibold text-amber-800">有未儲存嘅改動 — 離開就會唔見</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setConfirmLeave(false)} className="flex-1 text-sm font-semibold bg-white border border-site-200 rounded-lg py-2">繼續編輯</button>
            <button onClick={onClose} className="flex-1 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-lg py-2">唔儲存離開</button>
          </div>
        </div>
      )}
      <p className="text-sm text-site-500 mb-3">
        撳一下 = <span className="font-semibold text-orange-600">進行中</span>，再撳 = <span className="font-semibold text-emerald-600">完成</span> · 只有「完成」計入 %<br />
        <span className="text-xs text-site-400">清除完成：撳綠格一下（轉紅）再撳一下確認</span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {labels.map(f => {
          const isDone = picked.includes(f)
          const isArmed = isDone && armClear === f
          const isWorking = !isDone && working.includes(f)
          return (
            <button
              key={f}
              onClick={() => toggle(f)}
              className={`flex items-center justify-center gap-1 py-2.5 rounded-xl border-2 text-sm font-semibold ${isArmed ? 'border-red-500 bg-red-50 text-red-600' : isDone ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : isWorking ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-site-200 text-site-500'}`}
            >
              {isArmed ? <Trash2 size={13} /> : isDone ? <Check size={13} /> : isWorking ? <Loader2 size={13} /> : null} {isArmed ? '再撳清除' : f}
            </button>
          )
        })}
      </div>

      {/* 歷史 + 刪除 same mid-sheet row — 刪除 deliberately moved AWAY from the
          footer 儲存 button (thumb-zone adjacency caused near-misses on site) */}
      <div className="mt-4 flex gap-2">
        <button onClick={onHistory} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-site-600 bg-white border border-site-200 hover:bg-site-50 py-2.5 rounded-xl min-h-0">
          <HistoryIcon size={15} /> 更新歷史
        </button>
        {canDelete && !confirmDel && (
          <button onClick={() => setConfirmDel(true)} className="px-3.5 flex items-center justify-center gap-1 text-sm text-site-400 hover:text-red-600 bg-white border border-site-200 rounded-xl min-h-0">
            <Trash2 size={14} /> 刪除
          </button>
        )}
      </div>
      {canDelete && confirmDel && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs text-red-600 font-semibold">確認刪除呢個工序？成排剔會一齊唔見。</span>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => void onDelete()} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg">刪除</button>
            <button onClick={() => setConfirmDel(false)} className="text-xs text-site-500 px-2">取消</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── 新增工序 sheet ───────────────────────────────────────────
function AddProcessSheet({ zone, tradeLabel, location, processDict, locationDict, onAddDict, onClose, onCreate }: {
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
  const [extLabels, setExtLabels] = useState<string[]>(locationDict)
  // building zones: all floors ON by default; tap to EXCLUDE the ones this
  // 工序 doesn't cover (e.g. 批盪 skips the 水泵房 floor).
  const [floorsSel, setFloorsSel] = useState<string[]>(zone.floors ?? [])
  const [newLoc, setNewLoc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const zoneFloors = zone.floors ?? []
  const labels = isExternal ? extLabels : zoneFloors.filter(f => floorsSel.includes(f))

  async function submit() {
    setError('')
    const clean = title.trim()
    if (!clean) return setError('請輸入工序名稱')
    if (labels.length === 0) return setError(isExternal ? '請至少揀一個位置' : '呢個分區未設定樓層')
    setBusy(true)
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
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">適用樓層（撳走唔包括嘅）*</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFloorsSel(zoneFloors)} className="text-[11px] text-safety-600 font-semibold min-h-0">全選</button>
                <button type="button" onClick={() => setFloorsSel([])} className="text-[11px] text-site-400 font-semibold min-h-0">清空</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {zoneFloors.map(f => {
                const on = floorsSel.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFloorsSel(p => on ? p.filter(x => x !== f) : [...p, f])}
                    className={`py-1.5 rounded-lg border-2 text-xs font-semibold min-h-0 ${on ? 'border-safety-400 bg-safety-50 text-safety-700' : 'border-site-200 bg-site-50 text-site-300 line-through'}`}
                  >
                    {f}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-site-400 mt-1.5">剔格清單 = {labels.length}/{zoneFloors.length} 層</p>
          </div>
        )}

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
      </div>
    </Modal>
  )
}

// ── 工序範本 sheet (guided) — apply stamps leaves at the CURRENT
//    分區×工種×位置; 存範本 captures this page's 工序 names. ──
function GuidedTemplateSheet({ contextLabel, defaultLabels, currentTitles, fetchTemplates, saveTemplate, deleteTemplate, canEdit, onClose, onApply }: {
  contextLabel: string
  defaultLabels: string[]
  currentTitles: string[]
  fetchTemplates: () => Promise<ProgressTemplate[]>
  saveTemplate: (name: string, items: { title: string }[]) => Promise<{ error: string | null }>
  deleteTemplate: (id: string) => Promise<{ error: string | null }>
  canEdit: boolean
  onClose: () => void
  onApply: (tpl: ProgressTemplate, labels: string[]) => Promise<{ error: string | null; added: number }>
}) {
  const [templates, setTemplates] = useState<ProgressTemplate[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchTemplates().then(t => { if (alive) setTemplates(t) })
    return () => { alive = false }
  }, [fetchTemplates])

  return (
    <Modal open onClose={() => { if (!busyId) onClose() }} title="工序範本">
      <div className="space-y-4">
        <p className="text-xs text-site-400">套用到：{contextLabel}</p>

        {templates === null ? (
          <div className="py-6 flex justify-center"><Spinner size={22} /></div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-site-400 text-center py-4">未有範本 — 喺下面將呢頁工序存做範本</p>
        ) : (
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-site-50 border border-site-100 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-site-900 truncate">{t.name}</p>
                  <p className="text-[11px] text-site-400 truncate">{t.items.map(i => i.title).join('、')}</p>
                </div>
                <button
                  disabled={!!busyId}
                  onClick={async () => {
                    setBusyId(t.id); setError(''); setMsg('')
                    const r = await onApply(t, defaultLabels)
                    setBusyId(null)
                    if (r.error) setError(r.error)
                    else setMsg(`已加入 ${r.added} 個工序`)
                  }}
                  className="flex-shrink-0 text-xs font-semibold bg-safety-500 hover:bg-safety-600 text-white rounded-lg px-3 py-1.5 min-h-0 disabled:opacity-50"
                >
                  {busyId === t.id ? <Spinner size={13} className="text-white" /> : '套用'}
                </button>
                {canEdit && (
                  <button
                    disabled={!!busyId}
                    onClick={async () => {
                      const r = await deleteTemplate(t.id)
                      if (r.error) setError(r.error)
                      else setTemplates(ts => (ts ?? []).filter(x => x.id !== t.id))
                    }}
                    className="flex-shrink-0 text-site-300 hover:text-red-600 p-1.5 min-h-0"
                    aria-label="刪除範本"
                  ><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && currentTitles.length > 0 && (
          <div className="pt-3 border-t border-site-100">
            <label className="label">將呢頁 {currentTitles.length} 個工序存做範本</label>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="範本名（例：垃圾房標準工序）" value={saveName} onChange={e => setSaveName(e.target.value)} />
              <button
                onClick={async () => {
                  setError(''); setMsg('')
                  const r = await saveTemplate(saveName.trim(), currentTitles.map(title => ({ title })))
                  if (r.error) setError(r.error)
                  else { setMsg('已儲存範本'); setSaveName(''); setTemplates(await fetchTemplates()) }
                }}
                disabled={!saveName.trim()}
                className="btn-ghost px-3 disabled:opacity-40"
              >存</button>
            </div>
          </div>
        )}

        {msg && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">✓ {msg}</div>}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}
      </div>
    </Modal>
  )
}

// ── 分區指派 sheet — ONE simple list: who works this zone. Saving REPLACES
//    assigned_to on every leaf in the zone (leaves are the truth RLS reads);
//    later-added 工序 inherit via createLeaf. ──
function ZoneAssignSheet({ projectId, zone, leaves, onClose }: {
  projectId: string
  zone: Zone
  leaves: ProgressItem[]
  onClose: () => void
}) {
  const { refetch } = useProgress()
  const [handlers, setHandlers] = useState<Array<{ user_id: string; name: string; role: string }> | null>(null)
  const [picked, setPicked] = useState<string[]>(() => {
    const s = new Set<string>()
    for (const l of leaves) for (const u of l.assigned_to ?? []) s.add(u)
    return [...s]
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('get_project_handlers', { p_project_id: projectId })
      .then(({ data }) => { if (alive) setHandlers((data ?? []) as Array<{ user_id: string; name: string; role: string }>) })
    return () => { alive = false }
  }, [projectId])

  function toggle(id: string) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function save() {
    setBusy(true); setError('')
    for (const leaf of leaves) {
      const { error: e } = await supabase.from('progress_items').update({
        assigned_to: picked,
        last_updated_at: new Date().toISOString(),
      }).eq('id', leaf.id)
      if (e) { setError(`${leaf.title}：${e.message}`); setBusy(false); return }
    }
    await refetch()
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      title={`指派分區 · ${zone.name}`}
      footer={
        <button onClick={() => void save()} disabled={busy || handlers === null || leaves.length === 0} className="btn-primary w-full">
          {busy ? <Spinner size={18} className="text-white" /> : `指派 ${picked.length} 人（覆蓋 ${leaves.length} 個工序）`}
        </button>
      }
    >
      <p className="text-xs text-site-400 mb-3">揀邊個負責 {zone.name} — 佢哋可以更新呢個分區入面所有工序。</p>
      {handlers === null ? (
        <div className="py-6 flex justify-center"><Spinner size={22} /></div>
      ) : handlers.length === 0 ? (
        <p className="text-sm text-site-400 text-center py-4">此工地未有已批准嘅成員 — 先喺「工地」批人入項目</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {handlers.map(h => {
            const on = picked.includes(h.user_id)
            return (
              <label key={h.user_id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer ${on ? 'border-safety-400 bg-safety-50' : 'border-site-200'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(h.user_id)} className="accent-safety-600 h-4 w-4" />
                <Users size={13} className="text-site-400" />
                <span className="text-sm font-medium text-site-800 flex-1 truncate">{h.name}</span>
                <span className="text-[10px] text-site-400">{h.role}</span>
              </label>
            )
          })}
        </div>
      )}
      {leaves.length === 0 && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3">呢個分區未有工序 — 先加工序再指派</p>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">{error}</div>}
    </Modal>
  )
}
