# Backend load + health tests

The app is two-tier (React SPA ↔ Supabase). There's no app server to crash —
"the backend" is Supabase: Postgres + PostgREST + Realtime + Storage. These
tools measure each ceiling.

## 1. REST read load — `rest-load.mjs`

Concurrent virtual users hammering a read endpoint; reports throughput,
latency percentiles, error rate. Exercises PostgREST + the pooler + RLS.

```bash
# baseline (public mission_tasks, anon key)
node tests/load/rest-load.mjs

# push concurrency to find the knee
CONCURRENCY=60 DURATION=10 node tests/load/rest-load.mjs

# test a real RLS-protected table (paste a logged-in user's JWT)
CONCURRENCY=40 QUERY="issues?select=*&limit=50" TOKEN=<jwt> node tests/load/rest-load.mjs
```

**Baseline observed (free tier, 2026-06):** 20 VUs → 216 req/s, 0 errors,
p95 85 ms. 60 VUs → 678 req/s, 0 errors, p95 97 ms / p99 357 ms. Read
capacity is **not** the bottleneck for this app's scale.

**Read it like this:** error rate climbing or p99 spiking as CONCURRENCY
rises = compute/pooler ceiling. The fix is upgrading Supabase compute, not
code. Don't run huge sustained loads against the live free-tier project.

## 2. DB health — `db-diagnostics.sql`

Paste into Dashboard → SQL Editor. Shows db size vs the 1 GB ceiling, biggest
tables, how many tables broadcast realtime, missing filter-column indexes, and
seq-scan hotspots. Re-run monthly to watch growth.

## 3. Realtime — measure in the dashboard

Realtime is the real scaling axis here (see `.planning/backend/SCALING-REVIEW.md`).
There's no clean CLI for it; watch **Dashboard → Reports → Realtime**:
- **Concurrent connections** (free tier peak ~200). ≈ one per open browser tab.
- **Messages / month** (free tier 2M). Every published-table write × every
  subscribed client. The 400 ms refetch-debounce (lib/realtime.ts) cuts the
  redundant refetches a burst would otherwise cause.

To stress it manually: open the app in many tabs as different test users on the
same project, then drive writes (save dailies / tick progress) and watch the
Realtime + Egress graphs climb.

## Free-tier ceilings (when to upgrade to Pro $25/mo)

| Resource | Free | Watch |
|---|---|---|
| DB size | 1 GB | 16 MB today — far off |
| Egress | 5 GB/mo | grows with full-table refetches → debounce + pagination |
| Realtime concurrent | ~200 | ≈ peak simultaneous open tabs |
| Realtime messages | 2 M/mo | fan-out × clients |
| Storage | 1 GB | drawings + permit photos — compress on upload |
| Compute | shared/small | p99 rises under load → Pro = dedicated |
