# 13 — ISO/IEC 27001:2022 Certification Readiness Checklist

> **ISMS Owner:** 關進杰 (Kwan Chun Kit) · **Standard:** ISO/IEC 27001:2022 (incl. Annex A, 93 controls)
> **Status: SELF-PREPARED, TOWARD CERTIFICATION READINESS — NOT YET CERTIFIED.**
> This is CK's action plan to reach certification. It is organised into three clearly
> separated sections by *who can do the work*: (A) what is already done / in this pack,
> (B) what only the founder can do, and (C) what requires an external accredited body.
> Source: `.planning/program-2026-06/ISO27001-啟動評估.md` + `.planning/program-2026-06/FUNCTION-REVIEW.md`.
> Document slugs cited below are the **actual filenames on disk** (see `README.md` for the full index).

---

## A. ✅ DONE / IN THIS PACK

*Governance documentation authored in this pack + technical controls already implemented and execution-verified in CK. Together these satisfy the bulk of Clauses 4–6 and provide the "implemented" evidence for roughly ten Annex A technical controls.*

### A.1 — ISMS documentation authored (this pack, docs 00–12)

- [x] **00 — `00-isms-scope-and-context.md`** (Clauses 4 & 5): ISMS boundary = CK SaaS + Supabase backend + release toolchain; context; interested parties; objectives; leadership commitment; the "can/cannot claim" statement.
- [x] **01 — `01-information-security-policy.md`** (Clause 5.2 / A.5.1): top-level policy + sub-policies, owner-signed; all other docs derive authority from it.
- [x] **02 — `02-statement-of-applicability.md`** (Clause 6.1.3 d): all 93 Annex A controls with applicable/excluded/inherited + justification + conservative CK status.
- [x] **03 — `03-risk-assessment-and-treatment.md`** (Clauses 6.1, 8.2, 8.3): methodology, asset-based risk register (16 risks), treatment plan tied to the SoA.
- [x] **04 — `04-asset-register.md`** (A.5.9, A.5.12): asset inventory + owners + 3-tier classification (機密/內部/公開) mapped to tables/buckets/integrations.
- [x] **05 — `05-supplier-and-cloud-register.md`** (A.5.19–A.5.23): cloud-service assessment + sub-processor register (Supabase DPA signature is an owner action — see B.3).
- [x] **06 — `06-access-control-policy.md`** (A.5.15–A.5.18, A.8.2–A.8.5): RBAC + RLS model, authentication, privileged-access custody, joiner/mover/leaver + quarterly access-review checklist.
- [x] **07 — `07-cryptography-policy.md`** (A.8.24): TLS / at-rest / hash-chain policy + service-role key custody & rotation.
- [x] **08 — `08-backup-bcp-dr.md`** (A.8.13, A.5.29–A.5.30): RTO/RPO, restore runbook, BCP/DR (test-restore *evidence* is an owner action — see B.1).
- [x] **09 — `09-incident-response-plan.md`** (A.5.24–A.5.28): detect→assess→contain→eradicate→recover→notify→learn + severity scale + evidence collection.
- [x] **10 — `10-secure-development-standard.md`** (A.8.25–A.8.28, A.8.9): secure SDLC, adversarial simulation, code review, CI scanning, config management.
- [x] **11 — `11-data-classification-privacy.md`** (A.5.34, A.8.10–A.8.12): PII inventory, RLS narrowing, retention, account-deletion vs immutable ledger reconciliation + PDPO privacy notice.
- [x] **12 — `12-logging-monitoring-policy.md`** (A.8.15, A.8.16, A.5.28): audit-ledger as primary log + monitoring & measurement design.

### A.2 — Technical controls already implemented & execution-verified in CK

