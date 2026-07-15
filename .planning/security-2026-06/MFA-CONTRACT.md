# Supabase JS MFA TOTP — API Contract
> Verified against @supabase/auth-js ~2.65 (supabase-js ~2.104 re-exports same types).
> All calls live under `supabase.auth.mfa.*`.

---

## 1. enroll

```ts
supabase.auth.mfa.enroll({
  factorType: 'totp',          // | 'phone'
  friendlyName?: string,       // human label stored on the factor
}): Promise<{
  data: {
    id: string                 // factorId — keep this, needed for challenge
    type: 'totp'
    friendly_name?: string
    totp: {
      qr_code: string          // SVG markup — render as <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr_code)}`} />
      secret: string           // base32 — show as manual-entry fallback
      uri: string              // otpauth:// URI
    }
  } | null
  error: AuthError | null
}>
```

**Gotcha:** The factor status is `unverified` immediately after enroll. It does NOT raise the AAL or protect any route until the user completes one challenge+verify cycle. Never treat enroll alone as "MFA enabled".

---

## 2. challenge

```ts
supabase.auth.mfa.challenge({
  factorId: string,            // id from enroll
  // channel: 'sms'|'whatsapp' only for phone factors
}): Promise<{
  data: {
    id: string                 // challengeId — pass to verify
    type: 'totp'
    expires_at: number         // UNIX epoch seconds (~5 min window)
  } | null
  error: AuthError | null
}>
```

---

## 3. verify

```ts
supabase.auth.mfa.verify({
  factorId: string,
  challengeId: string,         // from challenge().data.id
  code: string,                // 6-digit TOTP from authenticator app
}): Promise<{
  data: {
    access_token: string       // new JWT with aal: 'aal2' claim
    token_type: string
    expires_in: number
    refresh_token: string
    user: User
  } | null
  error: AuthError | null
}>
```

After a successful verify the SDK **automatically updates the in-memory session** — no manual `setSession` needed. The new access token's `aal` JWT claim becomes `'aal2'`.

**First-enroll side effect:** completing the very first verify on a new factor signs out all other existing sessions (server-side invalidation).

---

## 4. challengeAndVerify

```ts
supabase.auth.mfa.challengeAndVerify({
  factorId: string,
  code: string,
}): Promise<AuthMFAVerifyResponse>   // same shape as verify()
```

A convenience wrapper: internally calls `challenge` then `verify` and throws away the `challengeId`. **Use this for the post-login enforcement step** (you never need the challenge object). Use the separate `challenge` + `verify` calls only when you need to store/display the challenge (e.g. showing a "code expires in Ns" countdown).

---

## 5. unenroll

```ts
supabase.auth.mfa.unenroll({
  factorId: string,
}): Promise<{
  data: { id: string } | null  // echoes the factorId removed
  error: AuthError | null
}>
```

**Requires aal2 to remove a _verified_ factor** — the user must have already passed MFA this session. Removing an `unverified` factor requires only `aal1`. After unenroll the session AAL drops from `aal2` → `aal1` only after the next token refresh; call `supabase.auth.refreshSession()` immediately if you need the downgrade to take effect right away.

---

## 6. listFactors

```ts
supabase.auth.mfa.listFactors(): Promise<{
  data: {
    all: Factor[]              // all factors regardless of status
    totp: Factor[]             // only VERIFIED totp factors
    phone: Factor[]            // only VERIFIED phone factors
  } | null
  error: AuthError | null
}>

interface Factor {
  id: string
  friendly_name?: string
  factor_type: 'totp' | 'phone' | string
  status: 'verified' | 'unverified'
  created_at: string           // ISO 8601
  updated_at: string
}
```

**Enforcement pattern:** check `data.totp.length > 0` (verified only) to decide whether to prompt MFA at sign-in. `data.all` is needed to discover `unverified` factors left hanging from an abandoned enroll flow (clean them up before offering a fresh enroll to avoid duplicates).

---

## 7. getAuthenticatorAssuranceLevel

```ts
supabase.auth.mfa.getAuthenticatorAssuranceLevel(): Promise<{
  data: {
    currentLevel: 'aal1' | 'aal2' | null   // null = no session
    nextLevel: 'aal1' | 'aal2' | null       // level achievable with verified factors on this account
    currentAuthenticationMethods: AMREntry[]
  } | null
  error: AuthError | null
}>

