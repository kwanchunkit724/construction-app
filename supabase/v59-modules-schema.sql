-- =============================================================
-- v59-modules-schema.sql   (Module system — per-project module switches)
-- =============================================================
-- An admin can turn any of the 13 app modules OFF for a single project. The
-- contract:
--  * all-on default — ABSENCE of a row means the module is ENABLED. Only an
--    explicit row with enabled=false hides a surface. This keeps every live
--    project byte-identical (every module on) until an admin flips one.
--  * admin-only — only global_role='admin' may write project_modules (UI gate +
--    RLS + the set_project_module RPC all enforce this, defence in depth).
--  * per-project — the (project_id, module_key) pair is the unit of override.
--  * progress is the non-disableable core — set_project_module rejects it.
-- Additive; no change to existing tables. This migration ONLY creates
-- project_modules + its helpers; it does NOT touch any other table's RLS
-- (gating each module's reads/writes on project_module_enabled is Phase 2).
-- =============================================================

create table if not exists project_modules (
  project_id uuid not null references projects(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  updated_by uuid references user_profiles(id),
  updated_at timestamptz not null default now(),
  primary key (project_id, module_key)
);
alter table project_modules enable row level security;

-- members of a project may READ its module switches (so the UI can hide
-- disabled surfaces); only admins may write (insert/update/delete).
drop policy if exists project_modules_select on project_modules;
create policy project_modules_select on project_modules for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists project_modules_insert on project_modules;
create policy project_modules_insert on project_modules for insert to authenticated
  with check (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));
drop policy if exists project_modules_update on project_modules;
create policy project_modules_update on project_modules for update to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
  with check (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));
drop policy if exists project_modules_delete on project_modules;
create policy project_modules_delete on project_modules for delete to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));

-- Effective enabled state of one module for one project. Absence = enabled
-- (backwards-compat). security definer + stable so Phase-2 RLS policies on the
-- feature tables can call it cheaply without their own select privilege on
-- project_modules.
create or replace function public.project_module_enabled(p_project_id uuid, p_module_key text)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    (select enabled from project_modules where project_id = p_project_id and module_key = p_module_key),
    true
  );
$$;
grant execute on function public.project_module_enabled(uuid, text) to authenticated;

-- Member-facing read: returns EVERY catalogue key with its effective enabled
-- state for a project (left join the 13 keys to project_modules, coalesce true).
-- Drives the client ModulesContext + the admin toggle list.
create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key,
         coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- Admin-only write of a single switch. Rejects the non-disableable core
-- ('progress') and any non-admin caller. Upserts the override and stamps
-- updated_by = the acting admin.
create or replace function public.set_project_module(p_project_id uuid, p_module_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin') then
    raise exception 'only admins may set project modules';
  end if;
  if p_module_key = 'progress' then
    raise exception 'progress is the core module and cannot be disabled';
  end if;
  insert into project_modules (project_id, module_key, enabled, updated_by, updated_at)
  values (p_project_id, p_module_key, p_enabled, auth.uid(), now())
  on conflict (project_id, module_key)
  do update set enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now();
end;
$$;
grant execute on function public.set_project_module(uuid, text, boolean) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.project_modules') is not null;  -> t
--   -- every project reads all-on before any override:
--   select count(*) = 13 from get_project_modules('<some-project-id>'::uuid) where enabled;  -> t
--   -- absence = enabled:
--   select project_module_enabled('<some-project-id>'::uuid, 'materials');  -> t
--   -- admin can disable; coalesce now returns false for that key:
--   select set_project_module('<some-project-id>'::uuid, 'materials', false);  -> ok (as admin)
--   select project_module_enabled('<some-project-id>'::uuid, 'materials');  -> f
--   -- core is protected:
--   select set_project_module('<some-project-id>'::uuid, 'progress', false);  -> ERROR (core)
--   -- non-admin write is denied:
--   select set_project_module(...) as a member -> ERROR (only admins); direct insert -> RLS denied.
--   -- members can still READ their project's switches: select * from project_modules where project_id='<id>'.
-- =============================================================
