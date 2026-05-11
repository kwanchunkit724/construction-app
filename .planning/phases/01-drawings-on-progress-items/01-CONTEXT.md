# Phase 1: 圖則附加 (Drawings on Progress Items) - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** `--auto` (all gray areas resolved with recommended defaults)

<domain>
## Phase Boundary

PMs and main contractors can attach versioned drawings (JPEG / PNG / PDF) to any leaf `progress_leaf_item`. Every project member sees the exact current revision through a mobile pinch-zoom viewer. Storage is private (signed URLs only), bucket RLS is project-scoped via `(storage.foldername(name))[1] = project_id`, and viewer libraries are lazy-loaded so the entry chunk stays under 800 KB.

This phase ALSO establishes the **infrastructure patterns the rest of the milestone inherits:**
- Migration namespace `v8-*`
- Private bucket template (`supabase/v8-private-bucket-template.sql`)
- RLS helper pattern (`security definer set search_path = public`)
- `supabase/tests/rls-smoke.sql` 3-perspective harness
- `demo_feedback` RLS fix (ride-along)
- Vite `manualChunks` split + bundle-size CI guard
- Playwright smoke test skeleton

Out of scope for this phase: SI/VO/PTW references to drawings (Phase 2 + 3 will add `drawing_version_id` FKs), drawing markup, cross-project sharing.

</domain>

<decisions>
## Implementation Decisions

### Upload UX
- **[auto] D-01:** Single "+ 新增圖則" button on the leaf-item detail screen. Tap → bottom sheet with three options: 📷 拍攝 / 🖼️ 從相簿選擇 / 📁 從檔案選擇. Uses `@capacitor/camera` for camera+gallery, `@capacitor/filesystem`/HTML `<input type="file">` for files.
- **[auto] D-02:** Multi-file upload supported (up to 5 files per batch). Each file's status (uploading / done / error) shown as a row in the sheet during upload.
- **[auto] D-03:** Upload progress: per-file progress bar with KB/MB counter and Chinese label "正在上載 X / Y...".
- **[auto] D-04:** Soft warning toast at >5 MB ("檔案較大，可能會慢"). Hard block at >25 MB ("檔案太大 (>25MB)，請壓縮後再上載").

### Drawing data model + versioning
- **[auto] D-05:** New tables: `drawings` (parent: title, project_id, leaf_item_id, current_version_id), `drawing_versions` (one row per uploaded file: version_no, file_path, mime_type, size_bytes, uploaded_by, uploaded_at, revision_label, is_current, superseded_at).
- **[auto] D-06:** "Upload new version" affordance: long-press an existing drawing card → action sheet → "上載新版本". Distinct from "+ 新增圖則" which creates a new `drawings` row.
- **[auto] D-07:** Revision label = free text up to 16 chars. Placeholder: "例如: Rev A 或 V1.2". Optional — defaults to `v{version_no}` if empty.
- **[auto] D-08:** Hard delete is forbidden in UI. Only "撤回" (withdraw), which sets `status='withdrawn'` and `withdrawn_at = now()`. Withdrawn drawings still visible in version history but with grey strikethrough. Hard-delete only via admin SQL (not exposed in UI).

### Viewer
- **[auto] D-09:** Full-screen modal (not a separate route). Tapping a drawing thumbnail opens the modal; X button or swipe-down closes. Reuses existing photo-viewer modal pattern from `src/components/IssuePhotoViewer.tsx` (if exists) or creates a new shared `DrawingViewer.tsx`.
- **[auto] D-10:** Pinch-zoom via `react-zoom-pan-pinch@^4.0.3`. PDF rendering via `react-pdf@^10.4.1`. **Both lazy-loaded** via `React.lazy()` — only fetched when modal opens.
- **[auto] D-11:** PDF.js worker self-hosted via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` to satisfy Capacitor `file://` CSP. Worker version pinned to `react-pdf`'s `pdfjs-dist` peer.
- **[auto] D-12:** PDF: render page-by-page with prev/next swipe + page-number indicator (e.g. "1 / 5").
- **[auto] D-13:** Version history accessible from the viewer's top-right "📋 版本記錄" button. Lists all versions with badge `v4 (現行)` green / `v3 (已取代 2026-05-08)` grey / `v2 (已撤回)` red strikethrough. Tap any version to swap viewer to that file.

