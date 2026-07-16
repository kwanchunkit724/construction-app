import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Check, Flag } from 'lucide-react'
import { Spinner } from '../Spinner'
import { supabase } from '../../lib/supabase'
import { useProjects } from '../../contexts/ProjectsContext'
import { guidedPct } from '../../lib/guided'
import type { Project, ProgressItem, SiteMap as SiteMapT, SiteMapMarker, Zone } from '../../types'

// 2.5D 地盤地圖 (v112, v2 after user feedback). Fixed isometric projection —
// no rotation. Setup lets the user pick the GRID SIZE, place zones, and drop
// site markers (閘口 / 人閘 / 吊機…). Everything unplaced renders as 外圍
// ground. Buildings extrude by floor count and wear their live %; tap
// navigates into that zone's guided 進度表.

const TILE_W = 64
const TILE_H = 32
const MARKER_PRESETS = ['閘口', '人閘', '吊機', '貨梯', '斜路', '辦公室']

function iso(x: number, y: number, cols: number) {
  return {
    px: (cols - 1) * (TILE_W / 2) + (x - y) * (TILE_W / 2) + TILE_W / 2,
    py: (x + y) * (TILE_H / 2),
  }
}

function diamond(cx: number, cy: number): string {
  return `M ${cx} ${cy} L ${cx + TILE_W / 2} ${cy + TILE_H / 2} L ${cx} ${cy + TILE_H} L ${cx - TILE_W / 2} ${cy + TILE_H / 2} Z`
}

export function SiteMapView({ project, items, canEdit, onBack, onPickZone }: {
  project: Project
  items: ProgressItem[]
  canEdit: boolean
  onBack: () => void
  onPickZone: (zone: Zone) => void
}) {
  const [editing, setEditing] = useState(!project.site_map)
  const map = project.site_map ?? null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="flex-shrink-0 flex items-center gap-1 text-sm font-semibold text-site-600 bg-white border border-site-200 rounded-lg px-3 py-1.5 hover:bg-site-50 min-h-0">
          <ArrowLeft size={15} /> 返回進度
        </button>
        <h3 className="text-sm font-bold text-site-700 flex-1">地盤地圖</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-semibold text-site-500 hover:text-safety-600 min-h-0">
            <Pencil size={13} /> 重新擺位
          </button>
        )}
      </div>

      {editing ? (
        canEdit
          ? <MapSetup project={project} onDone={() => setEditing(false)} />
          : <p className="text-sm text-site-400 text-center py-8">未設定地圖 — 請等管理人員擺位</p>
      ) : map ? (
        <IsoMap project={project} map={map} items={items} onPickZone={onPickZone} />
      ) : (
        <p className="text-sm text-site-400 text-center py-8">未設定地圖</p>
      )}
    </div>
  )
}

