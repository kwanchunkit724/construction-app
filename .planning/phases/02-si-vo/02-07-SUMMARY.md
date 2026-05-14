---
phase: 02-si-vo
plan: 07
type: execute
subsystem: vo-ui
tags: [vo, react, ui, line-items, hkd, pdf-export]
requirements_completed: [VO-01, VO-02, VO-03, VO-06, VO-07, VO-08, VO-09, VO-10]
dependency_graph:
  requires: [02-04, 02-05, 02-06]
  provides:
    - VoContext (per-project VO state + realtime)
    - VoLineItemsEditor (integer-cent line-item UX)
    - VoSubmitForm + VoConfirmationScreen (server-total authoritative)
    - VoList + VoDetail pages (with PDF export)
    - SiDetail "提出變更指令" entry point
  affects:
    - Plan 02-08 (Playwright VO smoke can target /project/:id/vo flow)
    - Plan 02-09 (top-level nav can link to /project/:id/vo)
tech_stack:
  added: []
  patterns:
    - "Integer-cent HKD arithmetic via src/lib/currency.ts (parseHKD on blur → multiplyCents → formatHKD only at display boundary)"
    - "Server-total wins UX (VoConfirmationScreen re-reads total_amount_cents post-submit, never displays form-state sum)"
    - "Lazy PDF export (dynamic import of src/lib/export.exportVOToPDF keeps reports-pdf chunk out of entry)"
    - "Approval RPC for edits (approve_with_edits routes via submit_approval p_edits_jsonb — server writes vo_versions in same txn, eliminating two-write race)"
key_files:
  created:
    - src/contexts/VoContext.tsx
    - src/components/vo/VoLineItemRow.tsx
    - src/components/vo/VoLineItemsEditor.tsx
    - src/components/vo/VoSubmitForm.tsx
    - src/components/vo/VoConfirmationScreen.tsx
    - src/components/vo/VoCard.tsx
    - src/components/vo/VoList.tsx
    - src/components/vo/VoApproverBar.tsx
    - src/pages/VoList.tsx
    - src/pages/VoDetail.tsx
  modified:
    - src/App.tsx (2 new routes)
    - src/pages/SiDetail.tsx (VoProvider/ProgressProvider mount + 提出變更指令 entry point)
decisions:
  - "VoContext.canSubmit gated to admin/pm/main_contractor (VO-01: MC raises VO). subcontractor/worker/owner cannot start a VO."
  - "createDraftVo performs client-side guards (parent locked + no existing VO) before calling next_vo_number. Server (submit_vo RPC + UNIQUE(si_id) constraint) remains authoritative."
  - "VoSubmitForm direct-reads total_amount_cents from DB as fallback after refetch — realtime state may not have flushed by the time VoConfirmationScreen mounts."
  - "VoLineItemsEditor's progress_leaf_item picker is OPTIONAL and lazy-mounted (no hard dep on ProgressProvider). Pages that have ProgressContext pass items in; others can pass []."
  - "VoApproverBar's 批准並修訂 modal embeds VoLineItemsEditor (unlike SI's text-only edit modal) — VO payload is structured, so full edits are necessary, not optional."
  - "Date-range filter (VO-10) applies inclusively (00:00 of `from` through 23:59:59.999 of `to`)."
metrics:
  duration: ~45 minutes (single executor pass)
  completed: 2026-05-14
  tasks_completed: 6 of 7 (Task 7 = manual visual checkpoint, deliberately skipped per <no_blocking_checkpoint> directive — user offline)
  files_created: 10
  files_modified: 2
  commits: 6
---

# Phase 2 Plan 02-07: VO UI Summary

One-liner: Built the complete VO domain UI on top of Plan 02-06's schema — context, mobile-first line-item editor with integer-cent math, server-total-authoritative confirmation, list (with date filter), detail page with lazy PDF export, and the "提出變更指令" entry point on locked SIs.

