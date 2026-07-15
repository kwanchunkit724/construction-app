-- =============================================================
-- v10-ptw-test-backdate-fire-watch.sql
-- =============================================================
-- Admin-only RPC to backdate permits_to_work.fire_watch_started_at
-- so the @ptw-fire-watch-smoke E2E spec can exercise the 30-min
-- close_out_ptw guard without sleeping 30 minutes inside Playwright.
--
-- Guarded by global_role='admin' check — never callable by normal
-- users. Intended for tests + on-call manual recovery only.
--
-- Apple Guideline compliance: PTW timing remains server-side. This
-- RPC merely lets an admin shift the START timestamp; the 30-min
-- elapsed check inside close_out_ptw still runs against now() and
-- the new fire_watch_started_at. No client-clock trust.
--
-- NON-DESTRUCTIVE: function add only. IDEMPOTENT: create or replace.
-- =============================================================

create or replace function public.backdate_ptw_fire_watch(
  p_ptw_id uuid,
  p_minutes_ago int
) returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_new_ts timestamptz;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select global_role = 'admin' into v_is_admin
    from user_profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then
    raise exception '只有管理員可以調整火警監察時間';
  end if;
  if p_minutes_ago is null or p_minutes_ago < 0 then
    raise exception 'p_minutes_ago must be >= 0';
  end if;
  v_new_ts := now() - make_interval(mins => p_minutes_ago);
  update permits_to_work
     set fire_watch_started_at = v_new_ts
   where id = p_ptw_id;
  if not found then raise exception 'PTW not found'; end if;
  return v_new_ts;
end;
$$;

revoke all on function public.backdate_ptw_fire_watch(uuid, int) from public;
grant execute on function public.backdate_ptw_fire_watch(uuid, int) to authenticated;

comment on function public.backdate_ptw_fire_watch(uuid, int) is
  'Admin-only test helper: shifts permits_to_work.fire_watch_started_at to (now() - p_minutes_ago minutes). Used by @ptw-fire-watch-smoke E2E to verify the 30-min close_out_ptw guard without a real 30-min wait. Never callable by non-admin users.';
