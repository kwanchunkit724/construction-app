# Roadmap: 工地控制系統 (Site Control System)

**Milestone:** 工地控制系統
**Created:** 2026-05-11
**Granularity:** coarse (3 phases, user-fixed)
**Coverage:** 62/62 v1 requirements mapped (INF-08 spans all 3 phases)

## Phases

- [ ] **Phase 1: 圖則附加 (Drawings on Progress Items)** — Attach versioned drawings to leaf progress items with private storage; establish RLS/bundle/migration patterns for the milestone.
- [ ] **Phase 2: SI / VO (工地指令 + 變更指令)** — Subcon→MC approval flow with admin-configurable chain infrastructure (reused by PTW); structured VO line items with server-computed totals.
- [ ] **Phase 3: PTW (工作許可證)** — Permit-to-work for top-3 high-risk activities with new safety_officer role, signed-JWT QR codes, server-side HKT expiry, and read-only audit archive.

## Phase Details

### Phase 1: 圖則附加 (Drawings on Progress Items)
**Goal**: PMs and main contractors can attach versioned drawings to leaf progress items so every team member on a project sees the exact, current revision that governs the work — with a private-bucket + RLS template that all subsequent phases inherit.
**Depends on**: Nothing (first phase of milestone)
**Requirements**: DRW-01, DRW-02, DRW-03, DRW-04, DRW-05, DRW-06, DRW-07, DRW-08, DRW-09, DRW-10, DRW-11, DRW-12, DRW-13, DRW-14, DRW-15, INF-01, INF-02, INF-03 (introduce), INF-04 (introduce), INF-05, INF-06, INF-07, INF-08 (Phase 1 share: DRW upload+view smoke test), INF-09
**Success Criteria** (what must be TRUE):
  1. A PM uploads a PDF drawing to a leaf progress item; another team member on a different device opens the same item and sees the drawing thumbnail and full pinch-zoom view within ~5 seconds.
  2. A subcontractor / subcontractor_worker / owner on the project can view all drawings on that project but sees no upload button anywhere; a user who is NOT a member of the project cannot resolve a signed URL for any drawing in that project.
  3. Uploading a new revision shows the new version with a large, high-contrast "現行" badge, and the prior version is visibly marked "已取代" but still openable from the version-history view with effective-from/until dates; nothing was hard-deleted.
  4. Upload of an 8 MB file shows a soft warning and proceeds; upload of a 30 MB file is hard-blocked with a Chinese error message; thumbnails (256×256) appear in lists.
  5. The deployed entry chunk is <800 KB and the CI bundle-size check fails any PR that breaches the budget; the drawing-viewer / pdf libs load only when a user opens a drawing.
**Plans**: 9 plans
- [x] 01-01-PLAN.md — Migration v8-drawings.sql + private bucket template + rls-smoke harness (INF-01/02/03/04/05, DRW-12/13)
- [x] 01-02-PLAN.md — Vite manualChunks + bundle-size CI guard + export.ts lazy refactor (INF-06/07)
- [x] 01-03-PLAN.md — Install @capacitor/camera + @capacitor/filesystem + cap sync (DRW-01 native enablement)
- [x] 01-04-PLAN.md — Install react-zoom-pan-pinch + react-pdf + PDF.js worker self-host + DRAWING_STATUS_ZH types (INF-09, DRW-05/06)
- [x] 01-05-PLAN.md — DrawingsContext + lib helpers + thumbnail generator (DRW-07/08/13, DRW-03/11)
- [x] 01-06-PLAN.md — DrawingThumbnail + DrawingUploadSheet + DrawingViewer + version history + page navigator (DRW-05..11)
- [ ] 01-07-PLAN.md — Wire DrawingsSection into ProgressItemCard + mount DrawingsProvider in ProjectDetail (DRW-01/02/03/04/09/11/14/15)
- [ ] 01-08-PLAN.md — Playwright config + drawings.spec.ts smoke test + seed extension (INF-08 Phase 1 share)
- [ ] 01-09-PLAN.md — End-of-phase verification: full success-criteria walkthrough on web + iOS + Android
**UI hint**: yes
**Canonical refs**: `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`, `.planning/codebase/CONCERNS.md`

