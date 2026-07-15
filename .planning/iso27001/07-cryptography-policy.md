# Cryptography Policy (A.8.24)

**CK工程 / CK Construction — Information Security Management System (ISMS)**

| Field | Value |
|---|---|
| Document ID | ISMS-07 |
| Annex A control | A.8.24 — Use of cryptography |
| Document Owner | 關進杰 (Kwan Chun Kit) — Sole Founder/Operator, Top Management & ISMS Owner |
| Version | 1.0 |
| Date issued | 2026-06-18 |
| Next review | 2027-06-18 (or on material change to the crypto stack, sub-processors, or a security incident involving keys) |
| Classification | Internal |
| Related documents | ISMS Access Control Policy (A.8.2/A.8.3), Supplier/Sub-processor Register (A.5.19–A.5.22), Information Backup Policy (A.8.13), Certification-Readiness Checklist / Statement of Applicability |

**Revision history**

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 | Initial issue. Grounded in the live CK codebase (`supabase/`, `src/`) as of git `e8b2a3a`. |

---

## 1. Purpose

This policy defines how CK工程 selects, uses, and governs cryptographic controls to protect the confidentiality, integrity, authenticity, and non-repudiation of information across the CK Construction product (iOS App Store + Android via Capacitor 8; React 18 + TypeScript web front-end; Supabase back-end).

It states honestly **what CK implements today**, **what is built but not yet enforced**, and **what remains a gap**, so that an auditor can rely on it without re-deriving the truth from source. Every non-trivial claim cites a real file, RPC, table, or migration.

## 2. Scope

Applies to all CK information assets and processing: the Supabase managed back-end (Postgres + Row-Level Security, GoTrue Auth, Storage, Realtime, Edge Functions) at `https://syyntodkvexkbpjrskjj.supabase.co`, the client app bundle, build/distribution pipelines, and all sub-processors that handle CK or customer data.

CK is a **two-tier architecture (React SPA ↔ Supabase)** with no self-hosted application server. Consequently CK **relies on the Supabase platform for the bulk of cryptographic primitives** (transport encryption, encryption at rest, password hashing, signed-URL minting) and implements a **thin application-layer crypto surface** (a SHA-256 audit hash-chain and per-record QR HMAC secrets). This division of responsibility is the backbone of this policy.

## 3. Policy principles

1. **Use proven platform primitives; do not roll our own crypto.** App-layer cryptography is limited to integrity/authenticity use cases (hash-chaining, secret tokens). CK does **not** implement its own confidentiality encryption — confidentiality at rest and in transit is delegated to Supabase (see §5).
2. **Right primitive for the right property.** Hashing (SHA-256) is used for *integrity/non-repudiation evidence only — never as a confidentiality control* (§6.1). Passwords use a slow adaptive hash (bcrypt via GoTrue), never SHA-256.
3. **Least-privilege key custody.** The Supabase `service_role` key, which bypasses RLS, exists **only** in server-side Edge Functions (`Deno.env`) and never reaches the client (§7.1).
4. **Defence in depth.** Cryptographic controls sit alongside, not instead of, RLS and RBAC enforced in **both** client and database.
5. **Honesty over completeness.** Partial or flag-gated controls are labelled as such and tracked in the Certification-Readiness Checklist.

## 4. Approved algorithms and parameters

Only the following are approved for use in CK. Anything not listed requires ISMS Owner approval and a revision of this document.

| Purpose | Algorithm / parameter | Where | Provider |
|---|---|---|---|
| Encryption in transit | TLS 1.2+ (HTTPS / WSS) | All client↔Supabase, client↔OneSignal, Edge↔OpenRouter traffic | Supabase / sub-processor platforms |
| Encryption at rest | AES-256 | Postgres data + Storage objects | Supabase platform (disk-level) |
| Password storage | bcrypt (adaptive, salted) | GoTrue `auth.users.encrypted_password` | Supabase GoTrue |
| Audit integrity / non-repudiation | SHA-256 hash chain (`extensions.digest(..., 'sha256')`) | `audit_ledger` (`supabase/v51-audit-ledger-tamper-evidence.sql:76`) | App-layer (pgcrypto) |
| Per-record token secrets | 256-bit CSPRNG (`gen_random_bytes(32)`, hex-encoded) | PTW QR / equipment QR secrets | App-layer (pgcrypto) |
| Signed-URL signing | HMAC (Supabase Storage internal) | Private bucket access URLs | Supabase Storage |
| Session / MFA tokens | JWT (GoTrue), TOTP (Supabase native MFA) | Auth sessions, AAL2 step-up | Supabase GoTrue |

