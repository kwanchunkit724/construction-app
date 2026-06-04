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
import {
  drawingsPathFor,
  drawingsThumbPathFor,
  sanitizeFilename,
} from '../lib/drawings'
import { generateThumbnail } from '../lib/thumbnails'
import type { Drawing, DrawingVersion } from '../types'

const BUCKET = 'project-drawings'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB hard cap (D-15)
const SIGNED_URL_TTL = 3600 // 1 hour (D-20)
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const

interface DrawingsContextType {
  drawings: Drawing[]
  versionsByDrawing: Record<string, DrawingVersion[]>
  uploaderNameById: Record<string, string>
  loading: boolean
  fetchError: string | null

  uploadDrawing(args: {
    leafItemId: string
    title: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ drawingId: string | null; error: string | null }>

  uploadVersion(args: {
    drawingId: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ versionId: string | null; error: string | null }>

  withdrawVersion(versionId: string): Promise<{ error: string | null }>

  getViewerUrl(version: DrawingVersion): Promise<{ url: string | null; error: string | null }>
  getThumbUrl(version: DrawingVersion): Promise<{ url: string | null; error: string | null }>
}

// Raw context — exported as a NAMED export (ISSUE-01 BLOCKER fix).
// Plan 07's ProgressItemCard imports `DrawingsContext` directly to build a
// `useDrawingsOptional()` helper that returns null instead of throwing when
// no provider is mounted (e.g., when ProgressItemCard renders outside the
// drawings-aware tree). This export is a hard contract — do not remove.
export const DrawingsContext = createContext<DrawingsContextType | null>(null)

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return '檔案太大 (>25MB)，請壓縮後再上載'
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return '不支援的檔案格式 (只接受 PDF、JPEG、PNG)'
  }
  return null
}

