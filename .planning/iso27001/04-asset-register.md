# Information Asset Register & Data Classification

**ISMS Document 04 — CK工程 / CK Construction**
Controls: **ISO/IEC 27001:2022 Annex A.5.9** (Inventory of information and other associated assets) and **A.5.12** (Classification of information).

| Field | Value |
|---|---|
| Document Owner | 關進杰 (Kwan Chun Kit) — ISMS Owner / Top Management (sole founder-operator) |
| Version | 1.0 |
| Date issued | 2026-06-18 |
| Next review | 2027-06-18 (or on any new table/bucket/sub-processor, whichever is sooner) |
| Classification of this document | Internal |
| Applies to | Supabase project `syyntodkvexkbpjrskjj` (`https://syyntodkvexkbpjrskjj.supabase.co`), the iOS + Android apps, the web SPA, source repo, and all sub-processor accounts |

### Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 | Initial issue. Asset inventory + 3-tier classification scheme, grounded in `supabase/` migrations and `src/` source. |

---

## 1. Purpose & scope

This register satisfies **A.5.9** (maintain an inventory of information assets and assign ownership) and defines the classification scheme required by **A.5.12**. It is the authoritative list of what data CK holds, where it lives, who owns it, how sensitive it is, and the handling rules that follow from its class.

CK工程 is a one-person operation: 關進杰 is simultaneously the developer, operator, data controller, and ISMS Owner. There is therefore **one asset owner for every asset** — him. This is recorded honestly rather than inventing a RACI matrix that does not exist; the control objective (a named, accountable owner) is still met.

The personal data held is subject to the **Hong Kong Personal Data (Privacy) Ordinance (PDPO, Cap. 486)** — workers' names, phone numbers, and (for safety roles) green-card / qualification context are personal data under DPP-1 to DPP-4. End-users are HK construction-site personnel (判頭 / 工地主任 / 管工 / 工人 / 業主 / PM).

---

## 2. Classification scheme (A.5.12)

CK uses a **three-tier** scheme. Class is assigned by the **most sensitive field** an asset contains (a table with one PII column is Confidential even if its other columns are Internal).

| Class (zh-HK) | Definition | Examples in CK | Impact if disclosed |
|---|---|---|---|
| **Confidential / 機密** | Personal data (PDPO), authentication secrets, cryptographic keys, and non-repudiation evidence (signatures, signature-proof certificates, audit hash chain). | `user_profiles` (phone, name), `contacts` (trade phone numbers), GoTrue `auth.users` (bcrypt hashes), `sign_reauth_grants`, `permit_signoffs`, `audit_ledger`, the `service_role` key, OpenRouter/Anthropic key, Apple + Codemagic credentials. | High — PDPO breach, account takeover, repudiation of a signed permit, total backend compromise (service_role bypasses RLS). |
| **Internal / 內部** | Operational project data — visible only to approved project members, gated by RLS. Useful to a competitor or a disputing party but not directly identifying or credential-bearing. | `progress_items` / `progress_history`, `issues`, `permits_to_work`, `site_instructions`, `variation_orders` (HKD quotations), `documents`/drawings, `dailies`, `materials`, `events`, photos in private buckets. | Medium — commercial/dispute harm to one project; contained by per-project RLS. |
| **Public / 公開** | Information intended for, or acceptable for, public release. | App Store / Play listing copy, marketing pages, `docs/app-store-metadata.md`, the anon (publishable) Supabase key, the live web SPA bundle. | Low — designed to be public. |

