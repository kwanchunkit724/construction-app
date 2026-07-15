# 05 — Supplier & Cloud Services Register (A.5.19–A.5.23)

**Organisation:** CK工程 / CK Construction (sole proprietor SaaS)
**Standard:** ISO/IEC 27001:2022 — Annex A controls **A.5.19** (information security in supplier relationships), **A.5.20** (addressing security within supplier agreements), **A.5.21** (managing ICT supply-chain security), **A.5.22** (monitoring, review & change management of supplier services), **A.5.23** (information security for use of cloud services).
**Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner & Top Management (sole founder/operator)
**Version:** 1.0
**Date:** 2026-06-18
**Next review:** 2027-06-18 (or earlier on a material change: a **new sub-processor**, a removed sub-processor, a change in what data a supplier processes, a supplier security incident, or a tier/region change)
**Clause reference:** Supports ISO/IEC 27001:2022 Clause 6.1.3 (treatment of supply-chain risk) and the operation of Annex A controls A.5.19–A.5.23. Cross-referenced from the Statement of Applicability (`02-statement-of-applicability.md`) and the Asset Register (`03-asset-register`).

> **Status disclaimer (honesty for the auditor):** CK is **self-prepared toward certification readiness — NOT yet certified.** This register is accurate to the live system as of the date above. CK is a **single-operator micro-entity**: there is one person (關進杰) who is the founder, developer, operator and ISMS owner, and CK has **no negotiating leverage** to impose bespoke contractual terms on the cloud providers below — it relies on each provider's **standard published terms, DPA and certifications**. Two contractual actions are **outstanding and stated plainly** (sign the Supabase DPA; confirm OneSignal/OpenRouter data handling) — see §6 and the certification-readiness checklist (`13-certification-readiness-checklist.md`, action **B.3**). Do not read "has a DPA available" as "DPA signed and on file".

---

## 1. Scope & purpose

CK runs **no application server and no infrastructure of its own**. The architecture is two-tier — a React/Capacitor client talking directly to **Supabase** (CLAUDE.md: "Two-tier: React SPA ↔ Supabase. No application server, no API layer"). Consequently **the entire production data plane is operated by sub-processors**, and supplier/cloud security (A.5.19–A.5.23) is one of CK's most material control areas, not a peripheral one.

This register:

1. Enumerates every external supplier/sub-processor that **stores, transmits, or processes** CK or end-user data, or that holds **keys to the production system** (data, app signing, source, CI/CD).
2. Records, per supplier: **service provided · data shared · their certifications · DPA status · data residency**.
3. Provides a one-page **cloud-services security assessment** (§4) and an **exit / portability** note (§5).
4. Flags the open **supplier-agreement actions** (§6).

**Classification of this document:** 內部 (Internal). It names provider relationships but no secrets — all API keys/secrets are held outside this document (Supabase secrets store / `app_config` table / Codemagic env groups; see `08-cryptography-and-key-management`).

---

## 2. Sub-processor / supplier register (A.5.19, A.5.21, A.5.23)

> "Data shared" is deliberately specific because CK's data is mostly **HK PDPO personal data** (worker phone, name, company, role) plus **construction site records** (progress, issues, permits, drawings, signatures) that must survive a 勞工處 / contractual dispute. Sensitivity classes per `03-asset-register`: 機密 (Confidential — PII, signatures, photos with GPS), 內部 (Internal — project records).

### 2.1 — Supabase (PRIMARY processor — Tier-1 critical)

