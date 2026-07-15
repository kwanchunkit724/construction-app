# Architecture

**Analysis Date:** 2026-05-11

## Pattern Overview

**Overall:** Client-side SPA (React 18 + TypeScript + Vite) using `HashRouter`, talking directly to Supabase (Postgres + Auth + Realtime + Storage). Native iOS/Android shells produced by Capacitor wrap the same `dist/` web build. There is no custom backend server — authorisation lives in Postgres Row-Level Security (RLS) and SQL helper functions; the React app is essentially a thin role-aware view over Supabase.

**Key Characteristics:**
- **Two-tier**: React SPA ↔ Supabase. No application server, no API layer to write code in.
- **HashRouter** (not BrowserRouter) — required so the same `index.html` works under `capacitor://` / `file://` on native and on static hosting (Vercel).
- **Context-per-domain state**: `AuthContext`, `ProjectsContext`, `ProgressContext`, `IssuesContext`. Each owns its fetch / mutate / realtime subscription.
- **Realtime by table**: each context opens a `postgres_changes` channel and refetches on any change.
- **Role gating in TWO places** (must stay aligned):
  1. UI gates via `ProtectedRoute` + `profile.global_role` + per-project memberships.
  2. Postgres RLS policies + SECURITY DEFINER helpers (`can_view_project`, `can_edit_project_progress`).
- **Synthetic email auth**: phone+password → `<digits>@phone.local` so Supabase Auth's email/password flow can be used while users see only a phone number.
- **Push via OneSignal**: Capacitor captures native APNs/FCM tokens; `src/lib/push.ts` registers them with OneSignal v1 `/players` keyed by `external_user_id = auth.user.id`. DB triggers in `supabase/v5-split/` fan out notifications.

## Layers

**Entry / Bootstrap (`src/main.tsx`):**
- Purpose: Mount React tree, kick off push init, scrub leftover v1 service workers.
- Location: `src/main.tsx`
- Notes: A kill-switch SW at `public/sw.js` unregisters itself to clear stale v1 PWA installs.

**Router shell (`src/App.tsx`):**
- Purpose: Wraps providers and defines all routes.
- Location: `src/App.tsx`
- Provider order: `AuthProvider` → `ProjectsProvider` → `HashRouter`.
- Routes: `/login`, `/signup`, `/home`, `/dashboard`, `/projects`, `/profile`, `/admin`, `/admin/users`, `/project/:id`, `/project/:id/issue/:issueId`, `*` → `/home`.

**Auth layer (`src/contexts/AuthContext.tsx`, `src/lib/supabase.ts`, `src/lib/phone.ts`):**
- Purpose: Session lifecycle + profile loading + phone↔email synthesis.
- Depends on: `@supabase/supabase-js`, `src/lib/push.ts`.
- Used by: every protected page, every context.

**Domain state contexts (`src/contexts/`):**
- `ProjectsContext.tsx` — projects + memberships, admin CRUD, apply/approve flows.
- `ProgressContext.tsx` — `progress_items` tree (parent_id), percentage- and floor-based tracking, history, assignments. Scoped to a `projectId` (mounted inside `ProjectDetail`).
- `IssuesContext.tsx` — issues + comments, escalation routing via `getInitialHandler`/`getNextHandler` in `src/types.ts`. Scoped to a `projectId`.

**Pages (`src/pages/`):**
- Top-level route components. Compose contexts + components. Files: `Login.tsx`, `Signup.tsx`, `Home.tsx`, `Dashboard.tsx`, `Projects.tsx`, `Profile.tsx`, `AdminProjects.tsx`, `AdminUsers.tsx`, `ProjectDetail.tsx`, `IssueDetail.tsx`.

**Components (`src/components/`):**
- Reusable UI + modals. `AppLayout.tsx` is the responsive shell (Sidebar on desktop, BottomNav on mobile). `ProtectedRoute.tsx` enforces session + admin gating.

**Lib (`src/lib/`):**
- `supabase.ts` — singleton client with a 15s `fetchWithTimeout` and realtime tuned to 10 events/s.
- `phone.ts` — `normalizePhone`, `phoneToEmail`, `emailToPhone`, `isValidHKPhone` (HK mobile validation: 8 digits starting 5/6/7/9).
- `push.ts` — Capacitor push registration + OneSignal player upsert (`device_type=0` iOS, `device_type=1` Android).
- `export.ts` — Excel (`xlsx`) and PDF (`jspdf` + `jspdf-autotable`) report generation.

**Data layer (`supabase/`):**
- Versioned SQL migrations applied via Supabase Dashboard SQL Editor. `v2-schema.sql` (core), `v3-progress-schema.sql` + `v3-5-progress-extras.sql` (progress tree), `v4-issues-schema.sql` (issues + RLS fix), `v5-split/` (push notification triggers split for size), `v6-account-deletion.sql`.

