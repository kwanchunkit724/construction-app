import { useEffect, useState } from 'react'
import { CloudRain, AlertTriangle, Thermometer } from 'lucide-react'
import { fetchSiteWeather, type SiteWeather, type WeatherSeverity } from '../lib/hko'

// 實時天氣 (Part 1) — live HKO warnings + current weather for the site. Calls the
// keyless HKO Open Data API directly (CORS-OK), polls every 3 min. Supplementary
// info, so it fails silently if HKO is unreachable.

const SEV_CLS: Record<WeatherSeverity, string> = {
  stopwork: 'bg-red-50 border-red-300 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info: 'bg-blue-50 border-blue-100 text-blue-700',
}

export function WeatherBanner() {
  const [w, setW] = useState<SiteWeather | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetchSiteWeather()
      .then(d => { if (alive) { setW(d); setErr(false) } })
      .catch(() => { if (alive) setErr(true) })
    load()
    const t = setInterval(load, 180000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!w || (err && !w)) return null
  const hasWarn = w.warnings.length > 0

  return (
    <div className="mb-3">
      {w.stopWork && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 mb-1.5 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-700">惡劣天氣警告生效 — 應評估並暫停受影響的戶外工作</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {hasWarn ? w.warnings.map((wn, i) => (
          <span key={i} className={`px-2 py-0.5 rounded-full border font-medium ${SEV_CLS[wn.severity]}`}>
            {wn.name}{wn.label && wn.label !== wn.name ? `（${wn.label}）` : ''}
          </span>
        )) : (
          <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 font-medium">天氣正常</span>
        )}
        {w.tempC != null && <span className="text-site-500 flex items-center gap-0.5"><Thermometer size={12} />{w.tempC}°C</span>}
        {w.rainfallMm != null && w.rainfallMm > 0 && <span className="text-site-500 flex items-center gap-0.5"><CloudRain size={12} />{w.rainfallMm}mm</span>}
        <span className="text-[10px] text-site-300 ml-auto">香港天文台</span>
      </div>
    </div>
  )
}
