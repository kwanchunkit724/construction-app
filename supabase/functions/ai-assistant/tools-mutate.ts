// =============================================================
// supabase/functions/ai-assistant/tools-mutate.ts   (Phase 2 — mutate tools)
// =============================================================
// MUTATING tools. Two walls (AI-ASSISTANT-PLAN §3.1):
//   1) exposure filter — exposedMutateTools(role) only hands the model the tools
//      the caller's project role may use (the model can't call what it can't see);
//   2) the executor runs the write AS THE USER (JWT) so RLS / SECURITY DEFINER
//      RPCs are the authoritative second wall (e.g. materials RLS still gates the
//      role, issues guard recomputes handler/status, dailies RLS locks to today).
// A mutate tool is NEVER auto-run: index.ts proposes it (confirm card) + persists
// ai_actions(status='proposed') and STOPS; execution happens on the confirm
// round-trip using the STORED args (client can't alter args between the two).
//
// Phase 2 set = clean INSERT/UPDATE tools. Progress-tick (P3/P4) is deferred to
// Phase 2.5 — it must mirror the client's progress_history write contract.
// =============================================================

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { ToolDef } from './provider.ts'

type Supa = SupabaseClient
export type Risk = 'low' | 'medium' | 'high' | 'destructive'

// ── role groups (membership role; admin/assigned-PM resolve to admin/pm) ──────
const MANAGERS = ['admin', 'pm', 'main_contractor', 'general_foreman', 'subcontractor']
const PLUS_SAFETY = [...MANAGERS, 'safety_officer']
const EVERYONE = [...PLUS_SAFETY, 'subcontractor_worker', 'owner']

interface MutateSpec {
  def: ToolDef
  risk: Risk
  allow: string[]                                   // membership roles permitted (admin always allowed)
  summary: (a: any) => string                        // zh-HK confirm-card line
  run: (supa: Supa, projectId: string, uid: string, a: any) => Promise<unknown>
}

