# CK工程 / Construction App — ISO/IEC 27001:2022 ISMS Pack

> **Status: SELF-PREPARED, TOWARD CERTIFICATION READINESS — NOT YET CERTIFIED.**
> This pack is the Information Security Management System (ISMS) documentation that
> CK工程 has authored itself to become *audit-ready* against ISO/IEC 27001:2022.
> It does **not** mean CK is "ISO 27001 certified" or "ISO 27001 compliant".
> Only a UKAS / HKAS-accredited certification body can grant certification after a
> Stage 1 (documentation) + Stage 2 (implementation) audit. Until then CK must not
> claim certification — see `00-isms-scope-and-context.md` and
> `13-certification-readiness-checklist.md` for what *can* honestly be claimed today.

---

## ISMS Owner / Top Management

| Role | Person | Notes |
|------|--------|-------|
| **ISMS Owner (top management)** | **關進杰 (Kwan Chun Kit)** | Founder, sole operator. Approves, signs and annually reviews every document in this pack. Acts simultaneously as ISMS Owner, Risk Owner, Asset Owner and Incident Manager (micro-entity, one-person organisation). |

A one-person organisation is fully permitted under ISO/IEC 27001 — the standard scales by
*applicability*, not headcount. Controls that depend on having staff (e.g. formal HR
security screening, segregation of duties, awareness-training records) are marked
"applicable but minimised" in the Statement of Applicability (`02`) and become full
controls on first hire. Every document carries the same owner, version (1.0), issue date
(2026-06-18) and a 2027-06-18 next-review date, and is approved/signed by the ISMS Owner.

---

## Scope Summary

**In scope:** The **CK工程 / Construction App** SaaS — the React + TypeScript + Capacitor
web/mobile client, the **Supabase** managed backend (PostgreSQL, Auth/GoTrue, Storage,
Edge Functions, Realtime — project `syyntodkvexkbpjrskjj`), and the supporting build/release
toolchain (GitHub repo, Codemagic CI, Apple App Store, Google Play). The information assets
protected are the construction data and personal data (PII) of Hong Kong general
contractors, PMs, foremen, subcontractors, workers and owners — instructions, permits,
drawings, progress, issues, and the tamper-evident audit ledger that must survive disputes.

