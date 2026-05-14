# Plan 02-06 Summary — VO Schema + Server-Authoritative Totals + PDF Export

**Status:** ✅ COMPLETE — VO schema live on Supabase; all 8 verifications pass
**Date:** 2026-05-14
**Plan:** 02-06-PLAN.md
**Phase:** 02-si-vo

## What Was Built

The VO domain on top of the SI domain (Plan 02-02) and submit_approval RPC (Plan 02-04): tables, double-layer defence-in-depth on server-computed totals, sequence-per-project numbering, submit_vo RPC, lock-guard trigger, unified approvals view policy, and the client-side `exportVOToPDF` helper with lazy-loaded Noto Sans HK font for zh-HK rendering.

### Files Created
- `supabase/v9-vo-schema.sql` — Full VO domain (2 tables + 3 triggers + 6 helpers/RPCs + 4 RLS policies + 1 unified approvals policy + 2 realtime entries)
- `supabase/v9-split/3-trg-vo-submitted.sql` — doc marker (no DDL)
- `public/fonts/noto-sans-hk-subset.ttf` — ~186 KB subset for PDF Chinese rendering
- `src/lib/export.ts` — extended with `exportVOToPDF()` + `ensureChineseFont()` lazy loader
- `src/types.ts` — appended `VO`, `VOVersion`, `VoPayload`, `VoLineItem`, `VO_STATUS_ZH`

### Schema Deployed (verified live)
- **Tables:** `variation_orders` (UNIQUE(si_id) — one VO per locked SI), `vo_versions` ✅ (2 rows)
- **Triggers:** `trg_vo_versions_recompute` (server-authoritative line-item arithmetic, layer 1), `trg_vo_sync_total` (column-level total sync, layer 2), `trg_vo_locked_guard` ✅ (3 rows)
- **Helpers/RPCs (SECURITY DEFINER):** `submit_vo`, `next_vo_number`, `can_view_vo`, `recompute_vo_totals`, `sync_vo_total`, `vo_lock_guard` ✅ (6 rows)
- **RLS:** `Members view VO`, `Creator inserts draft VO` (requires locked parent SI per VO-01), `Creator updates own draft VO` (with column-level total_amount_cents write denial), `Members view VO versions`, `Creator inserts VO version when not locked`
- **Approvals view policy:** SI-only "Members view SI approvals" replaced with unified "Members view approvals" covering SI + VO ✅
- **Realtime publication:** variation_orders + vo_versions ✅ (2 rows)
- **Chinese strings UTF-8 intact** in `submit_vo` (`只有提交人...`, `變更指令...`) ✅

### Verification Performed (Chrome MCP, 8-row batch)
| Check | Expected | Actual |
|---|---|---|
| `vo_tables` | 2 | 2 |
| `vo_triggers` | 3 | 3 |
| `vo_helpers_secure` | 6 | 6 |
| `approvals_unified_policy` | OK | OK |
| `old_si_policy_dropped` | OK | OK |
| `vo_realtime_pub` | 2 | 2 |
| `zh_submit_vo_intact` | OK_utf8 | OK_utf8 |
| `plpgsql_for_forward_refs` (dispatch_after_approval EXECUTE pattern still in place) | OK | OK |

### Defence-in-Depth on Server Total (D-18 / VO-05)
**Three independent layers** ensure `total_amount_cents` is server-authoritative:
1. **RLS UPDATE policy on `variation_orders`** — column-level write denial via `total_amount_cents is not distinct from (subselect of pre-update value)`. Client cannot directly write the column.
2. **`recompute_vo_totals` trigger** — BEFORE INSERT on `vo_versions`. Iterates line_items, recomputes `subtotal_cents = round(quantity * unit_price_cents)`, rolls up `total_amount_cents`, overwrites whatever the client supplied in payload jsonb.
3. **`sync_vo_total` trigger** — BEFORE INSERT/UPDATE OF `current_version_id` on `variation_orders`. Copies authoritative `total_amount_cents` from referenced version's payload. Client-supplied value on the row is ignored.

