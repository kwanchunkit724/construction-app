# Plan 02-01 Summary — Shared Approval-Chain Spine + RLS Helpers + Storage Bucket

**Status:** ✅ COMPLETE — applied to live Supabase, all 10 post-apply verifications pass
**Date:** 2026-05-14
**Plan:** 02-01-PLAN.md
**Phase:** 02-si-vo

## What Was Built

The foundational Phase 2 database layer — shared approval-chain tables, security-definer RLS helpers, a private SI/VO attachments bucket, push fan-out + digest cron, and an Apple-compliance-preserving extension to `delete_my_account`. All 6 SQL files applied to live Supabase via the Dashboard SQL Editor (driven by Claude in Chrome after the in-flight checkpoint).

### Files Created
- `supabase/v9-chain-schema.sql` — Shared spine: 5 tables + `approval_action_type` enum + RLS + realtime publication
- `supabase/v9-rls-helpers.sql` — `active_role_holders` + `in_flight_approvals` (plpgsql + EXECUTE, defers SI/VO table refs to call-time)
- `supabase/v9-si-vo-storage-bucket.sql` — Private `project-si-vo` bucket + 2 storage.objects policies (INF-02 instantiation)
- `supabase/v9-account-deletion-extend.sql` — `delete_my_account()` extended (void → json; blocks when in-flight > 0; preserves v6 cascade)
- `supabase/v9-split/1-push-dispatcher.sql` — Push fan-out with 3/user/day fatigue cap + digest fallback
- `supabase/v9-split/6-drain-digest-cron.sql` — `drain_notification_digest()` + pg_cron `si-vo-digest` at `0 0 * * *` UTC (08:00 HKT)
- `supabase/tests/rls-smoke.sql` — Extended with Phase 2 personas (admin, mc_of_A, subcon_of_B, subcontractor_worker, delegated-PM) + CHN-11 append-only assertion
- `supabase/v9-split/CAPACITOR8-COMPAT.md` — Plugin compat verdict (PASS/PASS for geolocation + voice recorder)

### Schema Deployed (verified live)
- **Tables:** `approval_chain_steps`, `approvals`, `delegations`, `notification_counters`, `notification_digest` ✅ (5 rows)
- **Enum:** `approval_action_type` ✅ (1 row)
- **Helpers:** 4 SECURITY DEFINER + `search_path=public` (`active_role_holders`, `in_flight_approvals`, `push_dispatcher`, `drain_notification_digest`) ✅
- **Bucket:** `project-si-vo` (private, signed-URL only) ✅
- **Storage policies:** `Members read si-vo`, `Editors upload si-vo` ✅
- **Cron:** `si-vo-digest` at `0 0 * * *` ✅
- **`delete_my_account`:** Returns `json`; body contains `in_flight_approvals` guard ✅
- **Realtime publication:** `approvals` + `delegations` ✅
- **`push_dispatcher`:** Revoked from `authenticated` + `anon` ✅

### Verification Performed (live database — Chrome MCP, 10-query batch)
| # | Check | Expected | Actual |
|---|---|---|---|
| 1 | Spine tables present | 5 | 5 |
| 2 | `approval_action_type` enum | 1 | 1 |
| 3 | Helpers SECURITY DEFINER + search_path | 4 | 4 |
| 4 | `project-si-vo` private | OK | OK |
| 5 | Storage policies | 2 | 2 |
| 6 | `si-vo-digest` cron | `0 0 * * *` | `0 0 * * *` |
| 7 | `delete_my_account` extended | OK | OK |
| 8 | `delete_my_account` returns json | json | json |
| 9 | Realtime publication | 2 | 2 |
| 10 | `push_dispatcher` revoked from authenticated | OK | OK |

### Mid-Apply Bug Fix (committed as `3e7cd19`)
- **Symptom:** Applying `v9-rls-helpers.sql` failed with `ERROR 42P01: relation "site_instructions" does not exist` at parse time of `in_flight_approvals`.
- **Root cause:** The original used `language sql`, which DOES resolve table references at CREATE-FUNCTION parse time (the original "forward-reference note" assumed otherwise).
- **Fix:** Converted `in_flight_approvals` to `language plpgsql` with `EXECUTE` and `to_regclass()` guards. Body is a string literal — table refs resolve only at call time. Function returns 0 if invoked before SI/VO tables ship (Plans 02-02 / 02-06).
- **Apply path:** Re-applied via Chrome MCP after fix. Success.

## Commits
- `66e013f` — task 1: v9-chain-schema.sql (shared spine)
- `542dabc` — task 2: v9-rls-helpers.sql (active_role_holders + in_flight_approvals)
- `2184ee9` — task 3: v9-si-vo-storage-bucket.sql (PRIVATE bucket + RLS)
- `cfc6cc7` — task 4: v9-account-deletion-extend.sql (in_flight guard)
- `1c4f255` — task 5: push_dispatcher + drain_notification_digest cron
- `cf222ca` — task 6: rls-smoke Phase 2 extension (5 personas + CHN-11)
- `ba20be0` — task 7: Capacitor 8 plugin compat doc (PASS/PASS)
- `3e7cd19` — fix: defer SI/VO table refs in in_flight_approvals via plpgsql EXECUTE (post-checkpoint patch)
- `(this commit)` — task 8: live apply confirmation + SUMMARY + state metadata

## Threat Model Coverage
- **T-02-06 (account deletion with in-flight approvals):** `delete_my_account` blocks when `in_flight_approvals(caller) > 0` with zh-HK error. Empty-account cascade path preserved verbatim → Apple Guideline 5.1.1(v) compliance preserved.
- **T-02-07 (push DoS):** `push_dispatcher` hard-capped at 3/user/day. 4th+ notifications go to `notification_digest`, drained once at 08:00 HKT.
- **T-02-PD (push dispatcher tampering):** `push_dispatcher` revoked from `authenticated` + `anon`. Only invokable from SECURITY DEFINER trigger paths (added in Plans 02-04 / 02-07).
- **C6 (RLS recursive-policy meltdown):** All new helpers declared `security definer set search_path = public`. Extended rls-smoke covers 5 personas.
- **CHN-11 (append-only approvals):** No UPDATE / DELETE policies on `approvals`. Verified in extended rls-smoke.

## Requirements Satisfied
**CHN-01..11** (chain spine, RLS helpers, push dispatcher + digest, append-only approvals, in-flight account-deletion guard, realtime publication, reason-length CHECK), **INF-03 extend** (helpers), **INF-04 extend** (rls-smoke Phase 2 personas).

## Downstream Unblocks
- **Plan 02-02** (SI schema + triggers) — can now reference `approval_action_type`, `approvals`, `push_dispatcher`, `active_role_holders`.
- **Plan 02-06** (VO schema + triggers) — same.
- **Plan 02-03** (Capacitor plugins) — parallel to 02-02 within Wave 2; CAPACITOR8-COMPAT.md confirms zero compat risk.
- **Phase 3** (PTW) — reuses entire chain spine; only chain-row seeding needed.
