// Module registry. The app ships 13 surfaces; an admin can switch any one (bar
// 進度, the non-disableable core) OFF per project. This module is the single
// source of truth that ties each module key to its zh-HK label, its lucide
// icon, and — where it lives — its route path / ProjectDetail tab id. The
// catalogue order here is also the canonical 13-key order used by the
// get_project_modules RPC and the admin toggle list.
//
// "Absence = enabled" backwards-compat lives in the DB (project_module_enabled
// coalesces a missing row to true). On the client, useModules() likewise treats
// unknown/loading keys as enabled so nothing hides until data says OFF.

export type ModuleKey =
  | 'progress'
  | 'issues'
  | 'si'
  | 'vo'
  | 'ptw'
  | 'weather'
  | 'documents'
  | 'materials'
  | 'contacts'
  | 'timetable'
  | 'dailies'
  | 'equipment'
  | 'cleansing'
  | 'ncr'
  | 'risc'
  | 'labour'
  | 'assistant'

export interface ModuleDef {
  key: ModuleKey
  labelZh: string
  icon: string            // lucide-react component name
  route?: string          // path suffix under /project/:id (e.g. 'si', 'weather')
  tabId?: string          // ProjectDetail tab id for in-page surfaces
  core?: boolean          // non-disableable (always-on); 進度 only
}

// Canonical catalogue — order is load-bearing (admin toggle list + RPC output).
// progress / issues / si-vo / assistant render as ProjectDetail tabs; the rest
// are their own /project/:id/* routes reached from the 工具 (tools) tab.
export const MODULES: ModuleDef[] = [
  { key: 'progress', labelZh: '進度', icon: 'ListChecks', tabId: 'progress', core: true },
  { key: 'issues', labelZh: '問題', icon: 'AlertCircle', tabId: 'issues' },
  { key: 'si', labelZh: '工地指令', icon: 'FileText', route: 'si' },
  { key: 'vo', labelZh: '變更指令', icon: 'Receipt', route: 'vo' },
  { key: 'ptw', labelZh: '工作許可證', icon: 'Shield', route: 'ptw' },
  { key: 'weather', labelZh: '天氣記錄', icon: 'CloudRain', route: 'weather' },
  { key: 'documents', labelZh: '文件', icon: 'FolderOpen', route: 'files' },
  { key: 'materials', labelZh: '物料', icon: 'Package', route: 'materials' },
  { key: 'contacts', labelZh: '聯絡人', icon: 'Contact', route: 'contacts' },
  { key: 'timetable', labelZh: '行事曆', icon: 'CalendarDays', route: 'timetable' },
  { key: 'dailies', labelZh: '每日日誌', icon: 'BookOpen', route: 'daily' },
  { key: 'equipment', labelZh: '機械 / 表格', icon: 'Wrench', route: 'equipment' },
  { key: 'cleansing', labelZh: '清潔檢查', icon: 'Sparkles', route: 'cleansing' },
  { key: 'ncr', labelZh: '不符合事項', icon: 'ClipboardX', route: 'ncr' },
  { key: 'risc', labelZh: '申請檢查', icon: 'ClipboardCheck', route: 'risc' },
  { key: 'labour', labelZh: '勞工人力', icon: 'UsersRound', route: 'labour' },
  { key: 'assistant', labelZh: '助理', icon: 'Bot', tabId: 'assistant' },
]

export const MODULE_LABELS_ZH: Record<ModuleKey, string> = {
  progress: '進度',
  issues: '問題',
  si: '工地指令',
  vo: '變更指令',
  ptw: '工作許可證',
  weather: '天氣記錄',
  documents: '文件',
  materials: '物料',
  contacts: '聯絡人',
  timetable: '行事曆',
  dailies: '每日日誌',
  equipment: '機械 / 表格',
  cleansing: '清潔檢查',
  ncr: '不符合事項',
  risc: '申請檢查',
  labour: '勞工人力',
  assistant: '助理',
}
