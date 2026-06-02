import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Rocket, ListChecks, PlayCircle, BookOpen, MessageSquare,
  TrendingUp, Users, Sparkles, Send, Plus, Trash2, Edit3, X, Check,
  Smartphone, Globe, AppWindow, Loader2, AlertCircle, LogIn, LogOut,
  FileDown, Presentation, ExternalLink,
} from 'lucide-react'
import { MissionProvider, useMission } from '../contexts/MissionContext'
import type {
  MissionTask, MissionTaskStatus, MissionTaskPriority,
  MissionTaskCategory, MissionTaskOwner, NewMissionTask,
  Lead, LeadStatus,
} from '../contexts/MissionContext'
import { useAuth } from '../contexts/AuthContext'

// Dark "industrial blueprint" theme to match /#/sell.
const PANEL = 'rounded-2xl bg-white/[0.03] border border-white/10'
const PANEL_HOVER = 'rounded-2xl bg-white/[0.03] border border-white/10 hover:border-safety-500/50 hover:bg-white/[0.05] transition'
const DINPUT = 'w-full rounded-xl bg-site-900 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-site-500 focus:border-safety-500 focus:ring-1 focus:ring-safety-500 outline-none transition'
const GHOST = 'border border-white/20 text-white hover:bg-white/5 rounded-lg transition'
const PRIMARY = 'bg-safety-500 hover:bg-safety-600 text-white rounded-lg transition'
const GRID_DARK: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
}

const STATUS_ZH: Record<MissionTaskStatus, string> = {
  pending: '待辦', in_progress: '進行中', completed: '完成', blocked: '阻塞',
}
const STATUS_COLOR: Record<MissionTaskStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  completed: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
  blocked: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
}
const PRIORITY_ZH: Record<MissionTaskPriority, string> = {
  low: '低', medium: '中', high: '高', urgent: '緊急',
}
const PRIORITY_COLOR: Record<MissionTaskPriority, string> = {
  low: 'bg-white/5 text-site-400 ring-1 ring-white/10',
  medium: 'bg-white/10 text-site-300 ring-1 ring-white/10',
  high: 'bg-safety-500/15 text-safety-400 ring-1 ring-safety-500/30',
  urgent: 'bg-red-600 text-white',
}
const CATEGORY_ZH: Record<MissionTaskCategory, string> = {
  outreach: '陌生開發', demo: '示範', pilot: '試用', product: '產品',
  infra: '基建', admin: '行政', content: '內容',
}
const OWNER_ZH: Record<MissionTaskOwner, string> = {
  user: '你', agent: '我 (Claude)', both: '一齊',
}

type Tab = 'overview' | 'tasks' | 'leads' | 'demos' | 'kit' | 'chat'