// ── 擺位 setup: grid size + 分區 + 標示 ──────────────────────
function MapSetup({ project, onDone }: { project: Project; onDone: () => void }) {
  const { refetch } = useProjects()
  const init = project.site_map
  const [cols, setCols] = useState(init?.cols ?? 7)
  const [rows, setRows] = useState(init?.rows ?? 7)
  const [cells, setCells] = useState<{ zone_id: string; x: number; y: number }[]>(init?.cells ?? [])
  const [markers, setMarkers] = useState<SiteMapMarker[]>(init?.markers ?? [])
  const [mode, setMode] = useState<'zones' | 'markers'>('zones')
  const [picked, setPicked] = useState<string | null>(null)
  const [markerLabel, setMarkerLabel] = useState<string>(MARKER_PRESETS[0])
  const [customMarker, setCustomMarker] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const placeable = project.zones.filter(z => (z.kind ?? 'building') === 'building')
  const placedIds = new Set(cells.map(c => c.zone_id))

  function clampInto(nCols: number, nRows: number) {
    setCells(cs => cs.filter(c => c.x < nCols && c.y < nRows))
    setMarkers(ms => ms.filter(m => m.x < nCols && m.y < nRows))
  }

  function setSize(kind: 'cols' | 'rows', v: number) {
    const n = Math.max(3, Math.min(12, v || 3))
    if (kind === 'cols') { setCols(n); clampInto(n, rows) }
    else { setRows(n); clampInto(cols, n) }
  }

  function tapCell(x: number, y: number) {
    const zoneCell = cells.find(c => c.x === x && c.y === y)
    const marker = markers.find(m => m.x === x && m.y === y)
    if (mode === 'zones') {
      if (zoneCell) { setCells(cs => cs.filter(c => c !== zoneCell)); return }
      if (!picked || marker) return
      setCells(cs => [...cs.filter(c => c.zone_id !== picked), { zone_id: picked, x, y }])
      setPicked(null)
    } else {
      if (marker) { setMarkers(ms => ms.filter(m => m !== marker)); return }
      if (zoneCell) return
      const label = (customMarker.trim() || markerLabel).slice(0, 4)
      if (!label) return
      setMarkers(ms => [...ms, { label, x, y }])
    }
  }

  async function save() {
    setBusy(true); setError('')
    const site_map: SiteMapT = { cols, rows, cells, markers }
    const { error: e } = await supabase.from('projects').update({ site_map }).eq('id', project.id)
    if (e) { setError(e.message); setBusy(false); return }
    await refetch()
    setBusy(false)
    onDone()
  }

  return (
    <div className="space-y-3">
      {/* grid size */}
      <div className="flex items-center gap-3 bg-white border border-site-200 rounded-xl px-3 py-2.5">
        <span className="text-xs font-semibold text-site-600 flex-shrink-0">地圖大小</span>
        <label className="flex items-center gap-1.5 text-xs text-site-500">
          闊
          <input type="number" min={3} max={12} value={cols} onChange={e => setSize('cols', parseInt(e.target.value))} className="input w-16 text-center min-h-0 py-1.5" />
        </label>
        <span className="text-site-300">×</span>
        <label className="flex items-center gap-1.5 text-xs text-site-500">
          深
          <input type="number" min={3} max={12} value={rows} onChange={e => setSize('rows', parseInt(e.target.value))} className="input w-16 text-center min-h-0 py-1.5" />
        </label>
      </div>

      {/* mode switch */}
      <div className="grid grid-cols-2 bg-site-100 rounded-xl p-1">
        <button onClick={() => setMode('zones')} className={`py-2 rounded-lg text-sm font-semibold min-h-0 ${mode === 'zones' ? 'bg-white shadow-card text-site-900' : 'text-site-500'}`}>
          擺分區
        </button>
        <button onClick={() => setMode('markers')} className={`py-2 rounded-lg text-sm font-semibold min-h-0 ${mode === 'markers' ? 'bg-white shadow-card text-blue-700' : 'text-site-500'}`}>
          <Flag size={13} className="inline mr-1" />加標示
        </button>
      </div>

      {mode === 'zones' ? (
        <>
          <p className="text-xs text-site-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            ① 撳一個分區 ② 撳格仔擺低佢。再撳已擺嘅格仔可以移走。冇擺嘅位置全部當外圍。
          </p>
          <div className="flex flex-wrap gap-1.5">
            {placeable.map(z => {
              const placedCell = cells.find(c => c.zone_id === z.id)
              const on = picked === z.id
              return (
                <button
                  key={z.id}
                  onClick={() => setPicked(on ? null : z.id)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border-2 min-h-0 ${
                    on ? 'border-safety-500 bg-safety-50 text-safety-700'
                      : placedCell ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-site-200 text-site-600'}`}
                >
                  {z.name}{placedCell ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-site-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            揀一個標示，撳格仔擺低。再撳已有標示嘅格仔可以移走。
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MARKER_PRESETS.map(m => {
              const on = markerLabel === m && !customMarker.trim()
              return (
                <button key={m} onClick={() => { setMarkerLabel(m); setCustomMarker('') }}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border-2 min-h-0 ${on ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-site-200 text-site-600'}`}>
                  {m}
                </button>
              )
            })}
            <input
              className="input flex-1 min-w-[110px] min-h-0 py-1.5"
              placeholder="自訂（最多4字）"
              value={customMarker}
              maxLength={4}
              onChange={e => setCustomMarker(e.target.value)}
            />
          </div>
        </>
      )}

      {/* the grid */}
      <div className="grid gap-0.5 bg-site-200 border border-site-200 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const x = i % cols, y = Math.floor(i / cols)
          const cell = cells.find(c => c.x === x && c.y === y)
          const zone = cell ? project.zones.find(z => z.id === cell.zone_id) : null
          const marker = markers.find(m => m.x === x && m.y === y)
          return (
            <button
              key={i}
              onClick={() => tapCell(x, y)}
              className={`aspect-square text-[10px] font-semibold min-h-0 leading-tight ${
                zone ? 'bg-safety-500 text-white'
                  : marker ? 'bg-blue-500 text-white'
                  : 'bg-green-50 text-transparent hover:bg-green-100'}`}
            >
              {zone ? zone.name.slice(0, 2) : marker ? marker.label.slice(0, 2) : '·'}
            </button>
          )
        })}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

      <button onClick={() => void save()} disabled={busy || placedIds.size === 0} className="btn-primary w-full">
        {busy ? <Spinner size={18} className="text-white" /> : <><Check size={16} /> 儲存地圖（{placedIds.size}/{placeable.length} 座 · {markers.length} 個標示）</>}
      </button>
    </div>
  )
}

// ── 2.5D isometric render ───────────────────────────────────
function IsoMap({ project, map, items, onPickZone }: {
  project: Project
  map: SiteMapT
  items: ProgressItem[]
  onPickZone: (zone: Zone) => void
}) {
  const cols = map.cols

  const externals = project.zones.filter(z => z.kind === 'external')
  const extPct = guidedPct(items, { zoneIds: externals.map(z => z.id) })

  const drawCells = useMemo(
    () => [...map.cells].sort((a, b) => (a.x + a.y) - (b.x + b.y)),
    [map.cells],
  )

  const width = cols * TILE_W + TILE_W
  const height = (cols + map.rows) * (TILE_H / 2) + 150

  return (
    <div className="card p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 440 }}>
        <g transform={`translate(0, 105)`}>
          {/* ground */}
          {Array.from({ length: map.rows * cols }, (_, i) => {
            const x = i % cols, y = Math.floor(i / cols)
            const { px, py } = iso(x, y, cols)
            return <path key={`g-${i}`} d={diamond(px, py)} fill="#dcfce7" stroke="#bbf7d0" strokeWidth={1} />
          })}

          {/* markers — small pins on the ground */}
          {(map.markers ?? []).map((m, i) => {
            const { px, py } = iso(m.x, m.y, cols)
            const cy = py + TILE_H / 2
            return (
              <g key={`m-${i}`}>
                <line x1={px} y1={cy} x2={px} y2={cy - 14} stroke="#2563eb" strokeWidth={2} />
                <circle cx={px} cy={cy - 16} r={3.5} fill="#2563eb" />
                <text x={px} y={cy - 22} textAnchor="middle" fontSize={10} fontWeight={700}
                  fill="#1d4ed8" stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                  {m.label}
                </text>
              </g>
            )
          })}

          {/* buildings */}
          {drawCells.map(cell => {
            const zone = project.zones.find(z => z.id === cell.zone_id)
            if (!zone) return null
            const { px, py } = iso(cell.x, cell.y, cols)
            const floors = (zone.floors ?? []).length
            const elev = Math.min(28 + floors * 3, 90)
            const p = guidedPct(items, { zoneIds: [zone.id] })
            const topY = py - elev
            return (
              <g key={cell.zone_id} onClick={() => onPickZone(zone)} className="cursor-pointer">
                <path d={`M ${px - TILE_W / 2} ${topY + TILE_H / 2} L ${px} ${topY + TILE_H} L ${px} ${py + TILE_H} L ${px - TILE_W / 2} ${py + TILE_H / 2} Z`} fill="#94a3b8" />
                <path d={`M ${px + TILE_W / 2} ${topY + TILE_H / 2} L ${px} ${topY + TILE_H} L ${px} ${py + TILE_H} L ${px + TILE_W / 2} ${py + TILE_H / 2} Z`} fill="#64748b" />
                {Array.from({ length: Math.min(Math.floor(elev / 12), 6) }, (_, wi) => (
                  <line
                    key={wi}
                    x1={px - TILE_W / 2 + 6} y1={topY + TILE_H / 2 + 10 + wi * 12}
                    x2={px - 6} y2={topY + TILE_H + 10 + wi * 12}
                    stroke="#cbd5e1" strokeWidth={1.5} opacity={0.6}
                  />
                ))}
                <path d={diamond(px, topY)} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />
                {/* label + % — white halo so overlapping towers stay readable */}
                <text x={px} y={topY - 22} textAnchor="middle" fontSize={13} fontWeight={700}
                  fill="#0f172a" stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke">{zone.name}</text>
                <text x={px} y={topY - 6} textAnchor="middle" fontSize={13} fontWeight={800}
                  stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke"
                  fill={p.pct === null ? '#94a3b8' : p.pct >= 100 ? '#16a34a' : p.pct > 0 ? '#2563eb' : '#94a3b8'}>
                  {p.pct === null ? '—' : `${p.pct}%`}
                </text>
              </g>
            )
          })}
        </g>

        {externals.length > 0 && (
          <g onClick={() => onPickZone(externals[0])} className="cursor-pointer">
            <rect x={8} y={8} rx={10} width={120} height={34} fill="#f0fdf4" stroke="#bbf7d0" />
            <text x={20} y={30} fontSize={13} fontWeight={700} fill="#166534">
              外圍 {extPct.pct === null ? '—' : `${extPct.pct}%`}
            </text>
          </g>
        )}
      </svg>
      <p className="text-[11px] text-site-400 text-center mt-1">撳大樓或「外圍」直接入該分區進度</p>
    </div>
  )
}
