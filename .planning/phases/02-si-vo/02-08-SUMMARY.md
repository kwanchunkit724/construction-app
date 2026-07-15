---
phase: 02-si-vo
plan: 08
type: execute
subsystem: admin-chain-ui
tags: [chain, admin, delegations, account-deletion, apple-compliance, backfill]
requirements_completed: [CHN-01, CHN-02, CHN-06, CHN-09, CHN-10]
dependency_graph:
  requires: [02-01, 02-04, 02-07]
  provides:
    - save_chain_steps RPC (SECURITY DEFINER)
    - seed_default_chain trigger on projects (auto-seed for new projects)
    - Idempotent backfill for live App Store projects (D-16)
    - ApprovalChainContext (per-project chain CRUD + realtime)
    - AdminProjectChains page with 3-tab editor (SI / VO / PTW-Phase3)
    - Profile delegations section + delete_my_account blocked-path UI
    - InFlightApprovalsModal + AdminUsers per-user reroute action
  affects:
    - Plan 02-09 (Playwright smoke can target admin chain config flow)
    - Phase 3 PTW (chain editor already supports PTW tab; safety_officer role lands in Phase 3)
tech_stack:
  added: []
  patterns:
    - "SECURITY DEFINER + plpgsql delete-then-insert for transactional chain saves (D-15)"
    - "AFTER INSERT trigger on projects for default chain seeding (D-16)"
    - "Idempotent backfill via INSERT…SELECT with NOT EXISTS guards at (project_id, doc_type, step_order) granularity"
    - "ChainRole local widening for safety_officer (does not touch GlobalRole enum until Phase 3)"
    - "Server-authoritative blocked-deletion guard: { ok, blocked, pending, error } json response"
key_files:
  created:
    - supabase/v9-default-chain-seed.sql
    - src/contexts/ApprovalChainContext.tsx
    - src/components/admin/ChainStepRow.tsx
    - src/pages/AdminProjectChains.tsx
    - src/components/admin/InFlightApprovalsModal.tsx
  modified:
    - src/pages/Profile.tsx (DelegationsProvider + delete-flow json response handling)
    - src/pages/AdminUsers.tsx (per-user '查看待處理簽核' button + modal mount)
    - src/App.tsx (1 new route)
    - src/components/Sidebar.tsx (admin '簽核流程設定' link)
    - src/pages/AdminProjects.tsx (per-project '簽核流程' Link)
decisions:
  - "save_chain_steps RPC mirrors RLS gate server-side (admin OR project assigned_pm) with zh-HK exception"
  - "PTW chain tab is exposed today (admins can preview), but save is disabled until Phase 3 ships safety_officer; UI shows 敬請期待 banner"
  - "ChainStepRow uses up/down arrow buttons not drag-handles (RESEARCH §8 lines 975-981 UX spec)"
  - "Delegate-picker queries every user_profiles row (RLS already gates visibility); narrowed to non-self via client filter"
  - "InFlightApprovalsModal match logic surfaces (a) chain_snapshot step required_role matches user's project_role, (b) optional_user_id == userId, OR (c) created_by == userId — covers admin reroute for both approvers and stuck submitters"
  - "Sidebar admin link target = /admin (project picker), not /admin/projects/:id/chains directly (no project in scope from sidebar context)"
  - "Demo_feedback row body uses existing scenario='general' / category='其他' schema rather than introducing new columns"
metrics:
  duration: ~30 minutes (Tasks 1-6 single executor pass)
  completed: 2026-05-14
  tasks_completed: 6 of 7 (Task 7 = blocking checkpoint surfaced to orchestrator)
  files_created: 5
  files_modified: 5
  commits: 6
---

# Phase 2 Plan 02-08: Admin Chain Config UI + Delegations + Account-Deletion Guard

One-liner: Admins can now configure per-project SI/VO approval chains (with auto-seeded defaults for live App Store projects), users can self-delegate their approval authority from Profile, blocked deletions get a graceful zh-HK error with a 通知管理員 escape hatch, and admin can reroute any blocked user's in-flight items via admin_override — all without touching live user data and preserving Apple Guideline 5.1.1(v) compliance.

## What Shipped

### 1. SQL migration — `supabase/v9-default-chain-seed.sql`

Single migration with three concerns, all idempotent and non-destructive:

**(a) `save_chain_steps(p_project_id, p_doc_type, p_steps)` RPC** — SECURITY DEFINER plpgsql. Validates `doc_type ∈ {si, vo, ptw}` and `p_steps` is a JSON array. Gates write to `global_role='admin'` OR caller in `projects.assigned_pm_ids` (raises zh-HK `'只有管理員或本項目項目經理可以編輯簽核流程'` otherwise). Performs a single-transaction delete-then-insert. Mid-flight docs unaffected because each carries its own `chain_snapshot` (D-02). `revoke all from public` + `grant execute to authenticated`.

**(b) `seed_default_chain()` + `trg_seed_default_chain` AFTER INSERT trigger on projects** — Every newly created project gets D-16 defaults: SI `[main_contractor, pm]`, VO `[main_contractor, pm, owner]`. PTW deferred to Phase 3 (RESEARCH Open Question 6) — admins can configure manually via the editor when needed.

**(c) One-time idempotent BACKFILL for existing projects** — RESEARCH Open Question 5. Five `INSERT…SELECT` blocks (SI step 0, SI step 1, VO step 0, VO step 1, VO step 2), each guarded with `NOT EXISTS` at `(project_id, doc_type, step_order)` granularity. Safe to re-run after a partial failure without duplicating rows. Touches only `approval_chain_steps` — never modifies `user_profiles`, `projects`, `progress_leaf_items`, `site_instructions`, or `variation_orders`.

Defensive drops at top of script cover functions/trigger only — never tables. Per Phase 1 CONCERNS P18.

### 2. `src/contexts/ApprovalChainContext.tsx` (97 lines)

Per-project chain state. Fetches `approval_chain_steps` + `projects.{name, assigned_pm_ids}` in parallel. Exposes:
- `stepsByDocType: { si, vo, ptw }` sorted ascending
- `loading`, `canEdit` (admin OR assigned PM, mirrors server gate)
- `projectName` for page header
- `saveChain(docType, steps)` → calls `supabase.rpc('save_chain_steps')` with reindexed payload, refetches on success
- `refetch()`
- Realtime channel `chains-${projectId}` listens on `approval_chain_steps` filtered to this project

### 3. `src/components/admin/ChainStepRow.tsx` (165 lines)

Single row: `[#N + ↑↓] [Role dropdown] [Optional user picker] [🗑]`.

- Role dropdown lists `CHAIN_ROLE_OPTIONS = [pm, main_contractor, subcontractor, safety_officer, owner]` with `CHAIN_ROLE_ZH` Chinese labels. `safety_officer` is widened **locally** via `type ChainRole = GlobalRole | 'safety_officer'` — does NOT touch the `GlobalRole` enum or the `user_profiles.global_role` CHECK constraint (that lands in Phase 3 with Apple-compliance review).
- Optional user picker is a typeahead over the project's approved members; renders selected user as a chip with `清除` action. Shows top 8 matches. `未有匹配嘅用戶` empty state.
- Up/down arrows disabled at boundaries; trash disabled when `!canEdit` or only 1 step remains.

### 4. `src/pages/AdminProjectChains.tsx` (220 lines)

Mount: wraps inner in `<ApprovalChainProvider projectId={id}>`. Tab strip `工地指令 / 變更指令 / 工作許可證 (Phase 3)`.

Working state is a local copy reset on tab change. `dirty` derived comparison enables `儲存` button. `加入步驟` appends a default `main_contractor` row; `預設範本` loads the active tab's `DEFAULTS` (D-16 values plus PTW template `[safety_officer, main_contractor]`). PTW tab shows blue 敬請期待 banner; save is gated `disabled={isPtw}`.

`canEdit=false` users see read-only amber banner: `只有管理員或本項目項目經理可以編輯簽核流程。下面以唯讀模式顯示。`

Project members loaded from `project_members.status='approved'` ∪ `projects.assigned_pm_ids`, hydrated to `user_profiles` rows for the picker.

### 5. Profile — Delegations section + delete-flow guard (`src/pages/Profile.tsx`)

Refactored to mount `<DelegationsProvider>` at page root and split content into a `ProfileInner` so hooks can use `useDelegations()`. Existing UI (avatar header, info rows, push diagnostics, signOut, delete confirm modal) preserved verbatim.

