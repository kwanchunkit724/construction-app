# SECURITY UPGRADE PLAN — 身份認證 (anti-takeover) + DB 防篡改 (tamper-evidence)

> Authored by Opus (Fable was 403-blocked mid-run; AUTH-AUDIT.md was salvaged from the one Fable agent that completed). Fable can review this when access is restored.
> Two upgrades, one cohesive plan. **Convenience is a hard constraint** — gate only what's high-risk; everyday actions stay one-tap.
> All changes ADDITIVE + flag-gated. Live iOS users, Apple account-deletion compliance, Supabase + OneSignal free tiers, locked phone+password base all preserved.

---

## ⚠ REVISION v2 — after independent adversarial review (2026-06-12, PLAN-CRITIQUE.md)

An independent review (standing in for 403-blocked Fable) verified every claim against the code and found the original Part A core mechanism **infeasible as written**. The corrections below **SUPERSEDE** the device-key design in §A2 and LOCKED decision 1.

**Part A — pivot to Supabase native MFA (TOTP) as the server-verified factor.**
- WHY: Postgres/pgcrypto **cannot verify ECDSA/RSA signatures** (C1) → a device-key would need an Edge Function; AND **no biometric/keygen Capacitor plugin exists** → hardware keypair = multi-week custom native plugin (C2). Supabase `auth.mfa.*` (TOTP) is **server-verified today**, works with synthetic `@phone.local` (app-to-app, no email/SMS), runs on **web + native**, needs **zero new backend**.
- MECHANISM: approver enrols a TOTP factor once → step-up = verify a 6-digit TOTP → session elevates to **AAL2** → `assert_step_up()` requires `auth.jwt()->>'aal' = 'aal2'` (real server/REST enforcement, no custom crypto, no replay-prone signed nonce).
- YOUR "one-tap" requirement becomes a **fast-follow, not a blocker**: Stage 2 stores the TOTP secret in **biometric-gated secure storage** so Face ID auto-fills the code → one tap, no typing. Needs only a biometric+secure-storage plugin (e.g. `@aparajita/capacitor-biometric-auth`), **not** a custom keypair plugin or Edge Function.
- STAGING: **Stage 1** = TOTP (ships fast, server-enforced) → **Stage 2** = biometric auto-fill (one-tap polish).

**Part A must-fixes folded in:** TOTP codes are inherently single-use (fixes replay C3); web build uses code entry, same factor, no biometric (H4); lost-device recovery = **Supabase MFA recovery codes** (generated at enrol, user stores offline) + admin-assisted re-enrol that is ledger-logged, requires the user re-verify login password, and notifies an admin — NOT just a push to the lost phone (H1); Apple escape hatch — account deletion stays available even if the user never enrolled / uses a recovery code (M4); enrolment = **deferred prompt on first high-risk action** with a short grace window, not a forced wall (M2); **Approval PIN DROPPED** in favour of TOTP + recovery codes (removes the "any-device PIN" weakness H3 and the missing rate-limit infra).

**Part B — ships as designed with 2 fixes:** canonical JSON for the hash input — `to_jsonb(NEW)::text` / fixed-order `jsonb_build_object` so key ordering is deterministic (M6); **DROP the "daily email anchor"** claim (synthetic emails undeliverable) — keep in-app `verify_integrity()` + exportable JSON proof (M3).

**Net effect:** Phase 0 (membership RLS bug fix + password floor) and Phase 1 (Part B ledger) are unblocked, ship as-is. Part A is now **buildable on the current stack** — TOTP Stage 1 needs no new infra; biometric Stage 2 needs one community plugin.

---

## 0. Why now (the problem, in one line)

Today **the password IS the signing authority.** One stolen phone+password = approve SIs, sign 動火證/PTW, approve HKD VOs, mint roles, delete the account — with nothing re-verifying the human (AUTH-AUDIT §3). And **any record can be altered via the Supabase dashboard / service-role key with nobody noticing** — there is no tamper-evidence (DB recon below). Both are exactly the trust gaps a 判頭/工地主任/政府客 will poke at.

---

# PART A — 身份認證 (step-up identity, anti-takeover)

## A1. Threat model — what a stolen password must NOT be enough to do
- Approve / reject / edit SI · VO · PTW (sign-off)
- Edit an approval chain, staff a safety_officer, approve memberships, change roles
- Hard-delete the account
- (Lower bar, session-only OK: read data, tick own progress, draft a daily, comment)

