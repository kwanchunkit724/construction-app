# 09 — Information Security Incident Response Plan (A.5.24–A.5.28)

**Organisation:** CK工程 / CK Construction (sole-proprietor SaaS)
**Standard:** ISO/IEC 27001:2022 — Annex A controls **A.5.24** (incident management planning & preparation), **A.5.25** (assessment & decision on events), **A.5.26** (response to incidents), **A.5.27** (learning from incidents), **A.5.28** (collection of evidence). Supports A.6.8 (event reporting), A.8.15/A.8.16 (logging & monitoring — see `11-logging-and-monitoring.md`) and A.8.13/A.5.30 (recovery — see `08-backup-bcp-dr.md`).
**Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner & Top Management (sole founder/operator, and therefore also the single Incident Manager)
**Version:** 1.0
**Date:** 2026-06-18
**Next review:** 2027-06-18 (or earlier on a material change: a real incident that invokes this plan, a tabletop exercise that exposes a gap, a new sub-processor, a new Tier-1 data store, or a change to the contain/recover tooling cited here)
**Classification of this document:** 內部 (Internal). Describes detection/containment steps and names tooling, but **contains no secrets** — all credentials (Supabase service-role key, dashboard login, signing keys) live outside this document (see `07-cryptography-policy.md` / the credential custody note in `06-access-control-policy.md`).

> **Note on pack numbering.** The pack index (`README.md`) refers to this content as "10 — Incident management plan" and other documents cross-reference the slug `10-incident-management-plan.md`. This file is the same control set (A.5.24–A.5.28); where a sibling document points at `10-incident-management-plan.md`, it means **this plan**.

> **Status disclaimer (honesty for the auditor):** CK is **self-prepared toward certification readiness — NOT yet certified.** This plan is accurate to the live system as of the date above. Two preparedness gaps are stated plainly up front so they are not mistaken for working controls: **(1)** no incident has yet occurred and **the required tabletop exercise (§9) has NOT yet been run** — this plan is therefore *documented but unexercised*; **(2)** recovery from a logical data disaster currently depends on the backup capability tracked as open owner-action **B.1** in `13-certification-readiness-checklist.md` (the Supabase Free tier provides **no PITR / no managed daily backup** — see `08-backup-bcp-dr.md`). The detection, evidence-collection and containment halves of the lifecycle are strong; the **recover** half is gated on B.1. Read §2 (severities), §7 (recover) and §10 (gaps) before treating this as "incident response is fully operational".

---

## 1. Purpose & scope

CK's core value is that **判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes** (CLAUDE.md). For an incident response plan this reframes the goal: an information security incident at CK is anything that threatens the **confidentiality** of cross-tenant project data and PII, or the **integrity / availability** of the dispute-surviving record (signatures, PTW sign-offs, SI/VO approvals, progress history, and the tamper-evident `audit_ledger`). A breach that silently *alters* a permit signature is, for CK, as serious as one that *leaks* it — because the altered record is the product failing at its one job.

This document defines:

1. **Incident & event definitions, and a severity scale** (§2).
2. **Roles, contact tree and reporting channels** for a one-person organisation (§3).
3. The **incident lifecycle** — detect → assess → contain → eradicate → recover → notify → review (§4–§8), with **CK-specific playbooks** at each stage grounded in the live system.
4. **Evidence collection** (A.5.28) anchored on the `audit_ledger` cryptographic chain (§6 / §8).
5. **External notification** — Apple, affected users, and the HK PDPO position (§7.4).
6. The **mandatory tabletop requirement** and an incident log (§9).
7. An **honest gap register** and owner actions (§10).

**Architecture context (why this is mostly a Supabase + account-security question).** CK runs **no application server and no infrastructure of its own** — a React/Capacitor client talks directly to Supabase over TLS, using only the **anon key** (`src/lib/supabase.ts:118` constructs the client from `VITE_SUPABASE_ANON_KEY`; the `service_role` key never reaches the client and lives only in Edge Functions via `Deno.env`). The **entire production data plane** — PostgreSQL + RLS, GoTrue `auth.users`, Storage, Edge Functions — is one Supabase project (`https://syyntodkvexkbpjrskjj.supabase.co`). Therefore the realistic incident surface is: **(a)** a credential/account compromise (Supabase dashboard, service-role key, Apple/GitHub/Codemagic), **(b)** a logical data disaster (mass delete / bad migration), **(c)** an integrity-tampering attempt detectable by the hash chain, **(d)** an RLS/authorization regression leaking cross-tenant data, or **(e)** a sub-processor incident. The playbooks (§4–§8) are written against exactly those.

