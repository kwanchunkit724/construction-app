// =============================================================
// supabase/functions/ai-assistant/tools.ts   (Phase 1 — read tools)
// =============================================================
// READ-only tools, executed AS THE USER (the supa client carries their JWT), so
// every query is RLS-bounded: get_visible_progress_items already returns a
// 判頭 only their slice, search_documents only docs they may see, etc. — the
// model cannot read past the human's ceiling (AI-ASSISTANT-PLAN §2.3, §3.1).
// Results are trimmed (selected columns / capped rows) for token control (§4.4).
//
// Phase 1 exposes all read tools to every role (reads are gated by RLS, not the
// tool filter). The role-based tool FILTER kicks in for mutate tools in Phase 2.
// =============================================================

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import type { ToolDef } from './provider.ts'

type Supa = SupabaseClient

const CAP = 60 // hard row cap per read tool

function pick<T extends Record<string, unknown>>(o: T, keys: string[]) {
  const r: Record<string, unknown> = {}
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) r[k] = o[k]
  return r
}

// True total via a head-only exact count (RLS-bounded, same as the read). Lets a
// "how many X" answer come from total_count instead of the model counting the
// (≤CAP) items — which under-reports once a list exceeds the row cap.
async function tableCount(supa: Supa, table: string, projectId: string, eq?: Record<string, unknown>): Promise<number | null> {
  let q = supa.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId)
  for (const [k, v] of Object.entries(eq ?? {})) q = q.eq(k, v as any)
  const { count } = await q
  return count ?? null
}
// Wrap a capped row list with the TRUE total. The model is told (system prompt
// rule 9) to answer counts from total_count, never by counting items.
function capped(items: unknown[], total: number | null) {
  const t = total == null ? items.length : total
  return { total_count: t, showing: items.length, truncated: t > items.length, items }
}

// v59 gates 11 feature tables on project_module_enabled(project_id,'<key>'). When
// a module is OFF the underlying read returns [] (RLS) — indistinguishable from
// "nothing on site". moduleEnabled() asks the existing RPC so a gated read tool
// can instead return { module_disabled: true, module } and the model knows WHY.
// Absence of an override row = enabled (the RPC coalesces to true), and on any
// RPC error we fail OPEN (treat as enabled) so a transient hiccup degrades to the
// pre-existing []-behaviour rather than a false "module off".
type ModuleKey = 'issues' | 'documents' | 'contacts' | 'materials' | 'timetable' | 'dailies'
async function moduleEnabled(supa: Supa, projectId: string, key: ModuleKey): Promise<boolean> {
  const { data, error } = await supa.rpc('project_module_enabled', { p_project_id: projectId, p_module_key: key })
  if (error) return true
  return data !== false
}
function moduleDisabled(key: ModuleKey) { return { module_disabled: true, module: key } }

