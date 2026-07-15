# 02 — Statement of Applicability (SoA)

**Organisation:** CK工程 / CK Construction (sole proprietor SaaS)
**Standard:** ISO/IEC 27001:2022 — Annex A (all 93 controls across 4 themes)
**Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner & Top Management (sole founder/operator)
**Version:** 1.0
**Date:** 2026-06-18
**Next review:** 2027-06-18 (or on material change: new role, new sub-processor, new data class, or a tier change in scope)
**Clause reference:** Satisfies ISO/IEC 27001:2022 Clause 6.1.3 d) — the SoA.

> **Status disclaimer (honesty for the auditor):** CK is **self-prepared toward certification readiness — NOT yet certified.** This SoA is accurate to the live system as of the date above. Where a control is **Partial** or **Planned**, that is stated plainly and cross-referenced to the certification-readiness checklist (`.planning/iso27001/13-certification-readiness-checklist.md`, sections B/C). Do **not** read a "Yes / Applicable" as "fully operating" — read the *Implementation status* column, which is deliberately conservative.

---

## How to read this document

- **Applicable (Y/N)** — whether the control is relevant to CK's ISMS scope (CK SaaS web/iOS/Android client + Supabase backend + release toolchain; single operator; HK construction-management data). A control is marked **N** only with a justified exclusion (Clause 6.1.3 c/d).
- **Implementation status** — one of:
  - **Implemented** — built, live, and execution-verified in CK (cited evidence).
  - **Partial** — partly in place; the remaining gap is named and pointed at the follow-up.
  - **Planned** — designed/documented in this pack but not yet operating; owner/external action pending.
  - **Inherited** — provided by a sub-processor (primarily Supabase) under their certified controls; CK relies on the contractual/attested chain (Supabase SOC 2 + ISO 27001 + DPA — DPA signature pending, see B.3).
  - **N/A** — applicable=N.
- **Evidence / follow-up** — a real CK artefact (migration file:line / RPC / table / Edge Function / source file) for Implemented/Partial, or the responsible action (Bx / Cx in doc 13) for Planned.

**Single-operator note:** CK has one person who is founder, top management, developer, operator and ISMS owner (關進杰). Many A.6 "People" and A.5 "segregation of duties" controls are therefore **applicable but minimal by design** — there are no employees to onboard, discipline, or separate duties between. These controls are retained (not excluded) and the SoA records the **scaling trigger: on first hire**, at which point SoD, screening, and disciplinary process activate. This is an honest, auditable position for a micro-entity, not a gap to hide.

---

## Summary count

| Theme | Controls | Applicable | Excluded (N/A) |
|-------|---------:|-----------:|---------------:|
| A.5 Organizational | 37 | 37 | 0 |
| A.6 People | 8 | 8 | 0 |
| A.7 Physical | 14 | 14 | 0 |
| A.8 Technological | 34 | 34 | 0 |
| **Total** | **93** | **93** | **0** |

