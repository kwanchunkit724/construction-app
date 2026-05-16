-- =============================================================
-- v10-split/7-ptw-enabled-rpcs.sql — v1.1 follow-on
-- =============================================================
-- app_config has RLS "deny all" (private table, Phase 2 Plan 02-01).
-- Authenticated users need to READ the ptw_enabled flag to know
-- whether to show PTW surface. Admins need to TOGGLE it.
--
-- Two SECURITY DEFINER RPCs:
--   get_ptw_enabled() — any authenticated user. Returns boolean.
--   set_ptw_enabled(p_enabled boolean) — admin only. Updates flag.
--
-- Other app_config columns (ptw_qr_secret, onesignal_*) stay private.
-- =============================================================

drop function if exists get_ptw_enabled();
drop function if exists set_ptw_enabled(boolean);

create or replace function get_ptw_enabled()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(ptw_enabled, false) from app_config where id = 1;
$$;
revoke all on function get_ptw_enabled() from public;
grant execute on function get_ptw_enabled() to authenticated;

create or replace function set_ptw_enabled(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if not exists (select 1 from user_profiles where id = v_uid and global_role = 'admin') then
    raise exception '只有系統管理員可以切換 PTW 功能';
  end if;
  update app_config set ptw_enabled = p_enabled where id = 1;
  return p_enabled;
end;
$$;
revoke all on function set_ptw_enabled(boolean) from public;
grant execute on function set_ptw_enabled(boolean) to authenticated;
