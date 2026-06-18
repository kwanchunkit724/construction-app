-- =============================================================
-- v98-pm-gap-alert-fix.sql   (review fix for v97 pm_gap_alert over-firing)
-- =============================================================
-- Review of v97 found pm_gap_alert's no-work guard only suppressed when BOTH of
-- the fixed prior days (d-1, d-2) were no-work. So a single missed work day next
-- to a Sunday / public holiday / T8 / black-rain day still fired a push that
-- falsely claimed 連續 2 日 — e.g. every Monday morning, before a project files
-- Monday's diary, it would be told it "missed 2 days". That over-fire + false
-- message is exactly the spam-trains-mute risk.
--
-- FIX: recompute the gap over the last TWO actual WORK days (skipping
-- Sunday/holiday/T8/black-rain), and alert only when BOTH were missed. This also
-- catches a genuine 2-work-day gap that straddles a holiday (the old fixed window
-- missed it). Message updated to 連續 2 個工作日. Idempotent. zh-HK.
-- =============================================================

create or replace function pm_gap_alert()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_wd date[]; r record; v_pms uuid[]; v_name text;
begin
  if not coalesce((select retention_nudges_enabled from app_config where id = 1), false) then return; end if;

  -- the two most recent WORK days before today (skip Sunday / holiday / T8 / black rain)
  select array_agg(d order by d desc) into v_wd from (
    select dd::date as d
      from generate_series(v_today - 10, v_today - 1, interval '1 day') dd
     where not is_no_work_day(dd::date)
     order by dd desc limit 2
  ) t;
  if v_wd is null or array_length(v_wd, 1) < 2 then return; end if;  -- not enough work days in window

  for r in
    select a.project_id from (
      select distinct d.project_id from dailies d
       where d.date >= v_today - 14 and project_module_enabled(d.project_id, 'dailies')
    ) a
    where not exists (select 1 from dailies d2 where d2.project_id = a.project_id and d2.date = any(v_wd))
      and not exists (select 1 from project_alert_state s
                       where s.project_id = a.project_id and s.alert_key = 'daily_gap'
                         and s.last_sent_at > now() - interval '3 days')
  loop
    select assigned_pm_ids, name into v_pms, v_name from projects where id = r.project_id;
    if v_pms is not null and array_length(v_pms, 1) is not null then
      perform send_push_to_users(v_pms, '工地日誌提示',
        coalesce(v_name, '工地') || ' 已連續 2 個工作日無施工日誌', '/project/' || r.project_id || '/daily');
      insert into project_alert_state (project_id, alert_key, last_sent_at)
        values (r.project_id, 'daily_gap', now())
        on conflict (project_id, alert_key) do update set last_sent_at = excluded.last_sent_at;
    end if;
  end loop;
end; $$;
revoke all on function pm_gap_alert() from authenticated, anon;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select position('連續 2 個工作日' in prosrc) > 0 from pg_proc where proname='pm_gap_alert'; -> t
--   select pm_gap_alert();   -- flag off -> no-op, no error.
-- =============================================================
