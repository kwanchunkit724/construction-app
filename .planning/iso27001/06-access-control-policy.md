# 06 — Access Control Policy (存取控制政策)

> **Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner / Top Management / sole operator of CK工程
> **Standard mapping:** ISO/IEC 27001:2022 Annex A — **A.5.15** (Access control), **A.5.16** (Identity management), **A.5.17** (Authentication information), **A.5.18** (Access rights), **A.8.2** (Privileged access rights), **A.8.3** (Information access restriction), **A.8.4** (Access to source code), **A.8.5** (Secure authentication)
> **Version:** 1.0 · **Date:** 2026-06-18 · **Classification:** 內部 (Internal)
> **Next review:** 2027-06-18 (or on any change to the role model, RLS architecture, or sub-processor list)

---

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial issue. Documents the as-built RBAC + RLS model (8 roles, per-project membership, client + DB enforcement), authentication (phone+password / step-up TOTP / sign-reauth), privileged-access custody, and joiner/mover/leaver + quarterly access-review procedures. Honest gap section reconciled to `13-certification-readiness-checklist.md`. |

---

## 1. Purpose & scope

This policy defines how access to CK工程 / CK Construction information and information-processing facilities is granted, restricted, reviewed, and revoked, so that **判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes** — without any party being able to see or alter data they are not entitled to.

**Scope (covered systems):**
- The CK SaaS app (React 18 + TS web bundle, packaged on iOS via Capacitor 8 and Android), live on the iOS App Store and Android.
- The Supabase backend (`https://syyntodkvexkbpjrskjj.supabase.co`): Postgres + Row-Level Security (RLS), GoTrue Auth, Storage, Realtime, Edge Functions.
- Privileged administrative interfaces: the Supabase dashboard, Apple App Store Connect, the GitHub repository, and the Codemagic CI/CD account.

**Out of scope:** sub-processor internal access controls (covered by their own ISMS — see `05-supplier-and-cloud-register.md` and `12`); these are *inherited* controls and assessed in the SoA (`02-statement-of-applicability.md`).

This is a single-operator organisation: **關進杰 is simultaneously the only system administrator, the developer, the data controller, and top management.** Segregation-of-duties controls that normally require multiple people are documented here as *scaling on first hire* (§9.4) and are honestly flagged as a structural limitation in the SoA.

---

## 2. Access-control principles (A.5.15)

CK applies the following principles to every access decision:

1. **Deny by default, defence-in-depth.** Every Postgres table has RLS enabled with explicit policies; no policy means no access. Access is enforced in **two independent places** — the React client AND the database — so a bypassed or tampered client cannot read or write beyond the user's rights.
2. **Least privilege.** Each role and each RPC is granted only the minimum it needs. Privileged RPCs are `revoke`d from `public` and `grant`ed only to `authenticated` (e.g. `pm_assign_safety_officer(...)` is granted to `authenticated` only — `supabase/v50-membership-role-escalation-guard.sql:113`).
3. **Need-to-know, scoped by project.** Data visibility is gated on approved project membership via `SECURITY DEFINER` helpers `can_view_project(uid, project_id)` / `can_edit_project(uid, project_id)`.
4. **Self-set privileged columns are forbidden on the write path.** Users may never escalate their own `global_role`, membership `role`, or verification/approval columns; these are blocked by BEFORE-INSERT/UPDATE trigger guards (§4.3).
5. **Tamper-evidence over trust.** Any write to a critical record is appended to an immutable hash-chained `audit_ledger`, so unauthorised or out-of-policy changes are detectable even if made via the dashboard or service-role key (§7).

---

## 3. Role-based access control model (A.5.18, A.8.3)

### 3.1 Eight global roles

Roles are defined once in `src/types.ts:1-9` (`GlobalRole`) and mirror the Postgres `user_profiles.global_role` column verbatim (no camelCasing). The Traditional-Chinese labels are in `src/types.ts:77-86` (`ROLE_ZH`):

