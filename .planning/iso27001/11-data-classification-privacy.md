# 11 — Privacy & PII Protection + PDPO Privacy Notice (A.5.34)

> **Document Owner:** 關進杰 (Kwan Chun Kit) — ISMS Owner / Top Management / sole operator of CK工程 (CK Construction)
> **Standard mapping:** ISO/IEC 27001:2022 Annex A — **A.5.34** (Privacy and protection of PII), supported by **A.5.33** (Protection of records), **A.5.12/A.5.13** (Classification & labelling), **A.8.3** (Information access restriction), **A.8.10** (Information deletion), **A.8.11** (Data masking), **A.8.12** (Data leakage prevention)
> **Legal basis (HK):** Personal Data (Privacy) Ordinance — 個人資料（私隱）條例, **Cap. 486** ("PDPO"), and its six Data Protection Principles (DPP1–DPP6)
> **Version:** 1.0 · **Date:** 2026-06-18 · **Classification:** 內部 (Internal) — Part B (§9, the public Privacy Notice) is 公開 (Public) once published
> **Next review:** 2027-06-18 (or on any change to the PII inventory, RLS narrowing, sub-processor list, or PDPO/OPCPD guidance)

---

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-18 | 關進杰 (ISMS Owner) | Initial issue. Part A: as-built PII inventory (phone, name, company, role, green-card credential, OneSignal push IDs, signature blobs, site contacts, photo GPS metadata), the v17/v31 RLS narrowing, retention, and the reconciliation between Apple-approved account deletion and the immutable `audit_ledger`. Part B: PDPO-aligned public Privacy Notice draft. Grounded in the live CK codebase (`supabase/`, `src/`) as of git `e8b2a3a`; gaps reconciled to `13-certification-readiness-checklist.md`. |

---

## 1. Purpose & scope

This document is CK工程's **topic-specific policy for the protection of personally identifiable information (PII)** under ISO/IEC 27001:2022 control **A.5.34**, and the source-of-truth for the public **PDPO Privacy Notice** (Part B, §9).

It exists so that CK can demonstrate — to an ISO auditor, to the Hong Kong Privacy Commissioner for Personal Data (PCPD / 私隱專員公署), and to any user or court in a site dispute — that:

- CK knows exactly **what personal data it holds, why, and where** (the inventory, §3);
- access to that data is **narrowed by row-level security**, not merely by application logic (§4);
- the data has a **defined lifecycle and a legitimate, Apple-reviewed deletion path** (§5–§6);
- the irreversible tension between *the data-subject's right to erasure* and *CK's duty to keep a tamper-evident dispute record* is **resolved deliberately and lawfully** (§6.3), not by accident.

**Scope.** The CK Construction app (React 18 + TS web bundle, packaged on iOS via Capacitor 8 and Android, live on the iOS App Store and Android) and its Supabase backend (`https://syyntodkvexkbpjrskjj.supabase.co`: Postgres + RLS, GoTrue Auth, Storage, Realtime, Edge Functions), plus the sub-processors that handle this data (§7).

**Roles under PDPO.** CK工程 (operator: 關進杰) is the **data user (資料使用者)** for the PII it determines the purpose and manner of using. Supabase, OneSignal, Apple, Codemagic, and OpenRouter→Anthropic/moonshotai act as **data processors / sub-processors** acting on CK's instructions (§7). This is a single-operator organisation: **關進杰 is simultaneously the data user, the only system administrator, the developer, and top management.**

This document states honestly **what CK implements today**, **what is built but flag-disabled**, and **what is a gap** (§8). Every non-trivial claim cites a real file, table, RPC, or migration.

---

# PART A — Internal PII Protection (A.5.34)

## 2. Data classification of PII (A.5.12 / A.5.34)

CK uses a simple three-tier classification consistent with the ISMS scope document. PII falls into the top two tiers:

