-- =============================================================
-- v27-progress-rights-by-membership.sql
-- =============================================================
-- BUG (BW-01): structural progress rights (add/delete 大項/中項/細項) and the
-- full-tree VIEW were gated on the user's GLOBAL role
-- (user_profiles.global_role in ('pm','general_foreman')), not on their
-- PER-PROJECT membership role. So a user who is a project's PM *by membership*
-- but whose account global_role is e.g. main_contractor could NOT add 大項
-- (v15 can_manage rejected) even though they could submit an SI (v3 accepted).
-- Confirmed on prod: member 60282222 (global main_contractor, member_role pm,
-- approved) → can_manage = false.
--
-- FIX: a project's edit/supervisor rights are defined by the PER-PROJECT
-- membership role, NOT the global account role. Unify both server gates:
--   manage (INSERT/DELETE 大項/中項/細項) AND full-tree visibility =
--     admin OR assigned PM (projects.assigned_pm_ids)
--     OR approved member whose membership role ∈ ('pm','general_foreman','main_contractor').
-- get_visible_progress_items now reuses can_manage_project_progress for the
-- supervisor branch so a membership-supervisor can both build AND see the tree
-- (previously could diverge). Contributors (subcontractor / worker / owner)
-- still see only assigned/delegated rows + ancestors.
--
-- Backwards compatible: replaces two SECURITY DEFINER functions only; no schema
-- or policy-name change (the "Managers can insert/delete" policies keep calling
-- can_manage_project_progress).
-- =============================================================

create or replace function can_manage_project_progress(p_user_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members pm
      where pm.user_id = p_user_id
        and pm.project_id = p_project_id
        and pm.status = 'approved'
        and pm.role in ('pm', 'general_foreman', 'main_contractor')
    );
$$;

create or replace function get_visible_progress_items(p_project_id uuid)
returns setof progress_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Supervisor (admin / assigned PM / approved member with a supervisor
  -- membership role) sees the full tree. Mirrors can_manage_project_progress
  -- so whoever can BUILD structure can also SEE it.
  if can_manage_project_progress(v_uid, p_project_id) then
    return query select * from progress_items where project_id = p_project_id;
    return;
  end if;

  -- Otherwise must be an approved member to see anything at all.
  if not exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = v_uid and status = 'approved'
  ) then
    return;
  end if;

  -- Contributor: only items assigned/delegated to them, plus the ancestor
  -- chain so the tree renders around them.
  return query
    with recursive chain as (
      select id, parent_id from progress_items
      where project_id = p_project_id
        and (v_uid = any (assigned_to) or v_uid = any (delegated_to))
      union
      select p.id, p.parent_id from progress_items p
      join chain c on p.id = c.parent_id
      where p.project_id = p_project_id
    )
    select pi.* from progress_items pi where pi.id in (select id from chain);
end;
$$;

revoke all on function can_manage_project_progress(uuid, uuid) from public;
revoke all on function get_visible_progress_items(uuid) from public;
grant execute on function can_manage_project_progress(uuid, uuid) to authenticated;
grant execute on function get_visible_progress_items(uuid) to authenticated;
