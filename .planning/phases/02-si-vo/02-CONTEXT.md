# Phase 2: SI / VO (工地指令 + 變更指令) - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** `--auto` (recommended option auto-selected per gray area; logged inline)

<domain>
## Phase Boundary

Deliver the SI (Site Instruction) + VO (Variation Order) workflow on top of a **reusable per-project sequential approval chain** so that:

- A subcontractor foreman submits an SI (optionally version-pinned to one or more drawings from Phase 1).
- The project's admin-configured chain fires a push **only to the next required actor** (push-fatigue capped at 3/user/day, overflow → 08:00 HKT digest).
- Approvers may approve / approve-with-edits / request-revision / reject; edits are versioned, subcon sees a diff before next action.
- An MC can raise a VO against an approved SI with structured line items in HKD (`numeric(14,2)`, server-computed total).
- Once fully approved, both SI and VO are append-only / read-only forever; VO exportable to PDF.
- Account deletion blocks while user has in-flight approvals (Apple compliance preserved via admin re-route + delegation).

**Out of scope for this phase** — captured under `<deferred>`:
- PTW (Phase 3 reuses the chain + approvals tables).
- Multi-VO-per-SI (v1 caps at one).
- Parallel approvers (v1 sequential only).

</domain>

<decisions>
## Implementation Decisions

### Approval-chain infrastructure (shared with Phase 3)
- **D-01:** Chain config table = `approval_chain_steps(project_id, doc_type, step_order, required_role, optional_user_id)` — NOT JSONB on `projects`. Matches CHN-02 verbatim. Indexed by `(project_id, doc_type, step_order)`.
- **D-02:** Snapshot pattern: at submission time the chain rows are copied into `<doc>.chain_snapshot jsonb` (CHN-03). Mid-flight chain edits do not retroactively affect in-flight docs.
- **D-03:** **Append-only `approvals` table** with columns `(id, doc_type, doc_id, step_order, action_type, actor_id, reason, edits_jsonb, created_at)`. `action_type ∈ {approve, approve_with_edits, request_revision, reject, admin_override, delegate}`. Doc status is computed from `approvals` rows, never stored. Rejection is a new row, never a mutation (CHN-11).
- **D-04:** Next-actor resolution = SQL helper `active_role_holders(project_id, required_role)` returning `(user_id)` SET — handles user departure mid-chain (CHN-05). Resolved at **action time**, not submission time.
- **D-05:** `admin_override` requires `length(reason) >= 10` (CHN-06) — enforced as table-level CHECK on `approvals`. Override is logged as a distinct `action_type` and does NOT count as the required step's signoff (Phase 3 enforces this strictly for safety_officer; Phase 2 keeps the same semantics for SI/VO).

### Push-fatigue cap (3/user/day across SI/VO/PTW)
- **D-06:** Implementation = Postgres `notification_counters(user_id, hkt_date, count)` row, atomically incremented by a `push_dispatcher` SECURITY DEFINER function. If `count >= 3` after increment, the notification body is appended to `notification_digest(user_id, hkt_date, items_jsonb)` instead. **Recommended over OneSignal-side filters** because counter state must include OneSignal failures and pg-cron retries.
- **D-07:** Daily digest = `pg_cron` job at `0 0 * * *` UTC (i.e. 08:00 HKT). Sends one OneSignal push per user with the aggregated `items_jsonb`. Edge function not needed in v1 (no fan-out beyond ≤200 internal users).
- **D-08:** All notifications still flow through the existing `supabase/v5-split/` trigger pattern → `push_dispatcher` wrapper → OneSignal v1 `/notifications` API. Reuse `external_user_id = auth.user.id`.

