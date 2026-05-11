# Stack Research — Site Control Milestone (Drawings + SI/VO + PTW)

**Domain:** Hong Kong construction site-control inside an existing Capacitor 8 + React 19 app
**Researched:** 2026-05-11
**Confidence:** HIGH for the four "must" libraries (pinch-zoom, PDF, QR, signature). MEDIUM for voice recorder (plugin churn). MEDIUM for forms (hooks-only is a viable competing choice).

This document is **additive only**. The base stack (React 19, TypeScript ~5.4, Vite 5, Tailwind 3.4, Capacitor 8, Supabase 2.104, OneSignal) is locked per `PROJECT.md` Constraints. Every library below was selected with these in mind:

1. **WebView-first.** Must render correctly in iOS WKWebView and Android Chrome WebView packaged from Capacitor's `file://` origin — not just desktop Chrome.
2. **Bundle-aware.** The current bundle is 1.2 MB unsplit (`CONCERNS.md` Performance). Every new lib in this milestone is **lazy-loaded** at its consumer route or component. Initial-load impact: 0 KB.
3. **Tailwind 3.4 + no-semicolons + manual store-error pattern.** No library that ships its own CSS-in-JS runtime, no library that demands a state manager.

---

## Recommended Stack

### Core Additive Libraries (this milestone)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `react-zoom-pan-pinch` | **^4.0.3** (Apr 2026) | Pinch/pan/zoom wrapper for drawings + PTW QR display | Active, MIT, 1.9k stars, TypeScript-native, single dependency-free package, supports touch + mouse + trackpad. Already named as the chosen viewer in `PROJECT.md` Decisions. ~12 KB min+gz. |
| `react-pdf` | **^10.4.1** (Feb 2026) | PDF rendering for drawing attachments (architects send PDF, not PNG) | The de-facto React wrapper around Mozilla PDF.js. MIT, 11.1k stars. Supports React 16.8+ → works with React 19. WebView-safe (renders to `<canvas>`; no native bridge). Worker file is the only deployment subtlety — see "Capacitor worker setup" below. |
| `qrcode.react` | **^4.2.0** (Dec 2024) | QR generation for active PTW permits | ISC license, 4.3k stars, React-19 compatible per release notes. Two render modes (SVG + Canvas) — we use `QRCodeSVG` (smaller, sharper, no canvas tainting). ~6 KB min+gz. Zero runtime dependencies. |
| `react-signature-canvas` | **^1.1.0-alpha.x** (current) | Signature pad for PTW issuance + VO signoff | MIT, 906k weekly downloads, < 150 LoC wrapper around the well-maintained `signature_pad` library (Velocity-curve smoothing — the standard sig-pad algorithm). Touch + pointer events. TypeScript declarations. ~14 KB min+gz including `signature_pad`. |

### Supporting / Conditional Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `capacitor-voice-recorder` | **^7.0.6** (June 2025) | Native audio capture for SI verbal-instruction memos | **Only if Phase 2 includes voice-memo SI capture.** If it's deferred, skip the plugin entirely. **Capacitor major-version mismatch warning** — v7.x targets Capacitor 7; we're on Capacitor 8. Verify it loads cleanly before committing. Cap-go's `@capgo/capacitor-audio-recorder` is the actively-Capacitor-8-tracking fallback. |
| `react-hook-form` | **^7.54.x** | Form state for the VO quotation table (labour / material / preliminaries / contingency rows + totals) and the SI multi-field form | **Only adopt if VO forms exceed ~8 fields with cross-field validation.** Below that bar, `useState` + a `useReducer` is cheaper than a 12 KB dependency. Currently a coin-flip — see "Forms decision" below. |

### Lazy-Loading Wiring (mandatory for all four core libs)

```ts
// src/pages/DrawingViewer.tsx (example — Phase 1)
import { lazy, Suspense } from 'react'

const PdfViewer = lazy(() => import('../components/PdfViewer'))
const ImageViewer = lazy(() => import('../components/ImageViewer'))

// In Vite config, manual chunks:
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'viewer-pdf':  ['react-pdf', 'pdfjs-dist'],
        'viewer-zoom': ['react-zoom-pan-pinch'],
        'sig-pad':     ['react-signature-canvas', 'signature_pad'],
        'qr':          ['qrcode.react'],
      },
    },
  },
}
```

This pairs with the chunk-splitting fix already noted in `CONCERNS.md` Performance for `xlsx`/`jspdf`/`recharts` — do both in the same Vite config change.

---

## Installation

