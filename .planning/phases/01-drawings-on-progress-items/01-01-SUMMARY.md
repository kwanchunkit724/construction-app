# Plan 01-01 Summary — v8-drawings.sql Schema Migration

**Status:** ✅ COMPLETE
**Date:** 2026-05-12
**Plan:** 01-01-PLAN.md
**Phase:** 01-drawings-on-progress-items

## What Was Built

The foundational database layer for Phase 1: tables + RLS + RPC + private bucket + reusable templates + 3-persona smoke harness, applied to live Supabase production database.

### Files Created
- `supabase/v8-private-bucket-template.sql` — INF-02 reusable RLS template for Phase 2 + 3 (no execution; reference only)
- `supabase/v8-drawings.sql` — Canonical Phase 1 migration (252 lines)
- `supabase/tests/rls-smoke.sql` — INF-04 3-persona RLS harness with `current_user` assertions per persona

### Schema Deployed (verified live)
- **Tables:** `drawings`, `drawing_versions` ✅
- **Bucket:** `project-drawings` (private, signed-URL only) ✅
- **Helper:** `can_upload_drawing(uid, project_id)` SECURITY DEFINER, excludes subcontractor (D-25) ✅
- **RPC:** `supersede_drawing_version(...)` single-transaction atomic supersession (ISSUE-09 fix) ✅
- **Trigger:** `assert_progress_item_is_leaf()` enforces leaf-only attachment (T-01-08) ✅
- **RLS policies:** drawings (3), drawing_versions (3), storage.objects (2) — all use existing `can_view_project` / new `can_upload_drawing` helpers ✅
- **Realtime publication:** drawings + drawing_versions added ✅
- **demo_feedback fix (ride-along D-32 / m8):** Old over-permissive SELECT replaced with admin-only `Admin reads feedback` policy ✅

### Verification Performed (live database)
| # | Check | Expected | Actual |
|---|---|---|---|
| 1 | Tables exist | 2 | drawings, drawing_versions |
| 2 | Bucket private | public=false | private-OK |
| 3 | can_upload_drawing | 1 | present |
| 4 | supersede_drawing_version RPC | 1 | present |
| 5 | assert_progress_item_is_leaf | 1 | present |
| 6 | demo_feedback SELECT policy | Admin only | "Admin reads feedback" only |
| 7 | Realtime publication | 2 tables | drawings, drawing_versions |

### RLS Smoke Harness
Run as `postgres` from SQL Editor. Inserts 2 fixture projects + 1 leaf each + 1 drawing each, then asserts persona role-switch state and expected drawing visibility for `pm_of_a`, `pm_of_b`, `subcon_of_b`. Final `rollback;` ensures no data persists. Result: `Success. No rows returned` (no exceptions raised).

### Bug Fix Side Effect
- `supabase/tests/rls-smoke.sql` originally referenced non-existent `progress_items.name` column. Patched to use the actual `code` + `title` columns (commit `fc988d7`). Plan template assumed wrong column name; this fix preserves the harness's value.

## Commits
- `a3378e0` — task 1: v8-private-bucket-template.sql (INF-02 template)
- `755f7b1` — task 2: v8-drawings.sql (schema + RLS + RPC + ride-along)
- `de88d1a` — task 3: rls-smoke.sql (3-persona harness)
- `fc988d7` — fix: rls-smoke uses code+title (post-checkpoint patch)

## Threat Model Coverage
- **T-01-01 (C1 storage RLS bypass):** Bucket is private; no `getPublicUrl` paths. Signed URLs only.
- **T-01-03 (C6 RLS recursion):** All new helpers `security definer set search_path = public`; rls-smoke harness covers cross-persona perspectives.
- **T-01-04 (drawing immortality):** No DELETE policies on storage.objects.
- **T-01-05 (m8 demo_feedback):** Over-permissive SELECT replaced with admin-only.
- **T-01-07 (ISSUE-09 atomicity):** supersede_drawing_version RPC wraps insert+supersede+update in a single PL/pgSQL transaction.
- **T-01-08 (leaf-only):** Trigger `assert_progress_item_is_leaf` blocks attachment to non-leaf progress_items with Chinese-friendly error message hook.

## Requirements Satisfied
INF-01 (v8 namespace), INF-02 (bucket template), INF-03 (RLS helpers introduced), INF-04 (rls-smoke introduced), INF-05 (demo_feedback fix), DRW-12 (private bucket), DRW-13 (signed URLs only).

## What's Next
Plan 01-02: Vite manualChunks + bundle-size CI guard.

---
*Generated 2026-05-12 after live Supabase verification.*
