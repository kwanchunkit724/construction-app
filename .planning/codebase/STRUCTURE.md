# Codebase Structure

**Analysis Date:** 2026-05-11

## Directory Layout

```
construction-app/
├── src/                                # React + TS source (SPA)
│   ├── main.tsx                        # ReactDOM bootstrap; push init; SW cleanup
│   ├── App.tsx                         # HashRouter + providers + route table
│   ├── index.css                       # Tailwind entry
│   ├── types.ts                        # Domain types + pure helpers + ZH labels
│   ├── vite-env.d.ts
│   ├── contexts/                       # Domain state (Context API)
│   │   ├── AuthContext.tsx
│   │   ├── ProjectsContext.tsx
│   │   ├── ProgressContext.tsx         # Mounted inside ProjectDetail (per project)
│   │   └── IssuesContext.tsx           # Mounted inside ProjectDetail (per project)
│   ├── pages/                          # Route-level components
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Home.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Projects.tsx
│   │   ├── Profile.tsx
│   │   ├── AdminProjects.tsx
│   │   ├── AdminUsers.tsx
│   │   ├── ProjectDetail.tsx           # Tabs: progress | issues
│   │   └── IssueDetail.tsx
│   ├── components/                     # Reusable UI + modals
│   │   ├── AppLayout.tsx               # Responsive shell (sidebar md+ / bottom-nav)
│   │   ├── Sidebar.tsx                 # Desktop nav
│   │   ├── BottomNav.tsx               # Mobile nav
│   │   ├── ProtectedRoute.tsx          # Session + admin gate
│   │   ├── Modal.tsx                   # Base modal
│   │   ├── Spinner.tsx                 # Spinner + FullPageSpinner
│   │   ├── ProgressBar.tsx
│   │   ├── ProgressItemCard.tsx
│   │   ├── CreateItemModal.tsx
│   │   ├── UpdateProgressModal.tsx
│   │   ├── AssignmentModal.tsx
│   │   ├── HistoryModal.tsx
│   │   ├── IssueCard.tsx
│   │   ├── CreateIssueModal.tsx
│   │   ├── CreateProjectModal.tsx
│   │   ├── AssignPMModal.tsx
│   │   ├── ApplyToProjectModal.tsx
│   │   └── AssignmentModal.tsx
│   └── lib/                            # Non-UI utilities
│       ├── supabase.ts                 # Supabase client + 15s fetch timeout
│       ├── phone.ts                    # phone <-> email synthesis (HK validation)
│       ├── push.ts                     # Capacitor push -> OneSignal v1 /players
│       └── export.ts                   # Excel/PDF report generation
├── supabase/                           # Versioned SQL migrations
│   ├── v2-schema.sql                   # Core: user_profiles, projects, project_members
│   ├── v2-seed-admin.sql
│   ├── v2-promote-admin.sql
│   ├── v2-fix-admin-identity.sql
│   ├── v2-fix-rls-recursion.sql
│   ├── v2-cleanup-admin.sql
│   ├── v3-progress-schema.sql          # progress_items tree + can_view_project / can_edit_project_progress
│   ├── v3-5-progress-extras.sql        # tracking_mode, floors, history, assignment
│   ├── v4-issues-schema.sql            # issues + issue_comments
│   ├── v4-fix-issue-update-rls.sql
│   ├── v5-push-notifications.sql       # Legacy single-file version
│   ├── v5-split/                       # Same as v5 split for editor size limits
│   │   ├── 1-base.sql
│   │   ├── 2-send-push.sql
│   │   ├── 3-trg-issue-created.sql
│   │   ├── 4-trg-issue-updated.sql
│   │   ├── 5-trg-membership.sql
│   │   ├── 6-trg-pm-and-progress.sql
│   │   └── 7-fix-external-user-id.sql
│   └── v6-account-deletion.sql
├── ios/                                # Capacitor iOS shell
│   ├── App/                            # Xcode project; webDir copied to App/App/public
│   └── debug.xcconfig
├── android/                            # Capacitor Android shell
│   ├── app/
│   ├── gradle/
│   ├── build.gradle
│   ├── settings.gradle
│   ├── variables.gradle
│   ├── capacitor.settings.gradle
│   ├── capacitor-cordova-android-plugins/
│   ├── gradlew / gradlew.bat
│   └── gradle.properties
├── public/                             # Static assets copied verbatim to dist/
│   ├── icons/
│   ├── privacy-policy.html
│   └── sw.js                           # Kill-switch SW (unregisters v1 PWA SW)
├── scripts/
│   ├── seed-demos.js                   # Local dev seed
│   └── create-feedback-table.sql
├── docs/
│   ├── app-store-metadata.md
│   └── screenshots-guide.md
├── dist/                               # Vite build output (gitignored; consumed by Capacitor)
├── index.html                          # Vite entry
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js                  # site-* / safety-* palette
├── postcss.config.js
├── capacitor.config.ts                 # appId, webDir, splash, status bar
├── vercel.json                         # Web hosting config
├── codemagic.yaml                      # Android CI (Java 21, FCM device_type=1)
├── package.json                        # React 18, Capacitor 8, Supabase JS 2
├── package-lock.json
├── kill-port.ps1 / open-tunnel.ps1
├── start.bat / start-with-tunnel.bat
└── SYSTEM_SPEC.md                      # Top-level product/system spec
```