**Native shells:**
- `ios/App/` — Xcode workspace, includes `App/App/AppDelegate.swift`, `Info.plist`. `webDir: dist`.
- `android/app/` — Gradle module; `capacitor.config.ts` sets `appId: com.kwanchunkit.constructionapp`.

## Data Flow

**Read flow (typical page):**
1. Page renders inside `ProtectedRoute` → checks `useAuth().session`.
2. Page mounts a context (e.g., `ProgressProvider projectId={id}`).
3. Context effect fires `refetch()` → `supabase.from('progress_items').select(...).eq('project_id', id)`.
4. RLS policy + SECURITY DEFINER helper (`can_view_project`) decides which rows are visible.
5. Context opens a realtime channel filtered to that project → any insert/update/delete triggers `refetch()`.
6. Components consume context via `useProgress()` / `useIssues()` / `useProjects()`.

**Write flow:**
1. Component calls a mutation method on a context (e.g., `updateProgress(id, actual, notes)`).
2. Context performs `supabase.from(...).update(...)`; RLS may reject.
3. On success, context calls `refetch()` (realtime will also fire, leading to a second refetch — accepted).
4. For progress edits, an additional row is appended to `progress_history` to preserve audit trail.

**Auth flow:**
1. User enters phone + password on `src/pages/Login.tsx`.
2. `AuthContext.signIn` → `phoneToEmail(phone)` → `<digits>@phone.local`.
3. `supabase.auth.signInWithPassword({ email, password })`.
4. `onAuthStateChange` fires → `setSession({ user_id })` → `loadProfile(userId)` reads `user_profiles`.
5. `pushLoginUser(userId)` (only on `SIGNED_IN`, not refresh) — registers OneSignal external_id.

**Signup flow** (`AuthContext.signUp`):
1. Normalise phone, pre-check duplicate against `user_profiles.phone` to avoid orphan `auth.users` rows.
2. `supabase.auth.signUp({ email: phoneToEmail(phone), password })`.
3. `INSERT INTO user_profiles (id, phone, name, global_role, sub_role, company)` with `id = auth.user.id`.
4. On profile insert failure, sign out (orphan `auth.users` requires admin cleanup).

**Sign-out flow:**
- `pushLogoutUser()` BEFORE `supabase.auth.signOut()` — needs a live session to clear `user_profiles.onesignal_id`.

## Role-Based Gating

**Global roles** (`GlobalRole` in `src/types.ts`):
- `admin` — system-wide; can create projects, assign PMs, manage users.
- `pm` — Project Manager; gains project-level rights only when listed in `projects.assigned_pm_ids`.
- `main_contractor` — total承建商 staff.
- `subcontractor` — 判頭.
- `subcontractor_worker` — 判頭工人.
- `owner` — 業主.

**Sub-roles** (`SubRole`): `engineer | foreman | safety | null` — informational, not used for gating.

**Project membership** (`project_members` table, status `pending | approved | rejected`): non-admin users gain project access via approved membership rows. Roles in the membership use `ProjectRole = Exclude<GlobalRole, 'admin'>`.

**Effective project role resolution** (see `IssuesContext.myRoleInProject`, `ProgressContext.canEdit`):
1. `admin` global role → admin everywhere.
2. `profile.id in project.assigned_pm_ids` → `pm` for this project.
3. Otherwise, `project_members` row with `status='approved'` provides the role.

**Edit rights:**
- `ProgressContext.canEdit` = admin OR assigned PM OR approved membership in `['pm','main_contractor','subcontractor']`.
- Workers (`subcontractor_worker`) and `owner` are read-only.
- `ProtectedRoute requireAdmin` gates `/admin` and `/admin/users` to `global_role === 'admin'`.

**Issue escalation chain** (`getInitialHandler`, `getNextHandler` in `src/types.ts`):
- Reporter `subcontractor_worker` → handler `subcontractor`.
- Reporter `subcontractor` → handler `main_contractor`.
- Reporter `main_contractor`/`owner`/`pm`/`admin` → handler `pm`.
- Escalation chain: `subcontractor → main_contractor → pm → (terminal)`.

## Key Abstractions

**`UserProfile`** (`src/types.ts`): the canonical user row. `id` matches `auth.users.id`.

**`Project` + `Zone[]`**: a project has embedded JSON zones (no separate `zones` table). `assigned_pm_ids: string[]` is the PM allow-list.

