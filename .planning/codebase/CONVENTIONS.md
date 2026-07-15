# Coding Conventions

**Analysis Date:** 2026-05-11

## Tooling & Enforcement

**Formatter:** None configured. No `.prettierrc`, `prettier.config.*`, or `biome.json` at repo root.

**Linter:** None configured. No `.eslintrc*`, `eslint.config.*`, or `biome.json`. ESLint is not in `package.json` devDependencies.

**TypeScript:** Strict mode enabled (`tsconfig.json`):
- `"strict": true`
- `"noUnusedLocals": false` (unused locals allowed)
- `"noUnusedParameters": false` (unused params allowed)
- `"noFallthroughCasesInSwitch": true`
- `"jsx": "react-jsx"` (no need to import React for JSX)

**Implication:** Conventions are enforced by **convention only** (developer discipline + TS compiler). There is no automated style check in CI. Follow patterns observed in existing files exactly.

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` — e.g. `src/components/IssueCard.tsx`, `src/components/CreateIssueModal.tsx`
- Pages: `PascalCase.tsx` — e.g. `src/pages/Login.tsx`, `src/pages/AdminUsers.tsx`
- Contexts: `PascalCaseContext.tsx` — e.g. `src/contexts/AuthContext.tsx`
- Library/utility modules: `camelCase.ts` — e.g. `src/lib/phone.ts`, `src/lib/supabase.ts`, `src/lib/push.ts`, `src/lib/export.ts`
- Single types file: `src/types.ts` (all shared TS types in one module)

**React Components:** `PascalCase` — `function IssueCard(...)`, `function AuthProvider(...)`
- Pages use `export default function Name()`
- Components use named exports: `export function IssueCard(...)`

**Hooks:** `camelCase` starting with `use` — `useAuth()`, `useProjects()`

**Functions:** `camelCase` — `loadProfile`, `phoneToEmail`, `normalizePhone`, `refetch`

**Variables / State:** `camelCase` — `const [phone, setPhone] = useState('')`

**TypeScript types/interfaces:** `PascalCase` — `interface UserProfile`, `type GlobalRole`, `interface ProjectsContextType`

**Constants (Chinese label maps):** `SCREAMING_SNAKE_CASE` with `_ZH` suffix — `ROLE_ZH`, `SUB_ROLE_ZH`, `ISSUE_STATUS_ZH`, `ISSUE_HANDLER_ZH`, `PROGRESS_STATUS_ZH` (all in `src/types.ts`)

**Database (Supabase / SQL):** `snake_case` for tables, columns, and JSON keys returned to the client:
- Tables: `user_profiles`, `project_members`, `progress_items`
- Columns: `global_role`, `sub_role`, `assigned_pm_ids`, `created_at`, `applied_at`, `onesignal_id`, `current_handler_role`
- Type fields mirror SQL column names verbatim — never camelCased in TS interfaces (`src/types.ts`)

**String literal unions:** kebab-case for multi-word values — `'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'`. Single-word values are lowercase: `'admin' | 'pm' | 'owner'`.

## Code Style (observed from source)

- **Quotes:** single quotes `'...'` for JS/TS strings, double quotes `"..."` for JSX attributes
- **Semicolons:** **omitted** — ASI style throughout (`src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`)
- **Indentation:** 2 spaces
- **Trailing commas:** present in multi-line object/array literals
- **Arrow vs function:** `function` keyword preferred for top-level components and module-level helpers; arrow functions used for inline callbacks (`.then(...)`, `.map(...)`, event handlers)
- **JSX:** self-close empty elements; multi-line props are indented one level under the opening tag
- **`async/await`:** preferred over `.then()` chains, except for `getSession().then(...)` in auth bootstrap (`src/contexts/AuthContext.tsx`)

## Import Organization

Observed order (e.g. `src/pages/Dashboard.tsx`, `src/pages/Login.tsx`):

1. React + React hooks: `import { useEffect, useMemo, useState } from 'react'`
2. Third-party libs: `react-router-dom`, `lucide-react`
3. Internal components (relative): `'../components/AppLayout'`, `'../components/Spinner'`
4. Internal contexts: `'../contexts/AuthContext'`
5. Internal lib: `'../lib/supabase'`
6. Internal helpers from `'../types'` (runtime values like `PROGRESS_STATUS_ZH`)
7. Type-only imports last: `import type { ProgressItem, Issue } from '../types'`

**No path aliases configured** — all internal imports are relative (`'../contexts/...'`, `'../lib/...'`). `tsconfig.json` has no `paths`. Vite has no `resolve.alias`.

**Type imports** use the explicit `import type { ... }` form when importing only types.

## Tailwind Usage

**Version:** Tailwind 3.4.3 (`tailwind.config.js`, not Tailwind 4). PostCSS pipeline via `postcss.config.js`. Note: Project description mentions "Tailwind 4" but actual install is v3 — utility names below all valid v3 syntax.

**Custom theme** (`tailwind.config.js`):
- `font-sans` → Inter (with Chinese fallbacks `Microsoft JhengHei`, `PingFang HK`)
- `font-heading` → Poppins
- Color palette: `site-{50..950}` (slate-based neutrals), `safety-{50..700}` (orange CTAs/warnings)
- Custom `shadow-card`, `shadow-card-md`
- Extended `rounded-xl` (0.875rem), `rounded-2xl` (1.125rem)

**Component layer** (`src/index.css`) — use these helper classes instead of repeating utilities:
- `.btn-primary` — orange CTA button (rounded-xl, padded, hover/active states)
- `.btn-ghost` — bordered neutral button
- `.input` — full-width form input
- `.card` — white surface with site border + `shadow-card`
- `.label` — form label
- Apple HIG `min-height: 44px` enforced globally on buttons/inputs in `@layer base`

**Class ordering convention** (observed, not lint-enforced):
Loosely follows the Tailwind official order — layout/positioning → flex/grid → spacing → sizing → typography → background/border → effects → states/responsive. Example from `src/pages/Login.tsx`:
```tsx
className="min-h-screen bg-site-50 flex flex-col px-5 pt-20 pb-10"
className="w-16 h-16 rounded-2xl bg-safety-500 flex items-center justify-center text-white mb-3"
```
Inconsistencies exist; do not waste time reordering existing files.

**Conditional classes:** template literals with ternaries:
```tsx
className={`w-10 h-10 rounded-xl ... ${
  isOpen ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
}`}
```
No `clsx`/`classnames`/`cn()` helper in use — keep with template literals.

**Status color palette** (used for badges/pills in `IssueCard`, `ProgressItemCard`, etc.):
- Open / warning: `bg-amber-100 text-amber-700`
- Resolved / success: `bg-green-100 text-green-700`
- Info: `bg-blue-50 text-blue-700`
- Error: `bg-red-50 text-red-600 border-red-200`
- Use `safety-*` only for primary CTAs and brand accents

## Supabase Call Pattern

**Standard query shape** (see `src/contexts/AuthContext.tsx`, `src/contexts/ProjectsContext.tsx`):
```ts
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('column', value)
  .single()           // or .maybeSingle() when row may be absent