**Why the anon key is Public, not Confidential:** the anon key is shipped in every client bundle by design (`src/lib/supabase.ts:6`, baked in via `codemagic.yaml`). It is a *publishable* key whose blast radius is bounded by Row-Level Security — it grants nothing RLS does not already allow an unauthenticated/authenticated caller. The **`service_role` key is Confidential** and is the inverse: it bypasses RLS entirely and therefore lives only in Edge Function secrets (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`, e.g. `supabase/functions/verify-sign-password/index.ts:31`), **never** in any `VITE_*` variable or client bundle.

**Labelling in practice:** CK does not stamp visible labels on every screen (a single-operator, mobile-first app). Classification is enforced *structurally* — by which Postgres table, which RLS policy, and which storage bucket an asset sits in — rather than by a text label. This register is the label map.

---

## 3. Information asset inventory (A.5.9)

Owner of every asset = **關進杰 (ISMS Owner)**. The "Owner" column is omitted from the rows below to avoid repetition; treat it as 關進杰 throughout.

### 3.1 Primary data store — Postgres (Supabase project `syyntodkvexkbpjrskjj`)

| Asset (table) | Contents | Class | Key handling controls (evidence) |
|---|---|---|---|
| `auth.users` (GoTrue) | Synthetic email `<digits>@phone.local`, **bcrypt** password hash, session/JWT state. The app never sees or stores the password. | Confidential | Managed by Supabase GoTrue; app authenticates via synthetic email (`src/lib/phone.ts`). Hard-deleted on account deletion (`supabase/v6-account-deletion.sql:57`). |
| `user_profiles` | `phone` (HK mobile), `name`, `company`, `global_role`, `sub_role`. **PII.** | Confidential | RLS enabled (`v2-schema.sql:61`). Self-INSERT/UPDATE only (`v2-schema.sql:69-75`). Self-promotion / privilege-escalation closed by BEFORE-UPDATE/INSERT guards (`v17-user-profiles-rls-hardening.sql`, `v55e-credential-insert-guard.sql`). Watched by audit ledger (`v51` trigger list line 108). FK `on delete cascade` from `auth.users` (`v2-schema.sql:20`). |
| `project_members` | Per-project role + approval status (`pending/approved/rejected`). | Confidential (links a person to a role) | RLS enabled (`v2-schema.sql:63`). Membership-role escalation guard `v50-membership-role-escalation-guard.sql`. `approved_by` FK set null on deletion (`v6-account-deletion.sql:32`). Audit-ledger watched (`v51:108`). |
| `contacts` | Project address book: trade contact `name`, `phone`, `notes`. **PII (third-party phone numbers).** | Confidential | RLS: read = approved project member; write = admin/PM only (`v11-contacts-schema.sql:41-50`). `created_by` FK set null (`:20`). PII narrowing fix for applicants `v31-applicant-pii-fix.sql`. |
| `projects` | Project name, zones, assigned PM ids. | Internal | RLS: admin full, PM reads assigned (`v2-schema.sql:78-90`). `created_by` set null on deletion (`v6:23`). |
| `progress_items`, `progress_history`, `progress_snapshots` | Work-breakdown tree, %/floor/quantity progress, history. Core dispute-survival record. | Internal | `can_view_project` / `can_edit_project_progress` SECURITY DEFINER helpers with `set search_path = public` (`v3-progress-schema.sql:33-66`). Visibility narrowing `v11-progress-visibility.sql`, `v14`, `v27`. `progress_history` audit-ledger watched (`v51:108`). |
| `issues` (+ comments/history) | Site issues, escalation chain, location, photos. | Internal | RLS + escalation routing; column guard `v69-issues-column-guard.sql`. |
| `permits_to_work`, `ptw_versions`, `permit_signoffs` | PTW (動火證 etc.), fire-watch, **signature sign-offs (non-repudiation evidence)**. | Confidential (`permit_signoffs`); Internal (PTW body) | Audit-ledger watched (`v51:108`). Safety-officer override hole closed `v76-ptw-safety-officer-override-guard.sql`. Expiry transition cron `v67-ptw-expiry-cron.sql`. |
| `site_instructions`, `si_versions`, `variation_orders`, `vo_versions`, `approvals` | SI/VO documents, **HKD quotations**, approval chain snapshots. | Internal | RLS helpers `active_role_holders` / `in_flight_approvals` (`v9-rls-helpers.sql`), `can_view_si/vo`. All audit-ledger watched (`v51:108`). |
| `documents`, `document_versions`, `document_events` | Drawings / project documents metadata + versioning + review deadlines. | Internal | Private bucket (below); RLS helpers (`v40-split/3-helpers-and-rls.sql`). Audit-ledger watched (`v51:108`). |
| `dailies`, `materials`, `events`, `equipment` forms | Daily logs, material orders, site events, equipment/lifting forms. | Internal | RLS per project; materials RLS fix `v16`; events RLS `v72`; FK set null `v68-dailies-fk-set-null.sql`. |
| `photo_metadata` | WGS84 GPS + capture timestamp for site photos. **Append-only.** | Internal (location evidence) | SELECT+INSERT only, no UPDATE/DELETE policy → immutable (`v79-photo-metadata.sql:45-51`); gated by `can_view_project`. |
| `audit_ledger` | **Tamper-evident sha256 hash chain** over 13 critical tables. Non-repudiation evidence. | Confidential | Append-only (BEFORE UPDATE/DELETE raises, `v51:89-98`); no client read/write policy; deny-all RLS (`v51:33-35`). Read only via gated `verify_integrity()` / admin-only `export_ledger_proof()` (`v51:121-187`). |
| `sign_reauth_grants`, step-up grant tables, `app_config` | Short-lived re-auth / AAL2 grants; enforcement flags. | Confidential | No client write policy — minted only by service role (`verify-sign-password/index.ts:90-99`). Flags `step_up_enforced` / `sign_reauth_enforced` default **FALSE** (`v54-step-up-rollout-flag.sql:19`). |
| AI assistant tables (`ai_*` usage/budget) | Per-project AI 站長 usage + daily budget. | Internal | AI runs **as the calling user** with forwarded JWT, so all reads/writes are RLS-bounded (`functions/ai-assistant/index.ts:5-7`). Prompt-injection defence in system prompt (`index.ts:48-49`). |
| Memory graph (`v61`/`v62`) | Server-hosted project memory nodes/edges. | Internal | RLS parity fix `v62-memory-graph-rls-parity.sql`. |

### 3.2 Object storage — Supabase Storage buckets

| Bucket | Contents | Public? | Class | Handling controls (evidence) |
|---|---|---|---|---|
| `project-drawings` | Drawings + markups (images, PDF). | **Private** from creation | Internal | `public=false` (`v8-drawings.sql:28`). Server-side size cap 25 MB + MIME allowlist (`v71-storage-bucket-limits.sql:29-32`). Short-lived signed URLs for read. Atomic withdraw fix `v78`. |
| `project-si-vo` | SI/VO attachments, signed PDFs, voice notes. | **Private** from creation | Internal | `public=false` (`v9-si-vo-storage-bucket.sql:19`). Size cap 20 MB; MIME left open intentionally (audio variants), documented (`v71:34-41`). |
| `project-docs` | Project documents (may include office formats). | **Private** from creation | Internal | `public=false` (`v40-split/5-storage-bucket.sql:20`). Size cap 20 MB (`v71:44-47`). |
| `issue-photos` | Defect / site / face photos. | **Created public (`v4`); flip to private STAGED in `v74`** | Internal — **GAP** | Currently world-readable by guessable URL — the one public evidence bucket (`v4-issues-schema.sql:126-127`). Fix `v74-issue-photos-private.sql:26` makes it private + authenticated-read, but is **web-deploy-gated** (must not apply before the signed-URL client shim is live, else 404s old rows). Size cap 10 MB + image MIME allowlist already applied (`v71:21-23`). **Open item — see §6.** |

> Note: there is no separate "permit" bucket — permit photos/signatures attach via `project-si-vo` / issue/PTW records. The four buckets above are the complete set.

### 3.3 Edge Functions (compute assets; hold no data at rest but handle Confidential secrets)

| Function | Purpose | Secrets handled | Class |
|---|---|---|---|
| `verify-sign-password` | Sign-time password re-auth for non-repudiation; verifies password against GoTrue and **never logs/echoes/stores it** (`index.ts:19-21,85`). | `SUPABASE_SERVICE_ROLE_KEY` | Confidential (handles credential + service_role) |
| `ai-assistant` | AI 站長 tool-use loop, JWT-forwarded (RLS-bounded). | `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | Confidential (handles API key) |
| `weather-sync` | Pulls HKO warnings into `weather_events`. | (platform-injected) | Internal |
| `build-memory-graph` | Builds project memory graph. | service role / platform | Internal |

### 3.4 Secrets & credentials (all Confidential)

| Secret | Where it lives | Handling rule |
|---|---|---|
| Supabase `service_role` key | Edge Function env only (`Deno.env`) | **Never** in client / `VITE_*` / repo. Bypasses RLS — treat as crown jewels. |
| Supabase `anon` (publishable) key | Client bundle + CI env | Public-class by design; blast radius bounded by RLS. |
| OpenRouter / Anthropic API key | Edge Function secrets (`supabase secrets set`) | Never in `VITE_*`; rotate on suspected leak. |
| Apple App Store Connect + Team ID `C22JSRYW54` | Codemagic env (`codemagic.yaml`) | Confidential; account MFA required (**gap — not evidenced, §6**). |
| Codemagic / signing credentials | Codemagic | Confidential; protects the iOS/Android release pipeline. |
| GitHub repo access | GitHub | Source-of-truth for the app; account MFA required (**gap, §6**). |

### 3.5 Application & build artefacts

| Asset | Class | Notes |
|---|---|---|
| Source repository (React 18 + TS + Vite + Supabase SQL under `supabase/`) | Internal | Contains schema/RLS logic; no live secrets committed (anon key is publishable). |
| iOS build (App Store, live; `aps-environment=production`) | Internal | Distributed via TestFlight + App Store; account-deletion already Apple-reviewed. |
| Android build (Capacitor 8; pending Play identity verification) | Internal | Debug-signed AAB/APK for internal sharing. |
| Web SPA bundle (`dist/`, Vercel) | Public | Shipped to browsers; contains only the publishable anon key. |

---

## 4. Encryption & data-in-transit / at-rest

- **In transit:** Supabase enforces TLS 1.2+ for all REST/Realtime/Storage/Auth traffic; the client adds a 15 s fetch timeout (`src/lib/supabase.ts:15,43-71`).
- **At rest:** Supabase platform encrypts the Postgres volume and Storage objects with AES-256 (platform-managed keys).
- **Passwords:** bcrypt-hashed inside GoTrue; the app never receives or persists plaintext passwords (the re-auth function only reads the GoTrue 200/4xx outcome — `verify-sign-password/index.ts:72-88`).

---

## 5. Sub-processors handling CK assets (cross-reference: ISMS supplier-security doc)

| Sub-processor | Asset class processed | Assurance on file |
|---|---|---|
| Supabase (DB/Auth/Storage/Edge/Realtime) | Confidential + Internal | DPA available + SOC 2 + ISO 27001 — **but no signed DPA on CK's file yet (gap §6)** |
| OneSignal (push) | Internal (device token, notification text) | Free tier; minimise PII in payloads |
| Apple + Codemagic (build/distribute) | Internal artefacts + Confidential signing creds | Apple DPA via developer agreement |
| OpenRouter / Anthropic → `moonshotai/kimi-k2` (AI 站長) | Internal (project data the calling user can already see) | AI bounded to caller's RLS scope; provider terms apply |

---

## 6. Known gaps & control status (honest disclosure for the auditor)

These are **not** claimed as implemented controls. They are tracked on the certification-readiness checklist (ISMS Document — Statement of Applicability / risk treatment plan).

| # | Gap | Affected asset(s) | Status |
|---|---|---|---|
| G1 | **No PITR / managed daily backup** — Supabase Free tier. A destructive event or region loss has no documented recovery point/time. | All Postgres data | Open — backup/restore procedure + tier upgrade is a planned risk treatment. |
| G2 | **`issue-photos` bucket still public** — defect/face photos world-readable by guessable URL; un-authed egress. | `issue-photos` storage | Mitigation coded (`v74`) but **web-deploy-gated**, not yet applied. |
| G3 | **Step-up MFA & sign-time re-auth enforcement OFF** — `step_up_enforced` / `sign_reauth_enforced` default FALSE (`v54:19`). Backend + UI exist; flags flip after 1.5 ships on both stores. | High-risk RPCs, signatures | Partial — controls built, enforcement deferred. |
| G4 | **Account MFA not evidenced** on Supabase / Apple / GitHub / Codemagic admin accounts. | All Confidential secrets/credentials | Open — enable + screenshot evidence. |
| G5 | **No signed Supabase DPA on file.** | All Confidential + Internal data | Open — request and file the DPA. |
| G6 | **`verify_integrity()` not scheduled** — tamper-detection is on-demand only; anomaly cron deferred (`v80-integrity-monitoring-cron.sql` exists but scheduling not confirmed live). | `audit_ledger` | Partial — capability exists, automation pending. |
| G7 | **No CI dependency-vulnerability gate.** | Source repo / build pipeline | Open — add `npm audit` / SCA to Codemagic. |

---

## 7. Review & maintenance

This register is reviewed at least annually (**next review 2027-06-18**) and immediately upon: a new Postgres table or storage bucket, a new Edge Function or secret, a new sub-processor, or a change to the classification of any existing asset. Because classification is enforced structurally (table / RLS / bucket), the controlling check at review is a `supabase/` migration diff plus a `storage.buckets` `public`-flag audit (`select id, public, file_size_limit, allowed_mime_types from storage.buckets`), verified **by execution**, not by reading source.

— End of Document 04 —
