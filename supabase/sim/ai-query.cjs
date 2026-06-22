// =============================================================
// ai-query.cjs — query the AI 站長 against the simulated [TEST] data
// =============================================================
// Asks the ai-assistant Edge Function (as PM) a set of data questions, captures
// the streamed answer, computes the ground truth from the DB, and records
// expected-vs-actual to .planning/sim-runs/ai-queries-<ts>.json for review.
//   node supabase/sim/ai-query.cjs
// =============================================================
const fs = require('fs')
const path = require('path')
const envRaw = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
const env = Object.fromEntries(envRaw.split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const URL = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
const PROJ = 'bbbb0000-0000-0000-0000-000000000001'
const PM = '62000001', PW = 'CKtest2026'

async function login(phone) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: phone + '@phone.local', password: PW }) })
  const j = await r.json(); if (!j.access_token) throw new Error('login fail ' + JSON.stringify(j)); return j.access_token
}
let JWT
async function get(pathq) { const r = await fetch(`${URL}/rest/v1/${pathq}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + JWT } }); return r.json() }
async function rpc(name, args) { const r = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + JWT, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) }); return r.json() }

async function askAI(question) {
  const res = await fetch(`${URL}/functions/v1/ai-assistant`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + JWT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: PROJ, messages: [{ role: 'user', content: question }] }),
  })
  if (!res.ok) { const e = await res.text(); return { text: `[HTTP ${res.status}] ${e.slice(0, 200)}`, tools: [] } }
  const raw = await res.text()
  let text = '', tools = [], curEvent = null
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) curEvent = line.slice(6).trim()
    else if (line.startsWith('data:')) {
      let d; try { d = JSON.parse(line.slice(5).trim()) } catch { continue }
      if (curEvent === 'text') text += d.delta ?? ''
      else if (curEvent === 'tool' && d.name) { if (!tools.includes(d.name)) tools.push(d.name) }
      else if (curEvent === 'error') text += `\n[error] ${d.message || ''}`
    }
  }
  return { text: text.trim(), tools }
}

;(async () => {
  JWT = await login(PM)
  const today = new Date().toISOString().slice(0, 10)
  // ---- ground truth from data ----
  const openIssues = (await get(`issues?project_id=eq.${PROJ}&status=eq.open&select=id`)).length
  const allIssues = (await get(`issues?project_id=eq.${PROJ}&select=id`)).length
  const mats = await get(`materials?project_id=eq.${PROJ}&select=status`)
  const matsNotArrived = mats.filter(m => m.status !== 'arrived').length
  const contacts = (await get(`contacts?project_id=eq.${PROJ}&select=id`)).length
  const dailiesToday = (await get(`dailies?project_id=eq.${PROJ}&date=eq.${today}&select=id`)).length
  const ptws = await get(`permits_to_work?project_id=eq.${PROJ}&select=number,status,expires_at`)
  const activePtw = ptws.filter(p => p.status === 'active').length
  const events = (await get(`events?project_id=eq.${PROJ}&select=id`)).length

  const QUESTIONS = [
    { q: '今日工地概況係點？', truth: `open issues=${openIssues}, active PTW=${activePtw}, 物料未到=${matsNotArrived}` },
    { q: `而家有幾多個未解決（open）問題？`, truth: `${openIssues} open / ${allIssues} total` },
    { q: '邊個分區進度最落後？', truth: '由 progress data 推（四區 sim 數據）' },
    { q: '有幾多張物料未到貨？', truth: `${matsNotArrived} / ${mats.length} 未到` },
    { q: '依家有幾多張工作許可證生效中？', truth: `${activePtw} active (共 ${ptws.length})` },
    { q: '有冇待批核嘅文件或審批？', truth: 'SI/VO/PTW sim 已全部批核完 → 預期 0 待批' },
    { q: '今日有幾多人寫咗施工日誌？', truth: `${dailiesToday} 篇 (今日)` },
    { q: '聯絡人通訊錄有幾多個聯絡人？', truth: `${contacts} 個` },
  ]
  const out = []
  for (const item of QUESTIONS) {
    process.stdout.write(`\nQ: ${item.q}\n  truth: ${item.truth}\n`)
    const a = await askAI(item.q)
    process.stdout.write(`  tools: ${a.tools.join(',') || '(none)'}\n  AI: ${a.text.replace(/\n/g, ' ').slice(0, 300)}\n`)
    out.push({ question: item.q, expected_truth: item.truth, ai_tools: a.tools, ai_answer: a.text })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fp = path.join(__dirname, '..', '..', '.planning', 'sim-runs', `ai-queries-${ts}.json`)
  fs.writeFileSync(fp, JSON.stringify({ ts, project: '[TEST]', ground_truth: { openIssues, allIssues, matsNotArrived, matsTotal: mats.length, contacts, dailiesToday, activePtw, ptwTotal: ptws.length, events }, queries: out }, null, 2))
  console.log('\noutput →', fp)
})()
