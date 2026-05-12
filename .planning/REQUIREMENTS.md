# Requirements: CK工程 / 工地控制系統 Milestone

**Defined:** 2026-05-11
**Core Value:** 判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes.

This is a brownfield milestone on a live app. Existing v1 capabilities (auth, projects, progress, issues, push, etc.) are tracked as **Validated** in PROJECT.md. The requirements below are NEW capabilities for the 工地控制系統 milestone.

## v1 Requirements

### Drawings (DRW)

- [ ] **DRW-01**: PM / MC / admin can upload one or more drawings (JPEG / PNG / PDF) to any **leaf** progress item
- [ ] **DRW-02**: Each drawing has a version number, uploaded_by, uploaded_at, and revision label
- [ ] **DRW-03**: Uploading a new version of an existing drawing supersedes the prior version (does NOT delete it)
- [ ] **DRW-04**: All members of a project can view drawings on that project; non-members cannot
- [ ] **DRW-05**: Drawings render in a mobile pinch-zoom / pan viewer (lazy-loaded)
- [ ] **DRW-06**: PDF drawings render page-by-page in the viewer with self-hosted worker
- [ ] **DRW-07**: A thumbnail (256×256) is generated client-side on upload and shown in lists
- [ ] **DRW-08**: Upload warns at >5 MB, hard-blocks at >25 MB
- [ ] **DRW-09**: User can view drawing version history with effective-from / effective-until dates
- [ ] **DRW-10**: "Current" version is visually distinct from "Superseded" / "Withdrawn" — large badge, min 16pt, high-contrast colors
- [ ] **DRW-11**: A drawing cannot be hard-deleted once a non-uploader has viewed it (withdraw only)
- [ ] **DRW-12**: Drawings storage uses a **private** Supabase bucket with `(storage.foldername(name))[1] = project_id` RLS pattern
- [ ] **DRW-13**: Drawing URLs are signed (TTL ≤ 1 hour) — never public
- [ ] **DRW-14**: Default list sort = `created_at desc`; search by title substring
- [ ] **DRW-15**: subcontractor / subcontractor_worker / owner roles see view-only (no upload button)

### Site Instructions (SI)

- [ ] **SI-01**: Subcon foreman (any subcon or subcontractor_worker role on the project) can submit a Site Instruction request
- [ ] **SI-02**: SI has: title, description (free text), optional photo attachments, optional voice memo, optional location (Capacitor Geolocation)
- [ ] **SI-03**: SI can reference one or more drawings; reference is **version-pinned** (`drawing_version_id`, not `drawing_id`)
- [ ] **SI-04**: Each SI is auto-numbered per-project (`SI-001`, `SI-002`…)
- [ ] **SI-05**: After submission, the SI row is immutable — any change creates a new `si_versions` row, never mutates the original
- [ ] **SI-06**: SI follows the project's configured approval chain (see CHN-*)
- [ ] **SI-07**: At each chain step, the assigned approver can: approve / approve-with-edits (creates new version) / request-revision (sends back to subcon) / reject (with reason)
- [ ] **SI-08**: Approver edits are versioned and visible to subcon as a diff before next action
- [ ] **SI-09**: Subcon can add a "protest comment" to any approved SI without blocking workflow (audit-only)
- [ ] **SI-10**: Once fully approved, SI is locked — read-only forever, no edits, no deletion
- [ ] **SI-11**: SI status displayed as Chinese label: 草稿 / 待批准 / 已批准 / 已退回 / 已拒絕 / 已鎖定

### Variation Orders (VO)

- [ ] **VO-01**: Subcon can raise a VO from any approved SI (one VO per SI maximum in v1)
- [ ] **VO-02**: VO has structured line items: 描述 / 數量 / 單位 / 單價 / 小計, categorized as labour / material / preliminaries / contingency
- [ ] **VO-03**: Each VO line item is optionally linked to a `progress_leaf_item_id` (connects cost to physical work)
- [ ] **VO-04**: All currency stored as `numeric(14,2)` in HKD only; arithmetic in integer cents in JS until display
- [ ] **VO-05**: `total_amount` is **server-computed** (Postgres generated column or trigger); client cannot write it
- [ ] **VO-06**: Submission confirmation page displays the server-confirmed total as "經系統核算總額 HK$X"
- [ ] **VO-07**: VO follows the project's configured approval chain (typically same chain as SI, configurable)
- [ ] **VO-08**: After full approval, VO is locked and exportable to PDF
- [ ] **VO-09**: VO PDF export includes all line items + totals + approval timeline + drawing thumbnails
- [ ] **VO-10**: VO list view supports filter by status and date range