| `global_role` | zh-HK label | Typical rights |
|---|---|---|
| `admin` | 系統管理員 | System-wide: create projects, assign PMs, manage users. The founder. |
| `pm` | 項目經理 (PM) | Project-level rights **only** when listed in `projects.assigned_pm_ids`. |
| `main_contractor` | 總承建商員工 | Total承建商 staff; edit progress / handle escalations within approved projects. |
| `subcontractor` | 判頭 | Subcontractor lead; report, order materials, edit own scope. |
| `subcontractor_worker` | 判頭工人 | Worker; largely read-only + report issues. |
| `owner` | 業主 | Read-only client/owner view. |
| `safety_officer` | 安全主任 | PTW / safety sign-off path (added v10; inherits account deletion). |
| `general_foreman` | 老總 | General foreman (added v13). |

A nullable `sub_role` (`engineer` / `foreman` / `safety`; `src/types.ts:11`, labels `src/types.ts:88-92`) further narrows function within a role.

### 3.2 Per-project membership

Beyond the global role, every non-admin user gains rights on a project only through an **approved** membership row in `project_members` (`role: ProjectRole`, `status: 'pending' | 'approved' | 'rejected'`; `src/types.ts:66-75`). Application → approval is mediated by `ProjectsContext` (apply/approve flows) and gated in the DB.

`ProjectRole = Exclude<GlobalRole, 'admin'>` (`src/types.ts:13`) — admin is system-wide and is never a per-project member.

### 3.3 Dual enforcement (client + DB) — A.5.15 / A.8.3

Role gating exists in two aligned places, which **must stay aligned** (a documented architectural invariant):

- **Client:** capability flags computed in the domain contexts. Example — `ProgressContext.canEdit` (`src/contexts/ProgressContext.tsx`): `true` for `admin` (`:90`), for an assigned PM (`project.assigned_pm_ids.includes(profile.id)`, `:92`), or for an approved member in `['pm','main_contractor','subcontractor']`. Workers and owners are read-only. Route gating: `ProtectedRoute requireAdmin` restricts `/admin` and `/admin/users` to `global_role === 'admin'`.
- **Database (authoritative):** RLS policies on every table reference the `SECURITY DEFINER` helpers (§3.4). The client checks are a UX convenience; **the database is the security boundary** — a forged client cannot exceed the RLS policy.

### 3.4 `SECURITY DEFINER` helpers with pinned `search_path` (A.8.3)

Project-scoped visibility/edit decisions are centralised in two `SECURITY DEFINER` SQL helpers so the RLS policies do not have to recurse through `project_members` (which would itself need a policy and risk infinite recursion):

- `can_view_project(uid, project_id)` — any approved member (originally `v3-progress-schema.sql`).
- `can_edit_project(uid, project_id)` — edit-rights membership.

Both are declared `language sql stable security definer set search_path = public` (e.g. `supabase/v40-split/3-helpers-and-rls.sql:20,42`). **The pinned `set search_path = public` is a deliberate hardening control:** it prevents a `search_path` / shadow-table injection attack where a caller pre-creates a malicious object in their own schema to subvert a `SECURITY DEFINER` function. RLS policies then read e.g. `using (can_view_project(auth.uid(), project_id))` (`supabase/v40-split/3-helpers-and-rls.sql:85,173`).

### 3.5 Information access restriction & least-privilege RPCs (A.8.3)

Where direct table access would over-expose data, access is funnelled through `SECURITY DEFINER` RPCs that are `revoke`d from `public` and `grant`ed only to `authenticated`. Example: PII on `user_profiles` is *not* directly readable by arbitrary authenticated users (see §4.3); admin reads go through `admin_list_user_profiles()` / `admin_get_user_profile()`, and role changes through `admin_update_user_role()` (`supabase/v17-user-profiles-rls-hardening.sql:24-29`). The same pattern gates membership-role assignment (`pm_assign_safety_officer`, granted to `authenticated` only — `supabase/v50-...:113`).

---

