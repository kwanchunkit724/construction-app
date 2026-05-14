import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, MapPin } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { FullPageSpinner } from '../components/Spinner'
import { SiProvider, useSi } from '../contexts/SiContext'
import { VoProvider, useVo } from '../contexts/VoContext'
import { ProgressProvider, useProgress } from '../contexts/ProgressContext'
import { DrawingsProvider } from '../contexts/DrawingsContext'
import { useAuth } from '../contexts/AuthContext'
import { VoSubmitForm } from '../components/vo/VoSubmitForm'
import { VoConfirmationScreen } from '../components/vo/VoConfirmationScreen'
import { signedUrlFor } from '../lib/si'
import { latLngToTile, tileUrl, OSM_ATTRIBUTION } from '../lib/osm-tile'
import { supabase } from '../lib/supabase'
import { SiDiffCard } from '../components/si/SiDiffCard'
import { SiTimeline } from '../components/si/SiTimeline'
import { SiApproverBar } from '../components/si/SiApproverBar'
import { ProtestCommentBar } from '../components/si/ProtestCommentBar'
import { SI_STATUS_ZH } from '../types'
import type { SI, SiStatus, UserProfile } from '../types'

type Tab = 'detail' | 'versions' | 'approvals' | 'protest'

function statusStyle(status: SiStatus): string {
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

function SiDetailInner({ projectId, siId }: { projectId: string; siId: string }) {
  const navigate = useNavigate()
  const { sis, versionsBySi, approvalsBySi, commentsBySi, loading } = useSi()
  const { vos } = useVo()
  const { items: progressItems } = useProgress()
  const { profile } = useAuth()
  const canSubmitVO = !!profile && ['admin', 'pm', 'main_contractor'].includes(profile.global_role)
  const existingVo = vos.find(v => v.si_id === siId)
  const [voFormOpen, setVoFormOpen] = useState(false)
  const [voConfirmation, setVoConfirmation] = useState<{ voId: string; serverTotal: number; voNumber: string } | null>(null)

  const si: SI | undefined = sis.find(s => s.id === siId)
  const versions = (versionsBySi[siId] || [])
    .slice()
    .sort((a, b) => b.version_no - a.version_no)
  const current = versions[0]
  const previous = versions[1]
  const approvals = approvalsBySi[siId] || []
  const comments = commentsBySi[siId] || []

  const [tab, setTab] = useState<Tab>('detail')
  const [comparePair, setComparePair] = useState<{ oldId: string; newId: string } | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>({})

  // Resolve signed URLs for photos
  useEffect(() => {
    let mounted = true
    const paths = current?.payload?.photo_paths || []
    if (paths.length === 0) {
      setPhotoUrls({})
      return
    }
    Promise.all(
      paths.map(async p => [p, await signedUrlFor(p)] as const),
    ).then(pairs => {
      if (!mounted) return
      const map: Record<string, string> = {}
      for (const [p, u] of pairs) {
        if (u) map[p] = u
      }
      setPhotoUrls(map)
    })
    return () => { mounted = false }
  }, [current])

  // Resolve voice URL
  useEffect(() => {
    let mounted = true
    const p = current?.payload?.voice_path
    if (!p) {
      setVoiceUrl(null)
      return
    }
    signedUrlFor(p).then(u => { if (mounted) setVoiceUrl(u) })
    return () => { mounted = false }
  }, [current])

  // Load names for actor + creator + protest authors
  useEffect(() => {
    const ids = new Set<string>()
    if (si?.created_by) ids.add(si.created_by)
    for (const a of approvals) ids.add(a.actor_id)
    for (const c of comments) ids.add(c.author_id)
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
  }, [si?.created_by, approvals, comments])

  // Available tabs — 抗議 only when locked
  const tabs = useMemo(() => {
    const base: { key: Tab; label: string }[] = [
      { key: 'detail', label: '詳情' },
      { key: 'versions', label: '版本歷史' },
      { key: 'approvals', label: '簽核紀錄' },
    ]
    if (si?.status === 'locked') base.push({ key: 'protest', label: '抗議' })
    return base
  }, [si?.status])

  if (loading) {
    return <FullPageSpinner label="載入中..." />
  }
  if (!si) {
    return (
      <div className="py-10 text-center">
        <p className="text-site-600 mb-3">找不到工地指令</p>
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/si`)}
          className="btn-ghost inline-flex items-center gap-1"
        >
          <ChevronLeft size={16} />
          <span>返回列表</span>
        </button>
      </div>
    )
  }

  const creatorName = usersById[si.created_by]?.name

  return (
    <>
      {/* Header */}
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate(`/project/${projectId}/si`)}
          className="inline-flex items-center gap-1 text-sm text-site-600 mb-2"
        >
          <ChevronLeft size={16} />
          <span>返回列表</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusStyle(
              si.status,
            )}`}
          >
            {SI_STATUS_ZH[si.status]}
          </span>
          <span className="text-sm font-mono text-site-600">{si.number}</span>
          {creatorName && (
            <span className="text-xs text-site-500">由 {creatorName} 建立</span>
          )}
        </div>

        {/* VO entry point — only when SI is locked */}
        {si.status === 'locked' && (
          <div className="mt-3">
            {existingVo ? (
              <button
                type="button"
                onClick={() => navigate(`/project/${projectId}/vo/${existingVo.id}`)}
                className="btn-ghost inline-flex items-center gap-1 text-sm"
              >
                已有變更指令 <span className="font-mono">{existingVo.number}</span> →
              </button>
            ) : canSubmitVO ? (
              <button
                type="button"
                onClick={() => setVoFormOpen(true)}
                className="btn-primary inline-flex items-center gap-1"
              >
                提出變更指令
              </button>
            ) : null}
          </div>
        )}
      </div>

      {voFormOpen && (
        <VoSubmitForm
          projectId={projectId}
          parentSi={si}
          progressItems={progressItems}
          onSubmitted={(voId, serverTotal) => {
            setVoFormOpen(false)
            // Use the just-created VO from realtime if available, else look it up post-confirmation
            const fresh = (vos.find(v => v.id === voId))
            setVoConfirmation({
              voId,
              serverTotal,
              voNumber: fresh?.number ?? '',
            })
          }}
          onCancel={() => setVoFormOpen(false)}
        />
      )}

      {voConfirmation && (
        <VoConfirmationScreen
          voId={voConfirmation.voId}
          serverTotal={voConfirmation.serverTotal}
          voNumber={voConfirmation.voNumber}
          onClose={() => setVoConfirmation(null)}
          onViewDetail={voId => {
            setVoConfirmation(null)
            navigate(`/project/${projectId}/vo/${voId}`)
          }}
        />
      )}

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-site-200 mb-3 overflow-x-auto">
        {tabs.map(t => {
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

      {/* Tab content */}
      {tab === 'detail' && (
        <DetailPane
          si={si}
          payload={current?.payload}
          photoUrls={photoUrls}
          voiceUrl={voiceUrl}
        />
      )}

      {tab === 'versions' && (
        <VersionsPane
          versions={versions}
          comparePair={comparePair}
          setComparePair={setComparePair}
        />
      )}

      {tab === 'approvals' && (
        <SiTimeline approvals={approvals} usersById={usersById} />
      )}

      {tab === 'protest' && (
        <ProtestCommentBar si={si} comments={comments} usersById={usersById} />
      )}

      <SiApproverBar si={si} latestVersion={current} />

      {/* Silence "unused" until previous-version preview lands */}
      <span className="hidden">{previous?.id}</span>
    </>
  )
}

function DetailPane({
  si, payload, photoUrls, voiceUrl,
}: {
  si: SI
  payload: SI extends never ? never : import('../types').SiPayload | undefined
  photoUrls: Record<string, string>
  voiceUrl: string | null
}) {
  if (!payload) {
    return <p className="text-site-500">未有版本內容。</p>
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-site-900">{payload.title}</h2>
        <p className="text-[11px] text-site-400 mt-1">
          建立於 {new Date(si.created_at).toLocaleString('zh-HK')}
        </p>
      </div>

      <div className="card p-3">
        <p className="label mb-1">描述</p>
        <p className="text-sm text-site-800 whitespace-pre-wrap break-words">
          {payload.description}
        </p>
      </div>

      {payload.drawing_version_ids.length > 0 && (
        <div className="card p-3">
          <p className="label mb-2">圖則參照</p>
          <div className="flex flex-wrap gap-1">
            {payload.drawing_version_ids.map(id => (
              <span
                key={id}
                className="text-[10px] font-mono bg-site-100 text-site-700 px-2 py-0.5 rounded-full"
              >
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}

      {payload.photo_paths.length > 0 && (
        <div className="card p-3">
          <p className="label mb-2">相片 ({payload.photo_paths.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {payload.photo_paths.map(p => {
              const url = photoUrls[p]
              return (
                <div key={p} className="aspect-square bg-site-100 rounded-lg overflow-hidden">
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-site-400">
                      載入中…
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {payload.voice_path && (
        <div className="card p-3">
          <p className="label mb-2">語音備忘</p>
          {voiceUrl ? (
            <audio controls src={voiceUrl} preload="metadata" className="w-full" />
          ) : (
            <p className="text-xs text-site-500">載入中…</p>
          )}
        </div>
      )}

      {payload.lat != null && payload.lng != null && (
        <div className="card p-3">
          <p className="label mb-2">位置</p>
          <GeoTile lat={payload.lat} lng={payload.lng} accuracy_m={payload.accuracy_m} />
        </div>
      )}
    </div>
  )
}

function GeoTile({
  lat, lng, accuracy_m,
}: {
  lat: number
  lng: number
  accuracy_m: number | null
}) {
  const { z, x, y } = latLngToTile(lat, lng, 16)
  return (
    <div>
      <div
        className="relative rounded-xl overflow-hidden border border-site-200 bg-site-100"
        style={{ width: 240, height: 240, maxWidth: '100%' }}
      >
        <img
          src={tileUrl(z, x, y)}
          alt="位置預覽"
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <MapPin size={28} className="text-red-600 drop-shadow" fill="currentColor" />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-site-400">{OSM_ATTRIBUTION}</p>
      <p className="mt-1 text-xs text-site-700">
        (緯度 {lat.toFixed(4)}, 經度 {lng.toFixed(4)})
        {accuracy_m != null && ` ±${accuracy_m}m`}
      </p>
    </div>
  )
}

function VersionsPane({
  versions, comparePair, setComparePair,
}: {
  versions: import('../types').SIVersion[]
  comparePair: { oldId: string; newId: string } | null
  setComparePair: (p: { oldId: string; newId: string } | null) => void
}) {
  if (versions.length === 0) {
    return <p className="text-sm text-site-500 py-4 text-center">尚未有版本</p>
  }

  const activeDiff = comparePair
    ? {
        oldV: versions.find(v => v.id === comparePair.oldId),
        newV: versions.find(v => v.id === comparePair.newId),
      }
    : null

  return (
    <div className="space-y-3">
      {versions.length >= 2 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-site-600">對比版本：</span>
          {versions.slice(0, versions.length - 1).map((v, i) => {
            const older = versions[i + 1]
            const active =
              comparePair?.oldId === older.id && comparePair?.newId === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setComparePair({ oldId: older.id, newId: v.id })}
                className={`text-[11px] px-2 py-1 rounded-full ${
                  active
                    ? 'bg-safety-600 text-white'
                    : 'bg-site-100 text-site-700'
                }`}
              >
                v{older.version_no} → v{v.version_no}
              </button>
            )
          })}
        </div>
      )}

      {activeDiff?.oldV && activeDiff?.newV && (
        <SiDiffCard oldVersion={activeDiff.oldV} newVersion={activeDiff.newV} />
      )}

      <ul className="space-y-2">
        {versions.map(v => (
          <li key={v.id} className="card p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-site-900">v{v.version_no}</span>
              <span className="text-[11px] text-site-400">
                {new Date(v.created_at).toLocaleString('zh-HK')}
              </span>
            </div>
            <p className="text-sm text-site-700 mt-1 line-clamp-2">
              {v.payload.title}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SiDetailPage() {
  const { id, siId } = useParams<{ id: string; siId: string }>()
  if (!id || !siId) {
    return (
      <AppLayout title="工地指令">
        <p className="text-site-500">參數不齊</p>
      </AppLayout>
    )
  }
  return (
    <AppLayout title="工地指令">
      <DrawingsProvider projectId={id}>
        <SiProvider projectId={id}>
          <ProgressProvider projectId={id}>
            <VoProvider projectId={id}>
              <SiDetailInner projectId={id} siId={siId} />
            </VoProvider>
          </ProgressProvider>
        </SiProvider>
      </DrawingsProvider>
    </AppLayout>
  )
}
