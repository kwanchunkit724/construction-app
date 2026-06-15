# verify-sign-password — Edge Function (簽名前重新驗證密碼)

Mints a fresh-password **re-auth grant** bound to the signing moment, so a
signature stands up to a 勞工處 dispute (proof the **本人** — actual account
holder — was present). Pairs with `supabase/v60-sign-reauth.sql`:
`sign_reauth_grants` (service-role-written, no client write policy) +
`assert_sign_reauth()` (asserted inside `record_ptw_signoff` /
`record_form_signoff`).

The client calls this **right before** the signoff RPC, but only when
`get_sign_reauth_enforced()` is `true` (rollout flag — OFF by default, so live
clients are unaffected until the re-auth UI ships).

## How it works
1. Identifies the caller from the forwarded user JWT (anon client + `getUser`).
2. Verifies the supplied password against GoTrue
   (`POST /auth/v1/token?grant_type=password`) using the caller's synthetic-email
   login (`<digits>@phone.local`; see `src/lib/phone.ts`). `200` ⇒ correct.
3. On success, uses the **service role** to upsert
   `sign_reauth_grants(user_id = caller, granted_at = now, expires_at = now + 5 min)`.

The password is verified and **never logged, echoed, stored, or returned**. No
session is created from the password check — only the 200/4xx outcome is read.

## Request / Response
```http
POST /functions/v1/verify-sign-password
Authorization: Bearer <user JWT>     # Verify-JWT ON — caller must be logged in
Content-Type: application/json

{ "password": "<the user's login password>" }
```
| Outcome | Status | Body |
|---|---|---|
| Correct password, grant minted | `200` | `{ "ok": true, "expires_at": "<ISO, now+5min>" }` |
| Wrong password | `401` | `{ "ok": false, "error": "密碼錯誤" }` |
| Missing / non-Bearer JWT | `401` | `{ "ok": false, "error": "未登入" }` |
| Missing password | `400` | `{ "ok": false, "error": "請輸入密碼" }` |
| GoTrue unreachable | `502` | `{ "ok": false, "error": "密碼驗證服務暫時無法使用" }` |
| Grant upsert failed | `500` | `{ "ok": false, "error": "未能建立驗證憑證" }` |

CORS is `*` (the web client calls it cross-origin). `OPTIONS` is handled.

## Deploy (your side — Supabase login)
```bash
# the service-role key must be set as a secret (it is NOT a VITE_* var, never ship it to the client)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key> --project-ref syyntodkvexkbpjrskjj
# deploy WITH JWT verification (the caller must be a logged-in user)
supabase functions deploy verify-sign-password --project-ref syyntodkvexkbpjrskjj
```
`SUPABASE_URL` / `SUPABASE_ANON_KEY` are injected by the platform — only
`SUPABASE_SERVICE_ROLE_KEY` must be set explicitly (above).

> Verify-JWT is **ON** for this function (default), unlike `weather-sync` which
> deploys `--no-verify-jwt`. Here the forwarded user JWT is how we identify the
> caller whose grant we mint.
