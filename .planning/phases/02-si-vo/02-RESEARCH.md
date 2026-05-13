# Phase 2: SI / VO (工地指令 + 變更指令) — Research

**Researched:** 2026-05-13
**Domain:** Append-only sequential approval-chain workflow on Supabase Postgres + RLS + Realtime + OneSignal push, surfaced through a React + Capacitor 8 mobile-first SPA. Shared chain infrastructure that Phase 3 (PTW) reuses verbatim.
**Confidence:** HIGH on stack reuse and DB shape (Phase 1 + CONTEXT.md lock 90% of choices); MEDIUM on `capacitor-voice-recorder` Cap-8 compat and on pg_cron quota under Supabase Free; LOW on OneSignal `/notifications` digest fan-out behaviour at burst.

---

## Summary

Phase 2 stands up two append-only documents (SI and VO) on top of a **shared approval-chain spine** (`approval_chain_steps` + `approvals` + `delegations` + `notification_counters` + `notification_digest`) that Phase 3's PTW will reuse without schema changes. Every architectural primitive has a direct Phase 1 precedent: `DrawingsContext` → `SiContext`/`VoContext`; `v8-private-bucket-template.sql` → `project-si-vo` bucket; `rls-smoke.sql` → extended with SI/VO/chain personas; `src/lib/export.ts` → `exportVOToPDF`; existing `v5-split/` push pattern → new SI/VO triggers in `supabase/v9-split/` style; `delete_my_account` (v6) → extended to block on in-flight approvals.

The single biggest piece of new infrastructure is the **push fan-out + fatigue cap + 08:00 HKT digest**: a SECURITY DEFINER `push_dispatcher(target_user_id, payload)` function that atomically increments `notification_counters` and either calls OneSignal via `pg_net` OR appends to `notification_digest` swept by a `pg_cron` job. This is also the highest-risk part of the phase.

**Primary recommendation:** Build the shared chain spine first (Wave 0). Layer SI on the spine (Waves 1–2). Layer VO on top of SI (Wave 3). Add chain admin + delegation + account-deletion guard (Wave 4). Close with Playwright smoke + walkthrough (Wave 5). Resist modelling SI and VO as one polymorphic table — they share the *spine*, not the *payload*. The Phase 1 9-plan / 5-wave shape transfers directly.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

29 decisions are locked in `02-CONTEXT.md` (D-01..D-29). Verbatim summary by axis:

**Approval-chain infrastructure (shared with Phase 3):**
- **D-01:** Chain config table = `approval_chain_steps(project_id, doc_type, step_order, required_role, optional_user_id)` — NOT JSONB on `projects`. Matches CHN-02 verbatim. Indexed by `(project_id, doc_type, step_order)`.
- **D-02:** Snapshot pattern: at submission time the chain rows are copied into `<doc>.chain_snapshot jsonb` (CHN-03). Mid-flight chain edits do not retroactively affect in-flight docs.
- **D-03:** **Append-only `approvals` table** with columns `(id, doc_type, doc_id, step_order, action_type, actor_id, reason, edits_jsonb, created_at)`. `action_type ∈ {approve, approve_with_edits, request_revision, reject, admin_override, delegate}`. Doc status is computed from `approvals` rows, never stored. Rejection is a new row, never a mutation (CHN-11).
- **D-04:** Next-actor resolution = SQL helper `active_role_holders(project_id, required_role)` returning `(user_id)` SET — handles user departure mid-chain (CHN-05). Resolved at **action time**, not submission time.
- **D-05:** `admin_override` requires `length(reason) >= 10` (CHN-06) — enforced as table-level CHECK on `approvals`. Override is a distinct `action_type` and does NOT count as the required step's signoff (Phase 3 enforces this strictly for safety_officer; Phase 2 keeps the same semantics for SI/VO).

**Push fatigue cap (3/user/day across SI/VO/PTW):**
- **D-06:** Implementation = Postgres `notification_counters(user_id, hkt_date, count)` row, atomically incremented by a `push_dispatcher` SECURITY DEFINER function. If `count >= 3` after increment, the notification body is appended to `notification_digest(user_id, hkt_date, items_jsonb)` instead. **Recommended over OneSignal-side filters** because counter state must include OneSignal failures and pg-cron retries.
- **D-07:** Daily digest = `pg_cron` job at `0 0 * * *` UTC (i.e. 08:00 HKT). Sends one OneSignal push per user with the aggregated `items_jsonb`. Edge function not needed in v1 (no fan-out beyond ≤200 internal users).
- **D-08:** All notifications still flow through the existing `supabase/v5-split/` trigger pattern → `push_dispatcher` wrapper → OneSignal v1 `/notifications` API. Reuse `external_user_id = auth.user.id`.

