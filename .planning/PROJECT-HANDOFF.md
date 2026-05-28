# CK工程 / Construction App — Project Handoff Notes

> **AGENT INSTRUCTIONS** — Read entire document before doing anything.
> You are joining a multi-session project. The user (kck980724@gmail.com)
> built this Hong Kong construction management app over many sessions
> with prior Claude agents. They are afraid of losing context across
> sessions, so they maintain this document as canonical handoff.
>
> **At the start of your session:**
> 1. Read this entire file. Do NOT skim.
> 2. Confirm you understand by listing: project path, tech stack version
>    limits, current Apple/Google review state, and any "Outstanding
>    waits" still pending.
> 3. If user asks to update this doc each morning, append a new entry
>    to the "Daily Log" section at the bottom — do NOT rewrite earlier
>    entries.
> 4. Caveman mode (terse) is active by default in this user's sessions.
>    Code/commits/security messages stay full prose.
>
> **Never:**
> - Submit to App Store production review without explicit user request.
> - Push to `main` without verifying build is green.
> - Run destructive SQL on Supabase prod without explicit user confirm.
> - Trigger Codemagic builds for `ios-app-store` or `android-play-store`
>   workflows without explicit user confirm (these go to public stores).
>
> **Always:**
> - Use Supabase MCP `apply_migration` for DDL, never `execute_sql`.
> - Commit via heredoc commit message and never amend (create new commit).
> - When the user mentions a feature touching multiple personas,
>   reference `.planning/persona-sim-2026-05-26/REPORT-R3.md` first.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **App name** | CK工程 / 建築工程管理 / Construction App |
| **Package id** | `com.kwanchunkit.constructionapp` |
| **Apple app id** | `6764754372` |
| **Codemagic project** | `construction-app` (id `69f2eb03e3b9d1e5b1142140`) |
| **Vercel project** | `construction-app` (slug `kwanchunkit724s-projects`, team_id `team_4JjtlG07Dl5kOeoMYcStuPFR`) |
| **GitHub repo** | `https://github.com/kwanchunkit724/construction-app` |
| **Supabase project** | `syyntodkvexkbpjrskjj` |
| **Supabase URL** | `https://syyntodkvexkbpjrskjj.supabase.co` |
| **Supabase anon key** | `sb_publishable_BHKTjGCKkot6GVa2M6BCMQ_0qBAl1jP` (publishable, safe in client) |
| **Apple Team ID** | `C22JSRYW54` |
| **Developer account** | kck980724@gmail.com |
| **Personal name on stores** | Kwan Chun Kit / Kwan Chun Robinson Kwan |
| **Current version** | 1.1 (App Store production review pending) |

---

## 2. File Path Anchors

