-- =============================================================
-- v15-progress-edit-rights-split.sql
-- =============================================================
-- Split the progress edit right into two server-side checks:
--
--   can_manage_project_progress(user_id, project_id)
--     Admin / assigned PM / approved member with global_role
--     in (pm, general_foreman). Gates INSERT and DELETE on
--     progress_items so contributors can no longer create 大項 /
--     細項 or delete rows.
--
--   can_update_progress_item(user_id, item_id)
--     can_manage above OR the row's assigned_to / delegated_to
--     contains the user. Gates UPDATE so foreman / engineer /
--     判頭 / worker keep ticking progress on their assigned
--     items only.
--
-- Replaces the broad "Editors can …" policies installed by an
-- earlier migration with the two new policies below.
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
      join user_profiles up on up.id = pm.user_id
      where pm.user_id = p_user_id
        and pm.project_id = p_project_id
        and pm.status = 'approved'
        and up.global_role in ('pm', 'general_foreman')
    );
$$;

create or replace function can_update_progress_item(p_user_id uuid, p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (
      select 1 from progress_items pi
      where pi.id = p_item_id
        and (
          can_manage_project_progress(p_user_id, pi.project_id)
          or p_user_id = any(pi.assigned_to)
          or p_user_id = any(pi.delegated_to)
        )
    );
$$;

revoke all on function can_manage_project_progress(uuid, uuid) from public;
revoke all on function can_update_progress_item(uuid, uuid) from public;
grant execute on function can_manage_project_progress(uuid, uuid) to authenticated;
grant execute on function can_update_progress_item(uuid, uuid) to authenticated;

drop policy if exists "Editors can insert progress items" on progress_items;
create policy "Managers can insert progress items"
  on progress_items for insert
  with check (can_manage_project_progress(auth.uid(), project_id));

drop policy if exists "Editors can delete progress items" on progress_items;
create policy "Managers can delete progress items"
  on progress_items for delete
  using (can_manage_project_progress(auth.uid(), project_id));

drop policy if exists "Editors can update progress items" on progress_items;
create policy "Assignees or managers can update progress items"
  on progress_items for update
  using (
    can_manage_project_progress(auth.uid(), project_id)
    or auth.uid() = any(assigned_to)
    or auth.uid() = any(delegated_to)
  )
  with check (
    can_manage_project_progress(auth.uid(), project_id)
    or auth.uid() = any(assigned_to)
    or auth.uid() = any(delegated_to)
  );
