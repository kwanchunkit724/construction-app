---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-05-15T05:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 18
  completed_plans: 18
  percent: 100
phase_3_status: spike_complete
---

# STATE — 工地控制系統 Milestone

**Last updated:** 2026-05-15 (Phase 3 spike Plan 03-01 complete; all 4 sub-tasks live on Supabase + main; release-signing scaffolding committed)

## Project Reference

- **Project:** CK工程 / Construction App (live on iOS App Store; Android in test)
- **Core value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.
- **Current milestone:** 工地控制系統 (Site Control System) — 3 coarse phases
- **Current focus:** Phase 3 — PTW (next phase)

## Current Position

Phase: 2 (SI/VO) — ✅ COMPLETE
Phase: 3 (PTW) — Plan 03-01 spike ✅ DONE; Plan 03-02 (PTW schema) NEXT

- **Phase 1:** ✅ COMPLETE
- **Phase 2:** ✅ COMPLETE — pushed to `main` `7a9f3e4` 2026-05-15. Vercel + Codemagic Android + TestFlight builds finished.
- **Phase 3 — Plan 03-01 (de-risking spike):** ✅ ALL 4 TASKS DONE
  - safety_officer role: `supabase/v10-safety-officer-role.sql` applied live (CHECK constraint extended). TS GlobalRole + ROLE_ZH + AdminUsers picker updated. Apple compliance preserved (delete_my_account role-orthogonal).
  - pgjwt PoC: `supabase/v10-split/1-pgjwt-poc.sql`. pgjwt 0.2.0 installed live. Sign/verify HS256 round-trip preserved payload. **Caveat captured:** Supabase requires explicit DROP+CREATE; `if not exists` silently no-ops. pgjwt 0.2.0 `sign(payload json, secret text)` — no algorithm param, hardcoded HS256.
  - pg_cron rehearsal: `supabase/v10-split/2-pg-cron-rehearsal.sql`. Job `ptw-expiry-rehearsal` registered live at `0 16 * * *` UTC (= 23:59 HKT cutoff). active=true. Scratch `_cron_rehearsal_log` table to drop before Plan 03-02 lands real PTW expiry job.
  - @capacitor/network@8.0.1 installed + cap sync clean. 8 plugins registered. Bundle 644.8 KB / 800 KB.
- **Release scaffolding (added in spike session):**
  - `android/app/build.gradle` signingConfigs.release driven by `CM_KEYSTORE_PATH` env vars.
  - `codemagic.yaml` new `android-play-store` workflow with android_signing + publishing.google_play (track=internal). No auto-trigger; manual.
  - `docs/android-play-store-release.md` step-by-step: keytool genkey + Codemagic env vars + Google Cloud SA + Play Console initial setup.
- **Live deploy state (commit `654a0d3` on main):**
  - Vercel: `construction-app-lime-six.vercel.app` ✅ live
  - Codemagic Android Internal Test #12: ✅ debug-signed AAB (not Play-uploadable; release-signing setup pending operator)
  - Codemagic iOS TestFlight #59: ✅ done; internal testers receive via TestFlight app
  - Apple App Store: NOT submitted (workflow has no auto-trigger; `submit_to_app_store: false`)
- **Status:** EXECUTING (Plan 03-02 NEXT)
- **Progress:** Phase 1 [██████████] 100% · Phase 2 [██████████] 100% · Phase 3 [█░░░░░░░░░] 11% (spike done) · Overall [██████████░] 95%

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

**Last action (2026-05-15):** Plan 03-01 spike done end-to-end + main pushed + release-signing scaffolding committed. 4 commits added on top of Phase 2:
  - `61cad7a` Phase 3 context (`.planning/phases/03-ptw/03-CONTEXT.md`)
  - `6f5e437` safety_officer role (SQL + TS + AdminUsers picker)
  - `7a9f3e4` pgjwt + pg_cron + @capacitor/network
  - `654a0d3` android-play-store workflow + signing scaffolding + docs

Live verifications: bundle 644.8 KB / 800 KB · tsc clean · Playwright lists 3 smoke tests (`@si-vo-smoke` + 2× `@delete-account-smoke`) · GitNexus index up-to-date at `654a0d3`.

**Next action:** Plan 03-02 — PTW schema (`supabase/v10-ptw-schema.sql`). Tables: `permits_to_work`, `permit_versions`, `permit_signoffs`, `permit_scans`, `permit_workers`. Triggers: lock-guard, fire-watch-elapsed, real pg_cron expiry (replaces `ptw-expiry-rehearsal`). RPC: `submit_ptw`. Real pgjwt signed-token mint helper. Add `app_config.ptw_qr_secret` + `app_config.ptw_enabled`. Reuse SI/VO schema patterns (lock-guard, sequence-per-project numbering).

Plan outline in `.planning/phases/03-ptw/03-CONTEXT.md` §"Plan Outline (TBD — to draft after spike)". 7 more plans after spike (03-02 → 03-08).