### Thumbnails
- **[auto] D-14:** Client-side thumbnail (256×256 JPEG, quality 0.8) generated via Canvas on upload. For PDFs, render page 1 to canvas via `react-pdf`, downsample, encode as JPEG.
- **[auto] D-15:** Thumbnail stored in same bucket alongside the file: `drawings/{project_id}/{drawing_id}/v{version}/thumb.jpg`. Same RLS scope.
- **[auto] D-16:** If thumbnail generation fails (PDF.js error, blob too large), fall back to a category icon placeholder (PDF icon / image icon). Log warning to console; don't block upload.

### Storage path + RLS
- **[auto] D-17:** Bucket name: `project-drawings`. Private (no public URL). Created in `v8-drawings.sql`.
- **[auto] D-18:** Path scheme: `{project_id}/{drawing_id}/v{version_no}/{filename}` plus sibling `thumb.jpg`. First segment = project_id for RLS.
- **[auto] D-19:** RLS policies use `can_view_project(uid, project_id)` and `can_edit_project_progress(uid, project_id)` helpers (existing). New helper `can_upload_drawing(uid, project_id)` = same as `can_edit_project_progress`. All marked `security definer set search_path = public`.
- **[auto] D-20:** Signed-URL TTL: 1 hour for full drawings, 1 hour for thumbnails (same — thumbnails referenced from UI lists, refresh on remount).

### Listing, search, sorting
- **[auto] D-21:** Drawings section appears ABOVE the existing issues section on the leaf-item detail screen. Section title "圖則 (N)" with count badge. Empty state: small placeholder "尚未有圖則" + the "+ 新增圖則" button.
- **[auto] D-22:** Default list = thumbnail grid (2 columns mobile, 4 columns BlueStacks tablet). Each tile: thumbnail (square aspect, object-cover), title (truncated 2 lines), revision label, "現行 / 已取代 / 已撤回" badge.
- **[auto] D-23:** Default sort: `created_at DESC` (newest first). No user-facing sort toggle in v1.
- **[auto] D-24:** Search: a single text input at top of the section filtering by title substring (case-insensitive). Debounced 200ms. No advanced filters in v1.

### Role gating
- **[auto] D-25:** Upload button visible only to `global_role in ('admin', 'pm', 'main_contractor')` AND project member. Subcon / subcontractor_worker / owner see drawings but no upload affordance, no long-press menu.
- **[auto] D-26:** Withdraw button visible only to: original uploader OR admin. NOT visible to other PMs (avoid friendly-fire withdrawals).
- **[auto] D-27:** Server-side enforcement via RLS — UI gating is convenience only.

### Notifications
- **[auto] D-28:** Push on new drawing upload: **OFF in v1**. (Deferred per SUMMARY.md to keep push budget for SI/VO/PTW.) Reconsider in v1.x based on user feedback.

### Build & CI
- **[auto] D-29:** Vite `manualChunks` config split: `viewer-pdf` (react-pdf + pdfjs-dist worker), `viewer-zoom` (react-zoom-pan-pinch). Also: ride-along split of existing `xlsx`, `jspdf`, `recharts` chunks (per CONCERNS.md).
- **[auto] D-30:** Bundle-size CI check via `npm run build:check` script invoked in Codemagic: fail PR if dist entry chunk >800 KB or any new chunk >400 KB.
- **[auto] D-31:** Playwright smoke test: `tests/e2e/drawings.spec.ts` — login as PM → open project → tap leaf item → upload sample PDF → assert thumbnail appears → tap to open viewer → assert pinch-zoom container rendered. ONE test only.