const SPECS: Record<string, MutateSpec> = {
  create_event: {
    risk: 'medium', allow: PLUS_SAFETY,
    def: { name: 'create_event', description: '喺時間表加一個事件（會議/巡查/里程碑/其他）。', input_schema: { type: 'object', properties: { title: { type: 'string' }, starts_at: { type: 'string', description: 'ISO 時間' }, ends_at: { type: 'string' }, location: { type: 'string' }, event_type: { type: 'string', enum: ['meeting', 'inspection', 'milestone', 'other'] }, description: { type: 'string' } }, required: ['title', 'starts_at'], additionalProperties: false } },
    summary: (a) => `📅 新增事件「${a.title}」· ${fmt(a.starts_at)}${a.location ? ' · ' + a.location : ''}`,
    run: (s, p, uid, a) => s.from('events').insert({ project_id: p, title: a.title, starts_at: a.starts_at, ends_at: a.ends_at ?? null, location: a.location ?? null, event_type: a.event_type ?? 'other', description: a.description ?? null, created_by: uid }).select('id, title, starts_at').single(),
  },
  update_event: {
    risk: 'medium', allow: PLUS_SAFETY,
    def: { name: 'update_event', description: '改一個時間表事件（時間/標題/地點）。需要 event_id（先用 get_timetable_window 搵）。', input_schema: { type: 'object', properties: { event_id: { type: 'string' }, title: { type: 'string' }, starts_at: { type: 'string' }, ends_at: { type: 'string' }, location: { type: 'string' } }, required: ['event_id'], additionalProperties: false } },
    summary: (a) => `✏️ 修改事件 ${a.title ? '「' + a.title + '」' : ''}${a.starts_at ? ' → ' + fmt(a.starts_at) : ''}`,
    run: (s, _p, _uid, a) => { const patch: Record<string, unknown> = {}; for (const k of ['title', 'starts_at', 'ends_at', 'location']) if (a[k] !== undefined) patch[k] = a[k]; return s.from('events').update(patch).eq('id', a.event_id).select('id').single() },
  },
  create_issue: {
    risk: 'medium', allow: EVERYONE,
    def: { name: 'create_issue', description: '開一個問題/跟進。處理人同狀態由系統按你嘅角色自動決定。', input_schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title'], additionalProperties: false } },
    summary: (a) => `🛠️ 開問題「${a.title}」`,
    run: (s, p, uid, a) => s.from('issues').insert({ project_id: p, reporter_id: uid, title: a.title, description: a.description ?? '' }).select('id, title').single(),
  },
  add_issue_comment: {
    risk: 'low', allow: EVERYONE,
    def: { name: 'add_issue_comment', description: '喺一個問題加一句跟進備註。需要 issue_id（先用 list_open_issues 搵）。', input_schema: { type: 'object', properties: { issue_id: { type: 'string' }, body: { type: 'string' } }, required: ['issue_id', 'body'], additionalProperties: false } },
    summary: (a) => `💬 加備註：「${trunc(a.body)}」`,
    run: (s, _p, uid, a) => s.from('issue_comments').insert({ issue_id: a.issue_id, author_id: uid, action: 'commented', body: a.body }).select('id').single(),
  },
  order_material: {
    risk: 'medium', allow: MANAGERS,
    def: { name: 'order_material', description: '落一張物料訂單。', input_schema: { type: 'object', properties: { name: { type: 'string' }, unit: { type: 'string' }, qty_needed: { type: 'number' }, planned_arrival_at: { type: 'string', description: 'ISO 預計到貨時間' }, urgent: { type: 'boolean' } }, required: ['name', 'unit', 'qty_needed'], additionalProperties: false } },
    summary: (a) => `📦 落單：${a.qty_needed} ${a.unit} ${a.name}${a.planned_arrival_at ? ' · ' + fmt(a.planned_arrival_at) + '到' : ''}${a.urgent ? ' · 急' : ''}`,
    run: (s, p, uid, a) => s.from('materials').insert({ project_id: p, name: a.name, unit: a.unit, qty_needed: a.qty_needed, planned_arrival_at: a.planned_arrival_at ?? null, urgent: a.urgent ?? false, item_ids: [], requested_by: uid }).select('id, name, qty_needed').single(),
  },
  receive_material: {
    risk: 'medium', allow: MANAGERS,
    def: { name: 'receive_material', description: '更新某物料已到貨數量。需要 material_id（先用 list_materials 搵）。', input_schema: { type: 'object', properties: { material_id: { type: 'string' }, qty_arrived: { type: 'number' } }, required: ['material_id', 'qty_arrived'], additionalProperties: false } },
    summary: (a) => `📥 到貨更新：${a.qty_arrived}`,
    run: (s, _p, _uid, a) => s.from('materials').update({ qty_arrived: a.qty_arrived }).eq('id', a.material_id).select('id, qty_arrived, status').single(),
  },
  add_contact: {
    risk: 'low', allow: PLUS_SAFETY,
    def: { name: 'add_contact', description: '加一個項目聯絡人。', input_schema: { type: 'object', properties: { name: { type: 'string' }, trade: { type: 'string', description: '工種，例如 水電/泥水/紮鐵' }, phone: { type: 'string' }, notes: { type: 'string' } }, required: ['name', 'trade', 'phone'], additionalProperties: false } },
    summary: (a) => `📇 加聯絡人：${a.name}（${a.trade}）${a.phone}`,
    run: (s, p, uid, a) => s.from('contacts').insert({ project_id: p, name: a.name, trade: a.trade, phone: a.phone, notes: a.notes ?? null, created_by: uid }).select('id, name').single(),
  },
  // log_daily deferred: the dailies INSERT RLS gates on global_role='main_contractor'
  // AND sub_role IN ('foreman','engineer'), which doesn't map to the membership-role
  // exposure filter — it would offer a confirm card most roles' RLS then denies.
  // Re-add once the dailies policy is membership-role-aligned or the filter resolves
  // global_role + sub_role.
  set_progress_blocked: {
    risk: 'medium', allow: [...MANAGERS, 'subcontractor_worker'],
    def: { name: 'set_progress_blocked', description: '把一個進度項目標記為受阻（連原因），或者解除受阻（reason 留空）。唔會改變百分比。需要 item_id（先用 get_progress_tree 搵）。', input_schema: { type: 'object', properties: { item_id: { type: 'string' }, reason: { type: 'string', description: '受阻原因；留空 = 解除受阻' } }, required: ['item_id'], additionalProperties: false } },
    summary: (a) => a.reason && String(a.reason).trim() ? `🚧 標記受阻：${trunc(a.reason)}` : '✅ 解除受阻',
    run: async (s, _p, uid, a) => {
      const { data: item, error: e1 } = await s.from('progress_items').select('actual_progress').eq('id', a.item_id).maybeSingle()
      if (e1) return { data: null, error: e1 }
      if (!item) return { data: null, error: { message: '搵唔到項目或者你冇權' } }
      const reason = a.reason && String(a.reason).trim() ? String(a.reason).trim() : null
      const { error: e2 } = await s.from('progress_items').update({ blocked_reason: reason, last_updated_by: uid, last_updated_at: new Date().toISOString() }).eq('id', a.item_id)
      if (e2) return { data: null, error: e2 }
      await s.from('progress_history').insert({ item_id: a.item_id, actual_progress: (item as any).actual_progress, floors_completed: [], notes: reason ? `受阻：${reason}` : '解除受阻', updated_by: uid })
      return { data: { item_id: a.item_id, blocked: !!reason }, error: null }
    },
  },
  update_progress_percent: {
    risk: 'medium', allow: [...MANAGERS, 'subcontractor_worker'],
    def: { name: 'update_progress_percent', description: '更新一個百分比追蹤項目嘅完成度（0-100）。只適用於百分比追蹤；樓層/數量/單位追蹤嘅項目會拒絕（叫使用者喺進度表手動改）。需要 item_id。', input_schema: { type: 'object', properties: { item_id: { type: 'string' }, percent: { type: 'number', minimum: 0, maximum: 100 } }, required: ['item_id', 'percent'], additionalProperties: false } },
    summary: (a) => `📊 更新進度 → ${Math.round(Number(a.percent))}%`,
    run: async (s, _p, uid, a) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(a.percent))))
      const { data: item, error: e1 } = await s.from('progress_items').select('tracking_mode, planned_start, planned_end').eq('id', a.item_id).maybeSingle()
      if (e1) return { data: null, error: e1 }
      if (!item) return { data: null, error: { message: '搵唔到項目或者你冇權' } }
      const mode = (item as any).tracking_mode
      if (mode && mode !== 'percentage') return { data: null, error: { message: '呢項用緊樓層/數量/單位追蹤，請喺進度表手動更新' } }
      const status = deriveStatus(pct, plannedProgress((item as any).planned_start, (item as any).planned_end))
      const { error: e2 } = await s.from('progress_items').update({ actual_progress: pct, status, last_updated_by: uid, last_updated_at: new Date().toISOString() }).eq('id', a.item_id)
      if (e2) return { data: null, error: e2 }
      await s.from('progress_history').insert({ item_id: a.item_id, actual_progress: pct, floors_completed: [], notes: '', updated_by: uid })
      return { data: { item_id: a.item_id, percent: pct, status }, error: null }
    },
  },
}