## 4. Privilege-escalation defences (A.8.2, A.8.3) — found and closed

CK's RBAC has been adversarially tested (persona-sim + RLS simulation; see `07-secure-development-policy.md`). The following real holes were discovered and closed; each is evidence that the BEFORE-trigger / RLS-guard pattern is operating, not aspirational.

### 4.1 Self-promotion to admin — closed (v17)

`v2-schema.sql` granted any authenticated user UPDATE on their own `user_profiles` row with no `with check` and no column restriction. A subcontractor `PATCH`ed `global_role='admin'` and received HTTP 200 — total system takeover from one REST call (`supabase/v17-user-profiles-rls-hardening.sql:6-11`). **Fix:** a BEFORE-UPDATE trigger `enforce_user_profile_write_gate()` reverts `global_role` / `sub_role` / `phone` / `id` to their OLD values unless the caller is admin (`v17-...:34-60`). Self-editable columns (`name`, `company`, `onesignal_id`) still flow through. The same migration narrowed `user_profiles` SELECT to self / project teammate / PM-of-applicant, closing a global-PII read (`v17-...:13-16, 24-27`).

### 4.2 Other closed escalation paths

- **v18** — broad RLS audit hardening across drawings/documents and related tables (`supabase/v18-rls-audit-hardening.sql`).
- **v50** — membership-role escalation guard (a member cannot self-assign a higher project role).
- **v55e** — credential self-verify INSERT guard: a user cannot self-set `verified`/`approved`/`status` on INSERT (a BEFORE-INSERT guard, not only BEFORE-UPDATE — see the project memory note "RLS insert privileged columns").
- **v69** — issues column guard (forgery vectors on issue ownership/handler blocked).
- **v76** — PTW `safety_officer` `admin_override` guard (a safety officer cannot abuse an override path).
- **v77** — equipment-forms helper for `safety_officer` access.

### 4.3 Standing rule

**No privileged column (`global_role`, `sub_role`, membership `role`, any `verified` / `approved` / `status`) may be self-set on INSERT or UPDATE.** Each such column is protected by a BEFORE-trigger guard or by routing the mutation exclusively through a `SECURITY DEFINER` RPC that performs the authorisation check server-side. New tables added in future migrations MUST follow this pattern.

---

## 5. Identity management (A.5.16) & authentication (A.5.17, A.8.5)

### 5.1 Identities

Each user has exactly one identity: a Supabase GoTrue `auth.users` row, joined 1:1 to a `user_profiles` row keyed by `id = auth.uid()`. The login identifier is a **Hong Kong phone number** (8 digits, validated to start 5/6/7/9 by `isValidHKPhone` in `src/lib/phone.ts`).

### 5.2 Phone+password via synthetic email (auth model — locked)

Users see only a phone number, but GoTrue's email/password flow is used under the hood: `phoneToEmail` synthesises `<digits>@phone.local` (`src/lib/phone.ts`). Passwords are hashed with **bcrypt by GoTrue**; **the app never stores or sees the plaintext password** beyond passing it to the GoTrue endpoint over TLS. Auth failures are deliberately mapped to a generic `手機號或密碼錯誤` to prevent user enumeration. No magic links / SSO are introduced (constraint-locked for this milestone).

### 5.3 Step-up MFA — TOTP (built, enforcement OFF)

A native Supabase **TOTP** step-up MFA layer is implemented (`supabase/v52-step-up-foundation.sql` → `v54`). `mint_step_up_grant` / `assert_step_up` raise the session to **AAL2** and gate ~12 high-risk RPCs. Rollout is behind a flag: `app_config.step_up_enforced boolean not null default false` (`supabase/v54-step-up-rollout-flag.sql:19`), read by `get_step_up_enforced()` and set by `set_step_up_enforced(p_on)` (`v54:51-72`). **The flag is currently OFF** — the machinery is in place but not yet enforced. The client UI (`StepUpContext`) ships with the 1.5 build; the flag is to be flipped after 1.5 is live on both stores (see §10 gap, and `13-certification-readiness-checklist.md` §B.4).

