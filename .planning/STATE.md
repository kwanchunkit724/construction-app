---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-05-14T07:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 18
  completed_plans: 15
  percent: 83
---

# STATE — 工地控制系統 Milestone

**Last updated:** 2026-05-14 (Phase 2 Plan 02-06 complete; VO schema live, triple-layer server-total invariant in place)

## Project Reference

- **Project:** CK工程 / Construction App (live on iOS App Store; Android in test)
- **Core value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.
- **Current milestone:** 工地控制系統 (Site Control System) — 3 coarse phases
- **Current focus:** Phase 2 — SI / VO (Site Instructions / Variation Orders)

## Current Position

Phase: 2 (SI/VO) — EXECUTING (Wave 5 complete; Wave 6 = Plan 02-07 next)
Plan: 6 of 9

- **Phase:** 2 — SI / VO (Site Instructions / Variation Orders)
- **Plan:** 02-01 → 02-06 ✅ complete. Wave 6 next = 02-07 (VO UI: VoContext + LineItemsEditor + SubmitForm + ConfirmationScreen + List + Detail + PDF). Pure React, no DB checkpoint.
- **Status:** EXECUTING
- **Progress:** Phase 1 [██████████] 100% · Phase 2 [██████░░░░] 67% (6/9) · Phase 3 not yet planned · Overall [████████░░] 83%

### Critical apply-tooling note (captured 02-02)

PowerShell `Set-Clipboard` + `Get-Content -Raw` corrupts UTF-8 multi-byte chars (CP950 reinterpretation) on Windows. **Always** apply non-ASCII SQL via base64 → Monaco `setValue` (Chrome MCP `javascript_tool`) instead of clipboard. See 02-02-SUMMARY.md for details. Hot-fix path documented.

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 3 |
| Phases complete | 1 |
| Plans complete | 9 |
| v1 requirements mapped | 62/62 |
| Phase 01-drawings-on-progress-items P04 | 5m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P05 | 12m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P06 | 22m | 3 tasks | 5 files |
| Phase 01-drawings-on-progress-items P07 | 12m | 3 tasks | 4 files |
| Phase 01-drawings-on-progress-items P08 | 12m | 3 tasks | 5 files |
| Phase 02-si-vo P03 | 5m | 4 tasks | 7 files |
| Phase 02-si-vo P05 | ~75m | 6 tasks | 11 files |

## Accumulated Context

### Decisions

- **3 coarse phases, user-fixed** — milestone breaks into exactly Drawings → SI/VO → PTW. No invented sub-phases.
- **Phase ordering: Drawings → SI/VO → PTW.** Drawings is smallest and unblocks SI/VO inline references; PTW is most domain-heavy and reuses Phase 2 chain infra.
- **Approval-chain infrastructure built in Phase 2.** Even though PTW reuses it, the `project_approval_chains` table, admin UI, and append-only `approvals` log are introduced in Phase 2 with PTW already supported as a `doc_type`. Phase 3 seeds chain rows only.
- **Cross-cutting INF items established in Phase 1.** Migration namespace `v8-`, private-bucket template, RLS helpers, demo_feedback RLS fix, bundle-split + CI guard, Chinese-strings convention.
- **INF-08 (Playwright smoke tests) is cross-phase** — each phase ships its own happy-path test (DRW upload+view in P1, SI submit+approve in P2, PTW submit+sign+activate in P3).
- **safety_officer role lands inside Phase 3** (touches live `user_profiles` CHECK + `delete_my_account` RPC — Apple compliance must be preserved).
- **Phase 3 opens with a 1–2 day de-risking spike** (signed-JWT QR, pg_cron expiry, new native plugin, Apple re-review framing).

### Open Todos

- [ ] `/gsd-execute-phase 2` to ship SI/VO (9 plans, 8 waves)
- [ ] Plan Phase 3 (PTW) — open with 1–2 day de-risking spike
- [ ] Confirm production admin password `admin1234` rotation status
- [ ] Clean up untracked screenshots + `test-results/` at repo root before Phase 2 execution muddies the diff

### Blockers

None.

### Risks Carried Forward (from research)

- C1 storage RLS bypass via `getPublicUrl` reflex (mitigate in P1)
- C6 RLS recursive-policy meltdown (mitigate in P1 via `security definer set search_path = public` + `rls-smoke.sql`)
- C4 chain user-departure deadlock (mitigate in P2 via role+delegation model)
- C5 MC silently editing subcon SI (mitigate in P2 via `with check (false)` + versioned edits)
- C2 QR screenshot abuse (mitigate in P3 via signed JWT + login-gated verification)
- C3 Apple re-review on PTW copy (mitigate in P3 via `app_config.ptw_enabled` flag + framing)
- M6 bundle bloat (mitigate in P1 via `manualChunks` + CI guard)

## Session Continuity

**Last action:** Plan 02-06 complete — VO schema applied to live Supabase after partial-install recovery (orphan empty variation_orders table dropped + full script re-applied via base64→Monaco). Triple-layer server-authoritative total invariant in place: RLS column-write denial + recompute_vo_totals BEFORE-INSERT trigger + sync_vo_total BEFORE-INSERT/UPDATE trigger. submit_vo RPC live (zh-HK strings UTF-8 intact). submit_approval's VO branch (Plan 02-04) now auto-activates. Noto Sans HK font (~186 KB) vendored + lazy-loaded by exportVOToPDF. All 8 verifications pass.
**Next action:** Plan 02-07 (Wave 6) — VO UI: VoContext + VoLineItemsEditor + VoSubmitForm + VoConfirmationScreen + VoList + VoDetail + PDF export. Pure React, no DB checkpoint — autonomous run.

### Deferred for developer attention

- **Plan 02-03 Task 5:** Manual Xcode + Android Studio build verification of `capacitor-voice-recorder` (SPM-less, non-blocking warning). Recommended before Plan 02-05 SI UI lands so any linker issues surface early.
- **Postgres regtype display quirk:** `prolang::regtype::text` returns OID number on this Postgres version. Use `pg_proc JOIN pg_language` instead. See 02-04-SUMMARY.md.

**Canonical references for downstream agents:**

- `.planning/PROJECT.md` — core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — REQ-IDs with phase mapping (Traceability section)
- `.planning/ROADMAP.md` — phase goals, success criteria, dependencies
- `.planning/research/SUMMARY.md` — stack additions, build-order implications, pitfalls per phase
- `.planning/research/ARCHITECTURE.md` — chain/RLS/storage/QR architecture (if present)
- `.planning/research/PITFALLS.md` — detailed pitfall catalogue (if present)
- `.planning/codebase/CONCERNS.md` — existing concerns the milestone must address

---
*State initialized: 2026-05-11*
