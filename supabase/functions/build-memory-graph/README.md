# build-memory-graph — Edge Function (AI 站長記憶圖譜重建)

Re-derives the AI 站長's memory graph from the app's existing data. For every
project it calls `rebuild_project_memory(id)` (v61), which UPSERTs one
`memory_notes` row per progress / document / issue / contact / the project
itself, rebuilds `memory_links`, and prunes notes whose source row is gone.
Service-role writer, secret-gated, cron-driven. The graph lives entirely in
Supabase (single source of truth) — no GitHub, no local Obsidian, no external
setup.

## Deploy (your side — Supabase login)
```bash
# shared secret so only the cron can invoke it
supabase secrets set MEMORY_BUILD_SECRET=$(openssl rand -hex 16) --project-ref syyntodkvexkbpjrskjj
# deploy WITHOUT JWT verification (cron calls it with the secret, not a user JWT)
supabase functions deploy build-memory-graph --no-verify-jwt --project-ref syyntodkvexkbpjrskjj
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.
`rebuild_project_memory` runs as `security definer`; its gate treats the
service-role call (null `auth.uid()`) as authorised.

## Schedule it (SQL editor — needs pg_cron + pg_net, both already used here)
```sql
-- run hourly: the graph is a derived view, so it just needs to stay fresh.
-- Replace <SECRET> with MEMORY_BUILD_SECRET.
select cron.schedule(
  'build-memory-graph-hourly', '0 * * * *',
  $$ select net.http_post(
       url := 'https://syyntodkvexkbpjrskjj.supabase.co/functions/v1/build-memory-graph',
       headers := '{"x-build-secret":"<SECRET>","Content-Type":"application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
-- verify: select jobname, schedule from cron.job where jobname='build-memory-graph-hourly';
-- one-off test: select net.http_post(url:='…/functions/v1/build-memory-graph',
--   headers:='{"x-build-secret":"<SECRET>"}'::jsonb, body:='{}'::jsonb);
```

## What it does
- Selects every `projects.id`, then calls `rebuild_project_memory(id)` for each.
  That RPC does the actual work (idempotent UPSERT of `memory_notes`, full
  rebuild of this project's `memory_links`, and prune of orphaned notes).
- Returns `{ ok, projects_rebuilt, projects_total, failed[] }`. `ok` is `false`
  if any project's rebuild errored; the offending `{id, error}` pairs are listed
  in `failed` (the loop continues past failures so one bad project doesn't block
  the rest).

Idempotent — safe to run as often as you like; each run fully reconciles the
graph against the current source rows.
