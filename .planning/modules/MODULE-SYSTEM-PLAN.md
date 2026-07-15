# Module System — Detailed Implementation Plan

**Goal:** every feature = a toggleable **module**; **admin** turns modules on/off **per project**.
**Confirmed decisions:** UI + **backend RLS** enforcement · **all-on by default** (existing + new) ·
**admin-only** toggle · **per-project** granularity.
**Constraints (locked):** additive only; no destructive change to live tables; backwards-compatible;
zh-HK UI. Verify by EXECUTION.

## Module catalog (13)

`progress`* · `issues` · `si` · `vo` · `ptw` · `weather` · `documents` · `materials` · `contacts`
· `timetable` · `dailies` · `equipment` · `assistant`

\* `progress` is **core (non-disableable)** — a project with no progress tree is meaningless. All
others freely toggleable. (Override if you disagree.)

## Default model — "absence = enabled"

No backfill of existing projects. `project_module_enabled()` returns **true when no row exists**, so:
- every existing project = all modules on (backwards-compat, zero migration risk to live data);
- any newly-added module = on everywhere automatically;
- disabling = upsert a row `enabled=false`; re-enabling = `true` (or delete the row).

---

## Phase 1 — Foundation (1 agent, SEQUENTIAL — defines the contract everyone depends on)

1. `src/lib/modules.ts` — `MODULES` registry: `{ key, labelZh, icon, route?, tabId?, core? }` (the 13).
2. `src/types.ts` — `ModuleKey`, `ProjectModule` types + `MODULE_LABELS_ZH`.
3. `supabase/v59-modules-schema.sql`:
   - `project_modules(project_id uuid refs projects on delete cascade, module_key text, enabled bool not null default true, updated_by uuid, updated_at timestamptz, primary key(project_id, module_key))`.
   - `project_module_enabled(p_project_id uuid, p_module_key text) returns bool` (SECURITY DEFINER, stable) = `coalesce((select enabled from project_modules where …), true)`.
   - RLS: `select` = `can_view_project`; `insert/update/delete` = admin (`global_role='admin'`).
   - RPCs: `set_project_module(p_project_id, p_module_key, p_enabled)` (admin-only upsert, `progress` rejected) + `get_project_modules(p_project_id)` (returns every catalog key + its effective enabled state for the admin UI).

## Phase 2 — Parallel build (**5 agents at the same time**)

| Agent | Owns | Files |
|---|---|---|
| **2A Frontend gating** | `ModulesContext` (fetch `get_project_modules`, `isModuleEnabled(key)` default-true, realtime channel) + generic `ModuleGate` (mirrors `PtwGate`/`FilesGate`) + route guards in `App.tsx` | `src/contexts/ModulesContext.tsx`, `src/components/ModuleGate.tsx`, `src/App.tsx` |
| **2B Nav/tab surfaces** | filter `ProjectDetail` tabs + `Sidebar`/`BottomNav` items by `isModuleEnabled` | `src/pages/ProjectDetail.tsx`, `src/components/Sidebar.tsx`, `src/components/BottomNav.tsx` |
| **2C Admin toggle UI** | per-project module-toggle page (admin sees 13 modules + switches → `set_project_module`) | `src/pages/AdminProjectModules.tsx` + route `/admin/projects/:id/modules`, link from `AdminProjects` |
| **2D Backend RLS (group 1)** | add `and project_module_enabled(project_id,'<mod>')` to SELECT (+INSERT) policies: `issues`, `si`, `vo`, `ptw` (+ child tables) | `supabase/v59-modules-rls-1.sql` |
| **2E Backend RLS (group 2) + flag fold-in** | same gate for `weather`/`documents`/`materials`/`contacts`/`timetable`/`dailies`/`equipment`; fold existing `ptw_enabled`/`files_enabled`/`ai_enabled` into modules (`ptw`/`documents`/`assistant`; keep AI global flag ANDed with the `assistant` module) | `supabase/v59-modules-rls-2.sql` |

Backend RLS is **additive AND backwards-compat** because the gate defaults to `true` — existing
access is unchanged until an admin explicitly disables a module. Highest-risk piece → test each table.

## Phase 3 — Integration + verify (1 agent / me, SEQUENTIAL)

- Mount `ModulesProvider` in the provider tree (`App.tsx`).
- Apply `v59-*` migrations (SQL editor) + redeploy nothing (no Edge Function change).
- **Verify by execution** (L1 REST + harness): toggle module off → its table SELECT denied + tab
  hidden; toggle on → restored; non-admin `set_project_module` → denied; existing project all-on
  (backwards-compat); `progress` can't be disabled; realtime toggle reflects without refresh.
- `tsc` + bundle-size guard (`scripts/check-bundle-size.cjs`).

---

## Test plan (per module)
ALLOW: module on → tab visible + data readable/writable. DENY: module off → tab hidden + route
redirects + RLS denies the table. Plus: admin-only toggle, default-on backwards-compat, core
`progress` non-disableable, realtime.

## Debug playbook
`get_project_modules` output → `ModulesContext` state → route-guard redirect → RLS via REST (toggle
off, then SELECT the table with a member JWT → expect empty/denied).

## Agent execution summary
- **Peak concurrency: 5 agents** (Phase 2).
- Total: 1 (foundation) → 5 (parallel build) → 1 (verify) = 7 agent-runs, 3 phases.
- Foundation MUST land before Phase 2 (contract). Phase 2 agents own disjoint file-sets → no conflicts.
- Verification (E2E) runs via the browser harness / CI — subagents can't reach the network.