### 5.4 Sign-time re-authentication for non-repudiation (built, enforcement OFF)

For high-stakes signatures (PTW / equipment-form sign-offs) CK has a **password re-auth at the moment of signing** (`supabase/v60-sign-reauth.sql`). The check runs in the `verify-sign-password` Edge Function, which verifies the supplied password against GoTrue (`POST /auth/v1/token?grant_type=password`) using the caller's synthetic-email login and mints a 5-minute re-auth grant. **The password is never logged, echoed, stored, or returned** (`supabase/functions/verify-sign-password/README.md:22-23`); only the 200/4xx outcome is read, and no session is created. A proof certificate `get_signature_proof(...)` returns signer + credential snapshot + tamper-evidence (audit-ledger head + `verify_integrity`) + a zh-HK attestation. Enforcement is flag-gated (`sign_reauth_enforced`, currently **OFF**); `SignReauthContext` ships with the 1.5 build.

### 5.5 Account MFA on privileged operator accounts — GAP

MFA on the operator's own **Supabase / Apple / GitHub / Codemagic** accounts is not yet evidenced. This is an owner action (only 關進杰 can enable it) and is tracked in §10 and `13-...checklist.md` §B.

---

## 6. Privileged access management (A.8.2)

### 6.1 Service-role key custody

The Supabase **`service_role` key bypasses RLS** and is therefore the most sensitive credential in the system. It is confined to **Edge Functions only**, read from `Deno.env` at runtime (`supabase/functions/verify-sign-password/README.md:46-52`); it is **never** shipped to or referenced by the client. The browser/native client uses **only the `anon` key**, which has no privileges beyond what RLS allows for the authenticated user. `VITE_SUPABASE_ANON_KEY` is the only Supabase key baked into the client bundle (`src/lib/supabase.ts`).

### 6.2 Dashboard / platform owner

The Supabase dashboard, App Store Connect, GitHub, and Codemagic accounts are all owned by the founder (關進杰). A dashboard / service-role actor can disable triggers or write directly, but **cannot silently alter a past `audit_ledger` row without breaking the hash chain** (§7) — this is the compensating control for the single-operator privileged-access risk.

### 6.3 Key-rotation procedure (to document & evidence)

CK shall maintain a documented key-rotation procedure for: the Supabase `service_role` / `anon` keys, the OpenRouter API key (AI 站長), and the OneSignal REST key. Rotation triggers: suspected compromise, sub-processor breach notice, operator device loss, and at minimum an annual planned rotation reviewed at the next review date. **Status:** procedure to be written and first rotation evidenced — owner action (§10).

---

## 7. Tamper-evident audit of access events (supports A.8.2 / A.8.15 / A.8.16)

Every INSERT/UPDATE/DELETE on a watched critical table appends a row to the append-only, SHA-256 **hash-chained `audit_ledger`** (`supabase/v51-audit-ledger-tamper-evidence.sql`). Each row hashes its fields + the previous row's hash, so altering or deleting any past record — *even via the dashboard or `service_role`* — breaks the chain, which `verify_integrity()` detects (`v51` header:6-17). The ledger is immutable to clients: RLS denies all direct access, UPDATE/DELETE raise, and reads are only via the gated `verify_integrity()` / `export_ledger_proof()` RPCs (`v51:33-36`). The scope was extended to dispute-relevant tables in the v68/v72 freeze work (13+ tables under AFTER triggers).

**Honest scope:** this is tamper-**evident**, not tamper-**impossible** — a Postgres superuser could disable a trigger to write unlogged, but cannot edit a *past* ledger row undetected (`v51` header:13-15).

**Scheduled monitoring:** a system-context daily check is written (`supabase/v80-integrity-monitoring-cron.sql` — `run_integrity_check()` + `integrity_check_log` + `cron.schedule('integrity-daily-check', '0 18 * * *', ...)` at `:95`). **Status caveat:** the migration exists in the repo but its application/scheduling on production has not yet been execution-verified in CK's evidence record (the on-demand `verify_integrity()` is verified; the scheduled cron is the remaining step). Tracked in §10 and `13-...checklist.md`.

