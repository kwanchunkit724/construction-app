---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-05-14T08:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 18
  completed_plans: 18
  percent: 100
---

# STATE — 工地控制系統 Milestone

**Last updated:** 2026-05-14 (Phase 2 COMPLETE — all 9 plans shipped; Phase 3 PTW next)

## Project Reference

- **Project:** CK工程 / Construction App (live on iOS App Store; Android in test)
- **Core value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.
- **Current milestone:** 工地控制系統 (Site Control System) — 3 coarse phases
- **Current focus:** Phase 3 — PTW (next phase)

## Current Position

Phase: 2 (SI/VO) — ✅ COMPLETE (all 9 plans shipped, Wave 8 / Plan 02-09 done)
Phase: 3 (PTW) — NOT STARTED (next)

- **Phase 1:** ✅ COMPLETE (drawings on progress items)
- **Phase 2:** ✅ COMPLETE — 02-01 → 02-09 all shipped. Plan 02-09 delivered:
  ProjectDetail 簽核 tab + Sidebar/BottomNav SI/VO links + cold-launch
  deep-link fix in src/lib/push.ts (Open Q 4 — `_pendingDeepLink` queue +
  `consumePendingDeepLink` drained by AuthContext) + tests/e2e/si-vo-smoke.spec.ts
  (`@si-vo-smoke` happy-path: SI submit → MC approve → PM approve → lock →
  MC raises VO → PM approves → 匯出 PDF) + tests/fixtures/seed-phase2.sql
  (idempotent seed) + supabase/tests/rls-smoke.sql FINAL extension
  (foreman + delegated-PM with real SI assertions + CHN-11 against real
  approvals row). 6 atomic commits 0046058 → a0880c1. Bundle entry 644.3 KB
  / 800 KB CI limit. tsc clean.
- **Next:** Plan Phase 3 (PTW) — open with 1–2 day de-risking spike per
  ROADMAP.
- **Status:** EXECUTING (Phase 3 planning next)
- **Progress:** Phase 1 [██████████] 100% · Phase 2 [██████████] 100% · Overall [██████████] 100%

### Critical apply-tooling note (captured 02-02)

PowerShell `Set-Clipboard` + `Get-Content -Raw` corrupts UTF-8 multi-byte chars (CP950 reinterpretation) on Windows. **Always** apply non-ASCII SQL via base64 → Monaco `setValue` (Chrome MCP `javascript_tool`) instead of clipboard. See 02-02-SUMMARY.md for details. Hot-fix path documented.

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases planned | 3 |
| Phases complete | 2 |
| Plans complete | 18 |
| v1 requirements mapped | 62/62 |
| Phase 01-drawings-on-progress-items P04 | 5m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P05 | 12m | 2 tasks | 3 files |
| Phase 01-drawings-on-progress-items P06 | 22m | 3 tasks | 5 files |
| Phase 01-drawings-on-progress-items P07 | 12m | 3 tasks | 4 files |
| Phase 01-drawings-on-progress-items P08 | 12m | 3 tasks | 5 files |
| Phase 02-si-vo P03 | 5m | 4 tasks | 7 files |
| Phase 02-si-vo P05 | ~75m | 6 tasks | 11 files |
| Phase 02-si-vo P08 | 30m | 6 tasks | 10 files |
| Phase 02-si-vo P09 | 30m | 6 tasks | 10 files |

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

**Last action:** Phase 2 COMPLETE. Plan 02-09 shipped (Tasks 1-6, 6 commits 0046058 → a0880c1). ProjectDetail 簽核 tab + SiVoSwitcher; Sidebar + BottomNav in-project SI/VO entries; src/lib/push.ts cold-launch deep-link queue + `consumePendingDeepLink` drained by AuthContext bootstrap (Open Q 4 mitigated); `@si-vo-smoke` Playwright spec + idempotent seed-phase2.sql fixture; rls-smoke FINAL block with foreman + delegated-PM personas asserting can_view_si, in_flight_approvals via delegation, CHN-11 against a real approvals row. Bundle entry 644.3 KB / 800 KB. tsc clean.

**Next action:** Plan Phase 3 (PTW) — open with a 1–2 day de-risking spike (signed-JWT QR, pg_cron expiry, new native plugin, Apple re-review framing) per ROADMAP. Reuses chain infra + push pipeline + rls-smoke pattern from Phase 2.

**Plan 02-08 fully shipped (added 2026-05-14):** historical entry below.

**Prior last action:** Plan 02-08 implementation complete (Tasks 1-6, 6 commits 4f55ba1 → d04bc15). Shipped: `supabase/v9-default-chain-seed.sql` (save_chain_steps SECURITY DEFINER RPC + seed_default_chain AFTER INSERT trigger on projects + idempotent backfill for existing live projects, NOT EXISTS guards at (project_id,doc_type,step_order) granularity, non-destructive). `ApprovalChainContext` (per-project chain CRUD + chains-{projectId} realtime). `ChainStepRow` + `AdminProjectChains` page with 3-tab editor (工地指令 / 變更指令 / 工作許可證 with Phase 3 banner). Profile gains DelegationsProvider section (我嘅代理 / 我係代理) and handles new `delete_my_account` json response (`{blocked:true}` → zh-HK red banner + 通知管理員 button that writes demo_feedback row). `InFlightApprovalsModal` lists pending SI/VO for a user with admin_override action; wired from AdminUsers per-row 查看待處理簽核 button. Routes + sidebar + per-project AdminProjects entry. tsc clean. Bundle entry 641.6 KB / 800 KB (+27.3 KB).
**Next action:** Plan 02-09 (Wave 8 — FINAL Phase 2 plan) — ProjectDetail tab + nav links + cold-launch deep-link fix + Playwright @si-vo-smoke + rls-smoke final personas + end-of-phase walkthrough.

**Plan 02-08 fully shipped (added 2026-05-14):** v9-default-chain-seed.sql applied via Chrome MCP base64 → Monaco. Pre-state: 2 projects, 0 chain rows. Post-state: 10 chain rows (2 projects × 2 SI + 2 projects × 3 VO). All 8 verifications pass. RPC SECURITY DEFINER + search_path=public + Chinese strings UTF-8 intact + grants correct. Apple-compliance regression tests (clean + blocked delete) deferred as **DEFERRED ITEM** below — they're orthogonal to this migration and the original behavior (Plan 02-01) is unaffected.

### Deferred for developer attention

- **Plan 02-03 Task 5:** Manual Xcode + Android Studio build verification of `capacitor-voice-recorder` (SPM-less, non-blocking warning). Recommended before Plan 02-05 SI UI lands so any linker issues surface early.
- **Postgres regtype display quirk:** `prolang::regtype::text` returns OID number on this Postgres version. Use `pg_proc JOIN pg_language` instead. See 02-04-SUMMARY.md.
- **Plan 02-08 Apple-compliance regression:** Run two end-to-end tests with real users **before App Store submission of the next iOS build**: (a) clean user (zero in-flight SI/VO) → `select delete_my_account()` must return `{"ok":true}` and remove from `auth.users`; (b) user with in-flight SI → must return `{"ok":false, "blocked":true, "pending":N, "error":"你尚有 ..."}` and stay in `auth.users`. Orthogonal to Plan 02-08's seed migration so deferred, but required for Apple Guideline 5.1.1(v) preservation across the SI/VO release.

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