All 93 controls are deemed **applicable**. CK takes no Annex A exclusions: every theme touches the SaaS (the physical theme applies via the inherited cloud data-centre + the founder's workstation/devices). Where a control adds little for a solo cloud SaaS, it is marked Applicable with a minimal/inherited implementation and an honest status — exclusion would be harder to justify to an auditor than a documented "minimal" position.

---

## A.5 — Organizational controls (37)

| ID | Control | App. | Implementation status | Justification & CK evidence / follow-up |
|----|---------|:----:|----------------------|------------------------------------------|
| A.5.1 | Policies for information security | Y | **Partial** | Top-level + sub-policies authored in this pack (`01-information-security-policy.md`), owner-signed. Operating evidence (annual review cycle, sign-off history) accrues over time → B.6. |
| A.5.2 | Information security roles & responsibilities | Y | **Implemented** | Single-operator org; 關進杰 = top management + ISMS owner. Documented in `02-roles-and-responsibilities` of the pack; RBAC roles enumerated in `src/types.ts` (8 roles) and CLAUDE.md. SoD scales on first hire. |
| A.5.3 | Segregation of duties | Y | **Partial (minimal — solo operator)** | No multiple staff to segregate today. *Technical* SoD exists in-app: approval chains require a *different* role to sign (`active_role_holders`, `v9-rls-helpers.sql:24`; escalation chain in `src/types.ts` `getNextHandler`). Org-level SoD activates on first hire. |
| A.5.4 | Management responsibilities | Y | **Implemented** | Owner is management; commitment recorded in policy (`01-...policy.md`). |
| A.5.5 | Contact with authorities | Y | **Planned** | Relevant authorities identified for HK: PCPD (PDPO breach), 勞工處 (Labour Dept — PTW/signature disputes are a core use case), Apple/Google (store incidents). Contact list to be recorded in `10-incident-management-plan.md`. |
| A.5.6 | Contact with special interest groups | Y | **Partial** | Threat-intel sources: Supabase changelog/advisories, `npm audit`/Dependabot, OWASP. Formal log accrues under B.6. |
| A.5.7 | Threat intelligence | Y | **Partial** | Adversarial persona/RLS simulations + daily-site simulations run pre-ship (skills `simulate`/`daily-site-sim`); `npm audit` available. Scheduled cadence + dep-vuln CI gate are gaps (no CI dep-vuln gate yet) → B.6 / doc 07. |
| A.5.8 | Information security in project management | Y | **Implemented** | GSD workflow enforces planning + code-review per change (CLAUDE.md "GSD Workflow Enforcement"); security reviewed per migration (each `vNN-*.sql` carries a threat rationale header, e.g. `v50`, `v51`, `v17`). |
| A.5.9 | Inventory of information & associated assets | Y | **Implemented** | Asset register authored (`03-asset-register`); assets = Supabase tables/buckets/RPCs/Edge Functions, client builds, sub-processor accounts. Mapped to owners + classes. |
| A.5.10 | Acceptable use of information & assets | Y | **Partial** | Acceptable-use embedded in policy (`01-...policy.md`); app-level acceptable use enforced by RBAC/RLS. Formal AUP doc minimal (solo). |
| A.5.11 | Return of assets | Y | **Partial (minimal — solo operator)** | No employees to off-board. Account-credential custody (Supabase/Apple/GitHub/Codemagic) is the founder's; on first hire, offboarding checklist activates. |
| A.5.12 | Classification of information | Y | **Implemented** | 3-tier scheme 機密/內部/公開 in `03-asset-register`; PII (phone, name, company, OneSignal id) classified 機密; mapped to tables/buckets. |
| A.5.13 | Labelling of information | Y | **Partial** | Classification recorded in the register; per-record labelling not implemented (low value for a single-tenant-per-project DB). Storage buckets segregated by purpose (`v71-storage-bucket-limits.sql`). |
| A.5.14 | Information transfer | Y | **Implemented** | All transfer over TLS 1.2+ (Supabase platform; client `src/lib/supabase.ts`). Push payloads via OneSignal carry deep-links + minimal text, no sensitive body. No bulk export channel except gated RPC exports (`export_ledger_proof`, `v51:166`). |
| A.5.15 | Access control | Y | **Implemented** | **Dual-layer RBAC**: client gating (`ProtectedRoute requireAdmin`, `canEdit` in contexts) AND DB RLS on every table. `SECURITY DEFINER` helpers `can_view_project`/`can_edit_project_progress` with pinned `set search_path = public` (`v3-progress-schema.sql:33,51`) block shadow-table injection. Privilege-escalation holes found & closed: `v17` self-promote BEFORE UPDATE gate, `v18` RLS hardening, `v50` membership-role guard, `v55e` credential self-verify, `v69`/`v76`/`v77` guards. Per access-control policy doc 06. |
| A.5.16 | Identity management | Y | **Implemented** | One identity per user = GoTrue `auth.users` row keyed on synthetic email `<digits>@phone.local` (`src/lib/phone.ts`; `verify-sign-password/index.ts:65`). `user_profiles.id` 1:1 with auth user. No shared accounts. |
| A.5.17 | Authentication information | Y | **Partial** | Phone+password via GoTrue (bcrypt; app never stores/handles password hash — confirmed `verify-sign-password/index.ts:19` "NEVER logged, echoed, stored"). TOTP MFA step-up built & live (`v52-54`) but **enforcement flag OFF**; sign-time re-auth built (`v60`) flag OFF. GoTrue password-min-length + leaked-password protection not yet set → B.4/B.5. |
| A.5.18 | Access rights (provisioning/review/removal) | Y | **Partial** | Provisioning via apply→approve membership flow (`ProjectsContext`); admin role change only via `admin_update_user_role` RPC (`v17:188`). De-provision on `delete_my_account` (`v6:42`). Periodic *access review* checklist authored (doc 06) but operating cadence pending → B.6. |
| A.5.19 | Information security in supplier relationships | Y | **Implemented** | Sub-processor register authored (`12-supplier-and-cloud-security`): Supabase, OneSignal, Apple, Codemagic, OpenRouter/Anthropic→moonshotai/kimi-k2. Selection criteria documented. |
| A.5.20 | Addressing security within supplier agreements | Y | **Partial** | Supabase has DPA + SOC 2 + ISO 27001; **no signed Supabase DPA on file yet** → B.3. Other suppliers' terms recorded but not contractually negotiated (standard ToS). |
| A.5.21 | Managing ICT supply-chain security | Y | **Partial** | npm `package-lock.json` pinned; `npm ci` in CI (Codemagic). Dependency-vuln gate in CI is a known gap (no CI dep-vuln gate) → doc 07 / B.6. Supabase is the sole runtime dependency. |
| A.5.22 | Monitoring, review & change management of supplier services | Y | **Partial** | Supabase advisories/changelog watched; `get_advisors` (Supabase) usable for posture checks. Formal periodic review log pending → B.6. |
| A.5.23 | Information security for use of cloud services | Y | **Partial** | Cloud assessment authored (doc 12). Supabase = sole cloud (DB/Auth/Storage/Edge/Realtime). Private buckets, RLS, service-role-key custody all in place; **gap: Free tier → no managed PITR/daily backup** (B.1) and DPA unsigned (B.3). |
| A.5.24 | Information security incident management planning & preparation | Y | **Planned** | IR plan authored (`10-incident-management-plan`): detect→contain→eradicate→recover→notify→review + severity scale. Not yet exercised; first drill is operating evidence → B.6. |
| A.5.25 | Assessment & decision on information security events | Y | **Planned** | Severity scale + triage criteria in doc 10. Signal sources: `integrity_check_log` (`v80`), Supabase logs, store reviews. |
| A.5.26 | Response to information security incidents | Y | **Planned** | Response runbook in doc 10. Containment levers exist technically (rotate service-role key, flip enforcement flags, revoke RPC grants, pause project). |
| A.5.27 | Learning from information security incidents | Y | **Planned** | Post-incident review step in doc 10; CK already has a track record of converting *simulation findings* into fixes (e.g. `v17` from persona-sim R2; v76/v77/v78 from 2026-06-17 function review) — the same loop applies to real incidents. |
| A.5.28 | Collection of evidence | Y | **Implemented** | **Tamper-evident `audit_ledger`** (SHA-256 hash chain, append-only, 13 critical tables, `v51-audit-ledger-tamper-evidence.sql`) is purpose-built forensic evidence; `export_ledger_proof()` (`v51:166`) produces a re-verifiable chain proof; `get_signature_proof` (`v60:251`) yields a court-ready signer attestation. |
| A.5.29 | Information security during disruption | Y | **Partial** | BC plan authored (`09-backup-and-business-continuity`). Supabase platform provides availability; **CK-side restore not yet evidenced** (Free tier) → B.1. |
| A.5.30 | ICT readiness for business continuity | Y | **Partial** | RTO/RPO + restore runbook authored (doc 09). **Gap: no PITR/daily backup on Free tier; no test-restore evidence** — the single most material technical gap → B.1. |
| A.5.31 | Legal, statutory, regulatory & contractual requirements | Y | **Implemented** | HK PDPO (個人資料（私隱）條例) obligations identified (doc 12 / 03); Apple account-deletion requirement met (`delete_my_account`, `v6`); 勞工處 evidentiary needs drove signature non-repudiation (`v60`) + photo GPS metadata (`v79`). |
| A.5.32 | Intellectual property rights | Y | **Partial** | OSS licences tracked via `package-lock.json`; no proprietary third-party code embedded. Formal IP register minimal (solo). |
| A.5.33 | Protection of records | Y | **Implemented** | Audit-critical records protected by the append-only ledger (`v51`); `photo_metadata` append-only (`v79`); `integrity_check_log` append-only (`v80`); authored-content FKs set NULL (not deleted) on account deletion to preserve the dispute trail (`v6:23`, `v20`, `v68`). |
| A.5.34 | Privacy & protection of PII | Y | **Partial** | PII minimised (phone/name/company only); `user_profiles` SELECT narrowed to self/teammate/PM-of-applicant (`v17:137`), closing a prior global-PII-read hole; applicant PII fix (`v31`). Apple-approved account deletion (`v6`). **Gap: signed Supabase DPA for the processor relationship** → B.3. PDPO posture in doc 12. |
| A.5.35 | Independent review of information security | Y | **Planned** | Internal audit + management review are Clause-9 mandatory pre-cert → B.7; external Stage 1/2 audit → C.1. Interim: adversarial simulations act as informal independent review. |
| A.5.36 | Compliance with policies, rules & standards | Y | **Partial** | Conformance enforced technically (RLS/RBAC, strict TS, GSD code-review). This SoA is the conformance baseline; periodic conformance checks accrue → B.6/B.7. |
| A.5.37 | Documented operating procedures | Y | **Implemented** | Migrations are self-documenting runbooks (every `vNN-*.sql` carries intent + post-apply verification steps, e.g. `v51:189`, `v80:97`); "apply via SQL editor, verify-by-execution" is the documented operating procedure (memory: supabase-migration-apply). |

---

## A.6 — People controls (8)

| ID | Control | App. | Implementation status | Justification & CK evidence / follow-up |
|----|---------|:----:|----------------------|------------------------------------------|
| A.6.1 | Screening | Y | **Partial (minimal — solo operator)** | No employees to screen; founder is self-known. Activates on first hire (background/reference checks). |
| A.6.2 | Terms & conditions of employment | Y | **Partial (minimal — solo operator)** | No employment contracts today; security responsibilities in scope/policy (docs 00/01). Employment T&Cs with security clauses added on first hire. |
| A.6.3 | Information security awareness, education & training | Y | **Partial (minimal — solo operator)** | Founder maintains current security knowledge (drives the security migrations + simulations). Formal awareness programme activates on first hire. *End-user* guidance is in-app zh-HK (e.g. PTW/signature flows). |
| A.6.4 | Disciplinary process | Y | **Partial (minimal — solo operator)** | N/A in practice with no staff, but retained: disciplinary process defined to activate on first hire. |
| A.6.5 | Responsibilities after termination or change of employment | Y | **Partial (minimal — solo operator)** | Credential-revocation/offboarding checklist defined for first-hire scenario; today the founder's account custody is the only relationship. |
| A.6.6 | Confidentiality or non-disclosure agreements | Y | **Implemented (via sub-processors)** | Sub-processors bound by their own confidentiality terms (Supabase DPA pending signature, B.3). Founder-only org has no third-party staff under NDA yet; client/customer data confidentiality enforced by RLS tenant isolation. |
| A.6.7 | Remote working | Y | **Implemented** | Operator works remotely; controls = full-disk-encrypted founder workstation, account MFA (B.2 — to be evidenced), TLS-only access to Supabase, no production credentials on the client (anon key only; service-role confined to Edge Functions `Deno.env`). Workstation hardening recorded in doc 06. |
| A.6.8 | Information security event reporting | Y | **Partial** | Single operator self-reports; channels = Supabase logs, `integrity_check_log` daily check (`v80`), store/user feedback. Formal reporting register accrues → B.6. End users can raise issues in-app (Issues module). |

---

## A.7 — Physical & environmental controls (14)

> **Theme posture:** CK owns no data centre, server room, or office facility for production. **All production physical/environmental controls are Inherited from Supabase** (managed cloud; SOC 2 + ISO 27001 attested data centres), backed by Apple/Google (app distribution) and Codemagic (CI). The **only CK-controlled physical asset is the founder's workstation/mobile devices**, covered as noted. This is a faithful exclusion-free treatment: the controls apply, but their implementation is predominantly inherited.

| ID | Control | App. | Implementation status | Justification & CK evidence / follow-up |
|----|---------|:----:|----------------------|------------------------------------------|
| A.7.1 | Physical security perimeters | Y | **Inherited** | Supabase data-centre perimeters (provider SOC 2/ISO 27001). CK has no production premises. Founder workstation kept in a private residence. |
| A.7.2 | Physical entry | Y | **Inherited** | Provider-controlled facility access. CK contributes none. |
| A.7.3 | Securing offices, rooms & facilities | Y | **Inherited / Partial** | Inherited from provider for servers; founder workstation in a locked private space. |
| A.7.4 | Physical security monitoring | Y | **Inherited** | Provider CCTV/monitoring at facilities. |
| A.7.5 | Protecting against physical & environmental threats | Y | **Inherited** | Provider fire/flood/power protection. |
| A.7.6 | Working in secure areas | Y | **Inherited (N/A in practice)** | No CK secure areas; applies to provider facilities only. |
| A.7.7 | Clear desk & clear screen | Y | **Implemented (founder workstation)** | Screen-lock on the founder's workstation + devices; no printed customer data. Minimal but real for a one-person operation. |
| A.7.8 | Equipment siting & protection | Y | **Inherited / Partial** | Servers sited by provider; founder devices protected (case, surge, private location). |
| A.7.9 | Security of assets off-premises | Y | **Implemented (founder devices)** | Founder's laptop/phone are the only off-premises assets: full-disk encryption + device passcode + remote-wipe capability (Apple/OS). |
| A.7.10 | Storage media | Y | **Inherited** | No removable production media; data on Supabase-managed storage (AES-256 at rest). Founder workstation disk encrypted. |
| A.7.11 | Supporting utilities | Y | **Inherited** | Power/cooling/network at provider facilities. |
| A.7.12 | Cabling security | Y | **Inherited** | Provider-controlled. |
| A.7.13 | Equipment maintenance | Y | **Inherited / Partial** | Provider maintains infra; founder keeps workstation OS/firmware patched. |
| A.7.14 | Secure disposal or re-use of equipment | Y | **Inherited / Partial** | Provider media sanitisation; founder performs secure-erase before device disposal/re-use. Data-level deletion handled by `delete_my_account` cascade (`v6`). |

---

## A.8 — Technological controls (34)

> **Theme posture:** This is CK's strongest theme. The technological controls below are the substance of the system and are mostly **Implemented and execution-verified**, with cited evidence. The honest exceptions are A.8.13 (backup — Free-tier gap), A.8.16 (monitoring — now scheduled by `v80` but operating evidence still accruing), and the MFA/sign-reauth *enforcement* posture under A.8.5.

| ID | Control | App. | Implementation status | Justification & CK evidence / follow-up |
|----|---------|:----:|----------------------|------------------------------------------|
| A.8.1 | User endpoint devices | Y | **Implemented (founder) / Partial (end users)** | Founder workstation/devices encrypted + passcode + MFA (B.2). End-user devices not managed (BYOD); risk mitigated by server-side RLS — a compromised device cannot exceed its JWT/role authority. |
| A.8.2 | Privileged access rights | Y | **Implemented** | `service_role` key confined to Edge Functions (`Deno.env`; `verify-sign-password/index.ts:31`), **never** shipped to the client (client uses anon key only, `src/lib/supabase.ts:6`). Admin DB mutations only via admin-gated RPCs (`admin_update_user_role`, `v17:188`; `export_ledger_proof` admin-only, `v51:171`). **Gap: account-level MFA on Supabase/Apple/GitHub/Codemagic not yet evidenced** → B.2. |
| A.8.3 | Information access restriction | Y | **Implemented** | Per-table RLS on every table (defence-in-depth); `SECURITY DEFINER` access helpers with pinned `search_path` (`v3-progress-schema.sql:33`); private Storage buckets `public=false` with short-lived signed URLs (`v71`); cross-tenant reads blocked (RLS). AI 站長 bounded by the caller's JWT/RLS. |
| A.8.4 | Access to source code | Y | **Partial** | Source in GitHub (private repo); access = founder only. Repo MFA to be evidenced → B.2. No source secrets in repo (anon key is public-safe; service-role only as Supabase secret). |
| A.8.5 | Secure authentication | Y | **Partial** | GoTrue bcrypt phone+password (AAL1). **Built but flag-OFF:** TOTP MFA step-up (`v52-54`, AAL2 via `mint_step_up_grant`/`assert_step_up` on ~12 high-risk RPCs) and sign-time password re-auth (`v60`, `verify-sign-password` Edge Fn). Both UIs ship with the 1.5 build; **enforcement flags flip after 1.5 is live on both stores** → B.4. This is the single highest-impact pending security action. |
| A.8.6 | Capacity management | Y | **Partial** | Supabase platform autoscales DB/Storage compute. **CK-relevant capacity = the 1GB Free-tier storage ceiling**, hard-backstopped by server-side bucket `file_size_limit`/MIME allowlists (`v71-storage-bucket-limits.sql`) so a stale client can't push toward the cliff. Pro upgrade (B.1) raises the ceiling. |
| A.8.7 | Protection against malware | Y | **Implemented / Inherited** | No file execution on the backend; uploads are images/PDF/audio restricted by bucket MIME allowlists (`v71`). Client is a sandboxed WebView (Capacitor). Provider infra AV inherited. |
| A.8.8 | Management of technical vulnerabilities | Y | **Partial** | Pinned deps (`package-lock.json`); `npm audit`/`get_advisors` available; adversarial RLS/persona simulations surface logic vulns pre-ship (e.g. `v17`, `v50` from audits). **Gap: no automated dependency-vuln gate in CI** → doc 07 / B.6. |
| A.8.9 | Configuration management | Y | **Implemented** | Infra-as-SQL: every schema/policy change is a versioned, reviewable `vNN-*.sql` migration (v2→v80) with intent + verify steps; `capacitor.config.ts`/`vite.config.ts` version-controlled; per-project module switches with UI+RLS parity (`v59`). |
| A.8.10 | Information deletion | Y | **Implemented** | `delete_my_account()` hard-deletes `auth.users` with cascade to `user_profiles`/`project_members`/push subs (`v6:42`); authored-content FKs `set null` to preserve the audit trail (`v6:23`, `v20`, `v68`). Apple-reviewed and approved. |
| A.8.11 | Data masking | Y | **Partial** | PII access narrowed by RLS (`user_profiles` SELECT scoped to self/teammate/PM, `v17:137`; applicant PII fix `v31`). No additional column-level masking (single-tenant-per-project model; low residual need). |
| A.8.12 | Data leakage prevention | Y | **Implemented** | Tenant isolation by RLS prevents cross-project reads; private buckets + signed URLs (`v71`); ledger/proof exports gated (`export_ledger_proof` admin-only, `v51:171`); AI 站長 outputs bounded by JWT/RLS + prompt-injection guarding; no bulk-export endpoint. |
| A.8.13 | Information backup | Y | **Planned / GAP** | **Most material technical gap.** Supabase **Free tier → no managed daily backup / PITR**, and Storage blobs aren't independently backed. Directly threatens the dispute-survival core value. Mitigation plan (doc 09): upgrade to Pro (daily backup + 7-day PITR) and evidence **one test restore** → **B.1**. |
| A.8.14 | Redundancy of information processing facilities | Y | **Inherited** | Supabase-managed DB redundancy/HA at the platform layer. CK adds none (no second region on Free tier). |
| A.8.15 | Logging | Y | **Implemented** | **Tamper-evident `audit_ledger`** = primary security log: SHA-256 hash chain, append-only (BEFORE UPDATE/DELETE raise, `v51:89`), AFTER triggers on 13 critical tables (`v51:104`); each row links to the prior hash so any past-record edit/delete breaks the chain. `verify_integrity()` (`v51:121`) + `export_ledger_proof()` (`v51:166`). Supplemented by Supabase platform logs (`get_logs`). |
| A.8.16 | Monitoring activities | Y | **Partial** | **Now scheduled:** `run_integrity_check()` walks the chain in system context and writes `integrity_check_log` daily at 02:00 HKT via pg_cron (`v80-integrity-monitoring-cron.sql:95`); an `intact=false` row is the alert signal. **Remaining gap: push/email alert fan-out on a break, and ~3 months of operating evidence** → B.6. Honest note: prompt-era "anomaly cron deferred" is partly closed by v80; alerting + evidence still pending. |
| A.8.17 | Clock synchronization | Y | **Inherited** | Supabase/cloud NTP-synced clocks; ledger canonicalises timestamps to UTC for deterministic hashing (`audit_ledger_canon`, `v51:39`). |
| A.8.18 | Use of privileged utility programs | Y | **Implemented** | No client access to privileged utilities. `service_role` (the privileged path) is Edge-Function-only; dashboard SQL-editor access is founder-only and itself logged by the ledger triggers (which fire regardless of RLS / even for service role, `v51:8`). |
| A.8.19 | Installation of software on operational systems | Y | **Implemented** | Backend "software" = SQL migrations applied via the documented verify-by-execution process; client builds are reproducible Vite/Capacitor builds shipped through Apple/Google review + Codemagic CI. No ad-hoc installs on operational systems. |
| A.8.20 | Networks security | Y | **Implemented / Inherited** | All traffic TLS 1.2+ (platform); client `fetchWithTimeout` 15s guard (`src/lib/supabase.ts:43`); Supabase network controls inherited. No CK-operated network. |
| A.8.21 | Security of network services | Y | **Inherited** | Supabase-managed API gateway / PgBouncer / Realtime; rate-limit `eventsPerSecond:10` on realtime (`src/lib/supabase.ts:127`). |
| A.8.22 | Segregation of networks | Y | **Inherited / N/A** | Single managed backend; no CK-operated network segments to segregate. Logical segregation = RLS tenant isolation. |
| A.8.23 | Web filtering | Y | **Partial** | AI 站長 reaches only the allow-listed model endpoint (OpenRouter→moonshotai/kimi-k2); Edge Functions make only intended outbound calls (e.g. GoTrue token check in `verify-sign-password`). No general user-facing web-proxy in scope. |
| A.8.24 | Use of cryptography | Y | **Implemented** | TLS 1.2+ in transit (platform); AES-256 at rest (platform); SHA-256 app-layer hash chain for integrity (`v51`, pgcrypto `extensions.digest`); bcrypt for credentials (GoTrue). Crypto/key policy in doc 08; `service_role` key custody = Supabase secrets / `Deno.env` only. |
| A.8.25 | Secure development life cycle | Y | **Implemented** | TypeScript strict mode; RLS-first design; GSD workflow gates planning + code-review per change; adversarial persona/RLS + daily-site simulations pre-ship. Secure-dev policy in doc 07. |
| A.8.26 | Application security requirements | Y | **Implemented** | Security requirements baked per feature (each migration header states the threat + guard, e.g. `v50`, `v55e`, `v69`, `v76`); RLS + step-up contracts defined before wiring (`v52` "the CONTRACT the client builds against"). |
| A.8.27 | Secure system architecture & engineering principles | Y | **Implemented** | Defence-in-depth (dual client+DB RBAC); least privilege (RPCs `revoke from public, grant to authenticated`; service-role isolation); fail-safe (offline write-block, `src/lib/supabase.ts:48`); pinned `search_path` on all SECURITY DEFINER funcs to prevent shadow-table injection. Documented in doc 07. |
| A.8.28 | Secure coding | Y | **Implemented** | Strict TS; parameterised SQL / no string-built queries in RLS paths (EXECUTE uses bound `using` params, `v9-rls-helpers.sql:99`); least-privilege grants; secrets never in client/source; review-before-merge. Latest full code review (2026-06-17): no critical/high; 3 medium closed (`v76`/`v77`/`v78`). |
| A.8.29 | Security testing in development & acceptance | Y | **Partial** | Adversarial RLS/persona simulations + RLS smoke test (`supabase/tests/rls-smoke.sql`); post-apply verify-by-execution per migration. **Gap: no automated security regression in CI / no CI dep-vuln gate** → doc 07 / B.6. |
| A.8.30 | Outsourced development | Y | **N/A in practice (Applicable, no outsourcing)** | All development is in-house (founder). No outsourced/contracted development. Control retained; activates if development is ever outsourced. |
| A.8.31 | Separation of development, test & production environments | Y | **Partial** | Single live Supabase project; isolation achieved by additive, idempotent, verify-before-apply migrations and `[DEMO]` data segregation. **No separate staging Supabase project** (Free-tier constraint) — a recognised limitation; mitigated by reversible/idempotent migration discipline. Supabase branch tooling available for future use. |
| A.8.32 | Change management | Y | **Implemented** | Every change = versioned migration + GSD plan/review + post-apply execution verification; schema history is the change log (`list_migrations`); `audit_ledger` records the data-level effects. |
| A.8.33 | Test information | Y | **Implemented** | Test/demo data is clearly tagged `[DEMO]` and seeded/scoped separately (memory: demo-simulation-kit); no production PII used as test data; simulations create synthetic personas. |
| A.8.34 | Protection of information systems during audit testing | Y | **Implemented** | Audit/verification reads are non-destructive (`verify_integrity` is `stable`, read-only, `v51:121`); tamper simulations run inside rolled-back transactions (`v51:194`); the ledger itself is immutable to audit actions. |

---

## Excluded controls

**None.** All 93 Annex A:2022 controls are applicable. For a solo cloud SaaS, exclusions would be harder to defend to an auditor than the documented "minimal / inherited" positions used above — so CK retains every control with an honest implementation status and a named follow-up.

---

## Consolidated open-gap map (read with doc 13)

| SoA control(s) | Gap | Owner action |
|----------------|-----|--------------|
| A.8.13, A.5.29, A.5.30, A.8.6 | Free-tier: no PITR/daily backup; no test-restore evidence | **B.1** — Supabase Pro + one evidenced restore |
| A.8.2, A.8.4, A.6.7 | Account MFA on Supabase/Apple/GitHub/Codemagic not evidenced | **B.2** — enable + screenshot each |
| A.5.20, A.5.23, A.5.34, A.6.6 | No signed Supabase DPA on file | **B.3** — sign DPA, finalise sub-processor list |
| A.5.17, A.8.5 | MFA step-up + sign-reauth enforcement flags OFF | **B.4** — flip after 1.5 live on both stores |
| A.5.17 | GoTrue password min-length + leaked-password protection unset | **B.5** — set in Auth dashboard |
| A.8.16 | Daily integrity check live (`v80`) but no alert fan-out + no ~3-month operating evidence | **B.6** — alert hook + operate the ISMS |
| A.5.7, A.5.21, A.8.8, A.8.29 | No CI dependency-vulnerability gate | doc 07 + **B.6** — add CI scan |
| A.5.24–A.5.28, A.5.35, A.5.36 | IR plan/policy authored not yet exercised; internal audit + management review pending | **B.6 / B.7**, external audit **C.1** |
| A.8.31 | No separate staging Supabase project | Accepted Free-tier limitation; mitigated by idempotent verify-before-apply migrations |

---

## Revision history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial SoA — all 93 Annex A:2022 controls assessed; grounded in live CK evidence (migrations v2–v80, Edge Functions, src/) with honest gap disclosure cross-referenced to the certification-readiness checklist (doc 13). |

*Maintained by 關進杰. Next scheduled review: 2027-06-18.*