## Directory Purposes

**`src/`:**
- Purpose: All React + TypeScript SPA source.
- Contains: Pages, components, contexts, lib utilities, shared types.
- Key files: `main.tsx`, `App.tsx`, `types.ts`.

**`src/pages/`:**
- Purpose: One file per top-level route. Compose contexts + components.
- Naming: `PascalCase.tsx`, default-exported component matches filename.
- Key files: `ProjectDetail.tsx` (the biggest — hosts `ProgressProvider` + `IssuesProvider` and the progress/issues tab UI).

**`src/components/`:**
- Purpose: Reusable UI primitives and feature modals.
- Naming: `PascalCase.tsx`, named exports preferred (e.g., `export function ProgressItemCard`).
- Key files: `AppLayout.tsx`, `ProtectedRoute.tsx`, `ProgressItemCard.tsx`, `IssueCard.tsx`, the `*Modal.tsx` family.

**`src/contexts/`:**
- Purpose: Per-domain state, fetching, mutation, and realtime subscriptions.
- Naming: `<Domain>Context.tsx` exporting `<Domain>Provider` + `use<Domain>` hook.
- Pattern: Each context owns one Supabase realtime channel scoped to project where applicable.

**`src/lib/`:**
- Purpose: Non-UI, non-stateful utilities (clients, pure helpers).
- Naming: `lowercase.ts`.
- Key files: `supabase.ts` (the singleton client — never construct another), `phone.ts`, `push.ts`, `export.ts`.

**`supabase/`:**
- Purpose: SQL migrations applied manually via Supabase Dashboard SQL Editor.
- Naming: `v<N>-<topic>.sql` or `v<N>-fix-<topic>.sql`; large migrations split into `v<N>-split/<step>-<topic>.sql`.
- Convention: Migrations are idempotent (`drop ... if exists` at top where safe). RLS helpers are `SECURITY DEFINER` with `set search_path = public`.

**`ios/` and `android/`:**
- Purpose: Native Capacitor shells. Generated by `npx cap add ios|android`; some files (e.g., `AppDelegate.swift`, `Info.plist`, Gradle config) are hand-edited and committed.
- Build artifact: receives `dist/` from `npx cap sync`.

**`public/`:**
- Purpose: Static files copied verbatim into `dist/`. The kill-switch `sw.js` lives here so it's served at the site root.

**`scripts/`:**
- Purpose: Dev-time helpers (DB seeding, ad-hoc SQL not part of the migration chain).

**`docs/`:**
- Purpose: App Store / Play Store metadata, screenshot capture guide. Not architectural docs — those live alongside the relevant code or in `SYSTEM_SPEC.md`.