| Tier | zh-HK | Meaning | Examples in CK |
|---|---|---|---|
| **Confidential PII** | 機密個人資料 | Personal data whose disclosure could harm a data subject or expose CK to a PDPO complaint | Phone number (the login identifier), green-card credential number + expiry, e-signature image blobs |
| **Internal PII** | 內部個人資料 | Personal data legitimately shared within a project team | Display name, company, role, OneSignal push ID, photo GPS metadata, site-contact details |
| **Public / non-PII** | 公開 | Project names, progress percentages, non-personal records | (out of scope of this document) |

There is **no biometric, no HKID-card image, no financial-account, no health, and no payment data** stored by CK. The green-card field (S20 安全卡) is a HK construction-industry safety-training credential number, not a HKID. VO quotations are in HKD but are commercial, not personal, data.

---

## 3. PII inventory (A.5.34 — "identify and document")

The authoritative PII store is the Postgres `user_profiles` table (one row per account, keyed `id = auth.uid()`), defined in `supabase/v2-schema.sql:21-33` and extended by later migrations. Type fields mirror the SQL columns verbatim in `src/types.ts` (project convention). The full inventory:

| # | PII element | Where stored | Source | Purpose | Tier | Evidence |
|---|---|---|---|---|---|---|
| P1 | **Phone number** (HK 8-digit) | `user_profiles.phone` (unique, not null) | User at signup | Login identifier; the only contactable identity | Confidential | `supabase/v2-schema.sql:21`, `idx_user_profiles_phone` `:55` |
| P2 | **Display name** | `user_profiles.name` (not null) | User | Show "who did what" on every record (the core audit-trail value) | Internal | `supabase/v2-schema.sql:22` |
| P3 | **Company** | `user_profiles.company` (nullable) | User | Identify which 判頭 / 承建商 a person belongs to | Internal | `supabase/v2-schema.sql:27` |
| P4 | **Global role / sub-role** | `user_profiles.global_role`, `sub_role` | Self-selected at signup; role changes admin-only | RBAC; determine site rights | Internal | `src/types.ts:1-11`; role-change guard `supabase/v17-…:63-74` |
| P5 | **Green-card credential** | `user_profiles.green_card_no`, `green_card_expiry` (nullable) | User / onboarding | Prove a worker holds a valid 平安卡/safety credential before site entry | Confidential | `supabase/v48-onboarding-greencard-push.sql:14-15` |
| P6 | **OneSignal push player ID** | `user_profiles.onesignal_id` (nullable) | Device push registration | Route SI/VO/PTW push notifications to the right device | Internal | `src/lib/push.ts:127,155`; cleared on logout `:183` |
| P7 | **E-signature image (Base64)** | `permit_signoffs.signature_b64`, `form_signoffs.signature_b64` | User draws on device | Non-repudiation of PTW / equipment sign-off (勞工處 dispute) | Confidential | `supabase/v10-ptw-schema.sql:128,497-498`; `supabase/v60-sign-reauth.sql:147-148,207-210` |
| P8 | **Credential snapshot at signing** | `form_signoffs.credential_snapshot` (+ `signed_by`) | Captured at sign time | Bind the signer's then-current credential to the signature for dispute proof | Confidential | `supabase/v60-sign-reauth.sql:188-210` |
| P9 | **Site-contact details** | `contacts.name`, `contacts.phone` (+ optional role/company) | PM/foreman enters | Project phone-book (replaces WhatsApp contact-sharing) | Internal | `supabase/v11-contacts-schema.sql:16-18` |
| P10 | **Photo GPS metadata** | `photo_metadata.gps_lat/gps_lng/gps_accuracy_m/captured_at` | Device camera (with consent) | Prove a site photo was taken at the site at the claimed time | Internal | `supabase/v79-photo-metadata.sql:22-32` |
| P11 | **Authored-content authorship** | `created_by` / `approved_by` / `signed_by` FKs across many tables | Derived from actions | The audit trail itself — "who reported / approved / signed" | Internal | `supabase/v6-account-deletion.sql:18-34` |
| P12 | **Synthetic auth identity** | `auth.users` (GoTrue): synthetic email `<digits>@phone.local`, **bcrypt** password hash, session JWTs | GoTrue | Authentication | Confidential (hash only) | `src/lib/phone.ts` (`phoneToEmail`); see §4.4 |

