-- =============================================================
-- v50-membership-role-escalation-guard.sql  (Security upgrade Phase 0)
-- =============================================================
-- FIX a live defect found in the 2026-06 security audit
-- (.planning/security-2026-06/AUTH-AUDIT.md §3.5, PLAN-CRITIQUE.md C-verified):
-- the project_members UPDATE policies "PM approves memberships" and
-- "Subcontractor approves workers" (v2-fix-rls-recursion.sql:79-91) are
-- `for update USING(...)` with NO `WITH CHECK`. A compromised PM / 判頭 session
-- can therefore raw-PATCH a project_members row's `role` (and user_id/project_id)
-- to any value — e.g. flip a pending worker to main_contractor or safety_officer,
-- planting their own approval-chain signer. The dedicated pm_assign_safety_officer
-- RPC exists precisely to constrain role writes, but the raw UPDATE path was open.
--
-- A WITH CHECK clause cannot fix this (it sees only NEW, can't compare to OLD).
-- The correct mechanism is a BEFORE UPDATE guard trigger (mirrors the v17
-- user_profiles write-gate): for a non-admin caller it PINS role/user_id/
-- project_id to their OLD values, so only status / approved_by / approved_at can
-- change. Legitimate approval (status flip) is unaffected. The sanctioned
-- pm_assign_safety_officer RPC opts through via a transaction-local flag that a
-- raw PATCH cannot set. Idempotent.
-- =============================================================

create or replace function enforce_member_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  -- Service role (no JWT) bypass — SECURITY DEFINER RPCs / admin tooling.
  if auth.uid() is null then
    return new;
  end if;

  select (up.global_role = 'admin') into is_admin
  from user_profiles up
  where up.id = auth.uid();
  if is_admin then
    return new;
  end if;

  -- Sanctioned RPCs (e.g. pm_assign_safety_officer) set this txn-local flag
  -- right before their UPDATE. A raw client PATCH cannot set it.
  if coalesce(current_setting('app.member_role_change', true), 'off') = 'on' then
    return new;
  end if;

  -- Non-admin, non-sanctioned: pin identity/role columns to their OLD values.
  -- Only status / approved_by / approved_at may change (the approval action).
  if new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if new.user_id is distinct from old.user_id then
    new.user_id := old.user_id;
  end if;
  if new.project_id is distinct from old.project_id then
    new.project_id := old.project_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_member_write_gate on project_members;
create trigger trg_enforce_member_write_gate
  before update on project_members
  for each row execute function enforce_member_write_gate();

-- Re-create pm_assign_safety_officer (v37 body VERBATIM) with the opt-through
-- flag set immediately before its UPDATE, so the legitimate role change passes
-- the guard while raw PATCHes do not. Same signature -> plain create or replace.
create or replace function pm_assign_safety_officer(p_project_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  is_privileged boolean;
begin
  select (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid() and up.global_role = 'admin'
    )
    or exists (
      select 1 from projects p
      where p.id = p_project_id and auth.uid() = any(p.assigned_pm_ids)
    )
  ) into is_privileged;

  if not is_privileged then
    raise exception '只有項目經理或管理員可委派安全主任';
  end if;

  if not exists (
    select 1 from project_members m
    where m.project_id = p_project_id
      and m.user_id = p_user_id
      and m.status = 'approved'
  ) then
    raise exception '該用戶並非此項目已批准成員';
  end if;

  -- Opt through the role-escalation guard for this one sanctioned write.
  perform set_config('app.member_role_change', 'on', true);

  update project_members
     set role = 'safety_officer'
   where project_id = p_project_id
     and user_id = p_user_id;
end;
$$;
grant execute on function pm_assign_safety_officer(uuid, uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- as a PM (assigned), raw PATCH a pending worker's role -> role UNCHANGED
--   --   (guard reverts); status change to 'approved' -> still works.
--   -- pm_assign_safety_officer as that PM on an approved member -> role becomes
--   --   safety_officer (flag opt-through works).
--   -- admin raw PATCH role -> allowed (admin bypass).
-- =============================================================
