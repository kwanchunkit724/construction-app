import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Check, Flag } from 'lucide-react'
import { Spinner } from '../Spinner'
import { supabase } from '../../lib/supabase'
import { useProjects } from '../../contexts/ProjectsContext'
import { guidedPct } from '../../lib/guided'
import type { Project, ProgressItem, SiteMap as SiteMapT, SiteMapMarker, Zone } from '../../types'

// 2.5D 地盤地圖 (v112, v3 after user feedback). Fixed isometric projection —
// no rotation. The grid is a FIXED 12×12 canvas; the user paints their site's
// FOOTPRINT on it (irregular shapes welcome), then places zones and markers
// on the painted ground. Unpainted cells are void — not part of the site.
// Buildings extrude by floor count and wear their live %; tap navigates into
// that zone's guided 進度表.

const GRID = 12
const TILE_W = 64
const TILE_H = 32
const MARKER_PRESETS = ['閘口', '人閘', '吊機', '貨梯', '斜路', '辦公室']

function iso(x: number, y: number) {
  return {
    px: (GRID - 1) * (TILE_W / 2) + (x - y) * (TILE_W / 2) + TILE_W / 2,
    py: (x + y) * (TILE_H / 2),
  }
}

function diamond(cx: number, cy: number): string {
  return `M ${cx} ${cy} L ${cx + TILE_W / 2} ${cy + TILE_H / 2} L ${cx} ${cy + TILE_H} L ${cx - TILE_W / 2} ${cy + TILE_H / 2} Z`
}

const key = (x: number, y: number) => `${x},${y}`

// pre-shape maps (v2) have no ground list — their footprint is the full
// cols×rows rectangle they were saved with.
function groundSetOf(map: SiteMapT): Set<string> {
  if (map.ground && map.ground.length > 0) return new Set(map.ground.map(g => key(g.x, g.y)))
  const s = new Set<string>()
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) s.add(key(x, y))
  return s
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

// ── 擺位 setup: ①畫地盤形狀 ②擺分區 ③加標示 — one 12×12 canvas ──
function MapSetup({ project, onDone }: { project: Project; onDone: () => void }) {
  const { refetch } = useProjects()
  const init = project.site_map
  const [ground, setGround] = useState<Set<string>>(() => {
    if (init) return groundSetOf(init)
    // fresh map: start with the full canvas painted — cutting away is easier
    // than painting a site from nothing.
    const s = new Set<string>()
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) s.add(key(x, y))
    return s
  })
  const [cells, setCells] = useState<{ zone_id: string; x: number; y: number }[]>(init?.cells ?? [])
  const [markers, setMarkers] = useState<SiteMapMarker[]>(init?.markers ?? [])
  const [mode, setMode] = useState<'shape' | 'zones' | 'markers'>(init ? 'zones' : 'shape')
  const [picked, setPicked] = useState<string | null>(null)
  const [markerLabel, setMarkerLabel] = useState<string>(MARKER_PRESETS[0])
  const [customMarker, setCustomMarker] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const placeable = project.zones.filter(z => (z.kind ?? 'building') === 'building')
  const placedIds = new Set(cells.map(c => c.zone_id))

  function tapCell(x: number, y: number) {
    const k = key(x, y)
    const zoneCell = cells.find(c => c.x === x && c.y === y)
    const marker = markers.find(m => m.x === x && m.y === y)
    if (mode === 'shape') {
      if (ground.has(k)) {
        // cutting a cell out of the site removes whatever sat on it
        setGround(g => { const n = new Set(g); n.delete(k); return n })
        if (zoneCell) setCells(cs => cs.filter(c => c !== zoneCell))
        if (marker) setMarkers(ms => ms.filter(m => m !== marker))
      } else {
        setGround(g => new Set(g).add(k))
      }
      return
    }
    if (!ground.has(k)) return // outside the site — nothing places here
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
    const groundArr = [...ground].map(k => { const [x, y] = k.split(',').map(Number); return { x, y } })
    const site_map: SiteMapT = {
      cols: GRID,
      rows: GRID,
      cells: cells.filter(c => ground.has(key(c.x, c.y))),
      markers: markers.filter(m => ground.has(key(m.x, m.y))),
      ground: groundArr,
    }
    const { error: e } = await supabase.from('projects').update({ site_map }).eq('id', project.id)
    if (e) { setError(e.message); setBusy(false); return }
    await refetch()
    setBusy(false)
    onDone()
  }

  return (
    <div className="space-y-3">
      {/* mode switch */}
      <div className="grid grid-cols-3 bg-site-100 rounded-xl p-1">
        <button onClick={() => setMode('shape')} className={`py-2 rounded-lg text-sm font-semibold min-h-0 ${mode === 'shape' ? 'bg-white shadow-card text-green-700' : 'text-site-500'}`}>
          地盤形狀
        </button>
        <button onClick={() => setMode('zones')} className={`py-2 rounded-lg text-sm font-semibold min-h-0 ${mode === 'zones' ? 'bg-white shadow-card text-safety-700' : 'text-site-500'}`}>
          擺分區
        </button>
        <button onClick={() => setMode('markers')} className={`py-2 rounded-lg text-sm font-semibold min-h-0 ${mode === 'markers' ? 'bg-white shadow-card text-blue-700' : 'text-site-500'}`}>
          <Flag size={13} className="inline mr-1" />加標示
        </button>
      </div>

      {mode === 'shape' && (
        <>
          <p className="text-xs text-site-500 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
            撳格仔剪走／加返地盤範圍 — 畫出你地盤嘅實際形狀。剪走嘅格會連埋上面嘅分區／標示一齊移除。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const s = new Set<string>()
                for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) s.add(key(x, y))
                setGround(s)
              }}
              className="btn-ghost flex-1 min-h-0 py-2 text-xs"
            >全部填滿</button>
            <button
              onClick={() => { setGround(new Set()); setCells([]); setMarkers([]) }}
              className="btn-ghost flex-1 min-h-0 py-2 text-xs"
            >全部清空</button>
          </div>
        </>
      )}

      {mode === 'zones' && (
        <>
          <p className="text-xs text-site-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            ① 撳一個分區 ② 撳地盤範圍內嘅格仔擺低佢。再撳已擺嘅格仔可以移走。
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
      )}

      {mode === 'markers' && (
        <>
          <p className="text-xs text-site-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            揀一個標示，撳地盤範圍內嘅格仔擺低。再撳已有標示嘅格仔可以移走。
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

      {/* the 12×12 canvas */}
      <div className="grid gap-0.5 bg-site-200 border border-site-200 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const x = i % GRID, y = Math.floor(i / GRID)
          const onGround = ground.has(key(x, y))
          const cell = cells.find(c => c.x === x && c.y === y)
          const zone = cell ? project.zones.find(z => z.id === cell.zone_id) : null
          const marker = markers.find(m => m.x === x && m.y === y)
          return (
            <button
              key={i}
              onClick={() => tapCell(x, y)}
              className={`aspect-square text-[9px] font-semibold min-h-0 leading-tight ${
                !onGround ? 'bg-site-300 text-transparent hover:bg-site-400'
                  : zone ? 'bg-safety-500 text-white'
                  : marker ? 'bg-blue-500 text-white'
                  : 'bg-green-100 text-transparent hover:bg-green-200'}`}
            >
              {zone ? zone.name.slice(0, 2) : marker ? marker.label.slice(0, 2) : '·'}
            </button>
          )
        })}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

      <button onClick={() => void save()} disabled={busy || ground.size === 0 || placedIds.size === 0} className="btn-primary w-full">
        {busy ? <Spinner size={18} className="text-white" /> : <><Check size={16} /> 儲存地圖（{placedIds.size}/{placeable.length} 座 · {markers.length} 個標示）</>}
      </button>
    </div>
  )
}