**Not stored as PII by CK:** plaintext passwords (only a bcrypt hash held by GoTrue — the app never stores or sees the plaintext, §4.4); HKID; payment cards; biometrics; health data; precise continuous location (GPS is captured per-photo, on consent, not as a track).

**Free-text fields (residual-PII risk).** Issue descriptions, daily logs, SI/VO notes, and chat-style comments are free text and *could* contain incidental personal data a user types in. These are project-scoped by the same RLS as the records they belong to (§4). CK does not data-mine free text; the AI 站長 feature processes only the data the user submits to it for that request (§7, sub-processor).

---

## 4. How PII access is narrowed (A.8.3 / A.8.11) — the v17 / v31 hardening

PII is protected by **deny-by-default Row-Level Security enforced in the database**, not by the React client alone. The client capability flags are a UX convenience; the database is the security boundary.

### 4.1 `user_profiles` SELECT narrowing (v17) — the headline control

In the original `v2-schema.sql`, **SELECT on `user_profiles` was unrestricted to any authenticated user**. A subcontractor in adversarial testing pulled 25 users' phone numbers and roles in one REST call — a PII leak and a self-promotion vector in the same row (`supabase/v17-user-profiles-rls-hardening.sql:14-15`).

The fix (`v17`) replaced the open policy with a narrow SELECT policy:

```
create policy user_profiles_select on user_profiles for select
  using (
    user_profiles.id = auth.uid()              -- yourself
    or shares_project_with(user_profiles.id)    -- a teammate on a shared project
    or is_pm_of_applicant(user_profiles.id)     -- a PM reviewing your application
  );
```
(`supabase/v17-user-profiles-rls-hardening.sql:137-142`)

So a user can see another person's profile PII **only** if they (a) are that person, (b) share an approved project, or (c) are the PM/admin reviewing that person's pending application. `shares_project_with` / `is_pm_of_applicant` are `SECURITY DEFINER` helpers with `row_security off` so the policy never recurses through `user_profiles` / `project_members` (`v17:79-130`). Admin bulk reads are funnelled through gated RPCs `admin_list_user_profiles()` / `admin_get_user_profile()` (`v17:146-183`, `grant execute … to authenticated` then admin-checked inside).

The **same migration** also stopped self-escalation: a `BEFORE UPDATE` trigger reverts `global_role` / `sub_role` / `phone` / `id` to their OLD values unless the caller is admin; only `name`, `company`, `onesignal_id` remain self-editable (`v17:19-23,63-74`). This is why P1/P4 cannot be altered by the data subject through the write path, while P2/P3/P6 (the legitimately self-service fields) can.

### 4.2 Applicant-list PII minimisation (v31)

A second leak was the applicant list. `v30` let a subcontractor calling `admin_or_pm_list_applicants` receive the **name / phone / company of every pending applicant** on a project, not just the ones they could action (`supabase/v31-applicant-pii-fix.sql:6-15`). `v31` rewrote the RPC so **privileged callers (admin / assigned PM) see all pending applicants, but a non-privileged caller sees nothing** — data minimisation by caller class (`v31:19-89`). The function returns only `name, phone, company` (the minimum needed to approve), never the whole profile (`v31:80`).

### 4.3 Project-scoped PII (contacts, photo metadata, signatures)

- **Site contacts (P9)** are RLS-scoped per project (`contacts` policies, `supabase/v11-contacts-schema.sql`); a user with no membership on the project cannot read its phone-book.
- **Photo GPS metadata (P10)** has explicit `photo_metadata_select` / `photo_metadata_insert` policies restricted to `authenticated` and gated on project visibility (`supabase/v79-photo-metadata.sql:41-51`). The table is **append-only** by design (insert + select grants only), so location evidence cannot be silently rewritten.
- **Signature blobs (P7/P8)** are written only through `SECURITY DEFINER` sign-off RPCs (`close_out_ptw`, `commit_form_signoff`) that bind the signer to the signing moment; the raw `signature_b64` is never client-writable to an arbitrary row.

