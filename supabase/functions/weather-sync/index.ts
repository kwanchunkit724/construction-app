// =============================================================
// supabase/functions/weather-sync/index.ts   (Weather Part 2 — extreme-day sync)
// =============================================================
// Cron-driven job that snapshots the HKO Open Data API into weather_events, so
// the app has a tamper-checkable record of territory extreme-weather DAYS for
// EOT claims. Writes via the SERVICE ROLE (weather_events has no client write
// policy). Gated by a shared secret so it can't be invoked publicly.
//
// Two sources (per the EOT research):
//  1) warnsum — in-force warnings RIGHT NOW. HKO has no warning history API, so
//     this must run frequently (e.g. every 30 min) to catch short T8/rainstorm
//     signals. Captures T8+/黑/紅/黃雨 (+ very-hot/cold) for TODAY.
//  2) daily rainfall CSV — the objective "rainfall > 20 mm / 24 h" SFBC/Housing
//     ground. CSV updates MONTHLY (lags ~1 month) → these rows are a backfill,
//     not real-time. Scans the last ~45 days of a few representative stations.
//
// Secrets (supabase secrets set): WEATHER_SYNC_SECRET (shared with the cron caller).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SYNC_SECRET = Deno.env.get('WEATHER_SYNC_SECRET') ?? ''

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php'
const TERRITORY = 'HK'   // sentinel station for territory-wide warning rows (so the unique index dedups)
const RAIN_STATIONS = ['HKO', 'HKA', 'SHA', 'TWN', 'TU1', 'JKB']   // representative gauges across districts

function hktToday(): string {
  return new Date(new Date().getTime() + 8 * 3600e3).toISOString().slice(0, 10)
}

// warnsum subtype code -> weather_events.kind (only the EOT-relevant ones)
function warningKind(code: string): string | null {
  if (code === 'TC8NE' || code === 'TC8SE' || code === 'TC8SW' || code === 'TC8NW') return 't8'
  if (code === 'TC9') return 't9'
  if (code === 'TC10') return 't10'
  if (code === 'WRAINB') return 'black_rain'
  if (code === 'WRAINR') return 'red_rain'
  if (code === 'WRAINA') return 'amber_rain'
  if (code === 'WHOT') return 'very_hot'
  if (code === 'WCOLD') return 'cold'
  return null
}

Deno.serve(async (req) => {
  // secret gate — cron passes ?secret=… or an x-sync-secret header
  const url = new URL(req.url)
  const given = req.headers.get('x-sync-secret') ?? url.searchParams.get('secret') ?? ''
  if (!SYNC_SECRET || given !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const rows: { hkt_date: string; kind: string; station: string; evidence: unknown }[] = []
  const today = hktToday()

  // ── 1) warnsum snapshot ──────────────────────────────────────────────────
  try {
    const ws = await fetch(`${HKO}?dataType=warnsum&lang=en`).then((r) => r.json())
    for (const key of Object.keys(ws ?? {})) {
      const w = (ws as any)[key]
      if (!w || w.actionCode === 'CANCEL') continue
      const kind = warningKind(w.code || key)
      if (!kind) continue
      rows.push({
        hkt_date: today, kind, station: TERRITORY,
        evidence: { code: w.code || key, name: w.name, type: w.type, issueTime: w.issueTime, expireTime: w.expireTime, source: 'warnsum' },
      })
    }
  } catch (e) {
    console.error('warnsum fetch failed', e)
  }

  // ── 2) daily rainfall CSV (objective > 20 mm / 24 h) ────────────────────
  const year = today.slice(0, 4)
  const cutoff = new Date(new Date().getTime() - 45 * 864e5).toISOString().slice(0, 10)
  for (const stn of RAIN_STATIONS) {
    try {
      const csv = await fetch(`https://data.weather.gov.hk/weatherAPI/cis/csvfile/${stn}/${year}/daily_${stn}_RF_${year}.csv`)
        .then((r) => (r.ok ? r.text() : ''))
      if (!csv) continue
      for (const line of csv.split('\n')) {
        const c = line.split(',')
        if (c.length < 4) continue
        const y = c[0]?.trim(), m = c[1]?.trim(), d = c[2]?.trim(), val = c[3]?.trim()
        if (!/^\d{4}$/.test(y)) continue            // skip header / non-data lines
        const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        if (date < cutoff) continue
        const mm = Number(val)
        if (Number.isFinite(mm) && mm > 20) {
          rows.push({ hkt_date: date, kind: 'rainfall_20mm', station: stn, evidence: { mm, station: stn, source: 'daily_rainfall_csv' } })
        }
      }
    } catch (e) {
      console.error('rainfall csv failed', stn, e)
    }
  }

  // ── upsert (dedup via unique(hkt_date, kind, station)) ──────────────────
  let written = 0
  if (rows.length) {
    const { error, count } = await supa.from('weather_events')
      .upsert(rows, { onConflict: 'hkt_date,kind,station', ignoreDuplicates: true, count: 'exact' })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    written = count ?? rows.length
  }

  return new Response(JSON.stringify({ ok: true, scanned: rows.length, written, date: today }), { headers: { 'Content-Type': 'application/json' } })
})
