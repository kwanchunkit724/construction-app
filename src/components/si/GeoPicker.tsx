import { useCallback, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Geolocation } from '@capacitor/geolocation'
import { latLngToTile, tileUrl, OSM_ATTRIBUTION } from '../../lib/osm-tile'
import { Spinner } from '../Spinner'

// D-09 / D-19: coarse location only (enableHighAccuracy:false). 8s timeout.
// Non-blocking on permission denial. Single OSM static tile preview, no JS
// map library — keeps bundle slim.

export interface GeoValue {
  lat: number
  lng: number
  accuracy_m: number
}

export interface GeoPickerProps {
  value: GeoValue | null
  onChange: (g: GeoValue | null) => void
}

type State = 'empty' | 'resolving' | 'resolved' | 'denied'

const TILE_ZOOM = 16
const TILE_SIZE = 240

export function GeoPicker({ value, onChange }: GeoPickerProps) {
  const [state, setState] = useState<State>(value ? 'resolved' : 'empty')
  const [error, setError] = useState<string | null>(null)

  const acquire = useCallback(async () => {
    setState('resolving')
    setError(null)
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      })
      const g: GeoValue = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: Math.round(pos.coords.accuracy ?? 0),
      }
      onChange(g)
      setState('resolved')
    } catch (e: any) {
      console.error('GeoPicker error:', e)
      setError(e?.message ?? null)
      setState('denied')
      onChange(null)
    }
  }, [onChange])

  const clear = useCallback(() => {
    onChange(null)
    setState('empty')
    setError(null)
  }, [onChange])

  return (
    <div className="card p-3">
      <p className="label mb-2">位置 (選填)</p>

      {state === 'empty' && (
        <button
          type="button"
          onClick={acquire}
          className="btn-ghost w-full inline-flex items-center justify-center gap-2"
        >
          <MapPin size={18} className="text-safety-600" />
          <span>{'加入位置 (選填)'}</span>
        </button>
      )}

      {state === 'resolving' && (
        <div className="flex items-center justify-center gap-2 py-2 text-site-600">
          <Spinner size={16} />
          <span>正在取得位置…</span>
        </div>
      )}

      {state === 'resolved' && value && (
        <GeoPreview value={value} onClear={clear} />
      )}

      {state === 'denied' && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs bg-site-100 text-site-600 px-2 py-1 rounded-full">
            <MapPin size={12} />
            <span>已跳過位置 (權限被拒)</span>
          </span>
          <button
            type="button"
            onClick={acquire}
            className="text-xs text-safety-600 underline"
          >
            重試
          </button>
        </div>
      )}

      {error && state !== 'denied' && (
        <p className="mt-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
    </div>
  )
}

function GeoPreview({ value, onClear }: { value: GeoValue; onClear: () => void }) {
  const { z, x, y } = latLngToTile(value.lat, value.lng, TILE_ZOOM)
  const url = tileUrl(z, x, y)
  return (
    <div>
      <div
        className="relative rounded-xl overflow-hidden border border-site-200 bg-site-100"
        style={{ width: TILE_SIZE, height: TILE_SIZE, maxWidth: '100%' }}
      >
        <img
          src={url}
          alt="位置預覽"
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Centre pin overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <MapPin size={28} className="text-red-600 drop-shadow" fill="currentColor" />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-site-400">{OSM_ATTRIBUTION}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-site-700">
          (緯度 {value.lat.toFixed(4)}, 經度 {value.lng.toFixed(4)}) ±{value.accuracy_m}m
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-xs text-red-600"
        >
          <X size={14} />
          <span>清除位置</span>
        </button>
      </div>
    </div>
  )
}

export default GeoPicker