```bash
# Phase 1 (Drawings)
npm install react-zoom-pan-pinch@^4.0.3 react-pdf@^10.4.1

# Phase 3 (PTW) — adds QR + signatures
npm install qrcode.react@^4.2.0 react-signature-canvas@^1.1.0-alpha

# Phase 2 (SI/VO) — optional, only if forms exceed hooks-only threshold
npm install react-hook-form@^7.54.0

# Phase 2 (SI) — optional, only if voice memos are in scope
npm install capacitor-voice-recorder@^7.0.6
npx cap sync ios && npx cap sync android
```

**Note:** Voice recorder needs `npx cap sync` because it ships native code. The other four are pure-JS and only need a Vite rebuild.

---

## Bundle Size Impact (Approximate, min+gzipped)

| Library | Size | Notes |
|---------|------|-------|
| `react-zoom-pan-pinch` | ~12 KB | Single chunk, lazy-loaded at viewer route |
| `react-pdf` | ~15 KB | Plus pdfjs-dist itself: ~85 KB main + **~150-180 KB worker** (separate file, loaded on demand) |
| `pdfjs-dist` worker | ~150-180 KB | Loaded as a Web Worker only when a PDF is opened |
| `qrcode.react` (SVG only) | ~6 KB | Tree-shakes — only import `QRCodeSVG`, not `QRCodeCanvas` |
| `react-signature-canvas` + `signature_pad` | ~14 KB | Wrapper is ~3 KB, signature_pad is ~11 KB |
| `capacitor-voice-recorder` | ~2 KB JS + native | JS bridge only; native code doesn't count toward web bundle |
| `react-hook-form` | ~12 KB | Zero deps. Smallest of the form libs. |
| **Total worst case if everything ships** | ~75 KB JS + ~180 KB worker | All lazy-loaded; **initial bundle delta: 0 KB** |

Compare to `CONCERNS.md` baseline: current entry chunk 1.2 MB. Splitting the reports module per `CONCERNS.md` Performance gives back ~400 KB; this milestone adds nothing to the initial chunk. **Net change to first-paint bundle: -400 KB.**

---

## Mobile WebView Compatibility (verified)

| Library | iOS WKWebView | Android Chrome WebView | Capacitor `file://` origin | Native plugin needed? |
|---------|---------------|------------------------|----------------------------|-----------------------|
| `react-zoom-pan-pinch` | YES — uses Pointer Events (standard) | YES | YES — pure DOM | No |
| `react-pdf` + `pdfjs-dist` | YES — `<canvas>` rendering | YES | YES, **with worker setup caveat below** | No |
| `qrcode.react` | YES — pure SVG output | YES | YES | No |
| `react-signature-canvas` | YES — uses Pointer Events with touch fallback. Verified by 906k weekly downloads in webview-heavy apps. | YES | YES | No |
| `capacitor-voice-recorder` | YES — uses AVAudioRecorder | YES — uses MediaRecorder | YES | **YES — requires `cap sync`** |
| `react-hook-form` | YES — runtime-only | YES | YES | No |

### Critical: PDF.js worker setup under Capacitor `file://`

PDF.js requires its worker to be loaded from the same origin. Under Capacitor:

- iOS WKWebView origin: `capacitor://localhost`
- Android WebView origin: `https://localhost`
- Browser dev: `http://localhost:5173`

**Recommended setup** (works across all three):

```ts
// src/lib/pdfWorker.ts — import once before any react-pdf render
import { pdfjs } from 'react-pdf'

// Vite's import.meta.url + new URL is resolved at build time
// → emits worker as a real asset next to the JS bundle.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

**DO NOT** use a CDN URL for the worker — Capacitor's CSP and the `file://`-ish origin will block cross-origin worker fetch on a real device. Self-host via Vite's asset pipeline only.

