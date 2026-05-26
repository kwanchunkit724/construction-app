-- =============================================================
-- v12-admin-bypass-v11-tables.sql
-- =============================================================
-- Hotfix for the v11 RLS introduced by:
--   v11-dailies-schema.sql
--   v11-materials-schema.sql
--   v11-events-schema.sql
--   v11-contacts-schema.sql
--
-- Every one of those policies gated SELECT/INSERT/UPDATE/DELETE on
-- an approved project_members row. Admin users in this codebase are
-- system-wide and don't carry per-project membership rows, so the
-- live admin (phone 91234567, etc.) hit "new row violates row-level
-- security policy" on Contact insert and got blank lists everywhere.
--
-- Fix: introduce public.user_is_admin() helper (SECURITY DEFINER) and
-- replace each policy with an "admin bypass OR original membership
-- check" form. Same admin escape hatch the rest of the codebase
-- already uses elsewhere (Si/Vo/Drawings).
-- =============================================================

create or replace function user_is_admin()
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  );
$$;

revoke all on function user_is_admin() from public;
grant execute on function user_is_admin() to authenticated;

-- ── DAILIES ──────────────────────────────────────────────────
drop policy if exists dailies_select on dailies;
create policy dailies_select on dailies for select
  using (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert
  with check (
    user_id = auth.uid()
    and (
      user_is_admin()
      or (
        exists (
          select 1 from user_profiles up
          where up.id = auth.uid()
            and up.global_role = 'main_contractor'
            and up.sub_role in ('foreman','engineer')
        )
        and exists (
          select 1 from project_members pm
          where pm.project_id = dailies.project_id
            and pm.user_id = auth.uid()
            and pm.status = 'approved'
        )
      )
    )
  );

drop policy if exists dailies_update on dailies;
create policy dailies_update on dailies for update
  using (
    (user_id = auth.uid() and date = (now() at time zone 'Asia/Hong_Kong')::date)
    or user_is_admin()
  )
  with check (
    (user_id = auth.uid() and date = (now() at time zone 'Asia/Hong_Kong')::date)
    or user_is_admin()
  );

drop policy if exists dailies_delete on dailies;
create policy dailies_delete on dailies for delete
  using (
    (user_id = auth.uid() and date = (now() at time zone 'Asia/Hong_Kong')::date)
    or user_is_admin()
  );

-- ── MATERIALS ────────────────────────────────────────────────
drop policy if exists materials_select on materials;
create policy materials_select on materials for select
  using (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists materials_insert on materials;
create policy materials_insert on materials for insert
  with check (
    requested_by = auth.uid()
    and (
      user_is_admin()
      or exists (
        select 1 from project_members pm
        join user_profiles up on up.id = pm.user_id
        where pm.project_id = materials.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and up.global_role in ('admin','pm','main_contractor','subcontractor')
      )
    )
  );

drop policy if exists materials_update on materials;
create policy materials_update on materials for update
  using (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
  )
  with check (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
  );

drop policy if exists materials_delete on materials;
create policy materials_delete on materials for delete
  using (
    user_is_admin()
    or requested_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  );

-- ── EVENTS ───────────────────────────────────────────────────
drop policy if exists events_select on events;
create policy events_select on events for select
  using (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      where pm.project_id = events.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists events_insert on events;
create policy events_insert on events for insert
  with check (
    created_by = auth.uid()
    and (
      user_is_admin()
      or exists (
        select 1 from project_members pm
        join user_profiles up on up.id = pm.user_id
        where pm.project_id = events.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and up.global_role in ('admin','pm','main_contractor')
      )
    )
  );

drop policy if exists events_update on events;
create policy events_update on events for update
  using (
    user_is_admin()
    or created_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  );

drop policy if exists events_delete on events;
create policy events_delete on events for delete
  using (
    user_is_admin()
    or created_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  );

-- ── CONTACTS ─────────────────────────────────────────────────
drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select
  using (
    user_is_admin()
    or exists (
      select 1 from project_members pm
      where pm.project_id = contacts.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
    and (
      user_is_admin()
      or exists (
        select 1 from project_members pm
        where pm.project_id = contacts.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
      )
    )
  );

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts for update
  using (
    user_is_admin()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  )
  with check (
    user_is_admin()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  );

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts for delete
  using (
    user_is_admin()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'pm')
  );
