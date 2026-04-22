import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'
import {
  TrendingDown, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, DollarSign, Layers, ListTree,
  FolderPlus, UserCheck, MessageSquare, FolderOpen, Plus, Check, XCircle,
  Shield, ChevronDown, ChevronRight, Trash2, Building2, RefreshCw
} from 'lucide-react'
import Navbar from '../components/Navbar'
import ProgressTracker from '../components/ProgressTracker'
import IssueBoard from '../components/IssueBoard'
import { useProgress } from '../context/ProgressContext'
import { useAuth, ALL_PERMISSIONS } from '../context/AuthContext'
import { useIssues } from '../context/IssueContext'
import { useCost } from '../context/CostContext'
import type { ProjectZone } from '../types'
import { sCurveData } from '../data/mockData'

type PMTab = 'dashboard' | 'progress' | 'projects' | 'admin' | 'issues' | 'perms'

// Construction palette status colours
const STATUS_COLOR: Record<string, string> = {
  'on-track': 'badge-green',
  'behind':   'badge-orange',
  'critical': 'badge-red',
  'completed':'badge-blue',
}
const STATUS_ZH: Record<string, string> = {
  'on-track': '準時', 'behind': '落後', 'critical': '危急', 'completed': '完成'
}
const MILESTONE_COLOR: Record<string, string> = {
  'completed': 'text-green-600', 'on-track': 'text-blue-600',
  'at-risk': 'text-safety-600', 'overdue': 'text-red-600',
}
const MILESTONE_DOT: Record<string, string> = {
  'completed': 'bg-green-500', 'on-track': 'bg-blue-500',
  'at-risk': 'bg-safety-500', 'overdue': 'bg-red-500',
}
const ZONE_FILL: Record<string, string> = {
  completed: '#22c55e',
  'on-track': '#3b82f6',
  behind:    '#f97316',
  critical:  '#ef4444',
}
const ZONE_ICON: Record<string, string> = {
  tower: '🏢', podium: '🏗', basement: '⬇', carpark: '🅿', external: '🌿'
}
const ZONE_TYPE_ZH: Record<string, string> = {
  tower: '主樓/棟', podium: '平台層', basement: '地牢', carpark: '停車場', external: '外部/其他'
}

// Permission group colours
const GROUP_COLOR: Record<string, string> = {
  '查看': 'bg-blue-100 text-blue-700',
  '審批': 'bg-green-100 text-green-700',
  '管理': 'bg-purple-100 text-purple-700',
  '操作': 'bg-safety-100 text-safety-700',
  '工人': 'bg-site-100 text-site-600',
}

function KpiCard({ label, value, sub, icon: Icon, accent, trend }: {
  label: string; value: string; sub: string
  icon: React.ElementType; accent: string; trend?: 'up' | 'down' | 'warn'
}) {
  return (
    <div className="card p-4 hover:shadow-card-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon size={18} className="text-white" />
        </div>
        <div className="mt-1">
          {trend === 'down' && <TrendingDown size={15} className="text-safety-500" />}
          {trend === 'up'   && <TrendingUp   size={15} className="text-green-500" />}
          {trend === 'warn' && <AlertTriangle size={15} className="text-red-500" />}
        </div>
      </div>
      <p className="font-heading font-bold text-2xl text-site-900">{value}</p>
      <p className="text-sm font-medium text-site-700 mt-0.5">{label}</p>
      <p className="text-xs text-site-400 mt-1">{sub}</p>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-site-200 rounded-xl shadow-card-md p-3 text-sm">
      <p className="font-semibold text-site-700 mb-1.5">{label}</p>
      {payload.map((e: any) => (
        <p key={e.name} style={{ color: e.color }} className="font-medium">
          {e.name}: <span className="font-bold">{e.value}%</span>
        </p>
      ))}
    </div>
  )
}