## A2. The core mechanism — server-verifiable, device-bound, biometric-gated step-up

The hard part: a biometric tap is **on-device** — the server can't trust "the UI says Face ID passed." So biometric **alone** is theatre. We make the second factor a thing the **server can verify**:

**Device-bound keypair (passkey-lite).** On enrolment the app generates a keypair; the **private key lives in iOS Keychain / Android Keystore (secure hardware), unlock-gated by Face ID / fingerprint**; the **public key is registered server-side** against the user + device. To perform a high-risk action:
1. Server hands the app a one-time **nonce** (`mint_step_up_challenge` RPC).
2. App asks for **biometric**, which unlocks the private key, which **signs the nonce**.
3. App sends the signature → `redeem_step_up(challenge_id, signature)` verifies it against the registered public key → mints a short-lived **step-up grant** (row in `step_up_grants`, TTL ~5 min, scoped to user + action-class).
4. Every high-risk RPC calls `assert_step_up(action_class)` at the top → requires a valid unexpired grant, else `raise`.

Why this hits all four goals:
- **Anti-takeover:** a thief with only the login password lacks the device's private key (biometric-gated, in secure hardware) → cannot mint a grant → cannot approve/sign/delete. ✅ server-enforced, not client theatre.
- **Phishing/stuffing resistant:** the factor never leaves the device; nothing typed to steal.
- **Low friction:** one Face ID tap; the 5-min grant lets you clear several SIs in a row without re-tapping.
- **Device binding:** the key is the device.

**Fallbacks (recovery, no new hole):**
- **Approval PIN** (separate from login password, server-stored as Argon2/bcrypt hash) for devices without biometric, or as a backup factor. Verified by `redeem_step_up_pin(pin)` → same grant. Rate-limited + lockout.
- **Lost device / re-enrol:** requires step-up from another enrolled device, OR an admin-assisted re-enrol that is itself logged to the ledger (Part B) and notified to the account owner via push — so re-enrol can't be a silent takeover.

**Alternative considered (documented, not chosen as primary): Supabase native MFA (TOTP).** Server-verifiable, works without real email/SMS (synthetic email), simpler to build — but higher friction (user reads + types a 6-digit code every step-up) and no device-binding UX win. Keep as an **optional** factor a user can add, but recommend device-key+biometric as the default because it's far lower friction for the daily approver. (Note: Supabase's built-in `reauthenticate()` is **unusable** here — it emails an OTP, and our emails are synthetic `@phone.local`.)

## A3. Action → required tier (map every sensitive action)

| Action | Tier | Notes |
|---|---|---|
| Read anything, tick own progress %, draft/save daily, comment, upload a draft doc | **Session only** | unchanged — zero new friction |
| Submit an SI/VO/PTW (author side) | **Session only** | submitting ≠ approving |
| **Approve / reject / approve-with-edits SI** | **Step-up** | grant action-class `approval` |
| **Approve / reject VO** (HKD) | **Step-up** | + show amount in the confirm sheet |
| **PTW / 動火證 sign-off** (`record_ptw_signoff`) | **Step-up** | safety-critical |
| **admin_override** on an approval | **Step-up** | admin |
| **Edit approval chain** (`save_chain_steps`) | **Step-up** | re-shapes who can sign |
| **Assign safety_officer** (`pm_assign_safety_officer`) | **Step-up** | staffs a signer |
| **Approve/reject membership**, change role (`admin_update_user_role`) | **Step-up** | grants standing access |
| **Approve/reject/withdraw document version** | **Step-up** | controlled record |
| **Delete progress item (hard delete)** | **Step-up** | destructive |
| **Delete account** (`delete_my_account`) | **Step-up (+ explicit re-confirm)** | irreversible; Apple-compliant (deletion still available, just confirmed) |

Everything not listed = session only. ~12 RPCs gain `assert_step_up(...)`; the other ~50 are untouched.

## A4. Convenience guarantees (so it doesn't become 麻煩)
- **One tap, then a 5-min window** — approve a batch of SIs after a single Face ID.
- **Biometric, not password** — no typing on the hot path.
- **Trusted device remembered** — enrol once per device.
- **Only high-risk gated** — daily progress/logs/comments unchanged.
- **Graceful fallback** — no biometric hardware → Approval PIN; never a dead end.
- **Clear copy** — the confirm sheet says exactly what's being authorised (e.g. "批准 VO-007 · HK$48,000").

