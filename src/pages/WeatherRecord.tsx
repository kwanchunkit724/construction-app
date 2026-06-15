import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, CloudRain, FileSpreadsheet, FileText, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProjects } from '../contexts/ProjectsContext'
import { useModules } from '../contexts/ModulesContext'
import { Spinner } from '../components/Spinner'
import { exportWeatherEotToExcel, exportWeatherEotToPDF } from '../lib/export'
import { WEATHER_KIND_ZH } from '../types'
import type { WeatherEvent, WeatherClaim, WeatherKind } from '../types'

// 天氣記錄 (Weather Part 2) — territory extreme-weather days (weather_events) +
// this project's per-day EOT claim rows (project_weather_claims) carrying the
// CEDD Inclement Weather Report Form fields. Managers record/edit; members read.

type Editing = { hkt_date: string; trigger: string; on_critical_path: boolean; ready_to_work: boolean; tidy_days: string; claim_days: string; note: string }

export default function WeatherRecord() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { projects, memberships } = useProjects()
  const { isModuleEnabled } = useModules()
  const [events, setEvents] = useState<WeatherEvent[]>([])
  const [claims, setClaims] = useState<WeatherClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const project = useMemo(() => projects.find(p => p.id === id), [projects, id])
  // The module route's ModuleGate already bounces non-admin members away when
  // 天氣 is off; admins bypass that gate, so this only ever resolves false here
  // for an admin viewing a project with the module disabled.
  const weatherOn = isModuleEnabled('weather')

  const canManage = useMemo(() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    return memberships.some(m => m.user_id === profile.id && m.project_id === id && m.status === 'approved' && ['pm', 'main_contractor', 'general_foreman'].includes(m.role))
  }, [profile, project, memberships, id])

  async function load() {
    setLoading(true)
    const [{ data: ev }, { data: cl }] = await Promise.all([
      supabase.rpc('get_recent_weather_events', { p_days: 120 }),
      supabase.from('project_weather_claims').select('*').eq('project_id', id),
    ])
    setEvents((ev ?? []) as WeatherEvent[])
    setClaims((cl ?? []) as WeatherClaim[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [id])

  const eventsByDate = useMemo(() => {
    const m = new Map<string, WeatherEvent[]>()
    for (const e of events) { const a = m.get(e.hkt_date) ?? []; a.push(e); m.set(e.hkt_date, a) }
    return m
  }, [events])
  const claimByDate = useMemo(() => new Map(claims.map(c => [c.hkt_date, c])), [claims])
  const dates = useMemo(() => Array.from(new Set([...eventsByDate.keys(), ...claimByDate.keys()])).sort().reverse(), [eventsByDate, claimByDate])
  const totalDays = claims.reduce((s, c) => s + (Number(c.claim_days) || 0), 0)

  function startEdit(date: string) {
    const c = claimByDate.get(date)
    const evs = eventsByDate.get(date) ?? []
    setEditing({
      hkt_date: date,
      trigger: c?.trigger ?? evs.map(e => WEATHER_KIND_ZH[e.kind]).join(' + '),
      on_critical_path: c?.on_critical_path ?? true,
      ready_to_work: c?.ready_to_work ?? true,
      tidy_days: c?.tidy_days != null ? String(c.tidy_days) : '',
      claim_days: c?.claim_days != null ? String(c.claim_days) : '1',
      note: c?.note ?? '',
    })
  }
  async function saveEdit() {
    if (!editing || !profile) return
    setError(null)
    const { error: e } = await supabase.from('project_weather_claims').upsert({
      project_id: id, hkt_date: editing.hkt_date, trigger: editing.trigger || '極端天氣',
      on_critical_path: editing.on_critical_path, ready_to_work: editing.ready_to_work,
      tidy_days: editing.tidy_days === '' ? null : Number(editing.tidy_days),
      claim_days: editing.claim_days === '' ? null : Number(editing.claim_days),
      note: editing.note || null, recorded_by: profile.id,
    }, { onConflict: 'project_id,hkt_date' })
    if (e) { setError(e.message); return }
    setEditing(null)
    await load()
  }
  // Share-first Excel / PDF (the old anchor-download CSV was blocked by the
  // Capacitor WebView on iOS/Android). Both ship the per-day EOT claims joined
  // to their HKO weather_events evidence for the same date.
  async function runExport(fmt: 'xlsx' | 'pdf') {
    if (!project || exporting) return
    setError(null)
    setExporting(true)
    try {
      if (fmt === 'xlsx') await exportWeatherEotToExcel(project, events, claims)
      else await exportWeatherEotToPDF(project, events, claims)
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-site-50">
      <header className="sticky top-0 z-30 bg-white border-b border-site-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => navigate(`/project/${id}`)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-site-100"><ChevronLeft size={20} /></button>
          <CloudRain size={18} className="text-blue-600" />
          <h1 className="font-bold text-site-900">天氣記錄 / 極端天氣 EOT</h1>
          {weatherOn && claims.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => runExport('xlsx')} disabled={exporting} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1 disabled:opacity-50"><FileSpreadsheet size={14} />Excel</button>
              <button onClick={() => runExport('pdf')} disabled={exporting} className="btn-ghost px-2.5 py-1.5 text-xs flex items-center gap-1 disabled:opacity-50"><FileText size={14} />PDF</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-3">
        <div className="card p-3 flex items-center justify-between">
          <span className="text-sm text-site-600">已記錄申請 EOT 日數</span>
          <span className="text-xl font-bold text-safety-600">{totalDays} 日</span>
        </div>
        <p className="text-[11px] text-site-400 px-1">
          標準：T8 或以上 / 黑雨 / 紅雨 / 24 小時雨量 &gt; 20mm（私人 SFBC / 房署客觀準則）。政府 GCC 為酌情，需填關鍵路徑等資料供工程師審批。資料來源：香港天文台。
        </p>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</div>}

        {loading ? <div className="py-10 flex justify-center"><Spinner size={26} /></div>
          : dates.length === 0 ? <div className="card p-8 text-center text-sm text-site-500">{weatherOn ? '暫時冇記錄到極端天氣日。天氣同步每 30 分鐘自動執行。' : '此工地已停用天氣模組。請管理員喺模組設定重新啟用。'}</div>
          : dates.map(date => {
            const evs = eventsByDate.get(date) ?? []
            const claim = claimByDate.get(date)
            const isEditing = editing?.hkt_date === date
            return (
              <div key={date} className="card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-site-900">{date}</span>
                  {evs.map(e => <span key={e.id} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{WEATHER_KIND_ZH[e.kind as WeatherKind]}{e.kind === 'rainfall_20mm' && e.evidence?.mm ? `（${e.evidence.mm}mm）` : ''}</span>)}
                  {claim && <span className="ml-auto text-xs font-semibold text-safety-600">申請 {claim.claim_days ?? 0} 日</span>}
                </div>
                {claim && !isEditing && (
                  <p className="text-xs text-site-500 mt-1.5">關鍵路徑：{claim.on_critical_path ? '是' : '否'} · 可施工：{claim.ready_to_work ? '是' : '否'}{claim.tidy_days != null ? ` · 善後 ${claim.tidy_days} 日` : ''}{claim.note ? ` · ${claim.note}` : ''}</p>
                )}
                {canManage && !isEditing && (
                  <button onClick={() => startEdit(date)} className="mt-2 text-xs text-safety-600 font-medium">{claim ? '編輯申索' : '記錄此日'}</button>
                )}
                {isEditing && editing && (
                  <div className="mt-2 space-y-2 border-t border-site-100 pt-2">
                    <input className="input text-sm" placeholder="觸發原因" value={editing.trigger} onChange={e => setEditing({ ...editing, trigger: e.target.value })} />
                    <div className="flex gap-3 text-sm">
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={editing.on_critical_path} onChange={e => setEditing({ ...editing, on_critical_path: e.target.checked })} />關鍵路徑</label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={editing.ready_to_work} onChange={e => setEditing({ ...editing, ready_to_work: e.target.checked })} />本可施工</label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input text-sm" type="number" placeholder="善後日數" value={editing.tidy_days} onChange={e => setEditing({ ...editing, tidy_days: e.target.value })} />
                      <input className="input text-sm" type="number" placeholder="申請 EOT 日數" value={editing.claim_days} onChange={e => setEditing({ ...editing, claim_days: e.target.value })} />
                    </div>
                    <input className="input text-sm" placeholder="備註" value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1"><Save size={15} />儲存</button>
                      <button onClick={() => setEditing(null)} className="btn-ghost flex-1 py-2 text-sm">取消</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </main>
    </div>
  )
}
