-- =============================================================
-- v97-retention-nudges.sql   (retention Phase-2: 今日未填提醒 + 漏報警示)
-- =============================================================
-- Two server-side pg_cron pushes that drive the daily-open habit around the 施工
-- 日誌, WITHOUT spamming (the brainstorm's #1 risk). Built on measured live data:
--   * dailies are authored ONLY by main_contractor (foreman/engineer) / 老總 /
--     assigned-PM / admin — never 判頭. So the nudge targets exactly the live
--     dailies INSERT-RLS audience: role in (pm, general_foreman, main_contractor)
--     OR assigned PM OR admin.
--   * Only 6/17 projects ever wrote a daily → both jobs ONLY touch projects that
--     actually USE the diary (a daily in the last 7/14 days), never dormant ones.
-- SAFETY:
--   * BOTH jobs are flag-gated OFF (app_config.retention_nudges_enabled, default
--     false) — the app is LIVE on the App Store; the owner flips the flag (via
--     set_retention_nudges) only after 1.6 ships.
--   * No-work-day suppression (Sunday / HK public holiday / T8+ / black rain) —
--     one false-alarm push on a holiday trains users to mute the channel.
--   * Nudge dedups to ONE push per user per day (→ /home, landing on the red 日誌
--     pill from v94); the gap alert has a 3-day per-project cooldown.
--   * Retention pushes are SEPARATE from safety/approval pushes (those bypass all
--     of this and stay immediate).
-- Idempotent. zh-HK.
-- =============================================================

-- 0. Feature flag (off by default).
alter table app_config add column if not exists retention_nudges_enabled boolean not null default false;

-- 1. HK public-holiday calendar (admin-editable safety net). Seeded for 2026;
--    lunar-derived dates are best-effort — an admin can correct rows directly.
create table if not exists hk_public_holidays (
  holiday_date date primary key,
  name text not null
);
alter table hk_public_holidays enable row level security;
drop policy if exists hk_holidays_select on hk_public_holidays;
create policy hk_holidays_select on hk_public_holidays for select to authenticated using (true);
drop policy if exists hk_holidays_admin on hk_public_holidays;
create policy hk_holidays_admin on hk_public_holidays for all to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'))
  with check (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));

insert into hk_public_holidays (holiday_date, name) values
  ('2026-01-01','元旦'),
  ('2026-02-17','農曆年初一'),
  ('2026-02-18','農曆年初二'),
  ('2026-02-19','農曆年初三'),
  ('2026-04-03','耶穌受難節'),
  ('2026-04-04','耶穌受難節翌日'),
  ('2026-04-06','復活節星期一'),
  ('2026-04-07','清明節翌日'),
  ('2026-05-01','勞動節'),
  ('2026-05-25','佛誕翌日'),
  ('2026-06-19','端午節'),
  ('2026-07-01','香港特別行政區成立紀念日'),
  ('2026-09-26','中秋節翌日'),
  ('2026-10-01','國慶日'),
  ('2026-10-19','重陽節'),
  ('2026-12-25','聖誕節'),
  ('2026-12-26','聖誕節翌日')
on conflict (holiday_date) do nothing;

-- 2. Per-project alert cooldown (service-role only — written inside the cron fns).
create table if not exists project_alert_state (
  project_id uuid not null references projects(id) on delete cascade,
  alert_key text not null,
  last_sent_at timestamptz not null default now(),
  primary key (project_id, alert_key)
);
alter table project_alert_state enable row level security;  -- no policies → server-only

