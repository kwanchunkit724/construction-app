import { useState, useMemo } from 'react'
import {
  Shield, FolderPlus, Users, CheckCircle, XCircle,
  Building2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight,
  LogOut, Clock, Layers, X, Plus,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { ALL_MODULES } from '../types'
import type { ProjectModule, ProjectZone } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────
const MODULE_COLOR: Record<ProjectModule, string> = {
  progress:    'bg-blue-100 text-blue-700 border-blue-300',
  issues:      'bg-orange-100 text-orange-700 border-orange-300',
  safety:      'bg-red-100 text-red-700 border-red-300',
  diary:       'bg-green-100 text-green-700 border-green-300',
  materials:   'bg-amber-100 text-amber-700 border-amber-300',
  documents:   'bg-indigo-100 text-indigo-700 border-indigo-300',
  qc:          'bg-cyan-100 text-cyan-700 border-cyan-300',
  procurement: 'bg-purple-100 text-purple-700 border-purple-300',
}

// ── Create Project Form ───────────────────────────────────────────────────────
function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { createProject } = useProgress()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectType, setProjectType] = useState<'building' | 'civil' | 'renovation' | 'infrastructure'>('building')
  const [client, setClient] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetEndDate, setTargetEndDate] = useState('')
  const [contractValue, setContractValue] = useState('')
  const [numBlocks, setNumBlocks] = useState(1)
  const [hasBasement, setHasBasement] = useState(false)
  const [numBasementLevels, setNumBasementLevels] = useState(1)
  const [enabledModules, setEnabledModules] = useState<ProjectModule[]>(ALL_MODULES.map(m => m.key))
  const [zones, setZones] = useState<ProjectZone[]>([])
  const [error, setError] = useState('')

  const toggleModule = (key: ProjectModule) =>
    setEnabledModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  const autoGenerateZones = () => {
    const z: ProjectZone[] = []
    for (let i = 1; i <= numBlocks; i++) {
      z.push({ id: `T${i}`, name: `第${i}座`, type: 'tower' })
    }
    if (hasBasement) z.push({ id: 'B', name: `地牢 (B1–B${numBasementLevels})`, type: 'basement' })
    setZones(z)
  }

  const removeZone = (id: string) => setZones(prev => prev.filter(z => z.id !== id))

  const save = () => {
    if (!name.trim()) { setError('請輸入項目名稱'); return }
    createProject({
      name: name.trim(),
      description: description.trim(),
      createdBy: user?.id ?? '',
      status: 'active',
      projectType,
      client: client.trim(),
      siteAddress: siteAddress.trim(),
      startDate,
      targetEndDate,
      contractValue: contractValue ? Number(contractValue) : undefined,
      numBlocks,
      hasBasement,
      numBasementLevels: hasBasement ? numBasementLevels : 0,
      zones,
      enabledModules,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <FolderPlus size={18} className="text-rose-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">建立新項目</h2>
              <p className="text-xs text-gray-400">系統管理員專用</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Basic info */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">項目名稱 *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                placeholder="例：Victoria Harbour Phase II" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">項目簡介</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-rose-400 resize-none"
                placeholder="簡述項目性質及範圍..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">項目類型</label>
              <select value={projectType} onChange={e => setProjectType(e.target.value as typeof projectType)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400">
                <option value="building">樓宇建造</option>
                <option value="civil">土木工程</option>
                <option value="renovation">裝修改建</option>
                <option value="infrastructure">基礎設施</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">客戶 / 業主</label>
              <input value={client} onChange={e => setClient(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                placeholder="客戶公司名稱" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">地盤地址</label>
              <input value={siteAddress} onChange={e => setSiteAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                placeholder="例：九龍灣宏照道 8 號" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">合約金額 (HKD)</label>
              <input type="number" value={contractValue} onChange={e => setContractValue(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400"
                placeholder="例：850000000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">開工日期</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">預計竣工</label>
              <input type="date" value={targetEndDate} onChange={e => setTargetEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400" />
            </div>
          </div>

          {/* Structure */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">項目結構</p>
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">樓棟數目</label>
                <input type="number" min={1} max={20} value={numBlocks}
                  onChange={e => setNumBlocks(Math.max(1, Number(e.target.value)))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400" />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <button onClick={() => setHasBasement(p => !p)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${hasBasement ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-gray-200 text-gray-500'}`}>
                  {hasBasement ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} 有地庫
                </button>
              </div>
              {hasBasement && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">地庫層數</label>
                  <input type="number" min={1} max={10} value={numBasementLevels}
                    onChange={e => setNumBasementLevels(Math.max(1, Number(e.target.value)))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-400" />
                </div>
              )}
            </div>
            <button onClick={autoGenerateZones}
              className="mt-2 text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1">
              <Layers size={12} /> 自動生成分區
            </button>
            {zones.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {zones.map(z => (
                  <span key={z.id} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg">
                    {z.name}
                    <button onClick={() => removeZone(z.id)} className="text-gray-400 hover:text-red-500 ml-1"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Module toggles */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">啟用功能模組</p>
            <p className="text-xs text-gray-400 mb-3">只有啟用的模組才會顯示給此項目的用戶</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MODULES.map(m => {
                const on = enabledModules.includes(m.key)
                return (
                  <button key={m.key} onClick={() => toggleModule(m.key)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${on ? MODULE_COLOR[m.key] : 'border-gray-200 text-gray-400 bg-gray-50'}`}>
                    {on ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    <div>
                      <p className="text-xs font-bold">{m.label}</p>
                      <p className="text-[10px] opacity-70">{m.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>}
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">取消</button>
          <button onClick={save} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
            <Plus size={14} /> 建立項目
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Module config panel (inline, per project) ─────────────────────────────────
function ModuleConfigPanel({ projectId, enabledModules }: { projectId: string; enabledModules: ProjectModule[] }) {
  const { updateProjectModules } = useProgress()
  const [local, setLocal] = useState<ProjectModule[]>([...enabledModules])
  const [saved, setSaved] = useState(false)

  const toggle = (key: ProjectModule) =>
    setLocal(prev => { setSaved(false); return prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key] })

  const save = () => {
    updateProjectModules(projectId, local)
    setSaved(true)
  }

  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
      <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">功能模組設定</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {ALL_MODULES.map(m => {
          const on = local.includes(m.key)
          return (
            <button key={m.key} onClick={() => toggle(m.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${on ? MODULE_COLOR[m.key] : 'border-gray-200 text-gray-400 bg-white'}`}>
              {on ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
              {m.label}
            </button>
          )
        })}
      </div>
      <button onClick={save}
        className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all ${saved ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-rose-600 text-white hover:bg-rose-700'}`}>
        {saved ? '✓ 已儲存' : '儲存設定'}
      </button>
    </div>
  )
}

// ── PM Assignment panel (per project) ────────────────────────────────────────
function PMAssignPanel({ projectId, assignedPmIds }: { projectId: string; assignedPmIds: string[] }) {
  const { allUsers } = useAuth()
  const { assignProjectPMs } = useProgress()
  const pmUsers = allUsers.filter(u => u.role === 'pm')
  const [selected, setSelected] = useState<string[]>([...assignedPmIds])
  const [saved, setSaved] = useState(false)

  const toggle = (id: string) => {
    setSelected(prev => { setSaved(false); return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id] })
  }

  return (
    <div className="mt-3 bg-blue-50 rounded-xl p-4 border border-blue-100">
      <p className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">指派項目總監 (PM)</p>
      {pmUsers.length === 0 ? (
        <p className="text-xs text-gray-400">暫無已審批的 PM 帳戶，請先審批 PM 用戶申請</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {pmUsers.map(u => {
            const on = selected.includes(u.id)
            return (
              <button key={u.id} onClick={() => toggle(u.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${on ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{u.avatar}</span>
                {u.name}
              </button>
            )
          })}
        </div>
      )}
      <button onClick={() => { assignProjectPMs(projectId, selected); setSaved(true) }}
        className={`text-xs px-4 py-2 rounded-lg font-semibold transition-all ${saved ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
        {saved ? '✓ 已儲存' : '儲存指派'}
      </button>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
type AdminTab = 'projects' | 'applications' | 'users'

export default function SuperAdminDashboard() {
  const { user, logout, pendingUsers, approveUser, rejectUser, allUsers } = useAuth()
  const { projects } = useProgress()

  const [activeTab, setActiveTab] = useState<AdminTab>('projects')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedProject, setExpandedProject] = useState<string | null>(null)

  const tabs: { id: AdminTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'projects',      label: '項目管理',   icon: Building2 },
    { id: 'applications',  label: '用戶申請',   icon: Clock,  badge: pendingUsers.length },
    { id: 'users',         label: '用戶管理',   icon: Users },
  ]

  const projectUserCount = useMemo(() => {
    const m: Record<string, number> = {}
    allUsers.forEach(u => { if (u.projectId) m[u.projectId] = (m[u.projectId] ?? 0) + 1 })
    return m
  }, [allUsers])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">系統管理後台</h1>
            <p className="text-xs text-gray-400">{user?.name} · 系統管理員</p>
          </div>
        </div>
        <button onClick={logout}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50">
          <LogOut size={14} /> 登出
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 mb-6 w-fit">
          {tabs.map(t => {
            const Icon = t.icon
            const active = activeTab === t.id
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-rose-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                <Icon size={15} />
                {t.label}
                {(t.badge ?? 0) > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white text-rose-600' : 'bg-rose-100 text-rose-600'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Projects tab ── */}
        {activeTab === 'projects' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">項目管理</h2>
                <p className="text-xs text-gray-400">建立項目並設定每個項目的功能模組</p>
              </div>
              <button onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold">
                <FolderPlus size={15} /> 建立新項目
              </button>
            </div>

            <div className="space-y-3">
              {projects.map(proj => {
                const isOpen = expandedProject === proj.id
                const userCount = projectUserCount[proj.id] ?? 0
                const pending = pendingUsers.filter(p => p.projectId === proj.id).length
                return (
                  <div key={proj.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedProject(isOpen ? null : proj.id)}
                      className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                          <Building2 size={18} className="text-rose-600" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{proj.name}</p>
                          <p className="text-xs text-gray-400">{proj.siteAddress || proj.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-gray-400">{userCount} 位用戶</p>
                          {pending > 0 && <p className="text-xs text-amber-600 font-semibold">{pending} 待審批</p>}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${proj.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {proj.status === 'active' ? '進行中' : proj.status === 'completed' ? '已完成' : '封存'}
                        </span>
                        {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 border-t border-gray-100">
                        {/* Module badges */}
                        <div className="flex flex-wrap gap-1.5 mt-4 mb-2">
                          {ALL_MODULES.map(m => {
                            const on = proj.enabledModules.includes(m.key)
                            return (
                              <span key={m.key}
                                className={`text-xs px-2.5 py-1 rounded-full border font-medium ${on ? MODULE_COLOR[m.key] : 'bg-gray-100 text-gray-400 border-gray-200 line-through'}`}>
                                {m.label}
                              </span>
                            )
                          })}
                        </div>
                        <ModuleConfigPanel projectId={proj.id} enabledModules={proj.enabledModules} />
                        <PMAssignPanel projectId={proj.id} assignedPmIds={proj.assignedPmIds ?? []} />
                      </div>
                    )}
                  </div>
                )
              })}
              {projects.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Building2 size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">尚無項目，請點「建立新項目」開始</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Applications tab ── */}
        {activeTab === 'applications' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">用戶申請審批</h2>
            <p className="text-xs text-gray-400 mb-5">審批所有項目的新用戶申請</p>

            {pendingUsers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">目前沒有待審批的申請</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map(p => {
                  const proj = projects.find(pr => pr.id === p.projectId)
                  return (
                    <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-lg flex-shrink-0">
                        {p.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500">@{p.username} · {p.roleZh} · {p.company}</p>
                        {proj && <p className="text-xs text-blue-600 font-medium mt-0.5">申請加入：{proj.name}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          申請時間：{new Date(p.requestedAt).toLocaleString('zh-HK')}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => rejectUser(p.id)}
                          className="flex items-center gap-1.5 text-xs border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl font-semibold">
                          <XCircle size={13} /> 拒絕
                        </button>
                        <button onClick={() => approveUser(p.id)}
                          className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl font-semibold">
                          <CheckCircle size={13} /> 批准
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Users tab ── */}
        {activeTab === 'users' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">用戶管理</h2>
            <p className="text-xs text-gray-400 mb-5">所有已註冊用戶（跨項目）</p>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left font-medium">用戶</th>
                    <th className="px-5 py-3 text-left font-medium">角色</th>
                    <th className="px-5 py-3 text-left font-medium">公司</th>
                    <th className="px-5 py-3 text-left font-medium">所屬項目</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.filter(u => u.role !== 'super-admin').map(u => {
                    const proj = projects.find(p => p.id === u.projectId)
                    return (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                              {u.avatar}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800">{u.name}</p>
                              <p className="text-xs text-gray-400">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-600">{u.roleZh}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{u.company}</td>
                        <td className="px-5 py-3 text-xs">
                          {proj
                            ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{proj.name}</span>
                            : <span className="text-gray-400">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && <CreateProjectModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