### SI capture UX
- **D-09:** SI submission form layout (mobile-first, 390px):
  - 標題 (required text, ≤120 chars)
  - 描述 (required textarea, ≤4000 chars)
  - 圖則參照 (multi-select drawing picker from current project, **defaults to current `drawing_versions` row, badge says `v{n} (提交時最新)`** — version pinning is automatic; subcon can re-pick a specific version manually). Stores `drawing_version_id`.
  - 相片 (optional, multi-image upload — reuse Phase 1's private-bucket pattern; new bucket `project-si-vo`, path `{project_id}/si/{si_id}/v{n}/photos/{filename}`).
  - 語音備忘 (optional, single recording. Format: AAC `.m4a`, 48 kbps mono, ≤2 min. Capacitor's `@capacitor-community/voice-recorder` plugin OR browser `MediaRecorder` for web). Stored at `{project_id}/si/{si_id}/v{n}/voice.m4a`. Capped at 5 MB.
  - 位置 (optional, Capacitor `@capacitor/geolocation` — captures `(lat, lng, accuracy_m)` at submit, displays as a static OpenStreetMap tile thumbnail; no live map in v1).
- **D-10:** Auto-numbering `SI-001`, `SI-002`… per-project via Postgres sequence-per-project pattern (helper `next_si_number(project_id) returns text`). Atomic — uses `pg_advisory_xact_lock(project_id)` to avoid duplicate numbers under concurrent submission.
- **D-11:** Each SI row mirrors Phase 1's drawings pattern: `site_instructions(id, project_id, number, current_version_id, created_by, created_at, locked_at)` + `si_versions(id, si_id, version_no, payload jsonb, edits_by, created_at)`. SI body is JSONB inside `si_versions.payload` (title, description, drawing_version_ids[], photo_paths[], voice_path, lat, lng, accuracy_m) — never edited in-place (SI-05).

### Approver UX
- **D-12:** Approver detail screen shows: SI metadata header, latest payload, **diff card** comparing latest payload vs. payload at the previous version (field-by-field labelled diff — title 舊→新, description with line-level `+/-` marker, drawing-version pin changes highlighted). No git-style hunks (subcon-friendly).
- **D-13:** Four action buttons (always visible): `✓ 批准`, `✏ 批准並修改`, `↩ 退回 (要求修訂)`, `✗ 拒絕`.
  - 批准 → writes `approvals` row, no payload change, advances chain.
  - 批准並修改 → opens inline editor pre-filled with current payload; on save, creates new `si_versions` row + `approvals.action_type='approve_with_edits'` + advances chain. Subcon sees diff next time they open.
  - 退回 → requires `reason ≥ 10 chars`; resets chain to step 0 (subcon must re-submit). Records `request_revision` row.
  - 拒絕 → requires `reason ≥ 10 chars`; terminal state — no further actions allowed. Records `reject` row.
- **D-14:** Subcon-side protest comment (SI-09) = simple text-only append after lock; rendered in the timeline but does NOT change status or notify approvers (audit-only). Field on `protest_comments(si_id, author_id, body, created_at)`.

### Approval-chain admin UI
- **D-15:** Per-project admin page `/admin/projects/:id/chains` with a tab picker `[SI | VO | PTW]`. Each tab shows the ordered chain steps:
  - Drag-handle to reorder.
  - Each row: `required_role` (dropdown: pm / main_contractor / subcontractor / safety_officer / owner) + `optional_user_id` (autocomplete picker, optional override).
  - "+ Add step" button appends at end; trash icon removes.
  - Save writes all rows in one transaction (delete-then-insert by `(project_id, doc_type)` is acceptable in v1 because chain edits are rare and `chain_snapshot` already protects in-flight docs).
- **D-16:** Default chain template (auto-seeded on first project creation):
  - SI: `[main_contractor, pm]` (2 steps)
  - VO: `[main_contractor, pm, owner]` (3 steps)
  - PTW: `[safety_officer, main_contractor]` (2 steps — Phase 3)
  - Admin can modify per-project from day one.

### VO data model + UX
- **D-17:** `variation_orders(id, si_id UNIQUE, project_id, number, current_version_id, total_amount_cents bigint, created_by, locked_at)` — `UNIQUE(si_id)` enforces v1 cap of "one VO per SI". `total_amount_cents` is a **Postgres GENERATED ALWAYS AS (...)** column summing the latest `vo_line_items` snapshot inside `vo_versions.payload` (VO-05). Client cannot write it (column denial via RLS).
- **D-18:** `vo_line_items` lives inside `vo_versions.payload jsonb` as an array (no separate table) — same pattern as SI. Each item:
  ```
  {
    category: 'labour' | 'material' | 'preliminaries' | 'contingency',
    description: text,
    quantity: numeric,
    unit: text,
    unit_price_cents: bigint,
    subtotal_cents: bigint,          // server-recomputed on save
    progress_leaf_item_id: uuid|null // optional VO-03 linkage
  }
  ```
  Trigger on `vo_versions` recomputes each `subtotal_cents = round(quantity * unit_price_cents)` and the rolled-up `total_amount_cents` before insert (defence in depth alongside the generated column).
- **D-19:** VO submit confirmation screen displays the server total prominently as **"經系統核算總額 HK$X"** (VO-06). The same line is the source of truth for the PDF export and any downstream payment claim integration.
- **D-20:** progress_leaf_item linkage per line item = optional modal picker showing the project's progress tree (reuse `ProgressContext.items`). Used downstream for cost-attribution rollup — not exposed in v1 dashboards but data is captured now.

### VO PDF export
- **D-21:** Generated **client-side** with existing `jspdf` + `jspdf-autotable` (already in `src/lib/export.ts`) → matches established pattern. New helper `exportVOToPDF(vo, version, drawings)`. **Recommended over server-side puppeteer** to avoid an Edge function and to keep export latency low.
- **D-22:** PDF layout (A4 portrait, all zh-HK):
  - Header: project name, VO number, status badge, approval timeline (table of approvals).
  - Section 1: SI reference + locked SI summary.
  - Section 2: Line items table per category (labour / material / preliminaries / contingency) via `autoTable`.
  - Section 3: 經系統核算總額 (large, bold).
  - Section 4: Drawing thumbnails — for each referenced `drawing_version_id`, fetch signed URL → fetch blob → embed as base64 (PNG ≤200 KB resized client-side). Cap at 6 thumbnails per page; paginate if more.
  - Footer: generated-at timestamp + system disclaimer.

### Delegation (CHN-10)
- **D-23:** Self-service delegation lives in **Profile page** as new section `我嘅代理 / 我是…的代理`. User picks a delegate (autocomplete of project members) + date range (valid_from / valid_until, dates only — HKT day boundaries). Writes to `delegations(user_id, delegate_to, valid_from, valid_until)` table.
- **D-24:** `active_role_holders()` helper checks `delegations` table at action time: if the resolved user has an active delegation, the chain step is offered to the delegate instead. Both original + delegate names are stamped in the resulting `approvals.actor_id` (delegate is the actor; `delegated_for_user_id` is added as a column on `approvals`).
- **D-25:** Account deletion (`delete_my_account` RPC, Apple compliance) **blocks** with Chinese-friendly error if `in_flight_approvals(user_id) > 0` (CHN-09). Admin "force delete" via re-routing flow: admin selects another role-holder or sets a delegation, then deletion proceeds (logged as `admin_override`).

### Realtime + RLS
- **D-26:** Realtime publication adds: `site_instructions`, `si_versions`, `variation_orders`, `vo_versions`, `approvals`, `delegations` — so approver and subcon screens auto-refresh on transitions.
- **D-27:** RLS helpers `can_view_si(uid, si_id)` and `can_view_vo(uid, vo_id)` = SECURITY DEFINER, mirror Phase 1's `can_view_project` pattern. Visibility rules:
  - SI: project members can view (any approved `project_members` row + admin + PM in `assigned_pm_ids`).
  - VO: same as SI (`can_view_si(parent_si)`).
  - approvals: visible to anyone who can view the parent doc.
  - chain config + delegations: visible to project members; writable by admin/PM only.

### Bundle discipline (carry forward from Phase 1)
- **D-28:** Add `manualChunks` entries for VO PDF export (`jspdf` + `jspdf-autotable` → already chunked from Phase 1's INF-06; verify still under 800 KB entry). Voice recorder code (Capacitor plugin) lives in main bundle (small).
- **D-29:** Bundle-size CI guard from Phase 1 stays in place. Phase 2 plans must not regress entry chunk > 800 KB.

### Claude's Discretion
- Diff-card visual style (colour, spacing) — design contract in `/gsd-ui-phase 2`.
- Voice recorder waveform vs. simple `0:00 / 2:00` counter — UI phase decides.
- Geolocation tile provider (OSM vs. static thumbnail vendor) — researcher to recommend.
- Push notification deep-link URL shape — extend existing `#/...` hash router, exact shape decided by planner.

### Folded Todos
*(None — no pending todos matched Phase 2 scope.)*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements (Phase 2 scope)
- `.planning/ROADMAP.md` §"Phase 2: SI / VO (工地指令 + 變更指令)" — goal, success criteria, dependencies.
- `.planning/REQUIREMENTS.md` §"Site Instructions (SI)" (SI-01…SI-11), §"Variation Orders (VO)" (VO-01…VO-10), §"Approval Chains (CHN)" (CHN-01…CHN-11), §"Cross-Cutting Infrastructure" (INF-01, INF-03, INF-04, INF-08 share).
- `.planning/PROJECT.md` — project vision, Hong Kong context, Apple/Play compliance constraints.

### Prior Phase context (lock these patterns)
- `.planning/phases/01-drawings-on-progress-items/01-CONTEXT.md` — D-01..D-32 from Phase 1. Reuse: private bucket template, signed URLs, RLS helper shape, `manualChunks` discipline, 4-button-action grammar.
- `.planning/phases/01-drawings-on-progress-items/01-09-SUMMARY.md` — end-to-end walkthrough proof; SI design contract should mirror the upload-bottom-sheet pattern (D-01) and timeline shape (D-13).
- `supabase/v8-drawings.sql` — canonical example of v8-namespace migration (helper + RPC + trigger + RLS + realtime). Phase 2 migration namespace is `v9-`.
- `supabase/v8-private-bucket-template.sql` — INF-02 template; Phase 2 bucket `project-si-vo` follows the same template.
- `supabase/tests/rls-smoke.sql` — INF-04 3-persona harness; extend with SI/VO assertions in Phase 2.

### Codebase research (existing patterns to lean on)
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md` — HK construction SI/VO/PTW industry patterns (read before planning).
- `.planning/codebase/STACK.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/INTEGRATIONS.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/TESTING.md`.
- `src/lib/export.ts` — existing `jspdf` + `jspdf-autotable` pattern for `exportProgressToPDF` / `exportProjectsToExcel`; copy shape for `exportVOToPDF`.
- `src/lib/supabase.ts` — singleton client with 15s `fetchWithTimeout`, realtime tuned to 10 events/s.
- `src/lib/push.ts` — Capacitor push registration + OneSignal `external_user_id` upsert; SI/VO notification triggers reuse this pipeline.
- `src/contexts/ProgressContext.tsx` — model for `SiContext` + `VoContext` (per-project scoped, fetch + mutate + realtime channel).
- `src/types.ts` — append `SI`, `VO`, `Approval`, `ChainStep`, `Delegation` + ZH enum maps (`SI_STATUS_ZH`, `VO_STATUS_ZH`, `APPROVAL_ACTION_ZH`).
- `src/pages/ProjectDetail.tsx` — existing tab pattern (`progress | issues`) extends to `progress | issues | si-vo`.
- `supabase/v5-split/` — push notification trigger pattern; new SI/VO triggers follow same numbering (`v9-split-si-notifications.sql`, etc., per planner).

### Cross-platform / native
- `capacitor.config.ts` + `@capacitor/geolocation` (new dep), `@capacitor-community/voice-recorder` or fallback `MediaRecorder` (researcher to confirm Capacitor 8 compatibility on iOS + Android).
- `ios/App/App/Info.plist` — verify `NSLocationWhenInUseUsageDescription` (zh-HK) + `NSMicrophoneUsageDescription` (zh-HK) are present; add if missing during Phase 2 plan.
- `android/app/src/main/AndroidManifest.xml` — verify `ACCESS_FINE_LOCATION` + `RECORD_AUDIO` permissions.

### Apple compliance
- `v6-account-deletion.sql` — `delete_my_account` RPC must be extended in Phase 2 to block on in-flight approvals (CHN-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 1 `drawings` + `drawing_versions` table shape** — copy the (root + versions) pattern verbatim for `site_instructions + si_versions` and `variation_orders + vo_versions`.
- **Phase 1 `can_view_project` + `can_upload_drawing` RLS helpers** — `can_view_si`/`can_view_vo` follow the same `security definer set search_path = public` pattern; new `can_act_on_chain_step(uid, doc_type, doc_id)` helper for write gating.
- **Phase 1 private bucket template (`v8-private-bucket-template.sql`)** — `project-si-vo` bucket = identical wiring with new path scheme `{project_id}/{doc_type}/{doc_id}/v{n}/...`.
- **`jspdf` + `jspdf-autotable` in `src/lib/export.ts`** — already chunked from Phase 1; new `exportVOToPDF` slots in alongside `exportProgressToPDF`.
- **OneSignal push pipeline (`src/lib/push.ts` + `supabase/v5-split/`)** — push fan-out trigger pattern is already proven; new SI/VO triggers reuse `pushLogoutUser`-style `SECURITY DEFINER` wrapping.
- **Profile page (`src/pages/Profile.tsx`)** — add `Delegations` section without scaffolding a new page.
- **`AppLayout.tsx` + `Sidebar.tsx` + `BottomNav.tsx`** — extend with a top-level `SI/VO` icon when inside a project (or under "更多" if mobile bottom nav is full).
- **`ProtectedRoute requireAdmin`** — already gates `/admin/*`; new `/admin/projects/:id/chains` reuses it.
- **Existing `PendingApprovalCard` (project-member apply/approve)** — *different concept* but visual grammar (status badge + actor + actions) is a useful template for SI/VO approver cards.

### Established Patterns
- **Contexts are per-domain + per-project** — `SiContext` and `VoContext` mount inside `ProjectDetail`, mirror `ProgressContext`/`IssuesContext` shape (fetch + mutate + realtime subscription scoped by `projectId`).
- **Mutations return `Promise<{ error: string | null }>`** — keep this contract for SI/VO submit, approve, reject.
- **Chinese UI inline (no i18n library)** — enum→ZH maps in `src/types.ts`; INF-09 from Phase 1.
- **Migration filenames** — `v9-si-vo-schema.sql`, `v9-approval-chain-schema.sql`, `v9-si-rls.sql`, `v9-vo-rls.sql`, etc. Skip any contested intermediate version letters.
- **Append-only audit** — `approvals` table is INSERT-only; no UPDATE/DELETE RLS policies. Mirrors Phase 1's drawing-version supersession pattern (no destructive deletes).
- **Realtime publication membership** — every new table gets `alter publication supabase_realtime add table ...` at end of migration.

### Integration Points
- **`src/App.tsx` route additions**: `/project/:id/si`, `/project/:id/si/:siId`, `/project/:id/vo/:voId`, `/admin/projects/:id/chains`. Add inside the existing `<HashRouter>` block.
- **`src/pages/ProjectDetail.tsx` tabs**: extend `Tab = 'progress' | 'issues'` to include `'si-vo'`; lazy-load `SiVoList` to keep entry chunk slim.
- **`src/lib/export.ts`**: new `exportVOToPDF(vo, version, drawings)` function.
- **`src/contexts/AuthContext.tsx`**: no change required; SI/VO contexts consume the same session.
- **OneSignal**: no new player setup; reuse `external_user_id` already in place.
- **Codemagic `codemagic.yaml`**: verify Phase 2 bundle stays under 800 KB; no other workflow changes needed.

</code_context>

<specifics>
## Specific Ideas

- **HK realism:** the diff card should make it obvious when an approver tightens scope (主判 削減) vs. expands scope — colour-code "added work" vs. "removed work" in the description diff. This is the typical 扯皮 surface and must survive month-end disputes.
- **VO line-item arithmetic:** every cent matches. Storage as `bigint` cents; display as `HK$1,234,567.89` with thousands separator (zh-HK locale).
- **Voice memo:** keep to 2 min cap because subcons tend to ramble — short memos force them to also write a description, which is what approvers actually read.
- **Push spam:** 3/day cap is the user's explicit constraint — the digest at 08:00 HKT must be present even on weekends (HK sites typically work Mon–Sat).
- **Snapshot first, query later:** every doc gets a `chain_snapshot jsonb` at submit time so retroactive chain edits never affect in-flight 扯皮.
- **Reject is terminal; Return is retry.** Different colours, different downstream consequences. Subcons must be visually clear which is which.

</specifics>

<deferred>
## Deferred Ideas

- **PTW chain reuse** — Phase 3 reuses `approval_chain_steps` + `approvals` + `delegations` + `notification_counters` tables. Schema is designed today; PTW-specific columns added in Phase 3 (e.g. `permit_type`, `valid_from`, `valid_to`, `qr_jwt`). Out of scope this phase.
- **Multi-VO per SI** — v1 enforces `UNIQUE(si_id)` on VO. Future v2 will likely need this for staged VOs (initial estimate → revised). Capture as Phase 2.x / v2 backlog.
- **Parallel approvers** — v1 is sequential only (CHN-04). Some clients want "any 2 of 3 PMs sign" — defer to v2.
- **Payment-claim integration** — VO is the source of truth for cost, but the payment claim flow (`應收 / 已收 / 入賬`) is a separate domain. Phase 4 candidate.
- **Cost-attribution dashboard** — `VO line item → progress_leaf_item_id` linkage is captured now (D-20) but rollup widget (per-zone / per-category cost) is deferred to a future analytics phase.
- **Server-side PDF rendering** — if PDF size/quality complaints arise, migrate to Puppeteer Edge function. v1 stays client-side.
- **OneSignal segment-based fatigue** — if 3/day cap proves insufficient for spammy projects, move to OneSignal-side per-segment dedup. v1 stays in Postgres.
- **Drawing version "auto-bump"** — when a referenced drawing supersedes after SI submission, SI keeps the pinned version but UI could show a "new version available" badge. Defer to v2; v1 just shows the pinned `v{n}`.

### Reviewed Todos (not folded)
*(None reviewed — no pending todos matched Phase 2 scope.)*

</deferred>

---

*Phase: 02-si-vo*
*Context gathered: 2026-05-13 — auto mode, single pass.*