**Prohibited:** MD5, SHA-1, and DES/3DES for any new security purpose; bespoke "encryption"; SHA-256 (or any fast hash) for password storage; embedding the `service_role` key or any long-lived secret in client-shipped code.

> Note: `md5()` appears once as a **non-security fallback** for an audit-ledger row primary-key derivation when a row has no `id`/`seq`/`number` (`supabase/v51-...:72`). This is an identifier convenience, not a security primitive, and is acceptable.

## 5. Platform cryptography (delegated to Supabase)

CK's confidentiality posture is inherited from the Supabase managed platform.

- **In transit — TLS 1.2+.** All traffic to Supabase (REST/PostgREST, GoTrue Auth, Storage, Realtime WSS, Edge Functions) is HTTPS/WSS. The singleton client enforces a 15 s `fetchWithTimeout` over HTTPS (`src/lib/supabase.ts`). Edge Functions call GoTrue and OpenRouter over HTTPS only.
- **At rest — AES-256.** Postgres data files and Storage objects are encrypted at rest by the Supabase platform (AES-256, platform-managed keys). CK does **not** hold or manage the disk-encryption keys — this is a platform responsibility documented in Supabase's SOC 2 / ISO 27001 attestations (see §8 and the Sub-processor Register).
- **Passwords — bcrypt.** CK uses **phone+password authentication via a synthetic email** (`<digits>@phone.local`; `src/lib/phone.ts` `phoneToEmail`, `src/contexts/AuthContext.tsx:113,154`). Passwords are submitted to GoTrue `signUp` / `signInWithPassword` and stored only as a bcrypt hash in `auth.users`. **The CK application never stores, logs, or transmits the password to any CK-controlled store** — it goes directly to GoTrue over TLS. Auth failures are deliberately mapped to a generic `手機號或密碼錯誤` to avoid user enumeration (`AuthContext`).

**Assurance basis:** these properties are contractual/attested platform features of Supabase, not independently re-implemented by CK. CK's assurance is therefore only as strong as the Supabase attestation — see the gap in §8 (no signed Supabase DPA currently on file).

## 6. Application-layer cryptography (implemented by CK)

### 6.1 Audit integrity hash-chain (SHA-256) — integrity & non-repudiation, NOT confidentiality

The tamper-evident audit ledger (`supabase/v51-audit-ledger-tamper-evidence.sql`) is CK's principal app-layer cryptographic control.

- **Construction.** `audit_ledger` is an append-only table. Each row stores `hash = SHA-256(canonical(row fields) || prev_hash)` — a linked hash chain (`v51:76-79`). The canonical input is deterministic: UTC-normalised timestamp + `jsonb::text` (canonical key order), so the same logical row always hashes identically (`audit_ledger_canon`, `v51:39-53`; determinism note `v51:15-16`).
- **Coverage.** `AFTER INSERT/UPDATE/DELETE` triggers append a ledger row for every change on **13 critical tables** (`audit_ledger_append`, `v51:56-86`). Triggers fire regardless of RLS, so even a `service_role` / dashboard edit is recorded.
- **Immutability.** A `BEFORE UPDATE OR DELETE` trigger on the ledger itself raises an exception (`audit_ledger_immutable`, `v51:88-98`), and the table grants `revoke insert, update, delete ... from authenticated, anon` with no RLS policy (`v51:33-35`) — direct client access is denied; reads occur only through gated RPCs.
- **Verification & export.** `verify_integrity()` re-walks and re-hashes the chain to detect any break; `export_ledger_proof()` produces a portable proof. Both are auth-gated RPCs.
- **EXPLICIT SCOPE — this is integrity/non-repudiation, NOT confidentiality.** The hash chain proves that records have **not been altered or deleted**; it does **not** encrypt or hide any data. Confidentiality of the underlying records is provided by RLS + TLS + at-rest AES (§5), not by the hash chain. The migration itself states the honest boundary: "tamper-EVIDENT, not tamper-impossible. A Postgres superuser could disable a trigger to write unlogged, but cannot edit a PAST ledger row without breaking the chain" (`v51:13-15`).

