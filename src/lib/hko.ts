// Hong Kong Observatory (HKO) Open Data API client — keyless, CORS-enabled, so
// the app calls it directly (no Supabase proxy). One base URL switched by
// dataType. lang=tc gives zh-HK names matching the UI.
// Doc: HKO Open Data API v1.13. Endpoint verified live 2026-06.

const BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php'

export type WeatherSeverity = 'stopwork' | 'warning' | 'info'

export interface ActiveWarning {
  code: string          // subtype code, e.g. WRAINB / TC8NE / WTS
  name: string          // localized warning name (zh-HK)
  label: string         // human subtype label when present (e.g. 八號東北烈風或暴風信號 / 黑色)
  severity: WeatherSeverity
  issueTime?: string
}

export interface SiteWeather {
  warnings: ActiveWarning[]
  stopWork: boolean     // T8+ or Black rainstorm in force — the HK "停工/八號波" trigger
  tempC: number | null
  rainfallMm: number | null   // max district past-hour rainfall
  warningLines: string[]      // rhrread.warningMessage — ready-made banner lines
  updatedAt: string | null
}

// T8 or above + Black rainstorm = stop-work / non-working-day trigger.
const STOPWORK_CODES = new Set(['TC8NE', 'TC8SE', 'TC8SW', 'TC8NW', 'TC9', 'TC10', 'WRAINB'])
// Heightened-alert (red/amber rain, T1/T3, monsoon, flooding, landslip, thunderstorm).
const WARN_CODES = new Set(['TC1', 'TC3', 'WRAINR', 'WRAINA', 'WMSGNL', 'WFNTSA', 'WL', 'WTS'])

function severityOf(code: string): WeatherSeverity {
  if (STOPWORK_CODES.has(code)) return 'stopwork'
  if (WARN_CODES.has(code) || code.startsWith('TC')) return 'warning'
  return 'info'
}

async function getJson(dataType: string): Promise<any> {
  const r = await fetch(`${BASE}?dataType=${dataType}&lang=tc`, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HKO ${dataType} ${r.status}`)
  return r.json()
}

export async function fetchSiteWeather(): Promise<SiteWeather> {
  const [warnsum, rhr] = await Promise.all([
    getJson('warnsum').catch(() => ({})),
    getJson('rhrread').catch(() => ({})),
  ])

  const warnings: ActiveWarning[] = []
  for (const key of Object.keys(warnsum ?? {})) {
    const w = (warnsum as any)[key]
    if (!w || w.actionCode === 'CANCEL') continue      // empty {} = all clear; CANCEL = no longer in force
    const code: string = w.code || key
    warnings.push({
      code,
      name: w.name ?? code,
      label: w.type ?? w.name ?? code,
      severity: severityOf(code),
      issueTime: w.issueTime,
    })
  }
  // sort most-severe first
  const rank: Record<WeatherSeverity, number> = { stopwork: 0, warning: 1, info: 2 }
  warnings.sort((a, b) => rank[a.severity] - rank[b.severity])

  let tempC: number | null = null
  const tData: any[] = rhr?.temperature?.data ?? []
  const hq = tData.find((d) => d.place === '香港天文台') ?? tData[0]
  if (hq && typeof hq.value === 'number') tempC = hq.value

  let rainfallMm: number | null = null
  const rData: any[] = rhr?.rainfall?.data ?? []
  if (rData.length) rainfallMm = Math.max(...rData.map((d) => Number(d.max ?? 0)))

  const wm = rhr?.warningMessage
  const warningLines: string[] = Array.isArray(wm) ? wm.filter(Boolean) : (typeof wm === 'string' && wm ? [wm] : [])

  return {
    warnings,
    stopWork: warnings.some((w) => w.severity === 'stopwork'),
    tempC,
    rainfallMm,
    warningLines,
    updatedAt: rhr?.updateTime ?? null,
  }
}