export function DrawingsProvider({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [versionsByDrawing, setVersionsByDrawing] = useState<
    Record<string, DrawingVersion[]>
  >({})
  const [uploaderNameById, setUploaderNameById] = useState<
    Record<string, string>
  >({})
  const [fetchError, setFetchError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    // 1. Fetch drawings for this project
    const { data: drawingRows, error: drawingsErr } = await supabase
      .from('drawings')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (drawingsErr) {
      console.error('drawings fetch error:', drawingsErr)
      setFetchError(drawingsErr.message)
      setDrawings([])
      setVersionsByDrawing({})
      setUploaderNameById({})
      return
    }
    const loadedDrawings = (drawingRows ?? []) as Drawing[]
    setDrawings(loadedDrawings)

    if (loadedDrawings.length === 0) {
      setVersionsByDrawing({})
      setUploaderNameById({})
      setFetchError(null)
      return
    }

    // 2. Fetch versions for these drawings
    const drawingIds = loadedDrawings.map(d => d.id)
    const { data: versionRows, error: versionsErr } = await supabase
      .from('drawing_versions')
      .select('*')
      .in('drawing_id', drawingIds)
      .order('version_no', { ascending: false })
    if (versionsErr) {
      console.error('drawing_versions fetch error:', versionsErr)
      setFetchError(versionsErr.message)
      return
    }
    const loadedVersions = (versionRows ?? []) as DrawingVersion[]
    const grouped: Record<string, DrawingVersion[]> = {}
    for (const v of loadedVersions) {
      if (!grouped[v.drawing_id]) grouped[v.drawing_id] = []
      grouped[v.drawing_id].push(v)
    }
    setVersionsByDrawing(grouped)

    // 3. Fetch uploader names (ISSUE-03 fix) — one round-trip for all distinct ids
    const uploaderIds = Array.from(
      new Set(
        loadedVersions
          .map(v => v.uploaded_by)
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

    // Realtime: project-scoped drawings + all version changes (filtered client-side
    // by drawing_id ∈ current drawings). Single channel name per project.
    const onChange = debounce(() => void refetch(), REFETCH_DEBOUNCE_MS)
    const channel = supabase
      .channel(`drawings-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drawings',
          filter: `project_id=eq.${projectId}`,
        },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drawing_versions' },
        onChange,
      )
      .subscribe()

    return () => {
      onChange.cancel()
      supabase.removeChannel(channel)
    }
  }, [projectId, refetch])

  async function uploadDrawing({
    leafItemId,
    title,
    file,
    revisionLabel,
    onProgress,
  }: {
    leafItemId: string
    title: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ drawingId: string | null; error: string | null }> {
    if (!profile) return { drawingId: null, error: '未登入' }
    const validationErr = validateFile(file)
    if (validationErr) return { drawingId: null, error: validationErr }
    if (!title.trim()) return { drawingId: null, error: '請輸入圖則名稱' }

    onProgress?.(0)

    // Insert drawings row first — leaf-only trigger fires here
    const { data: insertedDrawing, error: insertErr } = await supabase
      .from('drawings')
      .insert({
        project_id: projectId,
        leaf_item_id: leafItemId,
        title: title.trim(),
        created_by: profile.id,
      })
      .select()
      .single()

    if (insertErr) {
      // ISSUE-12 fix: surface leaf-only Postgres trigger error in Chinese
      if (
        insertErr.message.includes('drawings can only attach to leaf progress items')
      ) {
        return { drawingId: null, error: '只能附加圖則到最末層進度項目' }
      }
      return { drawingId: null, error: insertErr.message }
    }

    const drawingId = (insertedDrawing as { id: string }).id

    // Best-effort thumbnail (D-16: failure is non-blocking, fallback to icon)
    const thumbBlob = await generateThumbnail(file)

    const cleanName = sanitizeFilename(file.name)
    const filePath = drawingsPathFor(projectId, drawingId, 1, cleanName)
    const thumbPath = drawingsThumbPathFor(projectId, drawingId, 1)

    // Defence-in-depth path enforcement (T-01-14 mitigation)
    if (!filePath.startsWith(`${projectId}/`)) {
      return { drawingId: null, error: 'Path validation failed' }
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (uploadErr) {
      return { drawingId: null, error: `上載失敗：${uploadErr.message}` }
    }

    if (thumbBlob) {
      // Best-effort — log and continue on failure
      const { error: thumbErr } = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        })
      if (thumbErr) console.warn('thumbnail upload failed:', thumbErr)
    }

    onProgress?.(50)

    const { data: insertedVersion, error: versionErr } = await supabase
      .from('drawing_versions')
      .insert({
        drawing_id: drawingId,
        version_no: 1,
        file_path: filePath,
        thumb_path: thumbBlob ? thumbPath : null,
        mime_type: file.type,
        size_bytes: file.size,
        revision_label: revisionLabel?.slice(0, 16) ?? null,
        status: 'current',
        uploaded_by: profile.id,
      })
      .select()
      .single()

    if (versionErr) {
      return { drawingId: null, error: versionErr.message }
    }

    const versionId = (insertedVersion as { id: string }).id
    const { error: linkErr } = await supabase
      .from('drawings')
      .update({ current_version_id: versionId })
      .eq('id', drawingId)
    if (linkErr) {
      return { drawingId, error: `建立版本後連結失敗：${linkErr.message}` }
    }

    onProgress?.(100)
    await refetch()
    return { drawingId, error: null }
  }

  async function uploadVersion({
    drawingId,
    file,
    revisionLabel,
    onProgress,
  }: {
    drawingId: string
    file: File
    revisionLabel?: string
    onProgress?: (pct: number) => void
  }): Promise<{ versionId: string | null; error: string | null }> {
    if (!profile) return { versionId: null, error: '未登入' }
    const validationErr = validateFile(file)
    if (validationErr) return { versionId: null, error: validationErr }

    onProgress?.(0)

    // Determine next version_no from existing versions
    const { data: maxRow, error: maxErr } = await supabase
      .from('drawing_versions')
      .select('version_no')
      .eq('drawing_id', drawingId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxErr) {
      return { versionId: null, error: `查詢最新版本失敗：${maxErr.message}` }
    }
    const nextVersionNo =
      ((maxRow as { version_no: number } | null)?.version_no ?? 0) + 1

    const cleanName = sanitizeFilename(file.name)
    const filePath = drawingsPathFor(projectId, drawingId, nextVersionNo, cleanName)
    const thumbPath = drawingsThumbPathFor(projectId, drawingId, nextVersionNo)

    if (!filePath.startsWith(`${projectId}/`)) {
      return { versionId: null, error: 'Path validation failed' }
    }

    const thumbBlob = await generateThumbnail(file)

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })
    if (uploadErr) {
      return { versionId: null, error: `上載失敗：${uploadErr.message}` }
    }

    if (thumbBlob) {
      const { error: thumbErr } = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: false,
        })
      if (thumbErr) console.warn('thumbnail upload failed:', thumbErr)
    }

    onProgress?.(50)

    // ISSUE-09 fix: single-transaction RPC (insert new + supersede old + update FK)
    const { data: newVersionId, error: rpcErr } = await supabase.rpc(
      'supersede_drawing_version',
      {
        p_drawing_id: drawingId,
        p_version_no: nextVersionNo,
        p_file_path: filePath,
        p_thumb_path: thumbBlob ? thumbPath : null,
        p_mime_type: file.type,
        p_size_bytes: file.size,
        p_revision_label: revisionLabel?.slice(0, 16) ?? null,
        p_uploaded_by: profile.id,
      },
    )
    if (rpcErr) {
      // Storage blob orphaned (acceptable in v1 per PITFALLS m5 — janitor cron deferred)
      return { versionId: null, error: `建立版本失敗：${rpcErr.message}` }
    }

    onProgress?.(100)
    await refetch()
    return { versionId: newVersionId as string, error: null }
  }

  async function withdrawVersion(versionId: string): Promise<{ error: string | null }> {
    if (!profile) return { error: '未登入' }

    // Look up the version to know its drawing_id (for current_version_id rebind)
    const { data: versionRow, error: lookupErr } = await supabase
      .from('drawing_versions')
      .select('id, drawing_id, status')
      .eq('id', versionId)
      .single()
    if (lookupErr) return { error: `找不到版本：${lookupErr.message}` }

    const wasCurrent = (versionRow as { status: string }).status === 'current'
    const drawingId = (versionRow as { drawing_id: string }).drawing_id

    const { error: updateErr } = await supabase
      .from('drawing_versions')
      .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
      .eq('id', versionId)
    if (updateErr) {
      if (updateErr.message.toLowerCase().includes('row-level security')) {
        return { error: '只有上載者或管理員可以撤回' }
      }
      return { error: updateErr.message }
    }

    // If we just withdrew the current version, promote the highest non-withdrawn one
    if (wasCurrent) {
      const { data: candidate, error: pickErr } = await supabase
        .from('drawing_versions')
        .select('id')
        .eq('drawing_id', drawingId)
        .neq('status', 'withdrawn')
        .order('version_no', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pickErr) {
        await refetch()
        return { error: `已撤回，但重選現行版本失敗：${pickErr.message}` }
      }
      const nextCurrentId = (candidate as { id: string } | null)?.id ?? null
      const { error: rebindErr } = await supabase
        .from('drawings')
        .update({ current_version_id: nextCurrentId })
        .eq('id', drawingId)
      if (rebindErr) {
        await refetch()
        return { error: `已撤回，但更新現行指標失敗：${rebindErr.message}` }
      }
    }

    await refetch()
    return { error: null }
  }

  async function getViewerUrl(
    version: DrawingVersion,
  ): Promise<{ url: string | null; error: string | null }> {
    // PITFALLS C1: NEVER getPublicUrl on this private bucket.
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(version.file_path, SIGNED_URL_TTL)
    if (error) return { url: null, error: error.message }
    return { url: data.signedUrl, error: null }
  }

  async function getThumbUrl(
    version: DrawingVersion,
  ): Promise<{ url: string | null; error: string | null }> {
    if (!version.thumb_path) return { url: null, error: null }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(version.thumb_path, SIGNED_URL_TTL)
    if (error) return { url: null, error: error.message }
    return { url: data.signedUrl, error: null }
  }

  return (
    <DrawingsContext.Provider
      value={{
        drawings,
        versionsByDrawing,
        uploaderNameById,
        loading,
        fetchError,
        uploadDrawing,
        uploadVersion,
        withdrawVersion,
        getViewerUrl,
        getThumbUrl,
      }}
    >
      {children}
    </DrawingsContext.Provider>
  )
}

export function useDrawings(): DrawingsContextType {
  const ctx = useContext(DrawingsContext)
  if (!ctx) throw new Error('useDrawings must be used within DrawingsProvider')
  return ctx
}
