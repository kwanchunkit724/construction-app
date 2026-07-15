---
phase: 01-drawings-on-progress-items
plan: 05
subsystem: drawings
tags: [context, storage, realtime, rpc]
requires:
  - Plan 01-01 (drawings + drawing_versions tables, supersede_drawing_version RPC, project-drawings bucket, RLS)
  - Plan 01-04 (Drawing/DrawingVersion types in src/types.ts; pdfjs worker setup)
provides:
  - "useDrawings() hook (DrawingsContextType)"
  - "DrawingsProvider({ projectId }) component"
  - "Raw `DrawingsContext` named export (consumed by Plan 01-07)"
  - "Pure helpers: drawingsPathFor, drawingsThumbPathFor, revisionLabelOrDefault, sanitizeFilename"
  - "generateThumbnail(file: File): Promise<Blob | null>"
affects:
  - "src/lib/drawings.ts (new)"
  - "src/lib/thumbnails.ts (new)"
  - "src/contexts/DrawingsContext.tsx (new)"
tech-stack:
  added:
    - "react-pdf pdfjs.getDocument for PDF page-1 thumbnail rendering (worker already in src/lib/pdfWorker.ts)"
  patterns:
    - "Project-scoped Context with realtime subscription (mirrors IssuesContext)"
    - "Postgres RPC for multi-row atomicity (single transaction)"
    - "Strict-rejection sanitization (no recovery, no guessing)"
    - "Best-effort thumbnail generation with null-fallback"
key-files:
  created:
    - src/lib/drawings.ts
    - src/lib/thumbnails.ts
    - src/contexts/DrawingsContext.tsx
  modified: []
decisions:
  - "sanitizeFilename strictly returns 'drawing.bin' on any '..' or '/' (ISSUE-02 fix) — drops user filename; display-name lives in drawings.title"
  - "uploadVersion uses supersede_drawing_version RPC (single txn) instead of 3 sequential queries (ISSUE-09 fix)"
  - "uploaderNameById fetched in refetch via single user_profiles JOIN — avoids per-row N+1 in DrawingVersionHistory (ISSUE-03 fix)"
  - "Leaf-trigger Postgres error mapped to Chinese '只能附加圖則到最末層進度項目' (ISSUE-12 fix)"
  - "Withdrawn current version: auto-rebind current_version_id to highest non-withdrawn version (or null)"
  - "Orphan storage blob accepted in v1 if RPC fails after upload (PITFALLS m5 — janitor cron deferred)"
metrics:
  duration: ~12m
  completed: 2026-05-12
---

# Phase 01 Plan 05: Drawings Logic Layer Summary

JWT-validated DrawingsContext that owns project-scoped drawings + versions state, mints signed URLs (never public), uses single-transaction RPC for version supersession, and exposes uploader names via a single user_profiles JOIN.

## Files Created

| Path | Purpose |
|------|---------|
| `src/lib/drawings.ts` | Pure path helpers + strict sanitizeFilename (rejects '..' and '/') + revisionLabelOrDefault. Dev-only console.assert sanity checks gated by `import.meta.env.DEV`. |
| `src/lib/thumbnails.ts` | `generateThumbnail(file)` → 256x256 JPEG Blob. Images use createImageBitmap + cover crop; PDFs use pdfjs.getDocument page 1 + contain letterbox. Returns null on any failure (D-16). |
| `src/contexts/DrawingsContext.tsx` | DrawingsProvider + useDrawings + raw `DrawingsContext` named export. ~486 lines. |

## API Surface (DrawingsContextType)

```ts
{
  drawings: Drawing[]
  versionsByDrawing: Record<string, DrawingVersion[]>  // newest-first per drawing
  uploaderNameById: Record<string, string>             // user_profiles.name lookup
  loading: boolean
  fetchError: string | null

  uploadDrawing({ leafItemId, title, file, revisionLabel?, onProgress? })
    → Promise<{ drawingId, error }>

  uploadVersion({ drawingId, file, revisionLabel?, onProgress? })
    → Promise<{ versionId, error }>  // single-txn RPC

  withdrawVersion(versionId)
    → Promise<{ error }>             // soft UPDATE, auto-rebinds current

  getViewerUrl(version) → Promise<{ url, error }>   // signed, 3600s TTL
  getThumbUrl(version)  → Promise<{ url, error }>   // signed, 3600s TTL
}
```

## Critical Contracts (grep-verifiable)

