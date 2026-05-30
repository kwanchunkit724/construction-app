import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Rocket, ListChecks, PlayCircle, BookOpen, MessageSquare,
  TrendingUp, Users, Sparkles, Send, Plus, Trash2, Edit3, X, Check,
  Smartphone, Globe, AppWindow, Loader2, AlertCircle, LogIn, LogOut,
} from 'lucide-react'
import { MissionProvider, useMission } from '../contexts/MissionContext'
import type {
  MissionTask, MissionTaskStatus, MissionTaskPriority,
  MissionTaskCategory, MissionTaskOwner, NewMissionTask,
} from '../contexts/MissionContext'
import { useAuth } from '../contexts/AuthContext'

const STATUS_ZH: Record<MissionTaskStatus, string> = {
  pending: '待辦',
  in_progress: '進行中',
  completed: '完成',
  blocked: '阻塞',
}
const STATUS_COLOR: Record<MissionTaskStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}
const PRIORITY_ZH: Record<MissionTaskPriority, string> = {
  low: '低', medium: '中', high: '高', urgent: '緊急',
}
const PRIORITY_COLOR: Record<MissionTaskPriority, string> = {
  low: 'bg-site-100 text-site-600',
  medium: 'bg-site-200 text-site-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-600 text-white',
}
const CATEGORY_ZH: Record<MissionTaskCategory, string> = {
  outreach: '陌生開發',
  demo: '示範',
  pilot: '試用',
  product: '產品',
  infra: '基建',
  admin: '行政',
  content: '內容',
}
const OWNER_ZH: Record<MissionTaskOwner, string> = {
  user: '你', agent: '我 (Claude)', both: '一齊',
}

type Tab = 'overview' | 'tasks' | 'demos' | 'kit' | 'chat'

export default function MissionPage() {
  return (
    <MissionProvider>
      <MissionShell />
    </MissionProvider>
  )
}