---

## 2. Definitions and severity scale (A.5.24 / A.5.25)

**Security event** — any observable occurrence that *might* have security relevance (a failed-login spike, an unexpected `audit_ledger` write pattern, a Supabase status-page outage, a Dependabot CVE alert). Events are triaged (§5); most are **not** incidents.

**Security incident** — a confirmed event (or set) that has compromised, or credibly threatens, the confidentiality, integrity or availability of CK's information assets. Declaring an incident starts the lifecycle in §4 and opens an incident-log row (§9).

**Personal-data breach (PDPO context)** — an incident involving unauthorised access to, loss of, or alteration of personal data (HK 個人資料 — phone numbers, names, worker green-card/credential data, GPS-stamped site photos). Handled with the notification approach in §7.4.

### Severity scale

Severity drives the response speed and notification path. The ISMS owner assigns severity at declaration and may re-grade as facts emerge.

| Severity | Definition (CK-specific) | Examples | Target response start | Target containment |
|:--------:|--------------------------|----------|:---------------------:|:------------------:|
| **SEV-1 — Critical** | Active compromise of the data plane or identity store; cross-tenant data exposure; **confirmed tampering of the dispute-survival record**; or full unavailability with data-loss risk. | Supabase dashboard / service-role key compromised; `run_integrity_check()` reports `intact: false`; mass deletion of `audit_ledger`/`progress_history`/PTW sign-offs; an RLS hole leaking another tenant's project data live. | **Immediately** (drop everything) | ≤ 4 h |
| **SEV-2 — High** | Serious but bounded; a real vulnerability with exposure but no confirmed mass compromise; single-account takeover; a leaked secret with limited blast radius. | A privilege-escalation/RLS regression found before mass exploitation; one user account credential-stuffed; a high-severity dependency CVE on a reachable path; Apple reports an account-security defect. | ≤ 24 h | ≤ 72 h |
| **SEV-3 — Medium** | Limited impact, contained or low-likelihood; policy/config weakness; a sub-processor advisory with no CK data confirmed affected. | A sub-processor (OneSignal/OpenRouter) security advisory; a medium CVE on a non-reachable path; a misconfiguration caught by `get_advisors`; a single phishing attempt at the founder. | ≤ 3 working days | best-effort |
| **SEV-4 — Low** | Negligible impact; informational; near-miss. | A blocked attack that the existing guard already defeated (e.g. a self-promote attempt rejected by the v17 BEFORE-UPDATE gate); a noisy failed-login that resolved. | Log & monitor | n/a |

> **One-operator reality:** there is no on-call rota or tiered SOC. "Response start" means the time by which 關進杰 begins working the incident. SEV-1 explicitly **pre-empts all other work**. The scale is set honestly against what a solo micro-entity can sustain, not an enterprise SLA.

---

## 3. Roles, contact tree & reporting (A.5.24 / A.6.8)

CK is a **one-person organisation**: 關進杰 is simultaneously the **ISMS Owner, Incident Manager, sole responder, decision-maker on external notification, and the only holder of production credentials**. This is stated, not hidden — it is a real key-person risk (see `08-backup-bcp-dr.md` §9 and §10 below).

**Contact tree (escalation & notification):**

