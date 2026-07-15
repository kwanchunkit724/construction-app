# 00 — ISMS Scope, Context & Interested Parties

**ISO/IEC 27001:2022 — Clauses 4 (Context of the organisation) & 5 (Leadership)**

| Field | Value |
|-------|-------|
| **Document** | ISMS Scope, Context & Interested Parties |
| **Document Owner** | 關進杰 (Kwan Chun Kit) — ISMS Owner / Top Management |
| **Version** | 1.0 |
| **Date** | 2026-06-18 |
| **Status** | Approved by ISMS Owner |
| **Next review** | 2027-06-18 (or on material change to scope, sub-processors, or risk profile) |
| **Classification** | Internal (內部) |

**Revision history**

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 | Initial issue. Defines ISMS scope, context, interested parties, objectives, roles, and leadership commitment for the CK工程 / Construction App. |

> **Honest status (read first).** This document is part of a **self-prepared** ISMS pack authored to reach *certification readiness* against ISO/IEC 27001:2022. **CK工程 is NOT ISO 27001 certified.** Certification can only be granted by a UKAS/HKAS-accredited certification body after a Stage 1 + Stage 2 audit. Until then, CK must use only the claims listed in §8 "Honest claim boundary" of this document. Remaining gaps and the path to closure are tracked in `13-certification-readiness-checklist.md`.

---

## 1. Purpose & scope of this document

This document satisfies ISO/IEC 27001:2022 **Clause 4** (understanding the organisation and its context, interested parties, and determining the scope of the ISMS — including the documented scope statement required by **Clause 4.3**) and the **Clause 5** leadership elements (top-management commitment per 5.1; reference to the information security policy per 5.2; ISMS roles & responsibilities per 5.3).

It is the anchor document of the ISMS pack: every other document (`01`–`13`) operates **inside the scope defined here**.

---

## 2. Organisational context (Clause 4.1)

### 2.1 What CK工程 is

**CK工程 / CK Construction** is a Hong Kong construction site-management SaaS. It replaces the WhatsApp + paper-diary + spreadsheet status quo with one shared system in which 判頭 (subcontractors), 工地主任/管工 (site agents/foremen), PMs, owners and safety officers coordinate project zones, progress, issues, permits, drawings and approvals — with **a shared audit trail that survives disputes**.

The product is **LIVE**: distributed on the **Apple App Store** (account-deletion review already passed) and on **Android** via Capacitor 8 (build verified; pending Google Play developer identity verification, per `CLAUDE.md`).

- **Client:** React 18 + TypeScript (strict) + Vite + Tailwind, wrapped natively by Capacitor 8 for iOS/Android (`capacitor.config.ts`, `appId: com.kwanchunkit.constructionapp`). UI is entirely **Traditional Chinese (zh-HK)**.
- **Backend:** **Supabase** managed platform — PostgreSQL + Row-Level Security, GoTrue Auth, Storage, Realtime, and Edge Functions (Deno). Project ref `syyntodkvexkbpjrskjj` on the **Free tier**. There is **no application server of CK's own** — the architecture is two-tier (React SPA ↔ Supabase), so most operational security is expressed as PostgreSQL RLS policies, `SECURITY DEFINER` RPCs, and four Edge Functions.

### 2.2 Why an ISMS, and what it must protect

The product's core value is that **every instruction, permit, drawing, progress tick and issue is captured in one system with a tamper-evident audit trail**. The ISMS therefore exists primarily to protect, in priority order:

1. **Integrity** of the dispute-surviving record — implemented as the append-only, SHA-256 hash-chained `audit_ledger` (`supabase/v51-audit-ledger-tamper-evidence.sql`), and signature non-repudiation (`supabase/v60-sign-reauth.sql`).
2. **Confidentiality** of cross-tenant project data and personal data (PII of contractors and workers), enforced by per-table RLS and per-project membership.
3. **Availability** of the live service for HK contractors who depend on it daily.

### 2.3 Internal issues (factors within CK's control)

