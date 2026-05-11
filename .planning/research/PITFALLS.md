# PITFALLS: Drawings / SI-VO / PTW for HK Construction

**Domain:** HK construction site management — Drawings, SI/VO, PTW
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH (synthesized from PROJECT.md, CONCERNS.md, and domain knowledge of HK Labour Dept HSE practice + Supabase RLS patterns)

---

## CRITICAL Pitfalls (will kill deployment)

### C1. Storage RLS bypass via public-bucket reflex
- **Phase:** 1 (Drawings) — applies to all three
- **Severity:** CRITICAL
- **What goes wrong:** Devs copy the `issue-photos` bucket pattern (`public = true`, security through filename obscurity) for `drawings`, `si-attachments`, `vo-quotations`, `ptw-photos`. One cross-project URL leak (forwarded WhatsApp screenshot containing a signed-URL or a public URL) exposes structural drawings of a competing developer's site, or a permit-to-work with worker HKID photo.
- **Warning signs:**
  - Any new `insert into storage.buckets ... public, true` in `v8-*.sql`
  - Code calling `getPublicUrl(...)` instead of `createSignedUrl(..., expires)`
  - File paths missing the `{project_id}/...` prefix (breaks the foldername-based RLS template)
- **Prevention:**
  - Lift the CONCERNS.md template into `supabase/v8-private-bucket-template.sql` and require every new bucket migration to use it.
  - Code review check: grep PRs for `getPublicUrl` — only `issue-photos` legacy callsite allowed.
  - Signed URL TTL ≤ 1 hour for drawings, ≤ 15 min for PTW photos.
  - File path enforced as `{project_id}/{entity_id}/{filename}` so `(storage.foldername(name))[1]::uuid` is always project_id.

### C2. PTW QR-code screenshot abuse
- **Phase:** 3 (PTW)
- **Severity:** CRITICAL — direct safety/regulatory risk
- **What goes wrong:** Permits get a static QR linking to a public verification URL. Worker A holds a permit for hot-work in Zone 3; worker B screenshots A's QR, hot-works in Zone 5, accident happens. Audit shows permit was "valid" at the time. Labour Dept treats this as no-permit; insurance refuses claim.
- **Warning signs:**
  - QR payload is just `permit_id` (decodable by anyone)
  - Verification page accessible without auth
  - No "scanned location" check
- **Prevention:**
  - QR payload = signed JWT including `permit_id`, `valid_from`, `valid_until`, `zone_id`, `expected_workers[]`, signed with a Supabase Edge Function secret.
  - Verification screen requires login; no public verify URL.
  - Show **large worker photo** on verification screen — physical match check.
  - `permit_scans` table logging every scan attempt with `auth.uid()`, GPS, and timestamp.
  - Auto-revoke on >N scans from non-permit-holder UIDs (e.g., 12 different non-listed people in an hour = leaked).

### C3. Apple App Store re-review on "permit signing" copy
- **Phase:** 3 (PTW)
- **Severity:** CRITICAL — could block release for 2-4 weeks
- **What goes wrong:** Adding "signature" / "permit" / "compliance" to App Store metadata triggers Guideline 5 review. Reviewer asks for HK regulator documentation. App rejected pending Labour Dept letter. Meanwhile critical security fixes also blocked because they ship with the same binary.
- **Warning signs:**
  - PR adds new `NSCameraUsageDescription` strings mentioning regulated content
  - App Store metadata mentions "compliance", "Labour Department", "regulatory"
  - New role `safety_officer` exposed as a "certified" or "authorized" person
- **Prevention:**
  - Frame PTW in App Store metadata as **"internal site coordination — workflow tracking"**, NOT a regulatory submission tool.
  - Decouple PTW release from critical-fix releases. Land PTW behind a feature flag (`app_config.ptw_enabled`), ship binary with PTW dark, enable via remote config after metadata change is approved.
  - Submit with screenshots of placeholder data; avoid screenshots of real Labour Dept HSE forms.
  - Pre-write the Apple reply: "This app tracks internal worksite tasks. PTW data is operational coordination. Authoritative regulatory submission is handled outside the app."