---

## 8. Access to source code & build pipeline (A.8.4)

- **Source code** lives in a single Git repository owned by the founder. There is no plaintext secret in the repo: Supabase URL/anon key are injected as CI env vars (`codemagic.yaml`), the `service_role` key lives only in Edge Function secrets, and AI/push keys are server-side (Edge Function env / sub-processor consoles).
- **Build & distribution** run on Codemagic (`ios-app-store`, `ios-testflight`, `android-internal-test`) signing with Team ID `C22JSRYW54`. Production iOS uses APNs production (`ios/App/App/App.entitlements`).
- **Migrations** are versioned SQL applied **manually** via the Supabase SQL editor and **verified by execution** (per project memory "supabase-migration-apply"; MCP apply is blocked). Each migration is additive and idempotent, and destructive changes to the live `progress_leaf_items` / `user_profiles` tables are prohibited (backwards-compat constraint).
- **GAP:** there is currently **no CI dependency-vulnerability gate** (e.g. `npm audit` / SCA in Codemagic) and account-MFA on GitHub/Codemagic is not evidenced — see §10.

---

## 9. Access lifecycle — joiner / mover / leaver & review

### 9.1 Joiner (provisioning) — A.5.16 / A.5.18

1. User self-registers with phone+password (signup) → GoTrue `auth.users` + `user_profiles` created with the role they select. (Sensitive roles like `admin` are never self-assignable — §4.)
2. To work on a site, the user **applies** to a project; an `admin` or assigned `pm` reviews the applicant (PII surfaced only through the gated applicant RPC) and **approves** the `project_members` row. No approval ⇒ no access.
3. `safety_officer` and any new role MUST inherit the Apple-approved account-deletion path (`delete_my_account()`, §9.3) — Apple-compliance constraint.

### 9.2 Mover (change of rights)

- A change of `global_role` is performed only by an admin via `admin_update_user_role()` (never by self-UPDATE — §4.1).
- A change of project rights is performed by removing/re-approving the `project_members` row or reassigning PMs via `projects.assigned_pm_ids` (admin-only). Client capability flags recompute immediately; RLS enforces server-side on next request.

### 9.3 Leaver (de-provisioning) — A.5.18

- **Membership removal:** an admin/PM rejects or deletes the `project_members` row → `can_view_project` / `can_edit_project` return false → access revoked at the DB layer.
- **Account deletion:** `delete_my_account()` hard-deletes the `auth.users` row with cascade (Apple-reviewed and approved). Authored-content foreign keys are **set null** rather than cascade-deleted, so the dispute audit trail survives the user leaving (`supabase/v20-delete-account-fk-cascade.sql`).
- On logout, `pushLogoutUser()` clears `user_profiles.onesignal_id` **before** `supabase.auth.signOut()` (needs a live session) so the device stops receiving that user's push.

### 9.4 Segregation of duties — scaling on first hire

Today 關進杰 holds all privileged roles. On the **first hire**, this policy requires: (a) a dedicated non-admin operational account for routine work, reserving `admin` and dashboard/`service_role` access for break-glass; (b) recorded approval for any grant of `admin` or PM assignment; (c) the new joiner walks §9.1. This is honestly recorded as a current SoD limitation in the SoA.

### 9.5 Quarterly access review — A.5.18 (procedure)

The ISMS Owner performs an access review at least **quarterly** (and on any role-model change). Each review is logged in the ISMS records with date + outcome.

