import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { debounce, REFETCH_DEBOUNCE_MS } from '../lib/realtime'
import { useAuth } from './AuthContext'
import { useProjects } from './ProjectsContext'
import { docsPathFor, docsThumbPathFor, sanitizeFilename } from '../lib/documents'
import { compressImage } from '../lib/image-compress'
import { generateThumbnail } from '../lib/thumbnails'
import type { Document, DocumentVersion, DocumentType } from '../types'

// New uploads land in project-docs; migrated drawings keep project-drawings on
// their version row (getViewerUrl signs against version.bucket_id, never this).
const UPLOAD_BUCKET = 'project-docs'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB hard cap (mirrors DrawingsContext D-15)
const SIGNED_URL_TTL = 3600 // 1 hour (mirrors DrawingsContext D-20)
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const

interface DocumentsContextType {
  projectId: string
  documents: Document[]
  versionsByDocument: Record<string, DocumentVersion[]>
  uploaderNameById: Record<string, string>
  loading: boolean
  fetchError: string | null
  // Computed from useAuth + useProjects memberships — mirrors the DB helpers
  // can_upload_document / can_review_document (v40-split/3-helpers-and-rls.sql).
  canUpload: boolean
  canReview: boolean
  // Whether the current user may upload a DRAWING-type document. The DB carve-out
  // (can_upload_drawing, D-25) is stricter than can_upload_document: only pm /
  // main_contractor (+ admin / assigned PM). The type picker must hide 圖則 from
  // a 判頭 / 老總, else they burn a DWG number then hit a generic RLS error.
  canUploadDrawingType: boolean

  uploadDocument(args: {
    documentType: DocumentType
    title: string
    file: File
    progressItemId?: string
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ documentId: string | null; error: string | null }>

  uploadVersion(args: {
    documentId: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ versionId: string | null; error: string | null }>

  reviewVersion(
    versionId: string,
    action: 'approve' | 'reject',
    note?: string,
  ): Promise<{ error: string | null }>

  withdrawVersion(versionId: string): Promise<{ error: string | null }>

  getViewerUrl(version: DocumentVersion): Promise<{ url: string | null; error: string | null }>
  getThumbUrl(version: DocumentVersion): Promise<{ url: string | null; error: string | null }>
}

// Raw context — NAMED export, mirroring DrawingsContext. Phase C's
// ProgressItemCard imports `DocumentsContext` directly to build a
// `useDocumentsOptional()` helper that returns null instead of throwing when no
// provider is mounted (e.g. dashboard preview). This export is a hard contract.
export const DocumentsContext = createContext<DocumentsContextType | null>(null)

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return '檔案太大 (>25MB)，請壓縮後再上載'
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return '不支援的檔案格式 (只接受 PDF、JPEG、PNG)'
  }
  return null
}

