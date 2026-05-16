<!-- GSD:project-start source:PROJECT.md -->
## Project

**CK工程 / Construction App**

A Hong Kong construction management mobile + web app for general contractors
running multiple sites. PMs, foremen, subcontractors, and admins coordinate
project zones, progress, issues, and approvals through a shared system —
replacing the WhatsApp + paper + spreadsheet status quo. Already live on the
iOS App Store; Android build verified on BlueStacks and pending Google Play
identity verification.

**Core Value:** **判頭 + 工地主任 always know exactly what's happening on every site, with a
shared audit trail that survives disputes** — because every instruction,
permit, drawing, progress tick, and issue is captured in one system instead
of scattered across WhatsApp, paper diaries, and people's memories.

### Constraints

- **Tech stack — locked:** React 19 + TS + Vite + Tailwind 3.4 + Capacitor 8 + Supabase. No rewrites in this milestone.
- **Mobile-first:** All new screens must work on phone (390px wide) and BlueStacks tablet (1600x900). Test both before merge.
- **Storage budget:** Supabase Free tier (1GB) — drawings + permit photos will dominate. Need explicit "compress on upload" or "warn on >5MB" UX.
- **Push budget:** OneSignal Free tier — used for SI/VO approval chain notifications + permit signing. Need to not spam.
- **Backwards compatible:** Existing live users on iOS App Store must not break when new migrations run. New tables only; no destructive changes to `progress_leaf_items` or `user_profiles`.
- **Apple compliance:** Already passed account-deletion review. Any new auth flow must preserve that. Any new role (`safety_officer`) must inherit account-deletion.
- **Hong Kong specifics:** All UI in Traditional Chinese (zh-HK). PTW types use HK industry terminology. VO quotation in HKD only.
- **Auth model — locked:** Phone+password via synthetic email. Don't introduce magic links or SSO in this milestone.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ~5.4.5 — All web app source under `src/` (strict mode enabled in `tsconfig.json`)
- SQL (PostgreSQL dialect) — Supabase schema and triggers under `supabase/`
- Swift — iOS native shell (`ios/App/App/AppDelegate.swift`, `ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift`)
- Java/Kotlin (Android skeleton) — Capacitor-generated Android wrapper under `android/`
- Groovy (Gradle DSL) — `android/build.gradle`, `android/app/build.gradle`, `android/variables.gradle`
- JavaScript (ESM config files) — `postcss.config.js`, `tailwind.config.js`
## Runtime
- Browser (ES2020 target, DOM + DOM.Iterable libs per `tsconfig.json`)
- Capacitor WebView runtime on iOS/Android (web bundle from `dist/` packaged inside the native shell via `capacitor.config.ts` `webDir: 'dist'`)
- Node.js (`"node": latest` in `codemagic.yaml`)
- npm with `package-lock.json` (locked via `npm ci` in CI)
- iOS — Capacitor 8 on APNs production environment (`ios/App/App/App.entitlements` `aps-environment = production`)
- Android — Capacitor 8 on Android SDK `compileSdk 36`, `minSdk 24`, `targetSdk 36` (`android/variables.gradle`)
- Android Gradle Plugin 8.13.0; google-services plugin 4.4.4 (`android/build.gradle`)
- Java 21 required for Android builds (`codemagic.yaml: java: 21`)
- npm
- Lockfile: present (`package-lock.json`) — `npm ci` used in Codemagic workflows
## Frameworks
- React 18.2 (`react`, `react-dom`) — UI framework, function-component + hooks idiom
- React Router DOM 6.22.1 — HashRouter (deep links use `#/...`, see `src/lib/push.ts` `window.location.hash`)
- Capacitor 8.3 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli`) — Native bridge
- Tailwind CSS 3.4 — Utility CSS, config in `tailwind.config.js` with custom `site` (slate) and `safety` (orange) palettes
- Supabase JS client 2.104+ (`@supabase/supabase-js`) — Postgres + Auth + Storage + Realtime, wrapped with a 15s fetch timeout in `src/lib/supabase.ts`
- Playwright 1.59 (`@playwright/test`, `playwright`) — E2E (devDependency only, no config file at repo root)
- Vite 5.1 (`vite`, `@vitejs/plugin-react`) — Dev server + production build (`vite.config.ts`, `base: './'` for Capacitor `file://` compatibility)
- PostCSS 8.4 + autoprefixer 10.4 — `postcss.config.js`
- TypeScript compiler `tsc` runs before `vite build` (see `package.json` `"build": "tsc && vite build"`)
## Key Dependencies
- `@supabase/supabase-js` ^2.104.0 — Sole backend client (auth, data, storage, realtime)
- `@capacitor/push-notifications` ^8.0.3 — Captures APNs/FCM tokens; relays through `src/lib/push.ts`
- `@capacitor/splash-screen` ^8.0.1 — Splash config in `capacitor.config.ts`
- `@capacitor/status-bar` ^8.0.2 — Status bar style
- `react-router-dom` ^6.22.1 — Routing (HashRouter)
- `lucide-react` ^0.363.0 — Icon library
- `xlsx` ^0.18.5 — Excel export (`src/lib/export.ts`)
- `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.7 — PDF export with tables
- `recharts` ^2.12.2 — Dashboard charts
- `vite-plugin-pwa` ^1.2.0 + `workbox-window` ^7.4.0 — Present in deps but currently NOT registered (see `src/main.tsx`: explicit SW cleanup of any v1 leftovers)
## Configuration
- `vite.config.ts` — Vite + React plugin; `base: './'` for Capacitor; dev server `host: 0.0.0.0:5173` with WSS HMR for tunnelling
- `tsconfig.json` — Strict TS, ES2020, bundler module resolution, JSX `react-jsx`, `noEmit: true`
- `tsconfig.node.json` — Referenced for Vite config typechecking
- `tailwind.config.js` — Custom theme (Inter/Poppins fonts, site/safety palettes, custom shadows/radii)
- `postcss.config.js` — Tailwind + autoprefixer
- `capacitor.config.ts` — appId `com.kwanchunkit.constructionapp`, appName `CK Construction`, webDir `dist`, splash + status-bar plugin config
- `VITE_SUPABASE_URL` — required, validated at module load in `src/lib/supabase.ts`
- `VITE_SUPABASE_ANON_KEY` — required, validated at module load in `src/lib/supabase.ts`
- (For CI builds, these are baked in via `codemagic.yaml` env vars per workflow.)
- `ios/App/App/Info.plist` — Bundle metadata, usage strings (Camera/Photos/Microphone in zh-HK), `UIBackgroundModes: remote-notification`, portrait + landscape orientations
- `ios/App/App/App.entitlements` — `aps-environment = production`
- `ios/App/App/AppDelegate.swift` — Forwards APNs `didRegisterForRemoteNotifications` to Capacitor via `NotificationCenter` posts
- `ios/debug.xcconfig` — Debug build settings
- Team ID `C22JSRYW54` (in `codemagic.yaml`)
- `android/app/build.gradle` — Application module; conditionally applies `com.google.gms.google-services` plugin if `google-services.json` exists
- `android/app/google-services.json` — Firebase config for FCM (present in repo)
- `android/variables.gradle` — SDK versions and AndroidX dependency versions
- `android/build.gradle` — Top-level; AGP 8.13.0, google-services 4.4.4
- `index.html` — Lang `zh-HK`, theme color `#1d4ed8`, Apple PWA meta, Inter+Poppins from Google Fonts
- `docs/app-store-metadata.md`, `docs/screenshots-guide.md`
## Platform Requirements
- Node (`latest` per CI) + npm
- Vite dev server runs on port 5173 (`vite.config.ts`)
- For native dev: macOS + Xcode (iOS), Android Studio + JDK 21 (Android)
- Helper scripts at repo root: `kill-port.ps1`, `open-tunnel.ps1` (Windows PowerShell)
- **iOS App Store** — Live build, distributed via TestFlight + App Store (see Codemagic workflows `ios-app-store`, `ios-testflight`)
- **Android Internal Test** — Debug-signed APK + AAB for sideload / Internal App Sharing (workflow `android-internal-test`; pending Play developer identity verification)
- **CI/CD** — Codemagic `mac_mini_m2` instance type (free tier) for all three workflows
- **Backend** — Supabase managed instance at `https://syyntodkvexkbpjrskjj.supabase.co`
## Project Scripts (`package.json`)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Tooling & Enforcement
- `"strict": true`
- `"noUnusedLocals": false` (unused locals allowed)
- `"noUnusedParameters": false` (unused params allowed)
- `"noFallthroughCasesInSwitch": true`
- `"jsx": "react-jsx"` (no need to import React for JSX)
## Naming Patterns
- React components: `PascalCase.tsx` — e.g. `src/components/IssueCard.tsx`, `src/components/CreateIssueModal.tsx`
- Pages: `PascalCase.tsx` — e.g. `src/pages/Login.tsx`, `src/pages/AdminUsers.tsx`
- Contexts: `PascalCaseContext.tsx` — e.g. `src/contexts/AuthContext.tsx`
- Library/utility modules: `camelCase.ts` — e.g. `src/lib/phone.ts`, `src/lib/supabase.ts`, `src/lib/push.ts`, `src/lib/export.ts`
- Single types file: `src/types.ts` (all shared TS types in one module)
- Pages use `export default function Name()`
- Components use named exports: `export function IssueCard(...)`
- Tables: `user_profiles`, `project_members`, `progress_items`
- Columns: `global_role`, `sub_role`, `assigned_pm_ids`, `created_at`, `applied_at`, `onesignal_id`, `current_handler_role`
- Type fields mirror SQL column names verbatim — never camelCased in TS interfaces (`src/types.ts`)
## Code Style (observed from source)
- **Quotes:** single quotes `'...'` for JS/TS strings, double quotes `"..."` for JSX attributes
- **Semicolons:** **omitted** — ASI style throughout (`src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`)
- **Indentation:** 2 spaces
- **Trailing commas:** present in multi-line object/array literals
- **Arrow vs function:** `function` keyword preferred for top-level components and module-level helpers; arrow functions used for inline callbacks (`.then(...)`, `.map(...)`, event handlers)
- **JSX:** self-close empty elements; multi-line props are indented one level under the opening tag
- **`async/await`:** preferred over `.then()` chains, except for `getSession().then(...)` in auth bootstrap (`src/contexts/AuthContext.tsx`)
## Import Organization
## Tailwind Usage
- `font-sans` → Inter (with Chinese fallbacks `Microsoft JhengHei`, `PingFang HK`)
- `font-heading` → Poppins
- Color palette: `site-{50..950}` (slate-based neutrals), `safety-{50..700}` (orange CTAs/warnings)
- Custom `shadow-card`, `shadow-card-md`
- Extended `rounded-xl` (0.875rem), `rounded-2xl` (1.125rem)
- `.btn-primary` — orange CTA button (rounded-xl, padded, hover/active states)
- `.btn-ghost` — bordered neutral button
- `.input` — full-width form input
- `.card` — white surface with site border + `shadow-card`
- `.label` — form label
- Apple HIG `min-height: 44px` enforced globally on buttons/inputs in `@layer base`
- Open / warning: `bg-amber-100 text-amber-700`
- Resolved / success: `bg-green-100 text-green-700`
- Info: `bg-blue-50 text-blue-700`
- Error: `bg-red-50 text-red-600 border-red-200`
- Use `safety-*` only for primary CTAs and brand accents
## Supabase Call Pattern
## Error Handling & UI Surfacing
- Collect errors into `fetchError: string | null` state
- Consumer pages render a banner when `fetchError` is non-null
- Errors are also `console.error`-logged with a label (e.g. `'projects fetch error:'`)
## Loading States
- `<Spinner size={n} className="..." />` — inline `Loader2` from `lucide-react`, `animate-spin`
- `<FullPageSpinner label="..." />` — full-viewport centered spinner with optional Chinese label
## Chinese UI Strings (i18n)
- `<h1>建築工程管理</h1>` (`src/pages/Login.tsx`)
- `<p>登入以繼續</p>`
- Validation messages inline: `setError('請輸入有效的 8 位香港手機號碼')`
- Error messages from contexts: `return { error: '此手機號碼已註冊。請改用登入。' }` (`AuthContext.signUp`)
- `ROLE_ZH`, `SUB_ROLE_ZH`, `ISSUE_STATUS_ZH`, `ISSUE_HANDLER_ZH`, `PROGRESS_STATUS_ZH`
## Supabase Migration File Naming
- `v2-schema.sql`, `v2-seed-admin.sql`, `v2-promote-admin.sql`, `v2-cleanup-admin.sql`, `v2-fix-admin-identity.sql`, `v2-fix-rls-recursion.sql`
- `v3-progress-schema.sql`, `v3-5-progress-extras.sql` (decimal `3-5` = "3.5" intermediate)
- `v4-issues-schema.sql`, `v4-fix-issue-update-rls.sql`
- `v5-push-notifications.sql`
- `v6-account-deletion.sql`
- Lowercase, kebab-case slug after the version prefix
- Slug describes intent: `schema`, `seed-admin`, `fix-*`, `cleanup-*`
- Fixes for a prior version stay under the same version prefix (`v4-fix-issue-update-rls.sql` fixes `v4-issues-schema.sql`)
- No timestamps in filenames — pure semantic versioning
## Function / Module Design
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- **Two-tier**: React SPA ↔ Supabase. No application server, no API layer to write code in.
- **HashRouter** (not BrowserRouter) — required so the same `index.html` works under `capacitor://` / `file://` on native and on static hosting (Vercel).
- **Context-per-domain state**: `AuthContext`, `ProjectsContext`, `ProgressContext`, `IssuesContext`. Each owns its fetch / mutate / realtime subscription.
- **Realtime by table**: each context opens a `postgres_changes` channel and refetches on any change.
- **Role gating in TWO places** (must stay aligned):
- **Synthetic email auth**: phone+password → `<digits>@phone.local` so Supabase Auth's email/password flow can be used while users see only a phone number.
- **Push via OneSignal**: Capacitor captures native APNs/FCM tokens; `src/lib/push.ts` registers them with OneSignal v1 `/players` keyed by `external_user_id = auth.user.id`. DB triggers in `supabase/v5-split/` fan out notifications.
## Layers
- Purpose: Mount React tree, kick off push init, scrub leftover v1 service workers.
- Location: `src/main.tsx`
- Notes: A kill-switch SW at `public/sw.js` unregisters itself to clear stale v1 PWA installs.
- Purpose: Wraps providers and defines all routes.
- Location: `src/App.tsx`
- Provider order: `AuthProvider` → `ProjectsProvider` → `HashRouter`.
- Routes: `/login`, `/signup`, `/home`, `/dashboard`, `/projects`, `/profile`, `/admin`, `/admin/users`, `/project/:id`, `/project/:id/issue/:issueId`, `*` → `/home`.
- Purpose: Session lifecycle + profile loading + phone↔email synthesis.
- Depends on: `@supabase/supabase-js`, `src/lib/push.ts`.
- Used by: every protected page, every context.
- `ProjectsContext.tsx` — projects + memberships, admin CRUD, apply/approve flows.
- `ProgressContext.tsx` — `progress_items` tree (parent_id), percentage- and floor-based tracking, history, assignments. Scoped to a `projectId` (mounted inside `ProjectDetail`).
- `IssuesContext.tsx` — issues + comments, escalation routing via `getInitialHandler`/`getNextHandler` in `src/types.ts`. Scoped to a `projectId`.
- Top-level route components. Compose contexts + components. Files: `Login.tsx`, `Signup.tsx`, `Home.tsx`, `Dashboard.tsx`, `Projects.tsx`, `Profile.tsx`, `AdminProjects.tsx`, `AdminUsers.tsx`, `ProjectDetail.tsx`, `IssueDetail.tsx`.
- Reusable UI + modals. `AppLayout.tsx` is the responsive shell (Sidebar on desktop, BottomNav on mobile). `ProtectedRoute.tsx` enforces session + admin gating.
- `supabase.ts` — singleton client with a 15s `fetchWithTimeout` and realtime tuned to 10 events/s.
- `phone.ts` — `normalizePhone`, `phoneToEmail`, `emailToPhone`, `isValidHKPhone` (HK mobile validation: 8 digits starting 5/6/7/9).
- `push.ts` — Capacitor push registration + OneSignal player upsert (`device_type=0` iOS, `device_type=1` Android).
- `export.ts` — Excel (`xlsx`) and PDF (`jspdf` + `jspdf-autotable`) report generation.
- Versioned SQL migrations applied via Supabase Dashboard SQL Editor. `v2-schema.sql` (core), `v3-progress-schema.sql` + `v3-5-progress-extras.sql` (progress tree), `v4-issues-schema.sql` (issues + RLS fix), `v5-split/` (push notification triggers split for size), `v6-account-deletion.sql`.
- `ios/App/` — Xcode workspace, includes `App/App/AppDelegate.swift`, `Info.plist`. `webDir: dist`.
- `android/app/` — Gradle module; `capacitor.config.ts` sets `appId: com.kwanchunkit.constructionapp`.
## Data Flow
- `pushLogoutUser()` BEFORE `supabase.auth.signOut()` — needs a live session to clear `user_profiles.onesignal_id`.
## Role-Based Gating
- `admin` — system-wide; can create projects, assign PMs, manage users.
- `pm` — Project Manager; gains project-level rights only when listed in `projects.assigned_pm_ids`.
- `main_contractor` — total承建商 staff.
- `subcontractor` — 判頭.
- `subcontractor_worker` — 判頭工人.
- `owner` — 業主.
- `ProgressContext.canEdit` = admin OR assigned PM OR approved membership in `['pm','main_contractor','subcontractor']`.
- Workers (`subcontractor_worker`) and `owner` are read-only.
- `ProtectedRoute requireAdmin` gates `/admin` and `/admin/users` to `global_role === 'admin'`.
- Reporter `subcontractor_worker` → handler `subcontractor`.
- Reporter `subcontractor` → handler `main_contractor`.
- Reporter `main_contractor`/`owner`/`pm`/`admin` → handler `pm`.
- Escalation chain: `subcontractor → main_contractor → pm → (terminal)`.
## Key Abstractions
## Entry Points
- Location: `src/main.tsx`
- Triggered by: `index.html` (`<script type="module" src="/src/main.tsx">`).
- Responsibilities: mount React, init push (no-op on web), unregister stale service workers.
- Location: `ios/App/App/AppDelegate.swift`
- Triggered by: iOS app launch. Capacitor loads `webDir: dist` from `capacitor.config.ts`.
- Location: `android/app/src/main/` (Capacitor's MainActivity).
- Triggered by: Android app launch.
- `dist/` — Vite build, copied into each native shell via `npx cap sync`.
## How Capacitor Wraps the Web Build
## Error Handling
- Mutation methods always return `Promise<{ error: string | null }>` (and sometimes `{ id }`).
- Unique-violation codes (`23505`) are caught explicitly (e.g., `ProjectsContext.applyToProject`).
- Auth failures are mapped to generic `手機號或密碼錯誤` to avoid user enumeration.
- Push errors are logged and swallowed; never block sign-in/out.
## Cross-Cutting Concerns
## Where New Features Fit
### Drawings (attached to `progress_leaf_items`)
- **DB**: new migration `supabase/v7-drawings-schema.sql` (next free version). Table:
- **Types**: append `Drawing` interface to `src/types.ts`.
- **Context**: new `src/contexts/DrawingsContext.tsx` mirroring `ProgressContext` (scoped by `projectId`, with `fetchForItem(itemId)`, `upload(file, itemId, ...)`, `delete(id)`). Realtime channel `drawings-${projectId}`.
- **UI**:
- **Lib**: extend `src/lib/export.ts` if drawings need to appear in reports.
### SI / VO (Site Instructions / Variation Orders)
- **DB**: `supabase/v8-si-vo-schema.sql`. Two tables:
- **Types**: `SI`, `VO`, status enums + ZH labels in `src/types.ts`.
- **Context**: `src/contexts/SiVoContext.tsx` scoped to `projectId`.
- **Pages**: add tabs to `src/pages/ProjectDetail.tsx` (currently `progress | issues`) → extend `Tab` to `'progress' | 'issues' | 'si-vo'`, or add `src/pages/SiVoList.tsx` + `src/pages/SiVoDetail.tsx` and a route `/project/:id/si-vo` in `src/App.tsx`.
- **Triggers**: add a notification trigger in `supabase/v5-split/` style for SI issued / VO submitted-approved events.
### PTW (Permit to Work)
- **DB**: `supabase/v9-ptw-schema.sql`.
- **Types**: `PTW`, `PermitSignoff`, status/work-type enums in `src/types.ts`. Reuse `SubRole` (`'safety'`) for the safety officer sign-off path.
- **Context**: `src/contexts/PtwContext.tsx`.
- **Pages**: `src/pages/PtwList.tsx` + `src/pages/PtwDetail.tsx`; route `/project/:id/ptw/:ptwId` in `src/App.tsx`. Add a tab in `ProjectDetail.tsx` or a top-level icon in `Sidebar.tsx` / `BottomNav.tsx`.
- **Expiry**: a Supabase cron / Edge function (new — none exist today) to transition `approved → active → expired`. Until that exists, derive `expired` client-side from `valid_to`.
- **Push**: triggers for `permits_to_work` status changes added under `supabase/v5-split/` numbering convention.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| lifecycle | Use when the user asks to run a full project lifecycle simulation — from project kickoff (開盤) to completion (完盤) — testing how state persists and flows across all roles over time, as opposed to a single-day snapshot | `.claude/skills/lifecycle/SKILL.md` |
| simulate | Use when simulating all construction site roles using the live app to discover real UX friction, missing features, and role-specific problems through actual Playwright browser automation | `.claude/skills/simulate/SKILL.md` |
| ui-ux-pro-max | "UI/UX design intelligence. 67 styles, 96 palettes, 57 font pairings, 25 charts, 13 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient. Integrations: shadcn/ui MCP for component search and examples." | `.claude/skills/ui-ux-pro-max/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **construction-app** (12904 symbols, 28813 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/construction-app/context` | Codebase overview, check index freshness |
| `gitnexus://repo/construction-app/clusters` | All functional areas |
| `gitnexus://repo/construction-app/processes` | All execution flows |
| `gitnexus://repo/construction-app/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