**Checklist (run each quarter):**
1. **Users vs. roles** — list all `user_profiles` via `admin_list_user_profiles()`; confirm every `global_role = 'admin'` is intended (expect: founder only). Investigate any unexpected admin.
2. **Project memberships** — for each active project, review `project_members` with `status='approved'`; remove members no longer on site; confirm `assigned_pm_ids` is current.
3. **Privileged credentials** — confirm `service_role` key has not leaked into the client bundle/repo; confirm account-MFA status on Supabase/Apple/GitHub/Codemagic; note any key rotation due (§6.3).
4. **Integrity evidence** — run `verify_integrity()` and review `integrity_check_log` (once §7's cron is verified live) for any `intact=false` row.
5. **Escalation guards** — confirm the latest migrations preserving the §4 guards are applied on prod (spot-check `enforce_user_profile_write_gate` still present).
6. **Enforcement flags** — record current state of `step_up_enforced` and `sign_reauth_enforced` and whether the 1.5 release gate to flip them has been met.
7. **Sub-processor access** — confirm sub-processor list unchanged (`05`/`12`); note any new processor that gained data access.

---

## 10. Known gaps (honest — do not over-claim)

An auditor reads this section. CK is **self-prepared toward certification readiness, NOT yet certified.** Open access-control-related gaps, cross-referenced to `13-certification-readiness-checklist.md`:

| # | Gap | Status / owner action |
|---|---|---|
| G1 | **Step-up MFA enforcement OFF** | Machinery built & live (`v52–v54`); flip `step_up_enforced` after 1.5 ships on both stores. Owner action (checklist §B.4). |
| G2 | **Sign-reauth enforcement OFF** | Built & live (`v60` + Edge Function); flip `sign_reauth_enforced` post-1.5. Owner action. |
| G3 | **Account MFA on Supabase / Apple / GitHub / Codemagic not evidenced** | Owner action; only 關進杰 can enable + screenshot evidence (checklist §B). |
| G4 | **Key rotation procedure not yet documented/evidenced** | §6.3 — write procedure + evidence first rotation. Owner action. |
| G5 | **Scheduled integrity monitoring not yet execution-verified on prod** | `v80` migration written (`cron.schedule(...)`); apply + verify the daily job and `integrity_check_log` (§7). On-demand `verify_integrity` is verified. |
| G6 | **No CI dependency-vulnerability gate** | Add SCA / `npm audit` to Codemagic (§8). See `07-secure-development-policy.md`. |
| G7 | **No signed Supabase DPA on file; Free-tier backup (no managed PITR/daily backup)** | Access-adjacent: a restore event is itself a privileged operation. DPA = owner action; backup gap covered in `09-backup-and-business-continuity.md` (checklist §B.1/B.3). |
| G8 | **Single-operator SoD** | Structural; mitigated by audit-ledger tamper-evidence; resolves on first hire (§9.4). |

---

## 11. Compliance, review & references

- **PDPO (個人資料（私隱）條例, Cap. 486):** access restriction on PII (phone, name, company, `green_card_no/expiry`, OneSignal IDs) is enforced by the §4.1 SELECT narrowing and the gated applicant RPC, supporting the Data Protection Principles on use and security of personal data. See `03-asset-register.md` / `12-supplier-and-cloud-security.md`.
- **Review cadence:** this policy is reviewed at least annually (next: **2027-06-18**) and on any change to the role model, RLS helpers, authentication flow, or sub-processor list. Quarterly operational review per §9.5.
- **Related ISMS documents:** `02-statement-of-applicability.md`, `05-supplier-and-cloud-register.md`, `07-secure-development-policy.md`, `08-cryptography-and-key-management.md`, `11-logging-and-monitoring.md`, `13-certification-readiness-checklist.md`.
- **Primary evidence:** `src/types.ts`, `src/lib/phone.ts`, `src/lib/supabase.ts`, `src/contexts/ProgressContext.tsx`; `supabase/v17-…`, `v18-…`, `v40-split/3-helpers-and-rls.sql`, `v50-…`, `v51-…`, `v52–v54`, `v55e-…`, `v60-…`, `v69-…`, `v76-…`, `v77-…`, `v80-…`; `supabase/functions/verify-sign-password/`.

**Approved by:** 關進杰 (Kwan Chun Kit), ISMS Owner — 2026-06-18.