-- 3. No-work-day test (Sunday / public holiday / T8+ / black rain).
create or replace function is_no_work_day(p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select
    extract(dow from p_date) = 0
    or exists (select 1 from hk_public_holidays where holiday_date = p_date)
    or exists (select 1 from weather_events where hkt_date = p_date and kind in ('t8','t9','t10','black_rain'));
$$;

-- 4. 今日未填提醒 — 17:30 HKT. ONE push/user/day to eligible authors of active
--    projects that have no daily today. Deep-links /home (the v94 日誌 pill).
create or replace function daily_retention_nudge()
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Hong_Kong')::date; v_targets uuid[];
begin
  if not coalesce((select retention_nudges_enabled from app_config where id = 1), false) then return; end if;
  if is_no_work_day(v_today) then return; end if;

  with active as (
    select distinct d.project_id from dailies d
     where d.date >= v_today - 7 and project_module_enabled(d.project_id, 'dailies')
  ),
  missing as (
    select a.project_id from active a
     where not exists (select 1 from dailies d2 where d2.project_id = a.project_id and d2.date = v_today)
  ),
  eligible as (
    select pm.user_id as uid
      from project_members pm join missing m on m.project_id = pm.project_id
     where pm.status = 'approved' and pm.role in ('pm','general_foreman','main_contractor')
    union
    select pmid as uid
      from projects p join missing m on m.project_id = p.id
      cross join unnest(p.assigned_pm_ids) as pmid
  )
  select array_agg(distinct uid) into v_targets from eligible where uid is not null;

  if v_targets is null or array_length(v_targets, 1) is null then return; end if;
  perform send_push_to_users(v_targets, '日誌提醒', '記得填今日施工日誌', '/home');
end; $$;
revoke all on function daily_retention_nudge() from authenticated, anon;

-- 5. 漏報警示 — 08:30 HKT. Alert the PM(s) when an active project went the last
--    2 work-days with no daily. 3-day cooldown per project.
create or replace function pm_gap_alert()
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Hong_Kong')::date; r record; v_pms uuid[]; v_name text;
begin
  if not coalesce((select retention_nudges_enabled from app_config where id = 1), false) then return; end if;

  for r in
    select a.project_id from (
      select distinct d.project_id from dailies d
       where d.date >= v_today - 14 and project_module_enabled(d.project_id, 'dailies')
    ) a
    where not exists (select 1 from dailies d2 where d2.project_id = a.project_id and d2.date in (v_today - 1, v_today - 2))
      and not (is_no_work_day(v_today - 1) and is_no_work_day(v_today - 2))
      and not exists (select 1 from project_alert_state s
                       where s.project_id = a.project_id and s.alert_key = 'daily_gap'
                         and s.last_sent_at > now() - interval '3 days')
  loop
    select assigned_pm_ids, name into v_pms, v_name from projects where id = r.project_id;
    if v_pms is not null and array_length(v_pms, 1) is not null then
      perform send_push_to_users(v_pms, '工地日誌提示',
        coalesce(v_name, '工地') || ' 已連續 2 日無施工日誌', '/project/' || r.project_id || '/daily');
      insert into project_alert_state (project_id, alert_key, last_sent_at)
        values (r.project_id, 'daily_gap', now())
        on conflict (project_id, alert_key) do update set last_sent_at = excluded.last_sent_at;
    end if;
  end loop;
end; $$;
revoke all on function pm_gap_alert() from authenticated, anon;

-- 6. Admin flag toggle (auditable; mirrors other app_config setters).
create or replace function set_retention_nudges(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin') then
    raise exception '只有管理員可以設定';
  end if;
  update app_config set retention_nudges_enabled = p_on where id = 1;
end; $$;
grant execute on function set_retention_nudges(boolean) to authenticated;

-- 7. Schedule (idempotent). UTC 09:30 = 17:30 HKT; UTC 00:30 = 08:30 HKT (no DST).
do $$ begin perform cron.unschedule('daily-retention-nudge'); exception when others then null; end $$;
select cron.schedule('daily-retention-nudge', '30 9 * * *', $cron$ select daily_retention_nudge(); $cron$);
do $$ begin perform cron.unschedule('pm-gap-alert'); exception when others then null; end $$;
select cron.schedule('pm-gap-alert', '30 0 * * *', $cron$ select pm_gap_alert(); $cron$);

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select retention_nudges_enabled from app_config where id=1;                 -> f
--   select count(*) from hk_public_holidays;                                    -> 17
--   select to_regclass('public.project_alert_state') is not null;               -> t
--   select count(*) from pg_proc where proname in
--     ('is_no_work_day','daily_retention_nudge','pm_gap_alert','set_retention_nudges'); -> 4
--   select jobname from cron.job where jobname in ('daily-retention-nudge','pm-gap-alert'); -> 2 rows
--   -- flag OFF: select daily_retention_nudge() -> returns void, sends nothing.
--   -- OWNER go-live: select set_retention_nudges(true);  (as admin)
-- =============================================================