function MissionShell() {
  const [tab, setTab] = useState<Tab>('overview')
  const { profile, signOut } = useAuth()
  const { canWrite, loading, error } = useMission()

  return (
    <div className="min-h-screen bg-gradient-to-b from-site-50 to-white">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-site-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-safety-500 text-white grid place-items-center font-bold flex-shrink-0">CK</div>
            <div className="min-w-0">
              <div className="font-heading font-semibold text-site-900 truncate">Mission Control</div>
              <div className="text-xs text-site-500 truncate">CK工程 銷售指揮中心 · public read · {canWrite ? 'admin write' : 'view-only'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile ? (
              <>
                <span className="hidden sm:inline text-xs text-site-600">{profile.name} · {profile.global_role}</span>
                <button onClick={() => void signOut()} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
                  <LogOut size={14} /> 登出
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                <LogIn size={14} /> 管理員登入
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={<TrendingUp size={16} />}>總覽</TabBtn>
          <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<ListChecks size={16} />}>任務</TabBtn>
          <TabBtn active={tab === 'demos'} onClick={() => setTab('demos')} icon={<PlayCircle size={16} />}>示範</TabBtn>
          <TabBtn active={tab === 'kit'} onClick={() => setTab('kit')} icon={<BookOpen size={16} />}>銷售工具</TabBtn>
          <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageSquare size={16} />}>溝通</TabBtn>
        </nav>
      </header>

      {/* Body */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
        {loading && (
          <div className="card flex items-center gap-2 text-site-500">
            <Loader2 className="animate-spin" size={18} /> 載入中...
          </div>
        )}
        {error && (
          <div className="card border-red-200 bg-red-50 text-red-700 flex items-start gap-2">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">資料載入錯誤</div>
              <div className="text-sm">{error}</div>
              <div className="text-xs mt-2 text-red-600">
                提示: 如果 mission_tasks 表唔存在, 需要喺 Supabase Dashboard apply <code>supabase/v22-mission-control.sql</code>.
              </div>
            </div>
          </div>
        )}
        {!loading && !error && (
          <>
            {tab === 'overview' && <OverviewTab onJump={setTab} />}
            {tab === 'tasks' && <TasksTab />}
            {tab === 'demos' && <DemosTab />}
            {tab === 'kit' && <KitTab />}
            {tab === 'chat' && <ChatTab />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-site-200 py-4 text-center text-xs text-site-500">
        <Sparkles size={12} className="inline mr-1" />
        Built by Claude · last sync realtime · share this URL anywhere
      </footer>
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
        active ? 'border-safety-500 text-safety-700' : 'border-transparent text-site-500 hover:text-site-700'
      }`}
    >
      {icon} {children}
    </button>
  )
}

// ── OVERVIEW ────────────────────────────────────────────────
function OverviewTab({ onJump }: { onJump: (t: Tab) => void }) {
  const { metrics, tasks, log } = useMission()
  const targetMrr = 11400
  const pct = metrics ? Math.min(100, Math.round((metrics.mrr_hkd / targetMrr) * 100)) : 0
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed')
  const recentLog = log.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Current focus banner */}
      {metrics?.current_focus && (
        <div className="card bg-gradient-to-r from-safety-500 to-safety-600 text-white border-0">
          <div className="flex items-start gap-2">
            <Rocket size={20} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium uppercase tracking-wide opacity-90">而家專注</div>
              <div className="font-heading text-base mt-1">{metrics.current_focus}</div>
            </div>
          </div>
        </div>
      )}

      {/* MRR progress */}
      <div className="card">
        <div className="flex items-baseline justify-between mb-2">
          <div className="font-heading text-site-900">每月經常性收入 (MRR) · 30 日目標</div>
          <div className="text-sm text-site-500">目標 HK$ {targetMrr.toLocaleString()}</div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="font-heading text-3xl text-safety-700">HK$ {metrics?.mrr_hkd?.toLocaleString() ?? 0}</div>
          <div className="text-site-500">/ {pct}%</div>
        </div>
        <div className="mt-3 h-3 rounded-full bg-site-100 overflow-hidden">
          <div className="h-full bg-safety-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="付費客戶" value={metrics?.customers_signed ?? 0} target={3} />
        <Kpi label="試用中" value={metrics?.pilots_active ?? 0} target={5} />
        <Kpi label="完成示範" value={metrics?.demos_run ?? 0} target={10} />
        <Kpi label="陌生開發發出" value={metrics?.outreach_sent ?? 0} target={30} />
      </div>

      {/* Task summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading text-site-900">任務狀態</div>
            <button onClick={() => onJump('tasks')} className="text-xs text-safety-700 hover:underline">睇全部 →</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="待辦" value={pendingCount} color="bg-amber-100 text-amber-700" />
            <Mini label="進行中" value={inProgressCount} color="bg-blue-100 text-blue-700" />
          </div>
          {urgentTasks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-site-200">
              <div className="text-xs font-medium text-red-700 mb-1.5">⚠ 緊急任務</div>
              <ul className="text-sm text-site-700 space-y-1">
                {urgentTasks.map(t => (
                  <li key={t.id} className="truncate">· {t.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading text-site-900">最新訊息</div>
            <button onClick={() => onJump('chat')} className="text-xs text-safety-700 hover:underline">睇全部 →</button>
          </div>
          {recentLog.length === 0 ? (
            <div className="text-sm text-site-500">未有訊息</div>
          ) : (
            <ul className="space-y-2">
              {recentLog.map(e => (
                <li key={e.id} className="text-sm">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-1.5 ${
                    e.author === 'agent' ? 'bg-blue-100 text-blue-700' :
                    e.author === 'system' ? 'bg-site-100 text-site-600' :
                    'bg-safety-100 text-safety-700'
                  }`}>{e.author}</span>
                  <span className="text-site-700 line-clamp-2">{e.body}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="card">
      <div className="text-xs text-site-500">{label}</div>
      <div className="font-heading text-2xl text-site-900 mt-1">{value}<span className="text-sm text-site-400">/{target}</span></div>
      <div className="mt-2 h-1.5 rounded-full bg-site-100 overflow-hidden">
        <div className="h-full bg-safety-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="font-heading text-2xl mt-0.5">{value}</div>
    </div>
  )
}

// ── TASKS ───────────────────────────────────────────────────
function TasksTab() {
  const { tasks, canWrite, createTask, updateTask, deleteTask } = useMission()
  const [filter, setFilter] = useState<MissionTaskStatus | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return tasks.filter(t => filter === 'all' || t.status === filter)
  }, [tasks, filter])

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>全部 ({tasks.length})</FilterChip>
        <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>待辦 ({tasks.filter(t => t.status === 'pending').length})</FilterChip>
        <FilterChip active={filter === 'in_progress'} onClick={() => setFilter('in_progress')}>進行中 ({tasks.filter(t => t.status === 'in_progress').length})</FilterChip>
        <FilterChip active={filter === 'completed'} onClick={() => setFilter('completed')}>完成 ({tasks.filter(t => t.status === 'completed').length})</FilterChip>
        <FilterChip active={filter === 'blocked'} onClick={() => setFilter('blocked')}>阻塞 ({tasks.filter(t => t.status === 'blocked').length})</FilterChip>
        <div className="flex-1" />
        {canWrite && !adding && (
          <button onClick={() => setAdding(true)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
            <Plus size={14} /> 加任務
          </button>
        )}
      </div>

      {adding && canWrite && (
        <TaskEditor
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            const { error } = await createTask(input)
            if (!error) setAdding(false)
          }}
        />
      )}

      {filtered.length === 0 ? (
        <div className="card text-site-500 text-center py-8">冇任務</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(t => (
            <li key={t.id}>
              {editingId === t.id ? (
                <TaskEditor
                  initial={t}
                  onCancel={() => setEditingId(null)}
                  onSave={async (input) => {
                    const { error } = await updateTask(t.id, input)
                    if (!error) setEditingId(null)
                  }}
                />
              ) : (
                <TaskRow
                  task={t}
                  canWrite={canWrite}
                  onEdit={() => setEditingId(t.id)}
                  onDelete={() => void deleteTask(t.id)}
                  onStatusToggle={(next) => void updateTask(t.id, { status: next })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition ${
        active ? 'bg-safety-500 text-white' : 'bg-site-100 text-site-700 hover:bg-site-200'
      }`}
    >
      {children}
    </button>
  )
}

function TaskRow({ task, canWrite, onEdit, onDelete, onStatusToggle }: {
  task: MissionTask
  canWrite: boolean
  onEdit: () => void
  onDelete: () => void
  onStatusToggle: (next: MissionTaskStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`card ${task.status === 'completed' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {canWrite && (
          <button
            onClick={() => onStatusToggle(task.status === 'completed' ? 'pending' : 'completed')}
            className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 grid place-items-center ${
              task.status === 'completed' ? 'bg-green-600 border-green-600 text-white' : 'border-site-300 hover:border-site-500'
            }`}
          >
            {task.status === 'completed' && <Check size={12} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded(e => !e)} className="text-left w-full">
            <div className={`font-medium text-site-900 ${task.status === 'completed' ? 'line-through' : ''}`}>{task.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status]}`}>{STATUS_ZH[task.status]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_ZH[task.priority]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-site-100 text-site-600">{CATEGORY_ZH[task.category]}</span>
              <span className="text-xs text-site-500">負責: {OWNER_ZH[task.owner]}</span>
              {task.due_date && <span className="text-xs text-site-500">截止: {task.due_date}</span>}
            </div>
          </button>
          {expanded && task.description && (
            <div className="mt-3 text-sm text-site-700 whitespace-pre-wrap bg-site-50 rounded-lg p-3">{task.description}</div>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-col gap-1">
            <button onClick={onEdit} className="p-1.5 text-site-500 hover:text-site-900"><Edit3 size={14} /></button>
            <button onClick={() => { if (confirm('刪除任務?')) onDelete() }} className="p-1.5 text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function TaskEditor({ initial, onCancel, onSave }: {
  initial?: MissionTask
  onCancel: () => void
  onSave: (input: NewMissionTask) => Promise<void>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<MissionTaskStatus>(initial?.status ?? 'pending')
  const [priority, setPriority] = useState<MissionTaskPriority>(initial?.priority ?? 'medium')
  const [category, setCategory] = useState<MissionTaskCategory>(initial?.category ?? 'outreach')
  const [owner, setOwner] = useState<MissionTaskOwner>(initial?.owner ?? 'user')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), description, status, priority, category, owner })
    setSaving(false)
  }

  return (
    <div className="card border-safety-300">
      <input
        className="input w-full font-medium"
        placeholder="任務標題"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className="input w-full mt-2 text-sm"
        placeholder="描述 (可選)"
        rows={3}
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        <Select label="狀態" value={status} onChange={v => setStatus(v as MissionTaskStatus)} options={Object.entries(STATUS_ZH)} />
        <Select label="優先" value={priority} onChange={v => setPriority(v as MissionTaskPriority)} options={Object.entries(PRIORITY_ZH)} />
        <Select label="類別" value={category} onChange={v => setCategory(v as MissionTaskCategory)} options={Object.entries(CATEGORY_ZH)} />
        <Select label="負責" value={owner} onChange={v => setOwner(v as MissionTaskOwner)} options={Object.entries(OWNER_ZH)} />
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={onCancel} className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1"><X size={14} /> 取消</button>
        <button onClick={save} disabled={saving || !title.trim()} className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 儲存
        </button>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-xs">
      <div className="text-site-500 mb-0.5">{label}</div>
      <select className="input w-full text-sm" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  )
}

// ── DEMOS ───────────────────────────────────────────────────
function DemosTab() {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-heading text-site-900 mb-3 flex items-center gap-2"><AppWindow size={18} /> 真實 App — 直接俾客戶試</div>
        <div className="grid md:grid-cols-3 gap-3">
          <DemoLink
            icon={<Smartphone size={20} />}
            title="iOS App Store"
            sub="v1.1 LIVE · 公開下載"
            href="https://apps.apple.com/app/id6764754372"
          />
          <DemoLink
            icon={<Smartphone size={20} />}
            title="Android Play 封閉測試"
            sub="先 opt-in 再下載"
            href="https://play.google.com/apps/testing/com.kwanchunkit.constructionapp"
          />
          <DemoLink
            icon={<Globe size={20} />}
            title="Web 版生產"
            sub="即開即用 · 無需安裝"
            href="https://construction-app-lime-six.vercel.app"
          />
        </div>
      </div>

      <div className="card">
        <div className="font-heading text-site-900 mb-2">測試帳號 — 5 個角色現場 demo</div>
        <div className="text-sm text-site-500 mb-3">所有密碼: <code className="bg-site-100 px-1.5 py-0.5 rounded">test1234</code> · 項目: DC2026 油塘住宅</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-site-500 border-b border-site-200">
                <th className="py-2 pr-3">電話</th>
                <th className="py-2 pr-3">角色</th>
                <th className="py-2 pr-3">名</th>
                <th className="py-2 pr-3">可做嘅事</th>
              </tr>
            </thead>
            <tbody className="text-site-800">
              <tr className="border-b border-site-100"><td className="py-2 pr-3 font-mono">60001001</td><td className="py-2 pr-3">PM</td><td className="py-2 pr-3">李 PM</td><td className="py-2 pr-3 text-site-600">睇晒 4 zones · 加大項 · 指派</td></tr>
              <tr className="border-b border-site-100"><td className="py-2 pr-3 font-mono">60001002</td><td className="py-2 pr-3">老總</td><td className="py-2 pr-3">王老總</td><td className="py-2 pr-3 text-site-600">加事件 · 同 PM 同等權限</td></tr>
              <tr className="border-b border-site-100"><td className="py-2 pr-3 font-mono">60001003</td><td className="py-2 pr-3">工程師</td><td className="py-2 pr-3">陳工程師</td><td className="py-2 pr-3 text-site-600">寫 daily · 自己 items</td></tr>
              <tr className="border-b border-site-100"><td className="py-2 pr-3 font-mono">60001004</td><td className="py-2 pr-3">管工</td><td className="py-2 pr-3">黃管工</td><td className="py-2 pr-3 text-site-600">寫 daily · zone chips</td></tr>
              <tr><td className="py-2 pr-3 font-mono">60001005</td><td className="py-2 pr-3">判頭</td><td className="py-2 pr-3">何判頭</td><td className="py-2 pr-3 text-site-600">急件物料 · 自己 items 觀察</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="font-heading text-site-900 mb-3">20 分鐘現場 demo 流程</div>
        <ol className="text-sm text-site-700 space-y-1.5 list-decimal pl-5">
          <li>1-3 分鐘: 判頭 view — progress tree, 物料 急件 toggle</li>
          <li>3-5 分鐘: Daily log workflow (黃管工 寫 → PM 即收)</li>
          <li>5-7 分鐘: PM supervisor view (4 zones, 統計卡)</li>
          <li>7-9 分鐘: 老總 加事件 + multi-zone peer apply</li>
          <li>9-11 分鐘: 物料 RBAC + 急件 list</li>
          <li>11-13 分鐘: 指派 + multi-tab safety</li>
          <li>13-15 分鐘: PDF / Excel export</li>
          <li>15-17 分鐘: 帳號刪除 (Apple compliance)</li>
          <li>17-19 分鐘: Q&A</li>
          <li>19-20 分鐘: <strong>Pilot 1 個月 $0</strong> 收結</li>
        </ol>
        <a
          href="https://github.com/kwanchunkit724/construction-app/blob/main/.planning/sales-kit/05-DEMO-SCRIPT.md"
          target="_blank" rel="noreferrer"
          className="inline-block mt-3 text-xs text-safety-700 hover:underline"
        >睇完整 demo 劇本 →</a>
      </div>
    </div>
  )
}

function DemoLink({ icon, title, sub, href }: { icon: React.ReactNode; title: string; sub: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="card hover:border-safety-500 hover:shadow-card-md transition flex items-start gap-3">
      <div className="text-safety-600 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-site-900 truncate">{title}</div>
        <div className="text-xs text-site-500 truncate">{sub}</div>
      </div>
    </a>
  )
}

// ── KIT ─────────────────────────────────────────────────────
function KitTab() {
  const baseUrl = 'https://github.com/kwanchunkit724/construction-app/blob/main/.planning/sales-kit'
  const files: { num: string; title: string; sub: string }[] = [
    { num: '00', title: 'README', sub: '索引 + positioning one-liner' },
    { num: '01', title: '客戶輪廓', sub: '4 personas + 4 firm tiers' },
    { num: '02', title: '市場渠道', sub: 'LinkedIn / CIC / RICS / BCA' },
    { num: '03', title: '陌生開發 scripts', sub: '10 個 zh-HK + EN' },
    { num: '04', title: '12-slide 推介書', sub: '可改成 PPTX' },
    { num: '05', title: 'Demo 劇本', sub: '20 分鐘現場 flow' },
    { num: '06', title: '定價 + 合約', sub: '4 tiers + ROI math' },
    { num: '07', title: '反對處理', sub: '12 objections + 答' },
    { num: '08', title: '追蹤框架', sub: 'CRM + 階段定義' },
    { num: '09', title: '30 日啟動計劃', sub: 'Day 1-30 + 進度追蹤' },
  ]

  return (
    <div className="space-y-4">
      <div className="card bg-gradient-to-r from-site-50 to-safety-50 border-safety-200">
        <div className="font-heading text-site-900">定位一句話 (canonical)</div>
        <div className="text-sm text-site-700 mt-2 leading-relaxed">
          「CK工程取代地盤嘅 WhatsApp + Excel + 紙簿。判頭、工程師、PM 一齊喺同一個 app 寫每日進度、報問題、申請物料、簽 PTW。出 dispute 嗰時，每一個 action 都有時間戳同 audit trail。」
        </div>
      </div>

      <div className="card">
        <div className="font-heading text-site-900 mb-3">定價 — 快速參考</div>
        <div className="grid md:grid-cols-4 gap-2 text-sm">
          <PriceCard tier="試用 Pilot" price="HK$0" sub="1 個月" />
          <PriceCard tier="Standard" price="HK$3,800/月" sub="每個項目" highlight />
          <PriceCard tier="Pro" price="HK$9,800/月" sub="無限項目" />
          <PriceCard tier="創始客戶價" price="HK$2,850/月" sub="鎖 12 個月 · 6/30 前簽" highlight />
        </div>
      </div>

      <div className="card">
        <div className="font-heading text-site-900 mb-3">10 份文件 — 全部喺 GitHub repo</div>
        <ul className="space-y-1.5">
          {files.map(f => (
            <li key={f.num}>
              <a
                href={`${baseUrl}/${f.num === '00' ? '00-README.md' :
                  f.num === '01' ? '01-CUSTOMER-PROFILES.md' :
                  f.num === '02' ? '02-MARKET-CHANNELS.md' :
                  f.num === '03' ? '03-OUTREACH-SCRIPTS.md' :
                  f.num === '04' ? '04-PITCH-DECK.md' :
                  f.num === '05' ? '05-DEMO-SCRIPT.md' :
                  f.num === '06' ? '06-PRICING-PACKAGES.md' :
                  f.num === '07' ? '07-OBJECTION-HANDLERS.md' :
                  f.num === '08' ? '08-FOLLOWUP-FRAMEWORK.md' :
                  '09-30-DAY-LAUNCH-PLAN.md'}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-site-50 transition"
              >
                <span className="text-xs font-mono text-site-400 w-6">{f.num}</span>
                <span className="flex-1 font-medium text-site-900">{f.title}</span>
                <span className="text-xs text-site-500 hidden sm:inline">{f.sub}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PriceCard({ tier, price, sub, highlight }: { tier: string; price: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'border-safety-400 bg-safety-50' : 'border-site-200 bg-white'}`}>
      <div className="text-xs text-site-500">{tier}</div>
      <div className="font-heading text-site-900 mt-1">{price}</div>
      <div className="text-xs text-site-500 mt-0.5">{sub}</div>
    </div>
  )
}

// ── CHAT ────────────────────────────────────────────────────
function ChatTab() {
  const { log, postLog, canWrite } = useMission()
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  async function send() {
    if (!body.trim()) return
    setPosting(true)
    const { error } = await postLog(body.trim())
    if (!error) setBody('')
    setPosting(false)
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="font-heading text-site-900 mb-1">溝通記錄</div>
        <div className="text-xs text-site-500">附加訊息會儲存喺 Supabase mission_log table · 任何人可以睇 · 只有 admin 可以 post</div>
      </div>

      {canWrite && (
        <div className="card">
          <textarea
            className="input w-full text-sm"
            placeholder="留言... (例如新進展 / 問題 / 反饋)"
            rows={3}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={send}
              disabled={posting || !body.trim()}
              className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 發送
            </button>
          </div>
        </div>
      )}

      {!canWrite && (
        <div className="card bg-blue-50 border-blue-200 text-sm text-blue-700">
          想留言? <Link to="/login" className="underline font-medium">登入 admin 帳戶</Link>
        </div>
      )}

      <ul className="space-y-2">
        {log.length === 0 ? (
          <li className="card text-center text-site-500 py-8">未有訊息</li>
        ) : log.map(e => (
          <li key={e.id} className="card">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                e.author === 'agent' ? 'bg-blue-100 text-blue-700' :
                e.author === 'system' ? 'bg-site-100 text-site-600' :
                'bg-safety-100 text-safety-700'
              }`}>{e.author === 'user' ? '你' : e.author === 'agent' ? 'Claude' : 'system'}</span>
              <span className="text-xs text-site-400">{new Date(e.created_at).toLocaleString('zh-HK')}</span>
              {e.tags.length > 0 && e.tags.map(t => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-site-100 text-site-500">#{t}</span>
              ))}
            </div>
            <div className="text-sm text-site-800 whitespace-pre-wrap">{e.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
