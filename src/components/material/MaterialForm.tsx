import { useEffect, useMemo, useState } from 'react'
import { Search, Check } from 'lucide-react'
import { Modal } from '../Modal'
import { Spinner } from '../Spinner'
import { supabase } from '../../lib/supabase'
import { useMaterials } from '../../contexts/MaterialsContext'
import { useProjects } from '../../contexts/ProjectsContext'
import type { Material } from '../../contexts/MaterialsContext'

interface ProgressItemLite {
  id: string
  code: string
  title: string
  zone_id: string | null
}

const UNIT_SUGGESTIONS = ['條', '包', '立方米', '卷', '塊', '支', '個', '套', '桶']

export interface MaterialFormProps {
  projectId: string
  mode: 'create' | 'edit'
  material?: Material
  onClose: () => void
  onSaved: () => void
}

// Convert a Postgres timestamptz string to the local-time value
// expected by <input type="datetime-local">.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Convert datetime-local value back to an ISO string for Postgres.
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function MaterialForm({
  projectId,
  mode,
  material,
  onClose,
  onSaved,
}: MaterialFormProps) {
  const { createMaterial, updateMaterial } = useMaterials()
  const { projects } = useProjects()
  const project = projects.find(p => p.id === projectId)
  const zoneNameById = useMemo(() => {
    const map: Record<string, string> = {}
    project?.zones.forEach(z => { map[z.id] = z.name })
    return map
  }, [project])

  const [name, setName] = useState(material?.name ?? '')
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [qtyNeeded, setQtyNeeded] = useState<string>(
    material ? String(material.qty_needed) : '',
  )
  const [plannedAt, setPlannedAt] = useState<string>(toLocalInput(material?.planned_arrival_at ?? null))
  const [notes, setNotes] = useState(material?.notes ?? '')
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
    material?.item_ids ?? [],
  )

  const [items, setItems] = useState<ProgressItemLite[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemSearch, setItemSearch] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch progress items via the visibility RPC so non-supervisor roles
  // (foreman, engineer, 判頭, worker, owner, safety_officer) only see items
  // assigned to them + ancestor chain — preventing the picker from leaking
  // the full project tree to restricted roles. (persona-sim 2026-05-26)
  useEffect(() => {
    let cancelled = false
    setItemsLoading(true)
    supabase
      .rpc('get_visible_progress_items', { p_project_id: projectId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('progress_items RPC error (MaterialForm):', error)
          setItems([])
        } else {
          const rows = ((data ?? []) as ProgressItemLite[]).slice().sort(
            (a, b) => a.code.localeCompare(b.code),
          )
          setItems(rows)
        }
        setItemsLoading(false)
      })
    return () => { cancelled = true }
  }, [projectId])

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      i => i.code.toLowerCase().includes(q) || i.title.toLowerCase().includes(q),
    )
  }, [items, itemSearch])

  const qtyNumber = Number(qtyNeeded)
  const validQty = qtyNeeded !== '' && Number.isFinite(qtyNumber) && qtyNumber > 0
  const canSubmit =
    name.trim().length > 0 && unit.trim().length > 0 && validQty && !submitting

  function toggleItem(id: string) {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create') {
        const { error: e } = await createMaterial({
          name,
          unit,
          qty_needed: qtyNumber,
          item_ids: selectedItemIds,
          planned_arrival_at: fromLocalInput(plannedAt),
          notes: notes,
        })
        if (e) { setError(e); return }
      } else if (material) {
        const { error: e } = await updateMaterial(material.id, {
          name,
          unit,
          qty_needed: qtyNumber,
          item_ids: selectedItemIds,
          planned_arrival_at: fromLocalInput(plannedAt),
          notes: notes,
        })
        if (e) { setError(e); return }
      }
      onSaved()
    } catch (e: any) {
      console.error('MaterialForm submit error:', e)
      setError(e?.message ?? '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? '新增物料' : '編輯物料'}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-ghost flex-1"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Spinner size={16} className="text-white" />}
            <span>{mode === 'create' ? '提交' : '儲存'}</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">物料名</label>
          <input
            type="text"
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：M16 螺栓"
            maxLength={120}
          />
        </div>

        <div>
          <label className="label">單位</label>
          <input
            type="text"
            className="input"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder="例：條 / 包 / 立方米"
            maxLength={20}
            list="material-unit-suggestions"
          />
          <datalist id="material-unit-suggestions">
            {UNIT_SUGGESTIONS.map(u => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="label">需要數量</label>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className="input"
            value={qtyNeeded}
            onChange={e => setQtyNeeded(e.target.value)}
            placeholder="0"
          />
          {qtyNeeded !== '' && !validQty && (
            <p className="text-[11px] text-red-600 mt-1">需要數量需大於 0</p>
          )}
        </div>

        <div>
          <label className="label">預計到貨時間 (選填)</label>
          <input
            type="datetime-local"
            className="input"
            value={plannedAt}
            onChange={e => setPlannedAt(e.target.value)}
          />
        </div>

        <div className="card p-3">
          <p className="label mb-2">
            用於進度項目 ({selectedItemIds.length})
          </p>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-site-400" />
            <input
              type="text"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="搜尋編號或名稱…"
              className="input pl-9 text-sm"
            />
          </div>
          {itemsLoading ? (
            <div className="py-4 flex justify-center">
              <Spinner size={20} />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="text-xs text-site-500 py-2 text-center">
              {items.length === 0 ? '此項目尚未有進度項目' : '沒有符合的項目'}
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredItems.map(i => {
                const picked = selectedItemIds.includes(i.id)
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => toggleItem(i.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-sm ${
                      picked
                        ? 'bg-safety-100 text-safety-700 font-semibold'
                        : 'text-site-700 hover:bg-site-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-[11px] text-site-500 mr-1">
                        {i.code}
                      </span>
                      {i.zone_id && zoneNameById[i.zone_id] && (
                        <span className="text-[10px] font-semibold bg-site-100 text-site-600 px-1.5 py-0.5 rounded-full mr-1">
                          {zoneNameById[i.zone_id]}
                        </span>
                      )}
                      {i.title}
                    </span>
                    {picked && <Check size={14} className="flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <label className="label">備註 (選填)</label>
          <textarea
            className="input min-h-[80px]"
            rows={3}
            value={notes ?? ''}
            onChange={e => setNotes(e.target.value)}
            placeholder="例：須附原廠出廠證明"
            maxLength={1000}
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 border border-red-200 rounded-xl px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default MaterialForm