### Cross-cutting ride-alongs (one-line each)
- **[auto] D-32:** `demo_feedback` RLS fix (CONCERNS.md m8) — single migration statement included in `v8-drawings.sql`.
- **[auto] D-33:** Migration namespace `v8-*` to skip contested v5/v6/v7 (decision logged in PROJECT.md).
- **[auto] D-34:** Chinese strings remain inline in JSX (per CONVENTIONS.md). New status enum `drawing_status ('current','superseded','withdrawn')` gets a `DRAWING_STATUS_ZH` map in `src/types.ts`.

### Claude's Discretion
- Exact thumbnail-generation algorithm (which Canvas API calls, JPEG encoding params beyond quality 0.8)
- Specific shadcn/Tailwind component selection for the bottom sheet (existing patterns prevail)
- Error toast wording precision (just "上載失敗" or full error text)
- Whether to compress non-PDF images before upload (decide based on file-size heuristic during implementation)
- Folder structure under `src/components/drawings/` (DrawingThumbnail, DrawingViewer, DrawingUploadSheet — exact file split)
- Whether `DrawingViewer` is one component with mode prop or two components (PDF vs image)
- Internal API surface of the new `drawings` module in `src/lib/`

</decisions>

<specifics>
## Specific Ideas

- **The moat is `drawing → progress_leaf_item` linkage.** Make the drawing section visually prominent on the leaf-item screen — this is the differentiator vs Procore/Aconex.
- **Sun-glare friendly UI:** Big version badges (≥16pt), high-contrast Tailwind classes (`text-green-700` on `bg-green-100` for 現行, `text-gray-500` on `bg-gray-100` strikethrough for 已取代). Don't use thin grey text on white.
- **Construction-worker ergonomics:** Tap targets ≥44pt. Avoid relying on long-press alone — always provide a tap-equivalent alternative (here, ⋯ overflow menu).
- **Reference for thumbnail UX:** Existing issue-photo thumbnail grid (`src/pages/IssueDetail.tsx` or similar) should be the visual model. Same density, same border-radius, same shadow.
- **Don't break iOS App Store compliance:** This phase doesn't touch auth or permits, so re-review risk is low. But every new bucket migration must preserve `delete_my_account()` semantics — drawing files are project-owned (path keyed by `project_id`), so account deletion does NOT cascade-delete them. This is intentional (project evidence outlives individual users).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before touching code.**

### Project + research context
- `.planning/PROJECT.md` — Core value, Validated capabilities, Out of Scope for this milestone, Key Decisions
- `.planning/REQUIREMENTS.md` §"Drawings (DRW)" — REQ-IDs DRW-01..15 + INF-01..09 (cross-cutting)
- `.planning/ROADMAP.md` — Phase 1 goal + success criteria
- `.planning/research/SUMMARY.md` — Executive synthesis (build-order, top pitfalls per phase, stack additions)
- `.planning/research/STACK.md` — Library choices (react-zoom-pan-pinch, react-pdf, worker setup)
- `.planning/research/ARCHITECTURE.md` — Drawing storage path scheme, RLS approach, version pinning semantics
- `.planning/research/FEATURES.md` — HK construction drawing-on-progress-item differentiator framing
- `.planning/research/PITFALLS.md` — C1 (storage RLS bypass), C6 (RLS recursion), M2 (version ambiguity), M3 (template cross-project leak), M6 (bundle bloat), m2, m5, m7, m8

### Codebase context (must read to match existing patterns)
- `.planning/codebase/STACK.md` — React 19 / Vite 5 / Tailwind 3.4 / Capacitor 8 / Supabase
- `.planning/codebase/ARCHITECTURE.md` — HashRouter, AuthContext, role gating pattern
- `.planning/codebase/STRUCTURE.md` — Where new files go (`src/pages`, `src/components`, `src/lib`)
- `.planning/codebase/CONVENTIONS.md` — No linter / no semicolons / single quotes / `{ data, error }` pattern / inline Chinese / migration naming
- `.planning/codebase/CONCERNS.md` — Private-bucket template (RLS), bundle-split notes, `demo_feedback` RLS fix, fragile areas

