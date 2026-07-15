---
phase: 01-drawings-on-progress-items
plan: 06
subsystem: drawings-ui-components
tags: [react, components, viewer, lazy-load, capacitor]
requires:
  - 01-04-SUMMARY (react-pdf, react-zoom-pan-pinch, pdfWorker, types)
  - 01-05-SUMMARY (DrawingsContext: useDrawings, uploaderNameById, uploadDrawing, uploadVersion, getViewerUrl)
provides:
  - DrawingThumbnail (tile + status badge)
  - DrawingUploadSheet (3 input modes + 25MB hard block)
  - DrawingViewer (full-screen pinch-zoom + PDF page-by-page)
  - DrawingVersionHistory (uploader-name resolved, no raw UUIDs)
  - PdfPageNavigator (floating prev/next bar)
affects:
  - vite.config.ts manualChunks (viewer-pdf + viewer-zoom chunks materialize once Plan 07 imports DrawingViewer)
tech-stack:
  added: []
  patterns:
    - "Caller-side React.lazy() for heavy modules; static imports inside the lazy module route to manualChunks"
    - "Capacitor plugin (@capacitor/camera) imported lazily inside click handlers"
    - "Inline state-machine slot pattern (mirrors CreateIssueModal photo flow)"
key-files:
  created:
    - src/components/drawings/DrawingThumbnail.tsx
    - src/components/drawings/DrawingUploadSheet.tsx
    - src/components/drawings/DrawingViewer.tsx
    - src/components/drawings/DrawingVersionHistory.tsx
    - src/components/drawings/PdfPageNavigator.tsx
  modified: []
decisions:
  - "Status badges share an inline component duplicated in DrawingThumbnail and DrawingVersionHistory (kept local to avoid circular import; sharing can move to a tiny module if a third callsite appears)"
  - "Camera plugin lazy-imported on click — fallback to hidden file inputs (capture/multiple) on web or when plugin throws"
  - "Soft warning rendered inline (no toast library in repo) — appears as amber banner in the sheet"
  - "Revision label input shown for both new-drawing and new-version flows (per D-07 + 01-CONTEXT)"
metrics:
  duration: ~22m
  completed: "2026-05-12"
---

# Phase 1 Plan 06: Drawings UI Components Summary

Five view-layer components, each with a single clear responsibility. They consume `DrawingsContext` from Plan 05 and lazy-load heavy viewer libraries via Vite manualChunks so the entry bundle stays well under 800 KB.

## Component Prop Contracts (as built)

All exports match the `<interfaces>` block in 01-06-PLAN.md exactly. Each module exports both a named export and a default export to ease consumption from `React.lazy(() => import(...))`.

| Component | Named export | Default export | Props interface |
|-----------|--------------|----------------|-----------------|
| DrawingThumbnail | `DrawingThumbnail` | yes | `DrawingThumbnailProps` |
| DrawingUploadSheet | `DrawingUploadSheet` | yes | `DrawingUploadSheetProps` |
| DrawingViewer | `DrawingViewer` | yes | `DrawingViewerProps` |
| DrawingVersionHistory | `DrawingVersionHistory` | yes | `DrawingVersionHistoryProps` |
| PdfPageNavigator | `PdfPageNavigator` | yes | `PdfPageNavigatorProps` |

## Lazy-Load Boundaries