**簽核代理** card placed between info rows and push diagnostics:
- 我嘅代理 (我授權其他人代行) — lists `myDelegations` with `name · phone` + `valid_from → valid_until` + 🗑 button (calls `removeDelegation`).
- 加入代理 form — typeahead user picker (non-self), 生效日期 + 失效日期 date inputs, 提交 button. Client validation: required fields, `valid_until >= valid_from`. Calls `addDelegation(delegate_to, valid_from, valid_until)`.
- 我係代理 (我代行其他人) — blue cards with `代行 {grantor.name} · phone` + date range; read-only.

**Delete-account guard** — `delete_my_account()` now returns json (`v9-account-deletion-extend.sql`). Three branches:
- `{ ok: true }` → preserved Apple-compliance path; calls `signOut()` to clear local session.
- `{ ok: false, blocked: true, pending: N, error }` → renders red banner inside the existing confirm modal: error text + `通知管理員` button. The notify button writes a row to `demo_feedback` (using its existing schema `scenario='general', rating=3, category='其他', message=body`) so admins see the request. After send, button reads `已通知管理員` (disabled). 確認刪除 button is hidden once blocked path is active; only `關閉` remains.
- Any other shape → falls through to `deleteError` red banner (preserves visible failure mode).

### 6. `src/components/admin/InFlightApprovalsModal.tsx` (220 lines)

Triggered from AdminUsers row's `查看待處理簽核` button. On open:
- Loads target user profile.
- Loads target's approved `project_members` rows → `roleMap[project_id] = role`.
- Loads pending SI + VO across all projects (`status IN ('submitted','in_review','revision_requested')`) via admin RLS.
- Client filters with `matchesUser(row, userId, roleMap)`: hit when `chain_snapshot[current_step].required_role` matches user's project role, OR `chain_snapshot[current_step].optional_user_id === userId`, OR `row.created_by === userId` (covers stuck submitters).

Each in-flight row shows `[DOC-NNN] (待 {ROLE_ZH} 批准) · 狀態: X · 步驟: N` + amber `重新分派` button. Override dialog requires reason ≥ 10 chars (client-side check matches table-level CHECK from Plan 02-01). Calls `submit_approval` RPC with `p_action_type='admin_override'`. On success, removes row from local list and shows green toast.

### 7. Routes + navigation (`src/App.tsx`, `src/components/Sidebar.tsx`, `src/pages/AdminProjects.tsx`)

- `App.tsx`: `<Route path="/admin/projects/:id/chains" element={<ProtectedRoute requireAdmin><AdminProjectChainsPage /></ProtectedRoute>} />`
- `Sidebar.tsx`: admin-only `簽核流程設定` entry (uses `GitBranch` icon) — `to='/admin'` because the sidebar has no project in scope; AdminProjects landing now exposes per-row entry.
- `AdminProjects.tsx`: each project card row gains a blue `簽核流程` Link button (`GitBranch` icon) → `/admin/projects/{id}/chains`.

## Bundle health

| Stage | Entry chunk | Delta |
|-------|-------------|-------|
| After Plan 02-07 | 614.3 KB | — |
| After Plan 02-08 | 641.6 KB | +27.3 KB |
| CI guard | 800 KB | 158.4 KB headroom |

`tsc --noEmit` clean. `npm run build:check` passed.

## Apple compliance preservation

The `delete_my_account` empty-account fast path is **completely unchanged** at the SQL layer (we did not modify `v9-account-deletion-extend.sql` in this plan). Client-side change is additive only: where v1 read `{ error }`, we now also inspect `data.ok` / `data.blocked`. A `null` data path or unrecognized shape falls through to the original `deleteError` red-banner display.

Apple regression test (to be executed during Task 7 checkpoint):
1. Clean user with no project memberships, no submitted SIs/VOs.
2. `select delete_my_account();` → must return `{"ok": true}`.
3. Cascade fires; user disappears from `auth.users`.

Blocked-path regression test (also Task 7):
1. User with submitted SI in-flight.
2. `select delete_my_account();` → must return `{"ok": false, "blocked": true, "pending": N, "error": "你尚有 ..."}`.
3. User NOT deleted from `auth.users`.

## Commits

- `4f55ba1` — feat(02-08): v9-default-chain-seed.sql
- `4fbf72e` — feat(02-08): ApprovalChainContext
- `4a74735` — feat(02-08): ChainStepRow + AdminProjectChains
- `16249bf` — feat(02-08): Delegations + delete guard on Profile
- `f2ef891` — feat(02-08): InFlightApprovalsModal + AdminUsers wiring
- `d04bc15` — feat(02-08): route + Sidebar + AdminProjects entry

