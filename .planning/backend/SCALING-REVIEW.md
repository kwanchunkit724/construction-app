# Backend Scaling Review

Senior-backend assessment of whether the backend survives real company usage,
with **measured** numbers (not guesses), the weak points, what was fixed, and
what to do as you grow.

> **Bottom line for your demo + early company use: you're safe.** The things
> you worried about — database size and raw throughput — are the *healthy*
> part. The real ceiling is **realtime fan-out + concurrent connections +
> egress**, which scale with *users and writes*, not data. The #1 risk
> (a "refetch storm") is now mitigated in code.

---

## Architecture (what "the backend" actually is)

Two-tier: **React SPA ↔ Supabase**. No app server, no Node backend to crash.
"Backend" = Supabase managed Postgres + PostgREST (REST) + Realtime
(websockets) + Auth + Storage. Supabase owns the infra; you own schema, RLS,
query patterns, and how hard the client hammers it.

**About the "tunnel":** the dev tunnel (`open-tunnel.ps1`) is a *local-dev
convenience only* and is a single point of failure + a hard bottleneck. **Never
demo or run a company on the tunnel.** Real usage goes to the Vercel URL
(`construction-app-lime-six.vercel.app`) → Supabase directly. No tunnel in that
path.

---

## Measured today (2026-06, free tier)

| Metric | Value | Verdict |
|---|---|---|
| Database size | **16 MB** / 1 GB | 1.6% used — miles away |
| Biggest business table | progress_items, **89 rows** | trivial |
| REST reads @ 20 VUs | **216 req/s, 0 errors**, p95 85 ms | healthy |
| REST reads @ 60 VUs | **678 req/s, 0 errors**, p95 97 ms / p99 357 ms | healthy, knee approaching |
| Tables broadcasting realtime | **32** | large fan-out surface ⚠ |
| Total tables | 91 | normal (incl. auth/internal) |

So: **size = non-issue. Read throughput = non-issue.** A 50-person company
nowhere near 678 req/s of reads. The signal to watch is realtime + egress.

---

## Strengths

- Supabase scales the DB tier for you — no server process to fall over.
- RLS enforces security at the row level (defense in depth).
- Realtime already throttled to 10 events/s client-side (`lib/supabase.ts`).
- 15 s fetch timeout prevents a hung request from freezing the UI.
- Per-project channel filters on the *main* tables (progress/issues/dailies/
  materials/ptw/si/vo) keep most subscriptions project-scoped.

---

## Weak points (ranked)

### 🔴 1. Refetch storm (the big one) — MITIGATED
Every domain context opened a `postgres_changes` channel and **refetched its
entire dataset on ANY change**. One foreman saving a daily diary can fire
several row changes → each one triggered a full-table refetch, on *every*
connected client. Cost = O(writes × clients × tables).

**Fixed:** added a 400 ms coalescing debounce (`src/lib/realtime.ts`) and wired
it into the 6 hot contexts (Projects, Progress, Issues, Materials, Dailies,
Mission). A burst of change events now collapses into **one** refetch. Cuts
redundant REST round-trips + Supabase egress + realtime message volume with no
loss of liveness.

### 🟠 2. Unfiltered subscriptions to shared tables — RECOMMENDED
SiContext / VoContext / PtwContext subscribe to `approvals`, `si_versions`,
`vo_versions`, `permit_versions`, `protest_comments`, `permit_*` etc. **without
a project filter**. Worse, the reads do `from('approvals').select('*')
.eq('doc_type','si')` — pulling *every* approval of that type across *all*
companies. RLS hides rows, but the change events still fan out to every client,
and the query still scans cross-tenant.
**Do next:** filter these subscriptions by project (needs `project_id` columns
on the version/approval tables, or scope the channel), and add `.eq('project_id')`
to the cross-project reads. Medium effort; do before onboarding multiple firms.

