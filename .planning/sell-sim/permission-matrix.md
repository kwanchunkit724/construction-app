PERMISSION MATRIX — INTENDED RIGHTS (Y = full / R = read-only / N = none / per-row = only on items assigned/delegated to them). Roles are GLOBAL roles. "Assigned PM" = user listed in projects.assigned_pm_ids regardless of global_role. Grounded in src/contexts/ProgressContext.tsx, src/types.ts, and supabase v3/v9/v11/v14/v15.

============================================================
A. CORE RBAC GRID (feature × global_role)
============================================================
Feature                              | admin | pm  | general_foreman | main_contractor | subcontractor(判頭) | subcontractor_worker | owner
-------------------------------------|-------|-----|-----------------|-----------------|---------------------|----------------------|------
Login / view 我的工地                 |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
Create/delete project + zones        |  Y   | N   | N               | N               | N                   | N                    | N
Assign/unassign PMs                  |  Y   | N   | N               | N               | N                   | N                    | N
Toggle PTW feature flag              |  Y   | N   | N               | N               | N                   | N                    | N
Manage users / edit global role      |  Y   | N   | N               | N               | N                   | N                    | N
Configure SI/VO/PTW approval chains  |  Y   | Y*  | N               | N               | N                   | N                    | N   (*assigned-PM via save_chain_steps RPC; NO PM-facing UI today)
Approve membership applications      |  Y   | Y(own proj)| N        | N               | Y(own workers only) | N                    | N
View progress tree (full project)    |  Y   | Y   | Y               | per-row         | per-row             | per-row              | R(full)
Add 大項/中項/細項 (structure)         |  Y   | Y   | Y               | N (SEE §B BUG)  | N                   | N                    | N
Delete progress item                 |  Y   | Y   | Y               | N               | N                   | N                    | N
Assign/delegate leaf (AssignmentModal)| Y    | Y   | Y               | N               | N                   | N                    | N
Update progress % / floors           |  Y   | Y   | Y               | per-row         | per-row             | per-row              | N (per-row only if wrongly assigned)
View item history                    |  Y   | Y   | Y               | Y(visible)      | Y(visible)          | Y(visible)           | R
Manage drawings (upload/version)     |  Y   | Y   | (SEE §B)        | Y(membership)   | N                   | N(read)              | R
Report an issue                      |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
Comment on issue                     |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
Act on issue (resolve/escalate)      |  Y   | Y(handler=pm)| N        | Y(handler=mc)   | Y(handler=判頭)     | N                    | N
Reopen OWN reported issue            |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
Create/submit SI                     |  Y   | Y   | N               | Y               | Y                   | N (SEE §B BUG)       | N
Approve/return/reject SI step        |  Y(override)| Y(step) | N         | Y(step0)        | N                   | N                    | N
Create/submit VO                     |  Y   | Y   | N (SEE §B BUG)  | Y               | Y                   | N                    | N
Approve VO step                      |  Y(override)| Y(step1)| N        | Y(step0)        | N                   | N                    | Y(final step)
admin_override SI/VO                 |  Y   | N   | N               | N               | N                   | N                    | N
Create/submit PTW (flag on)          |  Y   | Y   | N (SEE §B BUG)  | Y               | Y                   | Y                    | N
PTW safety sign-off                  |  Y(NOT via override)| N | N    | only if global_role=safety_officer | N | N        | N
Write daily log (每日日誌)            |  Y?  | N   | N               | Y(sub_role foreman/engineer ONLY) | N | N           | N
Read daily log                       |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
Create/edit/delete materials         |  Y   | Y   | Y(supervisor)   | Y               | Y(own rows only)    | N                    | N(read)
Create/edit/delete contacts          |  Y   | Y   | N (SEE §B BUG)  | N               | N                   | N                    | N(read)
Read materials/timetable/contacts    |  Y   | Y   | Y               | Y               | Y                   | Y                    | Y
View cross-project dashboard         |  Y   | Y(assigned)| N         | N               | N                   | N                    | N(empty)
Export progress/issues reports       |  Y   | Y   | Y               | Y               | Y(scoped)           | Y(scoped)            | Y(owner one-pager)
Mutate approvals ledger directly     |  N   | N   | N               | N               | N                   | N                    | N (append-only, check(false))

============================================================
B. THE 大項/中項/細項 QUESTION — RESOLUTION (global-role vs membership-role)
============================================================
CURRENT CODE (the bug):
  • Server: can_manage_project_progress() (supabase/v15-progress-edit-rights-split.sql) grants structure INSERT/DELETE to:
      admin  OR  assigned_pm_ids  OR  (approved member AND user_profiles.global_role IN ('pm','general_foreman')).
  • Client: ProgressContext.canManageStructure (src/contexts/ProgressContext.tsx:63-75) mirrors EXACTLY the same — keys on GLOBAL role, not the per-project membership role.
  • Meanwhile the OLDER gate can_edit_project_progress() (v3) — which still gates SI/VO/PTW/drawings INSERT — keys on the PER-PROJECT MEMBERSHIP role IN ('pm','main_contractor','subcontractor').
  ⇒ Two different definitions of "who can edit the project" coexist. A user who is a project's PM BY MEMBERSHIP but whose global_role is e.g. main_contractor CANNOT add 大項 (v15 rejects), yet CAN submit SI (v3 accepts). Confusing and inconsistent.

