# 08 — Backup, Business Continuity & Disaster Recovery (A.8.13, A.5.29–A.5.30)

**Organisation:** CK工程 / CK Construction (sole-proprietor SaaS)
**Standard:** ISO/IEC 27001:2022 — Annex A controls **A.8.13** (information backup), **A.5.29** (information security during disruption), **A.5.30** (ICT readiness for business continuity). Supports A.5.24/A.5.26 (incident response — see `10-incident-management-plan.md`) and A.8.14 (redundancy — partly inherited, see §8).
**Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner & Top Management (sole founder/operator)
**Version:** 1.0
**Date:** 2026-06-18
**Next review:** 2027-06-18 (or earlier on a material change: a backup strategy change, a Supabase tier change, a new Tier-1 data store, a restore test that fails, or a real disruption that invokes this plan)
**Classification of this document:** 內部 (Internal). Names data stores and recovery steps but no secrets — all credentials live outside this document (Supabase dashboard, `app_config`, Codemagic env groups; see `08-cryptography-and-key-management.md`).

> **Status disclaimer (honesty for the auditor):** CK is **self-prepared toward certification readiness — NOT yet certified.** This document is accurate to the live system as of the date above. It contains **one material open gap stated plainly up front**: production data currently runs on the **Supabase Free tier, which provides NO managed daily backup and NO Point-in-Time-Recovery (PITR)**, and Storage blobs are not independently backed up. This is the single most material *technical* continuity risk to CK's core value, it is tracked as owner-action **B.1** in the certification-readiness checklist (`13-certification-readiness-checklist.md`), and the required restore-test evidence (§7) has **not yet been produced**. Do not read this plan's existence as "backups are running and tested" — read §2 and §10 first.

---

## 1. Purpose & scope

CK's core value is that **判頭 + 工地主任 always know exactly what's happening on every site, with a shared audit trail that survives disputes** (CLAUDE.md). The information assets this plan protects are therefore valued primarily for their **integrity and availability over time** — a permit signature, a drawing version, a progress tick or an `audit_ledger` row must still be recoverable and provably unaltered months later when a 勞工處 or contractual dispute arises. A data-loss event is not merely an outage; it destroys the evidentiary record that is the product.

This document defines:

1. **RTO / RPO targets** by asset tier (§3).
2. The **current backup posture and its honest gap** (§2), and the **required backup strategy** to close it (§4).
3. **Storage-blob backup** (drawings, permit/issue photos) (§5).
4. A **step-by-step disaster-recovery restore runbook**, including a non-destructive Supabase **branch** test-restore (§6).
5. The **requirement to evidence ONE test restore** before certification (§7).
6. **Continuity scenarios, availability dependencies, and the single-operator key-person plan** (§8–§9).

**Architecture context (why this is mostly a Supabase question).** CK runs **no application server and no infrastructure of its own** — a React/Capacitor client talks directly to Supabase (CLAUDE.md: "Two-tier: React SPA ↔ Supabase. No application server, no API layer"). Consequently the **entire production data plane** — PostgreSQL, GoTrue `auth.users`, Storage, Edge Functions — lives inside a single Supabase project (`https://syyntodkvexkbpjrskjj.supabase.co`). The client and native shells are **stateless** and rebuildable from source (GitHub → Codemagic → App Store/Play; see `codemagic.yaml` and `05-supplier-and-cloud-register.md` §2.4). Therefore backup/BCP/DR for CK is overwhelmingly **"can we recover the Supabase project?"** plus **"can we rebuild and re-ship the client?"**

---

## 2. Current state (honest baseline) — the open gap