| Party | Role in an incident | Contact channel | When engaged |
|-------|--------------------|-----------------|--------------|
| **關進杰 (founder)** | Incident Manager + responder. Receives all reports. | Primary email `kck980724@gmail.com`; in-app demo feedback channel; direct message. | All incidents. |
| **Supabase Support** | Platform provider; needed for platform-side compromise, restore-from-backup (when B.1 done), abuse. | Supabase dashboard support / status page. | SEV-1/2 platform or data-plane incidents. |
| **Apple App Review / App Store Connect** | Distribution channel; account-security or privacy defects, and the account-deletion compliance path. | App Store Connect. | Incidents affecting the iOS app, user data, or that may require an expedited update. |
| **Affected users (判頭/PM/工人 etc.)** | Data subjects. | In-app notice + the contact details held in `user_profiles` (phone). | Confirmed breach affecting their data (§7.4). |
| **HK PCPD (PDPO regulator)** | Privacy regulator. | PCPD complaint/enquiry channel. | Voluntary notification on a material personal-data breach (§7.4). |
| **OneSignal / OpenRouter→Anthropic→moonshotai/kimi-k2** | Sub-processors. | Provider support. | If the incident originates with or implicates a sub-processor (`05-supplier-and-cloud-register.md`). |

**Reporting channels (how an event reaches the Incident Manager):**
- **Automated technical signals** — the daily `run_integrity_check()` log (`v80-integrity-monitoring-cron.sql`), Supabase logs/`get_advisors`, GitHub Dependabot/`npm audit`, Supabase status page, Apple/Play developer notices.
- **Human reports** — a user reporting suspicious behaviour via in-app feedback or directly to the founder; a sub-processor advisory email.
- Every reported event is recorded and triaged per §5. **No event is dismissed without a triage note** in the incident log (§9), so the auditor can see that even "low/false-positive" events were assessed (A.5.25).

---

## 4. Incident lifecycle (overview)

The lifecycle is **detect → assess → contain → eradicate → recover → notify → review**. Each stage below has a CK-specific playbook. The same lifecycle is invoked whether the trigger is a tampering alert, a credential leak, or a data-loss event — only the playbook branch differs.

```
   DETECT          ASSESS         CONTAIN        ERADICATE       RECOVER        NOTIFY         REVIEW
 §5 verify_       §5 triage +    §6 rotate key  §6 close the    §7 restore     §7 Apple +     §8 post-incident
 integrity,       severity       / disable      hole (migra-    (B.1 backup),  affected       review, lessons,
 logs, Depen-     (§2 scale),    account /      tion / RLS      re-verify      users +        update this doc,
 dabot, user      open incident  pause project  fix), revoke    integrity      PDPO          tabletop cadence
 reports          log row                        grants                         approach
        └──────────────── evidence collection (A.5.28) runs THROUGHOUT, anchored on audit_ledger ───────────────┘
```

---

## 5. Detect & assess (A.5.25)

**Detection sources (CK-specific):**

| Signal | Source | What it catches |
|--------|--------|-----------------|
| **Integrity break** | Daily `run_integrity_check()` → `integrity_check_log` (`v80-integrity-monitoring-cron.sql`); on-demand `verify_integrity(0)` (`v51-audit-ledger-tamper-evidence.sql:121`) | Any alteration/deletion of a past record on the 26 watched critical tables — returns `{"intact": false, "break_at": <seq>, "reason": "hash mismatch (row altered)"}`. **This is CK's primary tamper detector.** |
| **Auth/platform logs** | Supabase Auth + Postgres logs; `get_advisors` security/perf advisors | Failed-login spikes, anomalous queries, RLS/policy misconfig advisories. |
| **Dependency CVEs** | GitHub Dependabot + `npm audit` | Vulnerable client/Edge dependencies (CI dep-vuln gate is itself an open gap — `07-secure-development-policy.md`). |
| **Sub-processor advisories** | Supabase / OneSignal / OpenRouter / Apple notices | Upstream incidents. |
| **User report** | In-app feedback / direct contact | Suspicious behaviour, account takeover, data seen that shouldn't be visible. |

**Assess / triage steps:**
1. **Record the event** — time, source, raw signal — as an incident-log row (§9), even if it may be a false positive.
2. **Confirm or dismiss.** For an integrity alert, immediately run `select verify_integrity(0);` to confirm the break and capture `break_at`/`reason`. For an RLS/exposure report, attempt to reproduce as the reporting role (the adversarial-persona / RLS simulation method already used pre-ship — see `07-secure-development-policy.md`).
3. **Assign severity** per the §2 scale.
4. **Declare** (SEV-1/2/3) or **close as event/near-miss** (SEV-4) with a triage note. Declaration starts §6.