| Contract | Evidence |
|----------|----------|
| Named export of raw context | `grep -c "export const DrawingsContext = createContext" src/contexts/DrawingsContext.tsx` → 1 |
| RPC-based supersede | `grep -c "supersede_drawing_version" src/contexts/DrawingsContext.tsx` → 1 |
| No public URL | `grep -nE "\.getPublicUrl\(" src/contexts/DrawingsContext.tsx` → 0 actual calls (1 hit is comment "PITFALLS C1: NEVER getPublicUrl…") |
| Signed URLs only | `grep -c "createSignedUrl" src/contexts/DrawingsContext.tsx` → 2 (viewer + thumb) |
| Realtime channel name | `grep -c "drawings-\${projectId}" src/contexts/DrawingsContext.tsx` → 1 |
| uploaderNameById exposed | `grep -c "uploaderNameById" src/contexts/DrawingsContext.tsx` → 3 (state, value, comment) |
| Leaf-trigger Chinese error | `grep -c "只能附加圖則到最末層進度項目" src/contexts/DrawingsContext.tsx` → 1 |
| useDrawings throws if no provider | `grep -c "useDrawings must be used within DrawingsProvider" src/contexts/DrawingsContext.tsx` → 1 |
| sanitizeFilename strict | `sanitizeFilename('../../passwd') === 'drawing.bin'` asserted in dev block |

## Error Message Catalog

| Trigger | Surface |
|---------|---------|
| No session | 未登入 |
| File > 25 MB | 檔案太大 (>25MB)，請壓縮後再上載 |
| Bad MIME | 不支援的檔案格式 (只接受 PDF、JPEG、PNG) |
| Empty title | 請輸入圖則名稱 |
| Leaf-trigger from Postgres | 只能附加圖則到最末層進度項目 |
| RLS rejects withdraw | 只有上載者或管理員可以撤回 |
| Path validation | Path validation failed (defence-in-depth — should never fire if helpers are correct) |
| Upload failure | 上載失敗：{message} |
| Version RPC failure | 建立版本失敗：{message} |

## RPC-Based Supersede Semantics

`uploadVersion` calls `supabase.rpc('supersede_drawing_version', ...)` (defined in `supabase/v8-drawings.sql`). The RPC executes in a single Postgres transaction:

1. INSERT new `drawing_versions` row with `status='current'` → returning new id
2. UPDATE all *other* `drawing_versions` for this drawing where `status='current'` → set `status='superseded'`, `superseded_at=now()`
3. UPDATE `drawings.current_version_id = newId`, `updated_at = now()`
4. RETURN new id

Partial failure rolls the whole txn back — no zero-current-version window (T-01-17 mitigation).

The RPC is **not** `security definer`, so RLS still applies — caller must satisfy `can_upload_drawing` for the project.

## Orphan Blob Handling (Deferred)

If the RPC errors *after* the storage upload succeeds, the file blob is left in `project-drawings/{project}/{drawing}/v{n}/`. Per PITFALLS m5, this is **accepted in v1** — a periodic janitor (Postgres `pg_cron` job that diffs `storage.objects` against `drawing_versions.file_path`) is queued for a future plan. The data risk is bounded: orphans are unreachable via `getViewerUrl` (which only mints from `drawing_versions.file_path`), they're inside a private bucket, and the leaf-trigger / size / mime gates prevent garbage from accumulating.

## Realtime Subscription

Single channel per project: `drawings-${projectId}`. Listens to:
- `drawings` table filtered by `project_id=eq.${projectId}`
- `drawing_versions` table (no filter — refetch is cheap and version-row inserts during another user's upload should reflect immediately)

Both events trigger `refetch()` which re-runs all 3 fetches (drawings → versions → uploader names). Cleanup via `supabase.removeChannel(channel)` on unmount.

## Build & Type-Check

```
npx tsc --noEmit  → exit 0
npm run build     → exit 0
                    Entry chunk: 500.55 kB (gzip 140.48 kB) — well under 800 kB budget
```

## Deviations from Plan

None — plan executed exactly as written. All plan-mandated contracts (named context export, RPC supersede, uploaderNameById JOIN, strict sanitizeFilename, leaf-trigger Chinese error, no getPublicUrl) implemented as specified.

## Commits

| Hash | Subject |
|------|---------|
| `fe36a5a` | feat(01-05): add pure path helpers + thumbnail generator for drawings |
| `88c195c` | feat(01-05): add DrawingsContext with uploader names + supersede RPC |

## Self-Check: PASSED

- FOUND: src/lib/drawings.ts
- FOUND: src/lib/thumbnails.ts
- FOUND: src/contexts/DrawingsContext.tsx
- FOUND: commit fe36a5a (Task 1)
- FOUND: commit 88c195c (Task 2)
- Build exits 0; tsc exits 0; entry chunk 500.55 kB < 800 kB
- All grep contracts verified (see Critical Contracts table)