INTENDED RULE (recommended, to state in matrix and TEST):
  "Add/delete 大項/中項/細項 and assign/delegate" should be granted to:
      admin
      OR assigned_pm_ids (assigned PM, any global_role)
      OR an APPROVED project_members row whose PER-PROJECT membership role IN ('pm','general_foreman','main_contractor').
  Rationale: structure-building is a per-site supervisory act. It must follow the site membership role a user holds on THAT project, not their account-wide global_role. A 總承建商 staff member acting as the site's lead should build the WBS; a global PM with no membership on this site should not.

CODE/RLS CHANGE THIS IMPLIES (flag, do NOT silently ship in this milestone — verify intent first):
  1. supabase: rewrite can_manage_project_progress(p_user_id, p_project_id) to test project_members.role (the membership role) IN ('pm','general_foreman','main_contractor') for an approved row — NOT user_profiles.global_role. Keep admin + assigned_pm branches.
  2. src/contexts/ProgressContext.tsx canManageStructure: mirror the new rule — look up the caller's membership row for projectId and test myMembership.role, not profile.global_role.
  3. Keep get_visible_progress_items (v14) supervisor branch ALIGNED with whatever rule is chosen (today it keys on global_role pm/general_foreman → a membership-PM whose global_role≠pm would build structure but NOT see the full tree → broken). Whichever way it is resolved, the THREE gates (visibility v14, manage v15, client canManageStructure) MUST use the SAME predicate.

ALTERNATIVE (if product wants to keep global-role gating): then the matrix must say add-大項 is global_role pm/general_foreman ONLY, the AssignmentModal/admin docs must stop implying main_contractor builds structure, and main_contractor's "canDo" brief is wrong. Either way the three gates must be unified. The sim tests BOTH interpretations (Step 6 + bug-watchlist BW-01).

============================================================
C. KNOWN UI↔RLS PRIVILEGE MISMATCHES TO CERTIFY (button shows, server rejects, or vice-versa)
============================================================
  BW-01 大項 manage gate: global_role vs membership role (above). P0.
  BW-02 SI 新增 shown to subcontractor_worker (SiContext.canSubmit incl. 'subcontractor_worker', src/contexts/SiContext.tsx:41) but SI insert RLS = can_edit_project_progress excludes worker → RLS error. P1.
  BW-03 VO 新增 shown to general_foreman (VoContext.canSubmit incl. 'general_foreman', VoContext.tsx:39) but VO insert RLS = can_edit_project_progress excludes GF membership role → RLS error. P1.
  BW-04 PTW create shown to subcontractor_worker (PtwContext.canSubmit incl. 'subcontractor_worker', PtwContext.tsx:50) but PTW insert RLS = can_edit_project_progress excludes worker → RLS error. P1.
  BW-05 SI/VO approver bar canAct keys on profile.global_role===requiredRole (SiApproverBar:30, VoApproverBar:31) but submit_approval RPC validates active_role_holders which keys on MEMBERSHIP role (+assigned_pm for 'pm', +admin). A user whose global_role matches but membership role doesn't (or vice-versa) gets button-shows/RPC-rejects or button-hidden/RPC-would-accept. P1.
  BW-06 EditRoleModal role picker (src/pages/AdminUsers.tsx:249) lists only admin/pm/main_contractor/subcontractor/subcontractor_worker/owner — CANNOT set safety_officer or general_foreman, even though active_role_holders(project,'safety_officer') gates PTW sign-off and can_manage_project_progress requires global_role=general_foreman. Admin cannot create the very roles PTW + structure depend on through the UI. NOTE: 'safety' offered there is a main_contractor SUB-role, NOT global_role safety_officer — they are not interchangeable for PTW. P0.
  BW-07 Contacts: ContactsContext.canManage incl. general_foreman but contacts RLS (v11) restricts write to global_role IN (admin,pm) → GF sees add/edit/delete, server rejects. P1.
  BW-08 Daily-log: general_foreman read-only per RLS (dailies_insert = global_role main_contractor + sub_role foreman/engineer), but the role brief claims GF "writes daily logs" — confirm product intent; today GF correctly sees the amber read-only banner. P2 (doc vs intent).
  BW-09 WORKER ASSIGNMENT GAP (P0): AssignmentModal (src/components/AssignmentModal.tsx:40-41) only offers candidates with membership role main_contractor (負責人) and subcontractor (委派判頭). There is NO option to assign a subcontractor_worker. So a worker's stated core job — "update items my 判頭/主任 assigned me" — is unreachable via any in-app supervisor action; only a DB-level assignment unlocks it. The whole worker happy-path depends on fixing this.
  BW-10 Admin-approves-blind: PendingApprovalCard fetches applicant name/phone via a direct user_profiles SELECT; under v17 narrowed SELECT policy an admin who shares no project with a brand-new applicant doesn't match → card shows 載入中…/? forever. P1.