# Plan 02-04 Summary — TS Types + lib helpers + SiContext + DelegationsContext + submit_approval RPC

**Status:** ✅ COMPLETE — RPC live on Supabase; all 7 verifications effectively pass
**Date:** 2026-05-14
**Plan:** 02-04-PLAN.md
**Phase:** 02-si-vo

## What Was Built

The TypeScript glue layer between the live SI domain (Plan 02-02) and the upcoming SI UI (Plan 02-05): types + ZH labels, currency/diff/osm-tile lib utilities, SI storage helpers for the private `project-si-vo` bucket, `SiContext` (per-project state + realtime), `DelegationsContext` (per-user CRUD), and the **`submit_approval` RPC** — the chain-write gate that all approval actions must go through (direct INSERT to `approvals` is denied at the RLS level).

### Files Created / Modified
- `src/types.ts` — appended `SiteInstruction`, `SiVersion`, `ProtestComment`, `Approval`, `ApprovalChainStep`, `Delegation`, `NotificationCounter`, `NotificationDigest` types + ZH maps (`SI_STATUS_ZH`, `APPROVAL_ACTION_ZH`, `DOC_TYPE_ZH`).
- `src/lib/currency.ts` — HKD `formatHKD()` + `parseHKD()` + cents↔dollars conversion.
- `src/lib/diff.ts` — diff-match-patch wrappers (`diffWords()`, `renderDiffHtml()`) for SI version diff card.
- `src/lib/osm-tile.ts` — static OSM tile URL builder for GeoPicker preview (no key required).
- `src/lib/si.ts` — SI storage helpers: `uploadPhoto()`, `uploadVoice()`, `getSignedUrl()`, path builders (`{project_id}/si/{si_id}/v{n}/...`).
- `src/contexts/SiContext.tsx` — per-project state + `postgres_changes` realtime channel `si-{projectId}` + mutations (`createDraft`, `update`, `submit`, `addProtest`).
- `src/contexts/DelegationsContext.tsx` — per-user CRUD over `delegations` table.
- `supabase/v9-rpc-submit-approval.sql` — `submit_approval(p_doc_type, p_doc_id, p_action_type, p_reason, p_edits_jsonb)` SECURITY DEFINER plpgsql RPC (147 lines).

### `submit_approval` RPC — design highlights
- **plpgsql + EXECUTE for VO branch** — `variation_orders` ships in Plan 02-06; until then, branch uses `to_regclass()` guard + EXECUTE so this function compiles cleanly today. Lesson from Plan 02-01 applied.
- **FOR UPDATE lock** on the doc row prevents concurrent-approver race (T-02-03).
- **Reason CHECK ≥10 chars** for `request_revision`, `reject`, `admin_override` (defence-in-depth UX; table CHECK is the authoritative one).
- **Admin override path** — only `global_role='admin'` users can submit `admin_override`.
- **Optional-user step enforcement** — if `chain_snapshot[i].optional_user_id` is set, only that user (or admin) can act on that step.
- **Delegation tracking** — if caller acts via an active delegation, the row's `delegated_for_user_id` is set to the grantor.
- **BLOCKER 1 fix (audit chain integrity)** — `approve_with_edits` writes the new `si_versions` row server-side INSIDE the same transaction as the `approvals` INSERT. SECURITY DEFINER bypasses `si_versions` RLS so the audit chain cannot have a versions row without its corresponding approvals row. Removes the two-write race window that would otherwise live in `SiContext`.
- **Chain advance is delegated** to the `trg_approval_created` trigger (Plan 02-02) — `submit_approval` just inserts the audit row; the trigger handles state machine + push fan-out.