## What shipped

### 1. VoContext (`src/contexts/VoContext.tsx` — 202 lines)
Mirror of `SiContext` with VO substitutions:
- Per-project realtime channel `vo-${projectId}` listening to `variation_orders`, `vo_versions`, and `approvals` filtered to `doc_type=vo`.
- `createDraftVo(siId)` runs client guards (parent SI exists + status=locked + no existing VO for this si_id) before `rpc('next_vo_number')`. Server enforces all three via submit_vo RPC + UNIQUE(si_id) constraint.
- `saveVersion(voId, payload)` inserts into `vo_versions`; the `recompute_vo_totals` BEFORE-INSERT trigger (Plan 02-06) overwrites subtotals + total — client-side `total_amount_cents` is throwaway.
- `submitVo(voId)` calls `submit_vo` RPC (per VO-01: validates parent locked + chain snapshot).
- `approve(voId, edits?)` routes via `submit_approval` RPC with `p_doc_type='vo'`; `approve_with_edits` passes `p_edits_jsonb`, server writes vo_versions in same txn.
- No `addProtest` — VOs don't have protest comments.

### 2. VoLineItemRow + VoLineItemsEditor
- Mobile-first stacked layout at 390px: #N + category dropdown + remove button, then description, then qty/unit on one row, then unit price, then a subtotal preview pill.
- Currency input commits on blur via `parseHKD` → integer cents; arithmetic uses `multiplyCents`; display uses `formatHKD`. **No `parseFloat` on currency strings ever flows into the payload** (P7 mitigation).
- Optional `🔗 連結進度` button opens a leaf-only progress-item picker modal (D-20). Leaves derived via `isLeaf(item, allItems)` from `src/types.ts`.
- `VoLineItemsEditor` renders the list, an empty state ("尚未有項目" + 新增項目), a `+ 新增項目` button after the list, and a sticky footer "經系統核算總額 (預覽) HK$X.XX" with the caveat "*提交後以系統核算為準" so users understand the client preview is non-authoritative.
- Exports `validateLineItems(items)` returning a Chinese error string or `null` for use by VoSubmitForm + VoApproverBar.

### 3. VoSubmitForm + VoConfirmationScreen
- VoSubmitForm: bottom-sheet modal (mobile) → desktop centred dialog. Description textarea (4000 chars max) + VoLineItemsEditor + sticky footer with 取消/提交.
- Submit flow: `createDraftVo` → `saveVersion` → `submitVo` → `refetch` → fallback direct-read of `total_amount_cents` if state hasn't flushed → `onSubmitted(voId, serverTotal)`.
- VoConfirmationScreen: large green check icon, `變更指令 VO-NNN 已提交`, then a bordered box with label `經系統核算總額` and the total in `text-2xl font-bold tabular-nums`. Tiny caveat below: "(以系統計算為準)".
- The total displayed is **always** the server-computed `total_amount_cents` re-read after submit — never the form's client-side sum. Mitigates T-02-05b (client claims fake total visually).

### 4. VoCard + VoList + VoApproverBar
- VoCard: status pill (VO_STATUS_ZH) + number + relative time + bold HKD total (`tabular-nums`) + parent SI number reference + step counter when in_review.
- VoList: 由/至 date pickers above the status pills (VO-10). Filters compose: status pill AND date range AND search by VO number.
- VoApproverBar: identical 4-button layout to SiApproverBar (批准 / 批准並修訂 / 退回 / 拒絕) + admin-override fallback when admin is outside the active role. The 批准並修訂 modal embeds `VoLineItemsEditor` pre-filled with the latest version's payload, calls `approve(voId, editedPayload)` on save — server writes new vo_versions row via submit_approval RPC.