### C4. Approval-chain "approver left the company" deadlock
- **Phase:** 2 (SI/VO) — also Phase 3 for PTW signers
- **Severity:** CRITICAL — every legacy SI/VO frozen until manual SQL fix
- **What goes wrong:** Approval chain stored as `approver_user_ids uuid[]` on each SI/VO row at creation. PM Wong is step 3 of 4. Wong leaves the company. All in-flight SIs/VOs naming Wong are stuck. Manual SQL needed; trust evaporates because subcons can't get paid.
- **Warning signs:**
  - Approval chain stored as user IDs directly on the SI/VO row (snapshot)
  - No `chain_resolution` join — chain hardcoded at SI/VO creation time
  - Account deletion RPC doesn't re-route pending approvals
- **Prevention:**
  - Store chain as **roles + slot rules** (`{step: 1, required_role: 'pm', project_id: x}`), not user IDs. Resolve at approval time via `active_role_holders(project_id, role)`.
  - Add `approval_delegations(user_id, delegate_to, valid_from, valid_until)` table.
  - On account deletion, BLOCK deletion if user has in-flight approvals; admin override required.
  - "Skip with admin override" button gated to admin, with mandatory reason text → audit log.

### C5. SI edited by MC after subcon submission (tampering)
- **Phase:** 2 (SI/VO)
- **Severity:** CRITICAL — destroys core value proposition
- **What goes wrong:** Subcon submits SI for 100 m² extra waterproofing. MC clicks "Edit" before approving, changes to 60 m², approves. Subcon sees only the approved version (no diff). At billing, subcon claims 100, MC shows app says 60. App becomes the new 扯皮 battleground.
- **Warning signs:**
  - Any UPDATE policy on `si_requests` allowing MC role to mutate `description`, `quantity`, `attached_drawings`
  - No `si_versions` history table
  - UI on subcon side fetches only "current" state
- **Prevention:**
  - **Immutable after submission:** subcon submits → row inserted, from that moment `with check (false)` for everyone. Edits create new `si_versions` rows; approval references a specific version_id.
  - MC must "request revision" (sends back to subcon with diff). MC cannot directly mutate.
  - Hash submitted version: `si_versions.content_hash = sha256(description || quantity || attachments)`. Display first 8 chars in audit timeline.
  - Subcon UI shows **timeline of versions** with author + diff badge.

### C6. Supabase RLS recursive-policy meltdown on join tables
- **Phase:** 1 (Drawings) — recurs in 2 and 3
- **Severity:** CRITICAL — site outage if hit in prod
- **What goes wrong:** RLS policy on `drawings` checks `project_members`; policy on `progress_item_drawings` checks `drawings`; policy on `drawings` recursively checks `progress_item_drawings`. Repo already hit this (`v2-fix-rls-recursion.sql` exists). Symptom: queries return empty for legitimate users, or 500.
- **Warning signs:**
  - Any new RLS policy that does `select 1 from <other_table_with_rls>` without `security definer`
  - SI/VO/PTW each touch 3+ tables (entity, line items, attachments, audit)
- **Prevention:**
  - Reuse existing `can_view_project(uid, project_id)` / `can_edit_project_progress(uid, project_id)` helpers (`security definer`).
  - Add 3 new helpers (`can_view_si(uid, si_id)` etc.) marked `security definer` with `set search_path = public`.
  - Add `supabase/tests/rls-smoke.sql` running as 3 fake users — assert each `select count(*)` on new tables.

---

## MAJOR Pitfalls (will require rework)

### M1. Push-notification fatigue → users disable globally
- **Phase:** 2 + 3
- **Severity:** MAJOR
- **What goes wrong:** 4-step approval × notify-everyone × reminder-every-2h = 30 pings/day to a PM with 5 projects. PM disables OneSignal at OS level. Now NO notifications work, including urgent escalations from Phase 1.
- **Prevention:**
  - Notify ONLY the next required actor on state change. Others get a daily 8:00 digest.
  - Hard cap: 3 push notifications/user/day for SI/VO/PTW combined; overflow → in-app inbox with single digest push.
  - Track `notification_dismiss_rate`; auto-mute if user dismisses >60% in a 14-day window.