interface AMREntry {
  method: 'password' | 'otp' | 'oauth' | 'mfa/totp' | string
  timestamp: number   // UNIX epoch seconds UTC
}
```

**Routing pattern:**
```ts
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
  // user has a verified TOTP factor but hasn't challenged it yet this session
  // redirect to /mfa-challenge
}
```

---

## AAL2 Session Lifecycle

| Question | Answer |
|---|---|
| Where is `aal` stored? | JWT claim (`aal: 'aal2'`) inside the access token issued by `verify()` |
| How long does aal2 last? | For the life of that access token — default **1 hour** (configurable in Supabase Auth settings). After expiry the token is refreshed automatically; the refresh token preserves the `aal2` claim so the **user does NOT need to re-challenge on every token refresh**. |
| Does aal2 survive page reload? | Yes — the SDK persists session in `localStorage`; `getSession()` on reload restores aal2 state from the stored access + refresh token. |
| Is re-challenge needed after re-login? | Yes. A fresh sign-in always starts at aal1 even if the user has a verified factor. They must `challengeAndVerify` again to reach aal2. |

---

## Recovery — Lost Authenticator

Supabase provides **no built-in backup codes** for TOTP. Recovery options:

1. **Admin unenroll via Management API (REST):**
   `DELETE /auth/v1/admin/users/{userId}/factors/{factorId}` with `service_role` key.
   In JS: use `supabase.auth.admin` with service-role; there is no `supabase.auth.admin.mfa.deleteFactor` JS helper as of supabase-js 2.104 — call the REST endpoint directly or via Supabase Dashboard → Authentication → Users → select user → remove factor.

2. **Dashboard manual removal:** Supabase Dashboard → Authentication → Users → click user → Factors section → Delete.

3. **Proactive mitigation:** offer users a second TOTP factor ("backup authenticator") during enrollment so they can unenroll the lost one themselves using the backup.

There is no out-of-the-box backup-code flow in Supabase auth — implement your own or rely on the admin removal path.

---

## Capacitor / WebView Compatibility

The entire MFA API is **pure JS / XHR** — no native bridge calls, no native APIs, no WebCrypto for TOTP (it's server-side). It works identically in:
- Browser (desktop or mobile)
- Capacitor WebView (`capacitor://` origin)
- WKWebView (iOS)
- Android WebView

No polyfills needed. The QR code is delivered as an SVG string, so rendering in a `<img>` tag works everywhere. The only Capacitor-specific consideration: `localStorage` session persistence works in WKWebView since Capacitor 4+ (no `file://` origin restriction that would break cookies).

---

## Gotchas Summary

| # | Gotcha | Fix |
|---|---|---|
| 1 | `enroll` alone does NOT activate MFA — factor is `unverified` | Always immediately prompt challenge + verify after enroll |
| 2 | Abandoned enroll leaves an `unverified` factor; calling `enroll` again creates a second one | Call `listFactors().all`, find unverified ones, `unenroll` them before re-enrolling |
| 3 | First successful verify kicks out all other sessions | Warn user: "other devices will be signed out" |
| 4 | `unenroll` of verified factor requires `aal2` in current session | Gate the "remove MFA" button behind a fresh `challengeAndVerify` if `currentLevel !== 'aal2'` |
| 5 | AAL drops to `aal1` after unenroll only on next token refresh | Call `refreshSession()` immediately after unenroll if you enforce AAL in the same render cycle |
| 6 | `challengeAndVerify` is sufficient for login enforcement; separate `challenge`+`verify` only needed for expiry countdowns | Default to `challengeAndVerify` in post-login gate screens |
| 7 | No built-in backup codes | Plan admin-removal support flow before shipping MFA enforcement |
| 8 | `getAuthenticatorAssuranceLevel()` decodes the local JWT without a network call — fast, safe to call on every route guard | Use it in every `ProtectedRoute` or auth context boot |
