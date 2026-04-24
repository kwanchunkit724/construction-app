export type Role = 'super-admin' | 'pm' | 'pe' | 'cp' | 'foreman' | 'worker' | 'sub-supervisor' | 'qs' | 'site-agent' | 'doc-controller' | 'qc' | 'procurement' | 'er'

// ── Project modules (feature flags set by super-admin) ────────────────────────
export type ProjectModule =
  | 'progress'      // 進度追蹤
  | 'issues'        // 問題追蹤
  | 'safety'        // 安全管理 (PTW / Toolbox / 安全觀察)
  | 'diary'         // 每日日誌
  | 'materials'     // 物料管理
  | 'documents'     // 文件管理 (圖則 / 提交文件)
  | 'qc'            // 質量管理 (NCR)
  | 'procurement'   // 採購管理 (BOQ / VO)

export const ALL_MODULES: { key: ProjectModule; label: string; desc: string }[] = [
  { key: 'progress',    label: '進度追蹤',   desc: 'WBS 進度樹、里程碑' },
  { key: 'issues',      label: '問題追蹤',   desc: '現場問題上報與跟進' },
  { key: 'safety',      label: '安全管理',   desc: 'PTW、工具箱會議、安全觀察' },
  { key: 'diary',       label: '每日日誌',   desc: '施工日誌與出勤記錄' },
  { key: 'materials',   label: '物料管理',   desc: '物料申請與庫存' },
  { key: 'documents',   label: '文件管理',   desc: '圖則登記冊、提交文件' },
  { key: 'qc',          label: '質量管理',   desc: 'NCR 質量不符合報告' },
  { key: 'procurement', label: '採購管理',   desc: 'BOQ、變更令、訂單' },
]

// ── Projects ─────────────────────────────────────────────────────────────────
export interface ProjectZone {
  id: string    // short code, e.g. 'ZA', 'T1', 'B'
  name: string  // display name, e.g. 'A區主樓', '1號樓', '地牢'
  type: 'tower' | 'podium' | 'basement' | 'carpark' | 'external'
}

export interface Project {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: string
  status: 'active' | 'completed' | 'archived'
  // Project details
  projectType: 'building' | 'civil' | 'renovation' | 'infrastructure'
  numBlocks: number            // number of towers / buildings
  hasBasement: boolean
  numBasementLevels: number    // 0 if none
  zones: ProjectZone[]         // PM-defined zone breakdown
  enabledModules: ProjectModule[]  // super-admin controlled feature flags
  client?: string
  startDate?: string
  targetEndDate?: string
  contractValue?: number       // HKD
  siteAddress?: string
}

// ── Issue Reporting ───────────────────────────────────────────────────────────
export interface IssueReport {
  id: string
  projectId: string
  category: string
  severity: 'normal' | 'serious' | 'urgent'
  location: string
  drawingRef: string
  description: string
  submittedBy: string
  submittedByName: string
  submittedByRole: Role
  submittedAt: string
  status: 'open' | 'in-progress' | 'resolved' | 'closed'
  comments: IssueComment[]
  notifyIds: string[]
  photos?: string[]
  /** Which tier is currently responsible for this issue */
  currentTier: 'sub-supervisor' | 'foreman-pe' | 'pm'
}

export interface IssueComment {
  id: string
  authorId: string
  authorName: string
  authorRole: Role
  body: string
  createdAt: string
}

// ── Pending Registration ──────────────────────────────────────────────────────
export interface PendingUser {
  id: string
  username: string
  email: string       // real email used for Supabase auth
  password?: string   // not stored in Supabase; kept optional for backward compat
  name: string
  role: Role
  roleZh: string
  company: string
  trade: string
  requestedAt: string
  projectId: string   // project the user is applying to join
}

// ── Progress Tracking ────────────────────────────────────────────────────────
export type ProgressStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'

export interface ProgressItem {
  id: string
  projectId: string
  code: string
  title: string
  zone: string
  parentId: string | null   // null = Level 1 root
  level: number
  plannedStart: string
  plannedEnd: string
  plannedProgress: number   // 0-100
  actualProgress: number    // 0-100, auto-calculated from floors when trackingMode === 'floors'
  status: ProgressStatus
  /** Primary managers (PE / Foreman) — can update & delegate children */
  ownedBy: string[]
  /** Sub-supervisors with update rights on this specific item */
  delegatedTo: string[]
  notes: string
  lastUpdatedBy: string     // user name
  lastUpdatedAt: string     // ISO date-time
  /** How progress is tracked for this item */
  trackingMode: 'percentage' | 'floors'
  /** Ordered list of floor labels e.g. ['B2','B1','GF','1F','2F'] — floors mode only */
  floorLabels: string[]
  /** Which floor labels have been marked complete — floors mode only */
  floorsCompleted: string[]
}

// ── Site Messages (communication layer) ────────────────────────────────────
export type MessageType = 'progress-report' | 'issue-report' | 'general'

export interface SiteMessage {
  id: string
  type: MessageType
  from: string        // user ID
  fromName: string
  fromRole: Role
  to: string[]        // user IDs
  toNames: string[]
  subject: string
  body: string
  zone?: string
  progressRef?: string  // ProgressItem id
  sentAt: string
  readBy: string[]      // user IDs who have opened it
  attachments?: string[]
}

export interface Zone {
  id: string
  name: string
  nameEn: string
  progress: number
  planned: number
  status: 'on-track' | 'behind' | 'critical' | 'completed'
  lead: string
}

export interface SCurvePoint {
  month: string
  planned: number
  actual: number | null
}

