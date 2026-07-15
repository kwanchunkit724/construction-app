-- =============================================================
-- v13-general-foreman-role.sql
-- =============================================================
-- Add 'general_foreman' (老總) role at the same supervisor tier
-- as PM. Updates user_profiles + project_members CHECK constraints
-- and refreshes get_visible_progress_items so the new role lands
-- in the supervisor branch.
-- =============================================================

alter table user_profiles drop constraint if exists user_profiles_global_role_check;
alter table user_profiles add constraint user_profiles_global_role_check
  check (global_role = any (array[
    'admin'::text,
    'pm'::text,
    'main_contractor'::text,
    'subcontractor'::text,
    'subcontractor_worker'::text,
    'owner'::text,
    'safety_officer'::text,
    'general_foreman'::text
  ]));

alter table project_members drop constraint if exists project_members_role_check;
alter table project_members add constraint project_members_role_check
  check (role = any (array[
    'pm'::text,
    'main_contractor'::text,
    'subcontractor'::text,
    'subcontractor_worker'::text,
    'owner'::text,
    'safety_officer'::text,
    'general_foreman'::text
  ]));

create or replace function get_visible_progress_items(p_project_id uuid)
returns setof progress_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_global_role text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select global_role into v_global_role from user_profiles where id = v_uid;
  if v_global_role = 'admin' then
    return query select * from progress_items where project_id = p_project_id;
    return;
  end if;
  if not exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = v_uid and status = 'approved'
  ) then return; end if;
  if v_global_role in ('pm','main_contractor','general_foreman') then
    return query select * from progress_items where project_id = p_project_id;
    return;
  end if;
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
revoke all on function get_visible_progress_items(uuid) from public;
grant execute on function get_visible_progress_items(uuid) to authenticated;
