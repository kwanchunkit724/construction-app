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
