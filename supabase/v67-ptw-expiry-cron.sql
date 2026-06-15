-- =============================================================
-- v67-ptw-expiry-cron.sql   (close a real safety hole: active PTW never expires promptly)
-- =============================================================
-- A 工作許可證 is activated for ONE working day: activate_ptw (v10) sets
-- expires_at = today 23:59 HKT and locks the row. But the only sweep shipped in
-- v10 was a DAILY pg_cron job ('ptw-expiry', '0 16 * * *' = 00:00 HKT next day)
-- calling drain_ptw_expiry(). That means a permit can sit in status='active'
-- for up to ~24h AFTER its expires_at — a live, scannable, "valid" hot-work /
-- working-at-height permit long past its window. That is a safety + audit hole:
-- mint_ptw_jwt / verify_ptw_jwt gate on status='active', so an expired-but-not-
-- yet-swept permit still mints a passing QR.
--
-- This migration adds a 15-MINUTE sweep so 'active' -> 'expired' happens within
-- a quarter hour of expiry, not the next midnight.
--
-- Why this is safe / backwards-compatible (無影響):
--   * Purely ADDITIVE: one wrapper function + one cron job. No table / RLS /
--     existing-function change. The v10 daily 'ptw-expiry' job and its
--     drain_ptw_expiry() function are left untouched (belt-and-braces; the two
--     are convergent — both only ever flip active -> expired and never thrash).
--   * 'expired' is a valid permits_to_work.status (v10 CHECK:
--     draft|submitted|in_review|approved|active|closed_out|EXPIRED|rejected|
--     revision_requested), so the UPDATE can never violate the status CHECK.
--   * Only ever transitions status='active' rows whose expires_at has passed;
--     closed_out / rejected / draft permits are never touched.
--   * pg_cron has no JWT (auth.uid() IS NULL); the wrapper is SECURITY DEFINER
--     so it can write past RLS in that context. Not granted to authenticated —
--     cron / service-role / table owner only.
--   * Idempotent: the function UPDATE is a no-op once swept; the cron
--     (re)schedule is unschedule-then-add (mirrors v63-memory-cron.sql).
-- =============================================================

-- pg_cron lives in the `cron` schema on Supabase; safe to re-run (see v63).
create extension if not exists pg_cron;

-- ── Wrapper: expire every overdue active permit, return how many it closed ──
-- Returns the count so a manual `select expire_overdue_ptw();` (or the cron run
-- history) shows exactly how many permits were swept this pass.
create or replace function expire_overdue_ptw()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update permits_to_work
     set status = 'expired'
   where status = 'active'
     and expires_at is not null
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function expire_overdue_ptw() from public;
-- (intentionally NO grant to authenticated: cron / service-role / owner only)

-- ── Schedule: every 15 minutes. Unschedule-first keeps this idempotent. ──
do $$
begin
  perform cron.unschedule('ptw-expiry-15min');
exception when others then
  -- job did not exist yet — fine
  null;
end $$;

select cron.schedule(
  'ptw-expiry-15min',
  '*/15 * * * *',
  $cron$ select expire_overdue_ptw() $cron$
);

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- 'expired' is an allowed status (sanity on the CHECK):
--   --   select pg_get_constraintdef(con.oid)
--   --     from pg_constraint con join pg_class rel on rel.oid=con.conrelid
--   --    where rel.relname='permits_to_work' and pg_get_constraintdef(con.oid) ilike '%status%';
--   -- the function exists and is SECURITY DEFINER:
--   --   select proname, prosecdef from pg_proc where proname='expire_overdue_ptw';  -- prosecdef=t
--   -- the 15-min job is registered & active:
--   --   select jobname, schedule, active from cron.job where jobname='ptw-expiry-15min';
--   -- a manual run closes overdue permits and reports the count:
--   --   select expire_overdue_ptw();   -- 0 when nothing is overdue, N otherwise
--   -- after a scheduled run, inspect history:
--   --   select status, return_message, start_time
--   --     from cron.job_run_details
--   --     where jobid=(select jobid from cron.job where jobname='ptw-expiry-15min')
--   --     order by start_time desc limit 3;
-- =============================================================