- [x] **A.5.15 Access control** — dual client + DB RBAC; per-table RLS; `SECURITY DEFINER` helpers with pinned `search_path`; privilege-escalation holes closed (v17/v18/v50/v55e/v69 column guards); least-privilege RPCs.
- [x] **A.8.15 Logging (integrity evidence)** — tamper-evident, append-only `audit_ledger` SHA-256 hash chain across 13 tables (AFTER triggers) with on-demand `verify_integrity` / `export_ledger_proof`.
- [x] **A.8.12 DLP / tenant isolation** — private Storage buckets (signed URLs); RLS prevents cross-tenant reads; AI 站長 bounded by JWT/RLS + prompt-injection guarding.
- [x] **A.8.24 Cryptography** — TLS 1.2+ in transit; AES-256 at rest (platform); SHA-256 app-layer hash chain for integrity.
- [x] **A.8.25–A.8.28 Secure development** — TypeScript strict; RLS-first design; adversarial persona/RLS + daily-site simulations; GSD workflow + code-review; tracked findings (latest full review: no critical/high, 3 medium fixed v76/v77/v78).
- [x] **A.5.17 Authentication mechanism (built)** — phone+password via GoTrue bcrypt; **TOTP MFA step-up + signature re-authentication backend is built and live** (verified, but enforcement flags OFF — flip is an owner action, see B.4).
- [x] **A.8.2/A.8.3 Privileged access** — DB least-privilege; service-role key confined to Edge Functions (`Deno.env`), client uses anon key only.
- [x] **A.5.34 PII / privacy (partial)** — PII narrowed by RLS; Apple-approved account deletion (`delete_my_account` cascade) already passed App Store review.
- [x] **Recent security hardening (verified live):** v76 PTW `safety_officer` admin_override guard; v77 `safety_officer` equipment/forms access; v78 atomic drawing-version withdraw — closing the 3 medium findings from the 2026-06-17 function review.

---

## B. 🔧 OWNER MUST DO (only 關進杰 can — each with why)

*These require account credentials, billing authority, a live production release, or accrued
operating time that no document or code change can substitute for. Each is gated on the founder.*

- [ ] **B.1 — Upgrade Supabase to Pro (~US$25/mo) + evidence ONE test restore.**
  *Why:* Free tier gives **no guaranteed daily backup / PITR**, and Storage blobs aren't independently backed up — a direct threat to the dispute-survival core value (A.8.13/A.5.30, the single most material technical gap). Pro gives daily backups + 7-day PITR. Then **actually perform one restore** (or `pg_dump` + Storage export) and capture the evidence (screenshot/log + timestamp) into `08-backup-bcp-dr.md` §7. *Only the owner holds billing + can run/witness the restore.*

- [ ] **B.2 — Enable account MFA on Supabase, Apple, GitHub, Codemagic (+ screenshot each).**
  *Why:* These four accounts are the keys to the whole kingdom (data, app signing, source, CI/CD). Account-level MFA is the highest-weight, lowest-effort control an auditor checks (A.8.2). ~30 minutes total. Capture a screenshot of each account's MFA-enabled state into `06-access-control-policy.md`. *Only the owner can authenticate into and configure these accounts.*

- [ ] **B.3 — Sign the Supabase DPA + finalise the sub-processor list.**
  *Why:* The primary processor relationship needs a signed Data Processing Agreement to satisfy supplier/cloud + PII controls (A.5.23/A.5.34). Record OneSignal / Apple / OpenRouter as sub-processors in `05-supplier-and-cloud-register.md` §6. *Requires the account holder's acceptance.*

- [ ] **B.4 — After the 1.5 build is live on App Store + Play, flip `step_up_enforced` + `sign_reauth_enforced`.**
  *Why:* The TOTP step-up + signature re-auth backend is **built and verified but flag-OFF** to avoid breaking existing live iOS users before the client UI ships. Once 1.5 is live on **both** stores (so all users have the step-up/sign UI), flip the enforcement flags to make real MFA + non-repudiation active (A.8.5 — highest-impact security action). *Must be sequenced by the owner against the actual store release dates; flipping early breaks live users.*

- [ ] **B.5 — Set GoTrue password min-length + enable leaked-password protection.**
  *Why:* Defines and enforces the credential policy (A.5.17/A.8.5) — minimum length and HaveIBeenPwned-style breached-password rejection are Supabase Auth dashboard settings, not code. *Only the owner can change project auth settings.*

- [ ] **B.6 — Run ~3 months of ISMS operation evidence.**
  *Why:* An auditor needs to see the ISMS *operating*, not just documented (Clauses 7–9): deploy the daily `verify_integrity` cron + alert, keep the quarterly access-review log, threat-intelligence log (Dependabot/`npm audit`/monthly `get_advisors`), and dated records of the controls actually running. *This is calendar time only the owner can accrue, starting once the docs are signed.*

