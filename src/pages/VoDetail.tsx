import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, FileDown } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { FullPageSpinner } from '../components/Spinner'
import { VoProvider, useVo } from '../contexts/VoContext'
import { SiProvider, useSi } from '../contexts/SiContext'
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { useProjects } from '../contexts/ProjectsContext'
import { supabase } from '../lib/supabase'
import { formatHKD } from '../lib/currency'
import { VoApproverBar } from '../components/vo/VoApproverBar'
import { SiTimeline } from '../components/si/SiTimeline'
import {
  VO_STATUS_ZH,
  APPROVAL_ACTION_ZH,
  LINE_ITEM_CATEGORY_ZH,
} from '../types'
import type {
  VO, VoStatus, UserProfile, DrawingVersion,
} from '../types'

type Tab = 'detail' | 'versions' | 'approvals'

function statusStyle(status: VoStatus): string {
  switch (status) {
    case 'draft': return 'bg-site-100 text-site-700'
    case 'submitted': return 'bg-blue-50 text-blue-700'
    case 'in_review': return 'bg-amber-100 text-amber-700'
    case 'approved': return 'bg-green-100 text-green-700'
    case 'locked': return 'bg-site-900 text-white'
    case 'revision_requested': return 'bg-orange-100 text-orange-700'
    case 'rejected': return 'bg-red-100 text-red-700'
  }
}