**`ProgressItem` tree**: self-referential via `parent_id`. `level` denormalised. Leaves carry manual progress; non-leaves and zones aggregate via `computeRollup` / `getDescendantLeaves` / `getZoneLeaves` (pure functions in `src/types.ts`). Two `tracking_mode`s: `percentage` and `floors` (with `floor_labels[]` and `floors_completed[]`).

**`Issue` + `IssueComment`**: comments are an event log (`action: reported | commented | escalated | resolved | reopened`) with optional `from_role`/`to_role` for escalation entries.

**Pure helpers in `src/types.ts`**: `deriveStatus`, `floorsToProgress`, `isLeaf`, `getDescendantLeaves`, `getZoneLeaves`, `computeRollup`, `getInitialHandler`, `getNextHandler`. These are the architectural seams — keep new business logic here when it's pure.

## Entry Points

**Web entry:**
- Location: `src/main.tsx`
- Triggered by: `index.html` (`<script type="module" src="/src/main.tsx">`).
- Responsibilities: mount React, init push (no-op on web), unregister stale service workers.

**Native entry (iOS):**
- Location: `ios/App/App/AppDelegate.swift`
- Triggered by: iOS app launch. Capacitor loads `webDir: dist` from `capacitor.config.ts`.

**Native entry (Android):**
- Location: `android/app/src/main/` (Capacitor's MainActivity).
- Triggered by: Android app launch.

**Build outputs:**
- `dist/` — Vite build, copied into each native shell via `npx cap sync`.

## How Capacitor Wraps the Web Build

1. `npm run build` → `tsc && vite build` → emits `dist/`.
2. `npx cap sync ios` (alias `npm run cap:sync`) copies `dist/` into `ios/App/App/public/` and updates plugins.
3. iOS app's `WKWebView` loads `index.html` from the embedded `public/` over `capacitor://localhost`.
4. `HashRouter` is required because routes look like `capacitor://localhost/#/project/abc`, avoiding native deep-link config.
5. Native plugins surfaced to the web:
   - `@capacitor/push-notifications` → APNs/FCM tokens (registered with OneSignal in `src/lib/push.ts`).
   - `@capacitor/splash-screen` → splash from `capacitor.config.ts` (`#1d4ed8`, 2s).
   - `@capacitor/status-bar`.
6. Codemagic CI builds the Android shell (`codemagic.yaml`, Java 21, FCM `device_type=1`).

## Error Handling

**Strategy:** Errors from Supabase return `{ error: { message } }`; contexts convert to `{ error: string | null }` results that callers translate into Chinese user-facing strings. Network timeouts surface via the 15s `fetchWithTimeout` in `src/lib/supabase.ts`.

**Patterns:**
- Mutation methods always return `Promise<{ error: string | null }>` (and sometimes `{ id }`).
- Unique-violation codes (`23505`) are caught explicitly (e.g., `ProjectsContext.applyToProject`).
- Auth failures are mapped to generic `手機號或密碼錯誤` to avoid user enumeration.
- Push errors are logged and swallowed; never block sign-in/out.

## Cross-Cutting Concerns

**Logging:** `console.error` only; no centralised logger.

**Validation:** Lightweight inline (`isValidHKPhone`, `.trim()` on inputs). No schema validation library. Server-side `CHECK` constraints in SQL (e.g., `actual_progress between 0 and 100`).

**Authorisation:** RLS in Postgres is the source of truth. UI gating is a UX layer that must mirror RLS or users see "row missing" errors.

**Realtime:** Each context opens one channel filtered by `project_id` where relevant; `eventsPerSecond: 10` cap in client config.

**Internationalisation:** UI strings are inline Traditional Chinese (HK). Translation tables in `src/types.ts` (`ROLE_ZH`, `SUB_ROLE_ZH`, `PROGRESS_STATUS_ZH`, `ISSUE_STATUS_ZH`, `ISSUE_HANDLER_ZH`, `ISSUE_ACTION_ZH`).

**Styling:** Tailwind (`tailwind.config.js`) with project-specific palette (`site-*`, `safety-*`). Mobile-first; `md:` breakpoint switches to sidebar layout.

## Where New Features Fit

### Drawings (attached to `progress_leaf_items`)

A "drawing" is metadata + file attached to a leaf `progress_items` row.

- **DB**: new migration `supabase/v7-drawings-schema.sql` (next free version). Table:
  ```sql
  create table drawings (
    id uuid primary key default gen_random_uuid(),
    progress_item_id uuid not null references progress_items(id) on delete cascade,
    project_id uuid not null references projects(id) on delete cascade,
    title text not null,
    revision text,
    file_path text not null,         -- Supabase Storage path
    file_mime text,
    uploaded_by uuid references user_profiles(id),
    created_at timestamptz default now()
  );
  ```
  Add a `drawings` Storage bucket. Mirror `progress_items` RLS using `can_view_project` / `can_edit_project_progress`. Enforce leaf-only at insert time via a trigger that checks `not exists (select 1 from progress_items where parent_id = NEW.progress_item_id)`.
- **Types**: append `Drawing` interface to `src/types.ts`.
- **Context**: new `src/contexts/DrawingsContext.tsx` mirroring `ProgressContext` (scoped by `projectId`, with `fetchForItem(itemId)`, `upload(file, itemId, ...)`, `delete(id)`). Realtime channel `drawings-${projectId}`.
- **UI**:
  - Modal `src/components/DrawingsModal.tsx` opened from `ProgressItemCard` (only when `isLeaf`).
  - Wire it into `src/pages/ProjectDetail.tsx` alongside the existing `HistoryModal` / `AssignmentModal` flow.
- **Lib**: extend `src/lib/export.ts` if drawings need to appear in reports.

### SI / VO (Site Instructions / Variation Orders)

Project-level documents with an approval workflow — closer in shape to `Issues` than to progress.

- **DB**: `supabase/v8-si-vo-schema.sql`. Two tables:
  ```sql
  create table site_instructions (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    si_number text not null,
    title text not null,
    description text,
    issued_by uuid references user_profiles(id),
    issued_at timestamptz default now(),
    status text not null default 'open' check (status in ('open','closed')),
    related_progress_item_id uuid references progress_items(id),
    attachments jsonb default '[]'
  );
  create table variation_orders (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    vo_number text not null,
    si_id uuid references site_instructions(id) on delete set null,
    amount numeric(14,2),
    status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
    submitted_by uuid references user_profiles(id),
    approved_by uuid references user_profiles(id),
    approved_at timestamptz,
    created_at timestamptz default now()
  );
  ```
  RLS: view via `can_view_project`, create/edit gated to `pm` / `main_contractor`, approve gated to `pm` (mirror existing helpers).
- **Types**: `SI`, `VO`, status enums + ZH labels in `src/types.ts`.
- **Context**: `src/contexts/SiVoContext.tsx` scoped to `projectId`.
- **Pages**: add tabs to `src/pages/ProjectDetail.tsx` (currently `progress | issues`) → extend `Tab` to `'progress' | 'issues' | 'si-vo'`, or add `src/pages/SiVoList.tsx` + `src/pages/SiVoDetail.tsx` and a route `/project/:id/si-vo` in `src/App.tsx`.
- **Triggers**: add a notification trigger in `supabase/v5-split/` style for SI issued / VO submitted-approved events.

### PTW (Permit to Work)

Short-lived, approval-gated permits. Best modelled as a project-scoped resource with a status machine and an expiry.

- **DB**: `supabase/v9-ptw-schema.sql`.
  ```sql
  create table permits_to_work (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    permit_number text not null,
    work_type text not null,             -- e.g. hot-work, confined-space
    requested_by uuid references user_profiles(id),
    requested_at timestamptz default now(),
    valid_from timestamptz,
    valid_to timestamptz,
    status text not null default 'pending'
      check (status in ('pending','approved','rejected','active','expired','closed')),
    approver_id uuid references user_profiles(id),
    approved_at timestamptz,
    notes text default '',
    attachments jsonb default '[]'
  );
  create table permit_signoffs (
    id uuid primary key default gen_random_uuid(),
    permit_id uuid not null references permits_to_work(id) on delete cascade,
    signer_id uuid references user_profiles(id),
    role text not null,                  -- 'safety' | 'pm' | 'main_contractor'
    decision text not null check (decision in ('approved','rejected')),
    comment text,
    signed_at timestamptz default now()
  );
  ```
  RLS view via `can_view_project`; approve restricted to `pm` and users with `sub_role='safety'` on the membership.
- **Types**: `PTW`, `PermitSignoff`, status/work-type enums in `src/types.ts`. Reuse `SubRole` (`'safety'`) for the safety officer sign-off path.
- **Context**: `src/contexts/PtwContext.tsx`.
- **Pages**: `src/pages/PtwList.tsx` + `src/pages/PtwDetail.tsx`; route `/project/:id/ptw/:ptwId` in `src/App.tsx`. Add a tab in `ProjectDetail.tsx` or a top-level icon in `Sidebar.tsx` / `BottomNav.tsx`.
- **Expiry**: a Supabase cron / Edge function (new — none exist today) to transition `approved → active → expired`. Until that exists, derive `expired` client-side from `valid_to`.
- **Push**: triggers for `permits_to_work` status changes added under `supabase/v5-split/` numbering convention.

---

*Architecture analysis: 2026-05-11*
