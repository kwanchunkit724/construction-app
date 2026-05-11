# Codebase Concerns

**Analysis Date:** 2026-05-11
**Scope:** CK Construction App (live on iOS App Store; Android in test)

---

## Tech Debt

**No automated tests at all:**
- Issue: Repo has `@playwright/test` and `playwright` installed as devDependencies but contains zero `*.test.*` or `*.spec.*` files anywhere in `src/` or repo root.
- Files: (none — that's the problem). `package.json` has no `test` script.
- Impact: Every regression must be caught manually. A live App Store app with zero CI test coverage is the single biggest risk factor.
- Fix approach: Start with smoke-level Playwright tests against the deployed Vercel preview (signup, login, create project, file issue). Add Vitest for `src/lib/phone.ts` (pure logic) as cheapest first win.

**Migration files are forward-only, hand-applied, and disordered:**
- Issue: `supabase/` directory is a pile of versioned SQL files run manually via "Supabase Dashboard → SQL Editor". No migration tool (no `supabase migration new`, no Atlas, no Prisma Migrate). Ordering is implied by filename prefix and reader memory.
- Files: `supabase/v2-schema.sql`, `v2-cleanup-admin.sql`, `v2-fix-admin-identity.sql`, `v2-fix-rls-recursion.sql`, `v2-promote-admin.sql`, `v2-seed-admin.sql`, `v3-progress-schema.sql`, `v3-5-progress-extras.sql`, `v4-issues-schema.sql`, `v4-fix-issue-update-rls.sql`, `v5-push-notifications.sql`, `v5-split/1-base.sql` through `v5-split/7-fix-external-user-id.sql`, `v6-account-deletion.sql`, plus `scripts/create-feedback-table.sql` which is NOT under `supabase/`.
- Impact: No way to verify a fresh project mirrors production. `v5-push-notifications.sql` and `v5-split/*.sql` appear to overlap (both define `app_config` and `send_push_to_users`) — unclear which is canonical. The `v5-split/7-fix-external-user-id.sql` redefines `send_push_to_users` to use `include_aliases` instead of `include_subscription_ids`; if a fresh DB runs the monolithic `v5-push-notifications.sql` and skips the v5-split fixes, push will silently degrade.
- Seed scripts mixed in: `v2-seed-admin.sql`, `v2-promote-admin.sql`, `v2-cleanup-admin.sql` are operational/seed scripts, not schema migrations. They should live in `scripts/` or `seeds/`.
- Fix approach: Adopt Supabase CLI (`supabase db diff` + `supabase/migrations/<timestamp>_*.sql`). Consolidate v5 chaos into a single canonical file. Move admin-seed SQL to `scripts/`.

**`scripts/create-feedback-table.sql` lives outside `supabase/`:**
- Files: `scripts/create-feedback-table.sql`
- Impact: Anyone re-applying the schema from `supabase/` alone will miss the `demo_feedback` table. The in-app feedback modal will then 404 silently.
- Fix approach: Move into `supabase/` as next versioned migration, or fold into the migration-tool flow above.

**`progress_history` is dropped-and-recreated on re-run:**
- Issue: `supabase/v3-5-progress-extras.sql` line 17 does `drop table if exists progress_history cascade;` before `create table`. Not idempotent in the data-preserving sense — re-running the file in prod wipes history.
- Files: `supabase/v3-5-progress-extras.sql:17`
- Impact: Anyone re-running this file (e.g., to apply a fix) silently loses all progress audit data.
- Fix approach: Replace `drop table` with `create table if not exists`; add columns via `alter table … add column if not exists`. Same pattern in `v4-issues-schema.sql:6-7` for `issues` / `issue_comments` (also `drop … cascade`).

**OneSignal v1 `/players` API:**
- Issue: `src/lib/push.ts:93` uses the deprecated v1 endpoint (`https://onesignal.com/api/v1/players`). OneSignal pushes new integrations to the v2 Subscriptions API.
- Files: `src/lib/push.ts:93-97`
- Impact: API may be removed at OneSignal's discretion; less observability via OneSignal dashboard.
- Fix approach: Migrate to OneSignal v2 Subscriptions / Aliases when convenient. (Server-side already uses `include_aliases`, so the read path is modern; only the device-registration call is legacy.)

**Hardcoded admin credentials in source control:**
- Issue: `supabase/v2-seed-admin.sql:28` hardcodes admin password `admin1234` for phone `91234567`. While this is a seed script (intended to be rotated), the password is in git history forever.
- Files: `supabase/v2-seed-admin.sql:4, 28`
- Impact: If the production admin password was never rotated post-seed, the entire system is compromised by any reader of the repo.
- Fix approach: Confirm admin password has been rotated in prod. Replace hardcoded creds in the seed with a CLI-supplied env var. Document the rotation in `SYSTEM_SPEC.md`.

---

## Known Bugs

**OneSignal Android FCM device_type — RESOLVED:**
- Status: Fixed in commit `171b7a7` ("fix(push): use device_type=1 (FCM) on Android"). Verified in `src/lib/push.ts:82-83`: `const deviceType = platform === 'android' ? 1 : 0`. Note as resolved; keep eye on prod after Android release.

**Issue UPDATE RLS `with check` is `true`:**
- Issue: `supabase/v4-fix-issue-update-rls.sql:19` sets `with check (true)` on the issues UPDATE policy, intentionally bypassing post-update validation so escalation (handler role changes) can succeed. Side effect: the policy no longer prevents an authorized handler from setting `reporter_id` or `project_id` to a value they couldn't normally write.
- Files: `supabase/v4-fix-issue-update-rls.sql:14-19`
- Impact: Privilege widening only matters if app code ever lets these fields be edited — currently it does not (see `src/contexts/IssuesContext.tsx` updates which only touch handler role / status / resolved fields). Acceptable for now.
- Fix approach: Tighten `with check` to enforce immutability of `project_id`, `reporter_id`, `reporter_role`, plus `current_handler_role IN (...)` rather than `true`.

**Orphan `auth.users` row on signup failure:**
- Issue: `src/contexts/AuthContext.tsx:102-117` — if `user_profiles.insert` fails after `supabase.auth.signUp` succeeds, the auth user is left orphaned. Code already comments this: "We can't delete the auth.users row from the client; admin needs to clean up."
- Files: `src/contexts/AuthContext.tsx:111-117`
- Impact: Re-registration with the same phone is blocked until admin intervention.
- Workaround: User contacts admin (message shown in error).
- Fix approach: Add a `cleanup_orphan_auth_user()` Supabase RPC similar to `delete_my_account()` that can be called when caller's profile row doesn't exist.

---

## Security Considerations

**Public storage bucket `issue-photos`:**
- Risk: `supabase/v4-issues-schema.sql:126-128` creates bucket with `public = true`. Anyone with a URL can read any photo. Photos may contain sensitive site info (worker faces, defects, document scans).
- Files: `supabase/v4-issues-schema.sql:126-147`
- Current mitigation: URLs are unguessable (random filename + user-id-prefixed path: `${profile.id}/${Date.now()}-${random}.${ext}`) — security through obscurity only.
- Recommendations: For the upcoming **Drawings feature**, do NOT reuse this pattern. Use a private bucket with RLS policies referencing `project_members` (read = approved member, write = editor role). Use signed URLs (`createSignedUrl`) on read. Consider migrating `issue-photos` to private later, but the existing public URLs in `issues.photos[]` jsonb columns make this a breaking change requiring URL rewrite.

**`demo_feedback` RLS allows all authenticated users to read:**
- Risk: `scripts/create-feedback-table.sql` final policy reads "authenticated users can read feedback" with `using (true)`. Inline comment even acknowledges: "For simplicity we allow all authenticated users to read".
- Files: `scripts/create-feedback-table.sql` (last block)
- Current mitigation: None.
- Recommendations: Restrict to `global_role = 'admin'`. As-is, any worker can read every user's feedback including names and roles.

**`VITE_SUPABASE_ANON_KEY` and Supabase URL committed in `codemagic.yaml`:**
- Risk: `codemagic.yaml:15-16, 108-109, 208-209` hardcode `VITE_SUPABASE_URL=https://syyntodkvexkbpjrskjj.supabase.co` and the publishable anon key `sb_publishable_BHKTjGCKkot6GVa2M6BCMQ_0qBAl1jP`. Anon keys are designed to be public (protected by RLS), so this is acceptable but worth knowing.
- Files: `codemagic.yaml:15-16, 108-109, 208-209`; also `scripts/seed-demos.js:12` hardcodes the same URL.
- Current mitigation: Supabase anon keys rely on RLS, which is enabled on all known tables.
- Recommendations: No action required for anon key. **DO NOT** ever commit the service-role key — `scripts/seed-demos.js:13` correctly reads it from env. Verify `.env.production` is gitignored (it is — see `.gitignore`).

**`pg_net` push trigger leaks via logs only:**
- Risk: `send_push_to_users` in `supabase/v5-push-notifications.sql:89-91` and `v5-split/2-send-push.sql` swallows all errors into `raise log`. OneSignal API failures (rate limit, bad key, network) disappear silently.
- Files: `supabase/v5-push-notifications.sql:89-91`, `supabase/v5-split/7-fix-external-user-id.sql:59-61`
- Current mitigation: `raise log` writes to Postgres logs (visible in Supabase Dashboard).
- Recommendations: Add a `push_send_failures` table to record failed sends with timestamp + payload size for ops visibility.

**Admin global ALL policy on projects relies on a single profile flag:**
- Risk: `supabase/v2-schema.sql:78-85` grants `for all` on `projects` to anyone whose `user_profiles.global_role = 'admin'`. `user_profiles` is updatable by the owner of the row only (line 73-75), so a user cannot self-promote. Good. But: anyone with DB-level write (service role) can mint admins trivially — service-role key compromise = full takeover (true for any project).
- Files: `supabase/v2-schema.sql:78-85`
- Current mitigation: Service-role key not committed; read from env in `scripts/seed-demos.js`.
- Recommendations: Standard practice; flag only if service-role key ever gets exposed.

---

## RLS Coverage Audit

**Public schema tables with RLS enabled (verified):**

| Table | RLS | Policies | Defined in |
|-------|-----|----------|------------|
| `user_profiles` | YES | select/insert/update | `v2-schema.sql:61, 66-75` |
| `projects` | YES | admin all, PM read, member read, discovery | `v2-schema.sql:62, 78-102` + `v2-fix-rls-recursion.sql` |
| `project_members` | YES | multi-role select/insert/update | `v2-schema.sql:63, 105-160` + `v2-fix-rls-recursion.sql` |
| `progress_items` | YES | select/insert/update/delete | `v3-progress-schema.sql:74-90` |
| `progress_history` | YES | select/insert | `v3-5-progress-extras.sql:31-45` |
| `issues` | YES | select/insert/update/delete | `v4-issues-schema.sql:76-97` + `v4-fix-issue-update-rls.sql` |
| `issue_comments` | YES | select/insert | `v4-issues-schema.sql:100-119` |
| `app_config` | YES | NO POLICIES (deny-all by default — intentional) | `v5-push-notifications.sql:27`, `v5-split/1-base.sql:14` |
| `demo_feedback` | YES | insert (own), select (all auth) | `scripts/create-feedback-table.sql` |

**Tables with RLS enabled but no DELETE policy (deny-by-default):**
- `progress_history`: no delete policy → only via cascade from `progress_items`. Intentional.
- `issue_comments`: no delete policy → comments are append-only. Intentional but verify product expectation.
- `user_profiles`: no delete policy → only via `delete_my_account()` RPC (cascades from `auth.users`). Intentional.

**No tables found exposed without RLS** in any file under `supabase/` or `scripts/`. Good.

**Caveat:** This audit only sees tables defined in committed SQL. If anyone has created tables via the Supabase Dashboard manually (outside of these files), RLS state is unknown. Run this in SQL Editor before launching Drawings:
```sql
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

---

## Supabase Storage Audit

**Existing buckets:**
- `issue-photos` — **public** (see Security section above). Policies in `v4-issues-schema.sql:131-147`.

**No other buckets defined.** For the upcoming **Drawings** feature you will need a NEW private bucket. Recommended template:

```sql
insert into storage.buckets (id, name, public) values ('drawings', 'drawings', false);

create policy "Members read drawings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drawings'
    and can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

create policy "Editors upload drawings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drawings'
    and can_edit_project_progress(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
```
The file path convention `{project_id}/{...}` allows `storage.foldername()` to extract project_id for RLS. Reuse the existing `can_view_project` / `can_edit_project_progress` helpers (defined in `v3-progress-schema.sql:33-71`).

---

## Auth: Synthetic-Email Pattern Quirks

**Pattern:** `<normalized_phone>@phone.local` (see `src/lib/phone.ts:5-13`).

**Known quirks / gotchas:**
1. **HK phone validation is enforced ONLY at signup** — `isValidHKPhone` in `src/lib/phone.ts:20-24` checks `^[5679]\d{7}$`. `phoneToEmail` accepts any input — `normalizePhone` just strips non-digits. If anyone calls `phoneToEmail("abc")`, you get `@phone.local`. Defensive coding needed if phone format expands beyond HK.
2. **Supabase requires `auth.identities` row in addition to `auth.users`** — this caught the v2 admin seed; see `supabase/v2-fix-admin-identity.sql`. Any SQL-level user creation must insert into both tables.
3. **Email is the unique key in `auth.users`** — two phones that normalize identically (e.g., trailing whitespace, parens) collide. `normalizePhone` strips non-digits which is robust, but no validation prevents leading zeros (`05551234` and `5551234` normalize differently because regex requires exactly 8 digits starting with 5/6/7/9, but the normalize doesn't enforce that).
4. **No password reset flow** — Supabase password reset emails to `<phone>@phone.local` (non-routable). Users who forget their password have no path back. **Critical gap.** Likely fix: SMS OTP via Supabase phone auth, or admin-reset RPC.
5. **No email verification** — `auth.users.email_confirmed_at` is set immediately on signup, otherwise users couldn't log in (since the email is fake).
6. **Login error message is generic** — `src/contexts/AuthContext.tsx:125` returns `'手機號或密碼錯誤'` for any auth error. Hides "no such user" vs "wrong password" (intentional from security stance) but also hides "network failed" → users may think their password is wrong when it's a connectivity issue.

---

## Performance & Bundle

**Main JS bundle is 1.2 MB unminified-source-mapped (no code splitting):**
- File: `dist/assets/index-Dsg-0eew.js` = **1.2 MB**
- File: `dist/assets/html2canvas.esm-CBrSDip1.js` = 198 KB
- File: `dist/assets/index.es-ySs0aEth.js` = 148 KB (jspdf?)
- File: `dist/assets/purify.es-dhnUglUx.js` = 24 KB
- File: `dist/assets/index-C49LyEit.css` = 29 KB
- Cause: No manual chunks in `vite.config.ts` (file is 22 lines, no `build.rollupOptions`). `recharts`, `xlsx`, `jspdf`, `jspdf-autotable`, `html2canvas` all bundle into the entry chunk despite only being used in `src/lib/export.ts` and `Dashboard.tsx`.
- Impact: Cold load over slow site connections (3G/4G on construction sites) is slow. iOS/Android wrap the same dist via Capacitor so this hits mobile too.
- Fix approach: Add `build.rollupOptions.output.manualChunks` to split `xlsx`, `jspdf*`, `recharts` into a "reports" chunk. Lazy-import `src/lib/export.ts` at the call site (`Dashboard.tsx`). Estimated reduction: ~400-500 KB off the initial bundle.

**No code splitting / lazy routes:**
- File: `src/App.tsx` and friends — all pages eagerly imported (verify but pattern is consistent with bundle size).
- Fix approach: `React.lazy()` for `Dashboard`, `AdminProjects`, `AdminUsers`, `Profile`.

**Realtime channels are per-project not pooled:**
- Files: `src/contexts/ProgressContext.tsx:78`, `src/contexts/IssuesContext.tsx:66`, `src/pages/IssueDetail.tsx:70`
- Each `ProjectDetail` navigation opens 2 channels (progress + issues). `eventsPerSecond: 10` in `src/lib/supabase.ts:41` is conservative — fine.
- Acceptable for current scale; revisit if a user is in many projects simultaneously.

---

## Fragile Areas

**`src/pages/ProjectDetail.tsx` is 491 lines:**
- Files: `src/pages/ProjectDetail.tsx`
- Why fragile: Largest file in src by margin; mixes routing, multiple contexts, conditional renders, member management UI, progress UI, and issue listings.
- Safe modification: Read entire file first; changes commonly break the conditional flow that gates editor controls.
- Test coverage: None.

**Push deep-link routing uses raw hash mutation:**
- Files: `src/lib/push.ts:48` (`window.location.hash = deepLink…`)
- Why fragile: Bypasses React Router. If a deep-link arrives while a modal is open or auth is loading, navigation state may be inconsistent. No retry if not logged in yet.
- Fix: Use `react-router` programmatic nav via a singleton navigator, queue deep-link until `AuthProvider.loading === false`.

**Manual photo upload path encodes user_id:**
- Files: `src/contexts/IssuesContext.tsx:108` — `const fileName = \`${profile.id}/${Date.now()}-${random}.${ext}\``
- Why fragile: Account deletion (`delete_my_account`) cascades from `auth.users` but does NOT delete storage objects. Orphaned photos remain in the bucket forever, still publicly readable, still URL-referenced from `issues.photos`.
- Fix: Either keep (audit trail rationale, already documented in `v6-account-deletion.sql`) or extend the RPC to also `delete from storage.objects where bucket_id = 'issue-photos' and (storage.foldername(name))[1] = uid::text`.

**`AuthContext` and `pushLoginUser` race on initial load:**
- Files: `src/contexts/AuthContext.tsx:53-54`, `src/lib/push.ts:30`
- Why fragile: Initial session load fires `void pushLoginUser(user.id)` without awaiting; if the user navigates immediately, the OneSignal registration may complete after they've already signed out. The `pushLogoutUser` was already called, then a stale `registerDeviceWithOneSignal` writes a player ID to a "logged out" profile.
- Fix: Gate registration on `event === 'SIGNED_IN'` only (already done for state-change handler line 66; initial-load path at line 54 fires unconditionally).

---

## Mobile-Specific Quirks

**Capacitor:**
- iOS bundle id: `com.kwanchunkit.constructionapp` (`capacitor.config.ts:4`).
- Splash screen: 2000ms forced (`capacitor.config.ts:9`). If app hot-launches from background, 2s splash may feel slow.
- Status bar: dark icons on white background — verify against any dark-mode UI work.
- `webDir: 'dist'` — every change requires `npm run build && npx cap sync`. There's a `cap:sync` script but it only targets iOS (`npx cap sync ios`) — Android sync needs a separate command.

**iOS-specific:**
- Account deletion RPC `delete_my_account` exists explicitly for Apple Guideline 5.1.1(v) compliance (`supabase/v6-account-deletion.sql:2`). DO NOT regress this — Apple will reject updates.
- Push device_type=0 (APNs). Production tested.

**Android-specific:**
- Codemagic build uses Java 21 (commit `5b1cc83`). Capacitor 8 requirement.
- `android/gradlew` had to be made executable on Windows (commit `052d013`). Future Windows commits may drop the +x bit again.
- Push device_type=1 (FCM) — JUST fixed (commit `171b7a7`); verify on first real device test.
- Workflow `codemagic.yaml` is on `mac_mini_m2` instance (commit `ccd9921`) due to free-tier constraints.
- TODO inside `codemagic.yaml:197` — "switch to android-play-store workflow (TODO: add)".

**HashRouter assumed:**
- File: `src/lib/push.ts:48` — strips leading `#` from deep-links, implying HashRouter not BrowserRouter. Verify in `src/App.tsx` if changing routers — push deep-links will silently break.

---

## TODO / FIXME Inventory

Grep across `*.{ts,tsx,sql,md,yaml,yml,json}`:

| File | Line | Marker | Note |
|------|------|--------|------|
| `codemagic.yaml` | 197 | TODO | "switch to android-play-store workflow (TODO: add) which …" |

**That's literally the only TODO/FIXME/HACK/XXX in the entire repo source.** Either the codebase is squeaky clean or the team prefers untagged tech debt. Combined with zero tests, the latter is more likely.

---

## Hardcoded Secrets / IDs Audit

**Found in committed source:**

| Value | Location | Severity |
|-------|----------|----------|
| Supabase URL `https://syyntodkvexkbpjrskjj.supabase.co` | `codemagic.yaml:15,108,208`; `scripts/seed-demos.js:12` | Public OK |
| Supabase anon key `sb_publishable_BHKTjGCKkot6GVa2M6BCMQ_0qBAl1jP` | `codemagic.yaml:16,109,209` | Public OK (RLS-protected) |
| OneSignal App ID `71f914a3-6dc3-4c4a-80e6-70df8f17d5d1` | `src/lib/push.ts:10` | Public OK |
| Admin password `admin1234` for phone `91234567` | `supabase/v2-seed-admin.sql:4,28` | **MUST be rotated in prod** |
| Admin phone `91234567` | `supabase/v2-seed-admin.sql`, `v2-promote-admin.sql`, `v2-fix-admin-identity.sql`, `v2-cleanup-admin.sql` | OK if password rotated |
| Demo user password `Demo@2026` | `scripts/seed-demos.js:24` | Medium — these accounts grant access; rotate if demos are public |

**NOT found in source (good):**
- OneSignal REST key — stored in `app_config` table, not git.
- Supabase service-role key — read from env in `scripts/seed-demos.js:13`.
- APNs/FCM credentials — managed externally (Codemagic / Firebase).

**Action items:**
1. Confirm production admin password rotated since v2 seed. If not — rotate **today**.
2. Strip `v2-seed-admin.sql` plaintext password before next public release of the repo (history rewrite has limited value since it's already pushed; rotation is the real fix).

---

## Error Handling Audit

**Method:** Grepped 46 `await supabase.*` call sites across 14 files; cross-checked against 15 `try`/`.catch` blocks across 6 files.

**Findings:**
- Most Supabase calls correctly destructure `{ data, error }` and return error to the caller — see `src/contexts/ProgressContext.tsx`, `IssuesContext.tsx`, `ProjectsContext.tsx`. Good pattern.
- However, **errors are only logged via `console.error`** in many fetch paths (e.g., `src/contexts/AuthContext.tsx:40`, `ProgressContext.tsx:65`, `IssuesContext.tsx:124`). Users see a stuck spinner or empty list with no UI signal.
- `try`/`catch` wrappers exist mostly around `push.ts` calls and `AuthContext.tsx:115` rollback path. Most Supabase reads are NOT wrapped in try/catch because the SDK returns errors rather than throwing — acceptable.

**Unawaited promises (fire-and-forget):**
- `src/contexts/AuthContext.tsx:54, 67` — `void pushLoginUser(user.id)`. Intentional (see Fragile Areas note about race condition).
- `src/contexts/IssuesContext.tsx:93` — `await supabase.from('issue_comments').insert(...)` is awaited but the result is discarded (no `error` check). If insert fails (e.g., RLS), the UI shows the issue created but no audit comment. Same pattern at lines 156, 179, 200.
- `src/contexts/ProgressContext.tsx:123` — `recordHistory` swallows errors (no error check, no return). History silently absent if insert fails.

**Missing surface of errors to UI:**
- `console.error('comments fetch error:', error)` in `src/contexts/IssuesContext.tsx:124` returns empty array — UI shows "no comments" indistinguishable from a fetch error.
- Same pattern: `src/contexts/ProgressContext.tsx:190` (history fetch).

**Recommendations:**
- Add a global `ErrorBoundary` and a toast/snackbar component; surface fetch errors instead of `console.error`-only.
- Check `error` return on every `insert` (the audit-comment inserts are particularly important — they're security-relevant trail).
- Audit `recordHistory` callers to surface failures.

---

## Test Coverage Gaps

**Test coverage: 0% (zero test files).** Treat the entire codebase as untested. Highest-leverage areas to test first:

1. `src/lib/phone.ts` — pure functions, trivial to test, used by every auth flow.
2. `src/types.ts` — `deriveStatus`, `floorsToProgress` are pure (used in `ProgressContext`).
3. RLS policies — write SQL-level tests using `set local role authenticated; set local request.jwt.claims = ...`. Especially the recursive-fix policies in `v2-fix-rls-recursion.sql`.
4. Auth flow E2E via Playwright — signup, login, signup-with-existing-phone, signOut, deleteAccount.
5. Issue escalation chain via Playwright — covers RLS `with check (true)` regression risk.

---

## Scaling Limits

**`progress_items.assigned_to` and `delegated_to` are `uuid[]` columns:**
- Files: `supabase/v3-5-progress-extras.sql:13-14`
- Limit: Postgres handles thousands fine, but querying "items assigned to user X" requires `where user_id = any(assigned_to)` which can't use a btree index. Acceptable up to ~10k items per project.
- Scaling path: If projects exceed this, normalize into `progress_item_assignees` table.

**`projects.assigned_pm_ids uuid[]`:**
- Files: `supabase/v2-schema.sql:35`
- Same pattern. Used in every RLS policy that involves PM authority. Currently fine since #PMs per project is small.

**No pagination on key lists:**
- `Projects.tsx`, `IssuesContext.tsx` fetch all rows. At ~hundreds of issues per project this is fine; at ~thousands, will degrade.

---

## Dependencies at Risk

**`xlsx` (0.18.5):**
- Status: SheetJS Community Edition. Active development moved to a CDN-distributed package; npm version is stale. Known high-severity prototype pollution / ReDoS advisories.
- Files: imported in `src/lib/export.ts`.
- Impact: Bundle bloat + audit warnings.
- Migration: Either pin to the CDN distribution per SheetJS guidance, or switch to `exceljs`. Lazy-loading the export module (recommended in Performance section) mitigates the bundle-size half of the problem.

**`jspdf-autotable` 5.x with `jspdf` 4.x:**
- Status: Major versions. Verify compatibility (5.x autotable typically requires jspdf 2.x; this may be a pre-release or a fork).
- Files: `src/lib/export.ts`.
- Migration: Test PDF export thoroughly before next mobile release; lock versions in `package.json` (currently using caret ranges).

---

## Missing Critical Features

**No password reset:**
- Problem: Synthetic emails (`@phone.local`) are non-routable; Supabase password-reset flow is broken by design here.
- Blocks: Any user who forgets password is permanently locked out (must contact admin).
- Fix path: SMS OTP (Supabase phone auth + Twilio) OR admin-only reset RPC + UI in `AdminUsers.tsx`.

**No CI:**
- Problem: No `.github/workflows/` (verify), no automated checks before merge.
- Blocks: Quality gates; safe refactoring.
- Fix path: Add a workflow that runs `npm run build` (catches TS errors) at minimum. Add tests when they exist.

**No error monitoring:**
- Problem: No Sentry / Bugsnag / Datadog integration. Production errors surface only via `console.error` in user browsers.
- Blocks: Knowing when production breaks.
- Fix path: Sentry has a Capacitor SDK; integrate into `src/main.tsx`.

**No analytics / observability:**
- Problem: No way to know how many users hit each screen, retention, conversion.
- Fix path: PostHog or Plausible, gated by user consent for App Store compliance.

---

## Summary: Top 5 Risks Before Drawings Phase

1. **Migration chaos** — fix v5 split-vs-monolith, decide canonical schema source, before adding more SQL.
2. **Public storage bucket precedent** — Drawings MUST use private bucket + RLS; do not copy `issue-photos` pattern.
3. **Zero tests** — at least add Playwright happy-path before Drawings rollout to catch regressions in adjacent flows.
4. **Admin seed password in git** — verify rotation status of `admin1234` in prod.
5. **No password reset** — pre-existing risk that grows with every signup.

---

*Concerns audit: 2026-05-11*
