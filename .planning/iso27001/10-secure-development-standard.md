# Secure Development & Configuration Standard

**Document ID:** ISMS-10
**Covers ISO/IEC 27001:2022 Annex A controls:** A.8.25 (Secure development life cycle), A.8.26 (Application security requirements), A.8.27 (Secure system architecture and engineering principles), A.8.28 (Secure coding), A.8.9 (Configuration management)
**Document Owner:** 關進杰 (Kwan Chun Kit) — Sole founder/operator, ISMS Owner & Top Management
**Version:** 1.0
**Date:** 2026-06-18
**Next review:** 2027-06-18
**Classification:** Internal

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 | Initial issue. Codifies the existing CK secure-development and configuration practice as a controlled standard; states known gaps honestly against ISMS-13 (Certification Readiness Checklist). |

---

## 1. Purpose and scope

This standard documents how the **CK工程 / CK Construction** application is designed, coded, configured, and changed so that security is built in rather than bolted on. It applies to the entire production system:

- Web/app source under `src/` (React 18 + TypeScript ~5.4 + Vite + Tailwind, Capacitor 8 iOS/Android shell).
- The Supabase backend: PostgreSQL schema, Row-Level Security (RLS) policies, `SECURITY DEFINER` RPCs, triggers, and Edge Functions under `supabase/`.
- The build/release toolchain (Codemagic, Apple App Store Connect, Google Play) and the source repository (GitHub).

The system is a single-operator product: **關進杰 is simultaneously the sole developer, the release manager, and the ISMS Owner.** This standard therefore favours *technical enforcement that survives the absence of a second reviewer* (database-level guards, append-only ledgers, automated scans) over process controls that assume a separate approver. Where a control is partial or planned, this is stated explicitly and cross-referenced to **ISMS-13 Certification Readiness Checklist**.

> **Honesty note for the auditor.** Several controls described below are *implemented but flag-gated OFF*, or *implemented but report-only*. These are flagged in-line and summarised in §11. Do not read this document as a claim that every described control is currently *enforcing*.

---

## 2. Secure development life cycle (A.8.25)

### 2.1 Architecture as a security control (A.8.27)

CK is a deliberately small attack surface: a **two-tier** architecture (React SPA ↔ Supabase) with **no application server and no bespoke API layer**. This removes an entire class of server-side bugs (injectable controllers, broken session middleware, SSRF in a custom backend) because there is no such code to get wrong. All trust decisions are pushed to two places that are both under version control:

1. **The database** — RLS + `SECURITY DEFINER` RPCs + triggers (the authoritative gate).
2. **The client** — role gating for UX only, never relied upon for security.

The defining principle (`CLAUDE.md` Architecture → Role-Based Gating): **role gating exists in TWO places and the database one is authoritative.** The client hides what a user may not do; the database *refuses* it regardless of what the client sends. Every security fix in §3 closes a hole on the **server** side, precisely because a hostile client (raw REST `PATCH` with a stolen JWT) is the assumed threat model.

### 2.2 Phased delivery with verify-by-execution

Features ship as **versioned SQL migrations** (`supabase/v2-schema.sql` … `v79-photo-metadata.sql`) plus the matching TypeScript. The naming convention is semantic, not timestamped: a fix for a prior version stays under that version's prefix (e.g. `v4-fix-issue-update-rls.sql` fixes `v4-issues-schema.sql`; the `v55b…v55f` series are follow-up fixes to `v55-equipment-forms-schema.sql`). Large migrations are split for reviewability (`v5-split/`, `v10-split/`, `v40-split/`, `v59-modules-rls-1/2`).

Each migration file carries a header block stating **what defect it fixes, why, the threat scenario, and a post-apply "verify by execution" recipe.** See for example the `Post-apply verification (execute, not source)` footers in `v50-membership-role-escalation-guard.sql:115`, `v51-audit-ledger-tamper-evidence.sql:189`, `v54-step-up-rollout-flag.sql:74`, and `v55e-credential-insert-guard.sql:40`. **Migrations are verified by executing them and re-probing the behaviour, never by reading the SQL source** — a deliberate control recorded in the operator's working memory (`MEMORY.md → supabase-migration-apply`, `rls-insert-privileged-columns`).

### 2.3 Adversarial pre-ship testing

Before a security-sensitive feature ships, it is exercised by **adversarial persona / RLS simulations** and **code-review skills**:

- The repository ships dedicated simulation skills (`.claude/skills/simulate`, `daily-site-sim`, `lifecycle`, `persona-simulate`) that drive the **live** backend as each of the 8 real roles over Supabase REST with real JWTs, and that **assert both the success AND the denial direction** for every action.
- These simulations have a track record of finding live P0 holes: the self-promotion-to-admin and global-PII-read holes documented in `v17-user-profiles-rls-hardening.sql:4-16` were found by *persona-sim round 2*; the `project_members` role-escalation hole (`v50`) was found by the *2026-06 security audit*; the `user_credentials` self-verify hole (`v55e`) was found by the *F5 denial sim*; the PTW safety-officer override gap (`v76`) was found by *function review #1*.

This is the working evidence for **A.8.25 (security testing in the SDLC)** and **A.8.26 (security requirements identified and verified)**. The requirements are encoded as the denial-direction assertions; passing them is the acceptance criterion.

---

## 3. Secure coding standard (A.8.28)

The following are **mandatory coding rules**, each grounded in shipped CK code. They are written as a checklist a future change must satisfy.

### 3.1 RLS-first; never trust the client

Every table has RLS enabled and a default-deny posture. New tables **must** ship with RLS in the same migration that creates them. Where a read policy would otherwise have to recurse through another RLS-protected table, the check is delegated to a `SECURITY DEFINER` helper with `set row_security = off` so the policy itself never recurses (`v17-user-profiles-rls-hardening.sql:82` `shares_project_with()`, `:108` `is_pm_of_applicant()`).

The canonical project-scope helpers are `can_view_project()` / `can_edit_project()`-style `SECURITY DEFINER` functions used across policies (e.g. `photo_metadata` RLS gates on `can_view_project`, `v79-photo-metadata.sql:19`).

### 3.2 Pin `search_path` on every `SECURITY DEFINER` function

A `SECURITY DEFINER` function runs with the definer's privileges; without a pinned `search_path` an attacker who can create objects in a schema earlier on the path can shadow a table the function references and hijack it. **Rule: every `SECURITY DEFINER` function MUST declare `set search_path = public` (or `public, extensions` where pgcrypto is used).** This is observed on essentially all such functions — 106 occurrences across 40 migration files — e.g. `v17:38`, `v50:27`, `v51:44/58`, `v52-step-up-foundation.sql:52`, `v55e:18`.

### 3.3 Least-privilege RPCs

Privileged operations are exposed only through RPCs that are **revoked from `public` and granted to `authenticated`**, with an explicit role check inside the body. Examples: `admin_update_user_role()` raises `'admin only'` unless the caller is admin (`v17:188-213`); `mint_step_up_grant()` / `assert_step_up()` / `set_step_up_enforced()` are `revoke all … from public; grant execute … to authenticated` (`v52:76-77`, `v54:46-47/71-72`); `export_ledger_proof()` raises `'只有管理員可匯出完整證明'` for non-admins (`v51:174`).

### 3.4 Privileged columns are guarded on BOTH INSERT and UPDATE

A `WITH CHECK` clause sees only the NEW row and cannot compare to OLD, so it cannot stop a caller flipping their own `role`/`global_role`/`verified_at`. The correct mechanism is a **`BEFORE INSERT/UPDATE` trigger** that *pins* privileged columns to their OLD value (UPDATE) or NULLs them (INSERT) for non-sanctioned callers, with sanctioned RPCs opting through via a transaction-local flag a raw `PATCH` cannot set:

- `user_profiles` write-gate — reverts `global_role`/`sub_role`/`phone`/`id` for non-admins (`v17:34-77`).
- `project_members` write-gate — pins `role`/`user_id`/`project_id`; `pm_assign_safety_officer()` opts through with `app.member_role_change='on'` (`v50:23-113`).
- `user_credentials` guard — extended to **BEFORE INSERT too** after the F5 sim showed an INSERT-time self-verify hole; clients may only create an *unverified* credential (`v55e:17-38`).

This rule is recorded permanently in operator memory (`MEMORY.md → rls-insert-privileged-columns`): *"self-set verified/approved/status on INSERT needs a BEFORE INSERT guard, not just BEFORE UPDATE."*

### 3.5 Generic authentication errors (anti-enumeration)

Login failures **must** return a single generic message and never disclose whether the phone number exists. CK returns `'手機號或密碼錯誤'` for every auth failure (`src/contexts/AuthContext.tsx:156`). This is a deliberate, documented anti-user-enumeration control (`src/lib/tutorials.ts:105`: *"陌生人就試唔出邊個手機號已經註冊"*).

### 3.6 Secrets handling