- **One-person organisation.** 關進杰 is sole founder, developer, operator and ISMS owner. This is the dominant internal context factor: it gives fast, consistent decision-making but means **no inherent segregation of duties** and a **key-person/bus-factor risk** (tracked in `04-risk-assessment-and-treatment.md`).
- **Locked tech stack** (`CLAUDE.md`): React/TS/Vite/Tailwind/Capacitor/Supabase — no rewrites this milestone; security work is additive (versioned SQL migrations `v2`…`v80`).
- **Defence-in-depth security culture already in code:** RBAC enforced in **both** the client **and** the database; least-privilege RPCs; adversarial RLS/persona simulations run pre-ship (`.claude/skills/daily-site-sim`, `simulate`, `persona-simulate`, `lifecycle`).
- **Manual change process:** migrations are applied by hand through the Supabase SQL editor and **verified by execution**, not by source (user memory `supabase-migration-apply`). This is a deliberate control choice for a solo operator but is itself a process risk (no CI gate).

### 2.4 External issues (factors outside CK's control)

- **Heavy reliance on sub-processors** — the backend, auth, storage and compute are entirely Supabase; CK owns no infrastructure. Sub-processor posture (§5) is a primary external dependency.
- **Hong Kong regulatory environment** — the **Personal Data (Privacy) Ordinance (PDPO, Cap. 486)** and the **Office of the Privacy Commissioner for Personal Data (PCPD / 私隱專員公署)** apply to PII held about HK users.
- **Apple App Store review regime** — any new auth or account flow must preserve the already-approved account-deletion behaviour (`CLAUDE.md`; `supabase/v6-account-deletion.sql`).
- **Free-tier platform limits** — Supabase Free tier has a 1 GB storage cliff and **no managed PITR / scheduled backup** (a known availability gap, §7 and `09-backup-and-business-continuity.md`).

---

## 3. ISMS scope statement (Clause 4.3)

> **The ISMS of CK工程 covers the design, development, operation, security and support of the CK工程 / Construction App SaaS — the React/TypeScript/Capacitor web and mobile client and its Supabase-hosted backend (PostgreSQL with Row-Level Security, GoTrue authentication, Storage, Realtime, and Edge Functions) — together with the build, release and distribution pipeline (source repository, Codemagic CI, Apple App Store and Google Play), and the management of all information assets processed therein, including construction project data and the personal data of Hong Kong contractors, subcontractors, foremen, workers, owners and safety officers, and the tamper-evident audit ledger that records critical actions. The ISMS is operated by the sole founder, 關進杰, who acts as top management and ISMS owner.**

### 3.1 In scope

| Domain | Specifics & evidence |
|--------|----------------------|
| **Web/mobile client** | React 18 + TS + Vite + Tailwind, Capacitor 8 iOS/Android shells. Connects to Supabase using only the **anon key** (`src/lib/supabase.ts:6,118` — `VITE_SUPABASE_ANON_KEY`); the privileged service_role key is **never** in the client. |
| **Authentication** | Phone+password via synthetic email `<digits>@phone.local` on GoTrue (`src/lib/phone.ts`; bcrypt at GoTrue — the app never stores or sees the password hash). 8 roles (`src/types.ts:1-9`: admin, pm, main_contractor, subcontractor, subcontractor_worker, owner, safety_officer, general_foreman) + per-project membership. |
| **Authorization (RBAC + RLS)** | Role gating enforced in **two** places — client UI and database. Per-table RLS on every table; `SECURITY DEFINER` helpers `can_view_project` / `can_edit_project` with `set search_path = public` to block shadow-table injection; least-privilege RPCs (revoke from public, grant to authenticated). |
| **Data store** | Supabase PostgreSQL, incl. `progress_leaf_items`, `user_profiles`, `project_members`, SI/VO, PTW, documents, drawings, equipment forms, and the `audit_ledger`. |
| **Integrity / audit** | Append-only SHA-256 hash-chained `audit_ledger` with AFTER-insert/update/delete triggers on **14 critical tables** (`supabase/v51-audit-ledger-tamper-evidence.sql:100-115`); `verify_integrity()` and admin-only `export_ledger_proof()`; UPDATE/DELETE on the ledger always raise (`v51:88-98`). |
| **Storage** | Private Supabase Storage buckets (`public=false`) accessed via short-lived signed URLs; server-side size/MIME limits (`supabase/v71-storage-bucket-limits.sql`); `photo_metadata` append-only GPS+timestamp (`supabase/v79-photo-metadata.sql`). |
| **Edge Functions (Deno)** | `verify-sign-password` (sign-time password re-auth; password **never logged/stored/returned** — `functions/verify-sign-password/index.ts:19-20`, README §22), `ai-assistant`, `build-memory-graph`, `weather-sync`. service_role key lives **only** here, via `Deno.env`. |
| **Build / release / distribution** | Source repository, **Codemagic** CI (Team ID `C22JSRYW54`, `codemagic.yaml`), Apple App Store + TestFlight, Google Play internal track. |
| **Information assets** | All construction data + PII processed by the above. Full inventory + classification in `03-asset-register-and-classification.md`. |