> **Known false-positive class (do not over-react):** an attempted privilege escalation that the existing guards already reject is a **SEV-4 near-miss, not a breach** — e.g. a self-promote on `user_profiles` blocked by the v17 BEFORE-UPDATE gate / v18 RLS hardening, a membership-role self-elevation blocked by v50, a credential self-verify blocked by v55e, or a `safety_officer` PTW `admin_override` blocked by v76. These appear in logs as *blocked* attempts; they are logged and monitored, not escalated, unless the attempt volume itself indicates a targeted campaign.

---

## 6. Contain, eradicate & collect evidence (A.5.26 / A.5.28)

**Containment is chosen by incident class.** The four live containment levers CK actually has are: **rotate the service-role key**, **disable/neutralise an account**, **pause the project / stop writes**, and **revoke step-up / sign-reauth grants**.

### 6.1 Containment playbooks

| Incident class | Contain (CK-specific) | Tooling / evidence |
|----------------|-----------------------|--------------------|
| **Service-role key compromise** (Edge Function secret leaked) | **Rotate the `SUPABASE_SERVICE_ROLE_KEY` in the Supabase dashboard**, then re-set the Edge Function secrets and redeploy the affected functions (`ai-assistant`, `verify-sign-password`, `weather-sync`, `build-memory-graph`). The client is unaffected (anon-key only, `src/lib/supabase.ts`). | Supabase dashboard (secrets); redeploy via dashboard editor (`supabase-migration-apply` channel). The key never appears in this doc or the repo. |
| **User / admin account takeover** | **Neutralise the account.** Demote a compromised privileged account via `admin_update_user_role` (`v17-user-profiles-rls-hardening.sql:188`, admin-gated, `set row_security=off`) to strip its rights; force-reset by changing the GoTrue password from the dashboard; in the worst case hard-delete via the same cascade path as `delete_my_account` (`v6-account-deletion.sql:42`, which preserves authored content via FK-set-null). | Admin RPCs are themselves audit-logged (`user_profiles` is a watched table, `v51`). |
| **Logical data disaster** (mass delete / bad migration) | **Stop the bleeding first:** pause the affected client path or the Supabase project to prevent the bad state propagating, *then* go to RECOVER (§7) — restore is **branch-first, never over live data as the first move** (`08-backup-bcp-dr.md` §6). | `verify_integrity` confirms scope; restore gated on B.1. |
| **Confirmed tampering** (`intact: false`) | **Quarantine + prove.** Do not write further to the affected tables; immediately `export_ledger_proof()` (`v51:166`, admin-only) to capture the cryptographic chain state at `break_at` as forensic evidence **before** any remediation. | `export_ledger_proof()` returns chain metadata + per-row hashes (never payloads) for offline third-party re-verification. |
| **RLS / authorization regression** (cross-tenant leak) | **Close the hole with a migration.** CK's whole containment for an authz bug is a versioned SQL migration that tightens the RLS policy / RPC guard (the exact pattern of v17/v18/v50/v55e/v69/v76/v77 fixes), applied + execution-verified by running the exploit it blocks. Disable the affected feature module per project (v59 module switches) as an interim stop-gap if the fix can't ship instantly. | Migration file under `supabase/`; verify-by-execution (`supabase-migration-apply`). |
| **Sub-processor incident** | Assess CK data exposure; rotate any keys held with that processor; if AI provider (OpenRouter/kimi-k2) — disable the AI 站長 module per project (v59) with **zero core impact** (data plane + audit trail unaffected). | `05-supplier-and-cloud-register.md`. |
| **Stolen device / live session** | Account-level password reset (invalidates sessions); if step-up enforcement is active, the AAL2 grants are short-lived (5-min TTL, `v52-step-up-foundation.sql`) and `revoke`-only by design. | GoTrue session management. |

### 6.2 Eradicate