### Approval Chains (CHN — shared SI / VO / PTW infrastructure)

- [ ] **CHN-01**: Admin can configure a per-project approval chain for each doc_type (SI / VO / PTW)
- [ ] **CHN-02**: Each chain step is stored as `(project_id, doc_type, step_order, required_role, optional_user_id)` — NOT JSONB on projects
- [ ] **CHN-03**: At submission time, the chain is snapshotted into the doc's `chain_snapshot jsonb` — mid-flight chain edits do not affect in-flight docs
- [ ] **CHN-04**: Approval action by step N unlocks step N+1; sequential only (no parallel approvers in v1)
- [ ] **CHN-05**: At step N, the next approver is resolved at action time via `active_role_holders(project_id, required_role)` — survives user departure
- [ ] **CHN-06**: An admin can `override` any pending step with mandatory reason text (≥10 chars); override is logged as `action_type='admin_override'` in audit (NOT as a regular approval)
- [ ] **CHN-07**: Push notification fires on each transition, addressed ONLY to the next required actor (not the whole chain)
- [ ] **CHN-08**: Hard cap: 3 push notifications per user per day across SI/VO/PTW combined; overflow → daily 08:00 digest
- [ ] **CHN-09**: Account deletion blocks if the user has in-flight approvals; admin can override via re-routing
- [ ] **CHN-10**: A `delegations(user_id, delegate_to, valid_from, valid_until)` table lets a user delegate signoffs while on leave
- [ ] **CHN-11**: All approvals are **append-only** rows in an `approvals` table; status is computed from rows, never stored; rejection is a new row, not mutation

### Permit-to-Work (PTW)

- [ ] **PTW-01**: New global role `safety_officer` added to `user_profiles.global_role` CHECK constraint
- [ ] **PTW-02**: `safety_officer` is included in `delete_my_account()` cleanup (Apple compliance preserved)
- [ ] **PTW-03**: Schema supports all 7 permit types: `hot_work` / `confined_space` / `work_at_height` / `lifting` / `excavation` / `electrical` / `scaffold` (Chinese labels: 動火 / 密閉空間 / 高空 / 吊運 / 掘地 / 電力 / 棚架)
- [ ] **PTW-04**: UI fully implemented for top 3 types: 動火, 高空, 吊運; other 4 stub-render "敬請期待" placeholder
- [ ] **PTW-05**: Subcon foreman fills permit request: type, work description, zone, workers list, valid_from/valid_until (HKT timezone), uploads required photos (PPE, equipment)
- [ ] **PTW-06**: Per-permit-type checklist questions (e.g. 動火: fire watch, extinguisher present, hot-work area shielded) shown as required fields
- [ ] **PTW-07**: PTW follows project approval chain typically configured as: subcon foreman → safety officer → MC site agent (sequential)
- [ ] **PTW-08**: Safety officer signoff requires `global_role = 'safety_officer'` (admin override is logged separately and does not satisfy the safety step)
- [ ] **PTW-09**: When fully approved, permit transitions to `active` and a signed JWT-encoded QR code is generated (payload: `permit_id`, `valid_until`, `zone_id`, signed with `app_config.ptw_qr_secret`)
- [ ] **PTW-10**: QR verification screen requires login and shows large worker photo + permit details; scans logged to `permit_scans` audit table
- [ ] **PTW-11**: Permits auto-expire at HKT 23:59 same day via `pg_cron` job (15:59 UTC). Overnight-permit flag extends to next-day 07:00 HKT with explicit safety officer approval
- [ ] **PTW-12**: All datetime columns are `timestamptz`; expiry computed server-side using `at time zone 'Asia/Hong_Kong'` — never client clock
- [ ] **PTW-13**: End-of-day close-out requires foreman signature; 動火 requires 30-minute fire-watch countdown before close-out is allowed
- [ ] **PTW-14**: Permit audit archive is read-only forever; no destructive delete
- [ ] **PTW-15**: Dashboard shows "live permits now" widget (per-project, per-type counts)
- [ ] **PTW-16**: PTW feature is gated by `app_config.ptw_enabled` feature flag for Apple submission decoupling
- [ ] **PTW-17**: State-changing actions (submit, signoff, close-out) require live connectivity; offline shows "需要網絡連接" banner. Read-only views work offline from cache.