// ── 2.5D isometric render — footprint-aware, cropped to the shape ──
function IsoMap({ project, map, items, onPickZone }: {
  project: Project
  map: SiteMapT
  items: ProgressItem[]
  onPickZone: (zone: Zone) => void
}) {
  const externals = project.zones.filter(z => z.kind === 'external')
  const extPct = guidedPct(items, { zoneIds: externals.map(z => z.id) })

  const ground = useMemo(() => groundSetOf(map), [map])
  const groundCells = useMemo(
    () => [...ground].map(k => { const [x, y] = k.split(',').map(Number); return { x, y } }),
    [ground],
  )

  const drawCells = useMemo(
    () => [...map.cells]
      .filter(c => ground.has(key(c.x, c.y)))
      .sort((a, b) => (a.x + a.y) - (b.x + b.y)),
    [map.cells, ground],
  )

  // crop the viewBox to the painted footprint (plus label/tower headroom)
  const vb = useMemo(() => {
    if (groundCells.length === 0) return { x: 0, y: 0, w: 100, h: 100 }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of groundCells) {
      const { px, py } = iso(c.x, c.y)
      minX = Math.min(minX, px - TILE_W / 2)
      maxX = Math.max(maxX, px + TILE_W / 2)
      minY = Math.min(minY, py)
      maxY = Math.max(maxY, py + TILE_H)
    }
    const headroom = 150 // tallest tower + its labels
    return { x: minX - 10, y: minY - headroom, w: maxX - minX + 20, h: maxY - minY + headroom + 15 }
  }, [groundCells])

  return (
    <div className="card p-3 overflow-x-auto">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full" style={{ maxHeight: 460 }}>
        {/* ground — only the painted footprint */}
        {groundCells.map(({ x, y }) => {
          const { px, py } = iso(x, y)
          return <path key={`g-${x}-${y}`} d={diamond(px, py)} fill="#dcfce7" stroke="#bbf7d0" strokeWidth={1} />
        })}

        {/* markers */}
        {(map.markers ?? []).filter(m => ground.has(key(m.x, m.y))).map((m, i) => {
          const { px, py } = iso(m.x, m.y)
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
          const { px, py } = iso(cell.x, cell.y)
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
              <text x={px} y={topY - 22} textAnchor="middle" fontSize={13} fontWeight={700}
                fill="#0f172a" stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke">{zone.name}</text>
              <text x={px} y={topY - 6} textAnchor="middle" fontSize={13} fontWeight={800}
                stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke"
                fill={p.pct === null ? '#94a3b8' : p.pct >= 100 ? '#059669' : p.pct > 0 ? '#ea580c' : '#94a3b8'}>
                {p.pct === null ? '—' : `${p.pct}%`}
              </text>
            </g>
          )
        })}

        {externals.length > 0 && (
          <g onClick={() => onPickZone(externals[0])} className="cursor-pointer">
            <rect x={vb.x + 8} y={vb.y + 8} rx={10} width={120} height={34} fill="#f0fdf4" stroke="#bbf7d0" />
            <text x={vb.x + 20} y={vb.y + 30} fontSize={13} fontWeight={700} fill="#166534">
              外圍 {extPct.pct === null ? '—' : `${extPct.pct}%`}
            </text>
          </g>
        )}
      </svg>
      <p className="text-[11px] text-site-400 text-center mt-1">撳大樓或「外圍」直接入該分區進度</p>
    </div>
  )
}
