# 01 — Information Security Policy

**CK工程 / CK Construction — Information Security Management System (ISMS)**

> **Top-level policy issued under ISO/IEC 27001:2022 Clause 5.2 and Annex A control A.5.1
> (Policies for information security).** This is the single highest-level statement of
> management intent for information security at CK工程. All sub-policies, procedures and
> controls in the ISMS pack (documents 02–13) derive their authority from this document.

| Field | Value |
|-------|-------|
| **Document title** | Information Security Policy |
| **Document owner / approver (top management)** | **關進杰 (Kwan Chun Kit) — Founder, sole operator, ISMS Owner** |
| **Version** | 1.0 |
| **Status** | Approved (self-prepared toward certification readiness — **not yet ISO 27001 certified**) |
| **Issue date** | 2026-06-18 |
| **Next review** | 2027-06-18 (or sooner on a significant change / incident — see §10) |
| **Classification** | 內部 (Internal) |
| **Applies to** | The CK工程 / Construction App SaaS, its Supabase backend, the release toolchain, and 關進杰 as the sole operator. See `00-isms-scope-and-context.md` for the formal scope. |

---

## 1. Purpose

CK工程 / CK Construction is a live Hong Kong construction site-management SaaS (iOS App
Store + Google Play, Capacitor 8). Its **core value is a shared, dispute-surviving audit
trail**: every site instruction, permit, drawing, progress tick and issue is captured in
one system so that 判頭 (subcontractors) and 工地主任 (site agents) always know exactly
what happened on every site, even years later in a contractual dispute.

That core value makes information security **the product**, not an add-on. The purpose of
this policy is to:

- state top management's commitment to protecting the **confidentiality, integrity and
  availability (CIA)** of the construction data and personal data CK holds;
- establish the control framework (ISO/IEC 27001:2022 Annex A) against which CK measures
  itself;
- define responsibilities and the obligations CK must meet (Hong Kong PDPO, Apple App
  Store, and customer/contractual requirements); and
- commit CK to continual improvement of the ISMS and to honest disclosure of its current
  gaps (see §11).

This policy is deliberately CK-specific. Generic boilerplate is minimised; each commitment
below is backed by an implemented control with a file/RPC/table citation, or is honestly
flagged as planned/partial against `13-certification-readiness-checklist.md`.

## 2. Scope

This policy and the ISMS cover (full statement in `00-isms-scope-and-context.md`):

- **The application** — React 18 + TypeScript + Vite + Tailwind web/mobile client packaged
  via Capacitor 8 for iOS and Android.
- **The backend** — the managed **Supabase** project `syyntodkvexkbpjrskjj`
  (PostgreSQL with Row-Level Security, GoTrue Auth, Storage, Realtime, Edge Functions).
- **The release toolchain** — the GitHub source repository, Codemagic CI/CD, Apple App
  Store and Google Play distribution.
- **The information** — construction records (instructions, permits 動火證/工作許可證,
  drawings, progress, issues), the tamper-evident `audit_ledger`, and the personal data
  (phone numbers, names, roles, push tokens, site photos with GPS) of 判頭, 管工, PMs,
  workers and owners across multiple Hong Kong sites.

**Out of scope / inherited:** physical data-centre and infrastructure controls are inherited
from Supabase's own ISO 27001 / SOC 2 certified platform; sub-processors (OneSignal, Apple,
Codemagic, OpenRouter→Anthropic→moonshotai/kimi-k2) are assessed but their internal controls
are inherited (see `12-supplier-and-cloud-security.md`).

CK is a **one-person organisation**. ISO/IEC 27001 scales by *applicability*, not headcount;
controls that depend on having staff (segregation of duties, HR screening, awareness training
records) are marked "applicable but minimised" in the Statement of Applicability
(`05-statement-of-applicability.md`) and become full controls on first hire.

## 3. Policy statement — the CIA commitment

Top management commits to protecting CK's information assets across the three pillars,
prioritised by CK's dispute-survival value (**integrity and availability first, alongside
confidentiality of cross-tenant data and PII**):