### Existing code touchpoints (planner will need to read these)
- `supabase/v2-schema.sql` — `progress_leaf_items` table shape, existing RLS helpers `can_view_project`, `can_edit_project_progress`
- `supabase/v6-account-deletion.sql` — `delete_my_account()` pattern (drawings must NOT cascade-delete user)
- `src/types.ts` — Existing enum→Chinese maps as template for `DRAWING_STATUS_ZH`
- `src/lib/supabase.ts` — Client config, 15s fetch timeout pattern
- `src/pages/IssueDetail.tsx` (or whichever issue file shows photos) — Existing thumbnail-grid pattern to mirror
- `vite.config.ts` — Where to add `manualChunks` split
- `codemagic.yaml` — Where to add `npm run build:check` bundle-size guard step

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`can_view_project(uid, project_id)` + `can_edit_project_progress(uid, project_id)`** SECURITY DEFINER helpers — reuse verbatim for drawings RLS, do NOT inline new logic
- **`src/lib/supabase.ts`** client + 15s timeout pattern — drawings uploads use the same client
- **Existing storage usage in `issue-photos`** — read the upload pattern in `src/lib/issues.ts` or wherever issue photos upload; mirror error handling (`{ error: string | null }`) but switch to PRIVATE bucket + signed URLs
- **AuthContext `useAuth().profile?.global_role`** — single source for role gating
- **Existing `*_ZH` enum→Chinese maps in `src/types.ts`** — template for `DRAWING_STATUS_ZH`

### Established Patterns
- Migration files: `supabase/v{N}-{slug}.sql`, atomic, forward-only — new file `supabase/v8-drawings.sql`
- Component structure: `src/components/<Feature>/<Name>.tsx` (e.g. `src/components/drawings/DrawingThumbnail.tsx`)
- Page structure: route handler in `src/pages/`, business logic in `src/lib/`
- Chinese strings inline in JSX, no i18n — UI strings in JSX, enum labels via `*_ZH` constant in `src/types.ts`
- Supabase calls: `const { data, error } = await supabase.from(...).select(...)` — errors returned, not thrown
- Context methods: `Promise<{ error: string | null }>` return shape

### Integration Points
- **`progress_leaf_items` table** — `drawings.leaf_item_id` FK references it. `ON DELETE CASCADE` to clean up drawing rows if a leaf item is deleted (but storage blobs survive — separate cleanup cron in v1.x if needed).
- **Leaf item detail page** — New "圖則" section added above existing issues section. Component: `<LeafItemDrawings leafItemId={...} />`.
- **Vite config** (`vite.config.ts`) — Add `build.rollupOptions.output.manualChunks` block.
- **Codemagic** (`codemagic.yaml`) — Add `npm run build:check` step in all 3 workflows.
- **Capacitor plugins** — `@capacitor/camera`, `@capacitor/filesystem` may already be installed (check `package.json`). If not, install + `cap sync ios android`.

</code_context>

<deferred>
## Deferred Ideas

- **Drawing markup / annotation** — separate phase if/when demanded
- **Cross-project template drawings** — separate `template_drawings` table + bucket in v1.x; in this phase each project has own copies
- **Server-side thumbnail Edge Function** — defer unless client-side proves slow on large architect PDFs during UAT
- **Push notification on new drawing upload** — defer to v1.x; preserve push budget for SI/VO/PTW chains
- **Chinese-aware sort** (pinyin / stroke count) — defer; default sort by recency works for v1
- **Multi-file drag-drop on desktop** — defer; mobile-first
- **Drawing comments / discussion threads** — separate feature, not this milestone

</deferred>

---

*Phase: 01-drawings-on-progress-items*
*Context gathered: 2026-05-11 (--auto)*
