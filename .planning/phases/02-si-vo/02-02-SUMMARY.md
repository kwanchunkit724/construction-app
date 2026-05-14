# Plan 02-02 Summary — SI Schema + Shared Approval-Advance Trigger

**Status:** ✅ COMPLETE — applied to live Supabase, all 8 verifications pass, Chinese strings confirmed UTF-8
**Date:** 2026-05-14
**Plan:** 02-02-PLAN.md
**Phase:** 02-si-vo

## What Was Built

The SI domain layer: tables, RLS, lock-guard immutability semantics, sequence-per-project numbering, `submit_si` RPC that snapshots the approval chain at submit time, and the shared `dispatch_after_approval` trigger that both SI (now) and VO (future Plan 02-06) consume. Plus a Phase 3 PTW-ready short-circuit that returns no-op until PTW lands.

### Files Created
- `supabase/v9-si-schema.sql` — SI domain (3 tables + 5 helpers/RPCs + 1 trigger + 6 RLS policies + view-stub replacement + realtime publication)
- `supabase/v9-split/4-trg-approval-created.sql` — shared chain-advance trigger consumed by SI/VO/PTW
- `supabase/v9-split/2-trg-si-submitted.sql`, `supabase/v9-split/5-trg-chain-completed.sql` — doc-only marker files (notes for future readers)

### Schema Deployed (verified live)
- **Tables:** `site_instructions`, `si_versions`, `protest_comments` ✅ (3 rows)
- **Helpers / RPCs (all SECURITY DEFINER):** `can_view_si`, `next_si_number`, `submit_si`, `si_lock_guard`, `dispatch_after_approval` ✅ (5 rows)
- **Triggers:** `trg_si_locked_guard` (BEFORE INSERT on si_versions), `trg_approval_created` (AFTER INSERT on approvals) ✅ (2 rows)
- **Realtime publication:** site_instructions, si_versions, protest_comments ✅ (3 rows)
- **`Members view SI approvals` policy** replaces Plan 02-01's `View approvals stub` ✅
- **Chinese error strings confirmed UTF-8 intact** in `si_lock_guard` (`工地指令已鎖定...`), `submit_si` (`只有提交人...`), `dispatch_after_approval` (`工地指令`, `變更指令`, `已退回`, `已被拒絕`, `已鎖定`) ✅

### Verification Performed (Chrome MCP, 8-row batch)
| Check | Expected | Actual |
|---|---|---|
| `si_tables` | 3 | 3 |
| `si_helpers_secure` (SECURITY DEFINER) | 5 | 5 |
| `si_triggers` | 2 | 2 |
| `si_realtime` | 3 | 3 |
| `si_approvals_view_policy` | OK | OK |
| `si_lock_guard_chinese` | OK_utf8 | OK_utf8 |
| `submit_si_chinese_intact` | OK_utf8 | OK_utf8 |
| `dispatch_chinese` | OK_utf8 | OK_utf8 |

### Mid-Apply Bug Fixes
1. **`drop trigger if exists ... on si_versions` failed on first run** — `if exists` covers a missing trigger but not a missing table. Wrapped in a DO block that checks `to_regclass('public.si_versions') is not null` first. Committed `a8e592a`.

2. **PowerShell `Set-Clipboard` + `Get-Content -Raw` corrupted Chinese strings** during the first apply attempt (Windows OEM codepage CP950 reinterpreted UTF-8 bytes as Big5). `si_lock_guard` and `submit_si` shipped with garbled error messages on first apply. **Fixed in-place** by re-running just those two `create or replace function` blocks via the base64 → Monaco `setValue` path that bypasses the clipboard entirely. Live functions now contain the correct UTF-8 Chinese. **No source-file changes needed** (the .sql file on disk was always correct UTF-8 — only the clipboard transport was broken).

   **Lesson captured for future SQL applies:** never use PowerShell clipboard for files containing non-ASCII bytes. Always base64-encode via Node + decode in browser JS via `TextDecoder('utf-8')` and push to Monaco model directly.

## Commits
- `eadf66e` — task 1: v9-si-schema.sql (SI tables + helpers + RLS + lock guard + submit_si)
- `0550ee6` — task 2: dispatch-after-approval trigger (shared SI+VO chain advance)
- `36f674d` — task 3: v9-split marker files (2 + 5)
- `a8e592a` — fix: guard trg_si_locked_guard drop for first-run idempotency
- `(this commit)` — task 4: live apply confirmation + Chinese-string hot-fix + SUMMARY + state

## Threat Model Coverage
- **T-02-LCK (post-lock immutability of SI):** `trg_si_locked_guard` BEFORE INSERT on si_versions blocks new versions when parent `locked_at is not null`. Combined with absence of UPDATE/DELETE policies on `si_versions`, enforces append-only audit chain.
- **CHN-03 (chain freeze at submit):** `submit_si` snapshots `approval_chain_steps` ordered by `step_order` into `chain_snapshot` jsonb. Frozen for the SI's entire lifetime; downstream chain config changes don't affect in-flight docs.
- **CHN-07 (first-step push):** `submit_si` fans out push via `push_dispatcher` to `chain_snapshot[0]` holders (or `optional_user_id` override).
- **CHN-11 (append-only approvals):** Direct INSERT policy on `approvals` is `with check (false)` — only the `submit_approval` RPC (Plan 02-04) can write. View policy now SI-aware (was `false` stub).
- **D-14 (protest only after lock):** `Insert protest only when locked` policy ensures `protest_comments` rows can only be created when parent SI is `status='locked'`.
- **Audit chain integrity (BLOCKER 1 fix from iter-1):** `Creator inserts versions when draft or revision` policy means non-creator role-holders cannot insert arbitrary si_versions rows. The `submit_approval` RPC (Plan 02-04) will construct new versions server-side inside the same transaction as the approvals INSERT (SECURITY DEFINER bypasses RLS), guaranteeing versions never exist without their corresponding approvals row.

## Forward-Reference Strategy
- `dispatch_after_approval` references `variation_orders` (Plan 02-06). Branch is gated by `to_regclass('public.variation_orders') is null then return new` and uses `EXECUTE` for the VO update so the trigger applies cleanly before VO ships.
- PTW handling deferred to Phase 3 — trigger returns no-op for `doc_type='ptw'`.

## Requirements Satisfied
**SI-01** (create draft), **SI-04** (submit freezes chain), **SI-05** (RLS visibility), **SI-06** (sequence-per-project numbering), **SI-09** (status state machine), **SI-10** (post-lock immutability), **SI-11** (protest-after-lock audit trail). **CHN-03** (chain snapshot), **CHN-04** (state machine), **CHN-07** (first-step push). **INF-03 extend** (can_view_si helper), **INF-04 extend** (covered in v9 rls-smoke harness from Plan 02-01).

## Downstream Unblocks
- **Plan 02-04** (TS + SiContext + submit_approval RPC) — can now type `site_instructions` rows, call `submit_si`, and build the submit_approval RPC on top of the chain-advance trigger.
- **Plan 02-05** (SI UI) — depends on 02-04 + SiContext. No DB dependencies remaining.
- **Plan 02-06** (VO schema) — chain-advance trigger is already in place; VO just needs to add `variation_orders` table; the trigger's `to_regclass` guard lifts automatically.