### 3.1 Confidentiality
CK enforces **defence-in-depth, least-privilege access** so that each user sees only the
projects and data they are entitled to:

- **Dual role enforcement** — Role-Based Access Control is enforced in **both** the client
  and the database. The database is the authority: every table has Row-Level Security, and
  project visibility/edit rights are centralised in `SECURITY DEFINER` helpers
  `can_view_project` / `can_edit_project_progress`
  (`supabase/v3-progress-schema.sql:33,51`), each pinned with `set search_path = public`
  (lines 38, 56) to block shadow-table / search-path injection.
- **Privilege-escalation holes are found and closed, not assumed absent.** A self-promotion
  hole (any user PATCHing `global_role='admin'`) and a global-PII-read hole discovered by
  adversarial persona simulation were closed by a `BEFORE UPDATE` write-gate trigger and a
  narrowed `SELECT` policy (`supabase/v17-user-profiles-rls-hardening.sql`). Further
  hardening followed: RLS audit (v18), membership-role escalation guard (v50), credential
  self-verify INSERT guard (v55e), column guards (v69), and PTW `safety_officer`
  override/equipment guards (v76/v77).
- **Privileged keys are confined.** The Supabase `service_role` key exists only inside Edge
  Functions via `Deno.env` (e.g. `supabase/functions/verify-sign-password/index.ts:31`); the
  client uses the anon/publishable key only (`src/lib/supabase.ts:6,118`). RPCs are
  least-privilege (`revoke … from public; grant … to authenticated`).
- **Private storage** — Storage buckets are private (`public=false`), served only via
  short-lived signed URLs (e.g. issue photos locked down in
  `supabase/v74-issue-photos-private.sql:26`).
- **Tenant isolation** — RLS prevents cross-project reads; the AI 站長 assistant is bounded
  by the caller's JWT and the same RLS.

### 3.2 Integrity
CK makes any tampering with the dispute record **detectable**:

- **Tamper-evident audit ledger** — `audit_ledger` (`supabase/v51-audit-ledger-tamper-evidence.sql`)
  is an append-only SHA-256 hash chain. `AFTER INSERT/UPDATE/DELETE` triggers on **13 critical
  tables** (approvals, site instructions + versions, variation orders + versions, permits +
  versions + sign-offs, documents + versions + events, progress history, project members,
  user profiles — lines 104–115) append a row whose hash binds the record image to the
  previous row's hash. The ledger is itself immutable: any `UPDATE`/`DELETE` raises (lines
  89–98). `verify_integrity()` (line 121) walks the chain and reports the first break;
  `export_ledger_proof()` (line 166, admin-only) emits offline-verifiable proof. **Honest
  scope: this is tamper-*evident*, not tamper-*impossible*** — a superuser could disable a
  trigger to write unlogged, but cannot edit a past ledger row without breaking the chain
  (documented at v51:12–16).
- **Non-repudiation of signatures (built, enforcement OFF)** — a sign-time password
  re-authentication path (`verify-sign-password` Edge Function) verifies the signer's
  password against GoTrue and **never logs, echoes, stores or returns it**
  (`index.ts:19–20, 71–72, 84–85`), with `get_signature_proof` issuing a certificate. The
  enforcement flag `sign_reauth_enforced` defaults **false** (`supabase/v60-sign-reauth.sql:56`)
  pending the 1.5 client release (see §11 / `13` B.4).
- **Photo provenance** — `photo_metadata` stores WGS84 GPS + capture timestamp and is
  immutable once written (`supabase/v79-photo-metadata.sql:46`).

### 3.3 Availability
CK commits to keeping the service and the dispute record available, while being honest
about its current backup posture:

- The application runs on Supabase managed infrastructure (platform-level redundancy is
  inherited).
- **Known material gap:** the backend currently runs on the **Supabase Free tier, which
  provides no guaranteed daily backup or Point-in-Time-Recovery**, and Storage blobs are not
  independently backed up. This is CK's single most material technical gap and is the
  top-priority remediation (`13-certification-readiness-checklist.md` B.1;
  `09-backup-and-business-continuity.md`). Until Pro + a witnessed test-restore is in place,
  CK does not claim a guaranteed RPO/RTO.

