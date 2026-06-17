# Logging & Monitoring Policy

**CK工程 / CK Construction — Information Security Management System (ISMS)**

| Field | Value |
|---|---|
| Document ID | ISMS-12 |
| Title | Logging & Monitoring Policy |
| Annex A controls | A.8.15 Logging · A.8.16 Monitoring activities · A.5.28 Collection of evidence |
| Document Owner | 關進杰 (Kwan Chun Kit) — ISMS Owner & Top Management |
| Version | 1.0 |
| Date issued | 2026-06-18 |
| Next review | 2027-06-18 (or on any material change to the logging architecture) |
| Classification | Internal |

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 | Initial issue. Grounded in live CK Supabase schema (`audit_ledger` v51, v70 watch-list extension, v80 cron migration) and Edge Function source. Honest gap disclosure for deferred anomaly cron, OFF enforcement flags, and Free-tier backup. |

---

## 1. Purpose & scope

This policy defines what CK工程 logs, why, where the logs live, how long they are
kept, who reviews them and how often, and how logs are protected so they can serve
as **evidence in a construction dispute** — which is the product's core value
proposition (a shared audit trail that survives disputes).

It is deliberately CK-specific. CK is a **two-tier architecture** (React 18 SPA ↔
Supabase) operated by a **single founder/operator** (關進杰), who is simultaneously
top management, the ISMS owner and the only administrator. There is **no application
server and no self-hosted infrastructure** to log — the logging surface is:

1. The **application database layer** (Postgres triggers, RPCs) — CK's own code.
2. The **Supabase managed platform** (GoTrue Auth logs, Postgres logs, Edge
   Function logs, Storage access) — a sub-processor with its own ISO 27001 / SOC 2.
3. A small number of **Edge Functions** (Deno) that hold privileged secrets.

Scope covers all of the above. It does **not** cover end-user device logs (out of
CK's control) or sub-processor-internal logs that CK cannot access (e.g. OneSignal,
Apple, Codemagic internal telemetry).

---

## 2. Logging principles (A.8.15)

1. **Tamper-evidence over volume.** CK's primary log is not a verbose firehose; it
   is a small, cryptographically chained ledger of *security- and dispute-critical*
   events. The design goal is that any alteration of a past record is **detectable**,
   not that every byte is recorded.
2. **No secrets in logs.** Passwords, tokens and the `service_role` key are never
   written to any log. This is enforced in code (see §6).
3. **Defence-in-depth applies to logs too.** Application logs are written by
   `SECURITY DEFINER` triggers with `set search_path = public, extensions`
   (`supabase/v51-audit-ledger-tamper-evidence.sql:44,58`) and are unreadable by
   clients except through gated RPCs.
4. **Honesty in coverage.** Where a control is written but not yet verified-applied,
   or a flag is OFF, this policy says so (§9). An auditor reads this document; it
   does not claim controls that are not live.

---

## 3. The audit ledger — primary integrity log (A.8.15, A.5.28)

### 3.1 What it is

CK's authoritative security log is the **tamper-evident `audit_ledger`**, introduced
in `supabase/v51-audit-ledger-tamper-evidence.sql`. It is an **append-only,
SHA-256 hash-chained** table: every watched INSERT / UPDATE / DELETE appends a row
whose `hash` is `sha256(this row's canonical fields + the PREVIOUS row's hash)`
(`v51:30-32,76-82`). Altering or deleting any past record — *even via the Supabase
dashboard or the `service_role` key, because AFTER triggers fire regardless of RLS*
— breaks the chain and is detected by `verify_integrity()`.

Schema (`v51:22-32`):

| Column | Meaning |
|---|---|
| `seq` | monotonic identity PK |
| `occurred_at` | `clock_timestamp()` at write, normalised to UTC in the hash |
| `actor_id` | `auth.uid()` at write time (`null` = service role / system) |
| `table_name`, `row_pk`, `action` | what changed |
| `payload` | NEW row image (I/U) or OLD (D), canonical `jsonb::text` |
| `prev_hash`, `hash` | the chain link |

