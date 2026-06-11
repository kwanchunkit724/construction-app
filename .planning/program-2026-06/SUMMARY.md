# Program 2026-06 — Final Summary

Model-tiered (Fable 5 plan/research/review · Opus 4.8 execute) across all 7 problems.
Every DB migration applied to prod via the SQL editor and **verified by EXECUTION**, not source.
App version bumped **1.3 → 1.4** (package.json, codemagic ×4, pbxproj ×2).

## ✅ What's done (per problem)

### 1 — DB structure + review  · DONE (research)
- `DB-STRUCTURE.md`: full table catalog + function→table matrix + Mermaid ERD + RLS map.
- `DB-REVIEW.md`: senior review. Top findings: RLS is row-level not column-level (P1-A, fixed in v38);
  `active_role_holders` treats every admin as a holder of every role (P1-B); audit gaps on metadata
  edits (P1-C, fixed in v38); migration-apply discipline (P1-D); storage 1GB is the real scaling cliff (P2-B).

### 2 — ISO 9001 for HK gov tenders · DONE (research)
- `ISO9001-RESEARCH.md` (cited). ISO 9001 is a standing requirement for the DEVB Approved Contractors list;
  the app is an operational evidence engine. Strongest today: 7.5.3 (drawing/doc control), 8.5 (SI/VO/PTW),
  9.1 (progress history). Ranked gaps: **G1 NCR/CAR**, **G2 ITP/hold-points**, **G3 controlled-document
  register** (= the file system you just got), **G4 management-review pack**. Bid narrative: DEVB TC(W)
  8/2025 mandates DWSS for >$30M works from 1 Apr 2026 — the app is a subcontractor-scale DWSS.

### 3 — 大/中/細項 rename · DONE (shipped + verified)
- Core was already shipped (EditItemModal/updateItemMeta, all 3 levels). **v38** added the polish, applied +
  execute-verified on prod: metadata edits now write an immutable `change_type='meta'` history row
  (HistoryModal shows 名稱：舊→新), and a column write-guard trigger makes title/code/dates/structure
  manager-only (closes the row-vs-column RLS hole; contributors still tick progress).

### 4 — Progress table fits project types · P1 DONE, P2/P3 remaining
- `PROGRESS-TABLE-PROJECT-TYPES.md`: per-PIC analysis (小型工程/渠務/大樓維修) + a `project_type` template design.
- **P1 (v42, applied + verified):** `projects.project_type` + a template registry + the **checklist** mode +
  **small_works auto-zone** (no more fake 分區 for a one-shop job). Backwards-compatible — existing projects
  default to `general` and render byte-identical (verified on prod).
- **REMAINING — your greenlight:** **P2** = `quantity` mode (渠務: metres laid / total, quantity-weighted
  rollup, blocked-reason) ; **P3** = `unit_status` mode (大樓維修 MBIS/MWIS: per-室 state machine + statutory
  deadline tile). Each is an additive migration + UI, same model-tiered flow. (Also: `export.ts` shows a blank
  tracking column for checklist — fold into P2.)

### 5 + 6 — File system + drawing replacement · DONE (built A–E, E2E-verified, flag OFF)
- A complete controlled-document register linked to the progress table (= finishing schedule): documents /
  versions / append-only events / counters; RPCs (number/supersede/review/withdraw); `project-docs` bucket;
  RLS per v27 membership; **id-preserving backfill** of existing drawings (blobs not moved); one-direction
  sync triggers so live v1.3 keeps working; budget-conscious push trigger.
- **#6:** when the flag is ON, the per-item 圖則 affordance becomes 文件 and "view" opens the register PDF
  (migrated drawings resolve via `bucket_id`).
- Phases: **A** schema (v40, Fable review caught 5 prod-blockers fixed pre-apply) · **B** context/flag ·
  **C** per-item UI + 圖則→文件 swap (flag-OFF pixel-parity verified) · **D** 文件總覽 page + v41 push trigger ·
  **E** E2E sim on prod (create→submit→approve→supersede→reject, RBAC denials, immutable 6-event trail).
- **flag `files_enabled` is OFF** — zero impact to live users today.

### 7 — Competitions · DONE (research)
- `COMPETITIONS-RESEARCH.md`: shortlist of HK construction-tech / proptech awards + entry strategy +
  how to be competitive. Materials needed: deck + 90-sec demo + real-usage metrics + the ISO/audit-trail story.

## ⚠️ Your follow-ups

1. **File-system go-live (gated, in order):** the flag is global. (a) let CI build 1.4, (b) submit + get
   1.4 approved on the App Store, (c) THEN flip `files_enabled` ON (server-side, no new build — PTW precedent).
   Flipping before 1.4 is live is a harmless no-op (v1.3 has no file-system code). I can flip it on your word.
2. **#4 P2/P3** — say the word and I run them (drainage quantity, then maintenance unit_status).
3. **iOS 1.4** — create the 1.4 version in App Store Connect + write 「新功能」notes (drafts available; the
   file-system note: 「新增文件總覽 — 物料送審、施工方案、圖則、檢驗記錄一站式管理，與裝修進度表逐項連結」).
4. **ISO** — highest tender value to build next: G1 NCR/CAR, then G2 ITP. Both reuse existing primitives
   (issues+chain, PTW checklist+signoff).
5. **Competitions** — pick 2–3 from the research doc; prep the deck/demo/metrics.
6. **/sell** marketing version stays v1.3 until 1.4 is live, then bump (×3 strings).

## Commits (this program, all pushed to claude/sweet-goldstine-e99977)
`5766d21` plan · `e55b4af` v38 rename + 1.4 bump · `f8bbe2c` v40 file-system A · `dcaf4c9` B ·
`9356398` C · `05682c9` D (v41 push) · `a45ec37` v42 project-types P1.

## Migrations applied + verified on prod this program
v38 (meta history + write-guard), v40 (documents register, split 1-8), v41 (documents push trigger),
v42 (project_type + checklist). All idempotent; all execute-verified.