export interface DailyReport {
  id: string
  date: string
  zone: string
  author: string
  manpower: number
  summary: string
  weatherCode: string
  status: 'submitted' | 'approved' | 'pending'
  issues: number
}

export interface Drawing {
  id: string
  drawingNo: string
  title: string
  revision: string
  uploadDate: string
  uploadedBy: string
  zone: string
  discipline: 'structural' | 'architectural' | 'mep' | 'civil'
  status: 'current' | 'superseded' | 'under-review'
}

export interface PTW {
  id: string
  ptwNo: string
  workType: string
  location: string
  applicant: string
  startTime: string
  endTime: string
  riskLevel: 'low' | 'medium' | 'high'
  status: 'pending' | 'active' | 'completed' | 'expired' | 'rejected'
  hazards: string[]
}

export interface SafetyObservation {
  id: string
  date: string
  inspector: string
  zone: string
  category: string
  finding: string
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'closed' | 'in-progress'
}

export interface NearMissReport {
  id: string
  reportDate: string
  zone: string
  category: string
  description: string
  anonymous: boolean
  status: 'new' | 'investigating' | 'closed'
}

export interface Worker {
  id: string
  name: string
  trade: string
  company: string
  checkedIn: boolean
  checkInTime?: string
  zone?: string
}

export interface Material {
  id: string
  name: string
  unit: string
  onHand: number
  required: number
  ordered: number
  status: 'sufficient' | 'low' | 'critical'
}

export interface Task {
  id: string
  title: string
  zone: string
  assignee: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'pending' | 'in-progress' | 'done' | 'blocked'
  dueDate: string
  description: string
}

export interface Notification {
  id: string
  type: 'issue' | 'safety' | 'progress' | 'material' | 'approval'
  title: string
  body: string
  time: string
  read: boolean
  priority: 'low' | 'medium' | 'high'
}

export interface Milestone {
  id: string
  name: string
  dueDate: string
  status: 'completed' | 'on-track' | 'at-risk' | 'overdue'
}

export interface Issue {
  id: string
  issueNo: string
  title: string
  zone: string
  reportedBy: string
  reportDate: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in-progress' | 'resolved' | 'closed'
  category: string
}

export interface IncidentTrendPoint {
  month: string
  nearMiss: number
  minorInjury: number
  observation: number
}

// ── PTW (Permit to Work) ─────────────────────────────────────────────────────
export interface PTWRequest {
  id: string
  projectId: string
  ptwNo: string
  workType: string
  location: string
  zone: string
  description: string
  hazards: string[]
  requiredPPE: string[]
  requestedBy: string
  requestedByName: string
  requestedAt: string
  startTime: string
  endTime: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'expired'
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  rejectionReason?: string
  conditions?: string
  acknowledgedBy: string[]
  closedBy?: string
  closedAt?: string
}

// ── Toolbox Talk ─────────────────────────────────────────────────────────────
export interface ToolboxTalk {
  id: string
  projectId: string
  date: string
  conductedBy: string
  conductedByName: string
  topic: string
  attendeeNames: string[]
  duration: number
  notes: string
}

// ── NCR (Non-Conformance Report) ─────────────────────────────────────────────
export interface NCR {
  id: string
  projectId: string
  ncrNo: string
  date: string
  raisedBy: string
  raisedByName: string
  zone: string
  workItem: string
  description: string
  severity: 'minor' | 'major' | 'critical'
  photos: string[]
  status: 'open' | 'corrective-action' | 'verification' | 'closed'
  correctiveAction?: string
  correctiveActionBy?: string
  correctiveDueDate?: string
  closedAt?: string
}

// ── Daily Diary ───────────────────────────────────────────────────────────────
export interface DailyDiary {
  id: string
  projectId: string
  date: string
  authorId: string
  authorName: string
  zone: string
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy'
  temperature: number
  manpowerTotal: number
  equipment: string
  workDone: string
  issues: string
  status: 'draft' | 'submitted'
}

// ── Material Request ──────────────────────────────────────────────────────────
export interface MaterialRequest {
  id: string
  projectId: string
  requestNo: string
  requestedBy: string
  requestedByName: string
  requestedByRole: Role
  requestedAt: string
  zone: string
  items: { material: string; unit: string; quantity: number; urgency: 'normal' | 'urgent' }[]
  status: 'pending' | 'approved' | 'ordered' | 'delivered' | 'rejected'
  approvedBy?: string
  orderedAt?: string
  expectedDelivery?: string
  deliveredAt?: string
  notes: string
}

// ── BOQ Item ─────────────────────────────────────────────────────────────────
export interface BOQItem {
  id: string
  projectId: string
  code: string
  description: string
  unit: string
  contractQty: number
  rate: number
  contractAmount: number
  completedQty: number
  completedAmount: number
}

// ── Variation Order ───────────────────────────────────────────────────────────
export interface VariationOrder {
  id: string
  projectId: string
  voNo: string
  description: string
  raisedBy: string
  raisedByName: string
  raisedAt: string
  amount: number
  type: 'addition' | 'omission' | 'substitution'
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  approvedBy?: string
  approvedAt?: string
}

// ── Drawing Register ──────────────────────────────────────────────────────────
export interface DrawingRegisterItem {
  id: string
  projectId: string
  drawingNo: string
  title: string
  discipline: 'structural' | 'architectural' | 'mep' | 'civil'
  revision: string
  issueDate: string
  receivedDate: string
  status: 'current' | 'superseded' | 'under-review'
  distributedTo: string[]
}

// ── Submittal ─────────────────────────────────────────────────────────────────
export interface Submittal {
  id: string
  projectId: string
  submittalNo: string
  title: string
  category: string
  submittedBy: string
  submittedAt: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'resubmit'
  remarks?: string
}