if (error) {
  console.error('descriptive context:', error)
  // surface or return
}
```

**Mutations return shape:**
Context methods exposing supabase writes return `Promise<{ error: string | null }>`. The caller surfaces `error` to UI state. Example from `ProjectsContext.createProject`:
```ts
async function createProject(name: string, zones: Zone[]) {
  if (!profile) return { error: '未登入' }
  const { error } = await supabase.from('projects').insert({ ... })
  if (error) return { error: error.message }
  await refetch()
  return { error: null }
}
```

**No try/catch around supabase calls** — supabase-js returns errors in the result object (`{ data, error }`) rather than throwing. The codebase relies on this. `try/catch` appears only around non-supabase side effects (e.g. `await pushLogoutUser().catch(() => {})` in `AuthContext.signOut`).

**Realtime subscriptions:** channel-per-context pattern. Subscribe in `useEffect`, return cleanup that calls `supabase.removeChannel(channel)`. See `src/contexts/ProjectsContext.tsx` lines 64–70.

**Refetch after write:** mutations explicitly call `await refetch()` rather than relying solely on realtime, ensuring local state is consistent before resolving.

**Network timeout:** `src/lib/supabase.ts` wraps `fetch` with a 15-second `AbortController` timeout. All supabase REST calls inherit this — callers do not need their own timeout logic.

## Error Handling & UI Surfacing

**Pattern for form errors** (`src/pages/Login.tsx`):
```tsx
const [error, setError] = useState('')
// ...
setError('')                              // clear before async call
const { error } = await signIn(...)
if (error) setError(error)
// render:
{error && (
  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
    {error}
  </div>
)}
```

**Pattern for context fetch errors** (`src/contexts/ProjectsContext.tsx`):
- Collect errors into `fetchError: string | null` state
- Consumer pages render a banner when `fetchError` is non-null
- Errors are also `console.error`-logged with a label (e.g. `'projects fetch error:'`)

**No global error boundary** in `src/main.tsx` or `src/App.tsx`. Errors surface per-component.

## Loading States

**Per-page boolean:** `const [loading, setLoading] = useState(true)` set false in `.finally(...)` of fetch.

**Auth/route gating** (`src/components/ProtectedRoute.tsx`):
```tsx
if (loading) return <FullPageSpinner label="載入中..." />
```

**Inline spinners** inside buttons during submit:
```tsx
<button disabled={submitting} className="btn-primary w-full">
  {submitting ? <Spinner size={18} className="text-white" /> : '登入'}