### Cross-Cutting Infrastructure (INF)

- [ ] **INF-01**: New migration namespace `v8-` for Phase 1, `v9-` for Phase 2, `v10-` for Phase 3 (skip contested v5/v6/v7)
- [ ] **INF-02**: Private Storage bucket template extracted to a reusable SQL helper used by all 3 phases
- [ ] **INF-03**: New RLS helpers (`can_view_drawing`, `can_view_si`, `can_view_vo`, `can_view_ptw`) marked `security definer set search_path = public`
- [ ] **INF-04**: `supabase/tests/rls-smoke.sql` exercises 3 fake-user perspectives (admin, MC of project A, subcon of project B) and asserts each `select count(*)` on new tables
- [ ] **INF-05**: `demo_feedback` over-permissive RLS fixed (ride-along in Phase 1 migration)
- [x] **INF-06**: Vite `manualChunks` config splits drawing-viewer / pdf / signature / qr libs from main bundle; entry chunk stays <800 KB
- [x] **INF-07**: Bundle-size CI check fails PR if entry chunk >800 KB or new chunk >400 KB
- [ ] **INF-08**: At least one Playwright smoke test per phase covering happy-path flow (DRW upload+view; SI submit+approve; PTW submit+sign+activate)
- [ ] **INF-09**: All new Chinese UI strings follow existing inline convention (no i18n library); enum→Chinese maps in `src/types.ts`

## v2 Requirements

Deferred to a future milestone.

### Drawings v2

- **DRW-V2-01**: Drawing markup / annotation tools
- **DRW-V2-02**: Template drawings shared across projects (with copy-to-project semantics)
- **DRW-V2-03**: Server-side thumbnail Edge Function (if client-side proves slow on large PDFs)
- **DRW-V2-04**: Chinese-aware sort (pinyin / stroke count) for drawing titles

### SI/VO v2

- **SI-V2-01**: Multiple VOs per SI
- **SI-V2-02**: Per-line subcon comment threads
- **SI-V2-03**: Multi-currency VO (HKD/RMB/USD)
- **SI-V2-04**: Real-time collaborative SI/VO drafts (operational transform)

### PTW v2

- **PTW-V2-01**: UI for permit types 4–7 (密閉空間 / 掘地 / 電力 / 棚架)
- **PTW-V2-02**: Permit auto-renewal across days (with risk-reassessment gate)
- **PTW-V2-03**: Offline-queued PTW submission with idempotency keys

### Notifications v2

- **NOTF-V2-01**: OneSignal action buttons (one-tap approve from push) — requires SDK migration

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drawing markup / annotation in v1 | 4-week project on its own; bundle bloat. Screenshot into 問題 instead. |
| Drawing OCR / search inside PDFs | HK PDFs are low-DPI scans; 60–70% accuracy = false expectation. |
| VO multi-currency | HKD only. FX + rate-locking complexity not worth thin RMB minority. |
| SI / VO retroactive entry (backdating) | Destroys trust value. App-time stamps authoritative. |
| Real-time collaborative SI / VO drafts | Single-author 95% of usage. Op-transform = scope creep. |
| Permit auto-renewal across days | Each shift = fresh risk assessment + atmosphere check (CoP). |
| PTW types 4–7 UI in v1 | Schema ready, UI stub. Build by demand. |
| VO parallel approvers (architect AND QS simultaneously) | HK contracts almost always sequential. Sequential chain only in v1. |
| Per-line subcon comment threads on SI/VO | Turns status doc into Slack. One comment per transition. |
| Offline-queued signoffs (PTW, SI) | Signature timestamps are evidentiary — drift-corrupted = worse than nothing. |
| OneSignal action-buttons in push | Needs SDK migration; defer to v2. Tap-to-open is fine. |
| MS Project / Primavera export | Separate integration phase. |
| Drawing markup / annotation | See above. |
| Cross-project drawing sharing (templates) | Defer to v2; in v1 each project has own copies — storage cheap, trust precious. |
| Voice transcription on SI voice memo | Audio playback only in v1; transcription is a v2 nice-to-have. |
| QR code scanner inside app | Verification screen is in-app navigation only; out-of-app scanning is OS camera role. |
| Real-time location tracking of workers | Privacy-invasive; HK law-sensitive. Out of scope this milestone. |
| Public verification URL for QR | All verification requires login. No anonymous endpoint. |