**`dist/`:**
- Purpose: Vite build output. Gitignored. Consumed by `npx cap sync`.
- Generated: Yes.
- Committed: No.

## Key File Locations

**Entry Points:**
- `index.html` — Vite HTML entry.
- `src/main.tsx` — React bootstrap.
- `src/App.tsx` — Route table.
- `ios/App/App/AppDelegate.swift` — iOS native entry.
- `android/app/src/main/` — Android native entry (Capacitor `MainActivity`).

**Configuration:**
- `vite.config.ts` — Vite + React plugin config.
- `tsconfig.json` / `tsconfig.node.json` — TypeScript.
- `tailwind.config.js` — Tailwind theme (`site-*`, `safety-*` palettes).
- `capacitor.config.ts` — Capacitor app ID + native plugin config.
- `codemagic.yaml` — Android CI.
- `vercel.json` — Web hosting rewrites.
- `package.json` — Dependencies (React 18, Capacitor 8, Supabase JS 2).

**Core Logic:**
- `src/contexts/AuthContext.tsx` — session, signup, signin, signout.
- `src/contexts/ProjectsContext.tsx` — projects + memberships CRUD.
- `src/contexts/ProgressContext.tsx` — `progress_items` tree CRUD + history.
- `src/contexts/IssuesContext.tsx` — issues, comments, escalation.
- `src/types.ts` — domain types, pure helpers, ZH labels.
- `src/lib/supabase.ts` — Supabase client singleton.
- `src/lib/phone.ts` — phone↔email synthesis (HK validation).
- `src/lib/push.ts` — OneSignal/Capacitor push.
- `supabase/v2-schema.sql` — core tables + RLS.
- `supabase/v3-progress-schema.sql` — `can_view_project`, `can_edit_project_progress` helpers.

**Testing:**
- `@playwright/test` is in devDependencies but no test files are committed yet. New tests should live in `tests/` at project root.

## Naming Conventions

**Files:**
- React components / pages: `PascalCase.tsx` (e.g., `ProjectDetail.tsx`).
- Hooks / utilities: `camelCase.ts` or single-word `lowercase.ts` (e.g., `supabase.ts`, `phone.ts`).
- SQL migrations: `v<major>-<topic>.sql`, or `v<major>-fix-<topic>.sql`. Multi-file: `v<N>-split/<step>-<topic>.sql`.

**Directories:**
- `lowercase` (e.g., `pages`, `components`, `contexts`, `lib`, `supabase`).

**TypeScript:**
- Interfaces & types: `PascalCase` (`UserProfile`, `ProgressItem`).
- Enums-as-string-unions: `'kebab-case'` for status values (`'not-started'`, `'in-progress'`), `'snake_case'` for role values matching DB (`'main_contractor'`, `'subcontractor_worker'`).
- ZH label maps: `<TYPE>_ZH` (e.g., `ROLE_ZH`, `PROGRESS_STATUS_ZH`).
- Pure helpers: `camelCase` verbs (`deriveStatus`, `floorsToProgress`, `computeRollup`, `getInitialHandler`).
- Components: named exports `export function Foo()`; pages use `export default function Foo()`.

**Routes:**
- All `/lowercase`, IDs as `:id` / `:issueId`. Admin pages live under `/admin/...`.

## Where to Add New Code

**New page (top-level route):**
- File: `src/pages/<Name>.tsx` (default export).
- Wire into `src/App.tsx` inside a `<ProtectedRoute>` (add `requireAdmin` if applicable).
- Add nav entry to `src/components/Sidebar.tsx` (desktop) AND `src/components/BottomNav.tsx` (mobile) if user-facing.

