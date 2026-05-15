# Plan 03-02 Summary — PTW Schema + Dispatch Trigger PTW Branch

**Status:** ✅ COMPLETE — applied live, all 11 post-apply checks pass, `app_config.ptw_qr_secret` set (32-byte hex), `ptw_enabled=false` until UI ships
**Date:** 2026-05-15
**Plan:** Phase 3 Plan 03-02 (PTW domain schema layer)

## What Was Built

The full PTW database layer: 5 tables, 9 SECURITY DEFINER functions, 1 BEFORE-INSERT lock-guard trigger, dispatch-after-approval PTW branch, pg_cron daily expiry sweep, app_config secret + feature flag, RLS, realtime. Plus TS layer mirroring SQL.

### Files Created
- `supabase/v10-ptw-schema.sql` (~410 lines) — full PTW domain
- `supabase/v10-split/3-trg-approval-ptw-branch.sql` (~150 lines) — dispatch_after_approval drop-in replacement with `ptw` branch
- `src/types.ts` extended (PtwType / PtwStatus / PTW / PtwPayload / PtwChecklistItem / PtwVersion / PermitWorker / PermitSignoff / PermitScan + PTW_TYPE_ZH + PTW_TYPE_V1 + PTW_STATUS_ZH)

### Schema Deployed (verified live, 11-row batch)
| Check | Expected | Actual |
|---|---|---|
| `ptw_tables` (permits_to_work, permit_versions, permit_workers, permit_signoffs, permit_scans) | 5 | 5 |
| `ptw_functions_secdef` (submit_ptw, close_out_ptw, activate_ptw, mint_ptw_jwt, verify_ptw_jwt, can_view_ptw, next_ptw_number, ptw_lock_guard, drain_ptw_expiry) | 9 | 9 |
| `ptw-expiry` cron schedule | `0 16 * * *` UTC (= 00:00 HKT next day) | `0 16 * * *` |
| `ptw-expiry-rehearsal` removed | OK | OK |
| `_cron_rehearsal_log` table dropped | OK | OK |
| `app_config.ptw_qr_secret` + `app_config.ptw_enabled` columns | 2 | 2 |
| `project_members.role` CHECK includes `safety_officer` | OK | OK |
| Realtime publication includes 4 PTW tables | 4 | 4 |
| Approvals view-policy has PTW branch | OK | OK |
| `dispatch_after_approval` has PTW branch | OK | OK |
| Chinese strings UTF-8 intact in `submit_ptw` | OK_utf8 | OK_utf8 |
| `app_config.ptw_qr_secret` set (32-byte hex / 64-hex-char) | OK_64bytehex | OK_64bytehex |
| `app_config.ptw_enabled` default | false | false |

## Threat-Model Coverage

| ID | Threat | Mitigation in this plan |
|---|---|---|
| **C2** | QR screenshot abuse | `mint_ptw_jwt` SECURITY DEFINER, secret stays in `app_config.ptw_qr_secret`, never returned to client. `verify_ptw_jwt` login-gated, writes `permit_scans` audit row, raises on can't-view-project. |
| **C3** | Apple re-review on PTW copy | `app_config.ptw_enabled` boolean column ready for UI gating. Default false until Plan 03-05+ UI lands. |
| **m6** | safety_officer bypass via admin | Dispatch trigger advances chain on `approve` / `admin_override` separately. Audit log distinguishes `action_type='admin_override'` from real `approve`. Sidecar table `permit_signoffs` tracks signature_pad blobs only against legitimate approvals (no admin_override). |
| **T-03-LCK** | Post-lock immutability | `trg_ptw_locked_guard` BEFORE INSERT on `permit_versions` blocks new versions when parent permit `locked_at is not null`. `activate_ptw` sets `locked_at = now()` on chain complete. |
| **T-03-FW** | Hot-work close-out before fire-watch | `close_out_ptw` RPC raises if `now() < fire_watch_started_at + interval '30 minutes'`. |
| **T-03-EXP** | Client-clock expiry tampering | Expiry is server-computed (`activate_ptw` sets `expires_at` based on `now() at time zone 'Asia/Hong_Kong'` + 23:59). pg_cron `ptw-expiry` job sweeps server-side at 16:00 UTC daily. Client clock irrelevant. |