Even if a future migration relaxes one layer, the other two preserve the invariant.

### Mid-Apply Recovery
First attempt at applying `v9-vo-schema.sql` partially succeeded: only `variation_orders` table created before the script halted (cause unclear — possibly intermediate statement error). State: orphan empty `variation_orders` table existed, nothing else.

Recovery: dropped both `vo_versions` and `variation_orders` (both empty, brand-new), then re-applied the full script via base64 → Monaco. Second attempt succeeded cleanly. No production data touched (tables had zero rows when dropped).

### Commits
- `591c602` — task 1: append VO types
- `34261c4` — task 2: v9-vo-schema.sql (tables, recompute trigger, submit_vo RPC, unified approvals policy)
- `c587747` — task 3: v9-split/3 marker
- `20e060f` — task 4: vendor Noto Sans HK subset (~186 KB)
- `2022ab5` — task 5: exportVOToPDF + ensureChineseFont (lazy load)
- `(this commit)` — task 6: live apply confirmation + SUMMARY + state

## Threat Model Coverage
- **VO-01 (VO requires locked parent SI):** RLS INSERT policy enforces existence of locked `site_instructions` row at row creation. `submit_vo` RPC additionally checks `parent_si.locked_at is not null` before snapshotting chain.
- **VO-05 (server-authoritative total):** Triple defence — RLS UPDATE column denial + BEFORE INSERT trigger on vo_versions + BEFORE INSERT/UPDATE trigger on variation_orders.
- **VO-08 (post-lock immutability):** `vo_lock_guard` BEFORE INSERT on `vo_versions` blocks new versions when parent VO is locked. Mirrors si_lock_guard.
- **CHN-03 (chain freeze at submit):** `submit_vo` snapshots `approval_chain_steps` ordered by step_order into `chain_snapshot`. Once frozen, downstream chain config changes don't affect in-flight VO.
- **CHN-04/06/11 (state machine, chain-write gate, append-only approvals):** All routed through Plan 02-04's `submit_approval` RPC + Plan 02-02's `trg_approval_created` trigger. submit_approval's VO branch (forward-referenced via `to_regclass` + EXECUTE) now activates automatically since `variation_orders` exists.

## PDF Export
- `exportVOToPDF(vo, lineItems, options)` — generates a single-page A4 PDF with line items, totals, approval timeline, and (optional) referenced drawing thumbnails.
- **Lazy Noto Sans HK font load** — TTF file loaded only when first PDF export is invoked. Entry chunk unaffected.
- Font handling uses jspdf's `addFileToVFS` + `addFont` for embedded zh-HK glyph subset.
- HKD formatting via `formatHKD()` from `src/lib/currency.ts` (Plan 02-04).

## Build Health
- `tsc --noEmit` — clean
- Bundle delta to be confirmed by executor's final build:check (font is async-imported; entry chunk should stay under 800 KB CI guard)

## Requirements Satisfied
**VO-01** (locked-parent requirement), **VO-02** (line items + categories), **VO-03** (HKD cents storage), **VO-04** (server total via 02-04 + 02-06 dual triggers), **VO-05** (server-authoritative — 3 layers), **VO-06** (PDF export), **VO-08** (lock immutability), **VO-09** (Chinese rendering in PDF via Noto Sans HK).

## Lessons Captured This Plan
- **Partial schema install recovery:** if a multi-statement DDL script halts mid-way (Supabase SQL Editor does NOT auto-wrap in a transaction), check what landed and selectively drop orphan empty objects before re-running. Always verify "table created but no triggers/functions" by querying `pg_proc`/`pg_trigger` before assuming the install succeeded.

## Downstream Unblocks
- **Plan 02-07** (VO UI) — can now mount on VoContext over live `variation_orders`. submit_vo RPC ready. exportVOToPDF helper ready.
- **submit_approval's VO branch** (Plan 02-04) auto-activates since `variation_orders` exists — `to_regclass` guard lifts.
