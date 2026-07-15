# SIMULATION-PLAN.md — CK工程 Pre-Sale Bug-Free Certification

**App:** CK工程 — HK construction-site management (React 19 + Capacitor 8 + Supabase).
**Target (live web):** https://construction-app-lime-six.vercel.app
**Goal:** Run ONE collaborative, from-ZERO lifecycle on the live web app, every role doing its real work and handing off to the next, to catch every RBAC, data-propagation, and flow bug before customers do.
**Execution:** Manual tester OR automation agent (Chrome MCP / Playwright). HashRouter routes are `#/...`. Mobile target 390px, tablet 1600x900 — spot-check both. Use the `simulate` skill for browser automation.

---

## 1. Test Accounts & Roles

| Phone | Name | global_role | sub_role | Notes |
|-------|------|-------------|----------|-------|
| (admin) | 系統管理員 | admin | — | system owner; create if absent |
| 60001001 | 李PM | pm | — | assigned PM for DC2026 |
| 60001002 | 王老總 | general_foreman | — | supervisor tier; structure + materials supervisor |
| 60001003 | 陳工程師 | main_contractor | engineer | SI/VO step-0 approver, daily-log author |
| 60001004 | 黃管工 | main_contractor | foreman | daily-log author |
| 60001005 | 何判頭 | subcontractor | — | delegated work, materials, approves own workers |
| (create) | 工人A | subcontractor_worker | — | **must be seeded** |
| (create) | 業主A | owner | — | VO final approver; create via Signup |
| (create) | 安全主任A | safety_officer | — | **must be seeded via DB/RPC — UI cannot set this role (BW-06)** |

Password = the operator's standard test password; login is phone-based (synthetic email `<digits>@phone.local`).

> **Seeding caveat (P0 / BW-06):** `src/pages/AdminUsers.tsx:249` EditRole picker only offers `admin/pm/main_contractor/subcontractor/subcontractor_worker/owner`. It **cannot** set `safety_officer` or `general_foreman`. The `safety` button there is a *main_contractor sub_role*, NOT `global_role='safety_officer'` (PTW sign-off needs the global role via `active_role_holders(project,'safety_officer')`). So safety_officer + general_foreman accounts must be created at the DB/RPC layer for this sim. **Log this as a bug to fix before sale.**

**Demo project:** 「油塘灣住宅發展項目 — DC2026」, zones A座 + B座.

---

## 2. The 大項/中項/細項 Permission Question — Resolved

Two conflicting "who can edit this project" definitions exist in code:

- `can_edit_project_progress()` (`supabase/v3-progress-schema.sql`) — gates SI/VO/PTW/drawings INSERT on the **per-project membership role** ∈ `('pm','main_contractor','subcontractor')`.
- `can_manage_project_progress()` (`supabase/v15-progress-edit-rights-split.sql`) — gates 大項/中項/細項 INSERT/DELETE on the **account global_role** ∈ `('pm','general_foreman')` (plus admin / assigned_pm). The client mirror `ProgressContext.canManageStructure` (`src/contexts/ProgressContext.tsx:63-75`) does the same.

**Consequence:** a user who is a project's PM *by membership* but whose `global_role` is `main_contractor` **cannot add 大項** (v15 rejects) even though they *can* submit an SI (v3 accepts). Inconsistent.