**Scheduled monitoring — IMPLEMENTED.** `verify_integrity()` raises when `auth.uid()` is null and so cannot be called by `pg_cron`. `supabase/v80-integrity-monitoring-cron.sql` adds a system-context `run_integrity_check()` (same chain walk, no auth gate, `SECURITY DEFINER`, `revoke ... from public/authenticated/anon`, `v80:36-86`) that logs the verdict to an append-only `integrity_check_log` (admin-read only, `v80:20-32`) and is scheduled daily at 02:00 HKT via `cron.schedule('integrity-daily-check', '0 18 * * *', ...)` (`v80:95`).

> **Auditor note / correction to prior assessment:** an earlier ISMS draft listed "scheduled integrity verification" as a deferred gap. The cron migration (`v80`) now exists in the repository. Its **applied-and-running** status on the live project must be confirmed by *execution* (per CK's verify-by-execution practice: `select * from cron.job where jobname='integrity-daily-check'` and a recent `integrity_check_log` row with `intact=true`), since CK applies migrations manually via the Supabase SQL editor. Until that execution evidence is filed, treat scheduled monitoring as **implemented in code, pending live-apply confirmation** (Certification-Readiness Checklist item).

### 6.2 Signed-URL TTLs for private blobs

Drawings, documents, PTW evidence, SI photos, and issue photos live in **private** Storage buckets and are served only through short-lived signed URLs (HMAC-signed by Supabase Storage):

| Asset | Bucket | TTL | Evidence |
|---|---|---|---|
| Drawing versions | `project-drawings` | 3600 s (1 h) | `src/contexts/DrawingsContext.tsx:22,415` |
| Documents | `project-docs` | 3600 s | `src/contexts/DocumentsContext.tsx:22,555` |
| Drawing in export | `project-drawings` | 300 s | `src/lib/export.ts:883` |
| PTW evidence | (PTW bucket) | 900 s default | `src/lib/ptw.ts:80-83` |
| SI photos | (SI bucket) | 3600 s default | `src/lib/si.ts:52-53` |
| Issue photos | `issue-photos` | 3600 s | `src/lib/issuePhotos.ts:12,29` |

Buckets are created with `public=false` (`project-docs`: `supabase/v40-split/5-storage-bucket.sql:19-20`). Server-side file-size limits were added in `supabase/v71-storage-bucket-limits.sql`.

**Honest exception — `issue-photos` bucket flip is staged.** `issue-photos` was originally created **public** (`supabase/v4-issues-schema.sql:126-127`, `public=true`). `supabase/v74-issue-photos-private.sql` flips it to `public=false` with an **authenticated-read** policy and a signed-URL client shim. This migration is **staged** ("⚠️ DO NOT APPLY until the signed-URL read shim is LIVE in clients", `v74:4-10`) and is web-deploy-gated. Two caveats an auditor must record:
1. The private flip is only safe after the client shim ships; until the flip is confirmed applied **by execution** (`select public from storage.buckets where id='issue-photos'` → `false`), legacy issue photos may remain world-readable by guessable URL.
2. Even once private, the policy grants **authenticated-read across the bucket**, not per-project scoping, because object paths (`<uploaderId>/<file>`) do not encode the project (`v74:17-22`). Per-project tightening is a documented deferred item (FINAL-UPGRADE-PLAN R-notes). This is an access-control nuance, not a crypto failure, but it bounds what the signed-URL control achieves.

### 6.3 Per-record secret tokens (CSPRNG)

QR-based sign-off / equipment flows use cryptographically random 256-bit secrets, hex-encoded:
- Equipment QR secret: `encode(extensions.gen_random_bytes(32), 'hex')` (`supabase/v55c-equipment-qr.sql:17`).
- PTW QR secret seeding documented in `supabase/v10-ptw-schema.sql:77`.

These are generated by pgcrypto's CSPRNG, stored server-side (not client-derivable), and used as bearer secrets/HMAC keys for QR validation.

### 6.4 Non-repudiation: sign-time password re-auth

For dispute survival (e.g. a 勞工處 / Labour Department challenge), CK can require a **fresh password re-authentication at the moment of signing**:
- The `verify-sign-password` Edge Function verifies the supplied password against GoTrue `/auth/v1/token?grant_type=password` **without minting a session**, then mints a 5-minute `sign_reauth_grants` row using the `service_role` (`supabase/functions/verify-sign-password/index.ts:73-105`).
- **The password is never logged, echoed, stored, or returned** — only the 200/4xx outcome is read, and any returned tokens are discarded (`index.ts:19-21,80-82`).
- `get_signature_proof(p_kind, p_id)` (`supabase/v60-sign-reauth.sql:251`) exports a portable signature-proof certificate.

**Status — built, enforcement OFF.** Enforcement is gated behind `get_sign_reauth_enforced()`, currently **OFF by default** (`verify-sign-password/README.md:11`). The UI (`SignReauthContext`) ships with the 1.5 build; the flag is to be flipped after 1.5 is live on both stores.

### 6.5 Step-up MFA (AAL2)

Supabase native TOTP MFA backs an application-layer step-up grant on ~12 high-risk RPCs: `mint_step_up_grant(action_class)` requires a fresh AAL2 session; `assert_step_up(action_class)` enforces a live grant at the top of each protected RPC (`supabase/v52-step-up-foundation.sql:48-100`; both `SECURITY DEFINER ... set search_path = public`).

**Status — built, enforcement OFF.** `assert_step_up` is gated behind `app_config.step_up_enforced`, `DEFAULT FALSE` — while OFF it is a **no-op** so existing pre-step-up clients are not locked out (`supabase/v54-step-up-rollout-flag.sql:19,31-33`). The UI (`StepUpContext`) ships with 1.5; the flag is to be flipped after 1.5 is live on both stores.

## 7. Key and secret management

### 7.1 Key custody and least privilege

- **Platform-held encryption keys.** Disk/at-rest AES-256 keys and TLS certificates are **held and rotated by Supabase**; CK neither possesses nor manages them.
- **`service_role` key — server-only.** The RLS-bypassing `service_role` key is used **only inside Edge Functions** via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (`verify-sign-password/index.ts:31`) and is **never** shipped to the client. The client uses the **anon** key (`VITE_SUPABASE_ANON_KEY`, validated at module load in `src/lib/supabase.ts`), which carries no privilege beyond what RLS allows.
- **RPC least privilege.** Security-sensitive RPCs `revoke ... from public` and `grant execute ... to authenticated` (e.g. `mint_step_up_grant`/`assert_step_up` `v52:76-77,99-100`; `get_signature_proof` `v60:357-358`; `run_integrity_check` `v80:86`). `SECURITY DEFINER` helpers pin `set search_path = public[, extensions]` to block shadow-table search-path injection (e.g. `can_view_project`/`can_edit_project` family; pattern visible across `supabase/v10-ptw-schema.sql`, `v12-*`, `v51`, `v52`, `v54`, `v80`).
- **Per-record token secrets** are stored server-side in privileged columns with no client write path.

### 7.2 Secret inventory (custody)

| Secret | Custody | Exposure |
|---|---|---|
| `service_role` key | Supabase Edge Function env (`Deno.env`) | Server-only — never client |
| `anon` key | Client bundle (by design; RLS-bounded) | Public-safe |
| Supabase project DB password / disk keys | Supabase platform | Not held by CK |
| OneSignal API key | Push trigger / server config | Server-side |
| OpenRouter API key (AI 站長) | Edge Function env | Server-only |
| Apple / Codemagic signing keys | Apple Developer + Codemagic vault | CI/CD only |
| Per-record QR secrets | Postgres privileged columns | Server-side |

### 7.3 Rotation plan

| Secret | Trigger to rotate | Method |
|---|---|---|
| `service_role` key | Annually, on suspected leak, or on Edge Function repo compromise | Supabase dashboard → regenerate → update Edge Function secrets → redeploy |
| `anon` key | On platform advisory or key-format migration | Supabase dashboard → update `VITE_SUPABASE_ANON_KEY` → rebuild/redeploy web + native |
| OneSignal / OpenRouter API keys | Annually or on suspected leak | Provider console → regenerate → update Edge env |
| User passwords | User-initiated; forced reset on credential-compromise incident | GoTrue (bcrypt re-hash on change) |
| QR secrets | On suspected QR-secret disclosure | Re-run `gen_random_bytes(32)` update for affected record |
| Apple/Codemagic signing | Per Apple key lifecycle | Apple Developer + Codemagic |

The ISMS Owner (關進杰) executes and records each rotation. Because CK is a single-operator ISMS, rotation is a manual, logged procedure rather than an automated rotation service.

## 8. Known gaps and limitations (read honestly before relying on this policy)

These are tracked in the Certification-Readiness Checklist and the Statement of Applicability.

1. **Backups / PITR — no platform backup (HIGH).** CK runs on the Supabase **Free tier**, which provides **no managed Point-In-Time-Recovery or daily backup**. Cryptographic integrity (the audit hash-chain) survives tampering *evidentially* but does **not** restore lost data. This is a known availability/resilience gap that also bounds the value of the integrity controls (you can prove data was deleted, but cannot recover it). See the Information Backup Policy.
2. **MFA + sign-reauth enforcement flags OFF (MEDIUM).** Step-up MFA (`step_up_enforced`) and sign-time re-auth (`sign_reauth_enforced`) are fully built but **disabled by flag** (§6.4, §6.5). Until flipped (post-1.5 on both stores), the AAL2 and 本人-proof guarantees are **not enforced** at runtime.
3. **Privileged-account MFA not evidenced (MEDIUM).** MFA on the operator's Supabase, Apple Developer, GitHub, and Codemagic accounts — which hold or can regenerate the most powerful keys — is **not yet evidenced** in the ISMS. This is the highest-leverage residual key-security risk and must be screenshotted/recorded.
4. **No signed Supabase DPA on file (MEDIUM).** CK's entire confidentiality-at-rest and TLS posture (§5) rests on Supabase. A **signed Data Processing Agreement** with Supabase is **not currently on file**; until it is, the §5 assurances are based on Supabase's public SOC 2 / ISO 27001 attestations only. (Relevant under HK PDPO data-processor obligations / DPP-2 & DPP-4.)
5. **Integrity cron pending live-apply confirmation (LOW).** `v80` exists in code (§6.1) but its applied/running state on the live project must be confirmed by execution, per CK's manual verify-by-execution migration practice.
6. **No CI dependency-vulnerability gate (LOW).** No automated dependency-CVE gate runs in CI, so a vulnerable crypto-adjacent library could ship undetected. Mitigation today is manual code-review + adversarial RLS simulation skills pre-ship.
7. **`issue-photos` privacy flip staged (LOW–MEDIUM).** See §6.2 — confirm the bucket is live-private and accept the authenticated-read (not per-project) scope.

## 9. Roles and responsibilities

- **關進杰 (ISMS Owner / Top Management):** owns this policy; approves algorithms; performs and logs key rotation; flips enforcement flags post-1.5; closes the §8 gaps; confirms migration apply by execution.
- **Sub-processors:** Supabase (DB/Auth/Storage/Edge — provides at-rest AES-256, TLS, bcrypt, signed-URL HMAC, holds SOC 2 + ISO 27001), OneSignal (push), Apple + Codemagic (build/sign/distribute), OpenRouter → Anthropic/moonshotai (AI 站長). Governed by the Sub-processor Register (A.5.19–A.5.22).

## 10. Compliance and review

Non-compliance (e.g. embedding `service_role` in client code, introducing a prohibited algorithm, storing a password outside GoTrue) is a reportable security incident. This policy is reviewed at least annually (next review **2027-06-18**), and immediately after any key compromise, sub-processor change, or material change to the crypto stack. Verification of cryptographic controls is by **execution against the live system**, not by reading source alone, consistent with CK's established practice.