export const READ_TOOLS: ToolDef[] = [
  {
    name: 'get_progress_tree',
    description: '讀取使用者可見嘅進度項目（大項/細項）。判頭/工人只會見到自己被指派嘅部分（RLS 已收窄）。可選 status 篩選。',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['delayed', 'blocked', 'in_progress', 'not_started', 'done'], description: '只取呢個狀態' } }, additionalProperties: false },
  },
  {
    name: 'get_timetable_window',
    description: '讀取時間表（物料到貨、工序計劃完工、會議/巡查事件）一段時間內嘅項目。預設由今日起 14 日。',
    input_schema: { type: 'object', properties: { from_days: { type: 'integer', description: '由今日起偏移幾多日（預設 0）' }, to_days: { type: 'integer', description: '到今日起幾多日（預設 14）' } }, additionalProperties: false },
  },
  {
    name: 'list_materials',
    description: '讀取物料訂單。only_late=true 只列「已落單但過咗預計到貨日仲未到」。',
    input_schema: { type: 'object', properties: { only_late: { type: 'boolean' } }, additionalProperties: false },
  },
  {
    name: 'list_open_issues',
    description: '讀取未解決（open）嘅問題/跟進。按項目權限（RLS）。',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_documents',
    description: '搵文件/圖紙。可按 query（標題或編號關鍵字）同 document_type 篩選。回傳每份文件最新版本嘅狀態。唔會回傳檔案連結 — 用 get_document_link 攞。',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, document_type: { type: 'string', enum: ['material_submission', 'method_statement', 'drawing', 'inspection', 'other'] } }, additionalProperties: false },
  },
  {
    name: 'get_document_link',
    description: '為一個 document_version 產生 10 分鐘有效嘅簽署下載連結。只有使用者本身有權睇嗰份文件先 mint 到（storage RLS）。',
    input_schema: { type: 'object', properties: { version_id: { type: 'string', description: 'document_versions.id' } }, required: ['version_id'], additionalProperties: false },
  },
  {
    name: 'list_pending_reviews',
    description: '讀取「等緊我審批」嘅文件版本（跨項目）。',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_contacts',
    description: '讀取項目聯絡人（判頭/供應商電話等）。',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_dailies',
    description: '讀取最近嘅施工日誌。預設最近 7 日。',
    input_schema: { type: 'object', properties: { days: { type: 'integer' } }, additionalProperties: false },
  },
  {
    name: 'list_ptw',
    description: '讀取工作許可證（PTW / 工作許可）。可選 status 篩選（如 active=生效中、expired=已過期、in_review=審批中、closed_out=已關閉）。回傳 total_count（總數）+ 列表。問「幾多張 PTW／幾多張生效中／邊張到期」用呢個（唔好用 get_daily_brief 當總數）。',
    input_schema: { type: 'object', properties: { status: { type: 'string', description: "PTW 狀態：active/expired/in_review/draft/closed_out 等" } }, additionalProperties: false },
  },
  {
    name: 'get_weather_outlook',
    description: '讀取香港天文台未來 9 日天氣預測 + 現時警告 + 大致天氣情況/熱帶氣旋消息。用嚟提前提醒地盤預防（大雨→清渠/物料加蓋/停批盪；大風或颱風→綁棚架網/收起易吹落街物件/固定塔吊；酷熱→防中暑調工時）。',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_daily_brief',
    description: '每日工地概況：一次過攞返呢個項目最需要跟進嘅嘢——未有施工方案（method statement）嘅工序、待處理問題、即將到期工作許可證、過期未到物料、待審文件。用嚟答「今日概況／有咩要跟進／有咩風險」。範圍係使用者眼前嘅項目（RLS 已收窄）。',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'recall_memory',
    description: '喺地盤記憶圖（由本項目嘅進度/文件/問題/聯絡人/項目本身衍生出嘅 memory_notes）入面搵返相關記憶。可選 query（標題/摘要/標籤關鍵字模糊比對）；唔填就攞晒。用嚟快速憶起「呢個地盤之前發生過咩」。RLS 已收窄到你可見嘅項目。',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: '關鍵字（比對標題/摘要/標籤）；留空攞晒' } }, additionalProperties: false },
  },
  {
    name: 'graph_neighbors',
    description: '由一個實體（entity_type + entity_id）出發，喺地盤記憶圖一跳行到佢直接連住嘅鄰居（連 edge_type，例如 governing/parent/belongs_to），一個 call 就睇晒關聯實體。entity_type 係 progress/document/issue/contact/project 之一，entity_id 係嗰個來源資料列嘅 id。RLS 已收窄到你可見嘅項目。',
    input_schema: { type: 'object', properties: { entity_type: { type: 'string', enum: ['progress', 'document', 'issue', 'contact', 'project'], description: '實體類型' }, entity_id: { type: 'string', description: '來源資料列嘅 id' } }, required: ['entity_type', 'entity_id'], additionalProperties: false },
  },
]

// All read tools are exposed to every role in Phase 1 (RLS does the narrowing).
export function exposedTools(_role: string | null): ToolDef[] { return READ_TOOLS }

