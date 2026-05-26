import { useMemo } from 'react'
import { Package, AlertTriangle } from 'lucide-react'
import {
  useMaterialsOptional,
  isMaterialLate,
  MATERIAL_STATUS_ZH,
  MATERIAL_STATUS_BADGE_CLASS,
} from '../../contexts/MaterialsContext'

export interface MaterialItemsPanelProps {
  itemId: string
  /** Optional title override; defaults to "相關物料". */
  title?: string
}

/**
 * Read-only panel listing materials whose item_ids contains `itemId`.
 *
 * Mounted inside ProgressItemCard by the orchestrator. Uses the OPTIONAL
 * hook so a missing <MaterialsProvider> is silently treated as "no data"
 * instead of throwing — keeps ProgressItemCard renderable in contexts
 * (e.g., dashboards) that don't wrap the materials provider.
 */
export function MaterialItemsPanel({ itemId, title = '相關物料' }: MaterialItemsPanelProps) {
  const ctx = useMaterialsOptional()
  const linked = useMemo(() => {
    if (!ctx) return []
    return ctx.materials.filter(m => (m.item_ids ?? []).includes(itemId))
  }, [ctx, itemId])

  // No provider → render nothing. We intentionally don't show an "unconfigured"
  // hint so consumers without materials wiring stay visually unchanged.
  if (!ctx) return null
  if (linked.length === 0) return null

  return (
    <div className="mt-2 border border-site-200 rounded-xl bg-white">
      <div className="px-3 py-2 border-b border-site-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-site-700 inline-flex items-center gap-1">
          <Package size={12} />
          {title}
        </p>
        <span className="text-[10px] text-site-500">{linked.length} 項</span>
      </div>
      <ul className="divide-y divide-site-100">
        {linked.map(m => {
          const late = isMaterialLate(m)
          return (
            <li key={m.id} className="px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-site-900 truncate">{m.name}</p>
                <p className="text-[11px] text-site-500">
                  <span className="font-mono">{m.qty_arrived}</span>
                  <span className="text-site-400"> / </span>
                  <span className="font-mono">{m.qty_needed}</span>
                  <span> {m.unit}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                  className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${MATERIAL_STATUS_BADGE_CLASS[m.status]}`}
                >
                  {MATERIAL_STATUS_ZH[m.status]}
                </span>
                {m.urgent && (
                  <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-600 text-white">
                    急件
                  </span>
                )}
                {late && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">
                    <AlertTriangle size={9} />
                    逾期
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default MaterialItemsPanel
