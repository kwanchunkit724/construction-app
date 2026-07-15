-- =============================================================
-- v11-progress-visibility.sql
-- =============================================================
-- Role-aware progress-item visibility for v1.2.
--
-- The existing RLS on progress_items still lets every approved
-- project member SELECT every row, which is fine for the
-- supervisor roles (admin / pm / main_contractor) but feels too
-- noisy for subcontractor / worker / owner. They should see only
-- their assigned/delegated items plus the parent chain needed to
-- render the tree.
--
-- Implementation: leave the broad RLS in place (other features
-- like drawing version-pin and SI references still rely on it)
-- and provide a SECURITY DEFINER RPC the client uses for the
-- ProgressContext list view. The RPC returns the supervisor's
-- full set or the contributor's assigned-plus-ancestors set.
-- =============================================================

create or replace function get_visible_progress_items(p_project_id uuid)
returns setof progress_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_supervisor boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Membership gate — non-members get an empty set, never an error,
  -- so a transient stale-cache call from a removed user doesn't blow
  -- up the screen.
  if not exists (
    select 1 from project_members
    where project_id = p_project_id
      and user_id = v_uid
      and status = 'approved'
  ) then
    return;
  end if;

  select exists (
    select 1 from user_profiles
    where id = v_uid
      and global_role in ('admin','pm','main_contractor')
  ) into v_is_supervisor;

  if v_is_supervisor then
    return query
      select * from progress_items where project_id = p_project_id;
    return;
  end if;

  -- Contributor (subcontractor / worker / owner / safety_officer):
  -- walk UP the parent chain starting from the items they own so
  -- the tree renders with the right intermediate folders.
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

comment on function get_visible_progress_items(uuid) is
'v1.2 visibility filter — supervisors see all items in the project; contributors see their assigned/delegated items plus the ancestor chain.';