| Path | Purpose |
|---|---|
| `C:\Users\user\construction-app\` | Repo root (Windows host) |
| `C:\Users\user\construction-app\.claude\worktrees\sweet-goldstine-e99977\` | **THIS worktree — primary working tree** |
| `.planning/` | All planning + simulation reports |
| `.planning/PROJECT-HANDOFF.md` | **THIS DOCUMENT** |
| `.planning/persona-sim-2026-05-26/REPORT.md` (R1) | Round 1 persona sim |
| `.planning/persona-sim-2026-05-26/REPORT-R2.md` | Round 2 sim — found user_profiles self-promote P0 |
| `.planning/persona-sim-2026-05-26/REPORT-R3.md` | Round 3 — security 8/10 |
| `.planning/testing-v1.1-ios-checklist.md` | iOS TestFlight manual test checklist |
| `supabase/v*-*.sql` | DDL migrations applied to live Supabase |
| `src/` | React + TypeScript app source |
| `ios/` | Capacitor iOS native shell |
| `android/` | Capacitor Android native shell |
| `codemagic.yaml` | CI workflows (4 of them) |
| `package.json` | npm scripts + deps |
| `capacitor.config.ts` | Capacitor `webDir: 'dist'`, splash, status-bar |
| `CLAUDE.md` | Project instructions for agents (top-level) |

---

## 3. Goal of Project

**Replace WhatsApp + paper + spreadsheet workflow** for HK general contractors.
Multi-site, multi-role construction management. Already live on iOS App Store
(v1.0.71 pre-this-iteration). Android in closed alpha test pre-production.

**Core value statement**: 判頭 + 工地主任 always know exactly what's happening
on every site, with a shared audit trail that survives disputes.

**Hard constraints (don't break in this milestone):**
- Tech stack locked: React 18 + TS 5.4 + Vite 5 + Tailwind 3.4 + Capacitor 8 + Supabase. No rewrites.
- Mobile-first: all new screens work on iPhone 390px wide AND BlueStacks tablet 1600x900.
- Storage budget: Supabase Free tier 1GB.
- Push budget: OneSignal Free tier.
- Backwards compatible: live iOS users must not break.
- Apple compliance: account deletion required (v6 schema; verified v20 SET NULL FKs).
- All UI in Traditional Chinese (zh-HK). PTW types use HK industry terms. VO in HKD only.
- Auth: phone+password via synthetic email (`<digits>@phone.local`). No magic links / SSO this milestone.

---

## 4. Technology Stack — exact versions in use

| Layer | Stack |
|---|---|
| Web framework | React 18.2 + react-dom + HashRouter (not BrowserRouter — Capacitor compat) |
| Build | Vite 5.1 + tsc 5.4 + esbuild |
| Native shell | Capacitor 8.3 (`@capacitor/core`, `ios`, `android`, `push-notifications`, `splash-screen`, `status-bar`, `network`) |
| Styling | Tailwind 3.4 with custom `site-*` (slate) and `safety-*` (orange) palettes |
| Routing | react-router-dom 6.22 (HashRouter) |
| Backend client | `@supabase/supabase-js` 2.104+ |
| Charts | recharts 2.12 |
| Icons | lucide-react 0.363 |
| Export | xlsx 0.18 + jspdf 4.2 + jspdf-autotable + html2canvas |
| Push | OneSignal v1 `/players` API keyed by `external_user_id = auth.user.id` |
| Drawing viewer | react-pdf 10 + react-zoom-pan-pinch + qrcode.react |
| Signature | react-signature-canvas |
| Voice recorder | capacitor-voice-recorder 7 |
| Capacitor camera / filesystem / geolocation | yes (8.x) |
| iOS deployment target | 15.0 |
| Android compileSdk | 36, minSdk 24, targetSdk 36, JDK 21 |
| Codemagic runner | Mac mini M2 (free tier) |
| Codemagic Android Gradle Plugin | 8.13.0 |

---

## 5. Database Schema Migrations (Supabase)

Applied in order; each file under `supabase/`. **Service-side state-of-truth.**

| Version | Purpose |
|---|---|
| v2-schema.sql | Core: user_profiles, projects, project_members |
| v3-progress-schema.sql / v3-5-progress-extras.sql | Progress tree (parent_id, multi-zone) |
| v4-issues-schema.sql / v4-fix-issue-update-rls.sql | Issue tracking + escalation chain |
| v5-push-notifications.sql + v5-split/ | OneSignal triggers per table |
| v6-account-deletion.sql | Apple compliance — `delete_my_account()` RPC |
| v8-drawings.sql + v8-private-bucket-template.sql | Drawings attached to leaf items |
| v9-* | SI/VO/approval chain |
| v10-* | PTW (Permit to Work) + safety_officer role |
| v11-* | Contacts, dailies, materials, events, timetable RPC, progress visibility, multi-zone, auto-code |
| v12-* | Admin bypass hotfixes for v11 RLS |
| v13-general-foreman-role.sql | Add 老總 (general_foreman) role |
| v14-supervisor-narrowing.sql | Narrow supervisors to admin/pm/general_foreman only |
| v15-progress-edit-rights-split.sql | Split canManageStructure vs canUpdateItem |
| **v16-materials-rls-fix.sql** | **P0 fix**: materials UPDATE/DELETE owner+supervisor only (persona-sim R1) |
| **v17-user-profiles-rls-hardening.sql** | **P0 fix**: trigger blocks self-promote to admin; narrow SELECT; admin RPCs (persona-sim R2) |
| **v18-rls-audit-hardening.sql** | RLS audit pass: 9 legacy tables locked, projects "name discovery" dropped, contacts/events assigned-PM gate, events auto-notify trigger, materials.urgent column |
| **v19-r3-followups.sql** | Trigger locks company column; events_insert adds general_foreman (persona-sim R3) |
| **v20-delete-account-fk-cascade.sql** | 17 user-ref FKs flipped RESTRICT/NO ACTION → SET NULL (Apple account-deletion compliance) |
| **v21-project-members-peers.sql** | Approved members read project peers (fixes empty 指派 picker — iOS testing) |

**RLS posture as of v21**: 25/25 attack vectors hold per persona-sim R4
prod validation (何判頭). All admin tooling routes through SECURITY DEFINER
RPCs: `admin_list_user_profiles`, `admin_get_user_profile`,
`admin_update_user_role`, `is_caller_admin`, `is_material_supervisor`,
`shares_project_with`, `is_pm_of_applicant`, `is_approved_member_of_project`,
`enforce_user_profile_write_gate` (trigger).

---

## 6. Persona Simulation Seed Data

Live in Supabase prod. All tagged `[persona-sim]` in name/notes:

| Phone | Role | Name | sub_role |
|---|---|---|---|
| 60001001 | pm | 李 PM | null |
| 60001002 | general_foreman | 王老總 | null |
| 60001003 | main_contractor | 陳工程師 | engineer |
| 60001004 | main_contractor | 黃管工 | foreman |
| 60001005 | subcontractor | 何判頭 | null |

**All passwords:** `test1234`
**Project:** `DC2026 油塘住宅 [persona-sim]` (project_id `cccc2026-2026-2026-2026-000026202620`)
**Zones:** A=1座, B=2座, C=3座, D=4座
**Items:** ~26 progress items with assignments
**Materials:** intentional 逾期 case (水管 100mm planned in past)
**Daily:** yesterday seeded for 陳工程師 + 黃管工
**Tag for cleanup:** all rows have `[persona-sim-DC2026]` in title/notes

---

## 7. Roles & Permission Tiers

```
admin (system-wide; bypass most RLS)
  └─ supervisors (see everything in project, can mutate structure)
      ├─ pm                — project manager, tied to projects.assigned_pm_ids
      └─ general_foreman   — 老總, supervisor tier added in v13
  └─ restricted (only own assigned items via get_visible_progress_items RPC)
      ├─ main_contractor   — sub_role = foreman OR engineer (writes daily)
      ├─ subcontractor     — 判頭 (cannot write daily, gets banner)
      ├─ subcontractor_worker — read-only
      ├─ owner             — 業主, read-only
      └─ safety_officer    — PTW chain signoff only
