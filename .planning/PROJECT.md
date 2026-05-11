# CK工程 / Construction App

## What This Is

A Hong Kong construction management mobile + web app for general contractors
running multiple sites. PMs, foremen, subcontractors, and admins coordinate
project zones, progress, issues, and approvals through a shared system —
replacing the WhatsApp + paper + spreadsheet status quo. Already live on the
iOS App Store; Android build verified on BlueStacks and pending Google Play
identity verification.

## Core Value

**判頭 + 工地主任 always know exactly what's happening on every site, with a
shared audit trail that survives disputes** — because every instruction,
permit, drawing, progress tick, and issue is captured in one system instead
of scattered across WhatsApp, paper diaries, and people's memories.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing code. -->

- ✓ Phone+password auth via synthetic email `<phone>@phone.local` — v1
- ✓ Role-based access (admin / pm / main_contractor / subcontractor / subcontractor_worker / owner) — v1
- ✓ Project + zone CRUD with assigned PMs — v1
- ✓ Hierarchical progress tracking: 大項 → sub-items → leaf items with weighted % roll-up — v1
- ✓ 問題 (Issues) reporting + resolution flow with photos — v1
- ✓ Project membership requests (subcons request → MC approves/rejects) — v1
- ✓ User management UI with role chips and filter tabs — v1
- ✓ Profile screen with push notification re-registration — v1
- ✓ Account self-deletion (Apple Guideline 5.1.1(v) compliance) — v1
- ✓ Dashboard with project stat cards (工地總數 / 進度正常 / 進度落後 / 處理中問題) + recent activity timeline — v1
- ✓ OneSignal push notifications (APNs iOS + FCM Android) — v1
- ✓ Capacitor iOS build pipeline → App Store via Codemagic — v1
- ✓ Capacitor Android build pipeline → APK (pending Play Console) via Codemagic — v1
- ✓ Bilingual UI (Traditional Chinese primary, English secondary) — v1

### Active

<!-- Current milestone: 工地控制系統 (Site Control System) — 3 phases. -->

- [ ] **Phase 1 — 圖則附加 (Drawings on Progress Items):** Attach multiple
      drawings per leaf item with version history. Private storage, mobile
      pinch-zoom viewer, upload gated by role.
- [ ] **Phase 2 — SI / VO (工地指令 + 變更指令):** Subcon → MC approval flow
      with admin-configurable approver chain. SI is the verbal-instruction
      paper trail; VO carries structured cost quotation (labour / material /
      preliminaries / contingency).
- [ ] **Phase 3 — PTW (工作許可證):** Permit-to-work for high-risk activities.
      7 permit types in schema (動火 / 密閉空間 / 高空 / 吊運 / 掘地 / 電力 /
      棚架), UI for top 3 first. New global role: **safety_officer**.
      QR-coded active permits, end-of-day auto-expire, full audit archive.

### Out of Scope

<!-- Explicit boundaries for THIS milestone. Includes reasoning. -->

- **Drawing markup / annotation tools** — v1 viewer is view-only. Markup is its own phase if/when users ask for it.
- **PTW types 4–7 (密閉空間 / 掘地 / 電力 / 棚架) — UI** — schema ready, but UI stub-renders "敬請期待". Build by demand.
- **VO multi-currency** — HKD only. Multi-currency adds FX, rate locking, audit complexity.
- **SI / VO retroactive entry** — backdated entries undermine the trust value of the paper trail. App-time stamps are authoritative.
- **Real-time collaboration on a single SI / VO draft** — single-author drafts only. Multi-author = unscoped scope creep.
- **Drawing OCR / search inside drawings** — out of scope; phase-2 maybe.
- **Permit auto-renewal across days** — each day = new permit. Renewal logic invites stale-permit risk.
- **Export to MS Project / Primavera** — separate integration phase.

## Context

**Existing codebase (mapped at `.planning/codebase/`):**
- React 19 + TypeScript + Vite 5 + **Tailwind 3.4** (not v4)
- Capacitor 8 wrapper for iOS + Android
- Supabase: Postgres + RLS + Auth + Storage (`issue-photos` bucket exists, public)
- OneSignal v1 /players REST for push, FCM (Android) + APNs (iOS)
- Codemagic CI: 3 workflows (ios-app-store, ios-testflight, android-internal-test)
- HashRouter SPA; AuthContext provider; role gating via `useAuth().profile?.global_role`

