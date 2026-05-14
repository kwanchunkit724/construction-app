---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-05-14T06:15:02.179Z"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 18
  completed_plans: 17
  percent: 94
---

# STATE — 工地控制系統 Milestone

**Last updated:** 2026-05-14 (Phase 2 Plan 02-08 implementation complete; Task 7 blocking checkpoint awaits live-DB apply)

## Project Reference

- **Project:** CK工程 / Construction App (live on iOS App Store; Android in test)
- **Core value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.
- **Current milestone:** 工地控制系統 (Site Control System) — 3 coarse phases
- **Current focus:** Phase 2 — SI / VO (Site Instructions / Variation Orders)

## Current Position

Phase: 2 (SI/VO) — EXECUTING (Wave 7 implementation complete; Task 7 blocking checkpoint on live DB next)
Plan: 8 of 9

- **Phase:** 2 — SI / VO (Site Instructions / Variation Orders)
- **Plan:** 02-01 → 02-08 implementation ✅ complete (6 of 7 tasks). Task 7 = BLOCKING checkpoint for live-DB apply of `supabase/v9-default-chain-seed.sql` (save_chain_steps RPC + new-project trigger + idempotent backfill of D-16 SI/VO chains for existing live App Store projects). Apply via Chrome MCP base64 → Monaco (Chinese strings present). Two Apple-compliance regression tests (clean user `{ok:true}` + blocked user `{blocked:true}`) gate Plan 02-09.
- **Status:** EXECUTING
- **Progress:** [█████████░] 94%

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
| Phase 02-si-vo P08 | 30m | 6 tasks | 10 files |

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

**Last action:** Plan 02-08 implementation complete (Tasks 1-6, 6 commits 4f55ba1 → d04bc15). Shipped: `supabase/v9-default-chain-seed.sql` (save_chain_steps SECURITY DEFINER RPC + seed_default_chain AFTER INSERT trigger on projects + idempotent backfill for existing live projects, NOT EXISTS guards at (project_id,doc_type,step_order) granularity, non-destructive). `ApprovalChainContext` (per-project chain CRUD + chains-{projectId} realtime). `ChainStepRow` + `AdminProjectChains` page with 3-tab editor (工地指令 / 變更指令 / 工作許可證 with Phase 3 banner). Profile gains DelegationsProvider section (我嘅代理 / 我係代理) and handles new `delete_my_account` json response (`{blocked:true}` → zh-HK red banner + 通知管理員 button that writes demo_feedback row). `InFlightApprovalsModal` lists pending SI/VO for a user with admin_override action; wired from AdminUsers per-row 查看待處理簽核 button. Routes + sidebar + per-project AdminProjects entry. tsc clean. Bundle entry 641.6 KB / 800 KB (+27.3 KB).
**Next action:** Plan 02-08 Task 7 — BLOCKING checkpoint. Orchestrator drives Chrome MCP to apply `supabase/v9-default-chain-seed.sql` via base64 → Monaco. 8 post-apply verifications must pass, including TWO Apple-compliance regression tests: (7) clean-user `delete_my_account()` must return `{"ok":true}` and remove from auth.users; (8) user-with-in-flight-SI `delete_my_account()` must return `{"ok":false, "blocked":true, "pending":N, "error":"你尚有 ..."}` and NOT delete. After PASS, advance to Plan 02-09.

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