**New project-scoped feature (like progress, issues, drawings):**
1. SQL migration in `supabase/v<next>-<feature>-schema.sql` with RLS using `can_view_project` / `can_edit_project_progress`.
2. Types in `src/types.ts` (interface + status enum + ZH label map + pure helpers).
3. Context in `src/contexts/<Feature>Context.tsx`, scoped to `projectId`, with realtime channel `<feature>-${projectId}`.
4. Mount the provider inside `src/pages/ProjectDetail.tsx` (around `ProjectDetailInner`), or in a new dedicated page if the feature has its own route.
5. UI components in `src/components/<Feature>*.tsx` (cards + modals).
6. If notifications are needed, add a trigger in `supabase/v5-split/` style.

**New modal:**
- File: `src/components/<Name>Modal.tsx`, building on `src/components/Modal.tsx`.
- Opened/closed via local `useState` in the parent page.

**New shared utility:**
- Stateless / no React: `src/lib/<name>.ts`.
- Pure domain helper used by types: append to `src/types.ts`.

**New SQL migration:**
- Pick the next `v<N>` number. If editor-size limits are a concern, split into `v<N>-split/<step>-<topic>.sql`.
- Always `drop if exists` defensively at top where safe, and `set search_path = public` inside `SECURITY DEFINER` functions.
- Reuse `can_view_project` / `can_edit_project_progress` for RLS rather than re-deriving the permission rules.

**New static asset:**
- Drop in `public/` so it's served from site root.

### Specific guidance for upcoming features

**Drawings (attached to `progress_leaf_items`):**
- DB: `supabase/v7-drawings-schema.sql` + a `drawings` Supabase Storage bucket; trigger to assert `progress_item_id` is a leaf.
- Types: `Drawing` interface in `src/types.ts`.
- State: `src/contexts/DrawingsContext.tsx` scoped to `projectId`.
- UI: `src/components/DrawingsModal.tsx` opened from `src/components/ProgressItemCard.tsx` (leaf only). Wire through `src/pages/ProjectDetail.tsx`.

**SI / VO (Site Instructions / Variation Orders):**
- DB: `supabase/v8-si-vo-schema.sql` with `site_instructions` + `variation_orders` tables; mirror existing RLS helpers.
- Types: `SI`, `VO`, status enums + ZH labels in `src/types.ts`.
- State: `src/contexts/SiVoContext.tsx`.
- UI: either extend the `Tab` type in `src/pages/ProjectDetail.tsx` from `'progress' | 'issues'` to include `'si-vo'`, or add `src/pages/SiVoList.tsx` + `src/pages/SiVoDetail.tsx` with routes `/project/:id/si-vo` and `/project/:id/si-vo/:siId` in `src/App.tsx`.

**PTW (Permit to Work):**
- DB: `supabase/v9-ptw-schema.sql` with `permits_to_work` + `permit_signoffs`; status machine `pending → approved → active → expired`.
- Types: `PTW`, `PermitSignoff` in `src/types.ts`. Reuse `SubRole='safety'` for safety officer sign-off path.
- State: `src/contexts/PtwContext.tsx`.
- UI: `src/pages/PtwList.tsx`, `src/pages/PtwDetail.tsx`; routes `/project/:id/ptw` and `/project/:id/ptw/:ptwId` in `src/App.tsx`. Add nav entry in `Sidebar.tsx` and `BottomNav.tsx`.
- Notifications: trigger file in `supabase/v5-split/` style for status transitions.

## Special Directories

**`dist/`:**
- Purpose: Vite build output, copied into native shells.
- Generated: Yes (`npm run build`).
- Committed: No.

**`node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes (`npm install`).
- Committed: No.

**`android/` & `ios/`:**
- Purpose: Capacitor native shells.
- Generated: Initially scaffolded by `npx cap add`, but contain hand-edited files (`AppDelegate.swift`, `Info.plist`, Gradle config, Firebase config).
- Committed: Yes — they are part of the source.

**`supabase/v5-split/`:**
- Purpose: A single logical migration (`v5-push-notifications.sql`) split into separately-applyable files because the Supabase SQL editor has size limits and individual triggers need to be re-runnable.
- Committed: Yes.

---

*Structure analysis: 2026-05-11*
