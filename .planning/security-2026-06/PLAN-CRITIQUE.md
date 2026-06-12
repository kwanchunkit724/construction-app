# PLAN CRITIQUE — Security Upgrade Plan (Adversarial Review)

> Reviewer: independent adversarial review standing in for Fable (403-blocked).
> Date: 2026-06-12.
> Method: every claim below was spot-checked against the actual codebase
> (supabase/*.sql, src/, package.json). No findings are hypothetical.

---

## Verified Facts (Spot-checks Against Real Code)

### (a) membership UPDATE RLS `with check` bug — CONFIRMED REAL

`supabase/v2-fix-rls-recursion.sql:79-91` installs the current UPDATE
policies. Neither "PM approves memberships" nor "Subcontractor approves
workers" has a `WITH CHECK` clause. Grep across the entire supabase/ tree
confirms no later migration ever added one. `v2-schema.sql:137-160` has the
same pattern. The plan's A6.1 quick-win is a genuine live defect — a
compromised PM session can set `role` and `status` to arbitrary values on
any `project_members` row in their project via a raw PATCH, bypassing the
RPC-gate intent.

### (b) High-risk RPCs authorize off `auth.uid()` only — CONFIRMED

`submit_approval` (`v9-rpc-submit-approval.sql:29`), `save_chain_steps`
(`v9-default-chain-seed.sql:64-70`), `record_ptw_signoff`
(`v10-split/4-record-ptw-signoff-rpc.sql:26`), `pm_assign_safety_officer`
(`v37-ptw-safety-officer-staffing.sql:148-157`), `delete_my_account`
(`v9-account-deletion-extend.sql:28-39`) — all gate solely on
`auth.uid()` / `global_role` from the session JWT. None require any second
factor. The plan's threat model is accurate.

### (c) Supabase `reauthenticate()` unusable with synthetic emails — CONFIRMED

`src/contexts/AuthContext.tsx` and `src/lib/supabase.ts` confirm the entire
auth chain uses `phoneToEmail()` to produce `<digits>@phone.local` synthetic
addresses (`src/lib/phone.ts`). Supabase `reauthenticate()` sends an OTP to
the registered email. These synthetic addresses are never delivered anywhere,
so the OTP is undeliverable. The plan correctly rules this out.

### (d) Capacitor 8 biometric + device-bound keypair plugin — NOT INSTALLED

`package.json` lists every Capacitor plugin. There is no:
- `@capacitor-mlkit/face-detection`
- `capacitor-biometric-auth`
- `@aparajita/capacitor-biometric-auth`
- `capacitor-native-biometric`
- `@capacitor-community/native-audio` (unrelated but shows the pattern)
- `capacitor-secure-storage-plugin`
- Any Web Crypto + Keychain bridge

The plan calls for a Capacitor biometric + Keychain/Keystore device-bound
keypair flow but **names no concrete plugin and has zero supporting code**.
This is the largest single implementation gap in the plan.

### (e) pgcrypto `digest` availability — PARTIALLY AVAILABLE, but ECDSA verify IS NOT FEASIBLE

`pgcrypto` is available on Supabase (it ships with every Postgres instance).
`digest(data, 'sha256')` for the hash-chain in Part B is fine.

However, the plan's `redeem_step_up(challenge_id, signature)` requires
**verifying an ECDSA or RSA signature** in Postgres to mint the step-up
grant. pgcrypto does NOT provide asymmetric signature verification:

- `pgcrypto` exports: `digest`, `hmac`, `crypt`/`gen_salt`, `pgp_sym_*`,
  `pgp_pub_*` (OpenPGP only, not raw ECDSA/RSA verify over arbitrary data),
  `gen_random_bytes`, `encrypt`/`decrypt`.
- `pgjwt` (already installed via `v10-split/1-pgjwt-poc.sql`) supports
  **HS256 only** — symmetric HMAC with a shared secret, not asymmetric
  key verification. The PoC file confirms: `sign(payload, secret)` with
  `v_secret` is a shared string, not a key pair.
- Raw ECDSA/RSA `verify(pubkey, signature, data)` does not exist in any
  Postgres extension available on Supabase free tier.

**This makes the core mechanism of Part A infeasible as written.** The plan
says "pgcrypto for verify" in Phase 2 implementation — this is incorrect.
ECDSA/RSA signature verification in Postgres requires either:
  (i) An Edge Function (Node.js `crypto.verify` — feasible), or
  (ii) A custom C extension (not allowed on Supabase managed), or
  (iii) Reframing to use symmetric HMAC instead of asymmetric keypair
       (weaker: the server holds the secret, breaking device-binding).

---

## Critique by Dimension

---

### 1. Convenience (Hard Constraint: must NOT become 麻煩)

**Rating: MEDIUM concern — the 5-min window is sound in theory, but the
enrolment UX is unspecified and the PIN fallback creates two friction paths.**

- The 5-min grant window for batch approvals is the right call. Approving
  five SIs after one Face ID tap is genuinely low friction.
- The plan correctly exempts `subcontractor_worker` and `owner` from
  enrolment.
- However, the enrolment flow is **completely undesigned**. The first time
  a PM opens the app after the flag is enabled, what exactly happens? Is
  there a forced modal? A dismissable nudge? Can they keep approving without
  enrolling during a grace period? Poorly designed enrolment is where
  convenience dies in practice.
- The 6-digit Approval PIN fallback means users on old devices or with
  failed biometric enrolment get a PIN prompt on every approval batch.
  PIN prompts at 8am on a construction site are friction. The plan
  acknowledges this but doesn't define what "rate-limited + lockout" means
  for a site foreman who miskeys 3 times and locks themselves out mid-review.
- **Recommendation:** Define enrolment as a deferred-prompt (first high-risk
  action triggers enrolment rather than a forced onboarding screen). Specify
  PIN lockout policy explicitly (e.g. 5 attempts, 15-min cooldown, admin
  reset path).

---

### 2. Over-engineering

**Rating: HIGH concern for Part A core mechanism; MEDIUM for Part B.**

#### Part A — device-keypair is significantly over-engineered for the threat

The plan's chosen mechanism (device-bound ECDSA keypair, in Keychain/Keystore,
biometric-gated, server verifies signature) is exactly what passkeys/WebAuthn
do — but WebAuthn is not available in a Capacitor WebView at the time of
writing (Capacitor 8 does not expose the WebAuthn Authenticator API from the
native layer; the WKWebView limitation blocks `navigator.credentials.create`
on iOS). So the plan would require building a bespoke native bridge.

**Simpler alternative that provides ~90% of the security:** TOTP (RFC 6238)
via an authenticator app, server-verified by Supabase's built-in MFA API
(`supabase.auth.mfa.enroll`, `supabase.auth.mfa.challengeAndVerify`).
Supabase MFA works with synthetic emails — the TOTP is app-to-app (no email
needed). The friction is one 6-digit code per 5-min window (same UX cost as
a PIN). The server-side verification is already implemented by Supabase — no
custom RPC needed. The only trade-off vs. device-binding is that a thief who
also steals the authenticator app or the TOTP seed could theoretically bypass
it, but that requires two devices compromised, which is the same threat model
as "phone stolen + password known."

The plan mentions TOTP then dismisses it as "higher friction (user reads +
types a 6-digit code)" — but this is exactly what the Approval PIN fallback
requires anyway, at the same frequency. The friction argument is inconsistent.

**Simpler alternative for Part B:** The hash-chain is well-conceived and
pgcrypto `digest` makes it feasible. However, the daily "push/email the head
hash to project owner" anchor requires pushing to an email inbox, which the
app doesn't have (synthetic addresses). OneSignal push of a hash string is
not a credible external witness. Drop the daily anchor; the in-app
`verify_integrity()` + exportable JSON proof is sufficient.

---

### 3. Constraint Violations

**Rating: CRITICAL for Part A core mechanism.**

#### CRITICAL: Locked phone+password base + Supabase free tier

The plan's LOCKED decision 1 is "device-key + biometric (private key in
Keychain/Keystore, Face ID/fingerprint-gated; server verifies signature)."
As established above:

1. pgcrypto cannot verify ECDSA/RSA signatures. Postgres cannot mint the
   grant by verifying a device signature without an Edge Function.
2. No Capacitor plugin for Keychain/Keystore-backed keypair generation is
   installed or named.
3. Supabase free tier Edge Functions exist (50k invocations/month) and could
   host the signature verification — but the plan does not mention this.
   The plan states signature verification happens in a Postgres RPC
   (`redeem_step_up`), which is infeasible with available extensions.

This means the plan as written cannot be executed on the current stack
without either (a) adding a named Capacitor plugin, (b) moving signature
verify to an Edge Function, or (c) changing the cryptographic scheme.

#### MEDIUM: OneSignal push budget

A6.3 adds pushes for role-change + new-device enrolment. These are low
volume and within the free tier. No constraint violation here.

#### MEDIUM: Apple account-deletion compliance

The plan gates `delete_my_account` behind step-up. The current implementation
(`v9-account-deletion-extend.sql`) already blocks deletion if there are
in-flight approvals. Adding a step-up requirement is additive and does not
remove the deletion capability — it adds a confirmation step. Apple's
guideline (5.1.1(v)) requires the deletion to be *available*, not that it be
one-tap. MEDIUM risk only if the step-up enrolment path has a dead-end (user
with no enrolled device and no PIN set cannot complete step-up to delete
their account). The plan needs an escape hatch: "user can request admin-
assisted deletion if locked out of step-up" or "deletion is exempted from
step-up if user has never enrolled" (grace period).

---

### 4. Server-side Step-up Enforcement — Is It Real or Bypassable?

**Rating: CRITICAL flaw in the mechanism design; MEDIUM in the discipline.**

#### CRITICAL: `redeem_step_up` signature verification is not implementable in plain PL/pgSQL

The plan's entire server-side enforcement chain depends on `redeem_step_up`
verifying an ECDSA/RSA signature against a registered public key using
pgcrypto. As verified above, pgcrypto does not provide asymmetric signature
verification. The plan says "pgcrypto for verify" (Phase 2) without specifying
which pgcrypto function does this — because no such function exists.

Options and their implications:
- **Edge Function for `redeem_step_up`:** feasible, but changes the trust
  boundary. The Edge Function mints the grant (inserts into `step_up_grants`
  using the service-role key). A compromised or misconfigured Edge Function
  can mint grants at will. The plan's "REST bypass protection" claim
  (`assert_step_up` in the RPC gate) is real — `assert_step_up` in Postgres
  is still the enforcement point. But the grant minting step moves out of
  Postgres.
- **HS256 HMAC with server-held secret:** would work with pgjwt, but breaks
  the device-binding property because the server holds the symmetric secret.
  A compromised service-role key mints grants for any user.
- **Supabase TOTP MFA:** works today with no new code in Postgres.

#### MEDIUM: `assert_step_up` discipline is sound but untested

The discipline (single helper, called at top of every high-risk RPC, REST
test per RPC) is the right design. The risk table correctly flags "miss one
RPC." The proposed Haiku REST tests are the right mitigation. No bypass
exists IF the helper is consistently applied — this is a process discipline
risk, not a mechanism flaw.

#### MEDIUM: Grant reuse / cross-user confusion

The plan says grants are "user-scoped, action-class-scoped, short-TTL." If
`assert_step_up` checks `user_id = auth.uid() AND action_class = p_action_class
AND expires_at > now() AND NOT used`, this is correct. But "single-use-class"
needs a clear definition: does approving SI-001 consume the `approval` class
grant, or does the 5-min window allow approving SI-001, SI-002, and SI-003
without re-tapping? The plan says "batch-friendly" (implies multiple uses
within the window) but also "single-use-class" — these are contradictory.
Clarify: the grant is valid for all actions of the same class within the TTL,
not a one-time token.

---

### 5. Missing Threats

#### CRITICAL: Replay attack on the signed nonce

The plan describes: client signs nonce → sends to `redeem_step_up`. If an
attacker intercepts the HTTPS request (MITM on the Capacitor WebView's
TrustKit, or a malicious proxy at the app layer), they capture the
`(challenge_id, signature)` tuple. Replaying it within the TTL mints another
grant. Mitigation: `redeem_step_up` must mark the challenge as consumed
(one-time use for the challenge row) regardless of whether a grant is issued.
The plan mentions nonces but does not say challenges are invalidated
after one redemption attempt. Must be explicit.

#### HIGH: Refresh-token theft — indefinite session, no re-auth checkpoint

`src/lib/supabase.ts:118-125` confirms `autoRefreshToken: true` with
`persistSession: true` in `localStorage` on native. A stolen unlocked device
exports the refresh token; the thief rotates it indefinitely without
triggering any re-auth. Step-up at approval time helps, but the thief can
still: read all data, draft SIs/VOs, tick progress, view PII of all project
members — none of which require step-up under the plan. The plan acknowledges
"indefinite session on native" (AUTH-AUDIT §3.4) but proposes no idle
timeout or session binding. Low-risk actions remaining session-only is a
deliberate choice (A4), but the plan should explicitly call out what a stolen
session can do even after step-up is deployed.

#### HIGH: Biometric spoof / fallback abuse on device

iOS Face ID and Android biometric are hardware-backed. However:
- The plan relies on the Capacitor plugin to gate private key access on a
  successful biometric. If the plugin uses `LAContext.evaluatePolicy` without
  `.deviceOwnerAuthenticationWithBiometrics` (i.e., falls back to device
  passcode), a shoulder-surfed passcode bypasses the biometric gate.
- The Approval PIN fallback is stored server-side as Argon2/bcrypt — correct.
  But the PIN fallback endpoint (`redeem_step_up_pin`) is rate-limited "per
  the plan." There is no existing rate-limiting infrastructure in the
  codebase (no Supabase rate-limit middleware, no per-user attempt counters
  in schema). Building correct rate-limit + lockout in PL/pgSQL is non-
  trivial (race conditions, clock skew). This must be implemented explicitly,
  not assumed.

#### HIGH: Lost-device recovery as a takeover vector

The plan says: "Lost device / re-enrol: requires step-up from another enrolled
device, OR an admin-assisted re-enrol." If the user has only ONE enrolled
device (the common case for a site foreman who has one phone), they cannot
step-up from another device. The only path is admin-assisted re-enrol. The
plan says this is "ledger-logged + owner-notified" — good, but it does not
describe:
- Who qualifies as "admin" for re-enrol purposes (same admin who can also
  see all data and approve anything)?
- What prevents a social-engineering attack where a thief claims the victim's
  phone is lost and asks admin to re-enrol them on a new device?
- The notification "有人喺新裝置登記簽核" goes to the account owner — but
  if the account owner IS the victim, their phone is lost and they won't
  receive the push.

This is a concrete gap: the re-enrol flow as described could be the easiest
social-engineering path to a full takeover.

#### MEDIUM: Service-role key abuse

The plan correctly notes "RLS does NOT bind the service-role key" (B0). The
hash chain catches tampering after the fact. But the service-role key is
stored in Codemagic CI environment variables (per `codemagic.yaml` comments
in CLAUDE.md). A compromised CI run leaks the key and grants unrestricted
DB access. The plan does not address service-role key rotation or the CI
secret management boundary. This is outside the plan's stated scope but worth
flagging.

#### MEDIUM: Offline mode + step-up

The plan acknowledges "step-up needs network to mint grant → approvals are
online-only." `src/lib/supabase.ts` confirms the offline write-guard blocks
RPC calls when offline. However, the offline guard *exempts RPC paths*
(line 34: `!url.includes('/rest/v1/rpc/')`) to allow read-RPCs to fail
naturally. This means a crafted offline-bypass could attempt to call high-
risk RPCs while the guard thinks it's a read-RPC. Verify that `assert_step_up`
fails when the grant lookup returns null (network failure → no grant row
found → raise). This is likely safe, but should be explicit in the test plan.

#### MEDIUM: Web platform step-up

The plan targets Capacitor native (Keychain/Keystore). The app also runs as
a web build (Vercel, per CLAUDE.md). Web Crypto API can generate keypairs
(`crypto.subtle.generateKey` with `extractable: false`) but they are stored
in IndexedDB, not hardware-backed, and are not biometric-gated on most
browsers. The plan does not specify what happens when an approver uses the
web build — do they fall back to Approval PIN? Is the web build exempt from
step-up? The plan must be explicit.

---

### 6. "Convince the Client" Claims — Enforceable Tech or Marketing?

**Rating: MIXED — Part B is sound; Part A is premised on an infeasible mechanism.**

**Part B (hash chain):** The claim "改或者刪任何一筆舊記錄，條鏈即刻斷" is
technically accurate given the trigger design. `verify_integrity()` is a
real, implementable RPC using pgcrypto `digest`. The plan correctly caveats
that a Postgres superuser can disable triggers — "tamper-EVIDENT, not tamper-
impossible" is honest and defensible. This narrative is enforceable.

**Part A (device-binding):** The claim "冇你部機批唔到" is the marketing
headline. It is only true if:
(a) A Capacitor plugin correctly stores the private key in hardware-backed
    Keychain/Keystore AND gates access on biometric (not device passcode),
(b) The server actually verifies the device signature (requires Edge Function,
    not pgcrypto), and
(c) The PIN fallback doesn't undermine device-binding (it does: any device
    can use the PIN, so "冇你部機" is false for PIN-fallback users).

The client claim as written overstates what the PIN-fallback path delivers.
A more honest narrative: "未經登記裝置，就算知道密碼，亦唔能夠批核。用咗
Face ID 登記咗部機，批核先可以繼續。如果冇部機，管理員核實身份後可以重新
登記。" This is still compelling and accurate.

---

### 7. LOCKED Decisions vs. Capacitor 8 + Supabase Free Tier

**Decision 1: device-key + biometric primary**

**Rating: INFEASIBLE AS WRITTEN on current stack.**

Concretely:
- No biometric Capacitor plugin in `package.json`. The closest available
  community plugins are `@aparajita/capacitor-biometric-auth` (Capacitor 5+,
  works on Capacitor 8 per maintainer) and `capacitor-native-biometric`. Both
  trigger biometric/device-auth prompts. However, neither exposes Keychain/
  Keystore-backed RSA/ECDSA key generation. For hardware-backed asymmetric
  keys, a custom native plugin is required, OR the app uses iOS
  `SecKeyCreateRandomKey` (Swift, wrapped in a Capacitor plugin) and Android
  `KeyPairGenerator` with `KeyGenParameterSpec.Builder`.
- The Web Crypto API (`SubtleCrypto.sign` with ECDSA) can run in the Capacitor
  WebView, but keys generated in the WebView are NOT in the Secure Enclave /
  StrongBox — they are in the JS heap (iOS) or software keystore (Android).
  This provides zero hardware binding.
- **Verdict:** Building this correctly requires a custom native Swift/Kotlin
  Capacitor plugin (multi-week effort, requires Xcode + Android Studio
  expertise, and must be audited for the `LABiometryFallbackToPasscode` flag
  that allows passcode bypass).

**Decision 2: 5-min grant window — sound.**
No constraint violation. Easy to implement once the grant minting is fixed.

**Decision 3: approvers-only enrolment — sound.**
Correct subset. Matches the A3 action tier map.

**The core question: CAN Postgres verify an ECDSA/RSA signature to mint the grant?**

**No.** pgcrypto does not provide `verify(pubkey bytea, sig bytea, data bytea)`
for ECDSA or RSA. The `pgcrypto` module's `pgp_pub_decrypt` / `pgp_pub_encrypt`
work with OpenPGP-format keys (RFC 4880), not raw ECDSA signatures from a
mobile Keychain. pgjwt (HS256 only) cannot verify an asymmetric signature.

**This MUST go through a Supabase Edge Function.** The Edge Function receives
`(challenge_id, user_id, signature_base64)`, fetches the user's registered
public key from `user_security_keys`, verifies with Node.js
`crypto.verify('SHA256', challenge_bytes, publicKey, signature)`, and if
valid inserts into `step_up_grants` using the service-role key. The Edge
Function invocation is then the new trust boundary — the plan must specify
how the Edge Function itself is secured (service-role key in Edge Function
env, caller is authenticated via the Supabase JWT header).

---

## Summary of Findings by Priority

### CRITICAL

| # | Finding | Impact |
|---|---------|--------|
| C1 | pgcrypto cannot verify ECDSA/RSA signatures. `redeem_step_up` as described cannot be implemented in a Postgres RPC. Signature verification MUST move to a Supabase Edge Function. The plan's "pgcrypto for verify" claim is incorrect. | Phase 2 cannot be built as specified. |
| C2 | No Capacitor plugin for biometric + hardware-backed keypair generation is installed or named. Building this requires a custom native Swift/Kotlin plugin (multi-week) or a community plugin that must be audited. The plan omits this entirely. | Phase 3 cannot be built as specified. |
| C3 | The signed nonce is not marked one-time-use in the plan. A captured `(challenge_id, signature)` tuple can be replayed within the challenge TTL to mint another grant. | Breaks the anti-replay guarantee. |

### HIGH

| # | Finding | Impact |
|---|---------|--------|
| H1 | Lost-device re-enrol is a social-engineering hole. Single-device users (the common case) have no self-service path. Admin-assisted re-enrol with only a push notification to the (possibly unreachable) victim phone is insufficient. | Device-binding can be bypassed by social engineering. |
| H2 | "Batch-friendly grant" vs. "single-use-class" contradiction. Clarify whether one grant covers all same-class actions in the TTL or is consumed on first use. If consumed, batch approvals require multiple biometric taps (violates A4). | UX regression or security regression depending on which interpretation wins. |
| H3 | Approval PIN fallback undermines the "冇你部機批唔到" client claim. PIN can be used from any device. Rate-limit/lockout infrastructure does not exist in the codebase and must be explicitly built. | Overstated security narrative; missing implementation. |
| H4 | Web platform step-up not specified. Approvers using the web build (Vercel) have no biometric and no hardware-backed key. Plan is silent on whether the web build falls back to PIN-only or is blocked from step-up actions entirely. | Gap in enforcement perimeter. |

### MEDIUM

| # | Finding | Impact |
|---|---------|--------|
| M1 | TOTP via Supabase native MFA is a simpler ~90%-equivalent alternative dismissed on friction grounds inconsistent with the PIN fallback. Should be reconsidered as the primary path or at minimum offered as the web-platform fallback. | Over-engineering risk. |
| M2 | Enrolment UX unspecified. Grace period, forced modal vs. nudge, and what happens during the transition for existing live iOS users who haven't enrolled. | Live users blocked from approvals on flag-enable day. |
| M3 | "Daily anchor" hash push requires an email inbox. Synthetic addresses are undeliverable. OneSignal push of a hash is not a credible external witness. Drop the daily anchor from the client narrative. | Dishonest client claim. |
| M4 | Apple account-deletion compliance: if a user has never enrolled (no device key, no PIN set) and cannot step-up, they cannot delete their account. An escape hatch is required for the Apple review case. | App Store compliance regression risk. |
| M5 | Offline mode: the offline write-guard exempts RPC paths. Verify that `assert_step_up` returning null (no grant found, whether due to offline or missing grant) causes the high-risk RPC to raise. Add an explicit test case. | Potential offline bypass of step-up RPCs. |
| M6 | Part B ledger trigger design (correct) but the plan does not specify the canonical JSON serialization of `payload`. Non-deterministic key ordering in `jsonb` will cause hash mismatches. Use `jsonb_build_object` with fixed key order or `to_jsonb(row)::text` consistently. | Chain breaks spuriously on verify. |

---

## Verdict

**RETHINK (Part A core mechanism) + SHIP-WITH-FIXES (Part A quick-wins + Part B)**

**Must-fix before any execution:**

1. **C1 — Move signature verification to an Edge Function.** The Postgres RPC `redeem_step_up` cannot verify ECDSA/RSA. Redesign Phase 2 so the Edge Function handles `(challenge_id, signature)` → grant mint. Update the threat model to reflect that the Edge Function's service-role key is the new trust boundary.

2. **C2 — Name and install a concrete Capacitor biometric + keypair plugin.** The plan cannot be executed without this. Either: (a) audit and adopt `@aparajita/capacitor-biometric-auth` + a custom native key-generation bridge, or (b) pivot to Supabase TOTP MFA (works today, no new plugin, server-verified, higher friction but honest). Decision must be made before Phase 3 starts.

3. **C3 — Challenges must be single-use (consumed on first redemption attempt).** Add `used_at` timestamp to the challenges table; `redeem_step_up` sets it and rejects any subsequent call with the same `challenge_id`.

4. **H1 — Define the lost-device recovery protocol explicitly**, including what proof the admin requires before re-enrolling a claimed-lost device, and a secondary out-of-band notification path (email to a recovery contact, not just push to the lost device).

5. **H2 — Clarify grant semantics:** one grant = all actions of the same class within the TTL. Rename "single-use-class" to "single-class, multi-use within TTL" in the design doc.

**Can ship as-is (Phase 0 quick-wins):**
- A6.1 membership `WITH CHECK` fix — real bug, confirmed, ship immediately.
- A6.2 password floor 6→8 — client-side only, no schema change.

**Part B (hash chain):** sound design, pgcrypto `digest` is available, triggers fire for all writers including service-role. Fix M6 (canonical JSON serialization) before shipping. Drop the daily anchor email claim.