### 🟠 3. 32 tables in the realtime publication
Many tables broadcast changes that no client subscribes to → wasted WAL +
message budget. **Do next:** trim `supabase_realtime` to only the tables the app
actually subscribes to. (Dashboard → Database → Publications, or `alter
publication supabase_realtime drop table <t>`.)

### 🟡 4. No pagination / unbounded reads
List queries are `select('*').eq('project_id', …).order('created_at')` with no
limit. Fine at 89 rows; at 12 months × multiple sites the issues/dailies/
materials/drawings tables grow unbounded → slower reads + more egress.
**Do next:** add `.range()` pagination (or a generous `.limit()`) to the list
contexts before any project accumulates thousands of rows.

### 🟡 5. RLS predicate cost as data grows — PARTLY ADDRESSED
Policies do `exists(select 1 from user_profiles where id=auth.uid() and
global_role='admin')` per row. Cheap now; needs indexes at scale.
**Fixed (forward-looking):** `supabase/v24-perf-indexes.sql` adds indexes on
`user_profiles(global_role)`, `project_members(user_id/project_id/status)`, and
the hot `project_id`/`created_at`/`item_id`/`doc_type` columns, plus a STABLE
`is_admin()` helper for future policies.

### 🟡 6. Storage = the table that will actually fill 1 GB
Not data rows — **drawings + permit photos**. The free 1 GB storage is the
realistic first ceiling once sites upload plans/photos. CLAUDE.md already calls
for "compress on upload / warn on >5 MB".
**Do next:** verify client-side image compression before upload; warn on large
files; budget a Storage upgrade before a photo-heavy pilot.

---

## What was changed this pass

| Change | File | Effect |
|---|---|---|
| Realtime refetch debounce | `src/lib/realtime.ts` + 6 contexts | kills the refetch storm |
| Perf + RLS indexes, `is_admin()` | `supabase/v24-perf-indexes.sql` | index-backed filters as data grows |
| Load + health harness | `tests/load/` | measure ceilings any time |

---

## How to test (methodology)

1. **REST capacity** — `node tests/load/rest-load.mjs` (see `tests/load/README.md`).
   Ramp CONCURRENCY until error rate climbs or p99 spikes = the compute knee.
2. **DB health** — paste `tests/load/db-diagnostics.sql` into the SQL Editor
   monthly: size, biggest tables, realtime surface, missing indexes, seq scans.
3. **Realtime** — Dashboard → Reports → Realtime: concurrent connections +
   messages. Stress by opening many tabs as different test users on one project
   and driving writes; watch the graph.

---

## Free-tier ceilings & when to upgrade (Pro $25/mo)

| Resource | Free | First to hit? | Trigger |
|---|---|---|---|
| DB size | 1 GB | no (16 MB) | — |
| **Storage** | 1 GB | **likely first** | photo/drawing-heavy pilot |
| **Realtime concurrent** | ~200 | maybe | ≈ peak simultaneous open tabs |
| **Realtime messages** | 2 M/mo | maybe | many users × bursty writes |
| Egress | 5 GB/mo | watch | full-table refetches (debounce helps) |
| Compute | shared | under heavy load | p99 rises in load test |

**Rule of thumb:** 1–3 pilot companies → free tier is fine. Onboarding ~5+ active
sites with photos → move to Pro (dedicated compute + 8 GB DB + 100 GB storage)
*before* the pilot, and do weak-points #2–#4 above first.

---

## TL;DR action list (in order)

1. ✅ Refetch debounce — done.
2. ✅ Perf indexes (apply `v24-perf-indexes.sql`) — done.
3. ▢ Filter SI/VO/PTW subscriptions + reads by project (before multi-tenant).
4. ▢ Trim the realtime publication to subscribed tables.
5. ▢ Add pagination to list contexts.
6. ▢ Confirm image compression on upload; plan Storage upgrade.
7. ▢ Always demo on the Vercel URL, never the dev tunnel.