### 5. VoList + VoDetail pages + routes
- `src/pages/VoList.tsx` mounts `SiProvider` + `ProgressProvider` + `VoProvider`. Includes a "select parent SI" picker that filters to **only locked SIs without an existing VO**.
- `src/pages/VoDetail.tsx`: header with status pill + number + bold total + parent SI ref; tabs 詳情 / 版本歷史 / 簽核紀錄 (no protest tab); 匯出 PDF button visible only when status=locked.
- PDF export: dynamic `import('../lib/export')` keeps the reports-pdf chunk lazy. Fetches parent SI's drawing_version_ids → DrawingVersion rows → passes to `exportVOToPDF`. The 簽核紀錄 tab and PDF approval timeline both use `APPROVAL_ACTION_ZH` mapping.
- Routes wired in `src/App.tsx`: `/project/:id/vo` and `/project/:id/vo/:voId` — both `<ProtectedRoute>`-wrapped.

### 6. SiDetail entry point
- `SiDetail.tsx` now wraps `SiDetailInner` in `<ProgressProvider><VoProvider>` to read existing VOs and progress items.
- When `si.status === 'locked'`:
  - If no VO exists yet AND user is admin/pm/main_contractor → show `提出變更指令` button (btn-primary). Opens `<VoSubmitForm parentSi={si} progressItems={progressItems}>`.
  - If a VO exists → show `已有變更指令 VO-NNN →` link (btn-ghost) to `/project/:id/vo/:voId`.
- On submit, switches to `<VoConfirmationScreen>`; "查看詳情" navigates to the new VO.

## Bundle-size delta

| Stage                                   | Entry chunk | Delta |
|-----------------------------------------|-------------|-------|
| Baseline (after Plan 02-06)             | 576.5 KB    | —     |
| After Plan 02-07 Task 5 (pages + routes)| 613.3 KB    | +36.8 KB |
| After Plan 02-07 Task 6 (SiDetail wire) | 614.3 KB    | +37.8 KB |

- **800 KB CI limit:** 23% headroom remaining.
- `reports-pdf` chunk: **unchanged at 382.3 KB** (lazy import preserved — PDF export only loaded on tap).
- `reports-pdf-autotable` chunk: unchanged at 30.4 KB.
- `viewer-pdf` chunk: unchanged at 460.0 KB.
- Noto Sans HK font (~186 KB from Plan 02-06): stays in `public/fonts/` and loaded by `ensureChineseFont(doc)` inside the lazy export chunk — never reaches the entry bundle.

## Line-item arithmetic verification

End-to-end manual verification was deferred (Task 7 checkpoint skipped per executor directive, user offline). However, the arithmetic chain is structurally verified:

1. **Client preview path:** `parseHKD(str) → integer cents → multiplyCents(qty, unitPriceCents) → formatHKD(cents)`. All steps use `Math.round` defensively at the final cent. No `parseFloat` flows into `unit_price_cents`.
2. **Server-side trigger:** Plan 02-06's `recompute_vo_totals` BEFORE-INSERT trigger on `vo_versions` recomputes `subtotal_cents = quantity_cents * unit_price_cents` then `total_amount_cents = SUM(subtotal_cents)` server-side (Postgres bigint).
3. **Discrepancy handling:** VoConfirmationScreen re-reads `variation_orders.total_amount_cents` post-submit (state refetch + direct query fallback), so any discrepancy is **silently corrected** by displaying the server value. Users see "經系統核算總額" with the server figure, never the form sum.

Recommended client-preview test cases for the eventual visual smoke (Plan 02-08):
| 類別 | Qty | Unit | Unit price | Expected subtotal |
| --- | ---: | --- | ---: | ---: |
| 人工 | 10 | 人日 | HK$200.00 | HK$2,000.00 |
| 物料 | 1 | 批 | HK$5,000.00 | HK$5,000.00 |
| 暫定 | 1 | 批 | HK$1,000.00 | HK$1,000.00 |
| **Total** | | | | **HK$8,000.00** |