| Field | Detail |
|-------|--------|
| **Service provided** | The **entire backend**: Postgres database, GoTrue Auth, Storage (drawings/permit photos), Realtime, and Edge Functions. Project `https://syyntodkvexkbpjrskjj.supabase.co` (CLAUDE.md; baked into `codemagic.yaml` as `VITE_SUPABASE_URL`). |
| **Data shared** | **Everything.** All 機密 + 內部 data: `user_profiles` (phone, name, company, `global_role`, `onesignal_id`), all project/progress/issue/SI/VO/PTW/document/equipment tables, `audit_ledger` (the tamper-evident SHA-256 hash chain, v51), Storage blobs (drawings, permit photos, `photo_metadata` GPS+timestamp, v79), and the GoTrue `auth.users` identity store (synthetic `<digits>@phone.local`, bcrypt-hashed passwords — CK never stores passwords; `src/lib/phone.ts`). |
| **Sub-role of CK's controls** | CK's defence-in-depth (per-table RLS, `SECURITY DEFINER` helpers `can_view_project`/`can_edit_project` with pinned `set search_path=public`, least-privilege RPCs, the append-only audit ledger) all run **inside** Supabase Postgres. Supabase is therefore both the platform and the enforcement substrate. |
| **Certifications (vendor-attested)** | Supabase publishes **SOC 2 Type II** and **ISO/IEC 27001** attestations and a standard **DPA** (GDPR Art. 28). CK relies on this certified chain for the "Inherited" controls in the SoA (physical security A.7.*, platform AES-256-at-rest A.8.24, data-centre BCP). **CK has not independently audited Supabase** — it relies on the published attestations (appropriate for a micro-entity; A.5.21 supply-chain assurance is by attestation, not by on-site audit). |
| **DPA status** | ⚠️ **NOT signed / not on file.** Supabase makes a DPA available; CK has **not yet executed it**. This is the single most important contractual gap for A.5.23/A.5.34 (PII). **Action B.3.** |
| **Data residency** | Single Supabase project region (US/EU per project provisioning). ⚠️ Region is **not HK** — relevant to PDPO cross-border transfer disclosure to end users. To be confirmed in the Supabase dashboard and recorded here at next review. |
| **Encryption** | TLS 1.2+ in transit; AES-256 at rest (platform-provided). `service_role` key confined to Edge Functions (`Deno.env`); client uses only the **anon/publishable** key (`codemagic.yaml`, `src/lib/supabase.ts`). |
| **Key risk** | **Hosting = Supabase Free tier → no managed daily backup / PITR, Storage blobs not independently backed up** (known gap, A.8.13). A Supabase compromise = full data exposure. Mitigated by: their certifications, RLS-at-rest meaning data is row-scoped even via the API, the audit ledger making tampering detectable, and (planned) the **B.1** Pro upgrade + test-restore. |
| **Criticality** | **Tier-1 (catastrophic if lost).** No CK service exists without it. |

### 2.2 — OneSignal (push notification delivery)

| Field | Detail |
|-------|--------|
| **Service provided** | Push notification fan-out (APNs on iOS, FCM on Android) for the SI/VO/PTW approval chain, permit signing, document and digest notifications. App ID `71f914a3-6dc3-4c4a-80e6-70df8f17d5d1` (`src/lib/push.ts:10`). |
| **Data shared** | **Minimal, by design.** The client registers a device with `external_user_id = Supabase auth user_id` + the native push token + `language: 'zh-Hant'` (`src/lib/push.ts:123-129`); the resulting OneSignal player id is stored back in `user_profiles.onesignal_id`. **Notification payloads carry the title/body text** sent from `send_push_to_users` (`supabase/v5-split/2-send-push.sql`) — i.e. short Chinese notification strings (e.g. an issue title, an approval prompt). These strings **can contain limited project content** and a `deep_link` path, so OneSignal sees notification text + an opaque user UUID + device token. **No phone number, name, or password is sent to OneSignal.** |
| **Secret custody** | The OneSignal **REST API key + app id live server-side** in the `app_config` table, read only by the `SECURITY DEFINER` function `send_push_to_users` (`supabase/v5-split/2-send-push.sql:17-19`). The client (`push.ts`) holds **only the public app_id** — never the REST key. |
| **Certifications** | OneSignal publishes SOC 2 Type II and a DPA/GDPR posture on their trust page. **Not independently verified by CK.** |
| **DPA status** | ⚠️ **Not confirmed / not on file.** Standard ToS accepted at signup; the DPA and "what payload content OneSignal retains/logs" have **not been formally reviewed**. **Action: confirm OneSignal data handling** (§6). |
| **Data residency** | OneSignal-controlled (US). Not configured/known by CK. |
| **Mitigation** | Keep notification bodies **low-sensitivity** (titles/prompts, not full PII or quotation figures); user id is an opaque UUID, not a phone number; logout clears `onesignal_id` (`push.ts:176-189`) so a shared device stops receiving a former user's pushes. |
| **Criticality** | **Tier-2.** Loss degrades timeliness of approvals/permits but **the audit trail and data are unaffected** — notifications are a convenience layer over the source-of-truth DB. |