```

**Two-place enforcement** (must keep aligned):
1. DB RLS policies (`supabase/*.sql`)
2. Client gates in React contexts (`canManageStructure`, `canUpdateItem`, etc.)

**Issue escalation chain:**
```
subcontractor_worker → subcontractor → main_contractor → pm → (terminal)
```

---

## 8. Deployment URLs

| Surface | URL | Source |
|---|---|---|
| Web production | `https://construction-app-lime-six.vercel.app` | main branch auto-deploy |
| Web alt alias | `https://construction-app-kwanchunkit724s-projects.vercel.app` | same |
| Web main-branch alias | `https://construction-app-git-main-kwanchunkit724s-projects.vercel.app` | same |
| Web preview per-PR | `https://construction-<hash>-kwanchunkit724s-projects.vercel.app` | non-main commits |
| iOS App Store | `https://apps.apple.com/.../id6764754372` | v1.0 live, v1.1 in review |
| iOS TestFlight | testers get push when build approved | builds #84–#87+ |
| Play Store closed alpha | opt-in URL: `https://play.google.com/apps/testing/com.kwanchunkit.constructionapp` | v1.1 LIVE 5/27 |
| Play Store install (post-opt-in) | `https://play.google.com/store/apps/details?id=com.kwanchunkit.constructionapp` | |

---

## 9. Codemagic Workflows

`codemagic.yaml` defines 4. Auto-trigger on push to `main` unless noted.

| Workflow | Trigger | Output | Publish to |
|---|---|---|---|
| `ios-app-store` | **manual only** | App.ipa + signed | TestFlight (`submit_to_app_store: false` — does NOT auto-submit to store review) |
| `ios-testflight` | push main | App.ipa + signed | TestFlight |
| `android-internal-test` | push main | app-debug.apk + app-debug.aab (debug-signed) | artifact only — sideload / Internal App Sharing |
| `android-play-store` | **manual only** | app-release.aab (release-signed) | artifact only — user manually uploads to Play Console |

**Critical CI guard (`fix(ci)` commit 1529e78):**
Both anti-cache step (purge stale dist before cap sync) + verify packaged
bundle matches fresh dist (hard-fail if hash mismatch). This is because
Codemagic's persistent runner was shipping stale dist into APK/IPA earlier
in v1.1 ship cycle.

**iOS marketing version pattern (after commit 4b0b812):** hard-coded `1.1`.
For next minor bump must edit `codemagic.yaml` line `agvtool new-marketing-version "1.1"`
to e.g. `"1.2"`. Build numbers (`CFBundleVersion`) auto-increment by `date +%s`.

---

## 10. Current Ship State (as of last update)

### ✅ Live in production
- **Web (Vercel `lime-six`)**: commit `4b0b812` — full v1.1 + iOS testing fixes
- **Supabase DB**: v16-v21 migrations applied, 25/25 attack vectors hold
- **iOS TestFlight**: build 1779860261 v1.1 — user tested + passed
- **Android Play Closed Alpha**: v1.1 — security + UX LIVE since 5/27 13:44 to 12 opted-in testers

### ⏳ Outstanding waits
- **iOS App Store production review**: submitted 5/27, Apple ETA up to 48hr
- **Android production track gate**: 12/12 testers opted in ✅, 14-day clock running (eligible ~6/10/2026 earliest)

### 🚫 NOT done (future iterations)
- Android production track release (locked behind 14-day clock + Google production-access questionnaire)
- iOS app store production rollout (waiting Apple verdict)
- Production-track for either platform = public stores

---

## 11. Recent Commits (most-recent-first on `main`)

```
4b0b812 fix(ci): iOS marketing version 1.1 not 1.0.<build>
6b21633 fix: iOS testing findings — 老總 events + 指派 picker empty (v21 + general_foreman gates)
1529e78 fix(ci): purge stale dist before cap sync + verify bundle hash matches
6401b50 chore(release): bump app version 1.0 → 1.1
40cf72f fix(security): v20 SET NULL on user-ref FKs
98013e7 docs(persona-sim): round 3 round-table report
65298c2 fix(security): real tab bleed fix — per-tab storageKey + lock company column
c6b4d45 feat(v1.4-iter3): RLS audit pass + UX punch list
4b61ade docs(persona-sim): round 2 round-table report
876bea4 fix(security): v17 user_profiles RLS hardening
843f855 fix: address persona-sim P0/P1 findings (R1)
a7962cb feat(v1.4): general_foreman role + peer-zone child item add
```

---

## 12. Conventions & Pitfalls

### Code style (observed from source — keep consistent)
- Single quotes for JS/TS strings, double quotes for JSX attributes
- Semicolons **omitted** (ASI style)
- 2-space indent
- React components in PascalCase files; pages default-export; components named-export
- Library/utility files camelCase
- Tables / columns snake_case (e.g. `user_profiles.global_role`)
- TS interfaces mirror SQL column names verbatim — no camelCase aliasing

### React patterns
- **Two-tier app**: React SPA ↔ Supabase. No backend code to write.
- **HashRouter not BrowserRouter** (Capacitor `file://` compat).
- **Context-per-domain**: AuthContext, ProjectsContext, ProgressContext, IssuesContext, DailiesContext, MaterialsContext, TimetableContext, ContactsContext, DrawingsContext, SiContext, VoContext, PtwContext, etc.
- **Realtime by table**: each context opens `postgres_changes` channel and refetches on any change.

### Tailwind palette
- `font-sans` → Inter with Chinese fallbacks Microsoft JhengHei + PingFang HK
- `font-heading` → Poppins
- `site-*` (slate) for neutrals; `safety-*` (orange) for CTAs
- All touch targets ≥44px (Apple HIG enforced in `@layer base`)

### Status colors
- Open / warning: `bg-amber-100 text-amber-700`
- Resolved / success: `bg-green-100 text-green-700`
- Info: `bg-blue-50 text-blue-700`
- Error: `bg-red-50 text-red-600 border-red-200`
- 急件 (urgent): `bg-red-600 text-white` (DB column `materials.urgent`)

### Things that bit us
- **Codemagic stale dist** (fixed v21-era commit). If you change `npm run build` output, the CI verify step will hard-fail — that's intentional.
- **Tab bleed** via supabase-js `BroadcastChannel(storageKey)`. Fixed with per-tab UUID storageKey. Native (Capacitor) uses stable `ckcon-auth-native-v1`; web uses `ckcon-auth-tab-<uuid>` from sessionStorage.
- **RLS recursion**: do NOT add policies that reference the same table inside their USING clause without wrapping the lookup in a SECURITY DEFINER plpgsql function with `row_security = off`. See v17/v21 helpers.
- **Codemagic ios-app-store + android-play-store are manual triggers** — they don't auto-fire on push.

---

## 13. How to Resume Work

If user says "continue" or you just spawned and need to figure out where you are:

1. Read this file top to bottom.
2. `git log --oneline -10` to see recent commits.
3. `git status --short` to see uncommitted state.
4. Check the Daily Log section below for last-update entry.
5. Check Apple App Store Connect at `https://appstoreconnect.apple.com/apps/6764754372/distribution/ios/version/inflight` for review verdict.
6. Check Play Console at `https://play.google.com/console/u/0/developers/8040396499621325548/app/4973184217658203048/app-dashboard` for 14-day clock progress.
7. If user asks for a feature change: search the relevant context (`src/contexts/*.tsx`) and the corresponding DB table policies first — don't guess.

---

## 14. Daily Log

> Append a new dated entry each morning. Each entry: 1) anything that
> changed in production (Apple verdict, Google verdict, tester count),
> 2) any commits pushed, 3) any open questions you parked.

### 2026-05-28 (initial doc creation)

- iOS App Store v1.1 still in Apple review (submitted 5/27, no verdict yet)
- Android Play closed alpha v1.1 LIVE; **12 / 12 testers opted in** (gate 2 cleared yesterday)
- Android 14-day clock running (eligible production-access apply ~2026-06-10)
- Web prod `lime-six` serving commit `4b0b812`
- Supabase DB on v21 — no migrations pending
- No uncommitted local changes expected on the worktree
- User wants daily updates to this file (this section)
- Next things to watch: Apple review email; tester opt-in count staying ≥12; any tester bug reports

### 2026-05-28 (CronCreate session-only fired ~00:30 HKT, local agent)

- **Apple App Store v1.1**: ⚠ couldn't check — App Store Connect session expired (redirect to login). User needs to re-login in Chrome MCP tab `1224145339` before next check. Status assumption: **still in review** (no email received per user, would've been mentioned).
- **Android Play closed alpha**: ✅ **12 / 12 testers opted in** (maintained from yesterday). 申請發佈正式版本 button still grayed (14-day clock continuing). Earliest production-access apply ~2026-06-10.
- **git log origin/main (top 5)**:
  - `9d8729b` docs(handoff): create PROJECT-HANDOFF.md for cross-session continuity
  - `4b0b812` fix(ci): iOS marketing version 1.1 not 1.0.<build>
  - `6b21633` fix: iOS testing findings — 老總 events + 指派 picker empty
  - `1529e78` fix(ci): purge stale dist before cap sync + verify bundle hash matches
  - `6401b50` chore(release): bump app version 1.0 → 1.1
- **No new commits since yesterday's log** (handoff doc creation was the latest push).
- **Action items waiting on user**:
  1. Re-login App Store Connect in Chrome so daily checks can verify Apple verdict automatically
  2. Wait for Apple review email
  3. Wait for 14-day clock (~2026-06-10) before applying Google production access
- **Persistent remote routine `trig_01HtHaHGhnoXmEeYNpBVfHVb` was created today** (cron `8 1 * * *` UTC = daily 9:08 AM HKT). First fire 2026-05-28 09:08 HKT. Anthropic infrastructure, survives session restarts. https://claude.ai/code/routines/trig_01HtHaHGhnoXmEeYNpBVfHVb