### 3.2 Out of scope / inherited (Clause 4.3 justified exclusions)

| Item | Treatment | Justification |
|------|-----------|---------------|
| **Physical data-centre & infrastructure security** | **Inherited** from Supabase (ISO 27001 / SOC 2 certified infrastructure). | CK owns no premises or servers; Annex A.7 physical controls are operated by the cloud provider. Workstation hardening of the founder's dev machine remains in scope (`06`/`08`). |
| **Sub-processor internal controls** | **Assessed, then inherited** — Supabase, OneSignal, Apple, Codemagic, OpenRouter/Anthropic. | CK cannot operate another company's internal controls; it assesses and relies on their attestations (§5; `12-supplier-and-cloud-security.md`). |
| **End-user devices (workers' phones)** | Out of scope as managed assets. | CK does not own or manage HK users' personal devices; mitigations are app-side (session handling in `src/lib/supabase.ts`, signed URLs, account deletion). |
| **The construction work itself / on-site physical safety** | Out of scope. | CK is a record-keeping SaaS; physical site safety is the contractor's statutory duty. CK records permits/safety sign-offs but does not perform them. |

---

## 4. Interested parties & their requirements (Clause 4.2)

| Interested party | Their relevant needs / expectations | How CK currently meets it (evidence) |
|------------------|--------------------------------------|---------------------------------------|
| **HK contractors / subcontractors / foremen / owners (users)** | Their project data is isolated per project; the audit trail is trustworthy in a dispute; they can permanently delete their account. | Per-project RLS + membership; tamper-evident `audit_ledger` (v51); Apple-reviewed `delete_my_account()` hard-deletes `auth.users` with cascade, authored-content FKs set NULL to preserve audit trail (`supabase/v6-account-deletion.sql:18-65`). |
| **Workers (subcontractor_worker)** | Minimal PII exposure; read-only where appropriate; account deletion. | Applicant PII restrictions (`v31-applicant-pii-fix.sql`); workers are read-only (`CLAUDE.md` role gating); same deletion path. |
| **Apple (App Store)** | Account deletion must work; new auth flows must not regress review compliance. | Account-deletion review **already passed**; auth model locked to phone+password (no magic links/SSO this milestone, `CLAUDE.md`). |
| **Supabase (platform / processor)** | Acceptable use; correct key custody; staying within tier limits. | anon key only in client; service_role only in Edge Functions; server-side storage limits (`v71`). **Gap:** no signed Supabase DPA on file (§7, `12`). |
| **PCPD / 私隱專員公署 (regulator, under PDPO Cap. 486)** | Lawful, fair, secure handling of HK personal data; data-subject access & erasure; breach handling. | RLS confidentiality; encryption in transit/at rest; self-service erasure (`v6`); incident plan (`10`). PDPO mapping detailed in `12` and `05` (A.5.34 privacy). |
| **OneSignal / OpenRouter→Anthropic (kimi-k2) / Codemagic (sub-processors)** | Correct, least-privilege integration; no leakage of secrets. | Push keyed by `external_user_id` (`src/lib/push.ts`); AI 站長 via server-side Edge Function; CI secrets in Codemagic env, not in source. Assessed in `12`. |
| **Top management / owner (關進杰)** | A defensible, audit-ready security posture that supports HK tenders and certifications without overstating compliance. | This ISMS pack; honest claim boundary (§8). |

---

## 5. Sub-processors in scope (summary)

Full assessment in `12-supplier-and-cloud-security.md`. Summary:

| Sub-processor | Service | Assurance held | Notes |
|---------------|---------|----------------|-------|
| **Supabase** | DB, Auth, Storage, Edge, Realtime | DPA available; SOC 2; ISO 27001 (provider infrastructure) | **Gap:** no countersigned DPA on file for CK's account (§7). |
| **OneSignal** | Push notifications | Vendor security program | Keyed by `external_user_id` only. |
| **Apple** | iOS build + distribution | Apple platform terms | Account-deletion compliance maintained. |
| **Codemagic** | CI build/distribute (`codemagic.yaml`) | Vendor security program | CI secrets stored as workflow env vars. |
| **OpenRouter → Anthropic (`moonshotai/kimi-k2`)** | AI 站長 assistant | Provider terms | Server-side only via `ai-assistant` Edge Function; OpenRouter blocks Western providers (user memory `ai-assistant-go-live`). |

---

## 6. ISMS objectives (Clause 6.2 — stated here, measured in `11`/`13`)

1. **Preserve audit-trail integrity.** Maintain a 100%-intact hash chain. *Measure:* `verify_integrity()` / scheduled `run_integrity_check()` returns `intact: true`. (`v51`; `supabase/v80-integrity-monitoring-cron.sql`.)
2. **Prevent cross-tenant / privilege-escalation data exposure.** Zero successful escalations. *Measure:* adversarial RLS/persona simulations pass; escalation holes closed and regression-guarded (v17 self-promote BEFORE UPDATE gate; v18; v50 membership-role guard; v55e credential self-verify; v69; v76 PTW override; v77).
3. **Protect personal data per PDPO.** Zero unauthorised PII disclosures; data-subject erasure available on demand. *Measure:* `delete_my_account()` operational; applicant-PII RLS in force.
4. **Encrypt all data in transit and at rest.** *Measure:* TLS 1.2+ (Supabase platform) and AES-256 at rest (platform) — 100% coverage.
5. **Reach ISO 27001 certification readiness.** *Measure:* `13-certification-readiness-checklist.md` items closed; Stage 1 documentation complete.
6. **Close the known availability gap.** Establish a tested backup/restore capability beyond Free-tier defaults. *Measure:* a successful documented test-restore (`09`).

---

## 7. Known gaps in scope (declared honestly for the auditor)

These are **in scope** and tracked in `13-certification-readiness-checklist.md`; they are stated here so the scope is not read as a clean bill of health.

- **Backup / availability (highest):** Supabase **Free tier provides no managed PITR or scheduled daily backup**. No tested restore exists yet. (`09`.)
- **MFA & signature-reauth enforcement flagged OFF:** Step-up TOTP / AAL2 is built across ~12 high-risk RPCs but gated by `app_config.step_up_enforced` **default false** (`supabase/v54-step-up-rollout-flag.sql:19,31`); sign-time re-auth gated by `sign_reauth_enforced` **default false** (`supabase/v60-sign-reauth.sql:56,70`). Both client UIs exist (StepUpContext / SignReauthContext) and ship with the 1.5 build; flags are to be flipped once 1.5 is live on both stores.
- **Account MFA on admin consoles not evidenced:** MFA on the Supabase, Apple, GitHub and Codemagic accounts is not yet documented.
- **No countersigned Supabase DPA on file.** (`12`.)
- **Integrity monitoring not yet scheduled in production:** `run_integrity_check()` + daily `pg_cron` schedule and the `integrity_check_log` table are **written** (`supabase/v80-integrity-monitoring-cron.sql`) but the cron is **not yet confirmed deployed/scheduled** on the live project (apply is manual + verify-by-execution). Until verified live, integrity verification is effectively on-demand.
- **No CI dependency-vulnerability gate** in the Codemagic pipeline. (`07`.)
- **Solo operator → no segregation of duties.** People controls (A.6) are "applicable but minimised" and scale on first hire (`02`).

---

## 8. Honest claim boundary

**✅ May be claimed today** (each grounded in evidence above):
"Built on ISO 27001 / SOC 2 certified infrastructure (Supabase); TLS 1.2+ in transit and AES-256 at rest; database-level row-level security enforcing role-based access; a tamper-evident, append-only audit trail; per-project data isolation; and Apple-reviewed account deletion."

**❌ Must NOT be claimed** until an accredited certification body issues a certificate:
"ISO 27001 certified", "ISO 27001 compliant", "DWSS certified", or any equivalent. CK is **self-prepared toward readiness only.**

---

## 9. ISMS roles & responsibilities (Clause 5.3)

CK工程 is a **one-person organisation**. ISO/IEC 27001 scales by *applicability*, not headcount, so a single individual lawfully holds multiple ISMS roles, provided this is documented (it is, here and in `02`).

| ISMS role | Holder | Responsibility |
|-----------|--------|----------------|
| **Top management** | 關進杰 | Provides leadership and commitment (Clause 5.1); approves the information security policy; allocates resources; conducts the management review. |
| **ISMS Owner** | 關進杰 | Owns, maintains and annually reviews this ISMS pack; owns the SoA and risk treatment plan. |
| **Risk Owner** | 關進杰 | Owns the risk register and treatment decisions (`04`). |
| **Asset Owner** | 關進杰 | Owns the asset register and classifications (`03`). |
| **Incident Manager** | 關進杰 | Runs the incident response plan (`10`). |
| **Developer / Operator** | 關進杰 | Implements technical controls (RLS, RPCs, migrations, Edge Functions) and operates the live service. |

> **Segregation of duties (A.5.3) — known limitation.** A solo operator cannot separate development, approval and operation. This is recorded as an accepted, monitored risk in `04`. People controls (A.6 — screening, terms of employment, awareness, disciplinary) are marked **"applicable but minimised"** in `05-statement-of-applicability.md` and become full controls **on first hire**; the trigger and the controls to instate are listed in `02-roles-and-responsibilities.md`.

---

## 10. Leadership commitment (Clause 5.1)

Top management (關進杰), being also the sole operator, demonstrates leadership and commitment to the ISMS by:

- **Establishing and owning** this ISMS and its scope, ensuring it is integrated into the product's existing engineering process (security is shipped as additive, versioned migrations and verified by execution, not bolted on).
- **Setting the information security policy and objectives** (§6), aligned to CK's core value — a dispute-surviving, tamper-evident record.
- **Providing the resources** the ISMS needs (developer time, Supabase platform, CI, and the planned tier upgrade to close the backup gap).
- **Directing and supporting** continual improvement — escalation/RLS holes are found via adversarial simulation and closed under the same version numbering (v17, v18, v50, v55e, v69, v76, v77), and gaps are tracked transparently to closure in `13`.
- **Committing not to overstate compliance** — the honest claim boundary (§8) is a leadership directive binding on all CK marketing, tender and certification materials.

---

## 11. Information security policy reference (Clause 5.2)

The top-level information security policy and its sub-policies are maintained in **`01-information-security-policy.md`**, approved and signed by the ISMS Owner. Domain policies referenced by this scope: access control (`06`), secure development (`07`), cryptography & key management (`08`), backup & continuity (`09`), incident management (`10`), logging & monitoring (`11`), and supplier/cloud security (`12`). The full Annex A control mapping with status and evidence is in `05-statement-of-applicability.md`.

---

*Approved by 關進杰 (ISMS Owner / Top Management), 2026-06-18. Next review 2027-06-18. Part of the CK工程 ISO/IEC 27001:2022 ISMS pack — self-prepared toward certification readiness, NOT certified.*