| Asset / layer | Where it lives | Current backup reality |
|---------------|----------------|------------------------|
| **Postgres data** (all project/progress/issue/SI/VO/PTW/document/equipment tables, `user_profiles`, **`audit_ledger`** tamper-evident chain) | Supabase Postgres | ⚠️ **Free tier: NO managed daily backup, NO PITR.** Recovery depends entirely on Supabase platform internal durability — which CK does not control and cannot self-restore from. |
| **GoTrue identity** (`auth.users`, bcrypt password hashes, synthetic `<digits>@phone.local`) | Supabase Auth | ⚠️ Same Free-tier exposure as above. |
| **Storage blobs** (drawings, permit/issue photos, SI/VO attachments, documents) | Supabase Storage (4 private buckets, `v8-private-bucket-template.sql`, `v71-storage-bucket-limits.sql`) | ⚠️ **Not independently backed up.** No copy outside Supabase. |
| **Schema / business logic** (RLS policies, RPCs, triggers, hash-chain logic) | Versioned SQL migrations `supabase/v2-*.sql` … `v80-*.sql` | ✅ **Backed up by design** — every schema object is a replayable SQL file in the GitHub repo. This is the one layer that is genuinely safe today. |
| **Edge Functions** (`ai-assistant`, `verify-sign-password`, `weather-sync`, `build-memory-graph`) | Supabase Edge | ✅ Source in repo under `supabase/functions/`; redeployable. |
| **Client / native app** | GitHub + Codemagic + App Store/Play | ✅ Stateless; rebuildable from source via `codemagic.yaml`. |

**Net honest position:** the **code, schema and client are recoverable** (they live in version control). The **live data and identity store are the gap** — on the Free tier CK has **no self-service restore capability and no independent copy of the production data or Storage blobs**. A logical disaster today (accidental mass delete, a bad migration, a ransomware/credential-compromise on the Supabase account) could be **unrecoverable** beyond whatever Supabase's internal platform durability happens to provide. This is **Risk R-BCP-01** in `04-risk-assessment-and-treatment.md` and **owner-action B.1** in `13-certification-readiness-checklist.md`, and it is rated the **single highest-priority technical gap** in the pack.

**Mitigants that reduce — but do not close — the gap today:**

- **Schema-as-code.** All 80+ migrations are in the repo; a fresh Postgres can be rebuilt to the exact schema by replaying `supabase/*.sql` in order (the same drill as the exit/portability path, `05-supplier-and-cloud-register.md` §5). This recovers *structure and logic*, not *data*.
- **Integrity is independently verifiable post-restore.** After any restore, the append-only `audit_ledger` SHA-256 hash chain (`v51-audit-ledger-tamper-evidence.sql`) can be re-walked by `verify_integrity()` / `run_integrity_check()` to **prove the restored data was not silently altered** (see §6 step 7). A restore that comes back with `intact: false` is itself a detectable signal.
- **Server-side Storage caps limit blast radius.** `v71-storage-bucket-limits.sql` sets `file_size_limit` (10–25 MB) and MIME allowlists per bucket, keeping the Free-tier 1 GB envelope manageable and a future full Storage export feasible.

---

## 3. RTO / RPO targets

Targets are set by **asset criticality tier** (tiers per `04-risk-assessment-and-treatment.md` / `05-supplier-and-cloud-register.md`). They are **targets the chosen strategy (§4) must meet**, set honestly against a one-person micro-entity on a budget — not aspirational figures CK cannot currently achieve.

| Asset tier | Examples | **RPO (max data loss)** | **RTO (max downtime)** | Rationale |
|------------|----------|:-----------------------:|:----------------------:|-----------|
| **Tier-1 — dispute-survival record** | `audit_ledger`, signatures/`get_signature_proof`, PTW sign-offs, SI/VO approvals, progress history, `photo_metadata` (GPS+timestamp) | **≤ 24 h** (target with daily backup) → **≤ 5 min** once PITR is active | **≤ 24 h** | Losing this destroys the evidentiary product. PITR closes RPO to near-zero for logical disasters. |
| **Tier-1 — identity** | GoTrue `auth.users` (bcrypt hashes), `user_profiles` | **≤ 24 h** | **≤ 24 h** | Users cannot log in without it; re-onboarding HK workers manually is high-friction. |
| **Tier-2 — operational content** | drawings, issue/permit photos, documents (Storage blobs) | **≤ 7 days** | **≤ 72 h** | Important but often re-uploadable from the originating device; weekly export acceptable as interim. |
| **Tier-3 — convenience / derived** | OneSignal push state, memory-graph, AI usage counters, weather cache | **best-effort** | **best-effort** | Reconstructible or non-critical; no hard target. |
| **Code / schema / client** | `supabase/*.sql`, `supabase/functions/`, app source | **0** (in Git) | **≤ 24 h** (rebuild + redeploy) | Already version-controlled; "loss" means a repo loss, mitigated by GitHub + local clones. |