### M2. Drawing "current version" ambiguity
- **Phase:** 1
- **Severity:** MAJOR — gloves+sun glare make this worse
- **What goes wrong:** Drawing v4 superseded v3, but a subcon installed against v3 yesterday. Foreman opens app on glove + 11am direct sun, sees "v4 — current". Doesn't realize v3 was current at install time → wrong "issue" filed.
- **Prevention:**
  - `drawings` table: `(progress_item_id, version_no, status enum('current','superseded','withdrawn'), effective_from, effective_until)`. Superseded ≠ deleted.
  - UI default = current; one-tap "睇返之前版本" with date picker.
  - Big version badge: `v4 (現行)` green; `v3 (已取代 2026-05-08)` grey with strike-through. Min 16pt + high contrast.
  - Anti-feature: do not allow hard delete of a drawing viewed by any non-uploader. Withdraw only.

### M3. Template drawings shared across projects → RLS leak
- **Phase:** 1
- **Severity:** MAJOR
- **Prevention:**
  - In Phase 1, **no cross-project sharing**. Each project has its own copies.
  - Future: `template_drawings` table with `template_owner = org_id`, separate RLS, separate bucket. When attached to a project, COPY (with `template_source_id` for audit).

### M4. PTW timezone / end-of-day expiry edge cases
- **Phase:** 3
- **Severity:** MAJOR — silent expiry of legitimate permits
- **Prevention:**
  - All datetime columns `timestamptz`.
  - Compute expiry server-side: `date_trunc('day', (now() at time zone 'Asia/Hong_Kong')) + interval '23 hours 59 minutes'`. Stored explicitly on permit row.
  - "Overnight permit" boolean; if true, `valid_until = next_day 07:00 HKT`. Requires explicit safety_officer approval.
  - Display valid_until in HKT 24h format ("有效至 2026-05-12 07:00 香港時間").
  - Server is the only timekeeper.

### M5. Offline submission race conditions
- **Phase:** 2 + 3
- **Severity:** MAJOR
- **Prevention:**
  - In Phase 2 and 3, OFFLINE submission is OUT OF SCOPE. Show clear "需要網絡連接" banner.
  - If offline ever ships: client-generated `idempotency_key = uuid`. Server `insert ... on conflict (idempotency_key) do nothing returning *`.
  - Server is only source of `created_at` (use `default now()`).

### M6. Bundle bloat ships unusable 3G/4G app
- **Phase:** 1 (introduces heaviest libs)
- **Severity:** MAJOR
- **What goes wrong:** `react-zoom-pan-pinch` (~30KB) + PDF.js (~300KB) + signature-pad (~40KB) + QR scan (~80KB) + existing 1.2MB = 1.65MB cold load. On HK site 4G through concrete = 30+ second cold load.
- **Prevention:**
  - Lazy-load discipline: all heavy libs behind `React.lazy(() => import(...))`.
  - Bundle-size CI check: fail PR if entry chunk >800KB or new chunk >400KB.
  - PDF rendering: render server-side to image previews; only invoke PDF.js when user taps "原始 PDF".
  - QR scanner: prefer native Capacitor plugin over web-based scanning library.

### M7. VO line-item quotation math drift
- **Phase:** 2
- **Severity:** MAJOR — financial dispute
- **Prevention:**
  - Currency columns: `decimal(12,2)` (HKD only). Never `float`.
  - `total_amount` is a Postgres generated column or trigger-computed. Client cannot write `total_amount`.
  - All arithmetic in JS via integer cents until display.
  - Show server-confirmed total on submission: "經系統核算總額 HK$X".