function VoDetailInner({ projectId, voId }: { projectId: string; voId: string }) {
  const navigate = useNavigate()
  const { projects } = useProjects()
  const { vos, versionsByVo, approvalsByVo, loading } = useVo()
  const { sis } = useSi()
  const { items: progressItems } = useProgress()

  const vo: VO | undefined = vos.find(v => v.id === voId)
  const versions = (versionsByVo[voId] || [])
    .slice()
    .sort((a, b) => b.version_no - a.version_no)
  const current = versions[0]
  const approvals = approvalsByVo[voId] || []
  const parentSi = vo ? sis.find(s => s.id === vo.si_id) : undefined

  const [tab, setTab] = useState<Tab>('detail')
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>({})
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    const ids = new Set<string>()
    if (vo?.created_by) ids.add(vo.created_by)
    for (const a of approvals) ids.add(a.actor_id)
    if (ids.size === 0) return
    let mounted = true
    supabase
      .from('user_profiles')
      .select('*')
      .in('id', Array.from(ids))
      .then(({ data }) => {
        if (!mounted || !data) return
        const map: Record<string, UserProfile> = {}
        for (const row of data as UserProfile[]) map[row.id] = row
        setUsersById(map)
      })
    return () => { mounted = false }
  }, [vo?.created_by, approvals])

  const project = projects.find(p => p.id === projectId)

  const approvalTimeline = useMemo(
    () =>
      approvals
        .slice()
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map(a => ({
          actor_name: usersById[a.actor_id]?.name ?? '未知用戶',
          action_zh: APPROVAL_ACTION_ZH[a.action_type],
          at: new Date(a.created_at).toLocaleString('zh-HK'),
          reason: a.reason,
        })),
    [approvals, usersById],
  )

  async function handleExport() {
    if (!vo || !current || !project) return
    setExporting(true)
    setExportError(null)
    try {
      // Resolve drawing versions referenced by the cited SI (if any).
      let drawings: DrawingVersion[] = []
      if (parentSi) {
        const { data: siVerRows } = await supabase
          .from('si_versions')
          .select('*')
          .eq('si_id', parentSi.id)
          .order('version_no', { ascending: false })
          .limit(1)
        const siDrawingIds: string[] = siVerRows?.[0]?.payload?.drawing_version_ids ?? []
        if (siDrawingIds.length > 0) {
          const { data: drwRows } = await supabase
            .from('drawing_versions')
            .select('*')
            .in('id', siDrawingIds)
          drawings = (drwRows ?? []) as DrawingVersion[]
        }
      }

      // Lazy import so jspdf + Noto Sans HK stay in lazy chunks.
      const { exportVOToPDF } = await import('../lib/export')
      await exportVOToPDF(project, vo, current, drawings, usersById, approvalTimeline)
    } catch (e: any) {
      console.error('exportVOToPDF error:', e)
      setExportError(e?.message ?? '產生 PDF 失敗')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <FullPageSpinner label="載入中..." />
  }
  if (!vo) {
    return (
      <div className="py-10 text-center">
        <p className="text-site-600 mb-3">找不到變更指令</p>
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/vo`)}
          className="btn-ghost inline-flex items-center gap-1"
        >
          <ChevronLeft size={16} />
          <span>返回列表</span>
        </button>
      </div>
    )
  }

  const creatorName = usersById[vo.created_by]?.name

  return (
    <>
      {/* Header */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/vo`)}
          className="inline-flex items-center gap-1 text-sm text-site-600 mb-2"
        >
          <ChevronLeft size={16} />
          <span>返回列表</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle(
              vo.status,
            )}`}
          >
            {VO_STATUS_ZH[vo.status]}
          </span>
          <span className="text-sm font-mono text-site-600">{vo.number}</span>
          <span className="text-sm font-bold text-site-900 tabular-nums">
            {formatHKD(vo.total_amount_cents)}
          </span>
          {creatorName && (
            <span className="text-xs text-site-500">由 {creatorName} 提出</span>
          )}
        </div>
        {parentSi && (
          <p className="text-xs text-site-500 mt-1">
            引用工地指令 <span className="font-mono">{parentSi.number}</span>
          </p>
        )}

        {vo.status === 'locked' && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary inline-flex items-center gap-2"
            >
              <FileDown size={16} />
              <span>{exporting ? '產生中…' : '匯出 PDF'}</span>
            </button>
            {exportError && (
              <p className="mt-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg px-2 py-1">
                {exportError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-site-200 mb-3 overflow-x-auto">
        {[
          { key: 'detail' as Tab, label: '詳情' },
          { key: 'versions' as Tab, label: '版本歷史' },
          { key: 'approvals' as Tab, label: '簽核紀錄' },
        ].map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                active
                  ? 'border-safety-600 text-safety-700 font-semibold'
                  : 'border-transparent text-site-600'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'detail' && current && (
        <DetailPane vo={vo} version={current} />
      )}

      {tab === 'versions' && (
        <VersionsPane versions={versions} />
      )}

      {tab === 'approvals' && (
        <SiTimeline approvals={approvals} usersById={usersById} />
      )}

      <VoApproverBar vo={vo} latestVersion={current} progressItems={progressItems} />
    </>
  )
}

function DetailPane({ vo, version }: { vo: VO; version: import('../types').VOVersion }) {
  const items = version.payload.line_items
  return (
    <div className="space-y-4">
      <div className="card p-3">
        <p className="label mb-1">描述</p>
        <p className="text-sm text-site-800 whitespace-pre-wrap break-words">
          {version.payload.description}
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-site-100">
          <p className="font-semibold text-site-900 text-sm">項目 ({items.length})</p>
        </div>
        <div className="divide-y divide-site-100">
          {items.map((li, i) => (
            <div key={i} className="px-3 py-2 flex items-start gap-2 text-sm">
              <span className="font-mono text-xs text-site-500 w-6">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] bg-site-100 text-site-700 px-1.5 py-0.5 rounded-full">
                    {LINE_ITEM_CATEGORY_ZH[li.category]}
                  </span>
                  <span className="font-medium text-site-900">{li.description}</span>
                </div>
                <p className="text-[11px] text-site-500 mt-0.5">
                  {li.quantity} {li.unit} × {formatHKD(li.unit_price_cents)}
                </p>
              </div>
              <span className="text-sm font-semibold text-site-900 tabular-nums">
                {formatHKD(li.subtotal_cents)}
              </span>
            </div>
          ))}
        </div>
        <div className="px-3 py-3 border-t-2 border-site-200 bg-site-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-site-700">經系統核算總額</span>
          <span className="text-lg font-bold text-site-900 tabular-nums">
            {formatHKD(vo.total_amount_cents)}
          </span>
        </div>
      </div>
    </div>
  )
}

function VersionsPane({ versions }: { versions: import('../types').VOVersion[] }) {
  if (versions.length === 0) {
    return <p className="text-sm text-site-500 py-4 text-center">尚未有版本</p>
  }
  return (
    <ul className="space-y-2">
      {versions.map(v => (
        <li key={v.id} className="card p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-site-900">v{v.version_no}</span>
            <span className="text-[11px] text-site-400">
              {new Date(v.created_at).toLocaleString('zh-HK')}
            </span>
          </div>
          <p className="text-xs text-site-600 mt-1">
            {v.payload.line_items.length} 個項目 · 總額 {formatHKD(v.payload.total_amount_cents)}
          </p>
        </li>
      ))}
    </ul>
  )
}

export default function VoDetailPage() {
  const { id, voId } = useParams<{ id: string; voId: string }>()
  if (!id || !voId) {
    return (
      <AppLayout title="變更指令">
        <p className="text-site-500">參數不齊</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="變更指令">
      <SiProvider projectId={id}>
        <ProgressProvider projectId={id}>
          <VoProvider projectId={id}>
            <VoDetailInner projectId={id} voId={voId} />
          </VoProvider>
        </ProgressProvider>
      </SiProvider>
    </AppLayout>
  )
}