// ── Project Creation Form ─────────────────────────────────────────────────────
function CreateProjectForm({ onClose, createdBy }: { onClose: () => void; createdBy: string }) {
  const { createProject } = useProgress()

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [projectType, setProjectType] = useState<'building' | 'civil' | 'renovation' | 'infrastructure'>('building')
  const [numBlocks, setNumBlocks] = useState(1)
  const [hasBasement, setHasBasement] = useState(false)
  const [numBasementLevels, setNumBasementLevels] = useState(1)
  const [client, setClient] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetEndDate, setTargetEndDate] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [zones, setZones] = useState<ProjectZone[]>([])

  // Zone editor
  const [editZoneId, setEditZoneId]     = useState('')
  const [editZoneName, setEditZoneName] = useState('')
  const [editZoneType, setEditZoneType] = useState<ProjectZone['type']>('tower')
  const [showZoneAdder, setShowZoneAdder] = useState(false)

  const autoGenerateZones = () => {
    const generated: ProjectZone[] = []
    for (let i = 1; i <= numBlocks; i++) {
      const letter = String.fromCharCode(64 + i) // A, B, C...
      generated.push({ id: `Z${letter}`, name: `${letter}座`, type: 'tower' })
    }
    if (hasBasement) {
      generated.push({ id: 'B', name: `地牢 (B1–B${numBasementLevels})`, type: 'basement' })
    }
    setZones(generated)
  }

  const addZone = () => {
    if (!editZoneId.trim() || !editZoneName.trim()) return
    if (zones.some(z => z.id === editZoneId.trim())) return // duplicate id
    setZones(prev => [...prev, { id: editZoneId.trim().toUpperCase(), name: editZoneName.trim(), type: editZoneType }])
    setEditZoneId(''); setEditZoneName(''); setEditZoneType('tower')
    setShowZoneAdder(false)
  }

  const removeZone = (id: string) => setZones(prev => prev.filter(z => z.id !== id))

  const handleSubmit = () => {
    if (!name.trim()) return
    createProject({
      name: name.trim(),
      description: desc.trim(),
      createdBy,
      status: 'active',
      projectType,
      numBlocks,
      hasBasement,
      numBasementLevels: hasBasement ? numBasementLevels : 0,
      zones,
      enabledModules: ['progress','issues','safety','diary','materials','documents','qc','procurement'],
      client: client.trim() || undefined,
      contractValue: contractValue ? Number(contractValue) * 1_000_000 : undefined,
      startDate: startDate || undefined,
      targetEndDate: targetEndDate || undefined,
      siteAddress: siteAddress.trim() || undefined,
    })
    onClose()
  }

  const inputCls = 'w-full border border-site-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-safety-400 focus:ring-2 focus:ring-safety-100 text-site-700 bg-white'
  const labelCls = 'text-xs font-semibold text-site-600 mb-1 block'

  return (
    <div className="mb-5 p-5 bg-site-50 border border-site-200 rounded-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-site-800 text-base">新增工程項目</h3>
        <button onClick={onClose} className="text-site-400 hover:text-site-700 transition-colors">
          <XCircle size={18} />
        </button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>項目名稱 *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="例：九龍灣住宅發展項目" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>項目描述</label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="簡述項目概況" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>業主 / 客戶</label>
          <input value={client} onChange={e => setClient(e.target.value)}
            placeholder="例：Harbour Development Corp" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>地盤地址</label>
          <input value={siteAddress} onChange={e => setSiteAddress(e.target.value)}
            placeholder="例：九龍灣宏照道 8 號" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>合約金額 (HKD 百萬)</label>
          <input type="number" value={contractValue} onChange={e => setContractValue(e.target.value)}
            placeholder="例：850" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>項目類型</label>
          <select value={projectType} onChange={e => setProjectType(e.target.value as any)} className={inputCls}>
            <option value="building">樓宇建築</option>
            <option value="civil">土木工程</option>
            <option value="renovation">裝修改建</option>
            <option value="infrastructure">基礎設施</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>開工日期</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>預計竣工日期</label>
          <input type="date" value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Building structure */}
      <div className="p-4 bg-white border border-site-200 rounded-xl space-y-3">
        <h4 className="text-xs font-bold text-site-700 uppercase tracking-wide">樓宇結構</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>棟數 / 座數</label>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setNumBlocks(v => Math.max(1, v - 1))}
                className="w-9 h-9 rounded-xl bg-site-100 hover:bg-site-200 text-site-700 font-bold text-lg flex items-center justify-center transition-colors">−</button>
              <span className="flex-1 text-center font-heading font-bold text-site-900 text-xl">{numBlocks}</span>
              <button type="button"
                onClick={() => setNumBlocks(v => v + 1)}
                className="w-9 h-9 rounded-xl bg-site-100 hover:bg-site-200 text-site-700 font-bold text-lg flex items-center justify-center transition-colors">+</button>
            </div>
          </div>
          <div>
            <label className={labelCls}>地牢層數</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setHasBasement(v => !v)}
                  className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${hasBasement ? 'bg-safety-500' : 'bg-site-200'}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasBasement ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-xs text-site-600 font-medium">{hasBasement ? '有地牢' : '無地牢'}</span>
              </label>
              {hasBasement && (
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setNumBasementLevels(v => Math.max(1, v - 1))}
                    className="w-8 h-8 rounded-lg bg-site-100 hover:bg-site-200 text-site-700 font-bold flex items-center justify-center transition-colors">−</button>
                  <span className="flex-1 text-center text-sm font-semibold text-site-800">B{numBasementLevels}</span>
                  <button type="button"
                    onClick={() => setNumBasementLevels(v => v + 1)}
                    className="w-8 h-8 rounded-lg bg-site-100 hover:bg-site-200 text-site-700 font-bold flex items-center justify-center transition-colors">+</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Zone builder */}
      <div className="p-4 bg-white border border-site-200 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-site-700 uppercase tracking-wide">分區設定</h4>
          <button type="button" onClick={autoGenerateZones}
            className="flex items-center gap-1 text-xs text-safety-600 hover:text-safety-700 font-medium border border-safety-200 hover:border-safety-400 px-2.5 py-1.5 rounded-lg transition-colors">
            <RefreshCw size={11} /> 自動生成
          </button>
        </div>
        {zones.length === 0 ? (
          <p className="text-xs text-site-400 italic">尚未設定分區。可點「自動生成」根據棟數/地牢快速建立，或手動新增。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map(z => (
              <div key={z.id} className="flex items-center gap-1.5 bg-site-50 border border-site-200 rounded-xl px-3 py-2 text-xs">
                <span>{ZONE_ICON[z.type]}</span>
                <span className="font-semibold text-site-800">{z.id}</span>
                <span className="text-site-500">{z.name}</span>
                <button type="button" onClick={() => removeZone(z.id)} className="ml-1 text-site-400 hover:text-red-500 transition-colors">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showZoneAdder ? (
          <div className="grid grid-cols-12 gap-2 items-end pt-1">
            <div className="col-span-2">
              <label className="text-[10px] font-semibold text-site-500 mb-1 block">代碼</label>
              <input value={editZoneId} onChange={e => setEditZoneId(e.target.value.toUpperCase())}
                placeholder="ZA"
                className="w-full border border-site-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-safety-400 text-site-700" />
            </div>
            <div className="col-span-4">
              <label className="text-[10px] font-semibold text-site-500 mb-1 block">名稱</label>
              <input value={editZoneName} onChange={e => setEditZoneName(e.target.value)}
                placeholder="A座主樓"
                className="w-full border border-site-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-safety-400 text-site-700" />
            </div>
            <div className="col-span-4">
              <label className="text-[10px] font-semibold text-site-500 mb-1 block">類型</label>
              <select value={editZoneType} onChange={e => setEditZoneType(e.target.value as any)}
                className="w-full border border-site-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-safety-400 text-site-700 bg-white">
                {Object.entries(ZONE_TYPE_ZH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-1">
              <button type="button" onClick={addZone}
                disabled={!editZoneId.trim() || !editZoneName.trim()}
                className="flex-1 bg-safety-500 hover:bg-safety-600 disabled:opacity-40 text-white rounded-lg py-2 flex items-center justify-center transition-colors">
                <Check size={13} />
              </button>
              <button type="button" onClick={() => setShowZoneAdder(false)}
                className="flex-1 bg-site-100 hover:bg-site-200 text-site-600 rounded-lg py-2 flex items-center justify-center transition-colors">
                <XCircle size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowZoneAdder(true)}
            className="flex items-center gap-1.5 text-xs text-site-600 hover:text-site-900 border border-dashed border-site-300 hover:border-site-500 px-3 py-2 rounded-xl transition-colors w-full justify-center">
            <Plus size={12} /> 手動新增分區
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 btn-ghost py-2.5 text-sm">取消</button>
        <button type="button" onClick={handleSubmit} disabled={!name.trim()}
          className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-40">
          <Plus size={13} /> 建立項目
        </button>
      </div>
    </div>
  )
}

// ── Permission Management ─────────────────────────────────────────────────────
function PermissionsTab({ projectId }: { projectId: string }) {
  const { allUsers, updateUserPermissions } = useAuth()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const visibleUsers = allUsers.filter(u => u.projectId === projectId)

  const groups = [...new Set(ALL_PERMISSIONS.map(p => p.group))]

  const togglePerm = (userId: string, currentPerms: string[], key: string) => {
    const next = currentPerms.includes(key)
      ? currentPerms.filter(k => k !== key)
      : [...currentPerms, key]
    updateUserPermissions(userId, next)
  }

  const toggleAll = (userId: string, currentPerms: string[], group: string) => {
    const groupKeys = ALL_PERMISSIONS.filter(p => p.group === group).map(p => p.key)
    const allOn = groupKeys.every(k => currentPerms.includes(k))
    const next = allOn
      ? currentPerms.filter(k => !groupKeys.includes(k))
      : [...new Set([...currentPerms, ...groupKeys])]
    updateUserPermissions(userId, next)
  }

  return (
    <div className="card p-5">
      <h2 className="section-title mb-0.5">用戶權限管理</h2>
      <p className="section-sub mb-5">為每位用戶分配功能權限。點擊用戶行即可展開進行設定。</p>

      <div className="space-y-2">
        {visibleUsers.map(u => {
          const expanded = expandedId === u.id
          return (
            <div key={u.id} className={`rounded-xl border-2 transition-all ${expanded ? 'border-safety-300 shadow-card-md' : 'border-site-100 hover:border-site-300'}`}>
              {/* User row */}
              <button
                onClick={() => setExpandedId(expanded ? null : u.id)}
                className="w-full flex items-center gap-3 p-4 text-left">
                <div className="w-10 h-10 rounded-xl bg-site-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {u.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-semibold text-site-900 text-sm">{u.name}</p>
                  <p className="text-xs text-site-500">{u.roleZh} · {u.company}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-site-400">{u.permissions.length} 項權限</span>
                  {expanded
                    ? <ChevronDown size={16} className="text-safety-500" />
                    : <ChevronRight size={16} className="text-site-400" />
                  }
                </div>
              </button>

              {/* Permission checkboxes */}
              {expanded && (
                <div className="px-4 pb-4 border-t border-site-100 pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groups.map(group => {
                      const groupPerms = ALL_PERMISSIONS.filter(p => p.group === group)
                      const allOn = groupPerms.every(p => u.permissions.includes(p.key))
                      const someOn = groupPerms.some(p => u.permissions.includes(p.key))
                      return (
                        <div key={group} className="bg-site-50 rounded-xl p-3">
                          {/* Group header with toggle-all */}
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${GROUP_COLOR[group] ?? 'bg-site-200 text-site-700'}`}>
                              {group}
                            </span>
                            <button
                              onClick={() => toggleAll(u.id, u.permissions, group)}
                              className={`text-[10px] font-medium transition-colors ${allOn ? 'text-red-500 hover:text-red-700' : someOn ? 'text-safety-500 hover:text-safety-700' : 'text-blue-500 hover:text-blue-700'}`}>
                              {allOn ? '全部取消' : '全選'}
                            </button>
                          </div>
                          {/* Individual perms */}
                          <div className="space-y-1.5">
                            {groupPerms.map(p => {
                              const checked = u.permissions.includes(p.key)
                              return (
                                <label key={p.key} className="flex items-center gap-2 cursor-pointer select-none group">
                                  <div
                                    onClick={() => togglePerm(u.id, u.permissions, p.key)}
                                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                                      checked ? 'bg-safety-500 border-safety-500' : 'bg-white border-site-300 group-hover:border-site-400'
                                    }`}>
                                    {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                                  </div>
                                  <span className={`text-xs transition-colors ${checked ? 'text-site-800 font-medium' : 'text-site-500'}`}>
                                    {p.label}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function PMDashboard() {
  const [pmTab, setPmTab] = useState<PMTab>('dashboard')
  const { projects, items, currentProjectId, currentProject, switchProject, isModuleEnabled } = useProgress()
  const { user, pendingUsers, approveUser, rejectUser } = useAuth()
  const { issues: issueReports } = useIssues()
  const { boqItems } = useCost()

  // Auto-switch to PM's own project on first mount only
  useEffect(() => {
    if (user?.projectId) switchProject(user.projectId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute live KPIs from ProgressItems filtered to current project
  const level1Items = items.filter(i => i.level === 1)
  const currentProgress = level1Items.length
    ? Math.round(level1Items.reduce((s, i) => s + i.actualProgress, 0) / level1Items.length)
    : 0
  const plannedProgress = level1Items.length
    ? Math.round(level1Items.reduce((s, i) => s + i.plannedProgress, 0) / level1Items.length)
    : 0
  const progressDiff = currentProgress - plannedProgress

  // Budget filtered to current project's BOQ items
  const projectBoq = boqItems.filter(b => b.projectId === currentProjectId)
  const totalContractSum = projectBoq.reduce((s, b) => s + b.contractAmount, 0)
  const totalCompletedAmount = projectBoq.reduce((s, b) => s + b.completedAmount, 0)
  const budgetPct = totalContractSum > 0
    ? Math.round((totalCompletedAmount / totalContractSum) * 100)
    : 0

  const daysLeft = currentProject?.targetEndDate
    ? Math.ceil((new Date(currentProject.targetEndDate).getTime() - Date.now()) / (1000 * 3600 * 24))
    : 0

  // Zone chart data derived from level-1 items grouped by zone
  const zoneChartData = (currentProject?.zones ?? []).map(z => {
    const zItems = level1Items.filter(i => i.zone === z.id)
    const progress = zItems.length ? Math.round(zItems.reduce((s, i) => s + i.actualProgress, 0) / zItems.length) : 0
    const planned  = zItems.length ? Math.round(zItems.reduce((s, i) => s + i.plannedProgress, 0) / zItems.length) : 0
    const diff = progress - planned
    const status: 'on-track' | 'behind' | 'critical' | 'completed' =
      progress === 100 ? 'completed' : diff >= 0 ? 'on-track' : diff >= -10 ? 'behind' : 'critical'
    return { id: z.id, name: z.name, progress, planned, status }
  })

  // Pending users filtered to the currently-viewed project
  const myPendingUsers = pendingUsers.filter(p => p.projectId === currentProjectId)

  const TABS = [
    { id: 'dashboard', label: '項目總覽',    icon: Layers,         show: true },
    { id: 'progress',  label: '進度追蹤',    icon: ListTree,       show: isModuleEnabled('progress') },
    { id: 'projects',  label: '項目設定',    icon: FolderOpen,     show: true },
    { id: 'issues',    label: '問題追蹤',    icon: MessageSquare,  show: isModuleEnabled('issues'),
      badge: issueReports.filter(i => i.status === 'open').length },
    { id: 'admin',     label: '帳戶審批',    icon: UserCheck,      show: true, badge: myPendingUsers.length },
    { id: 'perms',     label: '用戶權限',    icon: Shield,         show: true },
  ].filter(t => t.show) as { id: PMTab; label: string; icon: React.ElementType; badge?: number }[]

  return (
    <div className="min-h-screen bg-site-50">
      <Navbar />

      {/* Tab bar */}
      <div className="bg-white border-b border-site-200 sticky top-14 z-40">
        <div className="max-w-7xl mx-auto px-4 flex gap-0.5 overflow-x-auto scrollbar-thin">
          {TABS.map(t => {
            const Icon = t.icon
            const active = pmTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setPmTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-safety-500 text-safety-600'
                    : 'border-transparent text-site-500 hover:text-site-800 hover:border-site-300'
                }`}
              >
                <Icon size={14} />
                {t.label}
                {(t.badge ?? 0) > 0 && (
                  <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Progress tab ── */}
        {pmTab === 'progress' && (
          <div className="card p-5">
            <h2 className="section-title mb-0.5">進度追蹤總表 — {currentProject?.name}</h2>
            <p className="section-sub mb-5">全地盤 WBS 層級進度，可展開查看細項，並指派負責人</p>
            <ProgressTracker />
          </div>
        )}

        {/* ── Projects tab ── */}
        {pmTab === 'projects' && (
          <div className="card p-5">
            <div className="mb-5">
              <h2 className="section-title">項目設定</h2>
              <p className="section-sub">切換及查看工程項目（新增項目請聯絡系統管理員）</p>
            </div>

            <div className="space-y-3">
              {projects.map(p => (
                <div key={p.id} className={`flex items-start gap-4 p-4 rounded-xl border-2 transition-all ${
                  p.id === currentProjectId
                    ? 'border-safety-400 bg-safety-50'
                    : 'border-site-100 hover:border-site-300 bg-white'
                }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    p.id === currentProjectId ? 'bg-safety-500' : 'bg-site-100'
                  }`}>
                    <FolderOpen size={18} className={p.id === currentProjectId ? 'text-white' : 'text-site-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-site-900">{p.name}</p>
                    {p.description && <p className="text-xs text-site-400 truncate">{p.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      {p.client && <span className="text-xs text-site-500">👤 {p.client}</span>}
                      {p.siteAddress && <span className="text-xs text-site-500">📍 {p.siteAddress}</span>}
                      {p.startDate && <span className="text-xs text-site-500">🗓 {p.startDate}{p.targetEndDate ? ` → ${p.targetEndDate}` : ''}</span>}
                      {p.contractValue && <span className="text-xs text-site-500">💰 HKD {(p.contractValue/1e6).toFixed(0)}M</span>}
                    </div>
                    {p.zones && p.zones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.zones.map(z => (
                          <span key={z.id} className="inline-flex items-center gap-1 text-[10px] bg-site-100 text-site-600 px-2 py-0.5 rounded-lg font-medium">
                            {ZONE_ICON[z.type]} {z.id}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-site-400 mt-1.5">建立於 {p.createdAt.slice(0,10)}</p>
                  </div>
                  <div className="flex-shrink-0 mt-0.5">
                    {p.id === currentProjectId ? (
                      <span className="badge-orange">目前項目</span>
                    ) : (
                      <button onClick={() => switchProject(p.id)}
                        className="text-xs border border-site-300 text-site-600 hover:bg-site-100 px-3 py-2 rounded-lg flex-shrink-0 transition-colors">
                        切換
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Issues tab ── */}
        {pmTab === 'issues' && (
          <div className="card p-5">
            <h2 className="section-title mb-0.5">問題追蹤</h2>
            <p className="section-sub mb-5">查看全部現場上報問題，跟進處理並與團隊討論</p>
            <IssueBoard />
          </div>
        )}

        {/* ── Admin tab ── */}
        {pmTab === 'admin' && (
          <div className="card p-5">
            <h2 className="section-title mb-0.5">帳戶審批</h2>
            <p className="section-sub mb-5">審批新用戶的帳戶申請</p>
            {myPendingUsers.length === 0 ? (
              <div className="text-center py-16 text-site-400 text-sm">
                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-30" />
                目前沒有待審批的帳戶申請
              </div>
            ) : (
              <div className="space-y-3">
                {myPendingUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-4 p-4 rounded-xl border border-safety-200 bg-safety-50">
                    <div className="w-10 h-10 rounded-xl bg-safety-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {u.name.slice(0,1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-semibold text-site-900">{u.name}</p>
                      <p className="text-xs text-site-500">{u.roleZh} · {u.company}</p>
                      <p className="text-xs text-site-400 font-mono mt-0.5">@{u.username} · {u.requestedAt.slice(0,16).replace('T',' ')}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => rejectUser(u.id)}
                        className="flex items-center gap-1 text-xs border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
                        <XCircle size={12} /> 拒絕
                      </button>
                      <button onClick={() => approveUser(u.id)}
                        className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-semibold transition-colors">
                        <Check size={12} /> 批准
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Permissions tab ── */}
        {pmTab === 'perms' && <PermissionsTab projectId={user?.projectId ?? ''} />}

        {/* ── Dashboard tab ── */}
        {pmTab === 'dashboard' && <>
          {/* Project banner */}
          <div className="card px-5 py-4 bg-site-800 text-white flex items-center justify-between">
            <div>
              <p className="text-xs text-site-400 mb-0.5">目前查看項目</p>
              <h2 className="font-heading font-bold text-lg leading-tight">{currentProject?.name ?? '未選擇項目'}</h2>
              {currentProject?.siteAddress && <p className="text-xs text-site-400 mt-0.5">{currentProject.siteAddress}</p>}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-site-400 mb-0.5">項目狀態</p>
              <span className={`text-sm font-bold ${currentProject?.status === 'active' ? 'text-green-400' : 'text-site-400'}`}>
                {currentProject?.status === 'active' ? '● 進行中' : currentProject?.status === 'completed' ? '✓ 已完成' : '○ 已歸檔'}
              </span>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="整體進度"   value={`${currentProgress}%`}
              sub={`計劃 ${plannedProgress}% · ${progressDiff >= 0 ? '超前' : '落後'} ${Math.abs(progressDiff)}%`}
              icon={Layers}        accent="bg-site-700"    trend={progressDiff >= 0 ? 'up' : 'down'} />
            <KpiCard label="完工金額"   value={totalContractSum > 0 ? `${budgetPct}%` : '—'}
              sub={totalContractSum > 0
                ? `HKD ${(totalCompletedAmount/1e6).toFixed(1)}M / ${(totalContractSum/1e6).toFixed(1)}M`
                : '此項目尚未錄入 BOQ'}
              icon={DollarSign}    accent="bg-green-600"   trend={totalContractSum > 0 ? 'up' : undefined} />
            <KpiCard label="剩餘工期"   value={daysLeft > 0 ? `${daysLeft} 天` : currentProject?.targetEndDate ? '已到期' : '—'}
              sub={currentProject?.targetEndDate ? `預計竣工：${currentProject.targetEndDate}` : '未設定竣工日期'}
              icon={Clock}         accent="bg-safety-500" />
            <KpiCard label="待處理問題" value={`${issueReports.filter(i => i.projectId === currentProjectId && i.status !== 'closed' && i.status !== 'resolved').length} 個`}
              sub={`其中 ${issueReports.filter(i => i.projectId === currentProjectId && (i.severity === 'urgent' || i.severity === 'serious')).length} 個高優先`}
              icon={AlertTriangle} accent="bg-red-500"     trend="warn" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* S-Curve */}
            <div className="lg:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="section-title">S-Curve 進度曲線</h2>
                  <p className="section-sub">計劃 vs 實際累計進度 (%)</p>
                </div>
                {items.length > 0 && (
                  <span className={progressDiff >= 0 ? 'badge-green' : 'badge-orange'}>
                    {progressDiff >= 0 ? '超前' : '落後'} {Math.abs(progressDiff)}%
                  </span>
                )}
              </div>
              {items.length === 0 ? (
                <div className="h-[260px] flex flex-col items-center justify-center gap-2 text-site-400">
                  <Layers size={32} className="opacity-20" />
                  <p className="text-sm">此項目尚未有進度數據</p>
                  <p className="text-xs">請先在「進度追蹤」中新增 WBS 項目</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={sCurveData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine x="M13" stroke="#94a3b8" strokeDasharray="4 4"
                      label={{ value: '今日', position: 'top', fontSize: 11, fill: '#64748b' }} />
                    <Line type="monotone" dataKey="planned" name="計劃" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="6 3" />
                    <Line type="monotone" dataKey="actual"  name="實際" stroke="#f97316" strokeWidth={2.5} dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Recent issues panel */}
            <div className="card p-5 flex flex-col">
              <h2 className="section-title mb-4">本項目最新問題</h2>
              <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
                {issueReports.filter(i => i.projectId === currentProjectId).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-site-400 py-8">
                    <CheckCircle2 size={28} className="opacity-20 mb-2" />
                    <p className="text-xs">此項目暫無問題記錄</p>
                  </div>
                ) : issueReports.filter(i => i.projectId === currentProjectId).slice(0, 6).map(n => (
                  <div key={n.id} className={`p-3 rounded-xl border text-xs ${
                    n.status === 'open' ? 'bg-safety-50 border-safety-100' : 'bg-site-50 border-site-100'
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        n.severity === 'urgent' ? 'bg-red-500' : n.severity === 'serious' ? 'bg-safety-400' : 'bg-site-300'
                      }`} />
                      <div className="min-w-0">
                        <p className="font-semibold text-site-800 leading-tight">{n.category} — {n.location}</p>
                        <p className="text-site-500 mt-0.5 leading-relaxed line-clamp-2">{n.description}</p>
                        <p className="text-site-400 mt-1">{n.submittedAt.slice(0, 10)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Zone Progress bar chart */}
            <div className="lg:col-span-2 card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="section-title">各區域進度</h2>
                  <p className="section-sub">計劃 vs 實際 (%)</p>
                </div>
              </div>
              {zoneChartData.length === 0 ? (
                <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-site-400">
                  <FolderOpen size={32} className="opacity-20" />
                  <p className="text-sm">此項目尚未設定分區</p>
                  <p className="text-xs">請在「項目管理」中為此項目新增分區</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={zoneChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }} barSize={14} barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="id" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="planned"  name="計劃" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="progress" name="實際" radius={[4, 4, 0, 0]}>
                        {zoneChartData.map((z) => (
                          <Cell key={z.id} fill={ZONE_FILL[z.status] ?? '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-site-100">
                    {zoneChartData.map(z => (
                      <div key={z.id} className="flex items-center justify-between text-xs">
                        <span className="text-site-600 truncate mr-1">{z.id}</span>
                        <span className={STATUS_COLOR[z.status]}>{STATUS_ZH[z.status]}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4">
              {/* Milestones — derived from level-1 progress items */}
              <div className="card p-4">
                <h2 className="section-title mb-3 text-sm">進度里程碑</h2>
                {level1Items.length === 0 ? (
                  <p className="text-xs text-site-400 text-center py-4">此項目尚未有里程碑數據</p>
                ) : (
                  <div className="space-y-2.5">
                    {level1Items.slice(0, 5).map(item => {
                      const ms: 'completed' | 'on-track' | 'at-risk' | 'overdue' =
                        item.actualProgress === 100 ? 'completed' :
                        item.status === 'delayed' || item.status === 'blocked' ? 'at-risk' :
                        item.plannedEnd && new Date(item.plannedEnd) < new Date() ? 'overdue' : 'on-track'
                      return (
                        <div key={item.id} className="flex items-center gap-2.5 text-xs">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${MILESTONE_DOT[ms]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-site-700 font-medium truncate">{item.title}</p>
                            <p className="text-site-400">{item.plannedEnd ?? '—'}</p>
                          </div>
                          <span className={`font-semibold flex-shrink-0 ${MILESTONE_COLOR[ms]}`}>
                            {ms === 'completed' ? '✓' : ms === 'at-risk' ? '⚠' : ms === 'overdue' ? '!' : '→'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Cost Breakdown — live from BOQ */}
              <div className="card p-4">
                <h2 className="section-title mb-3 text-sm">成本分佈 (HKD M)</h2>
                {projectBoq.length === 0 ? (
                  <p className="text-xs text-site-400 text-center py-4">此項目尚未有 BOQ 成本數據</p>
                ) : (
                  <div className="space-y-2.5">
                    {projectBoq.slice(0, 6).map((b, idx) => {
                      const budget = b.contractAmount / 1e6
                      const spent  = b.completedAmount / 1e6
                      const colors = ['#3b82f6','#10b981','#f97316','#8b5cf6','#ef4444','#06b6d4']
                      return (
                        <div key={b.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-site-600 truncate mr-2">{b.description.replace(/\s*\(.*?\)/g, '')}</span>
                            <span className="text-site-400 font-mono flex-shrink-0">{spent.toFixed(1)}M / {budget.toFixed(1)}M</span>
                          </div>
                          <div className="h-1.5 bg-site-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: budget > 0 ? `${Math.min(100, (spent/budget)*100)}%` : '0%', backgroundColor: colors[idx % colors.length] }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Issues table */}
          <div className="card p-5">
            <h2 className="section-title mb-4">待處理問題追蹤</h2>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-site-100">
                    <th className="pb-2.5 text-xs font-semibold text-site-400 pr-4">編號</th>
                    <th className="pb-2.5 text-xs font-semibold text-site-400 pr-4">問題描述</th>
                    <th className="pb-2.5 text-xs font-semibold text-site-400 pr-4">區域</th>
                    <th className="pb-2.5 text-xs font-semibold text-site-400 pr-4">類別</th>
                    <th className="pb-2.5 text-xs font-semibold text-site-400 pr-4">優先級</th>
                    <th className="pb-2.5 text-xs font-semibold text-site-400">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {issueReports.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-site-400 text-sm">暫無問題記錄，現場問題上報後將在此顯示</td>
                    </tr>
                  ) : issueReports.map(issue => (
                    <tr key={issue.id} className="border-b border-site-50 hover:bg-site-50 transition-colors">
                      <td className="py-3 pr-4 text-site-400 text-xs font-mono">{issue.id.slice(-6).toUpperCase()}</td>
                      <td className="py-3 pr-4 text-site-800 font-medium text-sm">{issue.category} — {issue.location}</td>
                      <td className="py-3 pr-4 text-site-500 text-xs">{issue.location}</td>
                      <td className="py-3 pr-4 text-site-500 text-xs">{issue.category}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          issue.severity === 'urgent'  ? 'badge-red' :
                          issue.severity === 'serious' ? 'badge-orange' :
                          'badge-slate'
                        }`}>
                          {issue.severity === 'urgent' ? '緊急' : issue.severity === 'serious' ? '較嚴重' : '一般'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          issue.status === 'open'        ? 'badge-slate' :
                          issue.status === 'in-progress' ? 'badge-blue' :
                          'badge-green'
                        }`}>
                          {issue.status === 'open' ? '待處理' : issue.status === 'in-progress' ? '處理中' : '已解決'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}
      </main>
    </div>
  )
}