const LEAD_STATUS_ZH: Record<LeadStatus, string> = {
  new: '新', contacted: '已聯絡', demo: '示範', pilot: '試用中', won: '成交', lost: '流失',
}
const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  new: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  contacted: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  demo: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30',
  pilot: 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30',
  won: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
  lost: 'bg-white/5 text-site-400 ring-1 ring-white/10',
}

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
    <div className="relative min-h-screen bg-site-950 text-white font-sans antialiased">
      <div className="absolute inset-0 pointer-events-none" style={GRID_DARK} />
      <div className="absolute -top-40 right-0 w-[40rem] h-[40rem] rounded-full bg-safety-500/10 blur-[140px] pointer-events-none" />

      {/* Top bar */}
      <header className="relative sticky top-0 z-20 bg-site-950/85 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-safety-500 text-white grid place-items-center font-heading font-extrabold flex-shrink-0 shadow-[0_4px_16px_-4px_rgba(249,115,22,0.6)]">CK</div>
            <div className="min-w-0">
              <div className="font-heading font-bold text-white truncate">Mission Control</div>
              <div className="text-xs text-site-400 truncate font-mono">CK工程 銷售指揮中心 · {canWrite ? 'admin write' : 'view-only'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile ? (
              <>
                <span className="hidden sm:inline text-xs text-site-400 font-mono">{profile.name} · {profile.global_role}</span>
                <button onClick={() => void signOut()} className={`${GHOST} text-xs px-3 py-1.5 flex items-center gap-1`}>
                  <LogOut size={14} /> 登出
                </button>
              </>
            ) : (
              <Link to="/login" className={`${PRIMARY} text-xs px-3 py-1.5 flex items-center gap-1 font-semibold`}>
                <LogIn size={14} /> 管理員登入
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto">
          <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} icon={<TrendingUp size={16} />}>總覽</TabBtn>
          <TabBtn active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<ListChecks size={16} />}>任務</TabBtn>
          {canWrite && (
            <TabBtn active={tab === 'leads'} onClick={() => setTab('leads')} icon={<Users size={16} />}>潛在客戶</TabBtn>
          )}
          <TabBtn active={tab === 'demos'} onClick={() => setTab('demos')} icon={<PlayCircle size={16} />}>示範</TabBtn>
          <TabBtn active={tab === 'kit'} onClick={() => setTab('kit')} icon={<BookOpen size={16} />}>銷售工具</TabBtn>
          <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={<MessageSquare size={16} />}>溝通</TabBtn>
        </nav>
      </header>

      {/* Body */}
      <main className="relative max-w-6xl mx-auto px-4 py-6 pb-24">
        {loading && (
          <div className={`${PANEL} p-4 flex items-center gap-2 text-site-400`}>
            <Loader2 className="animate-spin" size={18} /> 載入中...
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300 p-4 flex items-start gap-2">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-200">資料載入錯誤</div>
              <div className="text-sm">{error}</div>
              <div className="text-xs mt-2 text-red-400">
                提示: 如果 mission_tasks 表唔存在, 需要喺 Supabase Dashboard apply <code className="font-mono">supabase/v22-mission-control.sql</code>.
              </div>
            </div>
          </div>
        )}
        {!loading && !error && (
          <>
            {tab === 'overview' && <OverviewTab onJump={setTab} />}
            {tab === 'tasks' && <TasksTab />}
            {tab === 'leads' && <LeadsTab />}
            {tab === 'demos' && <DemosTab />}
            {tab === 'kit' && <KitTab />}
            {tab === 'chat' && <ChatTab />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/10 py-5 text-center text-xs text-site-500 font-mono">
        <Sparkles size={12} className="inline mr-1 text-safety-500" />
        Built by Claude · last sync realtime · share this URL anywhere
      </footer>
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
        active ? 'border-safety-500 text-safety-400' : 'border-transparent text-site-400 hover:text-white'
      }`}
    >
      {icon} {children}
    </button>
  )
}

// ── OVERVIEW ────────────────────────────────────────────────
function OverviewTab({ onJump }: { onJump: (t: Tab) => void }) {
  const { metrics, tasks, log, leads, canWrite } = useMission()
  const [editing, setEditing] = useState(false)
  const newLeads = leads.filter(l => l.status === 'new').length
  const targetMrr = 11400
  const pct = metrics ? Math.min(100, Math.round((metrics.mrr_hkd / targetMrr) * 100)) : 0
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed')
  const recentLog = log.slice(0, 5)

  if (editing && canWrite) {
    return <MetricsEditor onClose={() => setEditing(false)} />
  }

  return (
    <div className="space-y-6">
      {/* Admin edit bar */}
      {canWrite && (
        <div className="flex justify-end">
          <button onClick={() => setEditing(true)} className={`${GHOST} text-xs px-3 py-1.5 flex items-center gap-1`}>
            <Edit3 size={14} /> 更新數字
          </button>
        </div>
      )}

      {/* New leads alert */}
      {canWrite && newLeads > 0 && (
        <button onClick={() => onJump('leads')} className="w-full rounded-2xl bg-green-500/10 border border-green-500/30 p-4 text-left flex items-center gap-2.5 hover:bg-green-500/15 transition">
          <Users size={18} className="text-green-400 flex-shrink-0" />
          <span className="text-sm text-green-300"><strong className="text-green-200">{newLeads}</strong> 個新潛在客戶查詢 — 撳入去跟進 →</span>
        </button>
      )}

      {/* Current focus banner */}
      {metrics?.current_focus && (
        <div className="relative rounded-2xl overflow-hidden">
          <div className="h-1.5 w-full" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #f97316 0 14px, #0f172a 14px 28px)' }} />
          <div className="bg-gradient-to-r from-safety-500 to-safety-600 text-white p-5">
            <div className="flex items-start gap-2.5">
              <Rocket size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-widest opacity-90">而家專注</div>
                <div className="font-heading text-base mt-1">{metrics.current_focus}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MRR progress */}
      <div className={`${PANEL} p-5`}>
        <div className="flex items-baseline justify-between mb-2">
          <div className="font-heading font-semibold text-white">每月經常性收入 (MRR) · 30 日目標</div>
          <div className="text-sm text-site-400 font-mono">目標 HK$ {targetMrr.toLocaleString()}</div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="font-heading text-4xl font-extrabold text-safety-500 tabular-nums">HK$ {metrics?.mrr_hkd?.toLocaleString() ?? 0}</div>
          <div className="text-site-400 font-mono">/ {pct}%</div>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-white/10 overflow-hidden">
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
        <div className={`${PANEL} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading font-semibold text-white">任務狀態</div>
            <button onClick={() => onJump('tasks')} className="text-xs text-safety-400 hover:text-safety-300 transition">睇全部 →</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Mini label="待辦" value={pendingCount} color="bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30" />
            <Mini label="進行中" value={inProgressCount} color="bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30" />
          </div>
          {urgentTasks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-xs font-semibold text-red-400 mb-1.5">⚠ 緊急任務</div>
              <ul className="text-sm text-site-300 space-y-1">
                {urgentTasks.map(t => (
                  <li key={t.id} className="truncate">· {t.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={`${PANEL} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading font-semibold text-white">最新訊息</div>
            <button onClick={() => onJump('chat')} className="text-xs text-safety-400 hover:text-safety-300 transition">睇全部 →</button>
          </div>
          {recentLog.length === 0 ? (
            <div className="text-sm text-site-400">未有訊息</div>
          ) : (
            <ul className="space-y-2">
              {recentLog.map(e => (
                <li key={e.id} className="text-sm">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-1.5 font-mono ${
                    e.author === 'agent' ? 'bg-blue-500/15 text-blue-400' :
                    e.author === 'system' ? 'bg-white/10 text-site-400' :
                    'bg-safety-500/15 text-safety-400'
                  }`}>{e.author}</span>
                  <span className="text-site-300 line-clamp-2">{e.body}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricsEditor({ onClose }: { onClose: () => void }) {
  const { metrics, updateMetrics } = useMission()
  const [mrr, setMrr] = useState(String(metrics?.mrr_hkd ?? 0))
  const [customers, setCustomers] = useState(String(metrics?.customers_signed ?? 0))
  const [pilots, setPilots] = useState(String(metrics?.pilots_active ?? 0))
  const [demos, setDemos] = useState(String(metrics?.demos_run ?? 0))
  const [outreach, setOutreach] = useState(String(metrics?.outreach_sent ?? 0))
  const [replies, setReplies] = useState(String(metrics?.replies_received ?? 0))
  const [focus, setFocus] = useState(metrics?.current_focus ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setErr(null)
    const { error } = await updateMetrics({
      mrr_hkd: Number(mrr) || 0,
      customers_signed: Number(customers) || 0,
      pilots_active: Number(pilots) || 0,
      demos_run: Number(demos) || 0,
      outreach_sent: Number(outreach) || 0,
      replies_received: Number(replies) || 0,
      current_focus: focus,
    })
    setSaving(false)
    if (error) setErr(error)
    else onClose()
  }

  const fields: [string, string, (v: string) => void][] = [
    ['MRR (HK$)', mrr, setMrr],
    ['付費客戶', customers, setCustomers],
    ['試用中', pilots, setPilots],
    ['完成示範', demos, setDemos],
    ['陌生開發發出', outreach, setOutreach],
    ['收到回覆', replies, setReplies],
  ]

  return (
    <div className={`${PANEL} border-safety-500/40 p-5 space-y-3`}>
      <div className="font-heading font-semibold text-white">更新指標數字</div>
      <label className="block text-xs">
        <div className="text-site-400 mb-1 font-mono uppercase tracking-wider">而家專注 (current focus)</div>
        <textarea className={DINPUT} rows={2} value={focus} onChange={e => setFocus(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {fields.map(([label, value, set]) => (
          <label key={label} className="block text-xs">
            <div className="text-site-400 mb-1 font-mono uppercase tracking-wider">{label}</div>
            <input type="number" inputMode="numeric" className={DINPUT} value={value} onChange={e => set(e.target.value)} />
          </label>
        ))}
      </div>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className={`${GHOST} text-sm px-3 py-1.5 flex items-center gap-1`}><X size={14} /> 取消</button>
        <button onClick={save} disabled={saving} className={`${PRIMARY} text-sm px-3 py-1.5 flex items-center gap-1 font-semibold disabled:opacity-50`}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 儲存
        </button>
      </div>
    </div>
  )
}

function Kpi({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className={`${PANEL} p-4 relative overflow-hidden`}>
      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-safety-500/60" />
      <div className="text-xs text-site-400 font-mono uppercase tracking-wider">{label}</div>
      <div className="font-heading text-3xl font-extrabold text-white mt-1 tabular-nums">{value}<span className="text-sm text-site-500 font-normal">/{target}</span></div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-safety-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-3 ${color}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="font-heading text-2xl font-bold mt-0.5 tabular-nums">{value}</div>
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
          <button onClick={() => setAdding(true)} className={`${PRIMARY} text-xs px-3 py-1.5 flex items-center gap-1 flex-shrink-0 font-semibold`}>
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
        <div className={`${PANEL} text-site-400 text-center py-8`}>冇任務</div>
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
        active ? 'bg-safety-500 text-white' : 'bg-white/5 text-site-300 ring-1 ring-white/10 hover:bg-white/10'
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
    <div className={`${PANEL} p-4 ${task.status === 'completed' ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        {canWrite && (
          <button
            onClick={() => onStatusToggle(task.status === 'completed' ? 'pending' : 'completed')}
            className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 grid place-items-center transition ${
              task.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-white/30 hover:border-safety-500'
            }`}
          >
            {task.status === 'completed' && <Check size={12} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded(e => !e)} className="text-left w-full">
            <div className={`font-medium text-white ${task.status === 'completed' ? 'line-through' : ''}`}>{task.title}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[task.status]}`}>{STATUS_ZH[task.status]}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[task.priority]}`}>{PRIORITY_ZH[task.priority]}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-site-400 ring-1 ring-white/10">{CATEGORY_ZH[task.category]}</span>
              <span className="text-xs text-site-500 font-mono">負責: {OWNER_ZH[task.owner]}</span>
              {task.due_date && <span className="text-xs text-site-500 font-mono">截止: {task.due_date}</span>}
            </div>
          </button>
          {expanded && task.description && (
            <div className="mt-3 text-sm text-site-300 whitespace-pre-wrap bg-black/30 rounded-lg p-3">{task.description}</div>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-col gap-1">
            <button onClick={onEdit} className="p-1.5 text-site-400 hover:text-white transition"><Edit3 size={14} /></button>
            <button onClick={() => { if (confirm('刪除任務?')) onDelete() }} className="p-1.5 text-red-400 hover:text-red-300 transition"><Trash2 size={14} /></button>
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
    <div className={`${PANEL} border-safety-500/40 p-4`}>
      <input
        className={`${DINPUT} font-medium`}
        placeholder="任務標題"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className={`${DINPUT} mt-2`}
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
        <button onClick={onCancel} className={`${GHOST} text-sm px-3 py-1.5 flex items-center gap-1`}><X size={14} /> 取消</button>
        <button onClick={save} disabled={saving || !title.trim()} className={`${PRIMARY} text-sm px-3 py-1.5 flex items-center gap-1 font-semibold disabled:opacity-50`}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 儲存
        </button>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-xs">
      <div className="text-site-400 mb-1 font-mono uppercase tracking-wider">{label}</div>
      <select className={`${DINPUT} [&>option]:bg-site-900`} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  )
}

// ── LEADS ───────────────────────────────────────────────────
function LeadsTab() {
  const { leads, canWrite, updateLead, deleteLead } = useMission()
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')

  const filtered = useMemo(
    () => leads.filter(l => filter === 'all' || l.status === filter),
    [leads, filter],
  )

  if (!canWrite) {
    return <div className={`${PANEL} text-site-400 text-center py-8`}>潛在客戶資料只有管理員可睇。</div>
  }

  const statuses: LeadStatus[] = ['new', 'contacted', 'demo', 'pilot', 'won', 'lost']

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>全部 ({leads.length})</FilterChip>
        {statuses.map(s => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {LEAD_STATUS_ZH[s]} ({leads.filter(l => l.status === s).length})
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={`${PANEL} text-site-400 text-center py-8`}>未有潛在客戶 — 由 /sell 表單入嚟會喺度顯示。</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(l => (
            <li key={l.id}>
              <LeadRow lead={l} onStatus={s => void updateLead(l.id, { status: s })} onDelete={() => void deleteLead(l.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LeadRow({ lead, onStatus, onDelete }: {
  lead: Lead; onStatus: (s: LeadStatus) => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`${PANEL} p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <button onClick={() => setOpen(o => !o)} className="text-left w-full">
            <div className="font-medium text-white">
              {lead.name}{lead.company && <span className="text-site-400 font-normal"> · {lead.company}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${LEAD_STATUS_COLOR[lead.status]}`}>{LEAD_STATUS_ZH[lead.status]}</span>
              <span className="text-xs text-safety-400 font-mono">{lead.contact}</span>
              <span className="text-xs text-site-500 font-mono">{new Date(lead.created_at).toLocaleString('zh-HK')}</span>
            </div>
          </button>
          {open && lead.message && (
            <div className="mt-3 text-sm text-site-300 whitespace-pre-wrap bg-black/30 rounded-lg p-3">{lead.message}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <select
            className={`${DINPUT} text-xs py-1 [&>option]:bg-site-900`}
            value={lead.status}
            onChange={e => onStatus(e.target.value as LeadStatus)}
          >
            {(Object.keys(LEAD_STATUS_ZH) as LeadStatus[]).map(s => (
              <option key={s} value={s}>{LEAD_STATUS_ZH[s]}</option>
            ))}
          </select>
          <button onClick={() => { if (confirm('刪除此潛在客戶?')) onDelete() }} className="p-1.5 text-red-400 hover:text-red-300 transition">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DEMOS ───────────────────────────────────────────────────
function DemosTab() {
  return (
    <div className="space-y-4">
      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-3 flex items-center gap-2"><AppWindow size={18} className="text-safety-500" /> 真實 App — 直接俾客戶試</div>
        <div className="grid md:grid-cols-3 gap-3">
          <DemoLink icon={<Smartphone size={20} />} title="iOS App Store" sub="v1.1 LIVE · 公開下載" href="https://apps.apple.com/app/id6764754372" />
          <DemoLink icon={<Smartphone size={20} />} title="Android Play 封閉測試" sub="先 opt-in 再下載" href="https://play.google.com/apps/testing/com.kwanchunkit.constructionapp" />
          <DemoLink icon={<Globe size={20} />} title="Web 版生產" sub="即開即用 · 無需安裝" href="https://construction-app-lime-six.vercel.app" />
        </div>
      </div>

      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-2">測試帳號 — 5 個角色現場 demo</div>
        <div className="text-sm text-site-400 mb-3">所有密碼: <code className="bg-white/10 text-white px-1.5 py-0.5 rounded font-mono">test1234</code> · 項目: DC2026 油塘住宅</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-site-500 border-b border-white/10 font-mono uppercase tracking-wider">
                <th className="py-2 pr-3">電話</th>
                <th className="py-2 pr-3">角色</th>
                <th className="py-2 pr-3">名</th>
                <th className="py-2 pr-3">可做嘅事</th>
              </tr>
            </thead>
            <tbody className="text-site-200">
              <tr className="border-b border-white/5"><td className="py-2 pr-3 font-mono text-safety-400">60001001</td><td className="py-2 pr-3">PM</td><td className="py-2 pr-3">李 PM</td><td className="py-2 pr-3 text-site-400">睇晒 4 zones · 加大項 · 指派</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-3 font-mono text-safety-400">60001002</td><td className="py-2 pr-3">老總</td><td className="py-2 pr-3">王老總</td><td className="py-2 pr-3 text-site-400">加事件 · 同 PM 同等權限</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-3 font-mono text-safety-400">60001003</td><td className="py-2 pr-3">工程師</td><td className="py-2 pr-3">陳工程師</td><td className="py-2 pr-3 text-site-400">寫 daily · 自己 items</td></tr>
              <tr className="border-b border-white/5"><td className="py-2 pr-3 font-mono text-safety-400">60001004</td><td className="py-2 pr-3">管工</td><td className="py-2 pr-3">黃管工</td><td className="py-2 pr-3 text-site-400">寫 daily · zone chips</td></tr>
              <tr><td className="py-2 pr-3 font-mono text-safety-400">60001005</td><td className="py-2 pr-3">判頭</td><td className="py-2 pr-3">何判頭</td><td className="py-2 pr-3 text-site-400">急件物料 · 自己 items 觀察</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-3">20 分鐘現場 demo 流程</div>
        <ol className="text-sm text-site-300 space-y-1.5 list-decimal pl-5 marker:text-safety-500 marker:font-mono">
          <li>1-3 分鐘: 判頭 view — progress tree, 物料 急件 toggle</li>
          <li>3-5 分鐘: Daily log workflow (黃管工 寫 → PM 即收)</li>
          <li>5-7 分鐘: PM supervisor view (4 zones, 統計卡)</li>
          <li>7-9 分鐘: 老總 加事件 + multi-zone peer apply</li>
          <li>9-11 分鐘: 物料 RBAC + 急件 list</li>
          <li>11-13 分鐘: 指派 + multi-tab safety</li>
          <li>13-15 分鐘: PDF / Excel export</li>
          <li>15-17 分鐘: 帳號刪除 (Apple compliance)</li>
          <li>17-19 分鐘: Q&A</li>
          <li>19-20 分鐘: <strong className="text-safety-400">Pilot 1 個月 $0</strong> 收結</li>
        </ol>
        <a href="https://github.com/kwanchunkit724/construction-app/blob/main/.planning/sales-kit/05-DEMO-SCRIPT.md"
          target="_blank" rel="noreferrer"
          className="inline-block mt-3 text-xs text-safety-400 hover:text-safety-300 transition">睇完整 demo 劇本 →</a>
      </div>
    </div>
  )
}

function DemoLink({ icon, title, sub, href }: { icon: React.ReactNode; title: string; sub: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${PANEL_HOVER} p-4 flex items-start gap-3`}>
      <div className="text-safety-500 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-white truncate">{title}</div>
        <div className="text-xs text-site-400 truncate">{sub}</div>
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
  const fileName: Record<string, string> = {
    '00': '00-README.md', '01': '01-CUSTOMER-PROFILES.md', '02': '02-MARKET-CHANNELS.md',
    '03': '03-OUTREACH-SCRIPTS.md', '04': '04-PITCH-DECK.md', '05': '05-DEMO-SCRIPT.md',
    '06': '06-PRICING-PACKAGES.md', '07': '07-OBJECTION-HANDLERS.md', '08': '08-FOLLOWUP-FRAMEWORK.md',
    '09': '09-30-DAY-LAUNCH-PLAN.md',
  }
  const pptxUrl = 'https://github.com/kwanchunkit724/construction-app/blob/main/.planning/sales-kit/ck-pitch-deck.pptx'

  return (
    <div className="space-y-4">
      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-3 flex items-center gap-2"><Sparkles size={18} className="text-safety-500" /> 互動銷售工具 — 即用</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <ToolLink to="/sell" icon={<Globe size={20} />} title="銷售落地頁" sub="/#/sell · 直接 send 俾客戶" />
          <ToolLink to="/takeaway" icon={<FileDown size={20} />} title="A4 價目表" sub="/#/takeaway · 列印或存 PDF" />
          <ToolLink href={pptxUrl} icon={<Presentation size={20} />} title="12-slide PPTX" sub="下載推介書 · 直接 present" external />
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #f97316 0 14px, #0f172a 14px 28px)' }} />
        <div className="bg-safety-500/10 border border-t-0 border-safety-500/30 p-5">
          <div className="font-heading font-semibold text-white">定位一句話 (canonical)</div>
          <div className="text-sm text-site-200 mt-2 leading-relaxed">
            「CK工程取代地盤嘅 WhatsApp + Excel + 紙簿。判頭、工程師、PM 一齊喺同一個 app 寫每日進度、報問題、申請物料、簽 PTW。出 dispute 嗰時，每一個 action 都有時間戳同 audit trail。」
          </div>
        </div>
      </div>

      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-3">定價 — 快速參考</div>
        <div className="grid md:grid-cols-4 gap-2 text-sm">
          <PriceCard tier="試用 Pilot" price="HK$0" sub="1 個月" />
          <PriceCard tier="Standard" price="HK$3,800/月" sub="每個項目" highlight />
          <PriceCard tier="Pro" price="HK$9,800/月" sub="無限項目" />
          <PriceCard tier="創始客戶價" price="HK$2,850/月" sub="鎖 12 個月 · 6/30 前簽" highlight />
        </div>
      </div>

      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-3">10 份文件 — 全部喺 GitHub repo</div>
        <ul className="space-y-1">
          {files.map(f => (
            <li key={f.num}>
              <a href={`${baseUrl}/${fileName[f.num]}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition">
                <span className="text-xs font-mono text-safety-500 w-6">{f.num}</span>
                <span className="flex-1 font-medium text-white">{f.title}</span>
                <span className="text-xs text-site-400 hidden sm:inline">{f.sub}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ToolLink({ to, href, icon, title, sub, external }: {
  to?: string; href?: string; icon: React.ReactNode; title: string; sub: string; external?: boolean
}) {
  const inner = (
    <>
      <div className="text-safety-500 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-white truncate flex items-center gap-1">{title}{external && <ExternalLink size={12} className="text-site-500" />}</div>
        <div className="text-xs text-site-400 truncate">{sub}</div>
      </div>
    </>
  )
  const cls = `${PANEL_HOVER} p-4 flex items-start gap-3`
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  return <Link to={to ?? '#'} className={cls}>{inner}</Link>
}

function PriceCard({ tier, price, sub, highlight }: { tier: string; price: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'border-safety-500/40 bg-safety-500/10' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="text-xs text-site-400">{tier}</div>
      <div className={`font-heading font-bold mt-1 tabular-nums ${highlight ? 'text-safety-400' : 'text-white'}`}>{price}</div>
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
      <div className={`${PANEL} p-5`}>
        <div className="font-heading font-semibold text-white mb-1">溝通記錄</div>
        <div className="text-xs text-site-400">附加訊息會儲存喺 Supabase mission_log table · 任何人可以睇 · 只有 admin 可以 post</div>
      </div>

      {canWrite && (
        <div className={`${PANEL} p-4`}>
          <textarea
            className={DINPUT}
            placeholder="留言... (例如新進展 / 問題 / 反饋)"
            rows={3}
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={send}
              disabled={posting || !body.trim()}
              className={`${PRIMARY} text-sm px-3 py-1.5 flex items-center gap-1 font-semibold disabled:opacity-50`}
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} 發送
            </button>
          </div>
        </div>
      )}

      {!canWrite && (
        <div className="rounded-2xl bg-blue-500/10 border border-blue-500/30 p-4 text-sm text-blue-300">
          想留言? <Link to="/login" className="underline font-medium text-blue-200">登入 admin 帳戶</Link>
        </div>
      )}

      <ul className="space-y-2">
        {log.length === 0 ? (
          <li className={`${PANEL} text-center text-site-400 py-8`}>未有訊息</li>
        ) : log.map(e => (
          <li key={e.id} className={`${PANEL} p-4`}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-mono ${
                e.author === 'agent' ? 'bg-blue-500/15 text-blue-400' :
                e.author === 'system' ? 'bg-white/10 text-site-400' :
                'bg-safety-500/15 text-safety-400'
              }`}>{e.author === 'user' ? '你' : e.author === 'agent' ? 'Claude' : 'system'}</span>
              <span className="text-xs text-site-500 font-mono">{new Date(e.created_at).toLocaleString('zh-HK')}</span>
              {e.tags.length > 0 && e.tags.map(t => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-white/5 text-site-500 font-mono">#{t}</span>
              ))}
            </div>
            <div className="text-sm text-site-200 whitespace-pre-wrap">{e.body}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