The client preview must equal the server total to the cent. If they differ, the server figure wins in VoConfirmationScreen.

## PDF rendering

PDF export uses the helper shipped in Plan 02-06 (`exportVOToPDF`):
- Noto Sans HK subset already vendored under `public/fonts/` and registered as PDF font `NotoHK`.
- All zh-HK strings (`變更指令`, `經系統核算總額`, `項目`, `批准 / 退回 / 拒絕 / 管理員介入` via `APPROVAL_ACTION_ZH`) render through this font.
- Drawing thumbnails fetched via `supabase.storage.createSignedUrl('project-drawings', file_path, 300)` — RLS enforces visibility; missing thumbnails are silently skipped (T-02-DPDF mitigation).

End-to-end PDF visual verification (header / line-items / timeline / Chinese rendering) deferred to a future browser session.

## zh-HK rendering on 390px

All new VO components were built with 390px-first Tailwind classes (`grid-cols-2 gap-2` for qty/unit, single-column stacking for description/price, full-width sticky footer). Long zh-HK descriptions wrap via `whitespace-pre-wrap break-words`. Category labels (人工/物料/前期費用/暫定) are short enough to fit the dropdown without truncation. No visual smoke run was performed — this is documented as a follow-up in Plan 02-08.

## Threat-model mitigations applied (from PLAN frontmatter)

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-02-05b | VoConfirmationScreen reads serverTotal from refetched VO row, never form state. PDF exports `vo.total_amount_cents` directly. |
| T-02-03b | All approvals go through `submit_approval` RPC — FOR UPDATE row-lock from Plan 02-04 protects against concurrent approvers. |
| T-02-04d | VoApproverBar checks `profile.global_role === 'admin'` to show 管理員介入. Server enforces via submit_approval. |
| T-02-DPDF | Drawing thumbnails fetched via signed URL respecting bucket RLS — wrap-around try/catch silently skips missing thumbs. |
| T-02-VO-PARENT | `createDraftVo` rejects if parent SI status !== 'locked'. Server `submit_vo` re-checks. |
| T-02-FLOAT | All HKD math through `src/lib/currency.ts` integer-cent helpers — no `parseFloat` on currency in payload path. |

## Deviations from plan

### Auto-fixed Issues
None. The plan executed exactly as written for Tasks 1–6.

### Task 7 (visual checkpoint) — deferred
The orchestrator's `<no_blocking_checkpoint>` directive instructed the executor to skip Task 7's `checkpoint:human-verify` step since the user is offline. The visual smoke + PDF download verification is deferred to the next interactive session or to Plan 02-08 (Playwright E2E).

## Known Stubs

None. All UI surfaces wire to real VoContext mutations against the live Plan 02-06 schema and Plan 02-04 submit_approval RPC.

## Self-Check

- [x] `src/contexts/VoContext.tsx` exists
- [x] `src/components/vo/VoLineItemRow.tsx` exists
- [x] `src/components/vo/VoLineItemsEditor.tsx` exists
- [x] `src/components/vo/VoSubmitForm.tsx` exists
- [x] `src/components/vo/VoConfirmationScreen.tsx` exists
- [x] `src/components/vo/VoCard.tsx` exists
- [x] `src/components/vo/VoList.tsx` exists
- [x] `src/components/vo/VoApproverBar.tsx` exists
- [x] `src/pages/VoList.tsx` exists
- [x] `src/pages/VoDetail.tsx` exists
- [x] `src/App.tsx` has `/project/:id/vo` and `/project/:id/vo/:voId` routes
- [x] `src/pages/SiDetail.tsx` has `提出變更指令` button + `VoProvider` mount
- [x] tsc --noEmit green
- [x] npm run build:check green; entry chunk 614.3 KB < 800 KB limit
- [x] All 6 task commits present in git log (dc46f13, b137d89, 487a908, 02cc781, a5318ca, 501215c)

## Self-Check: PASSED