### 4.4 Auth credential handling (P12) — masking-by-architecture

CK uses **phone+password via a synthetic email** (`<digits>@phone.local`; `src/lib/phone.ts`). The password is submitted directly to GoTrue and stored only as a **bcrypt** hash in `auth.users`; **the CK application never stores, logs, echoes, or transmits the plaintext password to any CK-controlled store.** The sign-time re-auth Edge Function `verify-sign-password` verifies a password against GoTrue without minting a session and **never logs or returns the password** (`supabase/functions/verify-sign-password/`; see `07-cryptography-policy.md` §6.4). Auth failures are mapped to a generic `手機號或密碼錯誤` to prevent user enumeration. This is CK's principal **data-masking / data-leakage-prevention** control for the most sensitive credential.

### 4.5 Storage objects holding PII

Drawings, documents, PTW/SI/issue photos live in **private** Supabase Storage buckets (`public=false`) served only via short-lived signed URLs (TTL 300–3600 s). One honest exception: the `issue-photos` bucket's privacy flip (`supabase/v74-issue-photos-private.sql`) is **staged** pending the client signed-URL shim — see `07-cryptography-policy.md` §6.2 and §8 here.

---

## 5. Retention & deletion (A.5.33 / A.8.10)

| Data class | Retention rule | Deletion trigger |
|---|---|---|
| Account PII (P1–P6, P12) | Held while the account is active | **Immediately and irreversibly** on `delete_my_account()` (§6) |
| Authored-content authorship (P11) | Retained for the **dispute/audit lifetime** of the underlying record even after the author deletes their account | Author FK set to NULL on account deletion (§6.2); the record itself follows project retention |
| Audit ledger hashed image | Retained as a permanent tamper-evident record (legitimate interest — §6.3) | Never deleted; entries are append-only by trigger |
| Push player ID (P6) | Cleared at every logout | `pushLogoutUser()` sets `onesignal_id = null` before sign-out (`src/lib/push.ts:171-183`) |
| Signed-URL access tokens | Ephemeral (300–3600 s TTL) | Expire automatically; not persisted |

**Defined retention period for project records (gap to formalise):** CK has not yet fixed a numeric maximum retention period for completed-project data (e.g. "N years after 完盤"). Under PDPO **DPP-2(2)** personal data must not be kept longer than necessary. A concrete schedule is an owner action tracked in §8 (G-RET) and the readiness checklist.

---

## 6. Account deletion vs. the immutable audit ledger (the key reconciliation)

This is the single most important privacy question for CK and an auditor will look for it.

### 6.1 The deletion path (Apple-reviewed)

`delete_my_account()` runs as definer and **hard-deletes the `auth.users` row**; `ON DELETE CASCADE` then removes `user_profiles`, `project_members`, and push subscriptions (`supabase/v6-account-deletion.sql:42-65`). This flow **already passed Apple App Store review** for account deletion, and any new role (e.g. `safety_officer`) MUST inherit it (Apple-compliance constraint). `v20-delete-account-fk-cascade.sql` fixed a 409 FK error so the cascade resolves cleanly. The function is `revoke`d from `public` and granted only to `authenticated` (`v6:61-62`), and a user can only delete **their own** account.

### 6.2 Why authored content is *set null*, not cascade-deleted

Authorship FKs on shared records (`projects.created_by`, `project_members.approved_by`, and the broader chain widened in `v20`) are declared `ON DELETE SET NULL`, **not** cascade (`supabase/v6-account-deletion.sql:18-34`; `v20:54`). When a user deletes their account:

- their **personal profile PII (P1–P6) is destroyed** — phone, name, company, green-card, push ID all gone with the cascaded `user_profiles` row;
- but the **records they created/approved survive**, with the authorship pointer set to NULL.