## 4. Cryptography commitment

- **In transit:** TLS 1.2+ for all client↔Supabase traffic (platform-enforced).
- **At rest:** AES-256 (Supabase platform).
- **Authentication secrets:** passwords are handled by GoTrue (bcrypt); **CK never stores
  user passwords** — phone+password auth uses a synthetic email `<digits>@phone.local`
  (`src/lib/phone.ts:5,11`) so GoTrue's email/password flow can be used while users see only
  their phone number.
- **Integrity:** SHA-256 hash chain in the audit ledger (used for integrity evidence, not
  confidentiality).

Detailed key-custody and rotation rules are in `08-cryptography-and-key-management.md`.

## 5. Control framework

CK adopts **ISO/IEC 27001:2022, including Annex A (93 controls across themes A.5
Organisational, A.6 People, A.7 Physical, A.8 Technological)** as its control framework.
The applicability decision and current implementation status for every one of the 93
controls — applicable / excluded / inherited, with CK evidence — is recorded in the
**Statement of Applicability (`05-statement-of-applicability.md`)**, which this policy
formally mandates and which is reviewed at every ISMS review.

## 6. Compliance obligations

CK commits to meeting, at minimum:

- **Hong Kong Personal Data (Privacy) Ordinance (PDPO, Cap. 486)** — CK collects only the
  personal data needed to operate a site (phone, name, role, push token, GPS-tagged
  photos), narrows its visibility by RLS, and honours data-subject deletion. The
  **Apple-reviewed account-deletion** flow `delete_my_account()` hard-deletes the
  `auth.users` row; authored-content foreign keys are set to NULL on delete to preserve the
  audit trail rather than destroying others' records
  (`supabase/v6-account-deletion.sql:25,34,57`). Privacy handling detail lives in `03` / `05`
  (A.5.34) and `10` (breach notification).
- **Apple App Store & Google Play** — CK preserves the account-deletion capability that
  already passed Apple review; any new auth flow (e.g. the synthetic-email model, TOTP
  step-up) must keep that capability intact. Auth model is locked to phone+password (no
  magic links / SSO this milestone).
- **Contractual / customer obligations** — CK may honestly state that it is built on ISO
  27001 / SOC 2 certified infrastructure (Supabase), uses TLS 1.2+ / AES-256, enforces
  database-level RLS, keeps a tamper-evident append-only audit trail, isolates per-project
  data, and supports Apple-reviewed account deletion. CK **must not** claim "ISO 27001
  certified / compliant" until an accredited body issues a certificate (`00`, README §
  "Honest position").

## 7. Responsibilities

As a one-person organisation, **關進杰 (Kwan Chun Kit) holds, and accepts accountability
for, every ISMS role**: top management, ISMS Owner, Risk Owner, Asset Owner, and Incident
Manager. Top management commitment (Clause 5.1) is demonstrated by 關進杰 authoring,
approving and resourcing this ISMS personally. Segregation-of-duties controls are documented
as "applicable but minimised" and trigger on first hire (`02-roles-and-responsibilities.md`).
Every user of the system shares responsibility for using only the access granted to them
(`06-access-control-policy.md`, Acceptable Use).

## 8. Sub-policies (this policy's children)

This top-level policy is implemented through the following topic-specific policies, each of
which inherits its authority from this document:

| Sub-policy | Document | Primary Annex A controls |
|------------|----------|--------------------------|
| Access control & acceptable use | `06-access-control-policy.md` | A.5.15, A.8.2, A.8.3, A.5.10 |
| Secure development | `07-secure-development-policy.md` | A.8.25–A.8.28 |
| Cryptography & key management | `08-cryptography-and-key-management.md` | A.8.24 |
| Backup & business continuity | `09-backup-and-business-continuity.md` | A.8.13, A.5.30 |
| Supplier & cloud security | `12-supplier-and-cloud-security.md` | A.5.19–A.5.23 |
| Logging & monitoring | `11-logging-and-monitoring.md` | A.8.15, A.8.16 |
| Incident management | `10-incident-management-plan.md` | A.5.24–A.5.28 |

