export type GlobalRole =
  | 'admin'
  | 'pm'
  | 'main_contractor'
  | 'subcontractor'
  | 'subcontractor_worker'
  | 'owner'

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
}

export const SUB_ROLE_ZH: Record<NonNullable<SubRole>, string> = {
  engineer: '工程師',
  foreman: '管工',
  safety: '安全部',
}

// ── Phase 3: Progress Tracking ──────────────────────────────
export type ProgressStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'

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
  last_updated_by: string | null
  last_updated_at: string
  created_at: string
}

export const PROGRESS_STATUS_ZH: Record<ProgressStatus, string> = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'delayed': '落後',
  'blocked': '受阻',
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
}

export function computeRollup(leaves: ProgressItem[]): Rollup {
  if (leaves.length === 0) {
    return { actual: 0, planned: 0, status: 'not-started', leafCount: 0 }
  }
  const actual = Math.round(leaves.reduce((s, x) => s + x.actual_progress, 0) / leaves.length)
  const planned = Math.round(leaves.reduce((s, x) => s + x.planned_progress, 0) / leaves.length)
  return { actual, planned, status: deriveStatus(actual, planned), leafCount: leaves.length }
}