## A5. Server enforcement discipline (so REST can't bypass the UI)
- A SINGLE `assert_step_up(p_action_class text)` helper, called at the **top of every high-risk RPC** — the UI tap is irrelevant; the DB refuses without a valid grant.
- Grants are **short-TTL, single-use-class, user-scoped**, minted only by signature/PIN verification, stored server-side.
- A test (Haiku) hits each high-risk RPC over raw REST **without** a grant → must `raise`. This is the anti-theatre proof.

## A6. Quick wins folded in (cheap, high value)
1. **Fix the membership RLS `with check` bug** (AUTH-AUDIT §3.5): add `with check` to the `project_members` UPDATE policies so an approver can only set `status`, never escalate `role`. (Real defect, ship regardless.)
2. **Raise password floor** 6 → 8+ with a basic breach/complexity nudge at signup (keep login untouched for existing users).
3. **Re-enrol / new-device + role-change → push the account owner** ("有人喺新裝置登記簽核" / "你嘅角色被更改") so silent takeover is visible.

---

# PART B — DB 防篡改 (tamper-evident ledger)

## B0. Current state (recon)
- Critical workflow tables (SI/VO/PTW/approvals/documents/progress) are **RPC-gated** for writes — good. History tables (`progress_history`, `issue_comments`, `document_events`, `approvals`) have **no client UPDATE/DELETE policy** → client-append-only. `contacts/dailies/events/materials` allow direct owner UPDATE/DELETE.
- **But:** RLS does NOT bind the **service-role key / Supabase dashboard**. Anyone with that key can edit or delete ANY row — including "immutable" history — and **nobody would notice**. There is **no hash-chaining, no tamper-evidence** anywhere.

## B1. Design — hash-chained append-only ledger
Table `audit_ledger(seq bigserial pk, occurred_at, actor_id, table_name, row_pk, action, payload jsonb, prev_hash bytea, hash bytea)`.
- `hash = sha256(seq || occurred_at || actor_id || table_name || row_pk || action || canonical(payload) || prev_hash)`; first row chains off a fixed genesis.
- Written by **AFTER INSERT/UPDATE/DELETE triggers** on every critical table → fires for ALL writers, **including service-role/dashboard edits** (triggers run regardless of RLS). So a dashboard edit is either logged (if on a watched table) or, if someone tampers with a *past ledger row*, the chain breaks.
- **Immutable:** ledger BEFORE UPDATE/DELETE trigger `raise`s; `REVOKE INSERT/UPDATE/DELETE on audit_ledger FROM authenticated, anon`; only the trigger (definer) appends. RLS: deny all direct client access; reads via a gated `verify_integrity()` / export RPC only.

## B2. Verification + proof
- `verify_integrity(p_from seq default 0)` → walks the chain, recomputes each hash, returns `{ intact: bool, break_at: seq|null, head_seq, head_hash, count }`. One click in an admin/owner screen → green "完整" or red "喺第 N 筆斷咗".
- **Exportable proof:** export `{head_seq, head_hash, occurred_at}` (+ optional full chain) the client keeps offline. Optional **daily anchor**: push/email the day's head hash to the project owner — an external timestamped witness, so even a full-DB rewrite can't match yesterday's witnessed hash.
- (Hardening note: a Postgres superuser could disable triggers to write unlogged. We can't stop that on managed Supabase, but **they can't do it silently** — disabling/re-enabling, or editing any past row, breaks the chain and `verify_integrity` flags it. The honest client story is *tamper-EVIDENT*, not tamper-impossible.)

## B3. Client-convincing narrative (zh-HK)
> 「每一個改動都會封入一條密封嘅記錄鏈，環環相扣。**改或者刪任何一筆舊記錄，條鏈即刻斷**，我哋一 click `驗證` 就查得到喺邊度被郁過。連我哋自己用後台改都唔例外 —— 改完條鏈對唔上。我哋仲可以**導出加密證明**，每日封存一個指紋，第三方都核實到你嘅資料由頭到尾冇被篡改。」

---

# IMPLEMENTATION ROADMAP (model-tagged, phased, flag-gated)

> Flag `security_v2_enabled` (app_config, default OFF — same pattern as files/PTW flags). Ship dark, enable per-project, then global.