### Schema Deployed (verified live, Chrome MCP, 7-row + extended batch)
| Check | Expected | Actual |
|---|---|---|
| function exists, SECURITY DEFINER, plpgsql, returns uuid | OK | OK (`lanname=plpgsql`, `prosecdef=t`, `rettype=uuid`) |
| `search_path = public` locked | OK | OK |
| `authenticated` can execute | true | true |
| `public` revoked | true | true |
| Chinese `'你冇權批准'` UTF-8 intact | OK_utf8 | OK_utf8 |
| Chinese `'10 個字元'` UTF-8 intact | OK_utf8 | OK_utf8 |
| plpgsql + EXECUTE pattern for VO forward-ref | OK | OK |

(Note: the initial single-line `prolang::regtype::text='plpgsql'` check returned the OID `13619` due to a regtype-cast display quirk on this Postgres version; direct `pg_proc JOIN pg_language` confirmed `lanname=plpgsql` — function is correctly configured.)

## Commits
- `1de10c3` — task 1: Phase 2 SI/Approval/Delegation types + ZH maps
- `56cfcc0` — task 2: currency / diff / osm-tile lib helpers
- `6c101f7` — task 3: SI storage helpers (project-si-vo bucket)
- `d14108d` — task 4: submit_approval RPC (chain-write gate)
- `687df44` — task 5: SiContext (per-project SI state + realtime + mutations)
- `411b3ed` — task 6: DelegationsContext (per-user delegation CRUD)
- (task 7: bundle CI guard verified at 507.6 KB / 800 KB — no file changes)
- `(this commit)` — task 8: live apply confirmation + SUMMARY + state

## Threat Model Coverage
- **T-02-03 (concurrent-approver race):** `select ... for update` on doc row in `submit_approval` serializes approvals on the same SI/VO.
- **T-02-04 (audit chain integrity / BLOCKER 1):** `approve_with_edits` writes `si_versions` inside the same transaction as `approvals` INSERT under SECURITY DEFINER. No client-side two-write race window.
- **T-02-AUTH (unauthorized approver):** RPC validates caller is in `active_role_holders(project_id, required_role)` (or admin, or optional_user_id match) before allowing INSERT.
- **CHN-04 (state machine):** RPC defers transitions to `trg_approval_created` — single source of truth.
- **CHN-06 (chain-write gate):** Direct INSERT on `approvals` is RLS-denied (`with check (false)` from Plan 02-01/02-02). Only the SECURITY DEFINER RPC can write.
- **CHN-10 (delegation tracking):** RPC populates `delegated_for_user_id` when caller acts via delegation, preserving the original grantor in the audit log.
- **CHN-11 (append-only approvals):** No UPDATE / DELETE on `approvals`. RPC only inserts.

## Build Health
- `tsc --noEmit` — clean
- `npm run build:check` — passed; entry chunk **507.6 KB** (< 800 KB CI guard ✅)

## Requirements Satisfied
**SI-01** (draft creation context), **SI-03** (storage helpers + signed URLs), **SI-05** (RLS-aware reads), **SI-07** (diff utilities), **SI-08** (approval action context), **SI-11** (protest comment context). **VO-04** (server-side approval writes wrapped for future VO). **CHN-04** (state machine via trigger), **CHN-06** (chain-write gate), **CHN-10** (delegation in audit row), **CHN-11** (append-only enforced). **INF-03** (extended with SI/delegations context helpers).

## Downstream Unblocks
- **Plan 02-05** (SI UI) — SiContext + types + storage helpers + diff util are all in place. UI can mount.
- **Plan 02-06** (VO schema) — when `variation_orders` table lands, `submit_approval`'s VO branch auto-activates (the `to_regclass` guard lifts).
- **Plan 02-07** (VO UI) — gets `submit_approval` for VO actions for free.
- **Plan 02-08** (Admin chain config) — DelegationsContext already provides the data layer for the delegations UI on Profile.

## Lessons Captured This Plan
- **Postgres regtype display quirk on `prolang::regtype::text`** can return the OID number rather than `'plpgsql'` text. For language verification use `pg_proc JOIN pg_language l ON p.prolang = l.oid` and check `l.lanname`. Captured in future verification query templates.