> **Current-state caveat:** until B.1 is done, the **achieved** RPO/RTO for Tier-1 data is **undefined** — there is no CK-controlled restore. The table above is the **committed target after** the strategy in §4 is implemented. This honesty is required for the auditor; an undefined RTO is itself the finding.

---

## 4. Required backup strategy (closing the gap — owner-action B.1)

The ISMS **requires** one of the two strategies below to be in place. **Option A is the recommended primary**; Option B is the documented fallback / interim and doubles as the cloud-exit drill (`05-supplier-and-cloud-register.md` §5).

### Option A (recommended) — Upgrade Supabase to Pro: managed daily backup + 7-day PITR

- **What it gives:** Supabase Pro (~US$25/mo) provides **automated daily logical backups** and **Point-in-Time-Recovery (7-day window)** for Postgres, restorable from the Supabase dashboard. This moves Tier-1 RPO from "undefined" to **≤ 5 min** (PITR) and makes restore a **self-service, owner-runnable** operation.
- **Why this is the recommended path:** it is the lowest-effort, lowest-risk way to obtain a real, vendor-supported, tested-by-the-vendor backup-and-restore capability for the primary data plane — directly proportionate for a single-operator micro-entity that cannot run its own backup infrastructure 24/7.
- **Coverage:** Postgres + `auth` schema. **Storage blobs are covered separately** (§5) — confirm whether the Pro plan's backup includes Storage objects; if not, §5's export still applies.
- **Cost/benefit:** ~US$25/mo against the catastrophic, product-destroying loss of the dispute-survival record. The risk treatment (`04`) accepts this cost as justified.

### Option B (interim / fallback) — Scripted encrypted `pg_dump` + Storage export to independent storage

Used if Pro is deferred, **and** retained as a defence-in-depth second copy even after Pro (so the only backup is not inside the same vendor that holds production — addressing concentration risk, `05` §5).

- **Database:** scheduled `pg_dump` of the full schema + data (and the `auth` schema) → **encrypt at rest** (e.g. age/gpg with a key held outside Supabase) → store in an **independent** location (a different cloud account / object store / offline media). Frequency must meet the Tier-1 **≤ 24 h** RPO (i.e. at least daily).
- **Storage:** enumerate and download all objects from the 4 buckets (§5) to the same independent encrypted store.
- **Integrity self-check:** after each dump, the dump can be restored into a throwaway Postgres and `verify_integrity(0)` run to confirm the `audit_ledger` chain survives the dump/restore round-trip — making the backup *self-validating*.
- **Honest limitation:** Option B is a **manual/scripted** process for a one-person operator — it is only as good as the cadence actually run and the off-vendor key custody. It does **not** give PITR (RPO is the dump interval, not minutes). It is explicitly the **interim** measure, not the destination.

**Decision record:** the **target is Option A (Pro + PITR) as primary**, with **Option B as the secondary off-vendor copy**. Neither is implemented yet — both are **owner-action B.1**, status ⏳ Open.

### Backup encryption, retention & restricted access (A.8.13 detail)

- **Encryption:** backups inherit Supabase's AES-256-at-rest (Option A) or are explicitly encrypted before leaving Supabase (Option B). Transit is TLS 1.2+ (see `08-cryptography-and-key-management.md`).
- **Retention:** Option A — Supabase Pro default (daily backups; 7-day PITR window). Option B — keep **≥ 7 daily** dumps + **≥ 4 weekly** Storage exports (review at next cycle against the 1 GB tier).
- **Access restriction:** backups (and the Option-B encryption key) are accessible only to the ISMS owner via the Supabase dashboard / off-vendor store. Account-level MFA on the Supabase account (owner-action **B.2**) directly protects the backups — without it, a credential compromise reaches both production *and* the in-vendor backups, which is why B.1 and B.2 are paired.
- **Backup integrity:** verified by the `verify_integrity()` re-walk after restore (§6) — backups are not assumed good; they are proven.