### 2.3 — Apple (App Store distribution + APNs)

| Field | Detail |
|-------|--------|
| **Service provided** | iOS app distribution (App Store + TestFlight), code-signing trust, and **APNs** push transport. Team ID `C22JSRYW54`, bundle `com.kwanchunkit.constructionapp` (`codemagic.yaml`, `capacitor.config.ts`). |
| **Data shared** | App binary + metadata; **APNs device tokens** (transport only — the notification routing); App Store Connect account holds the developer identity + (for paid apps) financial/tax data. No CK end-user database content flows to Apple. CK has **already passed Apple's account-deletion review** (`delete_my_account()` cascade, v20) — a compliance dependency on Apple's policy. |
| **Certifications** | Apple operates under its own published security/privacy program (ISO 27001-certified data centres; App Store Review). Relied upon by attestation. |
| **DPA status** | Governed by the **Apple Developer Program License Agreement** (accepted to be on the store). No separate CK-Apple DPA; the relationship is "platform terms", not "processor of CK's database". |
| **Data residency** | Apple-controlled. |
| **Key risk** | **App-signing identity = keys to shipping.** Account compromise → malicious update path. Account-level MFA on Apple is **owner action B.2** (not yet evidenced). Also a **single point of policy failure**: an Apple review rejection can block releases (relevant to the MFA-flag rollout sequencing, B.4). |
| **Criticality** | **Tier-1 for distribution** (cannot ship iOS without it); **Tier-2 for data** (no DB data held). |

### 2.4 — Codemagic (CI/CD build & release pipeline)

| Field | Detail |
|-------|--------|
| **Service provided** | CI/CD for iOS App Store, iOS TestFlight, and Android Internal Test builds on `mac_mini_m2` runners (`codemagic.yaml`, three workflows). Builds the web bundle, runs `npx cap sync`, archives/signs the IPA, and publishes to App Store Connect. |
| **Data shared** | Full **source checkout** at build time; **signing certificates / provisioning profiles** fetched via `app-store-connect fetch-signing-files`; **secrets in the `app_store_credentials` env group** (`CERTIFICATE_PRIVATE_KEY`, `APP_STORE_CONNECT_*`). The Supabase **anon/publishable** key is baked into the build as `VITE_SUPABASE_ANON_KEY` (public-safe by design); **no service-role key, no DB data** passes through CI. |
| **Certifications** | Codemagic publishes a SOC 2 posture/trust page. **Not independently verified by CK.** |
| **DPA status** | Standard ToS. No CK end-user PII processed (source + signing material only), so it is a **supply-chain integrity** dependency (A.5.21) more than a PII-processor (A.5.23). |
| **Data residency** | Codemagic-controlled. |
| **Key risk** | **Holds the iOS signing private key + App Store Connect API key** → a CI compromise could ship a malicious build. Account-level MFA on Codemagic is **owner action B.2**. Secrets are in Codemagic env groups, not in the repo. |
| **Criticality** | **Tier-1 for release integrity** (supply-chain); **Tier-2 for data.** |

### 2.5 — OpenRouter + Anthropic (→ moonshotai/kimi-k2 / model providers) — AI 站長