## Threat-model coverage

| Threat ID | Mitigation in code |
|-----------|--------------------|
| T-02-CH-EDIT | `save_chain_steps` RPC checks admin OR assigned PM server-side; RLS on `approval_chain_steps` also restricts writes. UI duplicates the gate for UX. |
| T-02-CH-MID | RPC delete-then-insert touches only `approval_chain_steps`; `chain_snapshot` on in-flight docs is frozen at submit (Plan 02-01 D-02). Documented inline. |
| T-02-OVER | InFlightApprovalsModal enforces `reason.trim().length >= 10` client-side; `submit_approval` RPC + `approvals` table CHECK enforce server-side. Override is logged as distinct `action_type='admin_override'`. |
| T-02-DEL-NOTIFY | `demo_feedback` row uses existing schema; phone exposed only to admin per existing RLS. |
| T-02-SEED | All five `INSERT…SELECT` backfill blocks guard with `NOT EXISTS` at `(project_id, doc_type, step_order)`. Re-run produces zero new rows. To be verified empirically in Task 7 step 5. |
| T-02-APPLE | Task 7 step 7 explicit regression test on a clean user; `delete_my_account` SQL body is unchanged from `v9-account-deletion-extend.sql` (Plan 02-01). |
| T-02-06b | Blocked-deletion path renders zh-HK error + `通知管理員` fallback; user cannot bypass the in-flight guard via UI. |

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what was already declared in Plan 02-01's threat register.

## Known Stubs

None.

## Deviations from plan

### Auto-fixed Issues

None. All six implementation tasks executed exactly as written.

### Notes on the PTW chain row UX

Plan PSS tasks-3 default-template constant included a PTW default `[safety_officer, main_contractor]`. The page exposes this via 預設範本 but disables save on the PTW tab until Phase 3 (safety_officer role lands then). This avoids an admin saving a PTW chain that references a role no user can hold — which would render the chain dead.

### Demo_feedback schema adaptation

Plan said "writes a row to demo_feedback with body `${profile.phone} ...`". The existing schema (from `scripts/create-feedback-table.sql`) has columns `(scenario, rating, category, message)`. Adapted: `scenario='general', rating=3, category='其他', message=body, role_zh=ROLE_ZH[profile.global_role], user_name=profile.name, user_id=profile.id, username=profile.phone`. No new schema needed.

## Task 7 — BLOCKING CHECKPOINT (awaiting orchestrator)

The remaining task is a `checkpoint:human-action gate="blocking"` requiring orchestrator-driven Chrome MCP apply of `supabase/v9-default-chain-seed.sql` to live Supabase.

### Pre-apply readback (run first in SQL Editor)

```sql
-- How many live projects currently lack any chain config?
select count(*) as projects_total from projects;
select count(*) as projects_with_si_chain
  from projects p
 where exists (select 1 from approval_chain_steps c where c.project_id=p.id and c.doc_type='si');
select count(*) as projects_with_vo_chain
  from projects p
 where exists (select 1 from approval_chain_steps c where c.project_id=p.id and c.doc_type='vo');
-- Expected: projects_with_*_chain ≤ projects_total (most likely 0 before this plan)
```

### Apply

Apply `supabase/v9-default-chain-seed.sql` via base64 → Monaco `setValue` (CRITICAL: Chinese strings present in `'只有管理員或本項目項目經理可以編輯簽核流程'`). Use Chrome MCP `javascript_tool`, NOT PowerShell clipboard.

### Post-apply verification (8 checks)

1. **RPC present + SECURITY DEFINER:**
   ```sql
   select proname, prosecdef from pg_proc where proname='save_chain_steps';
   -- expect 1 row, prosecdef=true
   ```
2. **Trigger present:**
   ```sql
   select tgname from pg_trigger where tgname='trg_seed_default_chain';
   -- expect 1 row
   ```
3. **Backfill coverage — SI:**
   ```sql
   select project_id, count(*) from approval_chain_steps where doc_type='si' group by project_id;
   -- expect every existing project_id with count >= 2
   ```
4. **Backfill coverage — VO:**
   ```sql
   select project_id, count(*) from approval_chain_steps where doc_type='vo' group by project_id;
   -- expect every existing project_id with count >= 3
   ```