(Asset classification `03`, risk assessment `04`, and the SoA `05` provide the supporting
context for all of the above.)

## 9. Information security objectives

Top management sets these measurable objectives for the current ISMS cycle (tracked against
`13-certification-readiness-checklist.md`):

1. **No unmitigated privilege-escalation or cross-tenant read** — maintained by RLS-first
   design + adversarial simulation; every new finding closed under a versioned migration.
2. **Detectable tampering** — `verify_integrity()` returns `intact: true` on every scheduled
   check; any `intact:false` is treated as a Sev-1 incident.
3. **Recoverability** — move off Free tier and evidence one successful test-restore (B.1).
4. **Real authentication strength** — flip `step_up_enforced` + `sign_reauth_enforced` once
   the 1.5 client UI is live on both stores (B.4).
5. **Audit-readiness** — accrue ≥3 months of operating evidence, then internal audit +
   management review (B.6/B.7).

## 10. Commitment to continual improvement & the SoA

Top management commits to operating the ISMS as a living system (Clauses 9 & 10):
monitoring controls, recording nonconformities and corrective actions
(`10-incident-management-plan.md`), and continually improving. This policy and the
**Statement of Applicability (`05`)** are reviewed at least **annually (next review:
2027-06-18)** and additionally after any significant change, security incident, new role
(e.g. `safety_officer`), or new sub-processor. CK's practice of applying versioned SQL
migrations and **verifying controls by execution** (not by source inspection alone) is the
mechanism by which control changes are validated before they are relied upon.

## 11. Honest disclosure of current gaps (an auditor reads this)

In keeping with CK's integrity commitment, top management explicitly records the controls
that are **planned or partial**, so this policy is not read as over-claiming. Full
remediation plan: `13-certification-readiness-checklist.md`.

- **Backup / PITR (A.8.13)** — Free tier has no guaranteed daily backup/PITR and no
  independent Storage backup. *Highest-priority gap* (B.1).
- **MFA & signature non-repudiation enforcement (A.8.5/A.5.17)** — TOTP step-up and sign-time
  re-auth are **built and live in code** but their enforcement flags default **false**
  (`v54-step-up-rollout-flag.sql:19`, `v60-sign-reauth.sql:56`); they will be flipped after
  the 1.5 build is live on both stores (B.4).
- **Account-level MFA (A.8.2)** — MFA on the Supabase, Apple, GitHub and Codemagic accounts
  (the "keys to the kingdom") is **not yet evidenced** (B.2).
- **Signed Supabase DPA (A.5.23/A.5.34)** — the Data Processing Agreement with the primary
  processor is **not yet signed/on file** (B.3).
- **Scheduled integrity monitoring (A.8.16)** — a system-context `run_integrity_check()` with
  a daily pg_cron schedule exists in source (`v80-integrity-monitoring-cron.sql`), but its
  **scheduled-operation evidence is not yet accrued**; until then `verify_integrity()` is
  treated as on-demand (B.6).
- **CI dependency-vulnerability gate (A.8.8)** — no automated dependency-vuln gate in CI yet
  (covered by `07-secure-development-policy.md`).

These gaps are accepted, owned, and scheduled — not hidden. CK is technically ~60–70% toward
certification readiness; the remaining work is governance documentation (this pack), the
owner-only actions in §11/B, and the external accredited audit.

## 12. Approval

This Information Security Policy is approved and issued by top management of CK工程.

| | |
|---|---|
| **Approved by** | 關進杰 (Kwan Chun Kit) — Founder / ISMS Owner / Top Management |
| **Signature** | _______________________________ |
| **Date** | 2026-06-18 |

---

## Revision history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 (Kwan Chun Kit) | Initial issue of the top-level Information Security Policy (ISO/IEC 27001:2022 Clause 5.2 / A.5.1), grounded in CK's implemented controls with honest gap disclosure. |

*Maintained by 關進杰. Part of the CK工程 ISO/IEC 27001:2022 ISMS pack (document 01 of 13).
Self-prepared toward certification readiness — not yet certified.*
