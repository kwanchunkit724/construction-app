export type GlobalRole =
  | 'admin'
  | 'pm'
  | 'main_contractor'
  | 'subcontractor'
  | 'subcontractor_worker'
  | 'owner'
  | 'safety_officer'
  | 'general_foreman'

export type SubRole = 'engineer' | 'foreman' | 'safety' | null

export type ProjectRole = Exclude<GlobalRole, 'admin'>

export type MembershipStatus = 'pending' | 'approved' | 'rejected'

export interface UserProfile {
  id: string
  phone: string
  name: string
  global_role: GlobalRole
  sub_role: SubRole
  company: string | null
  onesignal_id: string | null
  created_at: string
}

export interface Zone {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  zones: Zone[]
  assigned_pm_ids: string[]
  created_by: string | null
  created_at: string
}

export interface ProjectMember {
  id: string
  user_id: string
  project_id: string
  role: ProjectRole
  status: MembershipStatus
  applied_at: string
  approved_by: string | null
  approved_at: string | null
}

export const ROLE_ZH: Record<GlobalRole, string> = {
  admin: '系統管理員',
  pm: '項目經理 (PM)',
  main_contractor: '總承建商員工',
  subcontractor: '判頭',
  subcontractor_worker: '判頭工人',
  owner: '業主',
  safety_officer: '安全主任',
  general_foreman: '老總',
}

export const SUB_ROLE_ZH: Record<NonNullable<SubRole>, string> = {
  engineer: '工程師',
  foreman: '管工',
  safety: '安全部',
}

// ── Phase 3: Progress Tracking ──────────────────────────────
export type ProgressStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'
export type TrackingMode = 'percentage' | 'floors'

export interface ProgressItem {
  id: string
  project_id: string
  parent_id: string | null
  code: string
  title: string
  zone_id: string | null
  level: number
  planned_start: string | null
  planned_end: string | null
  planned_progress: number
  actual_progress: number
  status: ProgressStatus
  notes: string
  tracking_mode: TrackingMode
  floor_labels: string[]
  floors_completed: string[]
  assigned_to: string[]
  delegated_to: string[]
  last_updated_by: string | null
  last_updated_at: string
  created_at: string
}

export interface ProgressHistoryEntry {
  id: string
  item_id: string
  actual_progress: number
  floors_completed: string[]
  notes: string
  updated_by: string | null
  created_at: string
}

// Helper: compute progress from floors_completed
export function floorsToProgress(completed: string[], all: string[]): number {
  if (all.length === 0) return 0
  return Math.round((completed.length / all.length) * 100)
}

export const PROGRESS_STATUS_ZH: Record<ProgressStatus, string> = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'delayed': '落後',
  'blocked': '受阻',
}

// ── Schedule-derived planned progress ───────────────────────
// Where the PLAN says we should be today: linear from planned_start to
// planned_end, counting inclusive days (start day = day 1 of the span).
// e.g. start=Day1, end=Day15 (15-day span), today=Day3 → 3/15 = 20%.
// Before start → 0; on/after end → 100; no dates → 0 (treat as un-scheduled).
const MS_PER_DAY = 86400000
function dateOnlyMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
export function plannedProgressOf(
  item: { planned_start: string | null; planned_end: string | null },
  today: Date = new Date(),
): number {
  const { planned_start, planned_end } = item
  if (!planned_start || !planned_end) return 0
  const s = new Date(planned_start + 'T00:00:00').getTime()
  const e = new Date(planned_end + 'T00:00:00').getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return 0
  const t = dateOnlyMs(today)
  if (t < s) return 0
  const totalDays = Math.floor((e - s) / MS_PER_DAY) + 1 // inclusive
  if (totalDays <= 1) return t >= e ? 100 : 0
  const elapsedDays = Math.floor((t - s) / MS_PER_DAY) + 1 // start day counts as 1
  if (elapsedDays >= totalDays) return 100
  return Math.round((elapsedDays / totalDays) * 100)
}

// Schedule variance: actual − planned. Positive = 超前 (ahead), negative = 落後.
export function scheduleVariance(
  item: { planned_start: string | null; planned_end: string | null },
  actual: number,
  today: Date = new Date(),
): number {
  return actual - plannedProgressOf(item, today)
}
export function isScheduled(item: { planned_start: string | null; planned_end: string | null }): boolean {
  return !!item.planned_start && !!item.planned_end
}