---

## 5. Storage-blob backup (drawings, permit/issue photos, documents)

- **What:** the 4 private buckets — `project-drawings` (drawings/markups, 25 MB cap), `issue-photos` (10 MB, images), `project-si-vo` (SI/VO attachments incl. voice notes, 20 MB), `project-docs` (documents, 20 MB) — all `public = false`, accessed only via short-lived signed URLs (`v8-private-bucket-template.sql`, caps in `v71-storage-bucket-limits.sql`). `photo_metadata` (GPS+timestamp, append-only, `v79-photo-metadata.sql`) is **DB rows** and is covered by the Postgres backup; the **image bytes** are the Storage objects covered here.
- **Why separate:** a Postgres backup (Option A or B) does **not** automatically include Storage object bytes. The DB holds the *references* (paths/metadata); the *bytes* live in the Storage service and must be exported on their own track.
- **How:** Option A — confirm whether Supabase Pro backups include Storage; if not, run the export below. Option B — enumerate each bucket and download all objects (Supabase Storage API / `supabase storage` CLI) to the independent encrypted store, preserving the bucket/path layout so a restore can re-upload to the same keys the DB rows point at.
- **RPO/RTO:** Tier-2 (≤ 7 days RPO / ≤ 72 h RTO). A drawing or photo lost from Storage but still referenced in the DB shows as a broken link; many are re-uploadable from the originating device, which is the practical fallback while the export track is being established.
- **Tier-1 envelope safety:** the per-bucket `file_size_limit` (`v71`) keeps total Storage within the 1 GB Free-tier envelope, which is what makes a full periodic export tractable for a solo operator.

---

## 6. Disaster-recovery restore runbook (step-by-step)

**Roles:** all steps are performed by the **ISMS owner (關進杰)** — there is no second operator (see §9 key-person plan). **Invoke this runbook** when: accidental mass deletion / a destructive migration is detected; `run_integrity_check()` reports `intact: false`; the Supabase project is corrupted or compromised; or a full data-loss event is declared an incident (link to `10-incident-management-plan.md`).

> **Always test before you touch production.** Steps 1–7 are a **non-destructive Supabase *branch* test-restore** — restore into an isolated branch first, verify, and only then (steps 8–9) act on production. Never restore directly over live data as the first move.

### Phase 1 — Declare & assess
1. **Declare the incident** per `10-incident-management-plan.md` (record time, scope, suspected cause, declared RPO target from §3). Stop further writes if a logical-corruption cause is suspected (e.g. temporarily disable the affected client path / pause the project) to prevent the bad state propagating.
2. **Identify the recovery point.** Option A: choose the PITR timestamp (just *before* the corrupting event) or the most recent daily backup. Option B: select the most recent good `pg_dump` + matching Storage export.

### Phase 2 — Non-destructive test-restore (Supabase branch)
3. **Create an isolated Supabase branch** (a Pro/dev feature: a separate Postgres instance seeded from the project) — `create_branch` — so the restore target is **not** production. This is the safety net: a failed or wrong-point restore harms only the branch.
4. **Restore the data into the branch:** Option A — apply the PITR/daily backup to the branch. Option B — `psql`/`pg_restore` the chosen encrypted `pg_dump` into the branch after decrypting it.
5. **Re-apply migrations only if rebuilding from schema-as-code** (worst case, no data backup exists): replay `supabase/v2-*.sql` … `v80-*.sql` in order into the branch to recreate all tables, RLS, RPCs and triggers, then load whatever data is available.
6. **Restore Storage references:** for a data restore, re-upload the Storage export (§5) so object keys match the restored DB rows; verify a sample of signed URLs resolves.