**INTENDED RULE (recommended, what the matrix states and the sim tests):**
Add/delete 大項/中項/細項 + assign/delegate = `admin` OR `assigned_pm_ids` OR an **approved member whose per-project membership role ∈ ('pm','general_foreman','main_contractor')`.

**Code/RLS change implied (flag — confirm intent, don't silently ship this milestone):**
1. `can_manage_project_progress()` → test `project_members.role` (membership) not `user_profiles.global_role`.
2. `ProgressContext.canManageStructure` → mirror via the caller's membership row for `projectId`.
3. `get_visible_progress_items()` (`v14`) supervisor branch MUST use the SAME predicate, else a membership-PM builds structure they can't see. **All three gates must be unified.**

---

## 3. Permission Matrix (intended rights)

See the full feature × global_role grid in the accompanying `permissionMatrix` artifact (sections A core grid, B 大項 resolution, C UI↔RLS mismatch list). Y = full, R = read-only, N = none, per-row = only assigned/delegated rows. Roles are global; "assigned PM" overrides via `assigned_pm_ids`.

---

## 4. Per-Role Condensed Checklists

**admin** — login shows 管理/用戶/簽核流程設定; create project+zones (validation: empty name, zero zones, dup zone id); 指派 PM gate; delete project (verify cascade); toggle PTW flag (non-admin loses 工作許可證 nav); 用戶 browse/search/filter; EditRole **(verify safety_officer/general_foreman ABSENT — BW-06)**; 編輯角色 disabled on own row; 重新分派 SI/VO (≥10-char reason; **NO PTW rows — BW negative check**); chain editor per project; approve ANY membership **(watch 載入中… BW-10)**; export roster; cannot mutate approvals ledger / app_config / notification tables.

**pm (李PM)** — only gains powers after `assigned_pm_ids`; dashboard (assigned projects only); full tree; add/delete 大項/中項/細項; assign/delegate; supervisor update + history; approve memberships (own project); SI step-1 approve/批准並修改/退回/拒絕; VO step-1; create SI; submit VO off locked SI; issue terminal handler; export progress/issues; cannot reach /admin; cannot approve non-PM-step SI; cannot admin_override.

**general_foreman (王老總)** — full tree (v14 GF supervisor); add/delete structure; assign; update+history; manage materials (supervisor); read daily (amber banner, **no author CTA — BW-08**); read timetable/contacts; **VO 新增 shows but RLS-denied — BW-03**; **contacts write buttons show but RLS-denied — BW-07**; SI 新增 hidden; not in approval chains; not an issue handler; no dashboard/admin.

**main_contractor (陳工程師/黃管工)** — apply+approved as main_contractor; read tree; update assigned rows; upload drawings (membership-gated); create SI; SI step-0 approve (**watch global vs membership BW-05**); 批准並修改/退回/拒絕; VO step-0 approve + create VO; issue handler when handler=main_contractor; raise PTW; **safety sign-off only if global_role=safety_officer**; daily-log author (sub_role foreman/engineer); cannot add 大項; cannot admin_override.

**subcontractor (何判頭)** — apply+approved; contributor tree (assigned subtree only); update delegated leaf; report issue (→main_contractor); resolve/escalate when handler=判頭; create SI/VO/PTW; materials own rows only (**cannot edit peers — v16**); approve OWN workers; read daily/timetable/contacts; cannot add structure/assign; cannot author daily; cannot write contacts.

**subcontractor_worker (工人A)** — apply+approved; sees ONLY assigned leaf + ancestors; update assigned leaf; report issue (→判頭); comment/reopen own; **SI 新增 shows but RLS-denied — BW-02**; **PTW create shows but RLS-denied — BW-04**; everything else read-only; **CANNOT be assigned via UI — BW-09 (AssignmentModal has no worker option)**.

**owner (業主A)** — apply+approved as owner; read-only tree; owner one-pager export; report issue (→PM, comment only); VO FINAL approver (owner step only, not out of turn); read SI/tools; #/admin bounces; #/dashboard empty.

---

## 5. Ordered Collaborative Scenario (from ZERO)

Execute steps 1→22 in order. Each step: actor, action, expected, and the OTHER role that logs in to verify the handoff propagated. Full click-level detail is in the accompanying `scenarioOrder` artifact. Summary:

1. **admin** creates DC2026 + zones → *pm verifies no powers yet*.
2. **admin** assigns 李PM → *pm verifies dashboard/我的工地 appear*.
3. **admin** seeds safety_officer/general_foreman/owner/worker (DB), configures PTW chain → logs BW-06.
4. **pm** builds 大項/中項/細項 → *general_foreman verifies same full tree*.
5. **all roles** apply to join → *pm verifies 待審核申請 (watch BW-10)*.
6. **pm** approves all; **BW-01 probe** (membership-PM vs global add-大項) → *subcontractor verifies project openable*.
7. **pm** assigns 陳工程師(負責人)+何判頭(委派); **BW-09 probe** (no worker option) → *main_contractor & 判頭 verify 更新 button on that row only*.
8. **判頭** updates leaf 60% → *pm verifies rollup + history*.
9. **worker** (DB-assigned) updates 75% + reports issue → *判頭 verifies issue in queue 處理層：判頭*.
10. **判頭** escalates issue → *main_contractor verifies 處理層：總承建商*.
11. **main_contractor** escalates to PM → *pm verifies terminal handler*.
12. **main_contractor** creates+submits SI; **BW-02 probe** → *pm verifies SI at MC step, no PM bar yet*.
13. **main_contractor** approves SI step-0; **BW-05 probe** → *pm verifies approver bar now shows*.
14. **pm** approves → SI locks → *判頭 verifies read-only + 抗議 + 提出變更指令*.
15. **main_contractor** spawns VO off locked SI; **BW-03 probe** → *pm verifies server-computed total*.
16. **main_contractor→pm→owner** approve VO chain → *admin verifies chain complete + owner audit entry*.
17. **main_contractor** raises PTW → *safety_officer verifies sign-off step*.
18. **safety_officer** signs PTW → active+QR → *admin NEGATIVE-verifies admin_override cannot touch PTW; main_contractor verifies QR scan audit*.
19. **main_contractor(foreman)** writes daily log; **BW-08 probe** → *general_foreman & 判頭 verify read-only*.
20. **判頭** requests urgent material; edits own, fails on peer → *general_foreman verifies supervisor edit + timetable marker*.
21. **pm** exports owner one-pager + internal report + issues Excel → *owner verifies same one-pager, no edit*.
22. **owner** reviews read-only, reports issue, confirms no admin/dashboard data → *pm verifies owner's issue lands 處理層：PM (loop closed)*.

---

## 6. Bug Watchlist (test these explicitly)

| ID | Severity | Symptom | Where | Verify via live web |
|----|----------|---------|-------|---------------------|
| BW-01 | P0 | 大項 manage gated on global_role not membership role; membership-PM (global=main_contractor) can't add 大項; gates v14/v15/client diverge | v15, v3, ProgressContext.tsx:63-75 | Step 6 probe: membership-PM tries 加入大項; check button + raw insert |
| BW-09 | P0 | AssignmentModal has NO worker option → worker's core job unreachable in-app | AssignmentModal.tsx:40-41 | Step 7: confirm only 負責人/委派判頭 tabs, no worker |
| BW-06 | P0 | Admin UI cannot set safety_officer / general_foreman; PTW + structure depend on them | AdminUsers.tsx:249 | Step 3: open EditRole, confirm both roles absent |
| BW-02 | P1 | SI 新增 shown to worker, insert RLS-denied | SiContext.tsx:41 vs v9-si-schema.sql:106 (can_edit_project_progress) | Step 12: worker submits SI → expect RLS error surfaced |
| BW-03 | P1 | VO 新增 shown to general_foreman, insert RLS-denied | VoContext.tsx:39 vs can_edit_project_progress | Step 15: GF submits VO → expect RLS error |
| BW-04 | P1 | PTW create shown to worker, insert RLS-denied | PtwContext.tsx:50 vs can_edit_project_progress | Step 17: worker creates PTW → expect RLS error |
| BW-05 | P1 | SI/VO approver canAct keys on global_role; RPC keys on membership (active_role_holders) → button/RPC mismatch | SiApproverBar:30, VoApproverBar:31 vs v9-rls-helpers.sql | Steps 13/16: user with mismatched global vs membership role |
| BW-07 | P1 | Contacts write buttons show for GF, RLS write = admin/pm only | ContactsContext.canManage vs v11-contacts-schema.sql | GF taps 加聯絡人 → expect RLS error |
| BW-10 | P1 | Admin/PM approves blind: applicant card stuck 載入中… (v17 narrowed SELECT) | Projects.tsx PendingApprovalCard | Step 5/6: brand-new applicant sharing no project |
| BW-08 | P2 | GF daily-log: brief says "writes", code is read-only — confirm intent | v11-dailies-schema.sql:71-72 | Step 19: GF sees amber read-only banner |
| BW-NEG | P0 (must HOLD) | admin_override must NOT discharge a safety_officer PTW step | InFlightApprovalsModal loads SI+VO only | Step 18: confirm NO PTW rows in 重新分派 |

**Negative gates that MUST hold (regression checks):** non-admin cannot reach /admin (ProtectedRoute requireAdmin); approvals ledger append-only (`check(false)`, no update/delete); subcontractor cannot edit peer materials (v16); worker/owner cannot act on issues; locked SI rejects new versions (si_lock_guard); cross-project reads blocked by can_view_project; on NATIVE build /sell /mission /takeaway fall through to /home.

---

## 7. Pass/Fail & Reporting

- A step PASSES only when both the actor's action AND the named verifier's cross-role confirmation succeed.
- Capture: route, role, screenshot, console errors, network 4xx/RLS messages.
- Any BW item reproducing = a sale-blocking defect (P0/P1) or tracked item (P2). P0/P1 must be fixed and the affected step re-run before sale.
- Run the full 1→22 chain on phone (390px) and tablet (1600x900) at least once.