### M8. Drawing pinch-zoom + signature canvas collisions
- **Phase:** 2 + 3
- **Severity:** MAJOR — UX-breaking on gloved hands
- **Prevention:**
  - Signature flow: explicit "Sign" button → fullscreen modal with fixed-zoom drawing preview at top + signature canvas at bottom. No nested gesture handlers.
  - Lock zoom on signature canvas.
  - Test on BlueStacks AND real Android with glove-simulator before merging Phase 2.
  - Hit target ≥56dp for signing buttons. Dark icons on white (sun-glare friendly).

---

## MINOR Pitfalls (annoying but recoverable)

### m1. 主判/分判 visibility asymmetry (Phase 2)
Subcon can see MC's internal rejection comments → trust damage.
**Prevention:** `si_comments`/`vo_comments` have `visibility enum('internal','shared')`. Default internal on MC side, shared on subcon side. 鎖 icon on internal. Audit log includes visibility changes.

### m2. Drawing upload by subcon when only MC should upload (Phase 1)
**Prevention:** Storage RLS write policy uses `can_edit_project_progress(uid, project_id)` (excludes subcontractor_worker).

### m3. Notification deep-link race on cold start (Phase 2+3)
**Prevention:** Queue deep-link until `AuthProvider.loading === false`, then navigate.

### m4. Missing audit when admin force-overrides (Phase 2+3)
**Prevention:** Every override requires reason text (min 10 chars), written to `*_audit` with `actor_id`, `action_type = 'admin_override'`, `reason`. Visible in timeline.

### m5. Orphan storage paths on account delete (Phase 1 sets convention)
**Prevention:** Store photos under `{project_id}/{permit_id}/...` (not user_id) so account delete doesn't remove project-owned evidence. Extend `delete_my_account()` RPC for personal attachments only.

### m6. `safety_officer` role bypass via admin override (Phase 3)
**Prevention:** PTW signing requires `user_profiles.global_role = 'safety_officer'`. Admin role does NOT inherit signing rights; admin can `override` (logged as override, not signing).

### m7. Chinese-character search/sort in drawing titles (Phase 1)
**Prevention:** `order by created_at desc` as default sort. Add `title_normalized` (lowercase + stripped) for search. Don't promise Chinese-aware sort in Phase 1.

### m8. Demo data leaking into audit trail (Phase 1 cleanup ride-along)
**Prevention:** Fold the `demo_feedback` RLS fix into Phase 1 migration as noted in PROJECT.md.

---

## Phase Mapping Summary

| Phase | Pitfalls to address |
|-------|---------------------|
| **Phase 1 — Drawings** | C1, C6, M2, M3, M6, m2, m5, m7, m8 |
| **Phase 2 — SI/VO** | C4, C5, M1, M6 (continued), M7, M8, m1, m3, m4 |
| **Phase 3 — PTW** | C2, C3, C4 (recur), M1 (recur), M4, M5, M8 (recur), m4, m6 |
| **Cross-cutting** | C1, C6, M6 — establish patterns in Phase 1 |

---

## Top 3 to brief the team on Day 1 of Phase 1

1. **Private bucket template is non-negotiable** (C1). The `issue-photos` pattern dies here.
2. **Drawing versioning is "withdraw, not delete"** (M2). Anything a user has seen survives forever in some form.
3. **Lazy-load everything heavy** (M6). The bundle is already a problem.

## Top 3 surprises that will bite mid-build

1. **Approval chain stored by user_id will break when someone leaves** (C4). Refactor to roles + delegations BEFORE Phase 2 codes chain logic.
2. **MC editing subcon's SI silently** (C5) — easy to ship by accident; immutability must be enforced at RLS level, not just UI.
3. **Apple re-review on PTW copy** (C3) — pre-write the reviewer reply.

---

## Confidence notes

- **HIGH:** Supabase RLS recursion (C6, already happened); bundle bloat (M6, measured); storage public bucket risk (C1, measured).
- **MEDIUM:** HK regulatory framing (C3, m6) — based on Labour Dept HSE general practice.
- **LOWER (verify before Phase 3):** Exact Apple wording for PTW (C3) — submit TestFlight with placeholder PTW UI before public to surface early.