## Key Design Decisions

- **One mint per render OR one mint per activation?** mint-per-render gates secret per-request but adds latency. Chose **on-demand client call**: client calls `mint_ptw_jwt(permit_id)` when rendering QR, caches in component state until permit status changes. Token is freshly generated each component mount; secret never crosses the network.

- **Why sidecar `permit_signoffs` table instead of column on `approvals`?** approvals is Phase-2 append-only audit table; CLAUDE.md mandates no destructive schema changes. Adding a column to approvals would touch live live data. Sidecar table is additive-only.

- **`activate_ptw` vs `locked`:** SI/VO lock on chain-complete. PTW *activates* on chain-complete (status=`active` not `locked`). Permit stays `active` until either close-out (foreman signs after 30-min fire-watch for hot_work) or expiry (pg_cron at HKT 23:59). `locked_at` is also set so `ptw_lock_guard` blocks new versions.

- **`project_members.role` CHECK extension:** safety_officer must be a valid project_members.role so `active_role_holders` returns it when chain step `required_role='safety_officer'`. Extended CHECK in same migration since orthogonal-but-related.

## Commits
- `8e34e1d` — feat(03-02): PTW schema + dispatch trigger ptw branch (SQL files)
- `0dd31cc` — feat(03-02): PTW TypeScript types + ZH label maps
- (this commit) — docs(03-02): apply confirmation + SUMMARY

## Downstream Unblocks
- **Plan 03-03 (TS context + signed-JWT helper):** PtwContext can mount on live `permits_to_work` with realtime channel `ptw-{projectId}`. `verify_ptw_jwt` RPC ready for scan flow. PtwContext.submit calls `submit_ptw`. Approval actions route through Plan 02-04's `submit_approval` RPC (already PTW-compatible via dispatch trigger).
- **Plan 03-04 (native plugins):** `@capacitor/network` already installed (Plan 03-01). Add `qrcode.react` + `react-signature-canvas` + `signature_pad`.
- **Plan 03-05 (PTW UI):** PtwSubmitForm + PtwList + PtwDetail (QR + sign timeline) + PtwApproverBar + close-out flow with fire-watch countdown.
- **Plan 03-06 (QR verify flow):** `/verify/:jwt` route calls `verify_ptw_jwt`. login-gated. shows worker photo + permit details. logs scan.
- **Plan 03-07 (admin chain config PTW tab):** AdminProjectChains has the PTW tab already (Phase 3 stub from Plan 02-08); now enable the tab actually edit + save PTW chains. Seed `[safety_officer, main_contractor]` default per ROADMAP.

## Lessons This Plan
- **Clipboard route for big SQL works fine for ASCII (base64)** — `cat file.b64 | clip.exe` + `navigator.clipboard.readText()` in browser → decode → Monaco setValue. Cleaner than 32 KB inline JS payload.
- **`document is not focused` clipboard read error:** browser must be focused on the page before `navigator.clipboard.readText()`. Click anywhere on editor first.
- **pg_cron job IDs are not stable across unschedule/schedule cycles** — verification uses `jobname` filter, not `jobid`.

## Operator Action Items (NEW)
- Set up Plan 03-01 release-signing for Play Console (`docs/android-play-store-release.md`).
- Apple-compliance regression run (still deferred from Plan 02-08).
- No action needed for ptw_qr_secret (just set with `gen_random_bytes(32)` — back up via Supabase Dashboard → Project Settings → Database if you want a copy for disaster recovery; otherwise it stays in `app_config.ptw_qr_secret` row 1).
