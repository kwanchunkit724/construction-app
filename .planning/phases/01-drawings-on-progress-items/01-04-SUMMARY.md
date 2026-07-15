---
phase: 01-drawings-on-progress-items
plan: 04
subsystem: drawings
tags: [install, types, pdf-worker, viewer-libs, infrastructure]
requires:
  - 01-02 (Vite manualChunks pre-declares viewer-pdf + viewer-zoom)
provides:
  - "react-pdf@^10.4.1 + react-zoom-pan-pinch@^4.0.3 installed"
  - "src/lib/pdfWorker.ts (PDF.js worker self-host via new URL)"
  - "Drawing, DrawingVersion, DrawingStatus types in src/types.ts"
  - "DRAWING_STATUS_ZH map (現行 / 已取代 / 已撤回)"
affects:
  - "Plan 01-05 (drawings lib will import Drawing/DrawingVersion types)"
  - "Plan 01-06 (DrawingViewer will import pdfWorker side-effect + react-pdf + react-zoom-pan-pinch)"
  - "Plan 01-07 (upload paths will reference DrawingStatus + DRAWING_STATUS_ZH)"
tech-stack:
  added:
    - "react-pdf@^10.4.1 (pulls pdfjs-dist@5.4.296 transitively)"
    - "react-zoom-pan-pinch@^4.0.3"
  patterns:
    - "PDF.js worker self-hosted via Vite's new URL(..., import.meta.url) pattern"
    - "pdfjs-dist NOT a direct dep (peer-managed by react-pdf)"
key-files:
  created:
    - src/lib/pdfWorker.ts
  modified:
    - package.json
    - package-lock.json
    - src/types.ts
decisions:
  - "Did not install pdfjs-dist as a direct dep — react-pdf manages the peer (RESEARCH lines 117-119: mismatched versions break the worker silently)"
  - "Used caret ranges (^4.0.3, ^10.4.1) per plan action step rather than --save-exact; STACK.md compatibility table allows this within the resolved minor"
  - "pdfWorker.ts is a side-effect module — sets GlobalWorkerOptions.workerSrc on import"
metrics:
  duration: ~5 min
  completed: 2026-05-12
---

# Phase 01 Plan 04: Install Viewer Libs + Types Summary

Installed react-pdf and react-zoom-pan-pinch, self-hosted the PDF.js worker via Vite's `new URL()` pattern (Capacitor `file://` CSP-safe), and added `Drawing` / `DrawingVersion` / `DrawingStatus` type contracts plus the `DRAWING_STATUS_ZH` Chinese label map to `src/types.ts` so downstream waves (05/06/07) have stable type contracts to import.

## What Shipped

### Installed packages (caret ranges per plan action)

| Package | Version range | Resolved | Notes |
| --- | --- | --- | --- |
| `react-zoom-pan-pinch` | `^4.0.3` | 4.0.3 | Pinch/zoom wrapper for image + PDF viewer |
| `react-pdf` | `^10.4.1` | 10.4.x | PDF rendering (uses pdfjs-dist 5.4.296 as peer) |
| `pdfjs-dist` | (transitive) | 5.4.296 | NOT a top-level dep — managed by react-pdf |

Verification:
- `node -p "require('./package.json').dependencies['pdfjs-dist']"` → `undefined` ✓
- `ls node_modules/pdfjs-dist/build/pdf.worker.min.mjs` → exists ✓
- `npm run build:check` → exits 0 ✓
- Entry chunk size: **492.2 KB** (limit 800 KB) ✓

### `src/lib/pdfWorker.ts` (new)

Side-effect module that sets `pdfjs.GlobalWorkerOptions.workerSrc` using Vite's `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. This emits the worker as a same-origin asset under `dist/assets/`, which is what Capacitor's `capacitor://localhost` (iOS) / `https://localhost` (Android) origins need. CDN workers are blocked by Capacitor CSP — see RESEARCH lines 117-119.

Currently dormant — first consumer is `DrawingViewer` in Plan 06. Because nothing imports it yet, the `viewer-pdf` chunk does not appear in this plan's build output (intended).

### `src/types.ts` (appended)

```ts
export type DrawingStatus = 'current' | 'superseded' | 'withdrawn'

export interface Drawing { ... }            // 8 fields, mirrors v8 schema
export interface DrawingVersion { ... }     // 12 fields, mirrors v8 schema

export const DRAWING_STATUS_ZH: Record<DrawingStatus, string> = {
  current: '現行',
  superseded: '已取代',
  withdrawn: '已撤回',
}
```

Field names are snake_case per CONVENTIONS (TS interfaces mirror SQL columns verbatim). No helper functions added — those belong in `src/lib/drawings.ts` (Plan 05).

## Commits

| # | Hash | Message |
| --- | --- | --- |
| 1 | d48e6a6 | `feat(01-04): install react-pdf + react-zoom-pan-pinch and add PDF.js worker module` |
| 2 | 51da35a | `feat(01-04): add Drawing types and DRAWING_STATUS_ZH map` |

## Verification

| Check | Result |
| --- | --- |
| `react-zoom-pan-pinch` + `react-pdf` in package.json | PASS |
| `pdfjs-dist` NOT in package.json `dependencies` | PASS (undefined) |
| `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` exists | PASS |
| `src/lib/pdfWorker.ts` uses `new URL(...)` pattern + `GlobalWorkerOptions.workerSrc` | PASS |
| `src/types.ts` exports `DrawingStatus`, `Drawing`, `DrawingVersion`, `DRAWING_STATUS_ZH` | PASS |
| `DRAWING_STATUS_ZH` contains `'現行'`, `'已取代'`, `'已撤回'` | PASS |
| `npx tsc --noEmit` exits 0 | PASS |
| `npm run build:check` exits 0 | PASS (entry 492.2 KB < 800 KB) |

## Deviations from Plan

None — plan executed as written. The user's prompt mentioned `--save-exact` but the plan's own action step (lines 117-119 of 01-04-PLAN.md) specified caret ranges; followed the plan source-of-truth.

## Known Stubs

None. `pdfWorker.ts` is intentionally dormant pending its consumer in Plan 06; this is documented in the file's header comment and in the plan itself.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced; only adds dependencies + types + a worker-init module.

## Self-Check: PASSED

- `src/lib/pdfWorker.ts` — FOUND
- `src/types.ts` (DRAWING_STATUS_ZH) — FOUND
- Commit `d48e6a6` — FOUND
- Commit `51da35a` — FOUND