The function's own comment states this design: *"Authored projects/approvals have their author reference set to NULL to preserve historical records."* (`v6:64-65`). This is **personal-data minimisation on the project records**: after deletion they are effectively de-identified (the link back to the deleted person is severed), while the operational/dispute record remains intact.

### 6.3 The audit ledger keeps a hashed historical image — lawful basis

The tamper-evident `audit_ledger` (`supabase/v51-audit-ledger-tamper-evidence.sql`) is **append-only and SHA-256 hash-chained** with `AFTER` triggers on 13 critical tables (see `06-access-control-policy.md` §7, `07-cryptography-policy.md` §6.1). By design, a ledger row that recorded a past action **cannot be deleted or edited** without breaking the chain — including when the actor later deletes their account. Therefore a **historical, hashed image of past actions (which may embed an actor's then-`auth.uid()` and the data of the action) persists after erasure.**

This is a deliberate and lawful retention, justified as follows:

- **ISO A.5.33 (Protection of records) + A.5.34:** the ledger is the integrity record that makes the audit trail "survive disputes" — the product's core value. Erasing it would defeat the control.
- **PDPO legitimate basis:** under **DPP-3** personal data may be used for a *directly related* purpose; the ledger's purpose (proving what happened on site) is the same purpose the data was collected for (coordinating and recording site activity). Retention is justified under **DPP-2** as *necessary* for the fulfilment of that purpose and for the establishment/defence of legal claims (a foreseeable construction-dispute or 勞工處 use). PDPO's erasure duty (**s.26 / DPP-2(2)**) is qualified where the data is *required* for a lawful purpose and is *not* kept longer than necessary for it.
- **Minimisation within the ledger:** the ledger stores a **hash chain over canonical record fields**, not a duplicate searchable PII directory; live PII (the phone/name/green-card directory) is destroyed on deletion. What remains is the integrity proof, not a usable contact list.
- **Honest boundary:** the ledger is tamper-**evident**, not tamper-**impossible** (`v51` header). A user's right to erasure of their *account and profile* is honoured in full; what is *not* erased is the immutable proof that certain actions occurred — and CK discloses this to the data subject in the Privacy Notice (§9.6).

**Auditor-facing statement:** CK does not claim a right to refuse all erasure. It honours erasure of identifying profile data and de-identifies authored records (set-null), while retaining only the integrity hash-chain on the legitimate-interest / records-protection basis above. If a data subject formally objects, the ISMS Owner assesses the specific request against PDPO; the structural inability to alter a *past* ledger row is documented as a known property, not a refusal of rights.

---

## 7. Sub-processors handling PII (A.5.34 / PDPO DPP-2(3), DPP-4(2))

| Sub-processor | PII handled | Safeguards on file | Gap |
|---|---|---|---|
| **Supabase** (DB / Auth / Storage / Edge / Realtime) | All P1–P12 | Public **SOC 2 + ISO 27001** attestations; AES-256 at rest, TLS 1.2+ in transit, bcrypt | **No signed DPA on file** (§8 G-DPA) |
| **OneSignal** (push) | P6 push player ID + device, message body | Vendor terms | DPA / data-flow to confirm |
| **Apple** (App Store / TestFlight) + **Codemagic** (build/sign) | Account/device for distribution; no profile DB access | Apple DPA via Developer Program; Team ID `C22JSRYW54` | Codemagic data handling to confirm |
| **OpenRouter → Anthropic / moonshotai (kimi-k2)** (AI 站長) | Only the data a user submits to the AI for that request | Routed server-side via Edge Function; OpenRouter blocks Western providers, Chinese providers used | Confirm no training-on-data; document in `12` |

Sub-processor cross-border transfer is a PDPO **DPP-3 / s.33** consideration; CK's position and the data-flow map are maintained in `12-supplier-and-cloud-security.md` and `05-supplier-and-cloud-register.md`.

---

## 8. Known privacy gaps (honest — reconciled to `13-certification-readiness-checklist.md`)

CK is **self-prepared toward certification readiness, NOT yet certified.** Open PII/privacy gaps:

| # | Gap | Status / owner action |
|---|---|---|
| G-DPA | **No signed Supabase DPA on file** | All at-rest/TLS PII protection (§7) rests on Supabase. Sign the DPA; record OneSignal/Apple/OpenRouter as sub-processors. Owner action — checklist **§B.3**. |
| G-RET | **No fixed numeric retention period for completed-project records** | PDPO DPP-2(2) needs a defined max-retention schedule (§5). Owner action. |
| G-NOTICE | **Privacy Notice (Part B, §9) drafted but not yet published in-app** | Publish the zh-HK notice at signup + a /privacy route; add a PICS (收集個人資料聲明) at the point of collection. Owner action. |
| G-PHOTO | **`issue-photos` bucket privacy flip staged** | `v74` not yet confirmed live-private by execution; legacy photos may be guessable-URL readable until applied. See `07-cryptography-policy.md` §6.2. |
| G-BACKUP | **Free-tier — no PITR / managed backup** | A privacy-relevant *availability* gap (cannot restore wrongly-deleted PII; also bounds breach-recovery). Covered in `08-backup-bcp-dr.md`; checklist **§B.1**. |
| G-MFA | **Step-up MFA + sign-reauth enforcement flags OFF; operator account-MFA not evidenced** | Built (`v52–v54`, `v60`) but disabled by flag; protects PII write paths once enabled. Checklist **§B.2 / §B.4**. |
| G-DSAR | **No formal Data-Subject-Access-Request / breach-notification runbook yet** | Define a PDPO DSAR + PCPD breach-notification procedure (timelines, contact). Owner action. |

---

# PART B — PDPO Privacy Notice (public-facing draft)

> **Note:** This is the **draft** public notice (item G-NOTICE). On publication it becomes a Public document, surfaced at signup and at a `/privacy` route, in Traditional Chinese (zh-HK) with this English reference version. It is written to align with the Hong Kong **Personal Data (Privacy) Ordinance (Cap. 486)** and its Data Protection Principles.

## 9. 私隱政策 / Privacy Notice — CK工程 (CK Construction)

**生效日期 Effective date:** 2026-06-18 · **版本 Version:** 1.0

### 9.1 我們是誰 / Who we are
CK工程（CK Construction）是一個香港建築地盤管理應用程式，由 關進杰 營運。就本應用程式內您的個人資料而言，我們是《個人資料（私隱）條例》（第486章）下的**資料使用者**。

### 9.2 我們收集的個人資料 / What data we collect
We collect only the data needed to run a construction-site coordination service:
- **手機號碼 Phone number** — your login identifier and the way teammates contact you.
- **姓名及公司 Name and company** — so site records show who did what, and which 判頭/承建商 you belong to.
- **角色 Role** — to control what you can see and do on each project.
- **平安卡/安全資格 Safety-credential number and expiry** *(if you provide it)* — to confirm you may work on site.
- **推送通知識別碼 Push notification ID** — to send you SI/VO/permit notifications; cleared when you log out.
- **電子簽名 E-signature** — when you sign a permit (動火證) or equipment form, to prove the sign-off was by you.
- **相片的位置及時間資料 Photo location/time metadata** *(with your consent)* — to prove a site photo was taken at the site at that time.

We do **not** collect your HKID, payment-card, biometric, or health data. Your **password is never stored by us** — it is held only as an encrypted (bcrypt) value by our authentication provider.

### 9.3 用途 / Purpose (DPP-1 & DPP-3)
We use your data only to: operate the site-coordination service; show an accurate, shared audit trail of instructions, permits, drawings, progress, and issues; route notifications; verify safety credentials; and keep a tamper-evident record that can resolve site disputes. We will **not** use your data for a new, unrelated purpose without your consent.

### 9.4 我們如何保護資料 / How we protect it (DPP-4)
- Access is restricted so you can only see people and records on projects you belong to (database row-level security).
- Data is encrypted in transit (TLS) and at rest (AES-256) by our cloud provider.
- High-risk records are protected by a tamper-evident audit log.

### 9.5 保留期 / Retention (DPP-2)
We keep your account data while your account is active. Project records are kept while needed for the project and for any related dispute, then no longer than necessary. When you delete your account, your personal profile (phone, name, company, credential, push ID) is **permanently deleted**.

### 9.6 您刪除帳戶時會發生甚麼 / What happens when you delete your account
You can delete your account in-app at any time; this **permanently erases your profile**. To preserve the integrity of shared site records and the dispute audit trail, records you previously created or approved are **kept but de-identified** (your name is removed and the link to you is severed), and our **tamper-evident audit log retains a one-way hashed record** that those actions occurred. This retention is necessary for the establishment and defence of legal claims and to protect the integrity of construction records; it does not retain a usable copy of your contact details.

### 9.7 您的權利 / Your rights under PDPO (DPP-6, ss.18–24)
You have the right to: (a) **request access** to the personal data we hold about you; (b) **request correction** of inaccurate data; (c) **delete your account** in-app; and (d) make a **data-access or correction request (查閱/改正資料要求)** in writing. We will respond within the statutory period (generally **40 days**) and may charge only a permitted fee for access requests. You may also complain to the **Privacy Commissioner for Personal Data (私隱專員公署 / PCPD)**.

### 9.8 第三方服務商 / Third-party processors
We use trusted processors to run the service: **Supabase** (database, login, file storage), **OneSignal** (push notifications), **Apple / Codemagic** (app distribution and build), and an **AI assistant provider (OpenRouter / Anthropic / moonshotai)** for the optional AI 站長 feature, which only processes what you submit to it for that request. Some of these process data outside Hong Kong.

### 9.9 聯絡我們 / Contact (Data Protection / PDPO requests)
For any privacy request, data-access/correction request, or complaint, contact the operator:
**關進杰 (Kwan Chun Kit)** — `kck980724@gmail.com`.
*(A dedicated privacy contact channel and the in-app DSAR flow are to be finalised — see G-NOTICE / G-DSAR.)*

### 9.10 政策更新 / Changes
We may update this notice; the version and effective date above will change, and material changes will be notified in-app. Next scheduled review: **2027-06-18**.

---

## 10. Compliance, review & references

- **PDPO (個人資料（私隱）條例, Cap. 486)** — DPP-1 (collection), DPP-2 (accuracy & retention), DPP-3 (use), DPP-4 (security), DPP-5 (openness — this notice), DPP-6 (access & correction); ss.18–24 (DSAR), s.26 (erasure), s.33 (cross-border).
- **Review cadence:** reviewed at least annually (next: **2027-06-18**) and on any change to the PII inventory, RLS narrowing, sub-processor list, or PDPO/PCPD guidance.
- **Related ISMS documents:** `00-isms-scope-and-context.md`, `02-statement-of-applicability.md`, `05-supplier-and-cloud-register.md`, `06-access-control-policy.md`, `07-cryptography-policy.md`, `08-backup-bcp-dr.md`, `13-certification-readiness-checklist.md`.
- **Primary evidence:** `src/types.ts`, `src/lib/phone.ts`, `src/lib/push.ts`; `supabase/v2-schema.sql`, `v6-account-deletion.sql`, `v17-user-profiles-rls-hardening.sql`, `v20-delete-account-fk-cascade.sql`, `v31-applicant-pii-fix.sql`, `v48-onboarding-greencard-push.sql`, `v51-audit-ledger-tamper-evidence.sql`, `v60-sign-reauth.sql`, `v74-issue-photos-private.sql`, `v79-photo-metadata.sql`, `v11-contacts-schema.sql`; `supabase/functions/verify-sign-password/`.

**Approved by:** 關進杰 (Kwan Chun Kit), ISMS Owner — 2026-06-18.