export async function executeReadTool(supa: Supa, projectId: string, name: string, input: any): Promise<unknown> {
  switch (name) {
    case 'get_progress_tree': {
      const { data, error } = await supa.rpc('get_visible_progress_items', { p_project_id: projectId })
      if (error) return { error: error.message }
      let rows = (data ?? []) as Record<string, unknown>[]
      if (input?.status) rows = rows.filter((r) => r.status === input.status)
      const items = rows.slice(0, CAP).map((r) => pick(r, [
        'id', 'parent_id', 'code', 'title', 'status', 'tracking_mode', 'planned_start', 'planned_end',
        'planned_progress', 'actual_progress', 'floor_labels', 'floors_completed', 'qty_total', 'qty_done', 'qty_unit',
        'blocked_reason', 'assigned_to', 'delegated_to', 'zone_id',
      ]))
      return capped(items, rows.length)
    }
    case 'get_timetable_window': {
      if (!(await moduleEnabled(supa, projectId, 'timetable'))) return moduleDisabled('timetable')
      const now = Date.now()
      const from = new Date(now + (Number(input?.from_days ?? 0)) * 864e5).toISOString()
      const to = new Date(now + (Number(input?.to_days ?? 14)) * 864e5).toISOString()
      const { data, error } = await supa.rpc('get_timetable', { p_project_id: projectId, p_from: from, p_to: to })
      if (error) return { error: error.message }
      return ((data ?? []) as Record<string, unknown>[]).slice(0, CAP)
    }
    case 'list_materials': {
      if (!(await moduleEnabled(supa, projectId, 'materials'))) return moduleDisabled('materials')
      const { data, error } = await supa.from('materials')
        .select('id, name, unit, qty_needed, qty_arrived, status, planned_arrival_at, arrived_at, urgent, notes')
        .eq('project_id', projectId).order('planned_arrival_at', { ascending: true, nullsFirst: false }).limit(CAP)
      if (error) return { error: error.message }
      const nowIso = new Date().toISOString()
      let rows = (data ?? []) as Record<string, any>[]
      rows = rows.map((r) => ({ ...r, late: r.status === 'requested' && r.planned_arrival_at && r.planned_arrival_at < nowIso }))
      if (input?.only_late) rows = rows.filter((r) => r.late)
      const total = await tableCount(supa, 'materials', projectId)
      const reqC = await tableCount(supa, 'materials', projectId, { status: 'requested' })
      const partC = await tableCount(supa, 'materials', projectId, { status: 'partial' })
      return { total_count: total, not_arrived_count: (reqC ?? 0) + (partC ?? 0), showing: rows.length, truncated: (total ?? 0) > rows.length, items: rows }
    }
    case 'list_open_issues': {
      if (!(await moduleEnabled(supa, projectId, 'issues'))) return moduleDisabled('issues')
      const total = await tableCount(supa, 'issues', projectId, { status: 'open' })
      const { data, error } = await supa.from('issues')
        .select('id, title, description, status, current_handler_role, reporter_role, created_at')
        .eq('project_id', projectId).eq('status', 'open').order('created_at', { ascending: false }).limit(CAP)
      return error ? { error: error.message } : capped(data ?? [], total)
    }
    case 'search_documents': {
      if (!(await moduleEnabled(supa, projectId, 'documents'))) return moduleDisabled('documents')
      let q = supa.from('documents')
        .select('id, title, doc_number, document_type, current_version_id, review_due_date')
        .eq('project_id', projectId).limit(CAP)
      if (input?.document_type) q = q.eq('document_type', input.document_type)
      if (input?.query) {
        // strip PostgREST or-grammar metachars (, ( ) * %) so a query like
        // "天面 (排水)" can't corrupt the filter list.
        const term = String(input.query).replace(/[,()*%]/g, ' ').trim()
        if (term) q = q.or(`title.ilike.%${term}%,doc_number.ilike.%${term}%`)
      }
      const { data: docs, error } = await q
      if (error) return { error: error.message }
      const verIds = (docs ?? []).map((d: any) => d.current_version_id).filter(Boolean)
      let vers: Record<string, any> = {}
      if (verIds.length) {
        const { data: vd } = await supa.from('document_versions')
          .select('id, version_no, status, revision_label').in('id', verIds)
        for (const v of vd ?? []) vers[v.id] = v
      }
      const total = await tableCount(supa, 'documents', projectId, input?.document_type ? { document_type: input.document_type } : undefined)
      const mapped = (docs ?? []).map((d: any) => ({
        ...pick(d, ['id', 'title', 'doc_number', 'document_type', 'current_version_id', 'review_due_date']),
        current_version: d.current_version_id ? vers[d.current_version_id] ?? null : null,
      }))
      return capped(mapped, total)
    }
    case 'get_document_link': {
      if (!(await moduleEnabled(supa, projectId, 'documents'))) return moduleDisabled('documents')
      if (!input?.version_id) return { error: 'version_id required' }
      const { data: v, error } = await supa.from('document_versions')
        .select('id, bucket_id, file_path, version_no, status').eq('id', input.version_id).maybeSingle()
      if (error) return { error: error.message }
      if (!v) return { error: '搵唔到版本或者你冇權睇' }
      const { data: signed, error: se } = await supa.storage.from(v.bucket_id).createSignedUrl(v.file_path, 600)
      if (se) return { error: se.message }
      return { version_no: v.version_no, status: v.status, url: signed?.signedUrl, expires_in_sec: 600 }
    }
    case 'list_pending_reviews': {
      const { data, error } = await supa.rpc('list_my_pending_reviews')
      if (error) return { error: error.message }
      const all = (data ?? []) as unknown[]
      return capped(all.slice(0, CAP), all.length)
    }
    case 'list_contacts': {
      if (!(await moduleEnabled(supa, projectId, 'contacts'))) return moduleDisabled('contacts')
      const total = await tableCount(supa, 'contacts', projectId)
      const { data, error } = await supa.from('contacts')
        .select('id, name, trade, phone, notes').eq('project_id', projectId).order('trade').limit(CAP)
      return error ? { error: error.message } : capped(data ?? [], total)
    }
    case 'get_dailies': {
      if (!(await moduleEnabled(supa, projectId, 'dailies'))) return moduleDisabled('dailies')
      const days = Math.max(1, Math.min(30, Number(input?.days ?? 7)))
      const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
      const { count: total } = await supa.from('dailies').select('id', { count: 'exact', head: true })
        .eq('project_id', projectId).gte('date', since)
      const { data, error } = await supa.from('dailies')
        .select('id, date, weather, notes, freeform_items, progress_item_ids, user_id')
        .eq('project_id', projectId).gte('date', since).order('date', { ascending: false }).limit(CAP)
      return error ? { error: error.message } : capped(data ?? [], total ?? null)
    }
    case 'list_ptw': {
      const total = await tableCount(supa, 'permits_to_work', projectId, input?.status ? { status: input.status } : undefined)
      let q = supa.from('permits_to_work')
        .select('id, number, ptw_type, status, activated_at, expires_at')
        .eq('project_id', projectId).order('expires_at', { ascending: true, nullsFirst: false }).limit(CAP)
      if (input?.status) q = q.eq('status', input.status)
      const { data, error } = await q
      return error ? { error: error.message } : capped(data ?? [], total)
    }
    case 'get_weather_outlook': {
      const base = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php'
      const [fnd, flw, ws] = await Promise.all([
        fetch(`${base}?dataType=fnd&lang=tc`).then((r) => r.json()).catch(() => ({})),
        fetch(`${base}?dataType=flw&lang=tc`).then((r) => r.json()).catch(() => ({})),
        fetch(`${base}?dataType=warnsum&lang=tc`).then((r) => r.json()).catch(() => ({})),
      ])
      const forecast = (fnd?.weatherForecast ?? []).slice(0, 9).map((d: any) => ({
        date: d.forecastDate, week: d.week, weather: d.forecastWeather, wind: d.forecastWind,
        max: d.forecastMaxtemp?.value, min: d.forecastMintemp?.value, psr: d.PSR,
      }))
      const today_warnings = Object.values(ws ?? {}).filter((w: any) => w && w.actionCode !== 'CANCEL').map((w: any) => w.name)
      return {
        today_warnings,
        general_situation: fnd?.generalSituation ?? flw?.generalSituation ?? '',
        tc_info: flw?.tcInfo ?? '',
        outlook: flw?.outlook ?? '',
        forecast,
        updated: fnd?.updateTime ?? null,
      }
    }
    case 'get_daily_brief': {
      const { data, error } = await supa.rpc('get_daily_brief', { p_project_id: projectId })
      return error ? { error: error.message } : (data ?? {})
    }
    case 'recall_memory': {
      const term = input?.query != null ? String(input.query).trim() : ''
      const { data, error } = await supa.rpc('memory_recall', {
        p_project_id: projectId,
        p_query: term ? term : null,
      })
      if (error) return { error: error.message }
      return ((data ?? []) as Record<string, unknown>[]).slice(0, CAP).map((r) => pick(r, [
        'id', 'entity_type', 'entity_id', 'node_type', 'title', 'summary', 'tags', 'source_updated_at',
      ]))
    }
    case 'graph_neighbors': {
      if (!input?.entity_type || !input?.entity_id) return { error: 'entity_type 同 entity_id required' }
      const { data: note, error: ne } = await supa.from('memory_notes')
        .select('id')
        .eq('project_id', projectId)
        .eq('entity_type', input.entity_type)
        .eq('entity_id', input.entity_id)
        .maybeSingle()
      if (ne) return { error: ne.message }
      if (!note) return { error: '搵唔到呢個實體嘅記憶節點或者你冇權睇' }
      const { data, error } = await supa.rpc('graph_neighbors', { p_note_id: note.id })
      return error ? { error: error.message } : data
    }
    default:
      return { error: `unknown read tool ${name}` }
  }
}