// Auto-derive status from progress vs planned
export function deriveStatus(actual: number, planned: number): ProgressStatus {
  if (actual >= 100) return 'completed'
  if (actual === 0 && planned === 0) return 'not-started'
  if (actual === 0) return 'not-started'
  if (actual < planned - 5) return 'delayed'
  return 'in-progress'
}

// ── Roll-up helpers ─────────────────────────────────────────
// A leaf is an item with no children. Leaves carry manual progress.
// Non-leaves (and zones) aggregate progress from descendant leaves.

export function isLeaf(item: ProgressItem, allItems: ProgressItem[]): boolean {
  return !allItems.some(i => i.parent_id === item.id)
}

export function getDescendantLeaves(allItems: ProgressItem[], parentId: string): ProgressItem[] {
  const directChildren = allItems.filter(i => i.parent_id === parentId)
  if (directChildren.length === 0) return []
  return directChildren.flatMap(c => {
    const grandChildren = allItems.filter(i => i.parent_id === c.id)
    return grandChildren.length === 0 ? [c] : getDescendantLeaves(allItems, c.id)
  })
}

export function getZoneLeaves(allItems: ProgressItem[], zoneId: string): ProgressItem[] {
  // All level-1 items in this zone, then walk down to leaves
  const roots = allItems.filter(i => i.parent_id === null && i.zone_id === zoneId)
  return roots.flatMap(r => {
    const isRootLeaf = !allItems.some(i => i.parent_id === r.id)
    return isRootLeaf ? [r] : getDescendantLeaves(allItems, r.id)
  })
}

export interface Rollup {
  actual: number
  planned: number
  status: ProgressStatus
  leafCount: number
  scheduledCount: number
}

export function computeRollup(leaves: ProgressItem[], today: Date = new Date()): Rollup {
  if (leaves.length === 0) {
    return { actual: 0, planned: 0, status: 'not-started', leafCount: 0, scheduledCount: 0 }
  }
  const actual = Math.round(leaves.reduce((s, x) => s + x.actual_progress, 0) / leaves.length)
  // Planned is schedule-derived, averaged over SCHEDULED leaves only — un-scheduled
  // leaves (no dates) would otherwise count as 0% and falsely drag the parent's
  // planned down, fabricating a 超前 / on-plan reading. Actual still spans all leaves.
  const sched = leaves.filter(isScheduled)
  const planned = sched.length
    ? Math.round(sched.reduce((s, x) => s + plannedProgressOf(x, today), 0) / sched.length)
    : 0
  return { actual, planned, status: deriveStatus(actual, planned), leafCount: leaves.length, scheduledCount: sched.length }
}

// ── Phase 4: Issue Tracking ─────────────────────────────────
export type IssueStatus = 'open' | 'resolved'
export type IssueHandlerRole = 'pm' | 'main_contractor' | 'subcontractor' | 'admin'
export type IssueAction = 'reported' | 'commented' | 'escalated' | 'resolved' | 'reopened'