After containment, remove the root cause so the incident cannot recur: ship the RLS/RPC migration that closes the hole; remove the leaked secret from any history and rotate it; patch/upgrade the vulnerable dependency; and **revoke outstanding step-up / sign-reauth grants** if a session was implicated (grant tables are service-role-write-only with a 5-minute TTL — `v52`, `v60-sign-reauth.sql`). Eradication is only "done" when the originating exploit, re-run, **fails** (CK's verify-by-execution standard).

### 6.3 Evidence collection (A.5.28) — the audit ledger is the spine

CK's evidentiary advantage is that the **tamper-evident `audit_ledger` is the forensic record by design**:
- It is **append-only** (UPDATE/DELETE raise via `audit_ledger_immutable()`, `v51:89`) and **unreadable to clients** except through the gated verify/export RPCs — so an attacker who reaches the data plane can write *new* rows but **cannot edit a past one without breaking the SHA-256 chain**, which `verify_integrity()` then surfaces.
- Triggers fire **regardless of RLS and even under the service-role key** (`v51` header), so privileged/dashboard actions are still recorded.
- **Evidence is preserved with chain-of-custody intent:** at SEV-1/SEV-2 the responder runs `export_ledger_proof()` early (before remediation) to snapshot `head_seq`/`head_hash` and the per-row hash list, plus the `integrity_check_log` history (`v80`), and stores them with the incident-log row (§9). These artefacts let a third party (auditor, 勞工處, court) **independently re-verify** what the record looked like at the moment of the incident.
- Supplementary evidence: relevant Supabase Auth/Postgres logs, Edge Function logs (which **never contain passwords** — `verify-sign-password/index.ts:19-21,84-85` explicitly never log, echo, store or return the password), screenshots of dashboard state, and the `photo_metadata` GPS+timestamp rows (`v79`, append-only) where site-photo authenticity is in question.

---

## 7. Recover & notify (A.5.26 / A.5.30)

### 7.1 Recover — data

Recovery from a logical data disaster follows the **branch-first restore runbook in `08-backup-bcp-dr.md` §6** (declare → choose recovery point → restore into an isolated Supabase branch → verify on the branch → promote → re-verify on production → re-export a fresh backup). **The integrity re-verification is the gate:** a restored branch must return `verify_integrity(0) → intact: true` before it is promoted; an `intact: false` restore means the backup captured a tampered/partial state and a different recovery point must be chosen.

> **Honest dependency:** this recovery path's effectiveness is **gated on owner-action B.1** (`13-certification-readiness-checklist.md`). On the current Supabase Free tier there is **no PITR and no managed daily backup**, so for a true data-loss event CK's *self-service* recovery is presently limited to schema-as-code rebuild (replay `supabase/v2-*.sql`…`v80-*.sql`, which restores structure/logic but **not data**). This is the single most material recovery gap and is called out in §10 and `08`.

### 7.2 Recover — identity & app

- **Identity:** restore `auth.users` with the data (it lives in the same project); a test login must resolve before declaring recovery complete.
- **Client / release pipeline:** the app is stateless and rebuildable from GitHub → Codemagic → App Store/Play (`codemagic.yaml`); a release-pipeline incident does **not** take down the live app (the running app keeps talking to the data plane).
- **Edge Functions / config:** redeploy from `supabase/functions/`; re-apply any rotated secrets.

### 7.3 Recover — re-enable controls

After recovery, confirm the controls that may have been touched are back: RLS policies travelled with the restore (RLS smoke-test as a non-admin role), the `audit_ledger` triggers are attached (re-run a watched-table write → a new ledger row appends), and — once the enforcement flags are ON (see §10 / B.4) — step-up MFA and sign-reauth assertions still fire on the high-risk RPCs.

### 7.4 Notify (external) — Apple, users, PDPO

| Who | When | How | Basis |
|-----|------|-----|-------|
| **Affected users (data subjects)** | On a **confirmed** breach of *their* personal data (unauthorised access, loss, or alteration). | In-app notice +, where warranted, direct contact via the phone in `user_profiles`. Notice states what happened, what data, what CK has done, and what the user should do. | Good-practice transparency; preserves trust in the dispute-survival record. |
| **HK PCPD (PDPO)** | On a **material** personal-data breach. | PCPD breach-notification channel. | **Honest position:** Hong Kong's **PDPO (Cap. 486) currently imposes NO mandatory data-breach notification obligation.** CK's policy is nonetheless to **voluntarily notify the PCPD** for a material breach (and to follow the PCPD's *Guidance on Data Breach Handling*), because (a) it is the regulator's recommended practice and (b) it is consistent with the integrity-first posture CK sells. CK is not subject to GDPR today; if it onboards EU data subjects this section is revisited (72-hour GDPR rule). |
| **Apple App Store Connect** | If an incident affects iOS users' data/security or requires an expedited fix; and to preserve the **already-approved account-deletion** compliance path. | App Store Connect; submit an expedited build if a client-side fix is required. | App Store review obligations. |
| **Supabase / sub-processors** | If the incident originates with or implicates them. | Provider support; request platform-side action (restore, abuse, key invalidation). | Sub-processor relationship (`05`). Note: a **signed Supabase DPA is an open owner-action (B.3)** — see §10. |

**Decision authority:** the ISMS owner (關進杰) decides what and when to notify. The decision and its rationale are recorded in the incident log (§9), so the choice (including a decision *not* to notify a regulator that imposes no duty) is itself auditable.

---

## 8. Learn from incidents (A.5.27) — post-incident review

Every SEV-1/SEV-2 incident (and any SEV-3 the owner deems instructive) gets a **post-incident review**, recorded against its incident-log row:
1. **Timeline & root cause** — what happened, detection-to-containment time, actual severity vs declared.
2. **What worked / what didn't** — did `run_integrity_check()` catch it? Did containment hold? Was evidence captured before remediation?
3. **Corrective & preventive actions** — concrete changes (a new migration/guard, a monitoring rule, a doc update). Each action is tracked to closure, cross-referenced to `13-certification-readiness-checklist.md` where it maps to an owner action.
4. **Feed the knowledge base** — update the relevant ISMS doc and this plan; capture the lesson (CK already keeps a structured project memory + the in-DB memory graph, `v61/v62`, which can hold incident learnings).
5. **Metrics for management review** — incident count by severity, mean time to contain, and recurrence are inputs to the Clause-9 management review (owner-action B.7).

This is the loop that turns CK's existing "find a hole → ship a guarded migration → verify by re-running the exploit" engineering reflex (evidenced across v17/v18/v50/v55e/v69/v76/v77/v78) into a **documented A.5.27 control**.

---

## 9. Mandatory tabletop exercise & incident log (A.5.24)

ISO/IEC 27001 A.5.24 requires incident response to be **planned and prepared**, not merely written. A plan that has never been exercised is an *assumption*.

**Therefore the ISMS mandates at least ONE dated tabletop exercise** walking a SEV-1 scenario end-to-end through §4–§8 — recommended scenario: **"`run_integrity_check()` reports `intact: false` overnight"** (detect → confirm with `verify_integrity` → `export_ledger_proof` for evidence → contain by pausing writes → recover via the §7 branch-first restore → decide on user/PDPO notification → review). This exercises the integrity-detection spine **and** surfaces whether B.1 (recovery) is actually runnable. The exercise is recorded below.

**Tabletop exercise log (to be populated — REQUIRED before Stage 2 audit):**

| Date | Scenario | Severity simulated | Gaps found | Actions raised | Performed by | Evidence ref |
|------|----------|:------------------:|------------|----------------|--------------|--------------|
| ⏳ *pending* | — | — | — | — | 關進杰 | **NOT YET PERFORMED** |

> **Cadence once established:** tabletop **at least annually** (aligned to this document's review date) and **after any material change** to the containment/recovery tooling. Each run appends a row.

**Incident log (live record — to be populated as incidents/events occur):**

| ID | Detected | Source | Severity | Class | Contained | Recovered | Notified | Reviewed | Evidence ref |
|----|----------|--------|:--------:|-------|-----------|-----------|----------|----------|--------------|
| *(none recorded to date)* | — | — | — | — | — | — | — | — | — |

> The empty log is the honest current state: CK has had **no declared security incident**. The log structure exists so that the *first* incident is handled and recorded to standard.

---

## 10. Honest gap summary & owner actions

| # | Gap | Affected lifecycle stage | Status | Action ref |
|---|-----|--------------------------|:------:|------------|
| 1 | **No tabletop exercise yet performed** (§9) — plan is documented but unexercised. | Prepare (A.5.24) | ⚠️ Open | this doc §9 → roll into **B.6** (operating evidence) |
| 2 | **Recovery depends on B.1** — Free tier has no PITR / managed backup; self-service data recovery is limited to schema-as-code (no data). | Recover (§7.1) | ⚠️ **Open — high priority** | **B.1** |
| 3 | **MFA + sign-reauth enforcement flags** — step-up MFA (`step_up_enforced`) and signature re-auth (`sign_reauth_enforced`) backends are **built and verified** (`v52`–`v54`, `v60`, `verify-sign-password`), but enforcement is **flag-gated** pending the 1.5 client being live on both stores. Until flipped, account takeover containment leans on password-reset alone (no second factor on high-risk RPCs). | Contain/Eradicate (§6.2) | ⚠️ Partial (built, flag-gated) | **B.4** |
| 4 | **Account MFA on Supabase / Apple / GitHub / Codemagic not evidenced** — these accounts are the keys to the data plane, app signing, source and CI; a compromise of any is a SEV-1. Account-level MFA is the highest-weight preventive. | Contain (§6.1) | ⚠️ Open | **B.2** |
| 5 | **No signed Supabase DPA on file** — sub-processor incident handling (§7.4) and breach roles/responsibilities are not yet contractually anchored with the primary processor. | Notify (§7.4) | ⚠️ Open | **B.3** |
| 6 | **Integrity-monitoring alerting** — `run_integrity_check()` + daily cron and the `integrity_check_log` exist (`v80`), but the **alert fan-out** (push the `intact: false` row to the founder) is noted as a future hook, and the cron must be confirmed running as part of ~3 months of operating evidence. Detection of a tamper event currently relies on the owner *reading* the log. | Detect (§5) | ⚠️ Partial | **B.6** |
| 7 | **No CI dependency-vulnerability gate** — Dependabot/`npm audit` are advisory only; a vulnerable dependency could ship without a hard gate. | Detect/Eradicate | ⚠️ Open | `07-secure-development-policy.md` / **B.6** |
| 8 | **Bus-factor = 1** — single responder/decision-maker; no deputy, no credential escrow. | All stages | ⚠️ Open | `08-backup-bcp-dr.md` §9 (credential escrow action) |

**What is genuinely sound today (do not understate):** CK's **detect** and **evidence** halves are unusually strong for a solo SaaS — a tamper-evident append-only `audit_ledger` SHA-256 chain across 26 critical tables with `verify_integrity()` / `export_ledger_proof()` (`v51`) and a daily system-context `run_integrity_check()` (`v80`); defence-in-depth RLS with `SECURITY DEFINER` helpers pinned to `search_path=public`; least-privilege RPCs; `service_role` confined to Edge Functions; and a demonstrated, verified-by-execution reflex for closing authz holes with guarded migrations. The **contain** levers (key rotation, account neutralisation, project pause, module disable, grant revocation) are real and available now. The honest weakness is the **recover** half (gap #2, B.1) and **preparedness evidence** (gaps #1, #6 — tabletop + operating logs). Closing B.1, B.2, B.4 and running one tabletop moves this plan from "documented" to "operational".

---

## Revision history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial issue. Severity scale (SEV-1…4); contact tree for a one-person org; full detect→assess→contain→eradicate→recover→notify→review lifecycle with CK-specific playbooks (integrity-break detection via `verify_integrity`/`run_integrity_check`; containment via service-role-key rotation, `admin_update_user_role` account neutralisation, project pause, v59 module disable, grant revocation; recovery via the `08` branch-first restore runbook; Apple + affected-user notification + voluntary-PCPD/PDPO position); `audit_ledger` `export_ledger_proof` as A.5.28 evidence spine; mandatory tabletop requirement + incident log. Honest gap register cross-referenced to `13-certification-readiness-checklist.md` (B.1/B.2/B.4/B.6) and grounded in live CK evidence (`v51`, `v52`–`v54`, `v60`, `v76`/`v77`, `v80`, `v6`, `v17`, `functions/verify-sign-password`, `src/lib/supabase.ts`). |

*Maintained by 關進杰. Next review: 2027-06-18 or on a real incident / tabletop finding. Part of the ISO/IEC 27001:2022 ISMS pack — see `README.md` (pack index entry "10 — Incident management plan", A.5.24–A.5.28).*
