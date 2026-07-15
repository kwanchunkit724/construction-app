-- =============================================================
-- v12-progress-visibility-admin-bypass.sql
-- =============================================================
-- Hotfix to v11-progress-visibility.sql.
--
-- Bug: the v11 RPC's first gate required every caller to be an
-- approved project_members row. Admin users in this codebase are
-- system-wide (no per-project membership row), so the gate
-- silently dropped every progress_items row from the admin's
-- view of every project — leaving the progress tree empty in the
-- UI even though direct SELECT under the existing broad RLS would
-- still see everything.
--
-- Fix: short-circuit on global_role='admin' BEFORE the membership
-- check. PM / main_contractor still need an approved membership
-- to count as supervisor; contributors still get assigned + chain.
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

  select global_role into v_global_role
  from user_profiles
  where id = v_uid;

  if v_global_role = 'admin' then
    return query
      select * from progress_items where project_id = p_project_id;
    return;
  end if;

  if not exists (
    select 1 from project_members
    where project_id = p_project_id
      and user_id = v_uid
      and status = 'approved'
  ) then
    return;
  end if;

  if v_global_role in ('pm','main_contractor') then
    return query
      select * from progress_items where project_id = p_project_id;
    return;
  end if;

  return query
    with recursive chain as (
      select id, parent_id
      from progress_items
      where project_id = p_project_id
        and (v_uid = any (assigned_to) or v_uid = any (delegated_to))

      union

      select p.id, p.parent_id
      from progress_items p
      join chain c on p.id = c.parent_id
      where p.project_id = p_project_id
    )
    select pi.*
    from progress_items pi
    where pi.id in (select id from chain);
end;
$$;

revoke all on function get_visible_progress_items(uuid) from public;
grant execute on function get_visible_progress_items(uuid) to authenticated;
