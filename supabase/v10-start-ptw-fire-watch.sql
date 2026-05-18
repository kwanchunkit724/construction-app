-- =============================================================
-- v10-start-ptw-fire-watch.sql
-- =============================================================
-- SECURITY DEFINER RPC for the PTW creator to start the 30-minute
-- fire-watch on an active hot_work permit.
--
-- BUG FIXED:
--   PtwContext.startFireWatch previously did a direct UPDATE on
--   permits_to_work.fire_watch_started_at. The only UPDATE RLS policy
--   on permits_to_work ("Creator updates own draft PTW" in
--   v10-ptw-schema.sql) restricts UPDATE to status='draft'. But the
--   fire-watch button only renders for status='active' + 'hot_work',
--   so the UPDATE silently affected 0 rows, returned no error, and the
--   countdown UI never appeared. The hot-work close-out flow was
--   effectively broken for real users.
--
-- This RPC mirrors close_out_ptw's authorization shape:
--   * caller must be the PTW creator (v_ptw.created_by = auth.uid())
--   * status must be 'active'
--   * ptw_type must be 'hot_work'
--   * fire_watch_started_at must be NULL (idempotency — no restart)
--
-- Server-side timing only — caller cannot pass a timestamp. The 30-min
-- elapsed check inside close_out_ptw still runs against now() and the
-- value set here. Apple Guideline compliance preserved.
--
-- NON-DESTRUCTIVE: function add only. IDEMPOTENT: create or replace.
-- =============================================================

create or replace function public.start_ptw_fire_watch(p_ptw_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ptw permits_to_work%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select * into v_ptw from permits_to_work where id = p_ptw_id for update;
  if not found then raise exception 'PTW not found'; end if;
  if v_ptw.created_by <> v_uid then
    raise exception '只有提交人可以開始火警監察';
  end if;
  if v_ptw.status <> 'active' then
    raise exception '只有 active 狀態嘅工作許可證可以開始火警監察';
  end if;
  if v_ptw.ptw_type <> 'hot_work' then
    raise exception '只有動火工作許可證需要火警監察';
  end if;
  if v_ptw.fire_watch_started_at is not null then
    raise exception '火警監察已開始';
  end if;
  update permits_to_work
     set fire_watch_started_at = v_now
   where id = p_ptw_id;
  return v_now;
end;
$$;

revoke all on function public.start_ptw_fire_watch(uuid) from public;
grant execute on function public.start_ptw_fire_watch(uuid) to authenticated;

comment on function public.start_ptw_fire_watch(uuid) is
  'PTW creator starts the 30-minute fire-watch on an active hot_work permit. SECURITY DEFINER bypasses the draft-only UPDATE RLS policy. Idempotent: errors if fire_watch_started_at is already set.';