### Phase 2: SI / VO (工地指令 + 變更指令)
**Goal**: A subcontractor foreman can submit a site instruction (or raise a variation order against an approved SI), the project's admin-configured sequential approval chain fires the right push notification to exactly the next required actor, and every transition is captured as an append-only audit row that survives month-end 扯皮 between 主判 and 分判.
**Depends on**: Phase 1 (signed-URL pattern, private buckets, RLS helpers, bundle-split discipline, drawing references)
**Requirements**: SI-01, SI-02, SI-03, SI-04, SI-05, SI-06, SI-07, SI-08, SI-09, SI-10, SI-11, VO-01, VO-02, VO-03, VO-04, VO-05, VO-06, VO-07, VO-08, VO-09, VO-10, CHN-01, CHN-02, CHN-03, CHN-04, CHN-05, CHN-06, CHN-07, CHN-08, CHN-09, CHN-10, CHN-11, INF-03 (extend), INF-04 (extend), INF-08 (Phase 2 share: SI submit+approve smoke test)
**Success Criteria** (what must be TRUE):
  1. An admin configures a 3-step approval chain for SI on a project; a subcon submits an SI that version-pins a specific drawing revision; only the step-1 approver receives a push notification, taps it, sees an SI detail screen with a diff view of any approver edits, approves; the subcon then sees the SI in "已批准 / 已鎖定" state with no edit affordances.
  2. An MC raises a VO from an approved SI with structured line items (labour / material / preliminaries / contingency, HKD); the submission confirmation page shows "經系統核算總額 HK$X" matching the client-displayed total to the cent, and the client cannot write `total_amount` (server-computed).
  3. Push-fatigue cap holds: a single user receives no more than 3 SI/VO/PTW pushes per day across all docs on all projects; any 4th notification surfaces in the next 08:00 HKT digest instead.
  4. A user with in-flight approval steps cannot delete their account; an admin can either re-route the in-flight step (logged as `admin_override` with mandatory ≥10-char reason) or activate a configured delegation; chain user resolution always survives the original approver leaving the company.
  5. After full approval, an SI is read-only forever (no edit / no delete affordances anywhere in the UI), and a single VO PDF export contains line items, totals, approval timeline, and referenced drawing thumbnails.
**Plans**: TBD
**UI hint**: yes
**Canonical refs**: `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`, `.planning/codebase/CONCERNS.md`

### Phase 3: PTW (工作許可證)
**Goal**: A safety officer can review and sign 動火 / 高空 / 吊運 permits submitted by a subcon foreman; once the MC site agent signs, the permit auto-issues a signed-JWT QR code that an inspector can verify in-app and that auto-expires at HKT 23:59 the same day — producing an unforgeable, read-only audit archive aligned with HK Labour Department CoP evidence requirements.
**Depends on**: Phase 2 (approval-chain table, append-only `approvals` log, push routing, delegations, RLS helper pattern), Phase 1 (private bucket template, signed URLs, bundle discipline)
**Requirements**: PTW-01, PTW-02, PTW-03, PTW-04, PTW-05, PTW-06, PTW-07, PTW-08, PTW-09, PTW-10, PTW-11, PTW-12, PTW-13, PTW-14, PTW-15, PTW-16, PTW-17, INF-03 (extend), INF-04 (extend), INF-08 (Phase 3 share: PTW submit+sign+activate smoke test)
**Success Criteria** (what must be TRUE):
  1. A subcon foreman submits a 動火 permit at 07:00 HKT with required checklist (fire watch / extinguisher / shielding), worker list and PPE photos; the next push goes only to a user whose `global_role = 'safety_officer'` on that project, who signs after the checklist; the MC site agent then signs; the permit transitions to `active` and renders a QR code containing a signed JWT (not a raw permit_id).
  2. An admin force-override on the safety-officer step is recorded as `action_type = 'admin_override'` in the audit log AND does NOT satisfy the safety-step signoff requirement (the permit does NOT proceed to active on admin override alone) — the audit clearly distinguishes a real safety_officer signature from any admin override.
  3. At HKT 23:59 the same day, the permit auto-expires server-side via pg_cron (no client clock involved); the displayed validity reads `有效至 YYYY-MM-DD HH:mm 香港時間`; a 動火 close-out before expiry is blocked until a 30-minute fire-watch countdown completes and the foreman signs.
  4. The QR verification screen requires login, shows a large worker photo + permit details, and writes a `permit_scans` row each time; permit types 4–7 (密閉空間 / 掘地 / 電力 / 棚架) appear in the picker but stub-render "敬請期待"; the entire PTW feature is hidden when `app_config.ptw_enabled = false`.
  5. The new `safety_officer` role is selectable in AdminUsers, is included in `delete_my_account()` cleanup (Apple compliance preserved), and a state-changing PTW action attempted while offline shows a "需要網絡連接" banner and is refused — read-only views of past permits still work from cache.
**Plans**: TBD
**UI hint**: yes
**Canonical refs**: `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/SUMMARY.md`, `.planning/codebase/CONCERNS.md`

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 圖則附加 (Drawings on Progress Items) | 2/9 | In Progress|  |
| 2. SI / VO (工地指令 + 變更指令) | 0/? | Not started | - |
| 3. PTW (工作許可證) | 0/? | Not started | - |

## Coverage Validation

- **v1 requirements total:** 62 unique REQ-IDs (DRW×15, SI×11, VO×10, CHN×11, PTW×17, INF×9 — minus INF-08 cross-phase double-counting)
- **Mapped:** 62/62 (100%)
- **Orphans:** none
- **Cross-phase items:**
  - `INF-08` (Playwright smoke per phase) — explicitly split across all 3 phases (each phase contributes its own happy-path test)
  - `INF-03` (RLS helpers) — introduced in P1, extended in P2 and P3 as new tables land
  - `INF-04` (rls-smoke.sql) — introduced in P1, extended in P2 and P3
- **Cross-phase decisions logged:**
  - CHN-* infrastructure built in Phase 2 (admin chain table + UI + state machine + push routing); Phase 3 seeds chain rows for PTW and reuses the primitive verbatim.
  - INF-01/02/05/06/07/09 (migration namespace, private-bucket template, demo_feedback fix, bundle-split, CI guard, Chinese-strings convention) built in Phase 1 to establish patterns the later phases inherit.

---
*Roadmap created: 2026-05-11*
