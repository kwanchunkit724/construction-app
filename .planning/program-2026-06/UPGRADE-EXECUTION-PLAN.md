# 全 Upgrade 執行計劃 — shortest-time, one 1.5 build

**Goal:** complete ALL remaining upgrades in the least wall-clock time. Strategy:
**front-load every line of code NOW in parallel** so the only remaining path is
owner actions + one CI build. Ship everything in ONE 1.5 TestFlight build (avoids
a second native-rebuild cycle for biometric).

## What's left (the work)
| # | Item | Files | Risk |
|---|------|-------|------|
| 1 | SMS edge functions (step-up + signup OTP) | `supabase/functions/{send,verify}-stepup-sms`, `{send,verify}-phone-otp` (NEW) | low (mirror verify-sign-password) |
| 2 | Biometric plugin + wrapper | `package.json`, iOS Info.plist, Android manifest, `src/lib/biometric.ts` (NEW) | med (Cap-8 compat, native) |
| 3 | StepUpContext fallback chain | `src/contexts/StepUpContext.tsx` | high (security-critical, shared) |
| 4 | Signup SMS flow (flag-gated) | `src/pages/Signup.tsx`, `src/contexts/AuthContext.tsx` | med (live login path; flag OFF) |
| 5 | dwssRef display sweep | `SiDetail`, `VoDetail`, `EquipmentDetail`, `ProjectFiles` | trivial |
| 6 | Review LOW fixes | `v85` SQL (module-gate UPDATE), `PtwSubmitForm` (partial-fail metadata), `NcrDetail` (CAR history + reopen label) | low |

## Orchestration (Workflow, file-partitioned → no clobber)
**Phase A — Scaffold (parallel):**
- `biometric-plugin` (**opus** — Cap-8 compat + native): pick maintained biometric+secure-credential plugin, install, iOS `NSFaceIDUsageDescription` zh-HK, Android `USE_BIOMETRIC`, write `src/lib/biometric.ts` wrapper (`isAvailable / saveCredential / verifyAndGet / clear`). Returns plugin name + wrapper API.
- `sms-edge-fns` (**sonnet** — pattern-mirror): 4 Deno fns (Twilio REST, sha256 OTP → `phone_verifications`, mint `step_up_grants` / signup ok, rate-limit).
- `dwssref-sweep` (**sonnet** — trivial): wire `dwssRef()` into 4 detail pages.
- `low-fixes` (**sonnet** — mechanical): v85 module-gate SQL + PTW partial-fail metadata + NcrDetail CAR-history/reopen-label.

**Phase B — Integrate (parallel, distinct files; needs Phase A outputs):**
- `stepup-rewrite` (**opus**): StepUpContext → warm-grant → biometric(`lib/biometric`) → password → SMS fallback chain. Uses plugin API + edge-fn contracts.
- `signup-flow` (**opus**): Signup + AuthContext gate behind phone-OTP when `get_signup_sms_required()` true (flag OFF = unchanged).

**Phase C — Verify (sonnet):** run `tsc --noEmit` + `vite build`, report errors.
**Phase D — me:** fix any integration issues, apply v85 + deploy edge fns (dashboard), commit.

## Model tiering (cost-effective)
- **opus** ×3: biometric (native/compat), stepup (security), signup (live login). Hard, high-blast-radius.
- **sonnet** ×3: edge-fns, dwssref, low-fixes, verify. Mechanical pattern-mirror.

## Owner-gated (no agent can shorten — the real critical path)
1. Set `TWILIO_FROM` secret (dev trial number, or upgrade + alphanumeric sender).
2. Authorize `git push main` (merge 1.5 branch → triggers Codemagic TestFlight + Android).
3. Deploy the 5 edge functions (`supabase functions deploy`, or I paste via dashboard).
4. Test biometric/SMS on TestFlight; App Store submit from App Store Connect.
5. After live on both stores: flip `step_up_enforced` + `sign_reauth_enforced` + `signup_sms_required`.
6. Twilio upgrade (paid) before production SMS to workers.

## Why one build, not two
Option A (ship-now-without-biometric) needs a later 1.6 rebuild for biometric = two
CI/review cycles. Front-loading all code = ONE build. Flags default OFF so biometric/
SMS sit dormant in 1.5 until tested on TestFlight + flipped — safe to ship together.
