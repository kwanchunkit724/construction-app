-- =============================================================
-- v10-split/2-pg-cron-rehearsal.sql — Phase 3 Plan 03-01 spike Task 3
-- =============================================================
-- Proof: pg_cron can register a job + fire on schedule. Plan 03-02
-- will replace this with the real PTW expiry job.
--
-- Already used in Phase 2 (si-vo-digest cron). This rehearsal just
-- confirms a Phase-3-style daily-at-16:00-UTC job registers cleanly
-- and that we can unschedule + reschedule idempotently.
-- =============================================================

create extension if not exists pg_cron with schema extensions;

-- Throwaway scratch table for cron-fire evidence.
create table if not exists _cron_rehearsal_log (
  id bigserial primary key,
  fired_at timestamptz not null default now(),
  source text
);

-- Idempotent: unschedule any prior rehearsal job, then schedule fresh.
do $unsched$
begin
  perform cron.unschedule('ptw-expiry-rehearsal');
exception when others then null;
end $unsched$;

-- Real PTW expiry will be `0 16 * * *` UTC (23:59 HKT cutoff).
-- For rehearsal, schedule the SAME time to confirm cron accepts the
-- expression. The job is a no-op insert into the scratch table.
select cron.schedule(
  'ptw-expiry-rehearsal',
  '0 16 * * *',
  $cron$ insert into _cron_rehearsal_log (source) values ('ptw-expiry-rehearsal'); $cron$
);

-- =============================================================
-- Post-apply verification:
--   select jobname, schedule, active from cron.job where jobname='ptw-expiry-rehearsal';
--   -- expect: 1 row, schedule='0 16 * * *', active=true
--
-- Teardown (run before Plan 03-02 lands the real expiry job):
--   select cron.unschedule('ptw-expiry-rehearsal');
--   drop table if exists _cron_rehearsal_log;
-- =============================================================