export function DocumentsProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const { profile } = useAuth()
  const { memberships, projects } = useProjects()
  const [loading, setLoading] = useState(true)
  const [documents, setDocuments] = useState<Document[]>([])
  const [versionsByDocument, setVersionsByDocument] = useState<
    Record<string, DocumentVersion[]>
  >({})
  const [uploaderNameById, setUploaderNameById] = useState<
    Record<string, string>
  >({})
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── Client-side permission gates ────────────────────────────
  // Mirror the SECURITY DEFINER helpers so the UI can hide actions the RPC
  // would reject. The RPC is still the authority — these only gate UI affordance.
  // can_upload_document: admin OR assigned PM OR approved member with role in
  //   (pm, general_foreman, main_contractor, subcontractor) — 判頭 INCLUDED.
  const canUpload = (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    return (
      !!myMembership &&
      ['pm', 'general_foreman', 'main_contractor', 'subcontractor'].includes(myMembership.role)
    )
  })()

  // can_review_document: admin OR assigned PM OR approved member with role in
  //   (pm, general_foreman, main_contractor) — 判頭 EXCLUDED (supervisors only).
  const canReview = (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    return (
      !!myMembership &&
      ['pm', 'general_foreman', 'main_contractor'].includes(myMembership.role)
    )
  })()

  // can_upload_drawing (v8-drawings.sql, D-25): stricter than can_upload_document —
  // only pm / main_contractor memberships (+ admin / assigned PM). 判頭 AND 老總
  // (general_foreman) are excluded from issuing drawings.
  const canUploadDrawingType = (() => {
    if (!profile) return false
    if (profile.global_role === 'admin') return true
    const project = projects.find(p => p.id === projectId)
    if (project?.assigned_pm_ids.includes(profile.id)) return true
    const myMembership = memberships.find(
      m => m.user_id === profile.id && m.project_id === projectId && m.status === 'approved',
    )
    return !!myMembership && ['pm', 'main_contractor'].includes(myMembership.role)
  })()

  const refetch = useCallback(async () => {
    // 1. Fetch documents for this project
    const { data: documentRows, error: documentsErr } = await supabase
      .from('documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (documentsErr) {
      console.error('documents fetch error:', documentsErr)
      setFetchError(documentsErr.message)
      setDocuments([])
      setVersionsByDocument({})
      setUploaderNameById({})
      return
    }
    const loadedDocuments = (documentRows ?? []) as Document[]
    setDocuments(loadedDocuments)

    if (loadedDocuments.length === 0) {
      setVersionsByDocument({})
      setUploaderNameById({})
      setFetchError(null)
      return
    }

    // 2. Fetch versions for these documents
    const documentIds = loadedDocuments.map(d => d.id)
    const { data: versionRows, error: versionsErr } = await supabase
      .from('document_versions')
      .select('*')
      .in('document_id', documentIds)
      .order('version_no', { ascending: false })
    if (versionsErr) {
      console.error('document_versions fetch error:', versionsErr)
      setFetchError(versionsErr.message)
      return
    }
    const loadedVersions = (versionRows ?? []) as DocumentVersion[]
    const grouped: Record<string, DocumentVersion[]> = {}
    for (const v of loadedVersions) {
      if (!grouped[v.document_id]) grouped[v.document_id] = []
      grouped[v.document_id].push(v)
    }
    setVersionsByDocument(grouped)

    // 3. Fetch uploader names — one round-trip for all distinct ids
    const uploaderIds = Array.from(
      new Set(
        loadedVersions
          .map(v => v.submitted_by)
          .filter((x): x is string => Boolean(x)),
      ),
    )
    if (uploaderIds.length > 0) {
      const { data: profileRows, error: profilesErr } = await supabase
        .from('user_profiles')
        .select('id, name')
        .in('id', uploaderIds)
      if (profilesErr) {
        console.error('uploader profiles fetch error:', profilesErr)
        // Non-fatal — UI falls back to displaying truncated UUID
      } else {
        const map: Record<string, string> = {}
        for (const row of profileRows ?? []) {
          map[(row as { id: string; name: string }).id] = (
            row as { id: string; name: string }
          ).name
        }
        setUploaderNameById(map)
      }
    } else {
      setUploaderNameById({})
    }

    setFetchError(null)
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    refetch().finally(() => setLoading(false))

    // Realtime: project-scoped documents + all version changes. Single channel
    // name per project, debounced to coalesce write bursts (lib/realtime).
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`documents-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `project_id=eq.${projectId}`,
        },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_versions' },
        onChange,
      )
      .subscribe()

    return () => {
      onChange.cancel()
      supabase.removeChannel(channel)
    }
  }, [projectId, refetch])

  async function uploadDocument({
    documentType,
    title,
    file,
    progressItemId,
    revisionLabel,
    onProgress,
  }: {
    documentType: DocumentType
    title: string
    file: File
    progressItemId?: string
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ documentId: string | null; error: string | null }> {
    if (!profile) return { documentId: null, error: '未登入' }
    // Drawing-type carve-out (D-25): block before next_document_number so a
    // 判頭 / 老總 never burns a DWG counter number on a write the DB will reject.
    if (documentType === 'drawing' && !canUploadDrawingType) {
      return { documentId: null, error: '沒有上載圖則權限' }
    }
    // Compress images before any size validation so a large iPhone shot that
    // would fail the 25MB cap raw can still go through downscaled.
    const prepared = await compressImage(file)
    const validationErr = validateFile(prepared)
    if (validationErr) return { documentId: null, error: validationErr }
    if (!title.trim()) return { documentId: null, error: '請輸入文件名稱' }

    onProgress?.(0)

    // 1. Allocate a per-project per-type document number (MAT-007 etc).
    const { data: docNumber, error: numErr } = await supabase.rpc(
      'next_document_number',
      { p_project_id: projectId, p_type: documentType },
    )
    if (numErr) {
      if (numErr.message.includes('沒有權限') || numErr.message.toLowerCase().includes('permission')) {
        return { documentId: null, error: '沒有權限產生文件編號' }
      }
      return { documentId: null, error: `產生文件編號失敗：${numErr.message}` }
    }

    // 2. Insert the documents header — leaf-only trigger fires here when a
    //    progress_item_id is supplied (NULL → project-level doc, allowed).
    const { data: insertedDocument, error: insertErr } = await supabase
      .from('documents')
      .insert({
        project_id: projectId,
        progress_item_id: progressItemId ?? null,
        document_type: documentType,
        title: title.trim(),
        doc_number: (docNumber as string) ?? null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.message.includes('documents can only attach to leaf progress items')) {
        return { documentId: null, error: '只能附加文件到最末層進度項目' }
      }
      if (insertErr.message.toLowerCase().includes('row-level security')) {
        return { documentId: null, error: '沒有上載權限' }
      }
      return { documentId: null, error: insertErr.message }
    }

    const documentId = (insertedDocument as { id: string }).id

    // 3. Upload the v1 blob + best-effort thumbnail.
    const thumbBlob = await generateThumbnail(prepared)
    const cleanName = sanitizeFilename(prepared.name)
    const filePath = docsPathFor(projectId, documentId, 1, cleanName)
    const thumbPath = docsThumbPathFor(projectId, documentId, 1)

    // Defence-in-depth path enforcement (T-01-14 mitigation, drawings parity).
    if (!filePath.startsWith(`${projectId}/`)) {
      return { documentId: null, error: 'Path validation failed' }
    }

    const { error: uploadErr } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(filePath, prepared, { contentType: prepared.type, upsert: false })
    if (uploadErr) {
      return { documentId: null, error: `上載失敗：${uploadErr.message}` }
    }

    if (thumbBlob) {
      const { error: thumbErr } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: false })
      if (thumbErr) console.warn('thumbnail upload failed:', thumbErr)
    }

    onProgress?.(50)

    // 4. Create version 1 through the supersede RPC (single transaction: insert
    //    submitted version + supersede priors (none) + repoint current_version_id
    //    + audit). submitted_by is forced to the caller server-side (B3) — we
    //    pass profile.id only for signature compatibility.
    const { data: newVersionId, error: rpcErr } = await supabase.rpc(
      'supersede_document_version',
      {
        p_document_id: documentId,
        p_version_no: 1,
        p_bucket: UPLOAD_BUCKET,
        p_file_path: filePath,
        p_thumb_path: thumbBlob ? thumbPath : null,
        p_mime: prepared.type,
        p_size: prepared.size,
        p_revision_label: revisionLabel?.slice(0, 16) ?? null,
        p_submitted_by: profile.id,
      },
    )
    if (rpcErr) {
      // Storage blob + header now orphaned (acceptable in v1 — janitor cron
      // deferred, same posture as DrawingsContext PITFALLS m5).
      return { documentId: null, error: `建立版本失敗：${rpcErr.message}` }
    }
    void newVersionId

    onProgress?.(100)
    await refetch()
    return { documentId, error: null }
  }

  async function uploadVersion({
    documentId,
    file,
    revisionLabel,
    onProgress,
  }: {
    documentId: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ versionId: string | null; error: string | null }> {
    if (!profile) return { versionId: null, error: '未登入' }
    const prepared = await compressImage(file)
    const validationErr = validateFile(prepared)
    if (validationErr) return { versionId: null, error: validationErr }

    onProgress?.(0)

    // Determine next version_no from existing versions.
    const { data: maxRow, error: maxErr } = await supabase
      .from('document_versions')
      .select('version_no')
      .eq('document_id', documentId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxErr) {
      return { versionId: null, error: `查詢最新版本失敗：${maxErr.message}` }
    }
    const nextVersionNo =
      ((maxRow as { version_no: number } | null)?.version_no ?? 0) + 1

    const cleanName = sanitizeFilename(prepared.name)
    const filePath = docsPathFor(projectId, documentId, nextVersionNo, cleanName)
    const thumbPath = docsThumbPathFor(projectId, documentId, nextVersionNo)

    if (!filePath.startsWith(`${projectId}/`)) {
      return { versionId: null, error: 'Path validation failed' }
    }

    const thumbBlob = await generateThumbnail(prepared)

    const { error: uploadErr } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(filePath, prepared, { contentType: prepared.type, upsert: false })
    if (uploadErr) {
      return { versionId: null, error: `上載失敗：${uploadErr.message}` }
    }

    if (thumbBlob) {
      const { error: thumbErr } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: false })
      if (thumbErr) console.warn('thumbnail upload failed:', thumbErr)
    }

    onProgress?.(50)

    // Single-transaction RPC: insert new submitted version + supersede priors +
    // repoint current_version_id + audit. submitted_by forced to caller (B3).
    const { data: newVersionId, error: rpcErr } = await supabase.rpc(
      'supersede_document_version',
      {
        p_document_id: documentId,
        p_version_no: nextVersionNo,
        p_bucket: UPLOAD_BUCKET,
        p_file_path: filePath,
        p_thumb_path: thumbBlob ? thumbPath : null,
        p_mime: prepared.type,
        p_size: prepared.size,
        p_revision_label: revisionLabel?.slice(0, 16) ?? null,
        p_submitted_by: profile.id,
      },
    )
    if (rpcErr) {
      return { versionId: null, error: `建立版本失敗：${rpcErr.message}` }
    }

    onProgress?.(100)
    await refetch()
    return { versionId: newVersionId as string, error: null }
  }

  async function reviewVersion(
    versionId: string,
    action: 'approve' | 'reject',
    note?: string,
  ): Promise<{ error: string | null }> {
    if (!profile) return { error: '未登入' }
    if (action === 'reject' && !note?.trim()) {
      return { error: '拒絕文件必須填寫原因' }
    }
    const { error } = await supabase.rpc('review_document_version', {
      p_version_id: versionId,
      p_action: action,
      p_note: note?.trim() ?? null,
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function withdrawVersion(versionId: string): Promise<{ error: string | null }> {
    if (!profile) return { error: '未登入' }
    // The RPC marks the version withdrawn AND rebinds the document's current
    // pointer in one transaction (server-side) — no client multi-step rebind
    // like DrawingsContext.withdrawVersion needed.
    const { error } = await supabase.rpc('withdraw_document_version', {
      p_version_id: versionId,
    })
    if (error) return { error: error.message }
    await refetch()
    return { error: null }
  }

  async function getViewerUrl(
    version: DocumentVersion,
  ): Promise<{ url: string | null; error: string | null }> {
    // NEVER getPublicUrl on these private buckets. Sign against the version's
    // OWN bucket — migrated drawings live in project-drawings, new docs in
    // project-docs (FILE-SYSTEM-DESIGN §2.1).
    const { data, error } = await supabase.storage
      .from(version.bucket_id)
      .createSignedUrl(version.file_path, SIGNED_URL_TTL)
    if (error) return { url: null, error: error.message }
    return { url: data.signedUrl, error: null }
  }

  async function getThumbUrl(
    version: DocumentVersion,
  ): Promise<{ url: string | null; error: string | null }> {
    if (!version.thumb_path) return { url: null, error: null }
    const { data, error } = await supabase.storage
      .from(version.bucket_id)
      .createSignedUrl(version.thumb_path, SIGNED_URL_TTL)
    if (error) return { url: null, error: error.message }
    return { url: data.signedUrl, error: null }
  }

  return (
    <DocumentsContext.Provider
      value={{
        projectId,
        documents,
        versionsByDocument,
        uploaderNameById,
        loading,
        fetchError,
        canUpload,
        canReview,
        canUploadDrawingType,
        uploadDocument,
        uploadVersion,
        reviewVersion,
        withdrawVersion,
        getViewerUrl,
        getThumbUrl,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  )
}

export function useDocuments(): DocumentsContextType {
  const ctx = useContext(DocumentsContext)
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider')
  return ctx
}