**Out of scope / inherited:** Physical data-centre controls (no self-owned premises;
inherited from Supabase's ISO 27001 / SOC 2 certified infrastructure — A.7 theme). The
internal controls of sub-processors (OneSignal, Apple, OpenRouter) are assessed in `05`
but inherited rather than operated by CK.

**Core security value:** every instruction, permit, drawing, progress tick and issue is
captured in one system with a **tamper-evident, append-only audit trail** — so the ISMS
exists primarily to protect the *integrity and availability* of that dispute-surviving
record, alongside the *confidentiality* of cross-tenant project data and PII.

---

## Documents in this pack (00–13)

Filenames below are the **actual slugs on disk** — cite these exactly when cross-referencing.

| # | Document | Purpose (one line) |
|---|----------|--------------------|
| **00** | `00-isms-scope-and-context.md` | ISMS scope, organisational context, interested parties, objectives, leadership commitment, and the "can / cannot claim today" statement (Clauses 4 & 5). |
| **01** | `01-information-security-policy.md` | Top-level information security policy + sub-policies, approved & signed by the ISMS Owner; every other document derives its authority from this one (Clause 5.2 / A.5.1). |
| **02** | `02-statement-of-applicability.md` | SoA — all 93 Annex A controls with applicable/excluded/inherited + justification + conservative implementation status & CK evidence (Clause 6.1.3 d). |
| **03** | `03-risk-assessment-and-treatment.md` | Risk methodology, the asset-based risk register (16 risks), and the risk treatment plan tied to the SoA and the readiness backlog (Clauses 6.1, 8.2, 8.3). |
| **04** | `04-asset-register.md` | Information asset inventory + owners + 3-tier classification (機密/內部/公開) mapped to Supabase tables, Storage buckets and integrations (A.5.9, A.5.12). |
| **05** | `05-supplier-and-cloud-register.md` | Supplier & cloud-services register: Supabase as primary processor, sub-processor list (OneSignal/Apple/OpenRouter), cloud-service security assessment (A.5.19–A.5.23). |
| **06** | `06-access-control-policy.md` | Access control: RBAC + RLS model (8 roles, per-project membership, client + DB enforcement), authentication (phone+password / TOTP step-up / sign-reauth), privileged-access custody, joiner/mover/leaver + quarterly access review (A.5.15–A.5.18, A.8.2–A.8.5). |
| **07** | `07-cryptography-policy.md` | Cryptography: TLS 1.2+ in transit, AES-256 at rest (platform), SHA-256 hash-chain for integrity (not confidentiality), service-role key custody & rotation (A.8.24). |
| **08** | `08-backup-bcp-dr.md` | Backup, RTO/RPO, restore runbook, business continuity & disaster recovery for the dispute-survival record; states the Free-tier backup gap plainly (A.8.13, A.5.29–A.5.30). |
| **09** | `09-incident-response-plan.md` | Incident response: detect → assess → contain → eradicate → recover → notify → learn, severity scale, evidence collection, and the audit ledger as forensic evidence (A.5.24–A.5.28). |
| **10** | `10-secure-development-standard.md` | Secure development & configuration standard: TS strict, RLS-first design, adversarial persona/RLS + daily-site simulation, code review, CI dependency scanning, config management (A.8.25–A.8.28, A.8.9). |
| **11** | `11-data-classification-privacy.md` | Privacy & PII protection + PDPO (Cap. 486, DPP1–DPP6) privacy notice: PII inventory, RLS narrowing, retention, account-deletion vs immutable ledger reconciliation (A.5.34, A.8.10–A.8.12). |
| **12** | `12-logging-monitoring-policy.md` | Logging & monitoring: tamper-evident `audit_ledger` (13-table AFTER triggers, SHA-256 chain) as primary log, auth/admin log retention & export, `verify_integrity` design + alerting (A.8.15, A.8.16, A.5.28). |
| **13** | `13-certification-readiness-checklist.md` | The action plan to reach certification: what's done, what only the owner can do, what needs an external body, and the phased timeline. |

> Documents 00–12 are the standing ISMS; document 13 is the live action plan that drives
> the pack to audit-readiness. As each control is operated and evidenced, it should be
> checked off in document 13 (Sections A/B).
>
> **One numbering nuance:** the incident-response content is filed as
> `09-incident-response-plan.md`. Some earlier drafts and a sibling cross-reference call it
> "10 — incident management plan"; where you see the slug `10-incident-management-plan.md`,
> it means **this same file** (A.5.24–A.5.28). The slugs in the table above are canonical.

---

## How this pack maps to ISO/IEC 27001:2022

### Clauses 4–10 (the management-system requirements — these are what gets audited)

| Clause | Requirement | Where it lives in this pack |
|--------|-------------|------------------------------|
| **4. Context of the organisation** | Internal/external issues, interested parties, ISMS scope | `00` |
| **5. Leadership** | Management commitment, security policy, roles & responsibilities | `00` (commitment + roles), `01` (policy) |
| **6. Planning** | Risk assessment, risk treatment, Statement of Applicability, objectives | `02` (SoA), `03` (risk assessment & treatment), `00` (objectives) |
| **7. Support** | Resources, competence, awareness, communication, documented information | `00`/`01` (resources & competence for a solo operator), this README + the standard version-control header on every doc (documented information) |
| **8. Operation** | Operational planning & control, risk assessment & treatment in operation | `03`, `05`, `06`, `07`, `08`, `10`, `11`, `12` |
| **9. Performance evaluation** | Monitoring & measurement, internal audit, management review | `12` (monitoring & measurement), `13` Section B (internal audit + management review — owner actions B.6/B.7) |
| **10. Improvement** | Nonconformity, corrective action, continual improvement | `09` (incident / corrective action / learning), `13` (continual-improvement loop) |

### Annex A — themes A.5–A.8 (93 controls)

The full control-by-control mapping (applicable / excluded / inherited, with CK evidence
and conservative status) is in **`02-statement-of-applicability.md`**. Summary of where each
Annex A theme is governed:

| Annex A theme | Controls | Primary document(s) |
|---------------|----------|----------------------|
| **A.5 Organisational** | 37 controls (policies, roles, asset mgmt, supplier/cloud, classification, incident, continuity, compliance, PII/privacy) | `01`, `02`, `03`, `04`, `05`, `06`, `08`, `09`, `11`, `12` |
| **A.6 People** | 8 controls (screening, terms, awareness, disciplinary, remote work) | `00`/`02` — "applicable but minimised" for a solo operator; full controls trigger on first hire |
| **A.7 Physical** | 14 controls (secure areas, equipment) | `00`/`02` — mostly **inherited from Supabase** (no self-owned data centre); workstation hardening (disk encryption, screen lock) in `06`/`07` |
| **A.8 Technological** | 34 controls (access, crypto, secure dev, logging, monitoring, backup, DLP, config mgmt) | `06`, `07`, `08`, `10`, `12` — this is where CK's strong, already-implemented technical controls live (RLS, audit ledger, built MFA/step-up, signed URLs) |

---

## Honest position (read before quoting this pack anywhere)

- **Technically, CK is ~60–70% there** — the *technical controls* are unusually strong for a
  solo SaaS (dual client + DB RBAC, per-table RLS, a tamper-evident append-only audit
  ledger, private buckets with signed URLs, TOTP MFA + signature re-auth built,
  Apple-approved account deletion). The gap is the **management system (governance
  documents)** — which is exactly what this pack supplies — plus a handful of owner-only
  actions in document 13.
- **✅ Can honestly claim today:** "Built on ISO 27001 / SOC 2 certified infrastructure
  (Supabase); TLS 1.2+ in transit, AES-256 at rest; database-level row-level security
  enforcing role access; tamper-evident, append-only audit trail; per-project data
  isolation; Apple-reviewed account deletion." (Exact approved wording is maintained in `00`.)
- **❌ Cannot claim** until an accredited body issues a certificate: "ISO 27001 certified",
  "ISO 27001 compliant", or "DWSS certified".

---

*Maintained by 關進杰. Source assessment: `.planning/program-2026-06/ISO27001-啟動評估.md`
and `.planning/program-2026-06/FUNCTION-REVIEW.md`. Last updated: 2026-06-18.*
