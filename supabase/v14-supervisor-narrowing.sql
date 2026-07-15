-- =============================================================
-- v14-supervisor-narrowing.sql
-- =============================================================
-- Tightens get_visible_progress_items: only admin / pm /
-- general_foreman count as supervisors (full project view).
-- main_contractor (with its foreman / engineer sub_roles),
-- subcontractor (判頭), subcontractor_worker, owner, and
-- safety_officer now fall through to the assigned + ancestor
-- chain branch — they only see the items they're explicitly
-- assigned or delegated to, plus the ancestor chain so the
-- progress tree can still render around them.
-- =============================================================

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
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select global_role into v_global_role from user_profiles where id = v_uid;

  if v_global_role = 'admin' then
    return query select * from progress_items where project_id = p_project_id;
    return;
  end if;

  if not exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = v_uid and status = 'approved'
  ) then
    return;
  end if;

  if v_global_role in ('pm','general_foreman') then
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
