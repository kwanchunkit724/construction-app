---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-05-12T05:37:04.563Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 9
  completed_plans: 8
  percent: 89
---

# STATE — 工地控制系統 Milestone

**Last updated:** 2026-05-11 (post-roadmap)

## Project Reference

- **Project:** CK工程 / Construction App (live on iOS App Store; Android in test)
- **Core value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.
- **Current milestone:** 工地控制系統 (Site Control System) — 3 coarse phases
- **Current focus:** Phase 1 — 圖則附加 (Drawings on Progress Items)

## Current Position

Phase: 1 (圖則附加 (Drawings on Progress Items)) — EXECUTING
Plan: 1 of 9

- **Phase:** 1 — 圖則附加 (Drawings on Progress Items)
- **Plan:** (none yet — awaiting `/gsd-plan-phase 1`)
- **Status:** Executing Phase 1
- **Progress:** [█████████░] 89%

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 3 |
| Phases complete | 0 |
| Plans complete | 0 |
| v1 requirements mapped | 62/62 |
| Phase 01-drawings-on-progress-items P04 | 5m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P05 | 12m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P06 | 22m | 3 tasks | 5 files |
| Phase 01-drawings-on-progress-items P07 | 12m | 3 tasks | 4 files |
| Phase 01-drawings-on-progress-items P08 | 12m | 3 tasks | 5 files |

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

- [ ] `/gsd-plan-phase 1` to decompose Phase 1 into plans
- [ ] Resolve Phase 1 open question: drawing-upload push policy (whole project / PMs only / off in MVP)
- [ ] Confirm production admin password `admin1234` rotation status before Drawings ships

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

**Last action:** Created ROADMAP.md and STATE.md; updated REQUIREMENTS.md traceability with phase mappings.
**Next action:** `/gsd-plan-phase 1` to begin Phase 1 (Drawings) planning.

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
