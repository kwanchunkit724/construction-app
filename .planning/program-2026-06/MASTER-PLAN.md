# MASTER-PLAN — 7-problem program (2026-06)

Whole picture: the app is a live, ISO-evidence-grade site-management system whose moat is an
audit trail that survives disputes. This program (a) documents + reviews the DB, (b) turns the app
into an ISO 9001 / DEVB-DWSS bid asset, (c) widens the progress table from "big tower only" to every
HK project type, (d) adds a controlled document/file system that makes the progress table a real
finishing schedule, and (e) sets up competition entries for profile. Five of seven are already
de-risked into concrete, backwards-compatible plans; two are pure research deliverables now done.

## Problem classification

| # | Problem | Type | Status | Doc |
|---|---|---|---|---|
| 1 | Full DB diagram + function→table matrix + senior review | RESEARCH | ✅ DONE | `DB-STRUCTURE.md` (ERD + matrix + RLS) · `DB-REVIEW.md` |
| 2 | ISO 9001 for HK gov tenders — research + gap analysis | RESEARCH | ✅ DONE (feeds code roadmap) | `ISO9001-RESEARCH.md` (gaps G1-G7 ranked) |
| 3 | Rename 大/中/細項 after create | CODE (small) | core ALREADY SHIPPED (1237b13); polish only | `RENAME-FEATURE-PLAN.md` |
| 4 | Progress table fits 小型工程/渠務/維修 | CODE (large, phased) | planned | `PROGRESS-TABLE-PROJECT-TYPES.md` |
| 5 | File system linked to progress table | CODE (large, phased) | planned | `FILE-SYSTEM-DESIGN.md` |
| 6 | Replace drawing affordance with file-system PDF | CODE (rides on #5) | planned (file-system §4) | `FILE-SYSTEM-DESIGN.md §4` |
| 7 | Government / public competitions | RESEARCH | ✅ DONE | `COMPETITIONS-RESEARCH.md` |

## Migration numbering (resolves the v38 collision — all three plans drafted "v38")

Sequential by SHIP order. Latest on prod = v37.
- **v38** = rename polish (`v38-meta-change-history.sql`) — also delivers DB-REVIEW P1-A (column write-guard) + P1-C (journal metadata).
- **v39** = progress project-types **P1** (`v39-progress-project-types.sql`: `projects.project_type` + widen `tracking_mode` enum to add `checklist` + auto-zone for small_works; re-create `get_visible_progress_items` in lockstep — DB-REVIEW P2-C).
- **v40** = file system Phase A (`v40-documents-schema.sql`: documents/document_versions/document_events + counters + `project-docs` bucket + RLS + RPCs + `app_config.files_enabled` + id-preserving backfill + dual-write sync triggers). Extend `v20-delete-account-fk-cascade` enumeration for new actor FKs.
- **v41** = project-types **P2** (quantity mode + weighted rollup + blocked_reason + qty history/snapshots).
- **v42** = project-types **P3** (unit_status mode + maintenance template).
- **v43** (later) = file-system contract (`v43-documents-write-flip.sql`) — ONLY when old-version sessions ≈ 0.
(ISO gaps G1 NCR/CAR, G2 ITP, G3 ack-register, G4 mgmt-review-export are a separate later track — see §ISO.)

## Execution plans (code items)

### Wave 1 — v38 rename polish  [files: supabase/v38-*.sql, src/contexts/ProgressContext.tsx, src/types.ts, src/components/HistoryModal.tsx]
- DB (additive): `progress_history` add `change_type text default 'progress'` + `meta jsonb`; `before update on progress_items` trigger rejecting changes to title/code/planned_*/zone_id/parent_id/level/tracking_mode/floor_labels unless `can_manage_project_progress` (skip when auth.uid() null).
- Client: `updateItemMeta` logs a `change_type='meta'` history row (diff of changed keys); `ProgressHistoryEntry` gains `change_type`+`meta`; `HistoryModal` renders meta rows as 「名稱：舊→新」. Optional: hide date fields on non-leaf in EditItemModal.
- Risk: none — additive, backwards-compatible. Verify by EXECUTION (worker REST PATCH title → rejected; PM rename → history row appears).

### Wave 2 — v39 project-types P1 (small_works unblock)  [types.ts, new src/lib/progressTemplates.ts, ProgressContext, CreateItemModal, UpdateProgressModal, ProgressItemCard, ProjectDetail, AdminProjects, export.ts]
- DB: `projects.project_type` (check general/small_works/drainage/maintenance, default general); widen tracking_mode to add `checklist`; re-create `get_visible_progress_items`. small_works auto-creates one zone + hides zone chrome (fixes the ProjectDetail.tsx:236-241 no-zone dead-end).
- `checklist` mode = floors storage reused, rendered as tick-list. Template registry drives mode picker + vocabulary + KPI tiles per project_type.
- Risk: low; `general` default = existing projects byte-identical.

### Wave 3 — v40 file system (problems 5 + 6)  [FILE-SYSTEM-DESIGN §5 phases A-E]
- Biggest build. Expand-and-contract: new tables only, id-preserving backfill of drawings, one-direction sync triggers so live iOS v1.3 keeps writing `drawings`; new clients read `documents`. Behind `files_enabled` flag (PTW precedent). Problem 6 = when flag ON, 圖則 row → 文件 row, "view drawing" opens the PDF from the register (same blobs, signed via bucket_id).
- MUST ship storage guardrails (compress images, 5MB warn/25MB cap, project storage meter — DB-REVIEW P2-B).
- Risk: highest. Phase behind flag; daily-sim the submit→reject→resubmit→approve chain before global flip.

### Wave 4 — v41 project-types P2 (drainage: quantity + weighted rollup + blocked)
### Wave 5 — v42 project-types P3 (maintenance: unit_status + deadline tile)

## Sequencing + model-tiering

Order: **v38 → v39 → v40 → v41 → v42** (waves sequenced, not parallel — they share ProgressItemCard / ProjectDetail / types.ts; parallel worktrees would conflict). Research docs (1,2,7) already delivered.

Per wave, per the user's model directive:
- **Plan** the wave detail / review: **Fable 5** agent.
- **Execute** code: **Opus 4.8** (the main loop is Opus, or spawn opus agents).
- **Review**: **Fable 5** plans the review checklist → **Opus 4.8** executes (runs checks, applies fixes).
- Every DB migration applied via clipboard→monaco + DOM-click Run, then **verified by EXECUTION** (see [[supabase-migration-apply]]).
- Note: subagent session limits have repeatedly capped fan-out (reset 11am HK on 2026-06-11); when capped, the Opus main loop executes directly and Fable planning waits for reset.

## VERSION-BUMP CHECKLIST (1.3 → 1.4 — apply once this program's first user-facing code ships)

1. `package.json:4` `"version": "1.3.0"` → `"1.4.0"`.
2. `codemagic.yaml` iOS `agvtool new-marketing-version "1.3"` (lines ~57 and ~183) → `"1.4"`.
3. `codemagic.yaml` Android `VERSION_NAME=1.3` (lines ~315 and ~433) → `1.4`.
4. `ios/App/App.xcodeproj/project.pbxproj` `MARKETING_VERSION = 1.1` (lines ~308, ~332) → `1.4` (cosmetic — CI overrides via agvtool — but keep consistent).
5. `src/pages/Sell.tsx` — the three `v1.3` strings → `v1.4`.
6. Build numbers are date/build-derived in CI — no manual change.
7. Manual (user): create the 1.4 version in App Store Connect + (later) Play Console; write 「新功能」notes.
Rule: bump when CODE ships to the store. Pure research/doc commits do NOT bump. v40 file-system ships flag-OFF, so 1.4 can carry it safely (server flip later, no new build needed — PTW precedent).

## Top founder actions (detail in the research docs)

**ISO (`ISO9001-RESEARCH.md`):** ISO 9001 is a standing requirement for the DEVB Approved Contractors list; the app is an operational evidence engine. Highest-value gaps to build for tender weight: **G1 NCR/CAR workflow** (reuse the issues+chain primitive), **G2 ITP/hold-point records** (reuse PTW checklist+signoff), **G3 controlled-document register** (= the file system done with approval-before-release + read-acknowledgement), **G4 one-click management-review pack export**. Bid narrative: DEVB TC(W) 8/2025 mandates DWSS for >$30M works from 1 Apr 2026 — the app is a subcontractor-scale DWSS.

**Competitions (`COMPETITIONS-RESEARCH.md`):** prioritise the 2-3 shortlisted there; materials needed = deck + 90-sec demo + real-usage metrics + the ISO/audit-trail story + a security one-pager. Lead with the unique angle: audit-trail-survives-disputes + ISO 9001 enablement + real 判頭 usage on the App Store.

## Immediate next step
Execute **Wave 1 (v38 rename polish)** with Opus (main loop): write migration, apply + execute-verify, client changes, tsc, commit, bump to 1.4. Then Wave 2.