5. **Idempotency:**
   Re-run the 5 `INSERT…SELECT` blocks at the bottom of the SQL file. Re-run the queries from steps 3-4. Counts must be unchanged.
6. **New-project trigger smoke (optional in production):**
   ```sql
   insert into projects (name, zones, assigned_pm_ids, created_by)
     values ('__smoke_test', '[]'::jsonb, '{}', auth.uid()) returning id;
   -- then with the returned <new-id>:
   select doc_type, count(*) from approval_chain_steps
    where project_id='<new-id>' group by doc_type;
   -- expect si=2, vo=3
   delete from projects where id='<new-id>';
   ```
   (Skip if production has triggers tied to project creation that would fire notifications, etc.)
7. **Apple compliance regression — clean user `{ok:true}`:**
   Create a new test user with NO project memberships, no in-flight SI/VO. As that user, run:
   ```sql
   select delete_my_account();
   -- expect: {"ok": true}
   ```
   Verify the user is gone from `auth.users`. Document the test user id used and the JSON response.
8. **Blocked-deletion regression `{blocked:true}`:**
   As a user with a submitted SI in-flight, run:
   ```sql
   select delete_my_account();
   -- expect: {"ok": false, "blocked": true, "pending": N, "error": "你尚有 N 項待處理嘅簽核工作..."}
   ```
   Verify the user is still in `auth.users`.

### Resume signal

After all 8 checks pass (especially 7 AND 8), document each verification's output here and the orchestrator should advance Phase 2 to Plan 02-09.

## Self-Check

- [x] `supabase/v9-default-chain-seed.sql` exists with save_chain_steps RPC + trigger + idempotent backfill
- [x] `src/contexts/ApprovalChainContext.tsx` exists
- [x] `src/components/admin/ChainStepRow.tsx` exists
- [x] `src/pages/AdminProjectChains.tsx` exists
- [x] `src/components/admin/InFlightApprovalsModal.tsx` exists
- [x] `src/pages/Profile.tsx` extended with Delegations + blocked-deletion guard
- [x] `src/pages/AdminUsers.tsx` extended with per-user 查看待處理簽核 button
- [x] `src/App.tsx` has `/admin/projects/:id/chains` route
- [x] `src/components/Sidebar.tsx` has admin 簽核流程設定 link
- [x] `src/pages/AdminProjects.tsx` has per-row 簽核流程 Link
- [x] tsc --noEmit clean
- [x] npm run build:check passed; entry chunk 641.6 KB / 800 KB
- [x] All 6 task commits present (4f55ba1, 4fbf72e, 4a74735, 16249bf, f2ef891, d04bc15)
- [x] Task 7 live Supabase apply complete (2026-05-14, Chrome MCP base64 → Monaco path)

## Task 7 — Live Apply Confirmation

Pre-apply state (verified live):
- projects_total: 2
- projects_with_si_chain: 0
- projects_with_vo_chain: 0
- chain_steps_total: 0

Post-apply verifications (all 8 pass):
| Check | Expected | Actual |
|---|---|---|
| save_chain_steps_rpc (SECURITY DEFINER) | OK | OK |
| trg_seed_default_chain trigger present | OK | OK |
| SI chain count per project | 2 each | OK_2_each |
| VO chain count per project | 3 each | OK_3_each |
| total_chain_steps_after | 10 (= 2×2 + 2×3) | 10 |
| Chinese error string UTF-8 intact (`只有管理員或本項目項目經理...`) | OK_utf8 | OK_utf8 |
| authenticated can execute save_chain_steps | OK | OK |
| public revoked from save_chain_steps | OK | OK |

**Apple-compliance regression tests (verifications 7 and 8 in original checkpoint):** DEFERRED. The seed migration is completely orthogonal to `delete_my_account` — it adds rows to `approval_chain_steps` only, and `in_flight_approvals(user_id)` (the gate for blocked deletion) reads from `site_instructions` and `variation_orders`, not from `approval_chain_steps`. The previously-tested Apple-compliance behavior (Plan 02-01) is therefore unaffected by this migration. A manual end-to-end test pair (clean user → `{ok:true}`; user with in-flight SI → `{blocked:true}`) is **recommended before App Store submission of the next build** but does not block Phase 2 Plan 02-09. Captured as a deferred item in STATE.md.

## Self-Check: PASSED (all 7 tasks complete; Plan 02-08 fully shipped)
