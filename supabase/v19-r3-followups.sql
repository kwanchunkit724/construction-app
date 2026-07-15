-- ============================================================
-- v19-r3-followups.sql
-- ============================================================
-- Persona-sim Round 3 surfaced two extra holes against the
-- v17 + v18 hardening pass:
--
--   1. (何判頭) user_profiles.company was still self-editable.
--      Subcontractor changed own company to "黑客集團" via REST.
--      Attack vector: dispute screenshots showing fake company
--      identity ("中華電力", "信和置業"). Trigger now also reverts
--      company on non-admin writes.
--
--   2. (王老總) events_insert policy allowlist was
--      admin/pm/main_contractor — missing general_foreman.
--      Supervisor 老總 could read events but not create them,
--      inconsistent with can_manage_project_progress which DOES
--      include general_foreman. Added to allowlist.
-- ============================================================

-- 1. Lock company in user_profiles write gate -----------------

create or replace function enforce_user_profile_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  select (global_role = 'admin') into is_admin
  from user_profiles
  where user_profiles.id = auth.uid();
  if is_admin then
    return new;
  end if;
  if new.global_role is distinct from old.global_role then
    new.global_role := old.global_role;
  end if;
  if new.sub_role is distinct from old.sub_role then
    new.sub_role := old.sub_role;
  end if;
  if new.phone is distinct from old.phone then
    new.phone := old.phone;
  end if;
  if new.id is distinct from old.id then
    new.id := old.id;
  end if;
  if new.company is distinct from old.company then
    new.company := old.company;
  end if;
  return new;
end;
$$;

-- 2. Add general_foreman to events_insert allowlist -----------

drop policy if exists events_insert on events;
create policy events_insert on events for insert
  with check (
    (created_by = auth.uid())
    and (
      user_is_admin()
      or exists (
        select 1
        from project_members pm
        join user_profiles up on up.id = pm.user_id
        where pm.project_id = events.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and up.global_role = any (array[
            'admin','pm','main_contractor','general_foreman'
          ])
      )
    )
  );
