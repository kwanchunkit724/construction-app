# External Integrations

**Analysis Date:** 2026-05-11

## APIs & External Services

**Backend-as-a-Service (Supabase):**
- Supabase — Sole backend. Postgres + Auth + Storage + Realtime + pg_net outbound HTTP.
  - SDK/Client: `@supabase/supabase-js` ^2.104.0
  - Client setup: `src/lib/supabase.ts` (singleton, 15s `fetchWithTimeout` wrapper, realtime `eventsPerSecond: 10`, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`)
  - URL: `VITE_SUPABASE_URL` → `https://syyntodkvexkbpjrskjj.supabase.co`
  - Auth: `VITE_SUPABASE_ANON_KEY` (publishable key `sb_publishable_...`)
  - Used everywhere — see all `src/contexts/*.tsx` and `src/pages/*.tsx`

**Push Notifications (OneSignal):**
- OneSignal — User-targeted push fan-out, called from both client and Postgres triggers.
  - Client SDK: not used directly. Uses `@capacitor/push-notifications` to get native token then POSTs to OneSignal REST.
  - Client endpoint: `POST https://onesignal.com/api/v1/players` (legacy v1 Players API) — see `src/lib/push.ts` `registerDeviceWithOneSignal()`
  - Server endpoint (from Postgres trigger via pg_net): `POST https://api.onesignal.com/notifications` — see `supabase/v5-push-notifications.sql` function `send_push_to_users()`
  - App ID (hard-coded in `src/lib/push.ts` and `src/pages/Profile.tsx`): `71f914a3-6dc3-4c4a-80e6-70df8f17d5d1`
  - REST key: stored server-side only in `app_config.onesignal_rest_key` (RLS denies all reads; only `security definer` functions access it)
  - `external_user_id` = Supabase `auth.users.id` (UUID). Eliminates need for client to track player IDs.
  - `device_type`: `0` = iOS (APNs), `1` = Android (FCM). See `src/lib/push.ts` lines 81-83.
  - `language` set to `'zh-Hant'`; trigger payloads include both `en` and `zh-Hant` headings/contents.
  - Outgoing push includes `data.deep_link` (e.g. `/project/{id}/issue/{id}`) which the client uses to navigate via `window.location.hash` (HashRouter).

**Apple Push Notification service (APNs):**
- Direct APNs registration handled by iOS via `@capacitor/push-notifications`
- `src/lib/push.ts` `requestPushPermission()` → `PushNotifications.register()`
- Bridge: `ios/App/App/AppDelegate.swift` forwards `didRegisterForRemoteNotificationsWithDeviceToken` to Capacitor through `NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, ...)`
- Production APS environment: `ios/App/App/App.entitlements` (`aps-environment = production`)
- `UIBackgroundModes: remote-notification` declared in `ios/App/App/Info.plist`
- APNs token forwarded to OneSignal Players API with `device_type: 0`

**Firebase Cloud Messaging (FCM) — Android:**
- FCM token captured by `@capacitor/push-notifications` on Android
- Firebase config: `android/app/google-services.json` (committed; gated by `try` block in `android/app/build.gradle` that conditionally applies `com.google.gms.google-services` plugin)
- Plugin classpath: `com.google.gms:google-services:4.4.4` in `android/build.gradle`
- FCM token sent to OneSignal Players API with `device_type: 1` (see commit `171b7a7`: `fix(push): use device_type=1 (FCM) on Android`)

**Capacitor Plugins (native bridges):**
- `@capacitor/push-notifications` ^8.0.3 — APNs/FCM token + permission + tap handler (`src/lib/push.ts`, `src/pages/Profile.tsx`)
- `@capacitor/splash-screen` ^8.0.1 — Configured in `capacitor.config.ts` (2000 ms, `#1d4ed8` background, CENTER_CROP)
- `@capacitor/status-bar` ^8.0.2 — Configured in `capacitor.config.ts` (DARK style, white background)
- Camera: NOT a Capacitor plugin. iOS uses standard HTML `<input type="file">` with native picker. Camera/photo-library usage strings live in `ios/App/App/Info.plist` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`).

## Data Storage

**Primary Database:**
- Supabase Postgres
  - Connection: via Supabase client (no direct connection string in app)
  - Schema migrations: `supabase/v2-schema.sql` (base), `v3-progress-schema.sql`, `v4-issues-schema.sql`, `v5-push-notifications.sql`, `v6-account-deletion.sql` and various `v*-fix-*.sql` patches
  - Core tables: `user_profiles`, `projects`, `project_members`, `progress_items`, `progress_history`, `issues`, `issue_comments`, `app_config`
  - Row-Level Security: enabled on every business table (`alter table … enable row level security` throughout migrations)
  - Triggers: `on_issue_created`, `on_issue_updated`, `on_membership_updated`, `on_project_pm_changed`, `on_progress_assignment_changed` — all defined in `supabase/v5-push-notifications.sql`, all call `send_push_to_users()` via pg_net
  - pg_net extension enabled (`create extension if not exists pg_net with schema extensions;`) — used by triggers to perform outbound HTTP POSTs to OneSignal
  - RPC: `delete_my_account()` (`supabase/v6-account-deletion.sql`) — Apple Guideline 5.1.1(v) compliance; cascade-deletes `auth.users` row

**File Storage:**
- Supabase Storage
  - Bucket: `issue-photos` (referenced from `src/contexts/IssuesContext.tsx`)
  - Upload path pattern: `{user_id}/{timestamp}-{rand}.{ext}` (`uploadPhoto()`)
  - Access mode: public — uses `getPublicUrl()`
  - Used for: site issue photos

**Caching:**
- None (no Redis / CDN cache outside of Supabase defaults)
- Service workers explicitly disabled — `src/main.tsx` unregisters any leftover SWs from prior PWA experiments

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (email + password under the hood)
- Phone-as-identity adapter in `src/lib/phone.ts`:
  - HK mobile numbers (8 digits starting with 5/6/7/9 — `isValidHKPhone`)
  - Phone is converted to a synthetic email `{digits}@phone.local` for Supabase (`phoneToEmail`)
  - Users only ever see / enter their phone number
- Sign-up flow: `src/contexts/AuthContext.tsx` `signUp()` — pre-checks `user_profiles.phone` uniqueness, then `supabase.auth.signUp({ email, password })`, then inserts `user_profiles` row. Rolls back via `auth.signOut()` if profile insert fails.
- Sign-in flow: `src/contexts/AuthContext.tsx` `signIn()` — `supabase.auth.signInWithPassword({ email, password })`
- Session persistence: `persistSession: true` in `src/lib/supabase.ts` (localStorage on web, Capacitor preferences on native)
- Auth state listener: `supabase.auth.onAuthStateChange` in `AuthContext` triggers `pushLoginUser()` only on `SIGNED_IN` event (not on every token refresh)
- Account deletion: `supabase.rpc('delete_my_account')` from `src/pages/Profile.tsx` — for App Store compliance

**Authorization:**
- Postgres RLS policies (per-table) using `auth.uid()` and role checks on `user_profiles.global_role` / `project_members.role`
- Roles enum (in DB CHECK constraint): `admin`, `pm`, `main_contractor`, `subcontractor`, `subcontractor_worker`, `owner`
- Sub-roles: `engineer`, `foreman`, `safety`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry / Bugsnag / equivalent). Errors are `console.error`-logged client-side (e.g. `src/lib/push.ts`, `src/lib/supabase.ts` callers).

**Server-side Logging:**
- Postgres triggers use `raise log` for OneSignal credential errors and `exception when others then raise log 'send_push_to_users error: %', sqlerrm;` to swallow push failures without breaking the originating transaction (`supabase/v5-push-notifications.sql`).

**Client Logs:**
- Plain `console.log` / `console.error`. No structured logger.

## CI/CD & Deployment

**Hosting:**
- iOS — App Store / TestFlight (live)
- Android — Internal sideload (debug-signed APK + AAB); awaiting Play developer identity verification before promoting to a release track
- Web bundle — packaged inside the native app (`dist/` → Capacitor `webDir`). No standalone web hosting deployment apparent.

**CI Pipeline:**
- Codemagic (`codemagic.yaml`) — three workflows, all on `mac_mini_m2` (free tier):
  1. `ios-app-store` — Manual / on-demand. Builds, signs with App Store profile, uploads to TestFlight (`submit_to_testflight: true`, `submit_to_app_store: false`).
  2. `ios-testflight` — Auto-triggered on push to `main`. Same flow as `ios-app-store`.
  3. `android-internal-test` — Auto-triggered on push to `main`. `java: 21`. `npm ci` → `npm run build` → `npx cap sync android` → `./gradlew assembleDebug` + `bundleDebug`. Produces APK + AAB (debug-signed for now). Notes: workflow makes `gradlew` executable (`chmod +x`) because Windows commits drop the +x bit.
- iOS signing: `app-store-connect fetch-signing-files` using `CERTIFICATE_PRIVATE_KEY` env from `app_store_credentials` group; manual signing style with profile UUID extracted from `embedded.mobileprovision`.
- Bundle version: stamped from `$(date +%s)` via `agvtool` (iOS) / Gradle properties (Android).

**App Store Connect publishing (env from `app_store_credentials` Codemagic group):**
- `APP_STORE_CONNECT_PRIVATE_KEY`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_ISSUER_ID`

## Environment Configuration

**Required client env vars (build-time):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable anon key

**Where configured:**
- Local dev: `.env` files (presence noted; contents not read)
- CI: inlined in `codemagic.yaml` per workflow `environment.vars`
- iOS CI: also `BUNDLE_ID`, `XCODE_SCHEME`, `XCODE_PROJECT`, `TEAM_ID`
- Android CI: `PACKAGE_NAME`

**Server-side secrets (Supabase only — never exposed to client):**
- `app_config.onesignal_app_id` (also hard-coded in client)
- `app_config.onesignal_rest_key` — REST key for `api.onesignal.com/notifications`. Read only by `security definer` function `send_push_to_users`. RLS denies direct access.

## Webhooks & Callbacks

**Incoming (to backend):**
- Push tap → app open → `pushNotificationActionPerformed` listener in `src/lib/push.ts` reads `data.deep_link` and sets `window.location.hash` to navigate (HashRouter)

**Outgoing (from Postgres triggers via pg_net):**
- `POST https://api.onesignal.com/notifications` — fired by triggers on:
  - `issues` insert (`trg_issue_created`) — notifies handler role members + reporter excluded
  - `issues` update (`trg_issue_updated`) — escalation, resolved, reopened
  - `project_members` status change (`trg_membership_updated`) — approved / rejected
  - `projects.assigned_pm_ids` change (`trg_project_pm_changed`) — newly added PMs
  - `progress_items.assigned_to` / `delegated_to` change (`trg_progress_assignment_changed`) — newly assigned users

**Outgoing (from client):**
- `POST https://onesignal.com/api/v1/players` — register device after APNs/FCM token granted (`src/lib/push.ts`)

## Locales / Internationalization

- Primary UI locale: Traditional Chinese (Hong Kong) — `lang="zh-HK"` in `index.html`, fonts include `Microsoft JhengHei` and `PingFang HK` (`tailwind.config.js`)
- OneSignal push payloads bilingual (`en` + `zh-Hant`)
- Excel exports use Chinese column headers (`src/lib/export.ts` `分區`, `編號`, etc.); PDF uses English (jsPDF default font lacks CJK glyphs)

---

*Integration audit: 2026-05-11*