export function exposedMutateTools(role: string | null): ToolDef[] {
  if (role === 'admin') return Object.values(SPECS).map((s) => s.def)
  return Object.values(SPECS).filter((s) => role && s.allow.includes(role)).map((s) => s.def)
}
export function isMutateTool(name: string): boolean { return name in SPECS }
export function mutateRisk(name: string): Risk { return SPECS[name]?.risk ?? 'medium' }
export function mutateSummary(name: string, args: any): string { try { return SPECS[name]?.summary(args) ?? name } catch { return name } }
export function mutateAllowed(name: string, role: string | null): boolean {
  if (role === 'admin') return true
  return !!role && !!SPECS[name] && SPECS[name].allow.includes(role)
}
export async function executeMutateTool(supa: Supa, projectId: string, uid: string, name: string, args: any): Promise<unknown> {
  const spec = SPECS[name]
  if (!spec) return { error: `unknown mutate tool ${name}` }
  const { data, error } = (await spec.run(supa, projectId, uid, args ?? {})) as { data: unknown; error: { message: string } | null }
  if (error) return { error: error.message }
  return { ok: true, ...(data as object) }
}

function fmt(iso?: string): string {
  if (!iso) return ''
  try {
    // Edge runtime is UTC — shift to HKT (+8) so the confirm card shows local time.
    const d = new Date(new Date(iso).getTime() + 8 * 3600e3)
    return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  } catch { return iso }
}
function trunc(s?: string, n = 20): string { return s && s.length > n ? s.slice(0, n) + '…' : (s ?? '') }

// Faithful ports of plannedProgressOf + deriveStatus from src/types.ts so an AI
// percentage tick stores the same status the human UI would (incl. 'delayed').
const MS_PER_DAY = 86400000
function plannedProgress(ps: string | null, pe: string | null): number {
  if (!ps || !pe) return 0
  const s = new Date(ps + 'T00:00:00').getTime(); const e = new Date(pe + 'T00:00:00').getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return 0
  const t = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  if (t < s) return 0
  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1
  if (totalDays <= 1) return t >= e ? 100 : 0
  const elapsed = Math.floor((t - s) / MS_PER_DAY) + 1
  if (elapsed >= totalDays) return 100
  return Math.round((elapsed / totalDays) * 100)
}
function deriveStatus(actual: number, planned: number): string {
  if (actual >= 100) return 'completed'
  if (actual === 0) return 'not-started'
  if (actual < planned - 5) return 'delayed'
  return 'in-progress'
}
