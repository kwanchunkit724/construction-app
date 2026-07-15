-- =============================================================
-- v45-daily-log-v2.sql
-- =============================================================
-- Backlog S1 (labour + plant counts), S2 (AM/PM weather + HKO warning
-- signals). Additive + idempotent. Does NOT touch the legacy `weather`
-- column / its NOT NULL / its check — live iOS 1.4 clients still write it,
-- and the new client keeps writing weather = the AM choice.
-- No RLS / realtime / trigger changes (v35 dailies_insert today-lock stays).
-- =============================================================

-- S1: structured labour / plant counts — jsonb arrays of {trade,count} / {type,count}.
alter table dailies add column if not exists manpower jsonb not null default '[]'::jsonb;
alter table dailies add column if not exists plant    jsonb not null default '[]'::jsonb;

-- S2: AM/PM weather (same 7-option vocab as legacy `weather`) + HKO warning signals.
alter table dailies add column if not exists weather_am text;
alter table dailies add column if not exists weather_pm text;
alter table dailies add column if not exists warning_signals text[] not null default '{}';

-- Check constraints (guarded — ADD CONSTRAINT has no IF NOT EXISTS).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dailies_weather_am_chk') then
    alter table dailies add constraint dailies_weather_am_chk
      check (weather_am is null or weather_am in ('晴','陰','雨','暴雨','熱','凍','大風'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dailies_weather_pm_chk') then
    alter table dailies add constraint dailies_weather_pm_chk
      check (weather_pm is null or weather_pm in ('晴','陰','雨','暴雨','熱','凍','大風'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dailies_warning_signals_chk') then
    alter table dailies add constraint dailies_warning_signals_chk
      check (warning_signals <@ array['一號風球','三號風球','八號或以上風球',
                                      '黃雨','紅雨','黑雨','雷暴警告',
                                      '酷熱天氣警告','寒冷天氣警告']::text[]);
  end if;
end $$;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- as 管工, upsert with all new columns -> 201, echoes them.
--   -- old-client shape (weather only, no new keys) -> 201, defaults '[]' / '{}'.
--   -- warning_signals = ['咩都得'] -> 400 dailies_warning_signals_chk.
--   -- v35 guards intact: back-dated insert RLS-rejected; non-foreman insert rejected.
--   select manpower, plant, warning_signals from dailies limit 5;  -- old rows: defaults, no nulls
-- =============================================================
