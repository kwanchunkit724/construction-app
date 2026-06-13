-- =============================================================
-- v58-weather-record.sql   (Weather Part 2 — extreme-weather record + EOT claim)
-- =============================================================
-- Two regimes, per the confirmed decision:
--  * weather_events — territory-wide extreme-weather DAYS (objective facts):
--    T8+/黑/紅/黃雨 days (from HKO warnsum) + rainfall>20mm/24h days (from the HKO
--    daily-rainfall CSV). Written by the weather-sync Edge Function via the
--    SERVICE ROLE (warnsum has no history API, so the function snapshots it on a
--    cron); members read. These are the countable SFBC/Housing objective grounds.
--  * project_weather_claims — per-project EOT claim rows carrying the CEDD
--    Inclement Weather Report Form (PAH App 7.4) discretionary fields
--    (critical-path? / ready-to-work? / tidy-up days) so a Government-GCC claim
--    has its evidence trail. Manager-written (can_edit_project_progress).
-- Additive; no change to existing tables.
-- =============================================================

create table if not exists weather_events (
  id uuid primary key default gen_random_uuid(),
  hkt_date date not null,
  kind text not null check (kind in
    ('t8','t9','t10','black_rain','red_rain','amber_rain','rainfall_20mm','very_hot','cold','other')),
  station text,                          -- rain-gauge code for rainfall_20mm; null for territory warnings
  evidence jsonb not null default '{}',  -- warning code+issue/expire times, or { mm, station }
  created_at timestamptz not null default now(),
  unique (hkt_date, kind, station)       -- dedup: one row per (day, kind, station)
);
create index if not exists idx_weather_events_date on weather_events(hkt_date desc);
alter table weather_events enable row level security;
-- public weather facts: any member may read; writes only via the SERVICE ROLE
-- (the weather-sync Edge Function) — no client insert/update policy = denied.
drop policy if exists weather_events_select on weather_events;
create policy weather_events_select on weather_events for select to authenticated using (true);

create table if not exists project_weather_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  hkt_date date not null,
  trigger text not null,                 -- summary of which weather_events drove it (e.g. '黑雨 + 雨量 78mm')
  -- CEDD PAH Appendix 7.4 (Inclement Weather Report Form) discretionary fields:
  on_critical_path boolean,              -- 受影響工序是否喺關鍵路徑?
  ready_to_work boolean,                 -- 若天氣許可，承建商是否本可施工?
  tidy_days numeric check (tidy_days is null or tidy_days >= 0),  -- 善後/清理需時 (日)
  claim_days numeric check (claim_days is null or claim_days >= 0),  -- 此日申請嘅 EOT 日數
  note text,
  recorded_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, hkt_date)
);
create index if not exists idx_pwc_project on project_weather_claims(project_id, hkt_date desc);
alter table project_weather_claims enable row level security;
drop policy if exists pwc_select on project_weather_claims;
create policy pwc_select on project_weather_claims for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists pwc_insert on project_weather_claims;
create policy pwc_insert on project_weather_claims for insert to authenticated
  with check (can_edit_project_progress(auth.uid(), project_id) and recorded_by = auth.uid());
drop policy if exists pwc_update on project_weather_claims;
create policy pwc_update on project_weather_claims for update to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));
drop policy if exists pwc_delete on project_weather_claims;
create policy pwc_delete on project_weather_claims for delete to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));

-- member-facing read of recent territory extreme-weather days (天氣記錄 view).
create or replace function get_recent_weather_events(p_days int default 120)
returns setof weather_events language sql stable security definer set search_path = public as $$
  select * from weather_events
  where hkt_date >= (now() at time zone 'Asia/Hong_Kong')::date - greatest(1, p_days)
  order by hkt_date desc, kind;
$$;
grant execute on function get_recent_weather_events(int) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.weather_events') is not null, to_regclass('public.project_weather_claims') is not null;  -> t,t
--   select get_recent_weather_events(30);  -> runs (empty until the sync runs)
--   -- as a member: insert into project_weather_claims(...) with recorded_by=self succeeds for a manager, denied otherwise.
--   -- as a client: insert into weather_events -> RLS denied (service-role only).
-- =============================================================