## Traceability

Populated by roadmapper on 2026-05-11.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DRW-01 | Phase 1 | Pending |
| DRW-02 | Phase 1 | Pending |
| DRW-03 | Phase 1 | Pending |
| DRW-04 | Phase 1 | Pending |
| DRW-05 | Phase 1 | Pending |
| DRW-06 | Phase 1 | Pending |
| DRW-07 | Phase 1 | Pending |
| DRW-08 | Phase 1 | Pending |
| DRW-09 | Phase 1 | Pending |
| DRW-10 | Phase 1 | Pending |
| DRW-11 | Phase 1 | Pending |
| DRW-12 | Phase 1 | Pending |
| DRW-13 | Phase 1 | Pending |
| DRW-14 | Phase 1 | Pending |
| DRW-15 | Phase 1 | Pending |
| SI-01 | Phase 2 | Pending |
| SI-02 | Phase 2 | Pending |
| SI-03 | Phase 2 | Pending |
| SI-04 | Phase 2 | Pending |
| SI-05 | Phase 2 | Pending |
| SI-06 | Phase 2 | Pending |
| SI-07 | Phase 2 | Pending |
| SI-08 | Phase 2 | Pending |
| SI-09 | Phase 2 | Pending |
| SI-10 | Phase 2 | Pending |
| SI-11 | Phase 2 | Pending |
| VO-01 | Phase 2 | Pending |
| VO-02 | Phase 2 | Pending |
| VO-03 | Phase 2 | Pending |
| VO-04 | Phase 2 | Pending |
| VO-05 | Phase 2 | Pending |
| VO-06 | Phase 2 | Pending |
| VO-07 | Phase 2 | Pending |
| VO-08 | Phase 2 | Pending |
| VO-09 | Phase 2 | Pending |
| VO-10 | Phase 2 | Pending |
| CHN-01 | Phase 2 | Pending |
| CHN-02 | Phase 2 | Pending |
| CHN-03 | Phase 2 | Pending |
| CHN-04 | Phase 2 | Pending |
| CHN-05 | Phase 2 | Pending |
| CHN-06 | Phase 2 | Pending |
| CHN-07 | Phase 2 | Pending |
| CHN-08 | Phase 2 | Pending |
| CHN-09 | Phase 2 | Pending |
| CHN-10 | Phase 2 | Pending |
| CHN-11 | Phase 2 | Pending |
| PTW-01 | Phase 3 | Pending |
| PTW-02 | Phase 3 | Pending |
| PTW-03 | Phase 3 | Pending |
| PTW-04 | Phase 3 | Pending |
| PTW-05 | Phase 3 | Pending |
| PTW-06 | Phase 3 | Pending |
| PTW-07 | Phase 3 | Pending |
| PTW-08 | Phase 3 | Pending |
| PTW-09 | Phase 3 | Pending |
| PTW-10 | Phase 3 | Pending |
| PTW-11 | Phase 3 | Pending |
| PTW-12 | Phase 3 | Pending |
| PTW-13 | Phase 3 | Pending |
| PTW-14 | Phase 3 | Pending |
| PTW-15 | Phase 3 | Pending |
| PTW-16 | Phase 3 | Pending |
| PTW-17 | Phase 3 | Pending |
| INF-01 | Phase 1 | Pending |
| INF-02 | Phase 1 | Pending |
| INF-03 | Phase 1 (introduce); extended in Phase 2 & 3 | Pending |
| INF-04 | Phase 1 (introduce); extended in Phase 2 & 3 | Pending |
| INF-05 | Phase 1 | Pending |
| INF-06 | Phase 1 | Complete |
| INF-07 | Phase 1 | Complete |
| INF-08 | Cross-phase (one smoke test per phase: P1 DRW, P2 SI, P3 PTW) | Pending |
| INF-09 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 62 unique REQ-IDs
- Mapped to phases: 62/62 (100%)
- Unmapped: none
- Cross-phase items: INF-03, INF-04 (introduce-then-extend), INF-08 (one smoke test per phase)

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 — Traceability populated by roadmapper.*