</button>
```

**Spinner components** are centralized in `src/components/Spinner.tsx`:
- `<Spinner size={n} className="..." />` — inline `Loader2` from `lucide-react`, `animate-spin`
- `<FullPageSpinner label="..." />` — full-viewport centered spinner with optional Chinese label

## Chinese UI Strings (i18n)

**No i18n library.** No `react-intl`, `i18next`, `react-i18next`, `formatjs`, or `useTranslation` anywhere in `src/`. Searched: no matches.

**All UI strings are inline Traditional Chinese (zh-HK)** directly in JSX/TSX:
- `<h1>建築工程管理</h1>` (`src/pages/Login.tsx`)
- `<p>登入以繼續</p>`
- Validation messages inline: `setError('請輸入有效的 8 位香港手機號碼')`
- Error messages from contexts: `return { error: '此手機號碼已註冊。請改用登入。' }` (`AuthContext.signUp`)

**Enum → Chinese label mapping** is centralized in `src/types.ts` as `Record<EnumValue, string>` constants:
- `ROLE_ZH`, `SUB_ROLE_ZH`, `ISSUE_STATUS_ZH`, `ISSUE_HANDLER_ZH`, `PROGRESS_STATUS_ZH`

When adding a new enum-like field, follow this pattern: define the union type, then export a `FOO_ZH: Record<Foo, string>` next to it. Components consume the map: `{ISSUE_STATUS_ZH[issue.status]}`.

**HTML lang:** `<html lang="zh-HK">` (`index.html`). App title in `index.html` is bilingual: `建築工程管理平台 | Construction Management`.

**Date formatting:** Use `toLocaleDateString('zh-HK')` for user-visible dates (see `src/components/IssueCard.tsx` line 52).

## Supabase Migration File Naming

Migrations live in `supabase/` at repo root (no nested `migrations/` dir).

**Naming pattern:** `v{N}-{slug}.sql` where `N` is a phase/version integer.
- `v2-schema.sql`, `v2-seed-admin.sql`, `v2-promote-admin.sql`, `v2-cleanup-admin.sql`, `v2-fix-admin-identity.sql`, `v2-fix-rls-recursion.sql`
- `v3-progress-schema.sql`, `v3-5-progress-extras.sql` (decimal `3-5` = "3.5" intermediate)
- `v4-issues-schema.sql`, `v4-fix-issue-update-rls.sql`
- `v5-push-notifications.sql`
- `v6-account-deletion.sql`

**Split migrations:** When a single phase needs multiple ordered files, use a numbered subdirectory: `supabase/v5-split/1-base.sql`, `2-send-push.sql`, `3-trg-issue-created.sql`, ... `7-fix-external-user-id.sql`.

**Conventions:**
- Lowercase, kebab-case slug after the version prefix
- Slug describes intent: `schema`, `seed-admin`, `fix-*`, `cleanup-*`
- Fixes for a prior version stay under the same version prefix (`v4-fix-issue-update-rls.sql` fixes `v4-issues-schema.sql`)
- No timestamps in filenames — pure semantic versioning

**When adding a new migration:** pick the next unused major version (currently `v7-`) and a kebab-case slug. Use `vN-split/` only if the migration must be applied as discrete ordered statements (e.g. function-then-trigger sequences that fail when concatenated).

## Function / Module Design

**Components:** Single component per file. File name matches the default/primary export.

**Contexts:** One context per concern (`AuthContext`, `ProjectsContext`, `ProgressContext`, `IssuesContext`). Each exports a `XxxProvider` component and a `useXxx()` hook that throws if used outside its provider:
```ts
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

**Type-only files:** `src/types.ts` holds all shared types and Chinese label maps. Page/component-local types are declared inline at the top of the file (e.g. `interface ActivityEvent` in `src/pages/Dashboard.tsx`).

**No barrel files** (no `index.ts` re-exports). Always import from the concrete file path.

**Comments:** Multi-line `//` comments explaining *why* (not what) appear before non-obvious logic — see the rationale comments in `src/contexts/AuthContext.tsx` around push notification lifecycle. No JSDoc/TSDoc blocks observed.

---

*Convention analysis: 2026-05-11*