**Determinism** (so re-verification is reproducible): the hash input uses
`occurred_at AT TIME ZONE 'UTC'` and canonical `jsonb::text` key order
(`v51:39-53`), and `pgcrypto.digest` is pinned to the `extensions` schema.

### 3.2 Immutability

The ledger is genuinely append-only. A `BEFORE UPDATE OR DELETE` trigger
(`trg_audit_ledger_immutable`, `v51:95-98`) **raises** on any attempt to modify or
delete a ledger row (`審計帳本唯讀，不可修改或刪除`). RLS has **no policies** →
all direct client SELECT/INSERT/UPDATE/DELETE is denied; INSERT/UPDATE/DELETE are
additionally `REVOKE`d from `authenticated, anon` (`v51:33-35`). The ledger is only
*read* through the two gated RPCs below.

### 3.3 What it covers

Append triggers (`trg_audit_ledger`, calling `audit_ledger_append()`) are attached
to the dispute- and security-critical tables. The watch-list is the union of:

- **v51 core (13 tables):** `approvals`, `site_instructions`, `si_versions`,
  `variation_orders`, `vo_versions`, `permits_to_work`, `ptw_versions`,
  `permit_signoffs`, `documents`, `document_versions`, `document_events`,
  `progress_history`, `project_members`, `user_profiles` (`v51:104-109`).
- **v70 dispute extension (6 tables):** `issues`, `issue_comments`, `dailies`,
  `materials`, `drawings`, `drawing_versions` — added because these are "the most
  litigable WhatsApp-replacement records" and an admin DELETE cascade was previously
  silent (`supabase/v70-audit-ledger-extend.sql:24-31`).
- The live set has additionally **drifted** to include `ai_actions` (the AI 站長
  tool-call log), recorded in source as verified-live 2026-06-16
  (`v70:13-18`). v70 is deliberately **additive-only** and never re-emits the full
  list, precisely so it does not silently drop `ai_actions` or the v55 forms tables.

