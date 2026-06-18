import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, UsersRound, FileSpreadsheet, FileText } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { Spinner } from '../components/Spinner'
import { supabase } from '../lib/supabase'
import { useProjects } from '../contexts/ProjectsContext'
import {
  aggregateLabourReturn, exportLabourReturnExcel, exportLabourReturnPDF,
  type LabourDaily, type LabourReturnAgg,
} from '../lib/labourReturn'

export default function LabourReturnPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <Spinner />
  return <LabourReturnInner projectId={id} />
}

function currentMonthHK(): string {
  // YYYY-MM in Asia/Hong_Kong.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return ymd.slice(0, 7)
}

function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = `${ym}-01`
  const lastDay = new Date(y, m, 0).getDate()  // m is 1-based; day 0 of next month = last day of m
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function LabourReturnInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const projectName = projects.find(p => p.id === projectId)?.name ?? ''
  const [month, setMonth] = useState(currentMonthHK())
  const [rows, setRows] = useState<LabourDaily[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const { start, end } = monthRange(month)
    supabase
      .from('dailies')
      .select('date, manpower')
      .eq('project_id', projectId)
      .gte('date', start)
      .lte('date', end)
      .then(({ data, error: err }) => {
        if (!alive) return
        if (err) { setError(err.message); setRows([]) }
        else setRows((data ?? []) as LabourDaily[])
        setLoading(false)
      })
    return () => { alive = false }
  }, [projectId, month])

  const agg: LabourReturnAgg = useMemo(() => aggregateLabourReturn(rows), [rows])
  const hasData = agg.dates.length > 0

  async function doExport(kind: 'pdf' | 'excel') {
    setExporting(kind)
    try {
      if (kind === 'pdf') await exportLabourReturnPDF(projectName, month, agg)
      else await exportLabourReturnExcel(projectName, month, agg)
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setExporting(null)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-3 space-y-3">
        <button
          onClick={() => navigate(`/project/${projectId}`)}
          className="flex items-center gap-1.5 text-site-500 hover:text-site-800 px-1 min-h-[44px]"
        >
          <ChevronLeft size={18} /> 返回工地
        </button>

        <div>
          <h1 className="text-xl font-bold text-site-900 flex items-center gap-2">
            <UsersRound size={20} className="text-indigo-600" /> 勞工人力日報 (G.F. 527)
          </h1>
          <p className="text-xs text-site-500 mt-0.5">按每日日誌的人力數據彙總工種人次 · 可匯出法定勞工申報表</p>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="label">月份</label>
            <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => doExport('excel')}
              disabled={!hasData || !!exporting}
              className="btn-ghost flex items-center gap-1.5 disabled:opacity-50"
            >
              {exporting === 'excel' ? <Spinner size={14} /> : <FileSpreadsheet size={15} />} Excel
            </button>
            <button
              onClick={() => doExport('pdf')}
              disabled={!hasData || !!exporting}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {exporting === 'pdf' ? <Spinner size={14} className="text-white" /> : <FileText size={15} />} PDF
            </button>
          </div>
        </div>

        {loading && <Spinner size={20} className="mx-auto my-8" />}
        {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</div>}

        {!loading && !hasData && (
          <div className="card p-8 text-center text-site-400 text-sm">
            呢個月嘅每日日誌未有人力數據。喺「每日日誌」填寫工種人數,呢度就會自動彙總。
          </div>
        )}

        {!loading && hasData && (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-site-50 border-b border-site-200">
                  <th className="text-left font-semibold text-site-700 px-3 py-2 sticky left-0 bg-site-50">日期</th>
                  {agg.trades.map(t => (
                    <th key={t} className="text-center font-semibold text-site-700 px-3 py-2 whitespace-nowrap">{t}</th>
                  ))}
                  <th className="text-center font-semibold text-site-900 px-3 py-2">每日總計</th>
                </tr>
              </thead>
              <tbody>
                {agg.dates.map(d => (
                  <tr key={d} className="border-b border-site-100">
                    <td className="px-3 py-2 text-site-600 sticky left-0 bg-white whitespace-nowrap">{d}</td>
                    {agg.trades.map(t => (
                      <td key={t} className="text-center px-3 py-2 text-site-800">{agg.counts[d]?.[t] ?? 0}</td>
                    ))}
                    <td className="text-center px-3 py-2 font-semibold text-site-900">{agg.dateTotals[d] ?? 0}</td>
                  </tr>
                ))}
                <tr className="bg-site-50 border-t-2 border-site-200">
                  <td className="px-3 py-2 font-bold text-site-900 sticky left-0 bg-site-50">總計</td>
                  {agg.trades.map(t => (
                    <td key={t} className="text-center px-3 py-2 font-semibold text-site-800">{agg.tradeTotals[t] ?? 0}</td>
                  ))}
                  <td className="text-center px-3 py-2 font-black text-site-900">{agg.grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