**Critical conventions (from CONVENTIONS.md):**
- No linter, no formatter — TS strict mode + discipline only
- No semicolons, single quotes, 2-space indent
- Supabase pattern: `const { data, error } = await supabase...` — errors returned, not thrown
- Context methods return `Promise<{ error: string | null }>`
- All Chinese strings inline in JSX, no i18n library
- Migration naming: `supabase/v{N}-{slug}.sql`, with `vN-split/` numbered subdirs for ordered multi-file migrations

**Known concerns affecting this milestone (from CONCERNS.md):**
- Zero test coverage — Playwright installed but no config or test files. New code will add 1–2 smoke tests for the new flows.
- `v5-push-notifications.sql` overlaps with `v5-split/*.sql`; canonical source unclear. **New migrations start at `v8-`** to skip the contested namespace.
- Only existing Storage bucket `issue-photos` is **public**. Drawings/PTW/SI/VO attachments **must** use private buckets with project-member RLS — template in CONCERNS.md.
- `demo_feedback` table has over-permissive RLS — quick fix to fold into Phase 1 migration.
- Bundle is 1.2 MB unsplit (xlsx/jspdf/recharts in main chunk). New viewer (`react-zoom-pan-pinch`) + PDF rendering will be **lazy-loaded**.
- Hardcoded admin password `admin1234` in `supabase/v2-seed-admin.sql` — production has been rotated; seed retained for fresh-DB bootstrap only.

**Industry context (HK construction):**
- PTW workflow is regulated by Labour Department's HSE manual; needed as evidence in accident inquiries.
- SI / VO is the #1 source of month-end 扯皮 between 主判 and 分判 — verbal instructions get denied at billing time. The app's value is making instructions un-deniable.
- Subcontractors operate on thin margins; phantom-manpower and verbal-instruction fraud are industry-standard pain points.
- Most HK contractors still use paper or WhatsApp for all three of these flows.

## Constraints

- **Tech stack — locked:** React 19 + TS + Vite + Tailwind 3.4 + Capacitor 8 + Supabase. No rewrites in this milestone.
- **Mobile-first:** All new screens must work on phone (390px wide) and BlueStacks tablet (1600x900). Test both before merge.
- **Storage budget:** Supabase Free tier (1GB) — drawings + permit photos will dominate. Need explicit "compress on upload" or "warn on >5MB" UX.
- **Push budget:** OneSignal Free tier — used for SI/VO approval chain notifications + permit signing. Need to not spam.
- **Backwards compatible:** Existing live users on iOS App Store must not break when new migrations run. New tables only; no destructive changes to `progress_leaf_items` or `user_profiles`.
- **Apple compliance:** Already passed account-deletion review. Any new auth flow must preserve that. Any new role (`safety_officer`) must inherit account-deletion.
- **Hong Kong specifics:** All UI in Traditional Chinese (zh-HK). PTW types use HK industry terminology. VO quotation in HKD only.
- **Auth model — locked:** Phone+password via synthetic email. Don't introduce magic links or SSO in this milestone.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 3 phases, coarse granularity | User explicitly chose; phases are large but cohesive features that ship as units | — Pending |
| Phase order: Drawings → SI/VO → PTW | Drawings is smallest and unblocks the other two (both reference drawings); PTW is most domain-heavy → last | — Pending |
| Private Storage bucket per new feature | `issue-photos` public was a v1 shortcut; new features need project-member RLS to prevent cross-site leakage | — Pending |
| Lazy-load drawing viewer | Bundle already 1.2 MB; pinch-zoom-pan + PDF rendering would push to 1.8 MB+ | — Pending |
| New global role `safety_officer` | PTW needs an approver distinct from PM/MC; piggybacking on existing roles would conflict with permissions model | — Pending |
| VO quotation = structured rows, not single figure | Industry standard; enables itemized dispute resolution; ~½ day extra UI cost vs single field | — Pending |
| Approval chain configurable per project | User explicitly chose; different contracts have different signoff structures (some have Architect, some don't) | — Pending |
| Migration namespace `v8-` for new work | Skip contested `v5/v6/v7` to avoid replaying overlap issues from existing migration set | — Pending |
| Add Playwright smoke tests for new flows | Zero tests is fine for legacy, but new critical-path flows need at least one happy-path Playwright test | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-11 after initialization (brownfield onto existing live app)*