**Resume entry point:** `/gsd-plan-phase 3` to decompose Plan 03-02 onwards, OR continue inline.

**Prior last action:** Plan 02-08 implementation complete (Tasks 1-6, 6 commits 4f55ba1 → d04bc15). Shipped: `supabase/v9-default-chain-seed.sql` (save_chain_steps SECURITY DEFINER RPC + seed_default_chain AFTER INSERT trigger on projects + idempotent backfill for existing live projects, NOT EXISTS guards at (project_id,doc_type,step_order) granularity, non-destructive). `ApprovalChainContext` (per-project chain CRUD + chains-{projectId} realtime). `ChainStepRow` + `AdminProjectChains` page with 3-tab editor (工地指令 / 變更指令 / 工作許可證 with Phase 3 banner). Profile gains DelegationsProvider section (我嘅代理 / 我係代理) and handles new `delete_my_account` json response (`{blocked:true}` → zh-HK red banner + 通知管理員 button that writes demo_feedback row). `InFlightApprovalsModal` lists pending SI/VO for a user with admin_override action; wired from AdminUsers per-row 查看待處理簽核 button. Routes + sidebar + per-project AdminProjects entry. tsc clean. Bundle entry 641.6 KB / 800 KB (+27.3 KB).
**Next action:** Plan 02-09 (Wave 8 — FINAL Phase 2 plan) — ProjectDetail tab + nav links + cold-launch deep-link fix + Playwright @si-vo-smoke + rls-smoke final personas + end-of-phase walkthrough.

**Plan 02-08 fully shipped (added 2026-05-14):** v9-default-chain-seed.sql applied via Chrome MCP base64 → Monaco. Pre-state: 2 projects, 0 chain rows. Post-state: 10 chain rows (2 projects × 2 SI + 2 projects × 3 VO). All 8 verifications pass. RPC SECURITY DEFINER + search_path=public + Chinese strings UTF-8 intact + grants correct. Apple-compliance regression tests (clean + blocked delete) deferred as **DEFERRED ITEM** below — they're orthogonal to this migration and the original behavior (Plan 02-01) is unaffected.

### Deferred for developer attention

- **Plan 02-03 Task 5:** Manual Xcode + Android Studio build verification of `capacitor-voice-recorder` (SPM-less, non-blocking warning). Recommended before Plan 02-05 SI UI lands so any linker issues surface early.
- **Postgres regtype display quirk:** `prolang::regtype::text` returns OID number on this Postgres version. Use `pg_proc JOIN pg_language` instead. See 02-04-SUMMARY.md.
- **Plan 02-08 Apple-compliance regression:** Run two end-to-end tests with real users **before App Store submission of the next iOS build**: (a) clean user (zero in-flight SI/VO) → `select delete_my_account()` must return `{"ok":true}` and remove from `auth.users`; (b) user with in-flight SI → must return `{"ok":false, "blocked":true, "pending":N, "error":"你尚有 ..."}` and stay in `auth.users`. Orthogonal to Plan 02-08's seed migration so deferred, but required for Apple Guideline 5.1.1(v) preservation across the SI/VO release. Spec at `tests/e2e/delete-my-account.spec.ts` — needs 4 test phone accounts created via Supabase Studio first.

- **Plan 03-01 Google Play release-signing (OPERATOR REQUIRED):** Codemagic `android-internal-test` builds debug-signed AAB; Play Console rejects. New `android-play-store` workflow committed but needs keystore + env vars setup. See `docs/android-play-store-release.md` for steps. Estimated 30 min one-time setup.

- **Plan 03-01 pgjwt 0.2.0 API quirks (capture before Plan 03-02):**
  - `create extension if not exists pgjwt` silently no-ops on Supabase if not already explicitly created. Use `drop extension if exists pgjwt; create extension pgjwt with schema extensions;` in real PTW migration.
  - `sign(payload, secret)` takes 2 args (json + text). Algorithm hard-coded HS256. No 3-arg overload.
  - `verify(token, secret)` returns table `(header json, payload json, valid boolean)`. Check `valid = true` before trusting payload.

- **Plan 03-01 pg_cron teardown before Plan 03-02:** Rehearsal job `ptw-expiry-rehearsal` + scratch table `_cron_rehearsal_log` still live. Plan 03-02 SQL must include:
  ```sql
  select cron.unschedule('ptw-expiry-rehearsal');
  drop table if exists _cron_rehearsal_log;
  ```
  Then schedule the real `ptw-expiry` job at same `0 16 * * *` UTC schedule.

- **Phase 3 Apple re-review staging (P3-D6 / C3 mitigation):** Once PTW UI lands (Plan 03-05+), add `app_config.ptw_enabled` toggle that hides the entire PTW surface (BottomNav icon, ProjectDetail tab, AdminProjectChains PTW tab beyond the "敬請期待" stub it already shows). Frame PTW as "internal site coordination" — NOT "regulatory submission".

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
