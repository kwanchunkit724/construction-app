import { Suspense, lazy, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2, FileText, Upload, ChevronRight } from 'lucide-react'
import { Spinner } from '../Spinner'
import { DocumentUploadSheet } from '../documents/DocumentUploadSheet'
import { useDocuments } from '../../contexts/DocumentsContext'
import { useProgress } from '../../contexts/ProgressContext'
import { useDicts, guidedLeaves, distinctValues, unionOrdered } from '../../lib/guided'
import { DOCUMENT_STATUS_ZH } from '../../types'
import type { Document, DocumentStatus, DocumentType, DocumentVersion, Project, Zone, ZoneKind } from '../../types'

const DocumentViewer = lazy(() =>
  import('../documents/DocumentViewer').then(m => ({ default: m.DocumentViewer })),
)

// Guided 文件 tab (v112 #6). Top level = 文件類型 (圖則 + 施工方案及物料送審
// hard-locked, user types addable). 圖則 drills into 圖則分類; 施工方案及物料送審
// drills the same 大樓→分區→工種→位置→工序 route as the 進度表 and attaches
// documents to the 工序 leaf; a user type is a flat folder.

const SUBMISSION_TYPES: DocumentType[] = ['material_submission', 'method_statement']

const STATUS_PILL: Record<DocumentStatus, string> = {
  draft: 'bg-site-100 text-site-500',
  submitted: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-50 text-red-600',
  superseded: 'bg-gray-100 text-gray-500',
  withdrawn: 'bg-red-50 text-red-600',
}

const KIND_ZH: Record<ZoneKind, string> = { building: '大樓', external: '外圍' }