### Phase 3 — Verify on the branch (prove integrity, not just presence)
7. **Verify before promoting:**
   - **Integrity (the load-bearing check):** run `select verify_integrity(0);` (or `select run_integrity_check();`) on the restored branch → expect `{"intact": true, "head_seq": N, "head_hash": ...}`. An `intact: false` / `break_at` result means the restore captured a tampered or partial state — **do not promote**; pick a different recovery point. (Functions: `v51-audit-ledger-tamper-evidence.sql`, `v80-integrity-monitoring-cron.sql`.)
   - **Row-count / spot sanity:** compare counts and a few known records on key Tier-1 tables (`audit_ledger`, `progress_items`, PTW/SI/VO, `user_profiles`) against expectations for the recovery point.
   - **Auth:** confirm `auth.users` restored (a test login resolves) — identity must come back with the data.
   - **RLS smoke test:** as a non-admic test role, confirm cross-tenant isolation still holds (RLS travelled with the restore).

### Phase 4 — Promote to production & close
8. **Promote / cut over.** Option A (PITR): perform the actual production restore to the verified recovery point via the dashboard, **or** repoint the client `VITE_SUPABASE_URL`/key to the validated branch if it becomes the new production (full cloud-rebuild path, `05` §5). Option B: restore the validated dump into the production project. Re-deploy Edge Functions if needed (`supabase functions deploy`).
9. **Re-verify on production** (repeat step 7 on the live project), **re-export a fresh backup immediately**, then **close the incident**: record the actual RPO/RTO achieved, root cause, and corrective actions in `10-incident-management-plan.md`, and log a revision here if the runbook needed changing.

---

## 7. Requirement: evidence ONE test restore (A.8.13 / A.5.30 — mandatory)

ISO/IEC 27001 A.8.13 requires backups to be **tested**, and A.5.30 requires ICT continuity to be **exercised**, not just documented. A backup that has never been restored is an *assumption*, not a control.

**Therefore the ISMS mandates at least ONE evidenced test restore** (Phases 2–3 of §6, on a branch), recorded in the table below. This is **owner-action B.1** in `13-certification-readiness-checklist.md` and is currently **NOT yet done** — it is the gating evidence an auditor will look for in this document.

**Test-restore log (to be populated — REQUIRED before Stage 2 audit):**

| Date | Backup type (PITR / daily / pg_dump) | Recovery point | Method (branch / dump→psql) | RTO achieved | `verify_integrity` result | Evidence (screenshot / log ref) | Performed by | Outcome |
|------|--------------------------------------|----------------|------------------------------|--------------|---------------------------|----------------------------------|--------------|---------|
| ⏳ *pending* | — | — | — | — | — | — | 關進杰 | **NOT YET PERFORMED (B.1)** |