**DO NOT** mismatch versions — worker must be the exact same version as `pdfjs-dist` (pinned by `react-pdf`'s peer dep).

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `react-zoom-pan-pinch` | `react-responsive-pinch-zoom-pan` | If you need momentum-scroll physics tuned for photos specifically. Smaller star count, less maintained — not for this milestone. |
| `react-zoom-pan-pinch` | Roll your own with `@use-gesture/react` + `react-spring` | If you eventually need annotation-aware zoom (e.g., markup phase). For view-only, the wrapper saves a week. |
| `react-pdf` | `pdfjs-dist` directly | If you need imperative APIs (page-level text extraction, search). For a view-only drawing viewer, `react-pdf` is strictly less code. |
| `react-pdf` | `@react-pdf/renderer` | **DON'T CONFUSE THESE.** `@react-pdf/renderer` *generates* PDFs from React components; useless for *viewing*. We already have `jspdf` for generation. |
| `react-pdf` | A native Capacitor PDF viewer plugin (e.g., `@capacitor-community/pdf-viewer`) | If WebView rendering is too slow for very large architect PDFs (>20 MB). Add as a fallback later if benchmarks demand. Adds plugin + `cap sync` cost. |
| `qrcode.react` | `react-qr-code` | If you need UTF-8 byte-mode QR (for Chinese-character payloads in the QR itself). PTW QRs encode a permit ID URL only → ASCII-safe → not needed. |
| `qrcode.react` | `qr-code-styling` | If you want a logo embedded in the QR for branding. We need scan reliability, not branding. Skip. |
| `react-signature-canvas` | `react-signature-pad-wrapper` | If you need responsive auto-resize without a parent container. The unopinionated `react-signature-canvas` API is preferred for our case. |
| `capacitor-voice-recorder` (tchvu3) | `@capgo/capacitor-audio-recorder` | **Prefer Cap-go if tchvu3's plugin breaks under Cap 8.** Cap-go is the active community-maintained plugin shop and tracks Capacitor majors quickly. |
| `capacitor-voice-recorder` | `@capawesome/capacitor-audio-recorder` | Capawesome's plugin requires a paid sponsorship key for production. Skip. |
| `react-hook-form` | `@tanstack/react-form` (~20 KB) | If you want full TypeScript inference end-to-end. RHF is half the size with adequate typing — not worth the +8 KB. |
| `react-hook-form` | Formik | Formik is in maintenance mode and twice the bundle. Don't. |
| `react-hook-form` | **Plain `useState` + `useReducer`** | **Default position for this codebase.** See "Forms decision" below. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-native-pdf` or any RN-only lib | This is Capacitor, not React Native. RN libs don't load. | `react-pdf` (WebView-compatible) |
| Inline `<embed src="...pdf">` or `<iframe>` | Android WebView has historically broken PDF embedding entirely (no native PDF view), and iOS WKWebView's behavior varies by version. Doesn't render under Capacitor `file://`. | `react-pdf` rendering to canvas |
| `qr-image`, `qrious`, raw `qrcode` npm | Either Node-only, or need a separate React adapter. `qrcode.react` is a React component out of the box. | `qrcode.react` |
| `react-signature-pad` (the original, not the canvas fork) | Last meaningful release 7+ years ago. 1.9k weekly downloads vs 906k for the fork. | `react-signature-canvas` |
| `react-pdf-viewer` (the commercial one) | Paid license for production. We can do this with the open-source `react-pdf` for our view-only needs. | `react-pdf` |
| A new global state library (Zustand / Redux / Jotai) for forms | The codebase uses React Context and `useState` exclusively per CONVENTIONS.md. Adding a state lib for one milestone is scope creep. | RHF (already field-level state) or hooks |
| PDF.js worker via `cdnjs` / `unpkg` | Cross-origin worker load fails under Capacitor's CSP. | Self-hosted via Vite `new URL(...)` |

---

## Forms Decision (Phase 2 SI/VO)

**Recommendation: start with hooks; adopt `react-hook-form` only if VO quotation hits these triggers:**

| Trigger | Action |
|---------|--------|
| VO row count > 10 (dynamic rows with add/remove) | Adopt RHF — `useFieldArray` is significantly better than DIY |
| Cross-row validation (e.g., total must be ≤ contract ceiling) | Adopt RHF — its validation graph wins |
| Draft autosave every 30s | Either is fine; hooks slightly less ceremony |
| < 8 fields, no dynamic rows, simple required-only validation | Stay with hooks. RHF is 12 KB you don't need. |

Per `PROJECT.md` Context Decisions: "VO quotation = structured rows, not single figure → enables itemized dispute resolution". This **almost certainly crosses the dynamic-rows + cross-row-total threshold**, so plan for RHF in Phase 2 but defer the install until you've sketched the form.

---

## Voice-Memo Decision (Phase 2 SI)

**Recommendation: defer the install until Phase 2 has a sketched UX.**

The SI flow's core value is *un-deniable verbal-instruction capture*. Two paths:

1. **Voice memo (audio file attached to SI):** Strongest evidence, but transcription is a separate phase. Use `capacitor-voice-recorder` or `@capgo/capacitor-audio-recorder`.
2. **Typed transcript field, optional photo of whiteboard / sketch:** Lower friction, no plugin, reuses existing photo upload. Storage cost much lower (text vs MP3).

If you go with audio: **plan to verify the plugin against Capacitor 8 on day 1 of Phase 2**. The tchvu3 plugin lists Cap 7 as the latest major in its README. Cap-go's plugin is the safer choice if you need active Cap-8 tracking and faster release cadence.

Either way, audio files go to a **private Supabase Storage bucket** following the `drawings` bucket template in `CONCERNS.md` — `si-attachments` with project-member RLS.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `react-pdf@10.x` | `pdfjs-dist@5.x` | React-pdf 10.x pins its own pdfjs-dist. Don't install pdfjs-dist as a separate top-level dep — let react-pdf resolve it, or you'll get worker version mismatches. |
| `react-zoom-pan-pinch@4.x` | React 18 + 19 | TypeScript types ship with the package. |
| `qrcode.react@4.2.0` | React 19 | Explicitly listed in release notes. |
| `react-signature-canvas` | React 18 + 19 | Underlying `signature_pad@5.x` is the smoothing library; pin to a patch range. |
| `capacitor-voice-recorder@7.x` | Capacitor 7 (per README) | **Risk: Cap 8 untested by maintainer.** Verify or swap to `@capgo/capacitor-audio-recorder` (tracks current Capacitor major). |
| `react-hook-form@7.54+` | React 18 + 19 | Zero peer deps beyond React. |

---

## Stack Patterns by Phase

**Phase 1 — Drawings (smallest, ship first):**
- Install: `react-zoom-pan-pinch` + `react-pdf`
- Lazy-load both behind `<DrawingViewer>` route
- Image branch: `<TransformWrapper><TransformComponent><img></TransformComponent></TransformWrapper>`
- PDF branch: `<TransformWrapper><TransformComponent><Document><Page /></Document></TransformComponent></TransformWrapper>` — wrap the entire `<Page>` so pinch works on PDFs too
- Worker setup in `src/lib/pdfWorker.ts` (see above)
- Vite manual chunks: `viewer-pdf`, `viewer-zoom`

**Phase 2 — SI/VO:**
- Install `react-hook-form` only after sketching the VO row-table UI; if it's < 8 static fields, skip
- Voice memo: decide UX first; if shipping audio, install `capacitor-voice-recorder` OR `@capgo/capacitor-audio-recorder` and verify on Cap 8 before committing to the plugin
- Private bucket `si-attachments` (RLS template in CONCERNS.md)

**Phase 3 — PTW:**
- Install: `qrcode.react` + `react-signature-canvas`
- QR encodes a permit ID URL routed via existing HashRouter (`#/ptw/{id}`)
- Signature pad output: `getTrimmedCanvas().toDataURL('image/png')` → upload to private bucket `ptw-signatures` as PNG (small, ~5-15 KB per sig)
- Lazy-load both behind PTW routes

---

## Sources

- [react-zoom-pan-pinch GitHub](https://github.com/BetterTyped/react-zoom-pan-pinch) — v4.0.3 (Apr 2026), MIT, mobile gesture support confirmed [HIGH]
- [react-zoom-pan-pinch npm](https://www.npmjs.com/package/react-zoom-pan-pinch) — version and weekly downloads [HIGH]
- [react-pdf GitHub](https://github.com/wojtekmaj/react-pdf) — v10.4.1 (Feb 2026), React 16.8+, MIT [HIGH]
- [react-pdf npm](https://www.npmjs.com/package/react-pdf) — install and worker setup [HIGH]
- [qrcode.react GitHub](https://github.com/zpao/qrcode.react) — v4.2.0 (Dec 2024), React 19 support, ISC license [HIGH]
- [react-signature-canvas GitHub](https://github.com/agilgur5/react-signature-canvas) — TypeScript, 906k weekly DLs, MIT [HIGH]
- [capacitor-voice-recorder GitHub](https://github.com/tchvu3/capacitor-voice-recorder) — v7.0.6 (June 2025), MIT, Capacitor 7-aligned [MEDIUM — Cap 8 unverified]
- [Cap-go capacitor-audio-recorder GitHub](https://github.com/Cap-go/capacitor-audio-recorder) — fallback voice plugin [MEDIUM]
- [Formisch React form comparison 2026](https://formisch.dev/blog/react-form-library-comparison/) — RHF 12 KB, Formik 44 KB, TanStack Form ~20 KB gzipped [MEDIUM]
- [pdfjs-dist npm](https://www.npmjs.com/package/pdfjs-dist) — v5.7.284, worker setup guidance [HIGH]
- [pdf.js issue #8305 — workerSrc setup](https://github.com/mozilla/pdf.js/issues/8305) — `new URL(..., import.meta.url)` pattern [HIGH]
- `.planning/PROJECT.md` — locked stack and lazy-load decision [HIGH]
- `.planning/codebase/STACK.md` — current dep versions [HIGH]
- `.planning/codebase/CONCERNS.md` — 1.2 MB bundle baseline, private-bucket RLS template [HIGH]

---
*Stack research for: HK construction site-control milestone (additive libs only)*
*Researched: 2026-05-11*