**Phase 0 — Quick wins (no new infra)** · ~0.5 day
- [Opus] Fix membership UPDATE `with check` RLS (A6.1). [Haiku] REST test: PM can flip status, CANNOT change role.
- [Opus] Password floor 6→8 + signup nudge (A6.2). [Haiku] signup validation test.

**Phase 1 — DB tamper-evident ledger (Part B)** · ~2–3 days
- [Opus] migration: `audit_ledger` + hash trigger fn + immutability trigger + grants/RLS + triggers on critical tables (approvals, si/vo/ptw versions, document_versions, document_events, progress_history, project_members, user_profiles role cols).
- [Opus] `verify_integrity()` + `export_ledger_proof()` RPCs.
- [Opus] UI: admin/owner "資料完整性" screen (verify button + head hash + export).
- [Haiku] tests: chain intact after N writes; manual row edit → `verify_integrity` reports the break; ledger UPDATE/DELETE rejected.
- [Fable when back] review hash canonicalisation + threat coverage.

**Phase 2 — Step-up core (Part A, server)** · ~3–4 days
- [Opus] migration: `user_security_keys` (pubkey/device), `step_up_grants`, `mint_step_up_challenge` / `redeem_step_up` (sig verify) / `redeem_step_up_pin` / `assert_step_up` RPCs; pgcrypto for verify. Append all step-up events to the ledger.
- [Opus] add `assert_step_up(<class>)` to the ~12 high-risk RPCs (A3).
- [Haiku] **anti-theatre REST tests**: each high-risk RPC without a grant → rejected; with expired grant → rejected; valid grant → ok.

**Phase 3 — Step-up client (Part A, app)** · ~3–4 days
- [Opus] enrolment flow (generate device key → Keychain/Keystore via a Capacitor biometric/secure-storage plugin → register pubkey); `StepUpContext` + a reusable `<StepUpGate>` confirm sheet (Face ID → sign nonce → grant); Approval PIN set/verify fallback; wire the sheet into the ~12 action call sites.
- [Opus] owner/role-change/new-device push notifications (A6.3).
- [Haiku] UI flow tests (biometric mock, PIN fallback, grant-window reuse).
- [Fable when back] UX-friction review against A4 guarantees.

**Phase 4 — Rollout** · ~1 day
- Enable flag per pilot project → monitor → global. Docs: a one-page 廣東話 「點解你啲資料改唔到 + 點解冇你部機批唔到」 for client demos.

## Constraints honoured
Additive migrations only (no destructive change to `progress_leaf_items`/`user_profiles`); login stays phone+password (step-up is additive); account deletion stays available (Apple) but step-up-confirmed; free tiers (ledger is small text, push budget: only owner/role/new-device events); zh-HK throughout.

## Risk table
| Risk | Mitigation |
|---|---|
| Miss `assert_step_up` on one RPC → REST bypass | single helper + Haiku tests every high-risk RPC over raw REST |
| Biometric not in secure hardware (weak) | require Keychain/Keystore-backed plugin; reject if unavailable → PIN |
| Lost device lockout | Approval PIN + admin-assisted re-enrol, both ledger-logged + owner-notified |
| Offline approvals | step-up needs network to mint grant → approvals are online-only (acceptable) |
| Superuser disables ledger triggers | can't be silent — chain break is detectable; document as tamper-EVIDENT |
| Over-engineering | only 12 actions gated; everything else untouched; TOTP offered as simpler opt-in |

## Decisions — LOCKED (user, 2026-06-12)
1. **Primary step-up factor:** ~~device-key + biometric~~ → **REVISED to TOTP-first** after review found device-key infeasible (see REVISION v2). **Server factor = Supabase MFA TOTP (AAL2)**; the one-tap **biometric auto-fill is Stage 2** on top of the same TOTP. ⏳ *Pending user confirm of this pivot.*
2. **Grant window:** 5 min / batch-friendly (default — revisit if needed).
3. **Roles that must enrol:** ✅ **approvers only** — PM, main_contractor, safety_officer, general_foreman, admin. `subcontractor_worker` + `owner` exempt (no daily friction).
4. **Approval PIN length:** 6 digits (fallback only).
5. **Gate before building:** ⏸ **wait for Fable review of this plan before any execution** (user). Fable was 403-blocked at plan time — review pending Fable access.