- **Caller side (Plan 07's job):** `const DrawingViewer = React.lazy(() => import('./drawings/DrawingViewer'))`
- **Inside the viewer module:** static imports of `react-pdf` (→ `viewer-pdf` chunk) and `react-zoom-pan-pinch` (→ `viewer-zoom` chunk) per `vite.config.ts manualChunks`. These chunks only materialize once a callsite actually imports DrawingViewer.
- **Inside DrawingUploadSheet:** `@capacitor/camera` imported via `await import('@capacitor/camera')` inside click handlers; web platforms fall through to a hidden `<input type="file">`.

## Bundle Stats (Post-Build)

```
index-DLMi3Rsu.js        492.2 KB  (limit 800 KB)   <-- entry, well under threshold
reports-pdf              381.9 KB
reports-xlsx             276.1 KB
html2canvas              197.6 KB
index.es                 147.2 KB
reports-pdf-autotable     30.1 KB
purify.es                 23.7 KB
export                     3.8 KB
```

`viewer-pdf` and `viewer-zoom` chunks are NOT yet present — they materialize when Plan 07 wires DrawingViewer into a render path. Today no module imports DrawingViewer (Grep confirms only the file itself references the symbol), so Vite tree-shakes the entire viewer subtree out of the build. This is the correct intermediate state.

## uploaderNameById Consumption Pattern

`DrawingVersionHistory.tsx` calls `useDrawings()` and reads `uploaderNameById`:

```ts
const { uploaderNameById } = useDrawings()
// ...
const uploaderName = uploaderNameById[v.uploaded_by ?? ''] || '未知'
```

This satisfies the ISSUE-03 fix: raw UUIDs from `drawing_versions.uploaded_by` are NEVER rendered to UI. When the lookup misses (uploader profile fetch failed, or value is null), the user sees the canonical fallback `未知`.

## Canonical Chinese Error-String Pinning (ISSUE-04)

Module-level constants in `DrawingUploadSheet.tsx`:

```ts
const ERR_TOO_LARGE = '檔案太大 (>25MB)，請壓縮後再上載'
const WARN_LARGE = '檔案較大，可能會慢'
```

Bytes verified:
- `(` and `)` are half-width (U+0028 / U+0029)
- `>` is half-width (U+003E)
- `，` is full-width (U+FF0C)

This matches the form pinned in Plan 04 / Plan 05 (`DrawingsContext.validateFile`) and the form Plan 09's manual UAT step (SC4) compares against.

## ISSUE-11 Invariant Documentation

`DrawingViewer.tsx` opens with a top-of-file comment block stating: DrawingsProvider is assumed mounted upstream; the component calls `useDrawings()` unconditionally and is only ever instantiated from `DrawingsSection` (Plan 07), which uses `useDrawingsOptional()` to early-return when no provider is in scope. Rendering DrawingViewer without a provider WILL throw — by design.

## Verification Results

- `npx tsc --noEmit` — passes (no type errors)
- `npm run build:check` — passes; entry chunk 492 KB (<800 KB limit)
- Grep `uploaderNameById\[` in DrawingVersionHistory.tsx — 1 hit
- Grep canonical hard-block string in DrawingUploadSheet.tsx — 1 hit
- Grep `data-testid="drawing-viewer-zoom"` in DrawingViewer.tsx — 1 hit
- Grep `getPublicUrl` in src/components/drawings/ — 0 hits (defence-in-depth ok)

## Deviations from Plan

**None.** Plan executed exactly as written. Two minor judgement calls documented in `decisions:` frontmatter (status-badge component duplication kept local instead of extracted; revision-label input shown in both flows).

## Deferred Items

- **Swipe-down close** in DrawingViewer (D-09): plan explicitly marked optional for v1; X button is primary close affordance. Not implemented.
- **Toast system:** repo has no toast library; soft warnings render as inline amber banners inside the upload sheet. No new dependency introduced.
- **Status badge extraction:** small inline `StatusBadge` / `DrawingStatusBadge` components are duplicated between DrawingThumbnail and DrawingVersionHistory. If a third consumer appears, extract to `src/components/drawings/_StatusBadge.tsx`.

## Self-Check: PASSED

All claimed files exist:
- src/components/drawings/DrawingThumbnail.tsx — FOUND
- src/components/drawings/DrawingVersionHistory.tsx — FOUND
- src/components/drawings/PdfPageNavigator.tsx — FOUND
- src/components/drawings/DrawingUploadSheet.tsx — FOUND
- src/components/drawings/DrawingViewer.tsx — FOUND

All claimed commits exist on the branch:
- 6dd572e — feat(01-06): add DrawingThumbnail, DrawingVersionHistory, PdfPageNavigator
- e37163c — feat(01-06): add DrawingUploadSheet with 25MB hard block + 3 input modes
- f472714 — feat(01-06): add DrawingViewer full-screen modal with pinch-zoom + PDF
