-- =============================================================
-- v48-onboarding-greencard-push.sql
-- =============================================================
-- Backlog S20 (平安咭 on the person, surfaced to approvers) and S21 (push on
-- a NEW pending application — INSERT was previously silent; only UPDATE
-- pushed, v5-split/5). Additive nullable columns on user_profiles (no
-- destructive change — account-deletion cascade unaffected, no new FK).
-- ⚠ admin_or_pm_list_applicants has broken twice in prod (v31→v33→v35) on
--   42702 — RETURN TYPE CHANGES here, so DROP then CREATE, qualify EVERY
--   column, and VERIFY BY EXECUTION immediately after apply.
-- =============================================================

-- 1. S20: green card on the PERSON (valid across sites) — additive nullable.
alter table user_profiles add column if not exists green_card_no text;
alter table user_profiles add column if not exists green_card_expiry date;

-- 2. S20: extend the applicant RPC return columns. Return-type change ⇒ DROP
--    then CREATE (create-or-replace cannot change return type). Body = v35
--    FIX-1 verbatim with the SELECT list extended by the two green-card cols.
--    Every column qualified up./me./p./m. (42702 — twice burned here).
drop function if exists admin_or_pm_list_applicants(uuid);
create function admin_or_pm_list_applicants(p_project_id uuid)
returns table (id uuid, name text, phone text, company text,
               green_card_no text, green_card_expiry date)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  is_privileged boolean;
  is_sub_approver boolean;
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

  select exists (
    select 1 from project_members me
    where me.project_id = p_project_id
      and me.user_id = auth.uid()
      and me.role = 'subcontractor'
      and me.status = 'approved'
  ) into is_sub_approver;

  if not (is_privileged or is_sub_approver) then
    return;
  end if;

  return query
    select up.id, up.name, up.phone, up.company,
           up.green_card_no, up.green_card_expiry
    from project_members m
    join user_profiles up on up.id = m.user_id
    where m.project_id = p_project_id
      and m.status = 'pending'
      and (is_privileged or m.role = 'subcontractor_worker');
end;
$$;
grant execute on function admin_or_pm_list_applicants(uuid) to authenticated;

-- 3. S21: push on NEW pending application (INSERT trigger; v5-split style;
--    reuses send_push_to_users verbatim). Recipients mirror the client
--    pendingForMe gate: assigned PMs, plus approved 判頭 only for worker
--    applications. Admins excluded (they see everything — push budget).
--    One push per application — negligible.
create or replace function trg_membership_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project_name text; v_applicant text; v_targets uuid[];
begin
  if new.status <> 'pending' then return new; end if;   -- admin-seeded approved rows: silent
  select p.name into v_project_name from projects p where p.id = new.project_id;
  select up.name into v_applicant from user_profiles up where up.id = new.user_id;
  select array_agg(distinct uid) into v_targets from (
    select unnest(p.assigned_pm_ids) as uid from projects p where p.id = new.project_id
    union
    select pm.user_id from project_members pm           -- 判頭 approve their workers
     where pm.project_id = new.project_id and pm.status = 'approved'
       and pm.role = 'subcontractor' and new.role = 'subcontractor_worker'
  ) t where uid is not null and uid is distinct from new.user_id;
  perform send_push_to_users(
    v_targets,
    '👷 新成員申請',
    coalesce(v_applicant,'有人') || ' 申請加入「' || coalesce(v_project_name,'工地') || '」',
    '/projects');
  return new;
end; $$;
drop trigger if exists on_membership_created on project_members;
create trigger on_membership_created after insert on project_members
  for each row execute function trg_membership_created();

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- admin_or_pm_list_applicants as assigned PM via REST -> rows include the
--   --   two new fields, NO 42702; as a plain worker -> []. (v35 lesson:
--   --   this exact function shipped broken twice — verify by EXECUTION.)
--   -- self-update green_card_no via REST as the user -> 204; as a different
--   --   user -> denied. (confirm a self-UPDATE policy covers arbitrary own
--   --   columns — push.ts already self-updates onesignal_id; if column-scoped,
--   --   add a self-update policy for the two new columns.)
--   -- insert a pending worker membership -> assigned PM AND approved 判頭 get
--   --   push; insert an approved row directly -> NO push.
--   -- account deletion (v6/v20) still cascades — new cols deleted with the row.
-- =============================================================