**SI capture UX:**
- **D-09:** SI submission form (mobile-first, 390px): 標題 (≤120 chars, required), 描述 (≤4000 chars, required), 圖則參照 (multi-select drawing picker; defaults to current `drawing_versions` row, badge `v{n} (提交時最新)`; stores `drawing_version_id`), 相片 (optional multi-image; reuse Phase 1's private-bucket pattern; new bucket `project-si-vo`, path `{project_id}/si/{si_id}/v{n}/photos/{filename}`), 語音備忘 (optional single recording, AAC `.m4a` 48 kbps mono, ≤2 min, `@capacitor-community/voice-recorder` OR browser `MediaRecorder`, path `{project_id}/si/{si_id}/v{n}/voice.m4a`, ≤5 MB), 位置 (optional `@capacitor/geolocation` capturing `(lat, lng, accuracy_m)` at submit; static OSM tile thumbnail; no live map in v1).
- **D-10:** Auto-numbering `SI-001`, `SI-002`… per-project via Postgres sequence-per-project pattern (helper `next_si_number(project_id) returns text`). Atomic — uses `pg_advisory_xact_lock(project_id)` to avoid duplicate numbers under concurrent submission.
- **D-11:** Each SI row mirrors Phase 1's drawings pattern: `site_instructions(id, project_id, number, current_version_id, created_by, created_at, locked_at)` + `si_versions(id, si_id, version_no, payload jsonb, edits_by, created_at)`. SI body is JSONB inside `si_versions.payload` (title, description, drawing_version_ids[], photo_paths[], voice_path, lat, lng, accuracy_m) — never edited in-place (SI-05).

**Approver UX:**
- **D-12:** Approver detail screen shows: SI metadata header, latest payload, **diff card** comparing latest payload vs payload at previous version (field-by-field labelled diff — title 舊→新, description with line-level `+/-`, drawing-version pin changes highlighted). No git-style hunks (subcon-friendly).
- **D-13:** Four action buttons (always visible): `✓ 批准`, `✏ 批准並修改`, `↩ 退回 (要求修訂)`, `✗ 拒絕`. 批准 → writes `approvals` row, no payload change, advances chain. 批准並修改 → opens inline editor pre-filled with current payload; on save, creates new `si_versions` row + `approvals.action_type='approve_with_edits'` + advances chain. Subcon sees diff next time they open. 退回 → requires `reason ≥ 10 chars`; resets chain to step 0 (subcon must re-submit). Records `request_revision` row. 拒絕 → requires `reason ≥ 10 chars`; terminal state — no further actions allowed. Records `reject` row.
- **D-14:** Subcon-side protest comment (SI-09) = simple text-only append after lock; rendered in the timeline but does NOT change status or notify approvers (audit-only). Field on `protest_comments(si_id, author_id, body, created_at)`.

**Approval-chain admin UI:**
- **D-15:** Per-project admin page `/admin/projects/:id/chains` with tab picker `[SI | VO | PTW]`. Each tab shows the ordered chain steps with drag-handle to reorder, `required_role` dropdown (pm / main_contractor / subcontractor / safety_officer / owner) + `optional_user_id` autocomplete (optional override), "+ Add step" / trash icons. Save writes all rows in one transaction (delete-then-insert by `(project_id, doc_type)` acceptable in v1 because chain edits are rare and `chain_snapshot` already protects in-flight docs).
- **D-16:** Default chain template (auto-seeded on first project creation): **SI**: `[main_contractor, pm]` (2 steps); **VO**: `[main_contractor, pm, owner]` (3 steps); **PTW**: `[safety_officer, main_contractor]` (2 steps — Phase 3). Admin can modify per-project from day one.

**VO data model + UX:**
- **D-17:** `variation_orders(id, si_id UNIQUE, project_id, number, current_version_id, total_amount_cents bigint, created_by, locked_at)` — `UNIQUE(si_id)` enforces v1 cap "one VO per SI". `total_amount_cents` is a **Postgres GENERATED ALWAYS AS (...)** column summing the latest `vo_line_items` snapshot inside `vo_versions.payload` (VO-05). Client cannot write it (column denial via RLS).
- **D-18:** `vo_line_items` lives inside `vo_versions.payload jsonb` as an array (no separate table) — same pattern as SI. Each item: `{category: 'labour'|'material'|'preliminaries'|'contingency', description, quantity numeric, unit text, unit_price_cents bigint, subtotal_cents bigint, progress_leaf_item_id uuid|null}`. Trigger on `vo_versions` recomputes each `subtotal_cents = round(quantity * unit_price_cents)` and the rolled-up `total_amount_cents` before insert (defence in depth alongside the generated column).
- **D-19:** VO submit confirmation screen displays the server total prominently as **"經系統核算總額 HK$X"** (VO-06). Same line is the source of truth for the PDF export and any downstream payment claim integration.
- **D-20:** progress_leaf_item linkage per line item = optional modal picker showing the project's progress tree (reuse `ProgressContext.items`). Used downstream for cost-attribution rollup — not exposed in v1 dashboards but data is captured now.

**VO PDF export:**
- **D-21:** Generated **client-side** with existing `jspdf` + `jspdf-autotable` (already in `src/lib/export.ts`). New helper `exportVOToPDF(vo, version, drawings)`. Recommended over server-side puppeteer to avoid an Edge function and to keep export latency low.
- **D-22:** PDF layout (A4 portrait, zh-HK): Header (project, VO number, status badge, approval timeline table); Section 1 (SI reference + locked SI summary); Section 2 (line items table per category via `autoTable`); Section 3 (經系統核算總額 large, bold); Section 4 (drawing thumbnails — fetch signed URL → blob → base64 PNG ≤200 KB resized client-side; cap 6 thumbnails per page; paginate if more); Footer (generated-at timestamp + system disclaimer).

**Delegation (CHN-10):**
- **D-23:** Self-service delegation lives in **Profile page** as new section `我嘅代理 / 我是…的代理`. User picks delegate (autocomplete of project members) + date range (valid_from / valid_until, dates only — HKT day boundaries). Writes to `delegations(user_id, delegate_to, valid_from, valid_until)`.
- **D-24:** `active_role_holders()` checks `delegations` at action time: if the resolved user has an active delegation, the chain step is offered to the delegate instead. Both original + delegate names are stamped — delegate is the actor; `delegated_for_user_id` is a column on `approvals`.
- **D-25:** Account deletion (`delete_my_account` RPC, Apple compliance) **blocks** with Chinese-friendly error if `in_flight_approvals(user_id) > 0` (CHN-09). Admin "force delete" via re-routing flow: admin selects another role-holder or sets a delegation, then deletion proceeds (logged as `admin_override`).

**Realtime + RLS:**
- **D-26:** Realtime publication adds: `site_instructions`, `si_versions`, `variation_orders`, `vo_versions`, `approvals`, `delegations` — so approver and subcon screens auto-refresh on transitions.
- **D-27:** RLS helpers `can_view_si(uid, si_id)` and `can_view_vo(uid, vo_id)` = SECURITY DEFINER, mirror Phase 1's `can_view_project`. Visibility: SI = project members (approved `project_members` + admin + PM in `assigned_pm_ids`); VO same as parent SI; approvals = anyone who can view parent doc; chain config + delegations = visible to project members, writable by admin/PM only.

**Bundle discipline (carry forward from Phase 1):**
- **D-28:** Add `manualChunks` entries for VO PDF export (`jspdf` + `jspdf-autotable` — already chunked from Phase 1's INF-06; verify entry chunk stays <800 KB). Voice recorder code (Capacitor plugin) lives in main bundle (small).
- **D-29:** Bundle-size CI guard from Phase 1 stays. Phase 2 plans must not regress entry chunk >800 KB.

### Claude's Discretion

- Diff-card visual style (colour, spacing) — design contract in `/gsd-ui-phase 2`
- Voice recorder waveform vs. simple `0:00 / 2:00` counter — UI phase decides
- Geolocation tile provider (OSM vs. static thumbnail vendor) — researcher recommends OSM static tile (§3)
- Push notification deep-link URL shape — extend existing `#/...` hash router; exact shape decided by planner

### Deferred Ideas (OUT OF SCOPE)

- PTW chain reuse — Phase 3 reuses `approval_chain_steps` + `approvals` + `delegations` + `notification_counters` verbatim
- Multi-VO per SI (v1 enforces `UNIQUE(si_id)` on VO)
- Parallel approvers (v1 sequential only)
- Payment-claim integration (Phase 4 candidate)
- Cost-attribution dashboard widget (data captured via `progress_leaf_item_id` linkage but no rollup UI in v1)
- Server-side PDF rendering (client-side jspdf only)
- OneSignal segment-based fatigue (Postgres counter only)
- Drawing version "auto-bump" badge when referenced drawing supersedes (UI defer to v2; v1 just shows pinned `v{n}`)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SI-01 | Subcon foreman submits SI | §4 schema `site_instructions`; D-09; §2 reuse `DrawingsContext` pattern |
| SI-02 | Title, description, optional photos, optional voice memo, optional geolocation | §4 `si_versions.payload`; D-09 |
| SI-03 | Version-pinned drawing refs (`drawing_version_id`) | §4 `drawing_version_ids[]`; D-09; §9 P-drift |
| SI-04 | Per-project numbering `SI-001` | §4 `pg_advisory_xact_lock` helper `next_si_number`; D-10 |
| SI-05 | After submission immutable — changes create new `si_versions` row | D-11; §4 append-only |
| SI-06 | Follows project's configured chain | §5 state machine; D-02 snapshot |
| SI-07 | approve / approve-with-edits / request-revision / reject | §5; D-13 |
| SI-08 | Approver edits versioned + shown to subcon as diff | §3 `diff-match-patch`; §8 diff card; D-12 |
| SI-09 | Subcon protest comment after lock (audit-only) | §4 `protest_comments`; D-14 |
| SI-10 | After full approval — read-only forever | §4 `locked_at`; §5; D-13 |
| SI-11 | Status in Chinese: 草稿 / 待批准 / 已批准 / 已退回 / 已拒絕 / 已鎖定 | §3 `SI_STATUS_ZH` map in `src/types.ts` |
| VO-01 | Subcon raises VO from approved SI; one VO per SI in v1 | §4 `variation_orders.si_id UNIQUE`; D-17 |
| VO-02 | Structured line items (description, qty, unit, unit_price, subtotal), categorised | §4 `vo_versions.payload.line_items`; D-18 |
| VO-03 | Each line item optionally linked to `progress_leaf_item_id` | D-18; D-20 |
| VO-04 | `numeric(14,2)` HKD; arithmetic in integer cents in JS | §3 currency arithmetic; §9 P7 |
| VO-05 | Server-computed `total_amount_cents` (Postgres generated or trigger) | §4 `GENERATED ALWAYS AS`; D-17 |
| VO-06 | Confirmation shows "經系統核算總額 HK$X" | §8; D-19 |
| VO-07 | VO follows configured chain (typically same as SI, configurable) | §5; D-15 |
| VO-08 | After full approval — locked + exportable to PDF | §7 PDF skeleton; D-21 |
| VO-09 | PDF includes line items + totals + approval timeline + drawing thumbnails | §7; D-22 |
| VO-10 | VO list filter by status + date range | §8 list UX |
| CHN-01 | Admin configures per-project chain per doc_type | §5; D-15 |
| CHN-02 | `(project_id, doc_type, step_order, required_role, optional_user_id)` | §4 `approval_chain_steps`; D-01 |
| CHN-03 | Snapshot at submission | §4 `chain_snapshot jsonb`; D-02 |
| CHN-04 | Sequential only | §5 |
| CHN-05 | `active_role_holders()` resolves at action time | §4 helper; D-04 |
| CHN-06 | Admin override with mandatory ≥10-char reason | §4 CHECK; D-05 |
| CHN-07 | Push fires per transition, only to next required actor | §6 fan-out |
| CHN-08 | 3 pushes/user/day cap across SI/VO/PTW; overflow → 08:00 digest | §6; D-06/D-07 |
| CHN-09 | Account deletion blocks on in-flight; admin override via re-routing | §9 P9; D-25 |
| CHN-10 | `delegations` table with valid_from / valid_until | §4; D-23/D-24 |
| CHN-11 | Append-only `approvals`; rejection is a new row not mutation | §4; D-03 |
| INF-03 | Extend RLS helpers (`can_view_si`, `can_view_vo`) | §4; D-27 |
| INF-04 | Extend `rls-smoke.sql` 3-persona harness with SI/VO assertions | §10 |
| INF-08 | Phase 2 Playwright smoke: SI submit + approve | §10 |
</phase_requirements>

---

## 1. Architecture Overview

```
                         React 18 SPA (HashRouter)
                                  |
        AuthProvider -> ProjectsProvider -> HashRouter
                                  |
                  (mounted inside ProjectDetail per project)
                  |          |          |          |          |
            ProgressCtx  IssuesCtx  DrawingsCtx  SiCtx     VoCtx
                                  |          (NEW)     (NEW)
                                  |
                       ApprovalChainCtx (NEW, admin pages)
                       DelegationsCtx   (NEW, profile + admin)
                                  |
                                  v
                     Supabase JS 2.104+ (singleton)
                                  |
   +------------+-------+--------+----------+---------+
   |            |       |        |          |         |
 Auth        Postgres Storage  Realtime  pg_net    pg_cron
                |       |        |          |         |
                |       +-- project-si-vo (PRIVATE, new)
                |
   v9 namespace migrations:
   ├── v9-approval-chain-schema.sql       (chain + approvals + delegations + counters/digest)
   ├── v9-si-schema.sql                    (SI tables + RLS + helper next_si_number)
   ├── v9-vo-schema.sql                    (VO tables + RLS + helper next_vo_number + GENERATED column)
   ├── v9-si-vo-storage-bucket.sql         (project-si-vo bucket + policies — copy of v8 template)
   ├── v9-rls-helpers.sql                  (can_view_si, can_view_vo, active_role_holders, in_flight_approvals)
   ├── v9-split/                           (push triggers, mirror v5-split/)
   │     ├── 1-push-dispatcher.sql         (SECURITY DEFINER; counter+digest decision)
   │     ├── 2-trg-si-submitted.sql
   │     ├── 3-trg-vo-submitted.sql
   │     ├── 4-trg-approval-created.sql    (advance chain + fan-out next actor)
   │     ├── 5-trg-chain-completed.sql     (set locked_at; freeze)
   │     └── 6-drain-digest-cron.sql       (pg_cron @ 0 0 * * * UTC)
   └── v9-account-deletion-extend.sql      (extends v6-account-deletion.sql RPC)
                                  |
                                  v
              pg_net.http_post -> OneSignal /notifications -> APNs / FCM
```

**Routing additions in `src/App.tsx`** (HashRouter, all `#/...`):
- `/project/:id/si` (SI list)
- `/project/:id/si/:siId` (SI detail + approve panel)
- `/project/:id/vo` (VO list)
- `/project/:id/vo/:voId` (VO detail + approve + PDF export)
- `/admin/projects/:id/chains` (chain admin, 3-tab `SI | VO | PTW`)
- (Profile page adds `Delegations` section in-place — no new route)

**ProjectDetail tab extension:** `Tab = 'progress' | 'issues' | 'si-vo'`. The `si-vo` tab can either render a switcher between SI list / VO list, OR (recommended) keep the tab list simple and link out to `/project/:id/si` and `/project/:id/vo` — TBD by planner.

**Realtime channels per project:** `si-${projectId}`, `vo-${projectId}` (mirroring `drawings-${projectId}` from Phase 1). Approvals and chain_snapshot updates are detected via these channels (no separate `approvals-${projectId}` channel needed because every approval mutates the parent SI/VO row's `current_step` or `locked_at`).

---

## 2. Key Patterns to Reuse

| Pattern | Source (file:lines) | Reuse for |
|---------|---------------------|-----------|
| Per-project context with scoped realtime channel | `src/contexts/ProgressContext.tsx:77-84` (channel `progress-${projectId}`) and Phase 1's `DrawingsContext.tsx` | `SiContext` → `si-${projectId}`; `VoContext` → `vo-${projectId}`; `ApprovalChainContext` (admin, not project-scoped per-page — fetch on mount) |
| Mutation return contract `Promise<{ error: string | null }>` (sometimes also `{ id }`) | `ProgressContext.addItem`, `ProjectsContext.createProject` | All Phase 2 mutators |
| `canEdit` derived inside context from auth + memberships + assigned_pm_ids | `ProgressContext.tsx:44-56` | `SiContext.canSubmit` (foreman+), `VoContext.canSubmit` (MC+), `ApprovalChainContext.canEdit` (admin+) |
| Private bucket + per-row RLS using `(storage.foldername(name))[1]::uuid = project_id` | `supabase/v8-private-bucket-template.sql` (entire template) + `v8-drawings.sql:202-220` consumer | New `project-si-vo` bucket; identical 2-policy shape (Members read, Editors upload; NO update/delete) |
| Append-only audit pattern (no DELETE policy) | Phase 1 `drawing_versions` (no delete), Phase 0 `issue_comments` | `approvals` and all `*_versions` tables |
| `security definer set search_path = public` on RLS helpers | `supabase/v3-progress-schema.sql:33-71` (`can_view_project`, `can_edit_project_progress`) | All new helpers: `can_view_si`, `can_view_vo`, `active_role_holders`, `in_flight_approvals`, `next_si_number`, `next_vo_number`, `push_dispatcher` |
| 3-persona RLS smoke harness with `set local request.jwt.claims` | `supabase/tests/rls-smoke.sql` (entire file) | Append SI/VO/approvals/chain personas: admin, MC of project A, subcon of project B, plus PM-via-delegation persona |
| Idempotent migration with defensive drops at top | `v8-drawings.sql:18-24` | Every v9 file follows this shape |
| jspdf + jspdf-autotable | `src/lib/export.ts:86-105` (`exportProgressToPDF`) | New `exportVOToPDF` slots in same file. Note: existing Phase-1 PDF uses English headings because default jsPDF font lacks CJK — Phase 2 must vendor a Chinese font (see §3, §7) |
| Excel export pattern (`safeName`, `downloadBlob`, `dateStr`) | `src/lib/export.ts:13-27` | Reuse identical helpers |
| OneSignal push pipeline (client side `external_user_id` already in place; server fan-out via `pg_net`) | `src/lib/push.ts:71-123` + `supabase/v5-split/*.sql` | Phase 2 client unchanged; new server-side fan-out lives in `v9-split/1-push-dispatcher.sql` + per-table triggers |
| Profile page additions (account deletion confirm) | `src/pages/Profile.tsx` | Add Delegations section + in-flight-approvals blocker UI |
| `AppLayout` + `Sidebar` + `BottomNav` | `src/components/` | Add nav entry for `/admin/projects/:id/chains` (admin nav) |
| `ProtectedRoute requireAdmin` | `src/components/ProtectedRoute.tsx` | Gates `/admin/projects/:id/chains` |
| `Spinner` / `FullPageSpinner` | `src/components/Spinner.tsx` | Throughout new forms |
| Chinese label maps (`<TYPE>_ZH` pattern) | `src/types.ts:51-58, 201-219, 275-279` | New: `SI_STATUS_ZH`, `VO_STATUS_ZH`, `APPROVAL_ACTION_ZH`, `LINE_ITEM_CATEGORY_ZH` |
| Migration namespace `v8-` → `v9-` (skip `v5/6/7` reserved per D-32) | `v8-drawings.sql` filename | New files: `v9-*.sql` and `v9-split/N-*.sql` |
| `delete_my_account` RPC compliance shape | `supabase/v6-account-deletion.sql` | Extend (not replace) with `in_flight_approvals` check returning Chinese-friendly error |
| Phone synth email; auth context untouched | `src/lib/phone.ts`, `src/contexts/AuthContext.tsx` | NO changes — D-29 locks auth model |

---

## 3. Concrete Library Choices

| Concern | Library | Version | Status | Notes |
|---------|---------|---------|--------|-------|
| Voice recording (native) | `@capacitor-community/voice-recorder` | latest 6.x | [ASSUMED — needs Wave 0 verification] | CONTEXT.md D-09 names this plugin OR fallback to `MediaRecorder`. Cap-8 peer compat must be confirmed via `npm view @capacitor-community/voice-recorder peerDependencies` on Wave 0. iOS Info.plist already has `NSMicrophoneUsageDescription` (zh-HK). Android needs `<uses-permission android:name="android.permission.RECORD_AUDIO"/>` — verify in AndroidManifest.xml during Wave 0. API: `VoiceRecorder.startRecording()` / `stopRecording()` returns `{ value: { recordDataBase64, msDuration, mimeType } }`. Output stored as `.m4a`. |
| Voice recording (web fallback) | browser `MediaRecorder` | native | [VERIFIED: Chrome/Firefox; Safari has MediaRecorder since 14.1] | iOS WKWebView in Capacitor does NOT expose `MediaRecorder` reliably — must use native plugin. Web-only path acceptable for dev. |
| Geolocation | `@capacitor/geolocation` | 8.x (matches Capacitor 8.3) | [VERIFIED: official Capacitor plugin family aligns with @capacitor/core 8.x] | iOS needs `NSLocationWhenInUseUsageDescription` (zh-HK string). Android needs `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>`. Use `getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 })`. Permission denied → `null` coords, NON-BLOCKING (D-09). |
| Text diff | `diff-match-patch` | 1.0.5 | [VERIFIED: Google library, stable since 2012, ~30 KB] | Use `diff_main` + `diff_cleanupSemantic` for line-level description diffs. Tiny — keep in main bundle. Alternative `jsdiff` is ~50 KB. CLAUDE-discretion locked but recommendation = `diff-match-patch`. |
| PDF generation | `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.7 | already installed | [VERIFIED: present in `package.json`] | Already chunked from Phase 1 INF-06 (`viewer-pdf` chunk). Reuse for VO PDF. |
| Chinese PDF font | Noto Sans HK subset, embedded via `doc.addFileToVFS` + `doc.addFont` | n/a | [CITED: jspdf docs `addFont`; CONCERNS.md notes existing PDF uses English headings because of CJK gap] | Subset to characters used in line items + labels to keep <300 KB. Vendor as `public/fonts/noto-sans-hk-subset.ttf`. Lazy-load via dynamic import inside `exportVOToPDF` so the font fetch only happens on export. |
| Money | none (manual integer cents) | n/a | [VERIFIED: industry standard for 2dp currencies; Phase-1 has no money handling but `xlsx` etc are precedent] | Store as `bigint` (cents). Compute `qty * unit_price_cents` server-side via trigger (D-18). Client computes for preview using `Math.round(qty * unit_price_cents)`. **Never** `parseFloat` for HKD. REQUIREMENTS VO-04 says `numeric(14,2)` for currency AND "integer cents in JS until display"; CONTEXT D-17/D-18 says `bigint`. Resolve in plan: use `bigint` cents columns (`total_amount_cents`, `unit_price_cents`, `subtotal_cents`); cast to `numeric(14,2)` only for legacy report views if needed. |
| HKD formatter | hand-rolled `src/lib/currency.ts` | n/a | [ASSUMED — D-04 implies but not spelled out] | `formatHKD(cents: number): string` → `new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(cents / 100)`. Output: `HK$1,234,567.89`. Parser `parseHKD(s) → cents` for editor input — strip non-digit+`.`, parse, `Math.round(_ * 100)`. |
| Static map tile | OpenStreetMap | n/a | [CITED: openstreetmap.org tile usage policy — light usage OK with attribution] | URL `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Convert lat/lng→tile coords with the standard slippy-map formula. Display 240×240 tile at zoom 16. Show `© OpenStreetMap` attribution in 10px text. Single tile per SI; cached forever client-side once viewed. |
| pg_cron | Postgres extension | bundled with Supabase (all tiers) | [VERIFIED: Supabase docs confirm pg_cron available on Free; pg_net used by Phase 1 v5-split is already enabled] | Enable: `create extension if not exists pg_cron with schema extensions;`. Schedule: `select cron.schedule('si-vo-digest','0 0 * * *', $$ select drain_notification_digest(); $$);`. **HK is UTC+8 with no DST**, so `0 0 UTC` = `08:00 HKT` exactly. |
| pg_net | Postgres extension | bundled, already enabled (Phase 0 v5-push-notifications.sql uses it) | [VERIFIED: existing app already calls `pg_net.http_post` to OneSignal] | Reuse pattern. |
| Realtime | `@supabase/supabase-js` 2.104+ | already installed | [VERIFIED: Phase 0 + Phase 1 proven] | Phase 2 adds 2 channels per project (si, vo). With drawings + progress + issues that's 5 channels per project — fine under WebSocket budget. |
| OneSignal | v1 `/notifications` REST API | n/a (no SDK) | [VERIFIED: existing code at `v5-split/2-send-push.sql` already calls this] | Keep on v1 for Phase 2 consistency. v2 migration is its own phase (CONCERNS notes v1 device registration is legacy but the read path already uses `include_aliases`). |
| Vault for OneSignal REST key | Supabase Vault OR `app_config.onesignal_rest_key` (Phase-0 pattern) | already in place | [VERIFIED: Phase 0 reads `onesignal_rest_key` from `app_config` via SECURITY DEFINER function; RLS denies anon reads] | Reuse the existing storage location — do NOT introduce Vault in Phase 2 (extra setup, no benefit). |
| Manual chunking | Vite `build.rollupOptions.output.manualChunks` | already configured for `viewer-pdf` / `viewer-zoom` from Phase 1 | [VERIFIED: Phase 1 SUMMARY confirms `viewer-pdf-CxNKkqmB.js` chunk emits] | Phase 2 reuses existing `viewer-pdf` chunk for VO export. Voice recorder stays in main (small). |

**Capacitor 8 peer-compat verification list (Wave 0 task — MUST run before plan 02-03):**
```bash
npm view @capacitor-community/voice-recorder peerDependencies
npm view @capacitor/geolocation peerDependencies
```
Expected: both should accept `@capacitor/core` `^8.0.0`. If voice-recorder lags, fallback options (in order):
1. Use a forked / patched fork (acceptable for app-store builds — confirm with Apple/Play notes)
2. Implement voice via in-WebView `MediaRecorder` for web ONLY and ship SI without voice on iOS until plugin updates
3. Descope voice memo to v2 backlog (last resort — re-open D-09 with user)

---

## 4. Database Schema Shape (DDL Sketch)

> Not a final migration. Captures table shape and the load-bearing constraints. Final migration is Plan 02-01.

### Shared chain spine (`supabase/v9-approval-chain-schema.sql`)

```sql
-- ── chain config (admin-editable) ─────────────────────────────
create table approval_chain_steps (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  doc_type        text not null check (doc_type in ('si','vo','ptw')),
  step_order      int  not null,
  required_role   text not null,                      -- 'pm','main_contractor','subcontractor','safety_officer','owner'
  optional_user_id uuid references user_profiles(id), -- override: specific user MUST act (still subject to role check by default)
  unique (project_id, doc_type, step_order)
);
create index idx_chain_steps_lookup
  on approval_chain_steps (project_id, doc_type, step_order);

-- ── append-only audit log ─────────────────────────────────────
create type approval_action_type as enum (
  'approve','approve_with_edits','request_revision','reject','admin_override','delegate'
);

create table approvals (
  id                       uuid primary key default gen_random_uuid(),
  doc_type                 text not null check (doc_type in ('si','vo','ptw')),
  doc_id                   uuid not null,        -- polymorphic; no FK
  step_order               int  not null,        -- which step in the doc's chain_snapshot
  action_type              approval_action_type not null,
  actor_id                 uuid not null references user_profiles(id) on delete restrict,
  delegated_for_user_id    uuid references user_profiles(id),  -- set if actor acted via delegation
  reason                   text,                 -- required for request_revision/reject/admin_override (≥10 chars)
  edits_jsonb              jsonb,                -- payload diff if approve_with_edits
  created_at               timestamptz not null default now(),
  check (
    case action_type
      when 'request_revision' then length(coalesce(reason,'')) >= 10
      when 'reject'           then length(coalesce(reason,'')) >= 10
      when 'admin_override'   then length(coalesce(reason,'')) >= 10
      else true
    end
  )
);
create index idx_approvals_doc on approvals (doc_type, doc_id, created_at);

-- ── delegations ───────────────────────────────────────────────
create table delegations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_profiles(id) on delete cascade,  -- grantor
  delegate_to   uuid not null references user_profiles(id) on delete cascade,
  valid_from    date not null,
  valid_until   date not null check (valid_until >= valid_from),
  created_at    timestamptz not null default now()
);
-- soft uniqueness: don't enforce "only one active delegation" at DB level
-- (D-23 allows date-range delegation per-user, multiple non-overlapping windows OK)
create index idx_delegations_active on delegations (user_id, valid_until);

-- ── push fatigue counters + digest ────────────────────────────
create table notification_counters (
  user_id     uuid not null references user_profiles(id) on delete cascade,
  hkt_date    date not null,
  count       int  not null default 0,
  primary key (user_id, hkt_date)
);

create table notification_digest (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references user_profiles(id) on delete cascade,
  hkt_date      date not null,
  items_jsonb   jsonb not null,                 -- array of {doc_type, doc_id, project_id, headline_zh, deep_link}
  sent_at       timestamptz,
  unique (user_id, hkt_date)
);

-- Realtime: only approvals + delegations published; counters/digest are server-only.
alter publication supabase_realtime add table approvals;
alter publication supabase_realtime add table delegations;
```

### SI tables (`supabase/v9-si-schema.sql`)

```sql
create table site_instructions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  number             text not null,                       -- 'SI-001'
  current_version_id uuid,                                -- FK after si_versions exists (deferred)
  chain_snapshot     jsonb,                                -- frozen at first submit; array of {step_order, required_role, optional_user_id}
  current_step       int not null default 0,               -- 0 = unsubmitted / 0..N during review / chain_length after final approve
  status             text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','locked','revision_requested','rejected')),
  created_by         uuid not null references user_profiles(id),
  created_at         timestamptz default now(),
  submitted_at       timestamptz,
  locked_at          timestamptz,                          -- set when status -> 'locked' (final approval)
  unique (project_id, number)
);

create table si_versions (
  id           uuid primary key default gen_random_uuid(),
  si_id        uuid not null references site_instructions(id) on delete cascade,
  version_no   int  not null,
  payload      jsonb not null,                              -- {title, description, drawing_version_ids[], photo_paths[], voice_path, lat, lng, accuracy_m}
  edits_by     uuid not null references user_profiles(id),
  created_at   timestamptz default now(),
  unique (si_id, version_no)
);

alter table site_instructions
  add constraint si_current_version_fk
  foreign key (current_version_id) references si_versions(id) on delete set null;

-- Append-only protest comments (D-14 / SI-09)
create table protest_comments (
  id          uuid primary key default gen_random_uuid(),
  si_id       uuid not null references site_instructions(id) on delete cascade,
  author_id   uuid not null references user_profiles(id),
  body        text not null check (length(body) > 0),
  created_at  timestamptz default now()
);

create index idx_si_project on site_instructions (project_id);
create index idx_si_status  on site_instructions (status);
create index idx_si_versions on si_versions (si_id, version_no);

alter publication supabase_realtime add table site_instructions;
alter publication supabase_realtime add table si_versions;
alter publication supabase_realtime add table protest_comments;
```

### VO tables (`supabase/v9-vo-schema.sql`)

```sql
create table variation_orders (
  id                  uuid primary key default gen_random_uuid(),
  si_id               uuid unique references site_instructions(id) on delete restrict,  -- UNIQUE = one VO per SI (D-17)
  project_id          uuid not null references projects(id) on delete cascade,
  number              text not null,                  -- 'VO-001'
  current_version_id  uuid,
  total_amount_cents  bigint,                          -- maintained by trigger from current_version's payload (D-18 defence-in-depth)
  chain_snapshot      jsonb,
  current_step        int  not null default 0,
  status              text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','locked','revision_requested','rejected')),
  created_by          uuid not null references user_profiles(id),
  created_at          timestamptz default now(),
  submitted_at        timestamptz,
  locked_at           timestamptz,
  unique (project_id, number)
);

create table vo_versions (
  id           uuid primary key default gen_random_uuid(),
  vo_id        uuid not null references variation_orders(id) on delete cascade,
  version_no   int  not null,
  payload      jsonb not null,                          -- {description, line_items[], total_amount_cents}
  edits_by     uuid not null references user_profiles(id),
  created_at   timestamptz default now(),
  unique (vo_id, version_no)
);

alter table variation_orders
  add constraint vo_current_version_fk
  foreign key (current_version_id) references vo_versions(id) on delete set null;

-- Trigger: recompute subtotals + total on vo_versions insert (D-18)
create or replace function recompute_vo_totals()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_total bigint := 0;
  v_items jsonb := coalesce(new.payload->'line_items','[]'::jsonb);
  v_recomputed jsonb := '[]'::jsonb;
  v_item jsonb;
  v_sub bigint;
begin
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_sub := round(
      (v_item->>'quantity')::numeric * (v_item->>'unit_price_cents')::bigint
    )::bigint;
    v_recomputed := v_recomputed || jsonb_build_object(
      'category',              v_item->>'category',
      'description',           v_item->>'description',
      'quantity',              (v_item->>'quantity')::numeric,
      'unit',                  v_item->>'unit',
      'unit_price_cents',      (v_item->>'unit_price_cents')::bigint,
      'subtotal_cents',        v_sub,
      'progress_leaf_item_id', v_item->'progress_leaf_item_id'
    );
    v_total := v_total + v_sub;
  end loop;
  new.payload := jsonb_set(new.payload, '{line_items}', v_recomputed);
  new.payload := jsonb_set(new.payload, '{total_amount_cents}', to_jsonb(v_total));
  return new;
end;
$$;

create trigger trg_vo_versions_recompute
  before insert on vo_versions
  for each row execute function recompute_vo_totals();

-- Trigger: when current_version_id is updated on variation_orders, sync total_amount_cents
create or replace function sync_vo_total()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_total bigint;
begin
  if new.current_version_id is not null then
    select (payload->>'total_amount_cents')::bigint into v_total
      from vo_versions where id = new.current_version_id;
    new.total_amount_cents := v_total;
  end if;
  return new;
end;
$$;

create trigger trg_vo_sync_total
  before insert or update of current_version_id on variation_orders
  for each row execute function sync_vo_total();

create index idx_vo_project on variation_orders (project_id);
create index idx_vo_status  on variation_orders (status);
create index idx_vo_versions on vo_versions (vo_id, version_no);

alter publication supabase_realtime add table variation_orders;
alter publication supabase_realtime add table vo_versions;
```

**Note on D-17 "GENERATED ALWAYS AS":** CONTEXT.md proposes a generated column. JSONB-derived generated columns require `(payload->>'total_amount_cents')::bigint` and STORED mode. A simpler & more flexible approach (used above) is **trigger-maintained** `total_amount_cents` on both `vo_versions` and `variation_orders`, with a CHECK preventing client overwrite via `revoke update(total_amount_cents) on variation_orders from authenticated`. The trigger ensures defence-in-depth (recomputes from line items) which a generated column alone does not — line items themselves need recomputation of subtotals. **Recommendation: trigger over generated column.** Planner to confirm in Plan 02-01.

### Auto-numbering helper (`next_si_number`, `next_vo_number`)

```sql
create or replace function next_si_number(p_project_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtextextended('si:' || p_project_id::text, 0));
  select coalesce(max(substring(number from 4)::int), 0) + 1
    into v_next
    from site_instructions
   where project_id = p_project_id
     and number ~ '^SI-\d+$';
  return 'SI-' || lpad(v_next::text, 3, '0');
end;
$$;

-- next_vo_number is identical with 'vo:' / 'VO-' substitutions.
```

`pg_advisory_xact_lock` auto-releases at end of transaction; no risk of stuck locks. The hash key namespaces SI vs VO vs PTW.

### Helpers (`supabase/v9-rls-helpers.sql`)

```sql
-- Mirror can_view_project shape (from v3-progress-schema.sql)
create or replace function can_view_si(p_user_id uuid, p_si_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from site_instructions s
     where s.id = p_si_id
       and can_view_project(p_user_id, s.project_id)
  );
$$;

create or replace function can_view_vo(p_user_id uuid, p_vo_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from variation_orders v
     where v.id = p_vo_id
       and can_view_project(p_user_id, v.project_id)
  );
$$;

-- The KEY helper for the whole phase
create or replace function active_role_holders(p_project_id uuid, p_required_role text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  -- Admins always
  select id from user_profiles where global_role = 'admin'
  union
  -- Assigned PMs when role = 'pm'
  select unnest(assigned_pm_ids)
    from projects where id = p_project_id and p_required_role = 'pm'
  union
  -- Approved members with matching role
  select pm.user_id
    from project_members pm
   where pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
  union
  -- Delegations: anyone delegated TO by a user who would normally hold this role
  select d.delegate_to
    from delegations d
    join project_members pm
      on pm.user_id = d.user_id
     and pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
   where current_date between d.valid_from and d.valid_until;
$$;

-- In-flight approvals for account-deletion guard (CHN-09 / D-25)
create or replace function in_flight_approvals(p_user_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  -- Count SI/VO where the user is in the active chain step OR is the creator awaiting revision
  with active_si as (
    select s.id, s.project_id, s.current_step,
           (s.chain_snapshot -> s.current_step ->> 'required_role') as req_role
      from site_instructions s
     where s.status in ('submitted','in_review','revision_requested')
  ),
  active_vo as (
    select v.id, v.project_id, v.current_step,
           (v.chain_snapshot -> v.current_step ->> 'required_role') as req_role
      from variation_orders v
     where v.status in ('submitted','in_review','revision_requested')
  )
  select count(*)::int from (
    select 1 from active_si s
      where p_user_id = any(array(select active_role_holders(s.project_id, s.req_role)))
    union all
    select 1 from active_vo v
      where p_user_id = any(array(select active_role_holders(v.project_id, v.req_role)))
    union all
    -- Creator with revision_requested doc
    select 1 from site_instructions where created_by = p_user_id and status = 'revision_requested'
    union all
    select 1 from variation_orders where created_by = p_user_id and status = 'revision_requested'
  ) x;
$$;
```

### Account-deletion extension (`supabase/v9-account-deletion-extend.sql`)

```sql
-- Extends v6-account-deletion.sql delete_my_account() RPC.
-- Re-defines the function with a new pre-check; original cascade behaviour preserved.
create or replace function delete_my_account()
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pending int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '未登入');
  end if;

  v_pending := in_flight_approvals(v_uid);
  if v_pending > 0 then
    return json_build_object(
      'ok', false,
      'blocked', true,
      'pending', v_pending,
      'error', '你尚有 ' || v_pending || ' 項待處理嘅簽核工作，需要管理員重新分派後先可以刪除帳戶。'
    );
  end if;

  -- ... original v6 cascade logic (delete from auth.users → cascades to user_profiles + project_members + ...) ...
  delete from auth.users where id = v_uid;
  return json_build_object('ok', true);
end;
$$;

grant execute on function delete_my_account() to authenticated;
```

---

## 5. Approval Chain & Delegation State Machine

```
                       [DRAFT]   (creator only; no chain assigned yet)
                          |
                       submit
                          |
              v9-trigger snapshots chain_steps where (project_id, doc_type='si') into chain_snapshot
                          |
                          v
                    [SUBMITTED]
                          |
              push_dispatcher -> role_holders(chain_snapshot[0].required_role)
                          |
                          v
                    [IN_REVIEW]   current_step = 0..N
                          |
   +----------------------+---------------------+--------------------+
   |                      |                     |                    |
 approve         approve_with_edits        request_revision        reject
   |                      |                     |                    |
   | creates              | creates new          | requires           | requires
   | approvals row        | si_versions row +   | reason ≥10         | reason ≥10
   | step_order ++        | approvals row       | sets status =      | sets status =
   |                      | step_order ++       | revision_requested | rejected (TERMINAL)
   |                      | (subcon sees diff   | resets             |
   |                      | on next open)        | current_step = 0   |
   |                      |                     |                    |
   v                      v                     v                    v
 step_order == len(chain)?           subcon submits new si_version  end
   |                                  -> back to SUBMITTED
   v
 [APPROVED] -> [LOCKED]
              locked_at = now()
              status = 'locked'
              v9-trigger blocks all further inserts to si_versions for this si_id
              ONLY protest_comments inserts remain allowed
```

**Admin override (CHN-06 / D-05):** at any `[IN_REVIEW]` state, an admin (`global_role='admin'`) can write an `approvals` row with `action_type='admin_override'` and `reason ≥ 10 chars`. Effect: advances `current_step` by 1, BUT row is NOT a regular approval — Phase 3's PTW safety-officer step explicitly checks that an `admin_override` does NOT satisfy a safety step. Phase 2 keeps the same semantics for consistency.

**Delegation resolution (D-24):** When user X attempts to approve step requiring role R for project P:
1. Compute `holders = active_role_holders(P, R)` (set of user_ids).
2. If `X in holders` → allowed. If the membership of X came via a delegation row, set `approvals.delegated_for_user_id = grantor_id`. Otherwise leave `NULL`.
3. If X has `global_role='admin'` → allowed as `admin_override` (different `action_type`).
4. Else 403 with toast `你冇權批准呢個步驟`.

**Pitfall — delegation expires mid-form:** user X opens approve form at 10am with a delegation valid until 23:59 today. They take an hour, click approve at 11am. Still valid. Edge: delegation `valid_until = 2026-05-12` and user clicks approve at 00:01 on 2026-05-13. Server-side re-resolves and rejects. Surface as zh-HK toast: `你嘅代行授權已過期，請聯絡管理員`.

---

## 6. Push Fan-Out & Fatigue Cap Architecture

```
Postgres trigger: AFTER INSERT ON approvals
   |
   v
fn: dispatch_after_approval(NEW)
   |  1. Load doc (site_instructions or variation_orders) row by (doc_type, doc_id).
   |  2. Compute new_step = NEW.step_order + 1.
   |  3. If NEW.action_type IN ('request_revision','reject'):
   |       update doc set status = 'revision_requested' or 'rejected', current_step = 0.
   |       fire push to creator only. RETURN.
   |  4. If new_step >= jsonb_array_length(chain_snapshot):
   |       update doc set status='locked', locked_at=now(), current_step=new_step. RETURN.
   |  5. Else:
   |       update doc set current_step=new_step.
   |       next_role := chain_snapshot -> new_step ->> 'required_role'.
   |       optional_user_id := chain_snapshot -> new_step -> 'optional_user_id'.
   |       recipients := (
   |         CASE WHEN optional_user_id IS NOT NULL THEN ARRAY[optional_user_id::uuid]
   |              ELSE ARRAY(SELECT active_role_holders(doc.project_id, next_role))
   |         END
   |       );
   |       FOR target IN recipients LOOP push_dispatcher(target, payload); END LOOP.
   v

fn: push_dispatcher(p_target uuid, p_payload jsonb)   -- SECURITY DEFINER
   |  v_today := (now() AT TIME ZONE 'Asia/Hong_Kong')::date;
   |  -- Atomic upsert + read counter:
   |  INSERT INTO notification_counters (user_id, hkt_date, count)
   |    VALUES (p_target, v_today, 1)
   |    ON CONFLICT (user_id, hkt_date)
   |    DO UPDATE SET count = notification_counters.count + 1
   |    RETURNING count INTO v_count;
   |  IF v_count <= 3 THEN
   |     PERFORM net.http_post(
   |       url := 'https://api.onesignal.com/notifications',
   |       headers := jsonb_build_object(
   |         'Content-Type','application/json',
   |         'Authorization','Basic ' || (select onesignal_rest_key from app_config limit 1)
   |       ),
   |       body := jsonb_build_object(
   |         'app_id', (select onesignal_app_id from app_config limit 1),
   |         'include_aliases', jsonb_build_object('external_id', jsonb_build_array(p_target::text)),
   |         'target_channel','push',
   |         'headings', jsonb_build_object('zh-Hant', p_payload->>'heading_zh', 'en', p_payload->>'heading_en'),
   |         'contents', jsonb_build_object('zh-Hant', p_payload->>'content_zh', 'en', p_payload->>'content_en'),
   |         'data', jsonb_build_object('deep_link', p_payload->>'deep_link')
   |       )
   |     );
   |  ELSE
   |     -- 4th and beyond → digest
   |     INSERT INTO notification_digest (user_id, hkt_date, items_jsonb)
   |       VALUES (p_target, v_today, jsonb_build_array(p_payload))
   |       ON CONFLICT (user_id, hkt_date)
   |       DO UPDATE SET items_jsonb = notification_digest.items_jsonb || excluded.items_jsonb;
   |  END IF;
```

**Cron job (D-07):**

```sql
select cron.schedule(
  'si-vo-digest',
  '0 0 * * *',                       -- 00:00 UTC = 08:00 HKT (no DST)
  $$ select drain_notification_digest(); $$
);

create or replace function drain_notification_digest()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select id, user_id, items_jsonb
      from notification_digest
     where sent_at is null
       and hkt_date <= current_date
  loop
    perform net.http_post(
      url := 'https://api.onesignal.com/notifications',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Basic ' || (select onesignal_rest_key from app_config limit 1)
      ),
      body := jsonb_build_object(
        'app_id', (select onesignal_app_id from app_config limit 1),
        'include_aliases', jsonb_build_object('external_id', jsonb_build_array(v_row.user_id::text)),
        'target_channel','push',
        'headings', jsonb_build_object('zh-Hant','你今日有 ' || jsonb_array_length(v_row.items_jsonb) || ' 則簽核通知','en','You have notifications'),
        'contents', jsonb_build_object('zh-Hant','點擊查看詳情','en','Tap to review'),
        'data', jsonb_build_object('deep_link','/home')
      )
    );
    update notification_digest set sent_at = now() where id = v_row.id;
  end loop;
end;
$$;
```

**Risk (LOW confidence):** OneSignal rate-limit when the cron sends a burst at 08:00 HKT — but each user gets ONE call, and headcount is bounded by Phase 1 evidence (≤200 internal users). Within OneSignal Free tier limits.

**Counter-reset behaviour:** counter is per `hkt_date`, so each new day starts at 0. Old rows stay (audit). No vacuum needed for v1.

---

## 7. VO PDF Generation Approach

`src/lib/export.ts` extension (sketch — matches existing style, semicolon-free, named export):

```ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from './supabase'
import { formatHKD } from './currency'
import type { Project, VO, VOVersion, DrawingVersion, UserProfile } from '../types'

// Lazy load NotoSansHK only when called (~250 KB subset)
let _fontLoaded = false
async function ensureChineseFont(doc: jsPDF) {
  if (_fontLoaded) {
    doc.setFont('NotoHK')
    return
  }
  const res = await fetch('/fonts/noto-sans-hk-subset.ttf')
  const buf = await res.arrayBuffer()
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
  doc.addFileToVFS('NotoSansHK.ttf', b64)
  doc.addFont('NotoSansHK.ttf', 'NotoHK', 'normal')
  doc.setFont('NotoHK')
  _fontLoaded = true
}

export async function exportVOToPDF(
  project: Project,
  vo: VO,
  version: VOVersion,
  drawings: DrawingVersion[],   // referenced drawing revisions for thumbnail page
  users: Record<string, UserProfile>,
  approvalTimeline: { actor: string, action: string, at: string }[],
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  await ensureChineseFont(doc)

  // Header
  doc.setFontSize(16)
  doc.text(`變更指令 ${vo.number}`, 40, 50)
  doc.setFontSize(10)
  doc.text(`項目：${project.name}`, 40, 72)
  doc.text(`狀態：${vo.status}`, 40, 86)
  doc.text(`提交：${vo.submitted_at ?? '—'}    鎖定：${vo.locked_at ?? '—'}`, 40, 100)

  // Section 1: SI reference (D-22)
  doc.setFontSize(12)
  doc.text(`參考工地指令：${vo.si_id ? `SI-${vo.si_id}` : '—'}`, 40, 130)
  doc.setFontSize(10)
  doc.text((version.payload as any).description || '', 40, 150, { maxWidth: 515 })

  // Section 2: Line items table (D-22)
  const items = (version.payload as any).line_items as Array<any>
  autoTable(doc, {
    startY: 220,
    head: [['#','類別','描述','數量','單位','單價','小計']],
    body: items.map((li, i) => [
      i + 1,
      LINE_ITEM_CATEGORY_ZH[li.category],
      li.description,
      li.quantity,
      li.unit,
      formatHKD(li.unit_price_cents),
      formatHKD(li.subtotal_cents),
    ]),
    foot: [[
      { content: '經系統核算總額', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: formatHKD(vo.total_amount_cents), styles: { fontStyle: 'bold' } },
    ]],
    styles: { font: 'NotoHK', fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [29, 78, 216] },
  })

  // Section 3: Approval timeline
  doc.addPage()
  doc.setFontSize(12)
  doc.text('簽核紀錄', 40, 50)
  autoTable(doc, {
    startY: 70,
    head: [['時間','動作','處理者']],
    body: approvalTimeline.map(a => [a.at, a.action, a.actor]),
    styles: { font: 'NotoHK', fontSize: 9, cellPadding: 4 },
  })

  // Section 4: Drawing thumbnails — fetch signed URLs → blob → base64 PNG ≤200 KB resized (D-22)
  for (let i = 0; i < drawings.length; i += 6) {
    doc.addPage()
    doc.text('附圖', 40, 50)
    const batch = drawings.slice(i, i + 6)
    for (let j = 0; j < batch.length; j++) {
      const dv = batch[j]
      const { data: signed } = await supabase
        .storage
        .from('project-drawings')
        .createSignedUrl(dv.file_path, 300)
      if (!signed?.signedUrl) continue
      const blob = await (await fetch(signed.signedUrl)).blob()
      const resized = await resizeToMaxKB(blob, 200)  // helper TBD
      const dataUrl = await blobToDataUrl(resized)
      const col = j % 2
      const row = Math.floor(j / 2)
      doc.addImage(dataUrl, 'JPEG', 40 + col * 280, 70 + row * 240, 260, 220, undefined, 'FAST')
    }
  }

  // Footer
  doc.setFontSize(8)
  doc.text(`產生時間：${new Date().toLocaleString('zh-HK')} — 由 CK工程系統產生`, 40, 820)

  doc.save(`${safeName(project.name)}_${vo.number}_${new Date().toISOString().slice(0,10)}.pdf`)
}
```

**Bundle discipline:** Phase 1 already chunked jspdf into `viewer-pdf`. Verify Vite still emits it after `exportVOToPDF` lands. Font fetch is lazy via `fetch('/fonts/...')` — does NOT bundle the 250 KB TTF into JS.

**Memory caveat (LOW confidence):** 6 × 200 KB JPEG base64 ≈ 1.6 MB live in memory during PDF assembly. iOS WKWebView has been seen OOM at ~50 MB. Should be safe. If photos are larger, the `resizeToMaxKB` helper enforces ≤200 KB via `<canvas>` re-encode. Worth a real-device test on the smallest iPhone we support.

---

## 8. UX Patterns

**SI submission form (390px, mobile-first):**
- Sticky header: `新增工地指令` + close X
- Required: 標題 (single line, ≤120 chars) → 描述 (textarea, 4 rows, ≤4000 chars, char counter)
- 圖則參照 (chip multi-select; default pre-fills with current drawing_versions; badge `v3 (提交時最新)`)
- 相片 (multi-image; reuse Phase 1's image-picker bottom-sheet pattern with 拍攝 / 從相簿選擇 / 從檔案選擇)
- 語音備忘 (single recording; 3 states: idle [+] icon → recording [⏺ + 0:00..2:00 counter + ❚❚ stop] → playback [▶ + duration + 🗑 re-record])
- 位置 (button `📍 加入位置` → on tap, request geo, show OSM 240×240 tile with center pin + `(緯度, 經度) ±{accuracy}m` text; or `⊗ 已跳過位置` pill if denied)
- 提交 button (`btn-primary` orange CTA, disabled until 標題 + 描述 + 圖則參照 all present)

**SI detail screen:**
- Header: `SI-001 ｜ 待批准` status pill, project name, creator+role, submitted_at
- Tabs: 詳情 / 版本歷史 / 簽核紀錄 / 抗議 (if locked)
- 詳情: current version payload + voice playback + OSM tile + linked drawings
- 版本歷史: list of versions; tap two → diff card
- 簽核紀錄: timeline of approvals rows (avatar + action chip + reason + at-time)
- 抗議 (visible only when status='locked'): list of `protest_comments` + input box for own protest

**Approval bar (sticky bottom, only when current user is in `active_role_holders(project, chain_snapshot[current_step].required_role)`):**
- 4 buttons stacked or 2×2 grid: `✓ 批准` (green) / `✏ 批准並修改` (blue) / `↩ 退回` (amber) / `✗ 拒絕` (red)
- Tap 退回 or 拒絕 → modal with mandatory reason textarea (counter shows `(N/10 chars min)`)
- Tap 批准並修改 → inline editor pre-filled with current payload; on save → confirm modal preview-style; submit creates new si_versions + approvals.action_type='approve_with_edits'.

**VO line-item editor:**
- Stacked rows on mobile (one row = 4 stacked fields: 類別 dropdown / 描述 text / 數量×單位 two-col / 單價 numeric); collapsed to table on `md:` breakpoint
- Each row shows live `小計：HK$X` computed locally from `qty * unit_price_cents`
- Sticky footer: `經系統核算總額 HK$X` (client preview; server total will be confirmed on submit)
- `+ 新增項目` button below list
- Swipe-left to delete row (mobile); ✕ button on desktop

**Diff card (SI version comparison, D-12):**
- Card header: `對比版本 v2 → v3`
- Field rows:
  - 標題: `舊：X → 新：Y` (only shown if changed)
  - 描述: line-level diff via `diff-match-patch`: added lines `bg-green-100 text-green-700`, removed `bg-red-50 text-red-600 line-through`, unchanged plain
  - 圖則參照: `已加入 [v3 結構圖]` / `已移除 [v2 機電圖]` pills
  - 相片: 已加入 N 張 / 已移除 N 張 (no thumbnails inline; tap → modal)
  - 位置: 舊 (lat,lng) → 新 (lat,lng) with arrow if changed

**PendingApprovalCard (Home page, replacing Phase-1 drawing-only card):**
- Single component `<PendingApprovalCard kind="si"|"vo"|"membership" item={...} />`
- Top: status pill + `SI-001` (or `VO-001`) + project name
- Body: title (truncate-2)
- Footer: 步驟 N/M + relative time (`30 分鐘前`)
- Tap whole card → navigates to detail
- Bottom nav badge = total count

**VO list filter UX (VO-10):**
- Top of `/project/:id/vo`: filter pills `全部 / 待批准 / 已批准 / 已退回 / 已拒絕`
- Date range pickers `由 yyyy-MM-dd 至 yyyy-MM-dd` (mobile-friendly native date inputs)

**Chain admin UI (`/admin/projects/:id/chains`):**
- Tab strip: `工地指令 | 變更指令 | 工作許可證`
- Each tab: ordered list of step rows; row = `[≡] [Role dropdown] [Specific user (optional, autocomplete)] [🗑]` + `+ 加入步驟` at bottom
- Drag-handle reorder via touch (use `@dnd-kit/sortable`? — adds ~30 KB; alternative is up/down arrow buttons which are mobile-friendlier and zero-dep — **recommend arrow buttons**)
- 預設範本 button → loads D-16 defaults
- 儲存 button → delete-then-insert in one transaction

**Profile page (Delegations section, D-23):**
- New card `我嘅代理 / 我係 X 嘅代理`
- "Add delegation": picker (project member) + valid_from / valid_until dates
- Active delegations list with 🗑 to revoke

**Account-deletion blocker UI (D-25):**
- Existing delete button shows confirm modal as today
- On submit, if RPC returns `{ blocked: true, pending: N }`, show toast `你尚有 N 項待處理嘅簽核工作，請聯絡管理員` + button `📨 通知管理員` (sends a `demo_feedback` row or emails admin via OneSignal — TBD by planner; could be deferred)

---

## 9. Pitfalls & HK-Specific Gotchas

| # | Pitfall | Mitigation |
|---|---|---|
| P1 | `count(*)+1` race for SI/VO numbering | `pg_advisory_xact_lock(hashtextextended('si:'||project_id::text, 0))` inside the `next_si_number` function; auto-release at xact end |
| P2 | Admin edits chain mid-flight → in-flight SI suddenly has new steps | Always copy chain into `chain_snapshot jsonb` at first submit (D-02); never read live `approval_chain_steps` after submit |
| P3 | Delegation expires mid-action | Server re-resolves `active_role_holders` inside the approval RPC; 403 if grantee no longer resolves. Surface as zh-HK toast `你嘅代行授權已過期` |
| P4 | Storage RLS for `project-si-vo` bucket misconfigured → cross-project voice/photo leak | Use exact `(storage.foldername(name))[1]::uuid = project_id` predicate from `v8-private-bucket-template.sql`; reuse `can_view_project` / `can_edit_project_progress` helpers; run rls-smoke against `storage.objects` for both buckets |
| P5 | `total_amount_cents` computed wrong because client wrote it | `revoke update(total_amount_cents) on variation_orders from authenticated`; recompute via trigger from `payload.line_items` (defence-in-depth even though RLS already blocks) |
| P6 | OneSignal `device_type` mismatch — Phase 1 fixed: iOS=0, Android=1. Server-side fan-out uses `include_aliases.external_id` so device_type isn't on trigger side | No action; carry pattern |
| P7 | Floating-point HKD bugs (`0.1 + 0.2 ≠ 0.3`) | Strict integer cents everywhere; `Math.round(qty * unit_price_cents)`; ban `parseFloat` for currency; `formatHKD(cents)` only at render |
| P8 | zh-HK truncation in 390px viewport (`變更指令 VO-001 已被總承建商批准` ≈ 18 chars) | `line-clamp-2` on titles; allow 2-line status badges; emulator-test against 390×844 (iPhone 12) before merge |
| P9 | Apple compliance: `delete_my_account` regression | Extend (don't replace) RPC; preserve empty-success path; cover both branches in `rls-smoke.sql` (user with no in-flight succeeds; user with in-flight blocked) |
| P10 | pg_cron schedule in UTC — `0 0 * * *` is 08:00 HKT only because HK is UTC+8 with no DST | Add SQL comment `-- 0 0 UTC == 08:00 Asia/Hong_Kong (no DST)` directly above the schedule call; document in CONCERNS.md |
| P11 | Realtime channel proliferation: user in 3 projects with 5 channels each = 15 channels | Phase 1 pattern: only subscribe to channels for the *currently mounted* project; tear down on unmount. Preserve. |
| P12 | `approve_with_edits` audit ambiguity — previously-approved actors signed an older version | New version's `approvals` rows reference the new version_id implicitly (via doc current_step). Append-only ledger means old approvals remain visible; diff card on detail screen shows what changed since. UI surfaces "X 已批准 v2，目前係 v3" so it's never ambiguous. |
| P13 | Voice memo upload large + slow on bad site Wi-Fi | 48 kbps mono AAC × 120s ≈ 720 KB worst case; capped at 5 MB hard limit. Storage budget: 1000 SIs × 720 KB ≈ 720 MB. WITHIN 1 GB Supabase Free tier IF drawings storage is ≤ 280 MB — verify before phase ships. |
| P14 | `capacitor-community/voice-recorder` Capacitor 8 peer mismatch (community plugin lags official) | Wave 0 verification task — `npm view @capacitor-community/voice-recorder peerDependencies` before any UI work begins. Fallback plan documented in §3. |
| P15 | OneSignal v1 deprecation | Stay on v1 for Phase 2 consistency. v2 migration is its own phase. Existing app uses v1 in prod with no issues. |
| P16 | OSM tile fair-use under heavy usage | Single tile per SI, cached forever client-side. Well below threshold. Always include `© OpenStreetMap` attribution. If usage grows, migrate to MapTiler / self-host. |
| P17 | jspdf Chinese rendering — default fonts can't render zh-HK (Phase 1 PDF uses English) | Vendor Noto Sans HK subset; `doc.setFont('NotoHK')` BEFORE any `doc.text(chinese)`; forgotten = empty boxes |
| P18 | Idempotent migration trap (Phase 0 `progress_history` was wiped on re-run per CONCERNS) | Use `create table if not exists` + `alter table ... add column if not exists`; NEVER `drop table` on tables that hold user data; defensive drops only on functions/triggers/views |
| P19 | Hardcoded admin password `admin1234` in seed (CONCERNS) — verify rotation before any test data lands in prod | Pre-Wave-0 sanity check; not strictly a Phase 2 issue but worth flagging |
| P20 | Subcon-foreman cannot view own SI after submit if RLS only checks `project_members.role = 'subcontractor'` (subcontractor_worker is the foreman) | `can_view_project` already covers all approved member roles; verify `can_view_si` chains through `can_view_project` (it does in §4 sketch); cover in rls-smoke with subcontractor_worker persona |

---

## 10. Validation Architecture (light)

`workflow.nyquist_validation` is `false` in `.planning/config.json` — this section is the light version: happy path + critical edge cases per requirement domain. Drives Wave 5 Playwright (INF-08) and RLS smoke (INF-04).

### Test Framework

| Property | Value |
|---|---|
| Framework | `@playwright/test` ^1.59 (already devDep; config landed in Phase 1 Plan 01-08) |
| Config | `playwright.config.ts` at repo root |
| RLS harness | `supabase/tests/rls-smoke.sql` — extended with SI/VO/chain/approvals personas |
| Quick run (CI / per-PR) | `npm run test:e2e -- --grep @si-vo-smoke` |
| Full suite | `npm run test:e2e && psql -f supabase/tests/rls-smoke.sql` |

### Requirements → Tests

| Req | Behaviour | Test type | Notes |
|---|---|---|---|
| SI-01,02,03,04,10 | Submit SI happy path | Playwright e2e | Login as `subcontractor_worker`, navigate to project, submit SI with title+desc+drawing pin (auto-defaults) + skip voice in headless + mock geo. Assert `SI-001` rendered + status=submitted. |
| SI-05,06,07 | Sequential approval | Playwright + DB | Submit → login MC → approve → login PM → approve → assert status=locked. Assert `approvals` row count = 2 + chain_snapshot length matches. |
| SI-08 | Versioning after approve_with_edits | Playwright | Submit v1. MC clicks 批准並修改, changes description. Login subcon → assert diff card shows old→new. Login PM → approve → final v2 locked. |
| SI-09 | Protest comment after lock | Playwright | Lock SI as above. Login subcon → enter protest text → assert appears in 抗議 tab; assert no push notification fired (DB check). |
| SI-10 | Immutability after lock | RLS smoke | INSERT into si_versions where parent si is 'locked' → expect deny via trigger or RLS policy |
| SI-11 | ZH status labels | Unit (Vitest, optional) | `SI_STATUS_ZH['locked'] === '已鎖定'` etc. — skip if no Vitest harness; smoke covers it visually |
| VO-01..06 | Raise VO from approved SI | Playwright | Approve SI (above). MC opens approved SI → 提出變更指令 button → form with 3 line items (labour 10h × HK$200, material 1 lump × HK$5000, contingency 5% × HK$5000) → submit. Assert `total_amount_cents = 1000000 + 500000000 + 25000000` (server-confirmed `經系統核算總額`). |
| VO-03 | progress_leaf_item linkage | DB | Submit VO with `progress_leaf_item_id` on one line; assert row stored in payload jsonb |
| VO-04,05 | Server total cannot be client-written | RLS smoke + DB | Insert vo_versions.payload with a faked `total_amount_cents` field; trigger overwrites; assert correct value. Also: try `update variation_orders set total_amount_cents=999` as authenticated → revoke denies |
| VO-07,08 | VO chain + lock | Playwright | Approve through MC+PM+owner (D-16 default). Assert vo.status='locked'. |
| VO-09 | PDF export | Playwright | Click 匯出 PDF on locked VO; assert PDF download triggered (Playwright downloads API). Inspect downloaded bytes — check that Chinese strings render (non-empty `Tj` operators around CJK ranges). |
| VO-10 | Filter | Playwright | Submit 3 VOs in different statuses; assert list filter reduces count. |
| CHN-01..04,07,09 | Chain admin + snapshot | Playwright | Admin creates chain v1 [MC,PM]. Submit SI → snapshot frozen. Admin edits chain to [PM]. In-flight SI still requires MC. New SI submission uses 1-step chain. |
| CHN-05 | active_role_holders survives departure | RLS smoke | Delete PM's project_membership while their step is pending; replace via assigned_pm_ids; assert new PM resolves as actor |
| CHN-06 | admin_override with ≥10 char reason | DB | Insert approvals with action_type='admin_override' and reason='short' → CHECK rejects. With 10+ chars → accepts. |
| CHN-08 | Push fatigue cap + digest | DB | Manually call push_dispatcher 4 times for same (user, today); assert counter=4, first 3 went via pg_net (mock OneSignal endpoint), 4th appended to notification_digest. Call drain_notification_digest(); assert sent_at populated. |
| CHN-09 | Account deletion blocked | Playwright + RPC | Submit SI as foreman. Foreman tries `delete_my_account` → expect `{ blocked: true, pending: 1 }`. Admin approves through. Foreman retries → succeeds. |
| CHN-10 | Delegation respected | Playwright + DB | PM grants delegation to MC for date range covering today. MC sees pending PM-step in Home. Approves. `approvals.delegated_for_user_id=PM.id`, `actor_id=MC.id`. |
| CHN-11 | Append-only approvals | RLS smoke | UPDATE on approvals → deny (no UPDATE policy). DELETE → deny. |
| INF-03 | RLS helpers SECURITY DEFINER | `pg_proc` check | `select proname, prosecdef, proconfig from pg_proc where proname in ('can_view_si','can_view_vo','active_role_holders','in_flight_approvals','next_si_number','next_vo_number','push_dispatcher','drain_notification_digest')` — all must show prosecdef=true and search_path=public |
| INF-04 | rls-smoke 3-persona | rls-smoke.sql | Append SI/VO scenarios; admin sees all, MC of project A sees only A, subcon of project B sees only B. Plus: subcontractor_worker on project A (foreman) sees own SI. |
| INF-08 | E2E smoke | Playwright `@si-vo-smoke` | Combined happy path: submit SI → approve chain → raise VO → approve chain → export PDF |

### Wave 0 Gaps

- [ ] `tests/e2e/si-vo-smoke.spec.ts` — INF-08 happy path
- [ ] Extend `scripts/seed-demos.js` (or new `tests/fixtures/seed-phase2.sql`) — admin + MC + PM + subcon-foreman + 1 project + 1 drawing revision + default chain template
- [ ] Mock for `@capacitor/geolocation` in Playwright (headless can't grant real permission)
- [ ] Decision: skip voice recorder in Playwright headless OR mock the plugin (recommend skip with `data-testid="voice-skip"`)
- [ ] OneSignal mock endpoint for CHN-08 push-cap test (HTTP mock in Playwright `route` interception, OR stub `pg_net.http_post` to return 200 without actually firing)

---

## 11. Suggested Plan Split

Mirror Phase 1's 9-plans / 5-waves shape. Phase 1 reference: `01-01` schema → `01-02` bundle CI → `01-03` plugins → `01-04` viewer libs → `01-05` context → `01-06` UI components → `01-07` wire-into-page → `01-08` Playwright → `01-09` walkthrough.

```
Wave 0 — Shared spine (sequential; blocks everything)
  Plan 02-01: Approval-chain DB spine + storage bucket
    Files:
      supabase/v9-approval-chain-schema.sql
      supabase/v9-rls-helpers.sql
      supabase/v9-si-vo-storage-bucket.sql        (copy of v8-template, swap names)
      supabase/v9-account-deletion-extend.sql
      supabase/v9-split/1-push-dispatcher.sql
      supabase/v9-split/6-drain-digest-cron.sql
      supabase/tests/rls-smoke.sql                 (append SI/VO/chain personas)
      Wave 0 task: npm view @capacitor-community/voice-recorder peerDependencies
    Acceptance:
      - All tables present in information_schema
      - active_role_holders / in_flight_approvals / push_dispatcher exist as security definer
      - pg_cron job 'si-vo-digest' visible in cron.job
      - rls-smoke passes new personas
      - Capacitor 8 plugin compat decision recorded in plan summary

Wave 1 — Domain types + capacitor plugins (parallel-safe)
  Plan 02-02: TS types + ZH maps + shared utilities + native deps
    Files:
      src/types.ts                  (SI, VO, Approval, ChainStep, Delegation, NotificationDigestItem, status enums, SI_STATUS_ZH, VO_STATUS_ZH, APPROVAL_ACTION_ZH, LINE_ITEM_CATEGORY_ZH)
      src/lib/currency.ts           (formatHKD, parseHKD, centsArithmetic)
      src/lib/diff.ts               (diff-match-patch wrapper -> structured field diffs)
      src/lib/osm-tile.ts           (lat/lng -> {z,x,y}; build URL)
      package.json                  (add @capacitor-community/voice-recorder, @capacitor/geolocation, diff-match-patch; npm ci; cap sync)
      ios/App/App/Info.plist        (verify zh-HK NSLocationWhenInUseUsageDescription + NSMicrophoneUsageDescription — already present)
      android/app/src/main/AndroidManifest.xml  (verify ACCESS_COARSE_LOCATION + RECORD_AUDIO)
    Acceptance:
      - tsc green
      - cap sync ios/android green
      - jest/vitest (if added) tests formatHKD/parseHKD round-trip

Wave 2 — SI vertical
  Plan 02-03: SI schema + SiContext + submission UI
    Files:
      supabase/v9-si-schema.sql     (site_instructions, si_versions, protest_comments, next_si_number, RLS)
      supabase/v9-split/2-trg-si-submitted.sql
      supabase/v9-split/4-trg-approval-created.sql (shared for SI+VO; lives in this plan)
      supabase/v9-split/5-trg-chain-completed.sql  (shared)
      src/contexts/SiContext.tsx
      src/components/VoiceRecorder.tsx
      src/components/GeoPicker.tsx
      src/components/SiSubmitForm.tsx
      src/pages/SiList.tsx, src/pages/SiDetail.tsx
      src/App.tsx                   (add routes /project/:id/si, /project/:id/si/:siId)
    Acceptance:
      - Subcon-foreman can submit SI on web + iOS + Android (TestFlight)
      - SI-001 auto-numbers; concurrent submit test (2 parallel) yields SI-001 + SI-002 with no collision
      - Realtime channel si-${projectId} fires on insert

  Plan 02-04: SI approval UX + diff card
    Files:
      src/components/ApprovalBar.tsx       (4 buttons + reason modal)
      src/components/ApprovalLedger.tsx    (timeline)
      src/components/DiffCard.tsx          (uses diff-match-patch via src/lib/diff.ts)
      src/components/PendingApprovalCard.tsx  (generalised — replaces Phase 1 drawing-only card if any)
      src/pages/Home.tsx                   (add pending count badge + cards)
      src/pages/Profile.tsx                (Delegations section, NEW — D-23)
      src/contexts/DelegationsContext.tsx
    Acceptance:
      - MC + PM can approve through full chain
      - Diff card visible after approve_with_edits
      - Delegation grant/revoke works; delegate resolves into active_role_holders

Wave 3 — VO vertical
  Plan 02-05: VO schema + VoContext + submission UI
    Files:
      supabase/v9-vo-schema.sql     (variation_orders, vo_versions, recompute_vo_totals trigger, next_vo_number, RLS, revoke update(total_amount_cents))
      supabase/v9-split/3-trg-vo-submitted.sql
      src/contexts/VoContext.tsx
      src/components/VoLineItemsEditor.tsx
      src/pages/VoList.tsx, src/pages/VoSubmit.tsx, src/pages/VoDetail.tsx
      src/pages/SiDetail.tsx        (add "提出變更指令" button when SI status=locked AND no VO yet)
      src/App.tsx                   (add routes /project/:id/vo, /project/:id/vo/:voId)
    Acceptance:
      - MC submits VO from approved SI with integer-cents line items
      - Server total matches client preview to the cent (rls-smoke + Playwright)
      - VO list filter by status + date range works
      - UNIQUE(si_id) prevents 2nd VO from same SI

  Plan 02-06: VO PDF export with Chinese font
    Files:
      src/lib/export.ts                (add exportVOToPDF + ensureChineseFont)
      public/fonts/noto-sans-hk-subset.ttf  (vendored, ~250 KB)
      vite.config.ts                   (verify viewer-pdf chunk still in manualChunks)
    Acceptance:
      - PDF downloads with Chinese strings rendering (visual check)
      - Bundle CI guard still green (entry <800 KB)
      - Memory test on smallest supported iPhone — 6-thumbnail VO PDF generates without crash

Wave 4 — Admin + delegation + compliance
  Plan 02-07: Approval-chain admin UI
    Files:
      src/contexts/ApprovalChainContext.tsx
      src/pages/AdminProjectChains.tsx  (3-tab SI/VO/PTW)
      src/components/ChainStepRow.tsx
      src/App.tsx                       (add route /admin/projects/:id/chains)
      src/components/Sidebar.tsx        (admin link)
      Default-chain auto-seed migration (or RPC called from ProjectsContext.createProject)
    Acceptance:
      - Admin creates 3-step SI chain on test project
      - Default templates auto-seed on new project create
      - Save = delete+insert transaction works
      - Editing chain mid-flight doesn't affect submitted SI (snapshot wins) — Playwright

  Plan 02-08: Account-deletion guard UI + admin re-route
    Files:
      src/pages/Profile.tsx             (handle {blocked,pending} response from delete_my_account)
      src/pages/AdminUsers.tsx          (per-user "view in-flight approvals" + re-route button)
      src/components/InFlightApprovalsModal.tsx
      Apple compliance regression check  (RPC smoke for empty-account success path)
    Acceptance:
      - User with in-flight cannot delete; sees Chinese error
      - User with no in-flight deletes successfully (Apple compliance)
      - Admin can write admin_override row to clear the in-flight item, then user can delete

Wave 5 — Validation + walkthrough
  Plan 02-09: Playwright smoke + end-of-phase summary
    Files:
      tests/e2e/si-vo-smoke.spec.ts        (INF-08)
      tests/fixtures/seed-phase2.sql       (or extend scripts/seed-demos.js)
      supabase/tests/rls-smoke.sql         (final append: subcontractor_worker persona + delegation persona)
      .planning/phases/02-si-vo/02-09-SUMMARY.md  (mirrors 01-09-SUMMARY.md proof shape)
    Acceptance:
      - @si-vo-smoke green on Codemagic and local
      - rls-smoke 5-persona pass
      - Live TestFlight + Android internal build verified end-to-end
      - Bundle CI still green; entry chunk <800 KB
      - Apple compliance: account-deletion empty path still passes
```

**Dependency graph:**

```
02-01 (spine + bucket + rls-smoke baseline)
   |
   v
02-02 (types + libs + native deps)
   |
   +--> 02-03 (SI submit) --> 02-04 (SI approve + delegations + Home cards)
                                  |
                                  v
                              02-05 (VO submit) --> 02-06 (VO PDF)
                                                          |
                                                          +--> 02-07 (chain admin)
                                                                   |
                                                                   +--> 02-08 (delete guard)
                                                                            |
                                                                            v
                                                                         02-09 (smoke + summary)
```

Parallel-safe pairs (with discipline): 02-03 + 02-04 share UI shell; 02-07 + 02-08 independent of each other. Default to sequential.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `@capacitor-community/voice-recorder` will be Cap-8 compatible by Wave 2 OR a fork/fallback exists | §3, §9 P14 | HIGH — blocks SI voice memo. Wave 0 verification REQUIRED |
| A2 | OSM tile static usage at our scale stays under fair-use | §3, §9 P16 | LOW — drop static map, keep coords-only |
| A3 | OneSignal v1 not deprecated within Phase 2 timeline | §6 | LOW — works in prod today |
| A4 | jspdf + Noto Sans HK subset renders all common zh-HK glyphs in HK construction terminology | §7 | MEDIUM — generate subset against real PTW/SI/VO vocabulary; verify with sample-driven test |
| A5 | iOS WKWebView won't OOM on 6×200 KB JPEG embed | §7 | LOW — Phase 1 PDF used similar sizes |
| A6 | Trigger-maintained `total_amount_cents` is the right call vs `GENERATED ALWAYS AS STORED` | §4 | LOW — both work; trigger gives line-item subtotal recompute as bonus |
| A7 | Phase 0 `pg_net` extension already enabled in prod Supabase | §6 | LOW — `v5-push-notifications.sql` already uses it |
| A8 | `app_config` already holds `onesignal_rest_key` and `onesignal_app_id` (Phase 0) | §6 | LOW — verified via v5-split source |
| A9 | `count(*)`-based numbering is fine forever since SI/VO are append-only | §4 | LOW — D-13 locks append-only |
| A10 | Default chain auto-seed inside `ProjectsContext.createProject` is the right place (vs migration trigger) | §11 plan 02-07 | LOW — either works; planner picks |
| A11 | Realtime publication add for `si_versions` (not just `site_instructions`) is needed | §1, §4 | LOW — subcon needs to see approver edits live |
| A12 | Apple does NOT require re-review for an extension to `delete_my_account` returning structured error | §9 P9; §11 plan 02-08 | LOW — adding pre-check is non-destructive; account-deletion still possible |

---

## Open Questions (RESOLVED)

1. **RESOLVED: no push to prior approvers.** **`approve_with_edits` notification of previously-approved actors** — D-13 doesn't specify whether prior approvers get a notification (acknowledgement) when an editor changes the payload they already signed. Recommendation: NO push (rolls into next-step push fan-out only); the audit timeline + diff card surfaces the change on next visit. Confirm with user in discuss-phase if disputed.
2. **RESOLVED: MediaRecorder fallback + "skip voice" path; pre-recorded sample for E2E.** **Voice memo on Android emulator (BlueStacks)** — microphone may not be exposed. Need a "skip voice" path or pre-recorded sample for testing. Resolve in Plan 02-03 verification.
3. **RESOLVED: direct download (no preview), matches Phase 1.** **VO PDF preview before download** — Phase 1 PDF goes straight to download. Same for VO? Recommend same (less native bridge complexity). Confirm in Plan 02-06.
4. **RESOLVED: implemented in Plan 02-09 Task 2 via _pendingDeepLink queue + consumePendingDeepLink drained after AuthProvider loading=false.** **OneSignal deep-link routing on cold launch from digest push** — current `src/lib/push.ts` writes to `window.location.hash`. Cold-launch routing was implicitly validated in Phase 1 (drawings); the new `/inbox` (or `/home` per current sketch) deep link needs to handle the case where the app is mounting and AuthProvider is still loading. Recommendation: have push.ts queue the deep_link and apply after `loading === false`. CONCERNS already flags this as Fragile Area; Phase 2 inherits the risk.
5. **RESOLVED: implemented in Plan 02-08 (supabase/v9-default-chain-seed.sql) — trigger trg_seed_default_chain on projects + one-time backfill for existing projects.** **Default chain auto-seed** — D-16 says "auto-seeded on first project creation". For *existing* live projects on iOS App Store, who seeds them? Recommendation: add to `ProjectsContext.createProject` for new projects, plus a one-time migration backfill for existing projects, inside Plan 02-07.
6. **RESOLVED: SI+VO defaults auto-seed in Phase 2; PTW default deferred to Phase 3 (when safety_officer role exists).** **Auto-seed PTW chain default in Phase 2** — D-16 lists PTW default `[safety_officer, main_contractor]` but Phase 2 doesn't introduce `safety_officer` role (Phase 3 does). Recommendation: auto-seed SI + VO defaults in Phase 2; defer PTW default to Phase 3 when role exists.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Supabase Postgres + RLS + Storage + Realtime | All Phase 2 features | ✓ | live | — |
| `pg_cron` extension | D-07 digest | ✓ Supabase Free | bundled | External cron via Codemagic scheduled workflow (ugly) |
| `pg_net` extension | OneSignal HTTP fan-out from trigger | ✓ (Phase 0 uses it) | bundled | Edge Function (out of scope) |
| OneSignal v1 REST API | Push fan-out | ✓ | v1 | — |
| `app_config.onesignal_rest_key` | Server-side REST auth | ✓ (Phase 0) | n/a | Supabase Vault (no benefit; skip) |
| `@capacitor-community/voice-recorder` | SI voice memo | UNVERIFIED for Cap-8 | latest | Forked patch OR `MediaRecorder` web-only OR descope voice |
| `@capacitor/geolocation` 8.x | SI geo | ✓ likely | matches Cap 8 | Manual lat/lng input (UX downgrade) |
| `diff-match-patch` | SI version diff | ✓ npm | 1.0.5 | `jsdiff` (~50 KB) |
| Noto Sans HK font subset | VO PDF Chinese | needs vendoring | — | None acceptable; PDF without CJK is unusable |
| Playwright | INF-08 | ✓ Phase 1 set up | 1.59 | — |
| Codemagic mac_mini_m2 | iOS + Android builds | ✓ | free tier | — |

**Missing dependencies needing Wave 0 verification:** `@capacitor-community/voice-recorder` Cap-8 peer compatibility — this is the single biggest open risk.

---

## Project Constraints (from CLAUDE.md)

| Constraint | How honoured |
|---|---|
| Tech stack locked (React 19 + TS + Vite + Tailwind 3.4 + Capacitor 8 + Supabase) | Phase 2 adds two community plugins (voice, geo) and one font asset; no framework changes |
| Mobile-first (390px + 1600×900) | §8 UX patterns all designed for 390px first; chain admin desktop-friendly at md: |
| Storage budget (Supabase Free 1GB) | Voice ≤5 MB/SI; with drawings already in budget, monitor — see §9 P13 |
| Push budget (OneSignal Free) | Fatigue cap 3/user/day + digest is the explicit answer |
| Backwards compatible (live App Store users) | Phase 2 adds tables only; extends `delete_my_account` non-destructively; no destructive changes to existing tables |
| Apple compliance (account-deletion preserved) | §9 P9; Plan 02-08 verifies empty-account path still works |
| HK specifics (zh-HK, HKD, HK industry terms) | All UI strings inline zh-HK; line item categories use HK terminology (labour/material/preliminaries/contingency = 人工/物料/前期費用/暫定); HKD-only |
| Auth model locked | No changes — D-29 confirms |

NOTE: `package.json` (Phase 0/1) lists React 18.2 not 19. CLAUDE.md says React 19. Phase 2 will reuse whatever is installed. No upgrade in this phase.

---

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-si-vo/02-CONTEXT.md` — D-01..D-29 (locked)
- `.planning/REQUIREMENTS.md` — SI/VO/CHN/INF requirement IDs
- `.planning/ROADMAP.md` §"Phase 2"
- `.planning/PROJECT.md`, `.planning/STATE.md`
- `.planning/phases/01-drawings-on-progress-items/01-09-SUMMARY.md` — Phase 1 proof
- `.planning/codebase/STACK.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `ARCHITECTURE.md`, `INTEGRATIONS.md`, `CONCERNS.md`
- `supabase/v8-drawings.sql` — canonical v8-namespace pattern
- `supabase/v8-private-bucket-template.sql` — directly reused
- `supabase/tests/rls-smoke.sql` — directly extended
- `src/lib/export.ts`, `src/lib/push.ts`, `src/contexts/ProgressContext.tsx`, `src/types.ts` — reuse targets
- `supabase/v5-push-notifications.sql` + `v5-split/*` — push pattern precedent
- `supabase/v6-account-deletion.sql` — RPC extension target
- Postgres docs — `pg_advisory_xact_lock`, generated columns, `pg_cron`, `pg_net`

### Secondary (MEDIUM confidence)
- Supabase Free tier feature matrix for pg_cron + pg_net (verified via existing app usage)
- jspdf `addFont` / `addFileToVFS` API docs
- `@capacitor/geolocation` v8 plugin docs
- OpenStreetMap tile usage policy

### Tertiary (LOW confidence — Wave 0 verification required)
- `@capacitor-community/voice-recorder` Cap-8 peer dep declaration

---

## Metadata

**Confidence breakdown:**
- Architecture & DB shape: HIGH — direct extension of Phase 1 patterns; CONTEXT.md locked 29 decisions
- Approval state machine: HIGH — locked + standard Postgres pattern
- Push fan-out + digest: MEDIUM — pg_cron + pg_net both proven in Phase 0; burst behaviour at 08:00 HKT unverified
- Voice recorder: LOW-MEDIUM — Cap-8 compat unknown
- VO PDF: MEDIUM-HIGH — jspdf proven, Chinese font embedding new
- Plan split: HIGH — mirrors Phase 1 9/5 shape with proven success

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stack stable; voice recorder may shift)

---

## RESEARCH COMPLETE

**Phase:** 02 — SI / VO (工地指令 + 變更指令)
**Confidence:** HIGH on stack reuse and DB shape; MEDIUM on third-party plugins + pg_cron burst; LOW on `capacitor-community/voice-recorder` Cap-8 compat (Wave 0 verification gate).

### Key Findings
- Phase 2 = Phase 1 shape + state machine. Reuse `DrawingsContext` shape, `v8-private-bucket-template.sql`, `rls-smoke.sql` harness, jspdf export, OneSignal push pipeline.
- New private storage bucket `project-si-vo` follows v8 template verbatim.
- Shared approval-chain spine: `approval_chain_steps` (per project, per doc_type — including PTW slot for Phase 3) + `approvals` append-only + `delegations` + `notification_counters` + `notification_digest`.
- Push fan-out via SECURITY DEFINER `push_dispatcher` with atomic counter; overflow goes to `notification_digest`, drained by `pg_cron 0 0 * * * UTC` (= 08:00 HKT, no DST). HK-timezone safety documented in SQL comments to prevent future "fix".
- Per-project SI/VO numbering via `pg_advisory_xact_lock(hashtextextended('si:'||project_id::text,0))` inside the numbering helper.
- `delete_my_account()` extended non-destructively with `in_flight_approvals(user_id)` check returning Chinese-friendly error — Apple compliance preserved.
- VO `total_amount_cents` is **trigger-maintained** (recommended over `GENERATED ALWAYS AS STORED`) so line-item subtotals are also recomputed defensively.
- Single biggest risk: `@capacitor-community/voice-recorder` Capacitor 8 compat — Wave 0 verification gate in Plan 02-01.
- VO PDF requires vendoring Noto Sans HK subset; jspdf default fonts cannot render zh-HK.

### File Created
`C:\Users\user\construction-app\.claude\worktrees\sweet-goldstine-e99977\.planning\phases\02-si-vo\02-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|---|---|---|
| Standard stack | HIGH | All libraries proven in Phase 0/1 OR well-known Postgres extensions |
| Architecture | HIGH | CONTEXT.md locked 29 decisions; Phase 1 patterns directly reusable |
| Approval state machine | HIGH | Locked; standard append-only ledger |
| Push fan-out | MEDIUM | pg_cron + pg_net proven in Phase 0; burst at 08:00 HKT untested |
| Voice recorder | LOW-MEDIUM | Cap-8 compat unverified — Wave 0 gate |
| VO PDF | MEDIUM-HIGH | jspdf proven; Chinese font embedding novel for this codebase |
| Plan split | HIGH | Mirrors Phase 1's 9-plan/5-wave success |

### Open Questions (RESOLVED)
- RESOLVED: Plan 02-01 Task 7 produces CAPACITOR8-COMPAT.md verdict gating Plan 02-03 plugin choice (with MediaRecorder fallback path).
- RESOLVED: Voice memo testing — MediaRecorder fallback + pre-recorded sample for E2E.
- RESOLVED: VO PDF goes direct to download (matches Phase 1).
- RESOLVED: Cold-launch deep-link routing implemented in Plan 02-09 Task 2.
- RESOLVED: Default chain backfill + auto-seed trigger implemented in Plan 02-08 (v9-default-chain-seed.sql).
- RESOLVED: PTW default chain deferred to Phase 3 (safety_officer role lands there).

### Ready for Planning
Research complete. Planner can produce 9 plans across 5 waves per §11 split, with Plan 02-01 as critical-path Wave 0 gating everything else, and the `@capacitor-community/voice-recorder` Cap-8 verification as the highest-priority Wave 0 task.