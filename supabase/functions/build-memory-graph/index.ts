// =============================================================
// supabase/functions/build-memory-graph/index.ts   (#4 — server-hosted memory graph)
// =============================================================
// Cron/manual-invoked job that (re)derives the AI 站長's memory graph from the
// app's existing data. For every project it calls rebuild_project_memory(id)
// (v61), which UPSERTs one memory_notes row per progress / document / issue /
// contact / the project itself, rebuilds memory_links, and prunes notes whose
// source row is gone. Runs via the SERVICE ROLE — rebuild_project_memory's gate
// treats a null auth.uid() (service-role) as authorised, and memory_notes /
// memory_links have NO client write policy. Gated by a shared secret so it
// can't be invoked publicly.
//
// Supabase is the single source of truth: this graph is a one-way derived view
// of progress_items ↔ documents ↔ issues ↔ contacts under projects. No GitHub,
// no local Obsidian, no external setup — it lives entirely in Postgres.
//
// Secrets (supabase secrets set): MEMORY_BUILD_SECRET (shared with the cron caller).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUILD_SECRET = Deno.env.get('MEMORY_BUILD_SECRET') ?? ''

Deno.serve(async (req) => {
  // secret gate — cron passes ?secret=… or an x-build-secret header
  const url = new URL(req.url)
  const given = req.headers.get('x-build-secret') ?? url.searchParams.get('secret') ?? ''
  if (!BUILD_SECRET || given !== BUILD_SECRET) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // ── select every project id ─────────────────────────────────────────────
  const { data: projects, error: listErr } = await supa.from('projects').select('id')
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  // ── rebuild the memory graph for each project ────────────────────────────
  let rebuilt = 0
  const failed: { id: string; error: string }[] = []
  for (const p of projects ?? []) {
    const { error } = await supa.rpc('rebuild_project_memory', { p_project_id: p.id })
    if (error) {
      console.error('rebuild_project_memory failed', p.id, error.message)
      failed.push({ id: p.id, error: error.message })
      continue
    }
    rebuilt += 1
  }

  return new Response(
    JSON.stringify({ ok: failed.length === 0, projects_rebuilt: rebuilt, projects_total: projects?.length ?? 0, failed }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