> **Operational consequence:** the authoritative watch-list lives in the **database,
> not in any single SQL file**. The required coverage check (run by execution, per
> CK's verify-by-execution convention — see MEMORY `supabase-migration-apply`) is in
> `v70:36-50`: query `pg_trigger` for any canonical table missing `trg_audit_ledger`;
> expect 0 rows.

### 3.4 Verification & evidence export (A.5.28)

Two RPCs turn the ledger into court-usable evidence:

- **`verify_integrity(p_from bigint default 0)`** (`v51:121-162`) — walks the chain
  from `p_from`, recomputes every hash, and returns the **first break** if any:
  `{"intact": false, "break_at": <seq>, "reason": "hash mismatch (row altered)" | "prev_hash mismatch"}`,
  or on success `{"intact": true, "head_seq", "head_hash", "verified_at", "count"}`.
  It returns **metadata only, never payloads**. It raises if `auth.uid()` is null
  (`v51:135`) and is granted to any `authenticated` user — this is the deliberate
  "prove it's intact" affordance, revealing integrity status only, no record content.

- **`export_ledger_proof()`** (`v51:166-187`) — **admin-only** (`只有管理員可匯出完整證明`,
  `v51:172-174`). Emits a third-party-verifiable certificate: `generated_at`, the full
  `verify_integrity(0)` result, and the complete `chain` of `{seq, at, table, action,
  row, hash}` (hashes, **not** payloads) so the chain can be re-verified offline.

These two RPCs are the **evidence-collection mechanism** for A.5.28: in a dispute,
關進杰 exports the proof certificate and `verify_integrity()` demonstrates that the
instruction / permit / progress history presented has not been altered since it was
recorded.

---

## 4. Application-event logs (in addition to the ledger)

Beyond the integrity ledger, the application records purpose-specific operational
logs that are themselves *inside* the ledger watch-list where they are dispute-relevant:

- **AI 站長 action log — `ai_actions`** (`supabase/v56-ai-assistant.sql:46-60`):
  every AI tool call records `user_id`, `project_id`, `tool_name`, `args`,
  `args_hash`, `risk` (`low|medium|high|destructive`), `status`
  (`proposed|confirmed|executed|declined|failed`), `result`, `model`, `created_at`,
  `executed_at`. This is the accountability trail for AI-initiated changes and is now
  itself ledger-watched (§3.3).
- **Signature non-repudiation proof — `sign_reauth_grants`** (`supabase/v60-sign-reauth.sql:41-49`):
  records the fresh-password "re-auth" moment bound to a signing event; readable only
  by its own subject via RLS (`sign_reauth_grants_select_own`, `v60:48-49`).
  `get_signature_proof(p_kind, p_id)` (`v60:251`, admin/member-gated, granted to
  `authenticated` at `v60:358`) emits the `本人` signature certificate.
- **Integrity-monitoring log — `integrity_check_log`** (`supabase/v80-integrity-monitoring-cron.sql:20-25`):
  append-only history of scheduled integrity checks (see §5). Admin-read only;
  client writes revoked (`v80:29-32`).

---

## 5. Monitoring activities (A.8.16)

### 5.1 Current state — on-demand only

Today, integrity monitoring is **manual / on-demand**: `verify_integrity()` is run
by 關進杰 (e.g. from the SQL editor or the admin UI) when needed. There is **no
scheduled, automatic detection** of a broken chain in the live environment yet.
This is an honest, known gap (§9).

### 5.2 Required action — daily anomaly cron (DEFERRED, must deploy)

Migration `supabase/v80-integrity-monitoring-cron.sql` is **written** to close this
gap and is the **required action** under this policy. It:

1. Adds `run_integrity_check()` (`v80:36-85`) — a **system-context** twin of
   `verify_integrity()` that performs the same walk-and-recompute but **without the
   `auth.uid()` gate**, because `pg_cron` carries no JWT (`v80:8-12`). It records the
   verdict to `integrity_check_log` and is `REVOKE`d from all roles (`v80:86`).
2. Schedules it **daily at 02:00 HKT (18:00 UTC)** via `pg_cron`
   (`cron.schedule('integrity-daily-check', '0 18 * * *', ...)`, `v80:88-95`).
3. The alert signal is any `integrity_check_log` row with **`intact = false`**; the
   migration header notes a future hook can fan this to push via the existing
   `push_dispatcher` (`v80:10-12`).

> **Status: DEFERRED — NOT yet verified-applied/scheduled in the live DB.** Per CK's
> verify-by-execution rule, this migration is only "done" once executed against the
> live instance and confirmed by `select * from cron.job where jobname =
> 'integrity-daily-check'` returning a row and `run_integrity_check()` inserting an
> `intact=true` row (`v80:97-98`). Until then, treat §5.1 (manual checks) as the
> operative control. Tracked in the certification-readiness checklist as: *"Deploy &
> verify v80 integrity-daily-check cron; wire intact=false → admin push alert."*
>
> **Interim compensating control:** 關進杰 SHALL run `verify_integrity(0)` manually
> **at least weekly** and after every batch of migrations, recording the
> `head_seq`/`head_hash` (see §8 review cadence) until the cron is live.

### 5.3 What "monitoring" practically means for a one-person operation

Given a single operator, A.8.16 is satisfied by (a) the daily automated integrity
check above once deployed, plus (b) periodic human review of the platform logs in §6
and (c) acting on Supabase Security Advisor / Postgres advisor findings.

---

## 6. Supabase platform logs (auth, admin, data, function events)

CK relies on the **Supabase managed platform** for auth and infrastructure logging.
These logs are produced and retained by the sub-processor, accessed by 關進杰 via the
Supabase dashboard, and exported periodically (see §6.3):

| Log source | Captures | Where |
|---|---|---|
| **GoTrue Auth logs** | sign-in / sign-up / password-grant / sign-out events; failed logins; account deletions (`delete_my_account()` hard-deletes `auth.users`). Auth uses phone+password via synthetic `<digits>@phone.local`; bcrypt; **the app never stores passwords**. | Supabase Dashboard → Authentication / Logs |
| **Postgres logs** | DB errors, slow queries, role/grant changes | Supabase Dashboard → Logs → Postgres |
| **Edge Function logs** | invocation + `console.error` lines from `verify-sign-password`, `ai-assistant`, `weather-sync`, `build-memory-graph` | Supabase Dashboard → Edge Functions → Logs |
| **Storage access** | object access on the private buckets (`public = false`, short-lived signed URLs) | Supabase Dashboard → Storage / Logs |

### 6.1 Secrets are never logged

Verified in source:

- `verify-sign-password/index.ts` verifies the supplied password against GoTrue and
  **never logs, echoes, stores or returns it** (`index.ts:19-20,70-72`); on a
  network/GoTrue failure it logs only the failure message, never the password
  (`index.ts:84-85`). It mints no session from the check.
- The **`service_role` key exists only in Edge Functions** (`Deno.env`) and is
  **never present in client code** — confirmed: a `Grep` for `service_role` across
  `src/` returns **no files**. The browser/native client uses only the `anon` key.

### 6.2 Retention (platform-determined — a Free-tier constraint)

CK runs on the **Supabase Free tier**, which sets log retention to roughly **1 day**
for the dashboard log views and provides **no managed PITR / daily DB backup**. This
materially constrains how far back platform auth/admin events can be inspected and is
an honest limitation of the current plan (§9). The hash-chained `audit_ledger`
(§3) is **not** subject to this short window — it is application data and persists
for the life of the database — which is *why* CK's dispute-survival evidence lives in
the ledger, not in platform logs.

### 6.3 Required action — periodic export of platform logs

Because Free-tier platform log retention is short, 關進杰 **SHALL export** the
relevant platform logs on a regular cadence (§8) and store the export in CK's
controlled-document store, so that auth/admin events older than the retention window
remain available for incident investigation and audit. Suggested export scope:
Auth logs (sign-ins, failed logins, deletions), Postgres role/grant changes, and
Edge Function error logs.

---

## 7. Log retention requirements

| Log class | Source | Retention requirement | Basis / note |
|---|---|---|---|
| **Audit ledger** (`audit_ledger`) | Application (Postgres) | **Indefinite** — never deleted; append-only by design | Dispute-survival evidence (A.5.28); immutability enforced (`v51:95-98`) |
| **Integrity-check log** (`integrity_check_log`) | Application (Postgres, v80) | **Indefinite** — append-only | Monitoring evidence (A.8.16) |
| **AI action log** (`ai_actions`) | Application (Postgres) | Retain for the life of the project / its parent records | Accountability for AI changes; ledger-watched |
| **Signature-proof grants** (`sign_reauth_grants`) | Application (Postgres) | Retain for the life of the signed record | Non-repudiation evidence |
| **Platform auth / admin / DB / function logs** | Supabase platform | Platform default (~1 day on Free tier); **exported snapshots retained ≥ 12 months** in CK's document store | A.8.15; export compensates for short platform window (§6.3) |

PDPO note (個人資料（私隱）條例): logs that contain personal data (phone numbers,
`actor_id`/`user_id`) are subject to the Data Protection Principles. They are
collected for the security and dispute-evidence purposes stated here (DPP1/DPP3),
access-controlled (RLS + admin-only export, DPP4), and retained no longer than
necessary for those purposes — with the **deliberate exception** of the immutable
audit ledger, whose evidential value requires permanent retention; this is disclosed
to data subjects via the Privacy Policy. Account deletion hard-deletes `auth.users`
while authored-content FKs are set null to **preserve the audit trail** (Apple-reviewed
`delete_my_account()`).

---

## 8. Review cadence (A.8.16)

| Activity | Frequency | Owner | Evidence produced |
|---|---|---|---|
| Automated integrity check (`run_integrity_check`) | **Daily 02:00 HKT** — *once v80 deployed* | System (pg_cron) | `integrity_check_log` row |
| **Interim** manual `verify_integrity(0)` | **Weekly + after every migration batch** until cron is live | 關進杰 | Recorded `head_seq` / `head_hash` |
| Review `integrity_check_log` for `intact=false` | **Daily** glance / on alert | 關進杰 | Review note; incident if `false` |
| Export & file platform auth/admin logs (§6.3) | **Monthly** | 關進杰 | Archived log export |
| Review Supabase Security Advisor + Postgres advisor | **Monthly** | 關進杰 | Advisor screenshot / note |
| Review GoTrue logs for anomalous failed-login spikes | **Monthly** | 關進杰 | Review note |
| Policy review | **Annual** (next 2027-06-18) | 關進杰 | Revised document |

Any `verify_integrity` / `run_integrity_check` result of `intact = false` is a
**security incident** and triggers the Incident Management Procedure: the
`break_at` seq and `reason` are recorded, the affected record investigated, and
`export_ledger_proof()` captured immediately to freeze the state.

---

## 9. Known gaps & honest limitations (read with the certification-readiness checklist)

The following are **not yet implemented or not yet evidenced** and are tracked in the
ISMS certification-readiness checklist. They are stated plainly for the auditor:

1. **Anomaly cron deferred.** v80 (`integrity-daily-check`) is written in source but
   **not verified-applied/scheduled** in the live DB. The alert hook (intact=false →
   push) is described but not yet built (`v80:10-12`). Interim control: weekly manual
   `verify_integrity` (§5.2).
2. **Free-tier backup gap.** No managed PITR or daily DB backup; short platform log
   retention (§6.2). Mitigated for evidence by the permanent audit ledger, but a
   full-DB-loss scenario is not yet covered by an automated backup — a separate
   Backup/Restore item.
3. **MFA enforcement OFF.** Step-up TOTP / AAL2 (v52–54) and sign-time password
   re-auth (v60) are coded and the UIs ship with the 1.5 build, but the enforcement
   flags `step_up_enforced` and `sign_reauth_enforced` are **currently OFF**; they
   are to be flipped after 1.5 is live on both stores. Until then, high-risk RPCs and
   signing log the action but do not *require* the step-up.
4. **Account-level MFA not evidenced.** MFA on the underlying Supabase, Apple,
   GitHub and Codemagic admin accounts is not yet documented/evidenced — relevant
   because those consoles can read the platform logs and the `service_role` key.
5. **No signed Supabase DPA on file.** Supabase publishes a DPA + SOC 2 + ISO 27001,
   but a CK-countersigned DPA is not yet filed.
6. **No CI dependency-vulnerability gate.** Codemagic builds do not yet fail on a
   known-vulnerable dependency; this affects the integrity of the build that produces
   the logging code.

Each item above has a corresponding remediation entry in the certification-readiness
checklist; none is claimed as a live control in this policy.

---

## 10. Roles & responsibilities

As a sole-operator organisation, 關進杰 holds every role below; the separation is
**logical** (a future-hire delegation map), not yet a segregation of duties:

- **ISMS Owner / Top Management** — approves this policy, owns the gap remediation.
- **Log Administrator** — runs/reviews `verify_integrity`, exports platform logs,
  responds to `intact=false`.
- **Privileged-secret custodian** — sole holder of admin console credentials and the
  `service_role` key (Edge Function env only).

---

*End of document. Cited evidence: `supabase/v51-audit-ledger-tamper-evidence.sql`,
`supabase/v70-audit-ledger-extend.sql`, `supabase/v80-integrity-monitoring-cron.sql`,
`supabase/v56-ai-assistant.sql`, `supabase/v60-sign-reauth.sql`,
`supabase/functions/verify-sign-password/index.ts`. Live watch-list and cron state to
be confirmed by execution per CK's verify-by-execution convention.*
