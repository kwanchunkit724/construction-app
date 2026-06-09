-- =============================================================
-- v32-ptw-fire-watch.sql — hot_work fire-watch close-out fix
-- =============================================================
-- Depends on:
--   * v10-ptw-schema.sql (permits_to_work, close_out_ptw)
--
-- Problem:
--   PtwContext.startFireWatch did a direct UPDATE on permits_to_work.
--   The only UPDATE RLS policy ("Creator updates own draft PTW") requires
--   status='draft' AND chain_snapshot is null. Fire-watch is started on an
--   ACTIVE hot_work permit (status='active', chain_snapshot populated), so
--   the UPDATE matched 0 RLS rows. PostgREST returns no error on a 0-row
--   update → silent no-op → fire_watch_started_at never set →
--   close_out_ptw (which hard-requires fire_watch_started_at for hot_work)
--   can NEVER close a hot_work permit.
--
-- Fix:
--   SECURITY DEFINER RPC start_ptw_fire_watch(p_ptw_id) that asserts:
--     * caller is logged in
--     * caller = created_by
--     * ptw_type = 'hot_work'
--     * status = 'active'
--     * fire_watch_started_at is null
--   then sets fire_watch_started_at = now(). Mirrors the close_out_ptw
--   creator-only authorization. Grant execute to authenticated.
-- =============================================================

drop function if exists start_ptw_fire_watch(uuid) cascade;

create or replace function start_ptw_fire_watch(p_ptw_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ptw permits_to_work%rowtype;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select * into v_ptw from permits_to_work where id = p_ptw_id for update;
  if not found then raise exception 'PTW not found'; end if;
  if v_ptw.created_by <> v_uid then
    raise exception '只有提交人可以開始火警監察';
  end if;
  if v_ptw.ptw_type <> 'hot_work' then
    raise exception '只有動火工程需要火警監察';
  end if;
  if v_ptw.status <> 'active' then
    raise exception '只有 active 狀態嘅工作許可證可以開始火警監察';
  end if;
  if v_ptw.fire_watch_started_at is not null then
    raise exception '火警監察已開始';
  end if;
  update permits_to_work
     set fire_watch_started_at = now()
   where id = p_ptw_id;
end;
$$;
grant execute on function start_ptw_fire_watch(uuid) to authenticated;

-- =============================================================
-- End of v32-ptw-fire-watch.sql
-- Post-apply verification:
--   select proname, prosecdef from pg_proc where proname='start_ptw_fire_watch';
-- =============================================================