export interface Issue {
  id: string
  project_id: string
  reporter_id: string
  reporter_role: GlobalRole
  title: string
  description: string
  photos: string[]
  current_handler_role: IssueHandlerRole
  status: IssueStatus
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface IssueComment {
  id: string
  issue_id: string
  author_id: string
  action: IssueAction
  body: string
  from_role: string | null
  to_role: string | null
  created_at: string
}

export const ISSUE_STATUS_ZH: Record<IssueStatus, string> = {
  open: '處理中',
  resolved: '已解決',
}

export const ISSUE_HANDLER_ZH: Record<IssueHandlerRole, string> = {
  pm: 'PM',
  main_contractor: '總承建商',
  subcontractor: '判頭',
  admin: '系統管理員',
}

export const ISSUE_ACTION_ZH: Record<IssueAction, string> = {
  reported: '報告問題',
  commented: '留言',
  escalated: '上呈',
  resolved: '標記為已解決',
  reopened: '重新開啟',
}

// Initial handler when an issue is reported (escalation routing)
export function getInitialHandler(reporterRole: GlobalRole): IssueHandlerRole {
  switch (reporterRole) {
    case 'subcontractor_worker': return 'subcontractor'
    case 'subcontractor': return 'main_contractor'
    case 'main_contractor': return 'pm'
    case 'owner': return 'pm'
    case 'pm': return 'pm'
    case 'admin': return 'pm'
    default: return 'pm'
  }
}

// Next handler when current escalates further. Null = terminal (no further escalation).
export function getNextHandler(current: IssueHandlerRole): IssueHandlerRole | null {
  switch (current) {
    case 'subcontractor': return 'main_contractor'
    case 'main_contractor': return 'pm'
    case 'pm': return null
    case 'admin': return null
    default: return null
  }
}

// ── Phase 1 (milestone): Drawings on Progress Items ─────────
export type DrawingStatus = 'current' | 'superseded' | 'withdrawn'

export interface Drawing {
  id: string
  project_id: string
  leaf_item_id: string
  title: string
  current_version_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DrawingVersion {
  id: string
  drawing_id: string
  version_no: number
  file_path: string
  thumb_path: string | null
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  revision_label: string | null
  status: DrawingStatus
  uploaded_by: string | null
  uploaded_at: string
  superseded_at: string | null
  withdrawn_at: string | null
}

export const DRAWING_STATUS_ZH: Record<DrawingStatus, string> = {
  current: '現行',
  superseded: '已取代',
  withdrawn: '已撤回',
}

// ── Phase 2 SI types ────────────────────────────────────────
// VO-side types land in Plan 02-06.

export type SiStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'locked'
  | 'revision_requested'
  | 'rejected'

export type ApprovalActionType =
  | 'approve'
  | 'approve_with_edits'
  | 'request_revision'
  | 'reject'
  | 'admin_override'
  | 'delegate'

export type LineItemCategory = 'labour' | 'material' | 'preliminaries' | 'contingency'

export interface SiPayload {
  title: string
  description: string
  drawing_version_ids: string[]
  photo_paths: string[]
  voice_path: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
}

export interface SI {
  id: string
  project_id: string
  number: string
  current_version_id: string | null
  chain_snapshot: ChainStep[] | null
  current_step: number
  status: SiStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  locked_at: string | null
}

export interface SIVersion {
  id: string
  si_id: string
  version_no: number
  payload: SiPayload
  edits_by: string
  created_at: string
}

export interface ProtestComment {
  id: string
  si_id: string
  author_id: string
  body: string
  created_at: string
}

export interface ChainStep {
  step_order: number
  required_role: GlobalRole
  optional_user_id: string | null
}

export interface Approval {
  id: string
  doc_type: 'si' | 'vo' | 'ptw'
  doc_id: string
  step_order: number
  action_type: ApprovalActionType
  actor_id: string
  delegated_for_user_id: string | null
  reason: string | null
  edits_jsonb: any | null
  created_at: string
}

export interface Delegation {
  id: string
  user_id: string
  delegate_to: string
  valid_from: string
  valid_until: string
  created_at: string
}

export interface NotificationDigestItem {
  doc_type: 'si' | 'vo' | 'ptw'
  doc_id: string
  project_id: string
  headline_zh: string
  deep_link: string
}

export const SI_STATUS_ZH: Record<SiStatus, string> = {
  draft: '草稿',
  submitted: '待批准',
  in_review: '審批中',
  approved: '已批准',
  locked: '已鎖定',
  revision_requested: '已退回',
  rejected: '已拒絕',
}

export const APPROVAL_ACTION_ZH: Record<ApprovalActionType, string> = {
  approve: '批准',
  approve_with_edits: '批准並修改',
  request_revision: '退回 (要求修訂)',
  reject: '拒絕',
  admin_override: '管理員介入',
  delegate: '已轉授',
}

export const LINE_ITEM_CATEGORY_ZH: Record<LineItemCategory, string> = {
  labour: '人工',
  material: '物料',
  preliminaries: '前期費用',
  contingency: '暫定',
}

// ── Phase 2 VO types ────────────────────────────────────────
// VO status enum mirrors SI status (same Chinese labels, same lifecycle).
// total_amount_cents is bigint in Postgres; in TS we type it as number
// (JS Number is safe up to 9e15 cents — well beyond any real HKD VO).

export type VoStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'locked'
  | 'revision_requested'
  | 'rejected'

export interface VoLineItem {
  category: LineItemCategory
  description: string
  quantity: number
  unit: string
  unit_price_cents: number
  subtotal_cents: number
  progress_leaf_item_id: string | null
}

export interface VoPayload {
  description: string
  line_items: VoLineItem[]
  total_amount_cents: number
}

export interface VO {
  id: string
  si_id: string | null
  project_id: string
  number: string
  current_version_id: string | null
  total_amount_cents: number
  chain_snapshot: ChainStep[] | null
  current_step: number
  status: VoStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  locked_at: string | null
}

export interface VOVersion {
  id: string
  vo_id: string
  version_no: number
  payload: VoPayload
  edits_by: string
  created_at: string
}

export const VO_STATUS_ZH: Record<VoStatus, string> = {
  draft: '草稿',
  submitted: '待批准',
  in_review: '審批中',
  approved: '已批准',
  locked: '已鎖定',
  revision_requested: '已退回',
  rejected: '已拒絕',
}

// ── Phase 3: PTW (Permit to Work) ───────────────────────────

export type PtwType =
  | 'hot_work'
  | 'work_at_height'
  | 'lifting'
  | 'confined_space'
  | 'excavation'
  | 'electrical'
  | 'scaffold'

export type PtwStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'active'
  | 'closed_out'
  | 'expired'
  | 'rejected'
  | 'revision_requested'

export interface PTW {
  id: string
  project_id: string
  number: string
  ptw_type: PtwType
  current_version_id: string | null
  chain_snapshot: unknown
  current_step: number
  status: PtwStatus
  created_by: string
  created_at: string
  submitted_at: string | null
  activated_at: string | null
  expires_at: string | null
  fire_watch_started_at: string | null
  closed_out_at: string | null
  locked_at: string | null
}

export interface PtwChecklistItem {
  key: string
  label_zh: string
  required: boolean
  value: boolean | null
}

export interface PtwPayload {
  description: string
  checklist: PtwChecklistItem[]
  ppe_photo_paths: string[]
  scene_photo_paths: string[]
  drawing_version_ids: string[]
  lat?: number
  lng?: number
  accuracy_m?: number
}

export interface PtwVersion {
  id: string
  ptw_id: string
  version_no: number
  payload: PtwPayload
  edits_by: string
  created_at: string
}

export interface PermitWorker {
  id: string
  ptw_id: string
  worker_name: string
  worker_phone: string | null
  worker_photo_path: string | null
  created_at: string
}

export interface PermitSignoff {
  id: string
  approval_id: string
  ptw_id: string
  signature_b64: string
  created_at: string
}

export interface PermitScan {
  id: string
  ptw_id: string
  scanned_by: string
  scanned_at: string
  jwt_payload_snapshot: Record<string, unknown>
}

export const PTW_TYPE_ZH: Record<PtwType, string> = {
  hot_work: '動火',
  work_at_height: '高空',
  lifting: '吊運',
  confined_space: '密閉空間',
  excavation: '掘地',
  electrical: '電力',
  scaffold: '棚架',
}

// PTW types shipping in v1; rest stub "敬請期待"
export const PTW_TYPE_V1: PtwType[] = ['hot_work', 'work_at_height', 'lifting']

export const PTW_STATUS_ZH: Record<PtwStatus, string> = {
  draft: '草稿',
  submitted: '待簽核',
  in_review: '簽核中',
  approved: '已批准',
  active: '生效中',
  closed_out: '已完工',
  expired: '已過期',
  rejected: '已拒絕',
  revision_requested: '已退回',
}

// ── v1.2 forwards ────────────────────────────────────────────
// Daily, Material, Event/Timetable shapes live alongside their
// owning context files so the lane that authored them stays the
// single source of truth. types.ts re-exports them so feature
// consumers can keep importing `from '../types'` like everything
// else in the codebase.

export { WEATHER_OPTIONS } from './types-daily'
export type { Daily, Weather, DailyPayload } from './types-daily'

export {
  MATERIAL_STATUS_ZH,
  MATERIAL_STATUS_BADGE_CLASS,
  isMaterialLate,
} from './types-material'
export type {
  Material,
  MaterialStatus,
  CreateMaterialInput,
  UpdateMaterialPatch,
} from './types-material'

export type { Event, TimetableEntry } from './types-timetable'

export type { Contact, ContactInput } from './types-contact'
export { TRADE_SUGGESTIONS } from './types-contact'
