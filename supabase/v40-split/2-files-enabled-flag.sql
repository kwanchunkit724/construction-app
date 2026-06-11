-- =============================================================
-- v40-split/2-files-enabled-flag.sql — feature flag (§1.4)
-- =============================================================
-- Clone of v10-split/7-ptw-enabled-rpcs.sql over a new
-- app_config.files_enabled column. app_config is a single-row table
-- (id=1, created in v5-split/1-base.sql) with RLS deny-all, so two
-- SECURITY DEFINER RPCs expose exactly the flag:
--   get_files_enabled() — any authenticated user. Returns boolean.
--   set_files_enabled(p_enabled boolean) — admin only. Updates flag.
-- Ships false → 文件 surface stays hidden until flipped server-side
-- after App Store approval (PTW precedent; spec §4.4).
-- =============================================================

-- Ensure the single config row exists (idempotent; already seeded in v5).
insert into app_config (id) values (1) on conflict (id) do nothing;

alter table app_config add column if not exists files_enabled boolean not null default false;

drop function if exists get_files_enabled();
drop function if exists set_files_enabled(boolean);

create or replace function get_files_enabled()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(files_enabled, false) from app_config where id = 1;
$$;
revoke all on function get_files_enabled() from public;
grant execute on function get_files_enabled() to authenticated;

create or replace function set_files_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if not exists (select 1 from user_profiles where id = v_uid and global_role = 'admin') then
    raise exception '只有系統管理員可以切換文件功能';
  end if;
  update app_config set files_enabled = p_enabled where id = 1;
  return p_enabled;
end;
$$;
revoke all on function set_files_enabled(boolean) from public;
grant execute on function set_files_enabled(boolean) to authenticated;

-- =============================================================
-- End of v40-split/2-files-enabled-flag.sql
-- =============================================================
