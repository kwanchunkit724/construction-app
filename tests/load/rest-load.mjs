// REST load test for the Supabase PostgREST layer (the app's "backend").
//
// Spawns N concurrent virtual users hammering a read endpoint for a fixed
// duration, then reports throughput, latency percentiles, and error rate.
// Exercises PostgREST + the connection pooler + RLS evaluation under load.
//
// Defaults hit the PUBLIC-READ `mission_tasks` table with the publishable
// anon key (RLS-allowed, safe). Keep CONCURRENCY/DURATION modest — this is
// the live free-tier project.
//
//   node tests/load/rest-load.mjs
//   CONCURRENCY=40 DURATION=15 QUERY="issues?select=*&limit=50" \
//     TOKEN=<user-jwt> node tests/load/rest-load.mjs
//
// Env:
//   SUPABASE_URL   default https://syyntodkvexkbpjrskjj.supabase.co
//   ANON_KEY       default the project's publishable key
//   QUERY          default 'mission_tasks?select=*'  (relative to /rest/v1/)
//   CONCURRENCY    default 20
//   DURATION       seconds, default 10
//   TOKEN          optional user JWT (for RLS-protected tables)

const URL = process.env.SUPABASE_URL || 'https://syyntodkvexkbpjrskjj.supabase.co'
const ANON = process.env.ANON_KEY || 'sb_publishable_BHKTjGCKkot6GVa2M6BCMQ_0qBAl1jP'
// NB: deliberately NOT process.env.PATH — that's the OS PATH variable.
const PATH = process.env.QUERY || 'mission_tasks?select=*'
const CONCURRENCY = Number(process.env.CONCURRENCY || 20)
const DURATION = Number(process.env.DURATION || 10)
const TOKEN = process.env.TOKEN || ANON

const endpoint = `${URL}/rest/v1/${PATH}`
const headers = { apikey: ANON, Authorization: `Bearer ${TOKEN}` }

const latencies = []
let ok = 0, errors = 0
const statusCounts = {}
const stop = Date.now() + DURATION * 1000

async function worker() {
  while (Date.now() < stop) {
    const t0 = performance.now()
    try {
      const res = await fetch(endpoint, { headers })
      // drain body so the connection can be reused
      await res.arrayBuffer()
      const dt = performance.now() - t0
      latencies.push(dt)
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1
      if (res.ok) ok++; else errors++
    } catch (e) {
      errors++
      statusCounts['ERR'] = (statusCounts['ERR'] || 0) + 1
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

console.log(`▶ REST load test`)
console.log(`  endpoint    : GET ${endpoint}`)
console.log(`  concurrency : ${CONCURRENCY} virtual users`)
console.log(`  duration    : ${DURATION}s`)
console.log(`  auth        : ${TOKEN === ANON ? 'anon (publishable)' : 'user JWT'}`)
console.log('')

const started = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
const elapsed = (Date.now() - started) / 1000
const total = ok + errors

console.log(`── results ──────────────────────────────`)
console.log(`  requests    : ${total}  (${ok} ok, ${errors} errors)`)
console.log(`  throughput  : ${(total / elapsed).toFixed(1)} req/s`)
console.log(`  error rate  : ${total ? ((errors / total) * 100).toFixed(2) : 0}%`)
console.log(`  status      : ${JSON.stringify(statusCounts)}`)
console.log(`  latency ms  : p50=${pct(latencies, 50).toFixed(0)}  p95=${pct(latencies, 95).toFixed(0)}  p99=${pct(latencies, 99).toFixed(0)}  max=${Math.max(0, ...latencies).toFixed(0)}`)
console.log('')
console.log(`  note: error rate climbing or p99 spiking as CONCURRENCY rises`)
console.log(`  = pooler / compute ceiling. On free tier expect this in the`)
console.log(`  low-hundreds of req/s. Scale = upgrade Supabase compute, not code.`)