- [ ] **B.7 — Perform internal audit + management review.**
  *Why:* Clause 9 makes both **mandatory before certification**. Audit the SoA (`02`) against reality, record nonconformities + corrective actions, then hold (and minute) a management review. *The owner is both auditor and management here (or engages a low-cost consultant) — cannot be skipped.*

---

## C. 🏛️ NEEDS EXTERNAL (cannot be done in-house)

*Certification itself can only come from an accredited third party. No amount of self-preparation
substitutes for the audit.*

- [ ] **C.1 — Engage a UKAS / HKAS-accredited certification body for Stage 1 + Stage 2.**
  - **Stage 1 (documentation review):** the body checks this pack — scope, policy, risk assessment, SoA, mandatory clause-4–10 documents — for completeness and readiness.
  - **Stage 2 (implementation audit):** the body samples evidence that the controls in the SoA are actually operating (the ~3 months of operation logs from B.6).
  - *Why external:* only an accredited body can issue a valid ISO/IEC 27001 certificate; self-assessment is not certification.

- [ ] **C.2 — Budget realistically (micro-entity).**
  - **Stage 1 + Stage 2 audit: ~US$5,000–12,000** for a one-person micro-entity with a small, well-defined scope.
  - **Plus annual surveillance audits** (years 1 & 2) and a **re-certification audit in year 3**.

- [ ] **C.3 — Consider cheaper interim options first.**
  - A paid **gap assessment** (a consultant pre-checks this pack vs the standard before you commit to a full audit) — lower cost, de-risks Stage 1.
  - A **lighter-weight scheme** (e.g. Cyber Essentials-style baseline) as an interim trust signal while deciding whether to pursue full ISO 27001.
  - *Why consider:* lets CK get external validation sooner and cheaper, and informs whether the full ISO investment is justified for current bidding/customer needs.

---

## Phased timeline (solo-founder realistic version)

| Phase | What happens | Owner of the work | Time | Cost |
|-------|--------------|-------------------|------|------|
| **Phase 0 — Foundations** | Close the technical gaps: B.1 backup+restore, B.2 account MFA, B.5 GoTrue password policy + sign DPA (B.3); asset register already in pack (`04`) | Owner | 2–4 wks | ~US$25/mo (Supabase Pro); rest free |
| **Phase 1 — ISMS scope + policy** | Finalise scope, context, top-level + sub-policies; appoint self as ISMS Owner (Clauses 4–5) — **docs 00–01 in this pack** | Owner | 3–6 wks | Free (templates) |
| **Phase 2 — Risk assessment + SoA** | Asset risk assessment, treatment plan, Statement of Applicability covering all 93 controls (Clauses 6 & 8) — **docs 02–03 in this pack** | Owner | 2–4 wks | Free |
| **Phase 3 — Generate operating evidence** | Run controls live: deploy `verify_integrity` daily cron + alert, threat-intel log, access-review log, flip enforcement after 1.5 ships (B.4) — auditor wants ~3 months (Clauses 7–9, B.6) | Owner | 8–12 wks | Low |
| **Phase 4 — Internal audit + management review** | Internal audit of SoA, nonconformities + corrective actions, management review — mandatory pre-cert (Clause 9, B.7) | Owner (or low-cost consultant) | 1–2 wks | Low–med |
| **Phase 5 — Certification audit** | Accredited body: Stage 1 (documentation) → Stage 2 (implementation) (C.1) | External certification body | — | **~US$5k–12k** + annual surveillance + yr-3 re-cert |

**Total:** roughly **4–7 months** end-to-end, **low-thousands USD** (self-authored docs from
templates + the audit fee). The backup/restore (B.1), real MFA (B.4) and account MFA (B.2)
are prioritised because they are genuine security improvements, not just paperwork.

---

## Bottom line

**CK is technically ~60–70% there.** The technical controls are unusually strong for a solo
SaaS — dual RBAC, per-table RLS, a tamper-evident append-only audit ledger, private buckets
with signed URLs, built TOTP MFA + signature re-auth, and Apple-approved account deletion.
The remaining work is **(1) the governance documents — which this pack supplies (Section A)**,
**(2) the owner-only actions (Section B)**, and **(3) the external accredited audit (Section C)**.
ISO 27001 certifies the *management system*, not the code — so the path forward is governance
+ a handful of owner actions + the audit, not a rewrite.

*Maintained by 關進杰. Last updated: 2026-06-18.*