function NavRow({ label, count, sub, onClick, onDelete }: {
  label: string
  count?: number
  sub?: string
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-white border border-site-200 rounded-xl px-4 py-3.5 text-left hover:border-safety-300 active:bg-safety-50">
        <span className="min-w-0">
          <span className="block font-semibold text-[15px] text-site-900 truncate">{label}</span>
          {sub && <span className="block text-[11px] text-site-400 mt-0.5 truncate">{sub}</span>}
        </span>
        <span className="flex-shrink-0 flex items-center gap-1.5 text-site-400">
          {count !== undefined && <span className="text-xs font-semibold bg-site-100 text-site-600 rounded-full px-2 py-0.5">{count}</span>}
          <ChevronRight size={16} />
        </span>
      </button>
      {onDelete && (
        <button onClick={onDelete} className="flex-shrink-0 w-10 h-10 grid place-items-center text-site-300 hover:text-red-600" aria-label="刪除">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}

interface Sel {
  typeLabel?: string
  drawingCat?: string
  kind?: ZoneKind
  zoneId?: string
  tradeLabel?: string
  location?: string
  leafId?: string
}

export function GuidedDocs({ project }: { project: Project }) {
  const { documents, versionsByDocument, canUpload, loading } = useDocuments()
  const { items } = useProgress()
  const { byKind, add: addDict, remove: removeDict } = useDicts(project.id)

  const [sel, setSel] = useState<Sel>({})
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewing, setViewing] = useState<{ doc: Document; version: DocumentVersion } | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [err, setErr] = useState('')

  const zones = project.zones
  const zone: Zone | undefined = sel.zoneId ? zones.find(z => z.id === sel.zoneId) : undefined
  const isExternal = zone?.kind === 'external'

  const docTypes = byKind('doc_type')
  const drawingCats = byKind('drawing_type').map(d => d.label)

  // counts
  const drawingDocs = useMemo(() => documents.filter(d => d.document_type === 'drawing'), [documents])
  const submissionDocs = useMemo(() => documents.filter(d => SUBMISSION_TYPES.includes(d.document_type)), [documents])
  const customDocs = (label: string) => documents.filter(d => d.document_type === 'other' && d.category_label === label)

  const isDrawings = sel.typeLabel === '圖則'
  const isSubmission = sel.typeLabel === '施工方案及物料送審'

  // drill leaves for the submission flow
  const zoneLeaves = useMemo(
    () => guidedLeaves(items, sel.zoneId ? { zoneIds: [sel.zoneId] } : {}),
    [items, sel.zoneId],
  )
  const docCountForLeaves = (leafIds: Set<string>) =>
    submissionDocs.filter(d => d.progress_item_id && leafIds.has(d.progress_item_id)).length

  type DocPage = 'types' | 'drawcats' | 'docs' | 'kind' | 'zone' | 'trade' | 'location' | 'process' | 'leafdocs'
  const page: DocPage = useMemo(() => {
    if (!sel.typeLabel) return 'types'
    if (isDrawings) return sel.drawingCat ? 'docs' : 'drawcats'
    if (!isSubmission) return 'docs'
    if (!sel.kind) return 'kind'
    if (!sel.zoneId) return 'zone'
    if (!sel.tradeLabel) return 'trade'
    if (isExternal) return sel.leafId ? 'leafdocs' : 'process'
    if (!sel.location) return 'location'
    return sel.leafId ? 'leafdocs' : 'process'
  }, [sel, isDrawings, isSubmission, isExternal])

  function back() {
    setErr('')
    setSel(prev => {
      const n = { ...prev }
      if (page === 'leafdocs') { delete n.leafId; return n }
      if (page === 'process') { isExternal ? delete n.tradeLabel : delete n.location; return n }
      if (page === 'location') { delete n.tradeLabel; return n }
      if (page === 'trade') { delete n.zoneId; return n }
      if (page === 'zone') { delete n.kind; return n }
      if (page === 'drawcats' || page === 'kind') { delete n.typeLabel; return n }
      if (page === 'docs') {
        if (isDrawings && n.drawingCat) { delete n.drawingCat; return n }
        delete n.typeLabel
        return n
      }
      return n
    })
  }

  const crumbs = [
    sel.typeLabel, sel.drawingCat,
    sel.kind && KIND_ZH[sel.kind], zone?.name, sel.tradeLabel, sel.location,
    sel.leafId && items.find(i => i.id === sel.leafId)?.title,
  ].filter(Boolean).join(' › ')

  // docs shown on a 'docs' or 'leafdocs' page
  const pageDocs: Document[] = useMemo(() => {
    if (page === 'leafdocs') return submissionDocs.filter(d => d.progress_item_id === sel.leafId)
    if (page !== 'docs') return []
    if (isDrawings) {
      return drawingDocs.filter(d => (d.category_label ?? '未分類') === sel.drawingCat)
    }
    return customDocs(sel.typeLabel!)
  }, [page, sel, drawingDocs, submissionDocs, documents]) // eslint-disable-line react-hooks/exhaustive-deps

  function currentVersion(d: Document): DocumentVersion | null {
    const vs = versionsByDocument[d.id] ?? []
    return vs.find(v => v.id === d.current_version_id) ?? vs[vs.length - 1] ?? null
  }

  async function onAddType() {
    const r = await addDict('doc_type', newLabel)
    if (r.error) setErr(r.error); else setNewLabel('')
  }
  async function onAddDrawCat() {
    const r = await addDict('drawing_type', newLabel)
    if (r.error) setErr(r.error); else setNewLabel('')
  }

  if (loading) return <div className="py-10 flex justify-center"><Spinner size={26} /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 min-h-[36px]">
        {page !== 'types' && (
          <button onClick={back} className="flex-shrink-0 flex items-center gap-1 text-sm font-semibold text-site-600 bg-white border border-site-200 rounded-lg px-3 py-1.5 hover:bg-site-50 min-h-0">
            <ArrowLeft size={15} /> 返上一頁
          </button>
        )}
        <span className="text-xs text-site-400 truncate">{crumbs || '文件'}</span>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</div>}

      {/* ── 文件類型 ── */}
      {page === 'types' && (
        <div className="space-y-2">
          {docTypes.map(t => {
            const count = t.label === '圖則' ? drawingDocs.length
              : t.label === '施工方案及物料送審' ? submissionDocs.length
              : customDocs(t.label).length
            return (
              <NavRow
                key={t.id} label={t.label} count={count}
                onClick={() => setSel({ typeLabel: t.label })}
                onDelete={canUpload && !t.locked ? async () => { const r = await removeDict(t.id); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {canUpload && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增文件類型（例：檢驗報告）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddType()} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
        </div>
      )}

      {/* ── 圖則分類 ── */}
      {page === 'drawcats' && (
        <div className="space-y-2">
          {unionOrdered(drawingCats, drawingDocs.some(d => !d.category_label) ? ['未分類'] : []).map(cat => {
            const count = drawingDocs.filter(d => (d.category_label ?? '未分類') === cat).length
            const dictId = byKind('drawing_type').find(d => d.label === cat)?.id
            return (
              <NavRow
                key={cat} label={cat} count={count}
                onClick={() => setSel({ ...sel, drawingCat: cat })}
                onDelete={canUpload && dictId ? async () => { const r = await removeDict(dictId); if (r.error) setErr(r.error) } : undefined}
              />
            )
          })}
          {canUpload && (
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="新增圖則類型（例：消防圖）" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
              <button onClick={() => void onAddDrawCat()} disabled={!newLabel.trim()} className="btn-ghost px-3 flex items-center gap-1 disabled:opacity-40"><Plus size={14} /> 加</button>
            </div>
          )}
        </div>
      )}

      {/* ── submission drill: kind / zone / trade / location / process ── */}
      {page === 'kind' && (
        <div className="space-y-2">
          {(['building', 'external'] as ZoneKind[]).filter(k => zones.some(z => (z.kind ?? 'building') === k)).map(k => {
            const ids = new Set(zones.filter(z => (z.kind ?? 'building') === k).map(z => z.id))
            const leafIds = new Set(guidedLeaves(items).filter(l => l.zone_id && ids.has(l.zone_id)).map(l => l.id))
            return <NavRow key={k} label={KIND_ZH[k]} count={docCountForLeaves(leafIds)} onClick={() => setSel({ ...sel, kind: k })} />
          })}
        </div>
      )}

      {page === 'zone' && (
        <div className="space-y-2">
          {zones.filter(z => (z.kind ?? 'building') === sel.kind).map(z => {
            const leafIds = new Set(guidedLeaves(items, { zoneIds: [z.id] }).map(l => l.id))
            return <NavRow key={z.id} label={z.name} count={docCountForLeaves(leafIds)} onClick={() => setSel({ ...sel, zoneId: z.id })} />
          })}
        </div>
      )}

      {page === 'trade' && (
        <div className="space-y-2">
          {unionOrdered(byKind('trade').map(d => d.label), distinctValues(zoneLeaves, 'trade_label')).map(t => {
            const leafIds = new Set(guidedLeaves(zoneLeaves, { tradeLabel: t }).map(l => l.id))
            return <NavRow key={t} label={t} count={docCountForLeaves(leafIds)} onClick={() => setSel({ ...sel, tradeLabel: t })} />
          })}
        </div>
      )}

      {page === 'location' && (
        <div className="space-y-2">
          {unionOrdered(
            byKind('location').map(d => d.label),
            distinctValues(guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel }), 'location'),
          ).map(loc => {
            const leafIds = new Set(guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel, location: loc }).map(l => l.id))
            return <NavRow key={loc} label={loc} count={docCountForLeaves(leafIds)} onClick={() => setSel({ ...sel, location: loc })} />
          })}
        </div>
      )}

      {page === 'process' && (
        <div className="space-y-2">
          {guidedLeaves(zoneLeaves, { tradeLabel: sel.tradeLabel, location: isExternal ? undefined : sel.location }).map(l => (
            <NavRow
              key={l.id} label={l.title}
              count={submissionDocs.filter(d => d.progress_item_id === l.id).length}
              onClick={() => setSel({ ...sel, leafId: l.id })}
            />
          ))}
        </div>
      )}

      {/* ── document list (圖則分類 / 自訂類型 / 工序) ── */}
      {(page === 'docs' || page === 'leafdocs') && (
        <div className="space-y-2">
          {pageDocs.map(d => {
            const v = currentVersion(d)
            return (
              <button
                key={d.id}
                onClick={() => { if (v) setViewing({ doc: d, version: v }) }}
                className="w-full flex items-center gap-3 bg-white border border-site-200 rounded-xl px-4 py-3 text-left hover:border-safety-300"
              >
                <FileText size={18} className="text-site-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm text-site-900 truncate">{d.title}</span>
                  <span className="block text-[11px] text-site-400 font-mono">{d.doc_number}</span>
                </span>
                {v && (
                  <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_PILL[v.status]}`}>
                    {DOCUMENT_STATUS_ZH[v.status]}
                  </span>
                )}
              </button>
            )
          })}
          {pageDocs.length === 0 && <p className="text-sm text-site-400 text-center py-6">未有文件</p>}
          {canUpload && (
            <button onClick={() => setUploadOpen(true)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-safety-700 bg-safety-50 border border-safety-200 hover:bg-safety-100 py-2.5 rounded-xl">
              <Upload size={15} /> 上載文件
            </button>
          )}
        </div>
      )}

      <DocumentUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        progressItemId={page === 'leafdocs' ? sel.leafId : undefined}
        presetType={isDrawings ? 'drawing' : (!isSubmission && sel.typeLabel) ? 'other' : undefined}
        typeOptionsOverride={isSubmission ? SUBMISSION_TYPES : undefined}
        categoryLabel={isDrawings ? sel.drawingCat : (!isSubmission && sel.typeLabel) ? sel.typeLabel : undefined}
      />

      {viewing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/40 grid place-items-center"><Spinner size={28} className="text-white" /></div>}>
          <DocumentViewer
            version={viewing.version}
            document={viewing.doc}
            allVersions={versionsByDocument[viewing.doc.id] ?? []}
            onClose={() => setViewing(null)}
            onSelectVersion={v => setViewing({ doc: viewing.doc, version: v })}
          />
        </Suspense>
      )}
    </div>
  )
}
