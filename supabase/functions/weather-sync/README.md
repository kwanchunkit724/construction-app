# weather-sync — Edge Function (極端天氣記錄同步)

Snapshots the HKO Open Data API into `weather_events` (v58) so the app has a
record of territory extreme-weather days for EOT claims. Service-role writer,
secret-gated, cron-driven. See `.planning/weather-progress-2026/DESIGN.md`.

## Deploy (your side — Supabase login)
```bash
# shared secret so only the cron can invoke it
supabase secrets set WEATHER_SYNC_SECRET=$(openssl rand -hex 16) --project-ref syyntodkvexkbpjrskjj
# deploy WITHOUT JWT verification (cron calls it with the secret, not a user JWT)
supabase functions deploy weather-sync --no-verify-jwt --project-ref syyntodkvexkbpjrskjj
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

## Schedule it (SQL editor — needs pg_cron + pg_net, both already used here)
```sql
-- run every 30 min: frequent enough to catch short T8/rainstorm signals
-- (warnsum has no history API). Replace <SECRET> with WEATHER_SYNC_SECRET.
select cron.schedule(
  'weather-sync-30m', '*/30 * * * *',
  $$ select net.http_post(
       url := 'https://syyntodkvexkbpjrskjj.supabase.co/functions/v1/weather-sync',
       headers := '{"x-sync-secret":"<SECRET>","Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
-- verify: select jobname, schedule from cron.job where jobname='weather-sync-30m';
-- one-off test: select net.http_post(url:='…/functions/v1/weather-sync',
--   headers:='{"x-sync-secret":"<SECRET>"}'::jsonb, body:='{}'::jsonb);
```

## What it records
- **warnsum** (real-time): T8/T9/T10, 黑/紅/黃雨, 酷熱/寒冷 in force *today* → a
  `weather_events` row (station `'HK'`, evidence = warning code + issue/expire).
- **daily rainfall CSV** (objective): days in the last ~45d with **>20 mm/24h** at
  6 representative gauges → `rainfall_20mm` rows. ⚠️ The CSV updates monthly, so
  these backfill ~1 month behind — real-time T8/rain comes from warnsum.

Dedup is by `unique(hkt_date, kind, station)` (idempotent upserts).
