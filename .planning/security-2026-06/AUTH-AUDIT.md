# AUTH-AUDIT — Account-Takeover Exposure

**Scope:** Identity + authorization model. Question answered: *what damage can someone do with ONLY a stolen phone + password?*
**Verdict:** A single stolen credential = full, irreversible control of everything that account can touch. There is **no second factor, no re-auth, no step-up, no device binding** anywhere in the system. The password is not just login — it **is** the signing authority for SI / VO / PTW approvals, membership/role grants, progress, documents, and account deletion.

---

## 1. Current auth model

| Aspect | Implementation | Cite |
|---|---|---|
| Credential | Phone + password only. Synthetic email `${digits}@phone.local` lets Supabase email/password auth back a phone-only UX. | `src/lib/phone.ts:11-13`; `src/contexts/AuthContext.tsx:153-158` |
| Password strength | **Minimum 6 characters**, no complexity/breach checks. | `src/pages/Signup.tsx:37` |
| Sign-in | `supabase.auth.signInWithPassword({ email, password })`; generic error to avoid enumeration. | `src/contexts/AuthContext.tsx:155-156` |
| Session | `persistSession: true`, `autoRefreshToken: true`. Native = `localStorage` (`ckcon-auth-native-v1`), survives app restarts indefinitely; web = per-tab `sessionStorage`. Refresh token auto-rotates → effectively unbounded lifetime until explicit sign-out. | `src/lib/supabase.ts:107-125` |
| Token lifetime | Default Supabase GoTrue (1h JWT + long-lived refresh). No short-TTL / no idle timeout configured. | `src/lib/supabase.ts:118-125` |
| Re-auth / step-up / MFA | **None.** No `reauthenticate`, no OTP, no password re-prompt, no `mfa` in the entire `src/` tree. Only `auth.getUser()` appears (read), never a re-verify before a sensitive write. | grep `src/` — only `signInWithPassword`, no `reauthenticate`/`verifyOtp`/`mfa` |
| Device binding | None. OneSignal `external_user_id` is for push only, not an auth factor. | `src/lib/push.ts` (push only) |
| Authorization model | **Two-place gating.** (a) Client: `ProtectedRoute` checks session + `global_role==='admin'` only; (b) DB: Postgres RLS + `SECURITY DEFINER` RPCs are the real boundary. | `src/components/ProtectedRoute.tsx:10-15` |
| Role source | `user_profiles.global_role` / `sub_role`; project rights via `projects.assigned_pm_ids` and approved `project_members.role`. | `supabase/v15…`, `supabase/v9-rls-helpers.sql:24-58` |
| Self-promotion (historic) | A pre-v17 hole let any user PATCH `global_role='admin'`. Now blocked by a BEFORE-UPDATE trigger that reverts `global_role/sub_role/phone/id` unless caller is admin. | `supabase/v17-user-profiles-rls-hardening.sql:34-77` |

**Trust collapse:** every server-side check below reduces to `auth.uid()` derived from the session JWT. Whoever holds the password holds the JWT holds the authority. No action re-verifies the human.

---

## 2. Sensitive / irreversible actions — who can do it, what auth it demands

> "Auth demanded" = what the *server* requires beyond a valid logged-in session. In every row the answer is **"active session + role/membership — nothing re-verifies the human."**