| Field | Detail |
|-------|--------|
| **Service provided** | The LLM behind the **AI 站長** project assistant. The Edge Function `ai-assistant` calls **Anthropic Messages API by default**, or routes via **OpenRouter** (OpenAI-compatible) when `AI_PROVIDER=openrouter` (`supabase/functions/ai-assistant/provider.ts:38-43`). Per the AI-go-live memory, the live deployment uses **OpenRouter → moonshotai/kimi-k2** because OpenRouter geo-blocks Supabase Edge egress for Western providers (403) — calls are re-originated through a Fly Tokyo relay (`provider.ts:144-155`). |
| **Data shared** | **Whatever the assistant reads on the user's behalf.** The Edge Function runs **as the calling user with their JWT**, so every read is RLS-bounded to what that human may already see (`ai-assistant/index.ts:92-96`). Tool results are wrapped in `<site_data>` tags and **sent to the model as context** (`index.ts:158`) — this means **project content (progress, issues, document text, contact info the user can access) is transmitted to the model provider** to answer the question. The system prompt explicitly treats `<site_data>` as untrusted data, not instructions (prompt-injection guard, `index.ts:49`). A per-user **daily budget gate** caps spend (`ai_usage_status`, `index.ts:110-114`); the feature is **per-project flag-gated** (`ai_enabled_for_project`, `index.ts:106-108`). |
| **Secret custody** | `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `RELAY_SECRET` are **Edge-Function secrets** (`Deno.env`), never `VITE_*`, never client (`index.ts:14-18`). |
| **Certifications** | Anthropic and OpenRouter publish their own security/privacy terms. The Moonshot (kimi) model is served via OpenRouter. **Not independently verified by CK.** |
| **DPA status** | ⚠️ **Not confirmed.** **Critical open question: data-retention / training-use of the content sent to the model provider.** For HK PDPO and customer trust, CK must confirm the provider **does not train on, or unduly retain,** the `<site_data>` it receives. **Action: confirm OpenRouter/Anthropic data handling + opt out of training** (§6). |
| **Data residency** | Provider-controlled; the relay re-originates from **Japan (Fly nrt)** for egress, but the model inference region is the provider's. |
| **Mitigation** | RLS bounds what the AI can ever read (it cannot exfiltrate beyond the user's own permission set); the feature can be **switched off per project** (module system, v59) or globally via the flag; budget cap limits blast radius. |
| **Criticality** | **Tier-3 (optional feature).** Disabling AI 站長 removes the data-sharing entirely with **zero impact on the core dispute-survival system.** This is the cleanest "exit" of any supplier. |

### 2.6 — Hong Kong Observatory (HKO) Open Data — *data SOURCE, not a processor*

| Field | Detail |
|-------|--------|
| **Service provided** | Public weather Open Data API (`data.weather.gov.hk`) consumed by the `weather-sync` Edge Function for the EOT (extension-of-time) weather-claim feature (`supabase/functions/weather-sync/index.ts:27`). |
| **Data shared** | **None outbound.** CK only **reads** public warning/rainfall data; **no CK or end-user data is sent to HKO.** Listed for completeness so the auditor sees the full external-call surface. |
| **DPA / residency** | N/A — public read-only government data source, no processing of CK data. |
| **Criticality** | **Tier-4** (feature input only). |

> **Excluded from the processor register (named for completeness):** Google Fonts (Inter/Poppins loaded in `index.html` — fetches a font, leaks only an IP/User-Agent at page load); Google Play / Firebase FCM (`android/app/google-services.json`) is the Android equivalent of Apple/APNs transport and carries the same "device-token transport only" profile as §2.3. GitHub hosts the **source repository** — same supply-chain-integrity profile as Codemagic (account MFA = B.2); it holds **no end-user DB data**.

---

## 3. Register summary table

| # | Supplier | Service | Most-sensitive data shared | Their certs | DPA on file | Residency | Tier |
|---|----------|---------|----------------------------|-------------|:-----------:|-----------|:----:|
| 1 | **Supabase** | DB / Auth / Storage / Edge | **All 機密+內部 incl. PII, signatures, audit ledger** | SOC 2 II + ISO 27001 + DPA available | ⚠️ **No** (B.3) | non-HK region | **1** |
| 2 | **OneSignal** | Push delivery | Notification text + opaque user UUID + device token (no PII fields) | SOC 2 (vendor-stated) | ⚠️ **No / unconfirmed** | US | 2 |
| 3 | **Apple** | iOS distribution + APNs | App binary, APNs tokens, dev identity | Apple program | DPLA (platform terms) | Apple | 1 (dist) |
| 4 | **Codemagic** | CI/CD build & sign | Source, signing key, CI secrets (no DB data) | SOC 2 (vendor-stated) | ToS | vendor | 1 (release) |
| 5 | **OpenRouter / Anthropic (→ kimi-k2)** | AI 站長 LLM | RLS-bounded project content the user can see | vendor terms | ⚠️ **No / unconfirmed; training opt-out TBC** | provider/JP relay | 3 |
| 6 | **HKO Open Data** | Weather input | **None outbound** | N/A (public) | N/A | HK gov | 4 |

---

## 4. Cloud-services security assessment (A.5.23) — one page

**Cloud posture.** CK is a **fully cloud-native, server-less SaaS**: there is no CK-operated server to harden — the production data plane is Supabase, and the release path is Apple + Codemagic. The A.5.23 question is therefore "is reliance on these clouds adequately controlled?"

**What CK controls (and has implemented):**

- **Tenant/data isolation is enforced by CK, in-cloud.** Per-table RLS on every table; `SECURITY DEFINER` helpers with pinned `set search_path=public` to block shadow-table injection; least-privilege RPCs (revoke from public, grant to authenticated). Multiple privilege-escalation holes were **found and closed** (v17 self-promote `BEFORE UPDATE` gate; v18 RLS hardening; v50 membership-role guard; v55e credential self-verify guard; v76 PTW safety_officer override guard; v77 equipment helper). This means even a Supabase-API-level actor sees only RLS-scoped rows.
- **Integrity is independently verifiable.** The append-only `audit_ledger` SHA-256 hash chain (v51, AFTER triggers on 13 critical tables; `verify_integrity()` / `export_ledger_proof()`) makes silent tampering by anyone — including at the platform layer — **detectable**, which materially reduces reliance on blind trust in the provider.
- **Key custody is correct.** The high-privilege `service_role` key exists **only** in Edge Functions (`Deno.env`); the client uses the anon/publishable key (`codemagic.yaml`, `src/lib/supabase.ts`). The OneSignal REST key is server-side in `app_config`; AI provider keys are Edge secrets. No production secret ships in the client bundle.
- **Data minimisation to secondary processors.** OneSignal gets opaque UUIDs + notification text, not PII fields. The AI provider only ever receives data the calling user is already entitled to read (RLS-bounded).
- **Built but flag-OFF auth hardening.** Native TOTP step-up MFA (AAL2, v52–54) and sign-time password re-auth for non-repudiation (v60, `verify-sign-password` Edge Function — password verified against GoTrue and **never logged/stored/returned**, `verify-sign-password/index.ts:18-21`) are **live in the backend but enforcement-flagged OFF** (`step_up_enforced`, `sign_reauth_enforced`) pending the 1.5 client rollout on both stores → owner action B.4.

**What CK depends on the cloud for (inherited / attested):** physical/data-centre security (A.7.*), platform AES-256-at-rest, hypervisor isolation, and provider BCP — relied upon via Supabase's SOC 2 + ISO 27001 attestations (CK does not, and as a micro-entity realistically cannot, independently audit the provider — A.5.21 assurance is by attestation).

**Honest gaps (do not gloss):**

1. **No signed Supabase DPA on file** (B.3) — the primary-processor contract is incomplete for A.5.23/A.5.34.
2. **Free tier → no PITR / managed backup; Storage blobs not independently backed up** (A.8.13, B.1) — the most material *technical* supplier risk to the dispute-survival core value.
3. **Account-level MFA on Supabase / Apple / GitHub / Codemagic not yet evidenced** (A.8.2/A.8.5, B.2) — these four accounts are the keys to data, signing, source and CI; this is the highest-weight/lowest-effort control still open.
4. **MFA + sign-reauth enforcement flags OFF** (B.4) — built and verified, but not yet *operating* until 1.5 is live on both stores.
5. **OneSignal & OpenRouter/Anthropic data-handling (retention, training-use) unconfirmed; no CI dependency-vulnerability gate** (A.5.21 supply-chain monitoring; `npm audit`/`get_advisors` available but not a blocking CI gate) — see §6 and `07-secure-development-policy`.
6. **`verify_integrity` not yet scheduled** (anomaly-detection cron deferred) — integrity is verifiable on demand but not yet continuously monitored (A.5.22 supplier-service monitoring).

**Monitoring & change management (A.5.22).** Supplier review cadence: this register is reviewed **annually** (next 2027-06-18) and **on any material change** (new/removed sub-processor, change in data processed, supplier incident). Operational signals to be logged under B.6: Supabase changelog/advisories + `get_advisors`, `npm audit`/Dependabot, and (once deployed) the daily `verify_integrity` result. **Net assessment: cloud reliance is well-controlled at the technical/in-app layer (strong RLS + integrity ledger + key custody); the residual risk is contractual (DPA), continuity (backup), and account-MFA — all owner actions with a clear, costed path in doc 13.**

---

## 5. Exit & portability note (A.5.23)

- **Supabase (primary).** Supabase is **standard open-source Postgres + S3-compatible Storage + the GoTrue auth schema** — not a proprietary lock-in. Exit path: `pg_dump` the full schema + data (all logic is in versioned SQL migrations under `supabase/`, replayable on any Postgres), export Storage objects, and migrate `auth.users` (bcrypt hashes are portable). The same `pg_dump`/Storage-export drill **doubles as the interim backup** until the B.1 Pro upgrade gives managed PITR — i.e. building the exit capability also closes the backup gap. RLS policies and RPCs travel with the SQL. **Realistic effort: moderate** (re-pointing the client `VITE_SUPABASE_URL`/key + standing up Postgres elsewhere); **no data is trapped in a proprietary format.**
- **OneSignal.** Trivial to exit — it is a thin delivery layer keyed by `external_user_id`. Swapping to another APNs/FCM provider touches only `src/lib/push.ts` + `send_push_to_users` (`v5-split/2-send-push.sql`). No historical data to migrate (pushes are ephemeral).
- **AI 站長 (OpenRouter/Anthropic).** Already provider-swappable behind one seam (`provider.ts` `AI_PROVIDER` switch) and can be **switched off entirely** per project (module system, v59) with **zero data-plane impact** — the cleanest exit of all suppliers.
- **Apple / Codemagic.** Distribution/CI are replaceable (Codemagic ↔ other CI; Android already builds an alternate path). Apple App Store presence is a market dependency, not a data dependency. Signing material is re-issuable.
- **Concentration risk.** The honest concentration is **Supabase = single primary processor**. This is accepted and mitigated by (a) Postgres portability above, (b) the integrity ledger, and (c) the planned backup/restore evidence (B.1). For a one-person micro-entity, single-primary-processor is a reasonable, documented position rather than a finding to hide.

---

## 6. Open supplier-agreement actions (flagged)

These mirror and feed the certification-readiness checklist (`13-certification-readiness-checklist.md`, owner-action **B.3**). Each is an **owner action** — only the account holder (關進杰) can execute supplier-contract acceptance.

| Action | Control | Owner | Status |
|--------|---------|-------|:------:|
| **A1 — Sign the Supabase DPA** and file the executed copy reference here. Confirm and record the **data residency region** for PDPO cross-border disclosure. | A.5.20/A.5.23/A.5.34 | 關進杰 | ⏳ Open (B.3) |
| **A2 — Confirm OneSignal data handling**: review their DPA, confirm what notification-payload content is retained/logged, and confirm/record that no PII fields are sent (already true in code). File the conclusion here. | A.5.20/A.5.21 | 關進杰 | ⏳ Open |
| **A3 — Confirm OpenRouter/Anthropic (→ kimi-k2) data handling**: confirm **data-retention** and **opt out of any training-on-input**, given `<site_data>` is sent to the model. Record the outcome; if not satisfactory, keep AI 站長 disabled by default per project. | A.5.21/A.5.23/A.5.34 | 關進杰 | ⏳ Open |
| **A4 — Record Apple (DPLA) + Codemagic + GitHub** as supply-chain-integrity dependencies and enable **account MFA** on each (B.2). | A.5.21/A.8.2 | 關進杰 | ⏳ Open (B.2) |
| **A5 — Backup/exit drill**: perform the B.1 Supabase Pro upgrade + one evidenced test-restore (also the §5 portability proof). | A.5.23/A.8.13 | 關進杰 | ⏳ Open (B.1) |

---

## Revision history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial issue. Sub-processor register (Supabase, OneSignal, Apple, Codemagic, OpenRouter/Anthropic→kimi-k2, HKO), cloud-services security assessment, exit/portability note, and open supplier-agreement actions, grounded in live CK evidence (`supabase/`, `src/`, `codemagic.yaml`). |

*Maintained by 關進杰. Next review: 2027-06-18 or on material supplier change.*