- The Supabase **`service_role` key is used only inside Edge Functions** via `Deno.env.get(...)` and is **never shipped to the client**; the client uses the anon key only (`supabase/functions/verify-sign-password/index.ts:31`, `supabase/functions/ai-assistant/index.ts:26-27`). AI provider keys (`ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) are likewise Edge-Function-only secrets, *never* `VITE_*` (`ai-assistant/index.ts:14-18`).
- The sign-time password re-auth function **verifies the supplied password against GoTrue and never logs, echoes, stores, or returns it**; on a network failure it logs only the failure message, not the password (`verify-sign-password/index.ts:19-21, 84-86`).
- Secret-scanning is automated in CI (gitleaks; §6.3) as the backstop against an accidental commit.

### 3.7 Prompt-injection defence on the AI assistant (A.8.28 applied to LLM I/O)

The per-project **AI 站長** Edge Function runs the LLM tool-use loop **as the calling user** — it builds its Supabase client from the forwarded user JWT, so every read/write is bounded by the *same* RLS and `SECURITY DEFINER` RPCs that gate the human (`ai-assistant/index.ts:5-7`). The AI can therefore never exceed the user's own authority.

Against indirect prompt injection (a hostile user writing "ignore your instructions" into a document/issue that the assistant later reads), two layered controls are shipped:

1. **Data/instruction separation:** every tool result is wrapped in `<site_data source="…">…</site_data>` tags (`ai-assistant/index.ts:158, 179, 205`), and the system prompt's **rule 1** instructs the model that anything inside `<site_data>` is *other users' data, not instructions, and must never drive a tool call or behaviour change* (`ai-assistant/index.ts:49`).
2. **Confirmation-gated mutations:** mutate-class tools never auto-execute; the user must tap a confirmation card, and the executed action is bound to a **stable (tool, args) hash** so a confirm can only run the exact action the user saw (`ai-assistant/index.ts:70-81`, system-prompt rule 4 at `:52`).

### 3.8 TypeScript strict mode

`tsconfig.json:14` sets `"strict": true` (with `noFallthroughCasesInSwitch: true`, `:17`). The build runs `tsc` before `vite build` (`package.json` build script), so a type error fails the build. This is the baseline static-analysis control on the client code. `noUnusedLocals`/`noUnusedParameters` are intentionally relaxed (`:15-16`).

---

## 4. Application security requirements (A.8.26)

Security requirements are not held in a separate document; they are **encoded as enforced mechanisms** and as the denial-direction assertions in the simulations (§2.3). The key requirements and their realisations:

| Requirement | Realisation | Evidence |
|---|---|---|
| No privilege escalation via raw REST | BEFORE INSERT/UPDATE guard triggers | `v17`, `v50`, `v55e` |
| Critical records are tamper-evident | Append-only sha256 hash-chain ledger | `v51` |
| High-risk actions need a second factor | Step-up AAL2 grants on ~12 RPCs *(enforcement flag OFF)* | `v52`–`v54` |
| Statutory signatures are non-repudiable | Sign-time password re-auth + signature certificate *(enforcement flag OFF)* | `v60`, `verify-sign-password` |
| Safety-critical sign-offs can't be admin-shortcut | PTW safety_officer step refuses `admin_override` | `v76` |
| Files are not publicly reachable | Private buckets + short-lived signed URLs only | §5.2 |
| Site-photo evidence is verifiable | Append-only GPS+timestamp metadata | `v79` |
| Account deletion preserves the audit trail | Hard-delete user; authored FKs set null | `v6`/`v20`, `v68` |

### 4.1 Tamper-evident audit ledger (A.8.26 integrity requirement)

`audit_ledger` (`v51`) is an **append-only sha256 hash chain**: each row hashes its own canonical fields plus the previous row's hash (`v51:39-53` `audit_ledger_canon`, `:56-86` `audit_ledger_append`). `AFTER INSERT/UPDATE/DELETE` triggers are attached to **13 critical tables** (`approvals, site_instructions, si_versions, variation_orders, vo_versions, permits_to_work, ptw_versions, permit_signoffs, documents, document_versions, document_events, progress_history, project_members, user_profiles`) (`v51:104-115`). The ledger itself is immutable — a `BEFORE UPDATE/DELETE` trigger raises `審計帳本唯讀` (`v51:88-98`). Integrity is provable on demand via `verify_integrity()` (walks the chain, recomputes every hash, reports the first break, `v51:121-162`) and `export_ledger_proof()` (admin-only offline-verifiable proof, `v51:166-187`). The design is honestly scoped as **tamper-EVIDENT, not tamper-impossible** (`v51:14-16`).

---

## 5. Secure architecture & engineering principles (A.8.27)

### 5.1 Authentication model

Phone+password via **synthetic email** (`<digits>@phone.local`) on Supabase **GoTrue**; passwords are bcrypt-hashed by GoTrue and **the application never stores or sees a password at rest** (`src/lib/phone.ts` synthesis; `verify-sign-password/index.ts:65-67` re-derives the synthetic email to verify against GoTrue). 8 roles + per-project membership; RBAC enforced in both client and DB (§2.1). The auth model is **locked** for this milestone — no magic links / SSO (`CLAUDE.md` Constraints). Apple's account-deletion review is preserved: `delete_my_account()` hard-deletes `auth.users` with cascade while authored-content FKs are set null to keep the audit trail intact (`v6-account-deletion.sql`, `v20-delete-account-fk-cascade.sql`, `v68-dailies-fk-set-null.sql`).

### 5.2 Storage & cryptography

Storage buckets are **private (`public = false`)**; the client mints **short-lived signed URLs** for every download and **never** uses `getPublicUrl`. Verified across the codebase — `createSignedUrl` is the only access path: `src/contexts/DrawingsContext.tsx:415/426`, `src/contexts/DocumentsContext.tsx:555/566`, `src/lib/ptw.ts:83`, `src/lib/issuePhotos.ts:29`, `src/lib/si.ts:53`, `src/lib/export.ts:883` (with bounded TTLs). Encryption is provided by the Supabase platform: **TLS 1.2+ in transit, AES-256 at rest** (see ISMS-07 Cryptography Policy). Bucket size limits are enforced at the storage layer (`v71-storage-bucket-limits.sql`) and photos are compressed client-side (`src/lib/image-compress.ts`). Private-by-default was retrofitted where it had been missed (`v74-issue-photos-private.sql`).

### 5.3 Defence in depth — layered authorisation

A request must pass, in order: TLS → GoTrue session (AAL) → RLS policy → `SECURITY DEFINER` RPC role check → BEFORE INSERT/UPDATE guard trigger → (when enforced) step-up / sign-reauth assertion → append to the tamper-evident ledger. No single layer is trusted alone.

---

## 6. Configuration management (A.8.9)

### 6.1 Source of truth & change control

The Git repository is the single source of truth for application code, SQL migrations, Edge Functions, and native build config (`capacitor.config.ts`, `ios/`, `android/`, `codemagic.yaml`). Because CK is single-operator, the *separate-reviewer* control is satisfied instead by **automated, attributable controls**: per-commit CI scans (§6.3), the verify-by-execution migration discipline (§2.2), and the tamper-evident ledger over production data changes (§4.1).

### 6.2 Controlled database-migration procedure

Migrations are applied **manually via the Supabase SQL editor**, then **verified by execution** (re-running the probe in the file's `Post-apply verification` footer), not by reading the source. The operator's working note on the procedure and its gotchas is `MEMORY.md → supabase-migration-apply`. The migration file *is* the change record; the file header documents intent, threat, and verification.

**Required control — production-vs-repo drift check.** A *periodic* check that the deployed schema/policies/RPCs match the migration files in the repo is **required** and currently performed only ad-hoc during simulations. Action: define and schedule a recurring drift check (compare live `information_schema` / `pg_policies` / `pg_proc` against the applied migration set). Tracked in ISMS-13.

### 6.3 CI security gates (partial — must complete)

Automated configuration/dependency hygiene is implemented but **report-only**:

- **Dependabot** — weekly npm + github-actions update PRs, labelled `security` (`.github/dependabot.yml`).
- **`npm audit --audit-level=high`** — runs on push to `main`, on every PR, and weekly (`.github/workflows/security.yml:20-30`).
- **gitleaks secret scan** — full-history scan on the same triggers (`.github/workflows/security.yml:32-42`).

**Honest status:** both jobs end in `|| true` and are explicitly **REPORT-ONLY** by design comment (`security.yml:5-7`) so historical findings don't block. **Required action: flip these to *blocking* once the baseline is clean**, and integrate the gate into the release path (the scans currently run independently of the Codemagic build pipeline). Until then, the dependency-vulnerability and secrets gates *detect* but do not *prevent* a vulnerable/leaky build. Tracked in ISMS-13.

### 6.4 Native build configuration

iOS uses production APNs entitlement (`ios/App/App/App.entitlements` `aps-environment = production`); Android targets `compileSdk 36 / minSdk 24` (`android/variables.gradle`). Supabase URL + anon key are baked per-workflow in `codemagic.yaml` (anon key only — never the service_role key). PWA service workers are deliberately *not* registered; `public/sw.js` is a kill-switch that unregisters stale v1 workers (`src/main.tsx`).

---

## 7. Roles and responsibilities

| Role | Person | Responsibility |
|---|---|---|
| ISMS Owner / Top Management | 關進杰 | Owns this standard; approves enforcement-flag flips; reviews CI findings. |
| Developer / Release Manager | 關進杰 | Writes migrations + code to this standard; runs adversarial sims; applies & verifies migrations. |
| Automated controls | CI + DB | Dependabot, npm audit, gitleaks, guard triggers, audit ledger — enforce/detect without a human in the loop. |

Single-operator concentration risk and the absence of a second code reviewer are acknowledged risks in ISMS-03 (Risk Assessment); the automated/technical controls in this standard are the compensating measures.

---

## 8. Step-up MFA and signature re-auth — implemented, enforcement OFF

Both controls are **fully built (DB + Edge + client UI in code)** but their **enforcement flags are OFF** pending the 1.5 client being live on both app stores:

- **Step-up MFA (AAL2):** Supabase native TOTP; `mint_step_up_grant()` requires `auth.jwt()->>'aal' = 'aal2'` (`v52:64`), `assert_step_up()` is wired into ~12 high-risk RPCs. The rollout flag `app_config.step_up_enforced` **defaults FALSE** and makes `assert_step_up()` a no-op (`v54:19, 29-33`) so existing live clients are not locked out. Client UI: `StepUpContext`.
- **Sign-time re-auth (non-repudiation):** `verify-sign-password` Edge Function mints a 5-minute grant bound to the signing moment after re-verifying the password against GoTrue (`verify-sign-password/index.ts:11-21`); `get_signature_proof` issues the certificate. Flag `sign_reauth_enforced` is **OFF** (`v60-sign-reauth.sql`). Client UI: `SignReauthContext`.

**Action:** flip both flags ON only after the 1.5 build is live on iOS + Android + web (the documented deploy-order safety, `v54:5-15`). Tracked in ISMS-13.

---

## 9. Sub-processors in the development/delivery chain

| Sub-processor | Used for | Security note |
|---|---|---|
| Supabase | DB / Auth / Storage / Edge / Realtime | Has DPA + SOC 2 + ISO 27001. **No signed DPA on file for CK yet — required (ISMS-05/13).** Hosting = **Free tier: NO managed PITR / daily backup (known gap, ISMS-08).** |
| GitHub | Source repo + Dependabot + Actions CI | Account-MFA not yet evidenced (§11). |
| Codemagic + Apple | Build / sign / distribute (iOS live; Android pending Play verification) | Apple Team ID `C22JSRYW54`. |
| OneSignal | Push notifications | Free tier. |
| OpenRouter → moonshotai/kimi-k2 (and/or Anthropic) | AI 站長 inference | Key is Edge-Function-only (§3.6). Code defaults to Anthropic with an OpenRouter switch; **live AI 站長 currently runs on `moonshotai/kimi-k2` via OpenRouter** (Western providers return 403 on the live account — `MEMORY.md → ai-assistant-go-live`). User data crosses to the inference provider only within the calling user's RLS scope (§3.7). |

---

## 10. Verification & compliance

- **Per-change:** `tsc` strict build must pass; the relevant `Post-apply verification` recipe must be executed against the live backend; adversarial denial-direction assertions for any touched authorisation path must pass.
- **Per-push/PR & weekly:** `npm audit` + gitleaks run in CI (report-only — §6.3).
- **On demand:** `verify_integrity()` proves the audit chain is intact; `export_ledger_proof()` produces an offline-verifiable proof.
- **Annual:** this standard is reviewed (next: 2027-06-18) and re-aligned to the code.

---

## 11. Known gaps (read honestly with ISMS-13)

1. **Backup/PITR** — Supabase **Free tier has no managed PITR or daily backup**; no independent backup is yet configured (ISMS-08).
2. **Step-up MFA + sign-reauth enforcement** — built and shipped in code, but both flags are **OFF** pending the 1.5 store release (§8).
3. **Account-MFA on the toolchain** — MFA on the Supabase, Apple, GitHub, and Codemagic operator accounts is **not yet evidenced**.
4. **No signed Supabase DPA** on file (§9).
5. **`verify_integrity()` not yet scheduled** — integrity is verifiable on demand but the **anomaly-detection cron is deferred**, so a tamper event is not yet auto-alerted.
6. **CI dependency-vuln + secret gates are REPORT-ONLY** (`|| true`) and not in the release path — must be made **blocking** (§6.3).
7. **Prod-vs-repo configuration drift check** is ad-hoc, not scheduled (§6.2).

All seven are tracked in **ISMS-13 Certification Readiness Checklist** with target dates. None is misrepresented above as an enforcing control.

---
*End of ISMS-10 — Secure Development & Configuration Standard.*