| Action | Who can do it (server-enforced) | Auth demanded beyond active session | Reversible? | Cite |
|---|---|---|---|---|
| **Approve / reject / request-revision on SI** | active_role_holder for current chain step (default `main_contractor`→`pm`), or admin | Session + role membership. No re-auth. | reject/lock terminal | `supabase/v9-rpc-submit-approval.sql:73-102,138-142`; chain `v9-default-chain-seed.sql:105-109` |
| **Approve / reject VO (HKD money)** | active_role_holder for step (`main_contractor`→`pm`→`owner`), or admin | Session + role. No re-auth, **no $ threshold step-up.** | terminal once locked | `submit_approval` same RPC; chain `v9-default-chain-seed.sql:111-116` |
| **approve_with_edits (rewrite the doc you're approving)** | same as above; writes a new `si_versions`/`vo_versions` row server-side as definer | Session + role + reason≥10 chars | version is permanent | `v9-rpc-submit-approval.sql:107-136` |
| **admin_override on any in-flight approval** | global admin only | Session + `global_role='admin'` | terminal | `v9-rpc-submit-approval.sql:73-74` |
| **PTW (動火證/工作許可證) sign-off** | active_role_holder for step (default `safety_officer`→`main_contractor`), or admin | Session + role; signature blob ≥100 chars (not a credential) | safety record, irreversible | `submit_approval` (+ptw) ; `v10-split/4-record-ptw-signoff-rpc.sql:26-49` |
| **Assign safety_officer role (`pm_assign_safety_officer`)** | assigned PM of project, or admin | Session + assigned-PM/admin. **No re-auth.** Staffs the PTW signer. | role flip, manual undo | `v37-ptw-safety-officer-staffing.sql:141-178` |
| **Edit approval chain (`save_chain_steps`)** | assigned PM of project, or admin | Session + assigned-PM/admin | overwrites chain config | `v9-default-chain-seed.sql:43-92` |
| **Approve / reject project membership** | assigned PM (any role) / approved subcontractor (worker rows only) / admin | Session + role. **RLS has `using` but NO `with check`** → approver can set arbitrary `role`/`status`. | grants standing access | `v2-fix-rls-recursion.sql:78-91`; `v2-schema.sql:142-160` |
| **Change a user's global_role/sub_role (`admin_update_user_role`)** | global admin only | Session + admin | role flip | `v17-…:188-213` |
| **List applicant PII (`admin_or_pm_list_applicants`)** | admin / assigned PM / approved subcontractor | Session + role | read of name/phone/company | `v33-applicant-rpc-ambiguous-id-fix.sql:35-65` |
| **Review document version (approve/reject)** | `can_review_document` on project; self-review blocked unless admin | Session + role; reject needs note | status permanent | `v40-split/4-rpcs.sql:234-308` |
| **Supersede document version** | `can_upload_document` (+`can_upload_drawing` for drawings) | Session + upload right; `submitted_by` forced to caller | prior versions marked superseded | `v40-split/4-rpcs.sql:163-225` |
| **Withdraw document version** | uploader or admin | Session + (uploader OR admin) | rebinds current pointer | `v40-split/4-rpcs.sql:323-387` |
| **Create / delete progress items (大項/細項)** | admin / assigned PM / approved `pm`|`general_foreman` | Session + role | delete is hard delete | `v15-progress-edit-rights-split.sql:22-37,61-68` |
| **Update progress %** | manager (above) OR assigned_to/delegated_to of the row | Session + assignment | overwrite | `v15-…:39-82` |
| **Delete own account (`delete_my_account`)** | the authenticated user | Session only; blocked only if `in_flight_approvals>0`. **No password re-prompt.** | **hard delete of auth.users + cascade — irreversible** | `v6-account-deletion.sql:42-59`; `v9-account-deletion-extend.sql:23-61` |

---

## 3. Concrete account-takeover weaknesses

1. **Single factor, weak floor.** Password ≥6 chars (`Signup.tsx:37`), no breach/complexity check, no MFA, no OTP, no device binding. A stuffed/phished/shoulder-surfed password is the *entire* defense. HK phone numbers are 8 digits starting 5/6/7/9 (`phone.ts:20-23`) — the username half is low-entropy and effectively public.

2. **Password == signing authority.** The same secret that logs you in also approves SIs, signs PTW/動火證 permits, approves VOs in HKD, and grants project access. There is **zero separation** between "I am logged in" and "I authorize this irreversible/financial/safety action." Every RPC authorizes off `auth.uid()` alone (`v9-rpc-submit-approval.sql:29,42`; `record_ptw_signoff` `:22`).

3. **No step-up / re-auth for high-risk actions.** Nothing in `src/` calls `reauthenticate`, re-prompts for password, or requires a fresh OTP before approvals, role changes, chain edits, or account deletion. `delete_my_account` (`v6…:42-59`) wipes the auth user with cascade on a bare session — a thief can destroy the victim's account and audit identity outright.

4. **Indefinite session on native.** Native session persists in `localStorage` with auto-refresh (`supabase.ts:110-125`); a stolen unlocked device or exported token grants standing access with no idle timeout and no re-auth checkpoint to trip on.

5. **RLS gap — membership approvers can mint arbitrary roles.** `"PM approves memberships"` and `"Subcontractor approves workers"` are `for update … using(...)` with **no `with check`** (`v2-fix-rls-recursion.sql:78-91`). A thief on a PM account can UPDATE a `project_members` row's `role`/`status` to any value (e.g. flip a pending worker to `main_contractor` or `safety_officer`), planting a confederate as a chain signer. (The dedicated `pm_assign_safety_officer` RPC exists precisely because direct member writes were meant to be constrained — but the raw UPDATE path is still open.)

6. **PM is a wide blast radius.** With a PM session a thief can: edit the approval chain (`save_chain_steps`), staff a safety_officer (`pm_assign_safety_officer`), approve memberships, read applicant PII (`admin_or_pm_list_applicants`), and stand as the `pm` step holder on every SI/VO/PTW in their projects (`active_role_holders` returns assigned PMs for `required_role='pm'`, `v9-rls-helpers.sql:38-42`). One PM credential ≈ control of a site's entire approval and access graph.

7. **Generic positives, but no rate-limit/lockout visible.** Sign-in errors are deliberately generic (`AuthContext.tsx:156`) — good for enumeration resistance, but there is no app-side lockout/throttle on repeated password attempts (relies entirely on GoTrue defaults, not configured here), so online guessing against a known phone number is unmitigated in-repo.

---

## 4. What a thief with the password can do TODAY

Assume the stolen account is an approved **PM** (worst common case; a `main_contractor`/`safety_officer`/`owner` thief gets the corresponding subset):

- **Approve or reject any in-flight SI** at the `pm` step, and **approve_with_edits** to silently rewrite the instruction text before locking it (`v9-rpc-submit-approval.sql:107-136`).
- **Approve VOs (real HKD variation orders)** at the `pm` step — money decisions with no $-threshold step-up (`v9-default-chain-seed.sql:111-116`).
- **Sign off PTW / 動火證 permits** where PM/holder is on the chain, creating a binding safety record under the victim's name (`record_ptw_signoff`).
- **Rewrite the approval chain** for SI/VO/PTW via `save_chain_steps` — e.g. delete the `main_contractor` step or pin every step to themselves (`v9-default-chain-seed.sql:43-92`).
- **Staff a colluder as `safety_officer`** (`pm_assign_safety_officer`) and/or **flip a pending member's role/status arbitrarily** via the `with check`-less membership UPDATE policy — installing their own chain signers.
- **Approve / reject project-join applications** and **read applicant PII** (name + phone + company) for the project (`admin_or_pm_list_applicants`).
- **Approve/reject/supersede/withdraw document versions** (drawings, method statements, material submissions) — overwriting the controlled record set (`v40-split/4-rpcs.sql`).
- **Create, edit, or hard-delete progress items** for managed projects, corrupting the shared progress truth (`v15-progress-edit-rights-split.sql`).
- **Permanently delete the victim's account** (cascade) once no approval is in flight — no password re-prompt (`delete_my_account`).
- If the stolen account is **admin**: all of the above on every project, plus `admin_override` on any approval, `admin_update_user_role` to mint more admins, and full-table user PII reads — total system takeover from one credential.

What the thief **cannot** trivially do: read PII of users they share no project with (v17 SELECT narrowing), self-promote `global_role` via direct PATCH (v17 trigger), or insert approvals directly (RLS `with check(false)`, only via the RPC gate). These close the *old* holes but do nothing against a thief who simply **uses the legitimately-authorized session** the password unlocks.

---

## Bottom line

The DB-side authorization (RLS + definer RPCs) is reasonably tight *per role* and several historic holes (v17 self-promotion, direct approval insert) are closed. But the whole model assumes **the session = the person**. With no MFA, no re-auth/step-up on irreversible or financial actions, no device binding, a 6-char password floor, and indefinitely-persisted native sessions, a single stolen phone+password yields the account's **full signing, approval, access-granting, and account-destroying authority** with nothing standing in the way. The one outstanding RLS defect (membership UPDATE with no `with check`) additionally lets a compromised PM/subcontractor mint arbitrary roles.
