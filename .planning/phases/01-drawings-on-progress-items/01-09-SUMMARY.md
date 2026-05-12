# Plan 01-09 Summary — End-of-Phase Walkthrough

**Status:** ✅ DEPLOYMENT VERIFIED (full UX walkthrough deferred pending test data)
**Date:** 2026-05-12
**Plan:** 01-09-PLAN.md

## Verification Performed

Branch `claude/sweet-goldstine-e99977` pushed to `main` (`601844d`). Vercel auto-deployed `construction-app-lime-six.vercel.app`. Codemagic auto-triggered iOS TestFlight + Android workflows.

### SC1 — Live deployment ships the code
- Entry chunk: `index-DYpwLVNp.js` (504 KB — under 800 KB CI threshold ✅)
- Lazy chunks emitted: `viewer-pdf-CxNKkqmB.js` (react-pdf), `viewer-zoom-Bn-u48k0.js` (react-zoom-pan-pinch)
- Markers present in entry: `drawings`, `uploadDrawing`, `can_upload_drawing`
- Bundle stays slim because viewer libs only load on first DrawingViewer mount

### SC2 — Auth + navigation work
- Logged in as PM Kwan (60282297 / admin1234) via web ✅
- Navigated to projects "Test" and "TM54" — DrawingsProvider mounts without console errors ✅

### SC3-SC5 — Full UX walkthrough (deferred)
Both test projects currently have **zero progress items** in their zones, so the 圖則 toggle button cannot surface on a leaf yet. To complete the manual walkthrough:
1. In project TM54, tap "加入大項" → add a 大項 → add a sub-item → drill until leaf
2. On the leaf card, tap 🖼 圖則 (0) — DrawingsSection should expand inline
3. Tap "+ 新增圖則" — bottom sheet with 拍攝 / 從相簿選擇 / 從檔案選擇 should appear
4. Upload a JPEG/PNG/PDF (try a >5MB to see warning, >25MB to see hard-block "檔案太大 (>25MB)，請壓縮後再上載")
5. Thumbnail should appear; tap to open DrawingViewer with pinch-zoom
6. Tap 📋 版本記錄 to see version history with uploader names (NOT raw UUIDs)
7. Test as a subcontractor account — should NOT see "+ 新增圖則" button

This 7-step manual walkthrough is the operator-side verification gate per Plan 01-09 design (BLOCKING: human-action). Infrastructure is shipped and proven loadable; UX validation awaits real project data.

## Database Verification (live Supabase)
All 7 schema verifications from Plan 01-01 passed (see 01-01-SUMMARY):
- drawings + drawing_versions tables exist
- project-drawings bucket is private
- can_upload_drawing helper, supersede_drawing_version RPC, assert_progress_item_is_leaf trigger all present
- demo_feedback RLS tightened to admin-only SELECT
- Realtime publication includes both new tables

## CI Pipeline Status
- Vercel: ✅ deployed (verified via fetch for new entry chunk hash)
- Codemagic ios-testflight: triggered on push (will produce new TestFlight build)
- Codemagic android-internal-test: triggered on push (will produce new APK)

## Phase 1 Plans Final Roll-up

| Plan | Status | Commits |
|------|--------|---------|
| 01-01 schema migration | ✅ | a3378e0, 755f7b1, de88d1a, fc988d7, 1898c73 |
| 01-02 bundle split + CI | ✅ | 707c2f6, 474aa2a, d57e556, 8261684 |
| 01-03 capacitor plugins | ✅ | 6d4b6e4, 5ec6d4c, ed131ee |
| 01-04 viewer libs + types | ✅ | d48e6a6, 51da35a, 702d367 |
| 01-05 DrawingsContext + lib | ✅ | fe36a5a, 88c195c, 547a61d |
| 01-06 5 UI components | ✅ | 6dd572e, e37163c, f472714, 54731ff |
| 01-07 wire to ProjectDetail | ✅ | e145027, d249c5e, 88575d8, 745f777 |
| 01-08 Playwright smoke (infra) | ✅ | ee31173, 1fb55ac, 42ff6c6, 601844d |
| 01-09 walkthrough | ✅ deployment + auth verified |

## Phase 1 Goal Achievement

**Phase 1 goal:** "PMs and main contractors can attach versioned drawings to leaf progress items so every team member on a project sees the exact, current revision that governs the work — with a private-bucket + RLS template that all subsequent phases inherit."

- ✅ Schema in place (drawings + drawing_versions + RPC + leaf-only trigger)
- ✅ Private bucket with project-scoped RLS via `(storage.foldername(name))[1] = project_id`
- ✅ Reusable RLS template for Phases 2 + 3 (`v8-private-bucket-template.sql`)
- ✅ Mobile pinch-zoom + lazy-loaded PDF viewer
- ✅ Role gating: subcontractor view-only, PM/MC/admin can upload (enforced both UI + RLS)
- ✅ Version history with supersede semantics (no destructive deletes)
- ✅ Bundle CI guard prevents regression
- ✅ Capacitor plugins registered for native upload UX
- ⏳ Full UX walkthrough on phone (TestFlight build will be available within 30-45 min from Codemagic)

## Operator Action Items (post-phase)
1. Wait for Codemagic TestFlight build → install on phone → run the 7-step walkthrough above
2. (Optional) Run Playwright smoke test once: requires `SUPABASE_SERVICE_ROLE_KEY` env var, then `node scripts/seed-demos.js` + `npm run test:e2e`
3. Add real progress items to a project (any 大項 → leaf chain) to start using the feature

---
*Generated 2026-05-12 after live Vercel deployment verification.*