> **Cadence once established:** test-restore **at least annually** (aligned to this document's review date) and **after any change** to the backup strategy or a major schema migration. Each run appends a row above with its evidence reference.

---

## 8. Business-continuity scenarios & availability dependencies (A.5.29 / A.5.30)

| Scenario | Impact | Response | Recovery owner |
|----------|--------|----------|----------------|
| **Supabase outage (platform down)** | Full app unavailable (no data plane). | No CK action recovers it — **inherited from Supabase BCP** (their SOC 2 / ISO 27001 infra, `05` §2.1). Monitor Supabase status; communicate to users. **A.8.14 redundancy is inherited** — CK runs no hot standby (accepted for a micro-entity). | Supabase (inherited) |
| **Logical data disaster** (mass delete / bad migration) | Tier-1 record corrupted/lost. | **Run §6 restore runbook.** Detectability aided by `run_integrity_check()` daily log (`v80`). **This is the scenario B.1 exists to make survivable.** | 關進杰 |
| **Supabase account compromise** | Attacker reaches production *and* in-vendor backups. | Account MFA (**B.2**) is the primary preventive; off-vendor Option-B copy (§4) is the recovery of last resort; `audit_ledger` makes tampering detectable. Treat as a security incident (`10`). | 關進杰 |
| **Storage blob loss** | Drawings/photos missing; DB intact. | Restore from Storage export (§5); re-upload from source devices where possible. | 關進杰 |
| **Client/release pipeline loss** (GitHub/Codemagic/Apple account) | Cannot ship updates; **live app keeps running** (data plane unaffected). | Rebuild from local repo clones; re-establish CI/signing. Supply-chain integrity + account MFA tracked in `05` §2.3–2.4 and B.2. | 關進杰 |
| **AI 站長 provider outage** (OpenRouter/Anthropic→kimi-k2) | AI assistant only. | **Zero core impact** — disable the module (v59) per project; data plane and audit trail unaffected (`05` §2.5). | 關進杰 |
| **Key-person unavailability** (founder incapacitated) | No operator. | See §9. | — |

**Availability dependencies the plan relies on:** Supabase (Tier-1, no CK-side redundancy — inherited A.8.14); GitHub (source); Codemagic + Apple/Play (release). These are enumerated with criticality tiers in `05-supplier-and-cloud-register.md`.

---

## 9. Single-operator / key-person continuity (honest)

CK is a **one-person organisation**; 關進杰 is the sole operator, ISMS owner, and the only holder of the production credentials. This is a genuine continuity risk that the standard expects to be **stated, not hidden**:

- **Bus-factor = 1.** There is no second operator who can run the §6 runbook. **Mitigation:** all recovery knowledge is documented *in this runbook* (executable by a competent successor with credential access), all logic is schema-as-code in the repo, and the data is recoverable via vendor-supported PITR (once B.1 is done) rather than tacit knowledge.
- **Credential escrow (recommended, owner-action):** store the Supabase / Apple / GitHub / Codemagic recovery credentials and the Option-B backup-encryption key in a sealed, access-controlled escrow (e.g. a password manager with an emergency-access delegate / a legal escrow) so the business can be recovered if the founder is unavailable. *Currently not in place — flagged here as a continuity action.*
- **Scaling on first hire:** segregation of duties and a named deputy recovery operator become full controls when CK hires (consistent with `02-roles-and-responsibilities.md`).

---

## 10. Honest gap summary & owner actions

| # | Gap | Control | Status | Action ref |
|---|-----|---------|:------:|------------|
| 1 | **No managed backup / PITR on Free tier; data + Storage not independently backed up** — the single most material technical continuity risk. | A.8.13 / A.5.30 | ⚠️ **Open — high priority** | **B.1** (`13` checklist) |
| 2 | **No test restore has ever been performed/evidenced** (§7) — backup is untested = assumption, not control. | A.8.13 | ⚠️ **Open** | **B.1** |
| 3 | **Storage-blob export track not established** (§5). | A.8.13 | ⚠️ Open | **B.1** |
| 4 | **Account MFA on the Supabase account** protects the backups; not yet evidenced. | A.8.2 / A.8.5 | ⚠️ Open | **B.2** |
| 5 | **No off-vendor (independent) backup copy** — concentration on Supabase. | A.8.13 / A.8.14 | ⚠️ Open (Option B addresses) | **B.1** |
| 6 | **No credential escrow / named recovery delegate** for key-person continuity (§9). | A.5.29 | ⚠️ Open | this doc §9 |

**What is genuinely sound today (do not understate either):** schema/logic/client are fully version-controlled and rebuildable; the `audit_ledger` hash chain makes any restored data **provably intact-or-not** via `verify_integrity()` / the daily `run_integrity_check()` cron (`v80`); Storage is size/MIME-capped (`v71`) keeping a future export tractable; and Supabase's certified infrastructure (`05` §2.1) provides the inherited platform-level durability/BCP that CK builds on. **The recovery *capability* is the gap, not the recovery *knowledge* — this runbook plus B.1 closes it.**

---

## Revision history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial issue. RTO/RPO by asset tier; honest Free-tier no-PITR baseline; required backup strategy (Option A Pro+PITR / Option B encrypted pg_dump+Storage export); Storage-blob backup track; step-by-step branch-first restore runbook with `verify_integrity` gate; mandatory one-test-restore evidence requirement; BCP scenarios + single-operator key-person plan. Grounded in live CK evidence (`supabase/v51`, `v71`, `v79`, `v80`, `v8-private-bucket-template.sql`, `codemagic.yaml`) and cross-referenced to `13-certification-readiness-checklist.md` (B.1/B.2) and `05-supplier-and-cloud-register.md`. |

*Maintained by 關進杰. Next review: 2027-06-18 or on material backup/continuity change. This document is part of the ISO/IEC 27001:2022 ISMS pack — see `README.md`; in the pack index this content corresponds to the "09 — Backup & business continuity" entry (A.8.13 / A.5.29–A.5.30).*
