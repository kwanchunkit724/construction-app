-- =============================================================
-- v88-stepup-pw-lockout.sql
--   (App-level lockout for the password/biometric step-up factor — review #6)
-- =============================================================
-- The auth review noted [low] that verify-stepup-password had no app-level
-- attempt lockout — it relied solely on GoTrue's built-in /token rate-limit.
-- This adds a defence-in-depth per-user failed-attempt store; the edge function
-- refuses after >=5 fails in 15 min, records each fail, and clears the streak on
-- success. service-role-only (no client policy), exactly like step_up_grants.
-- Additive / idempotent.
-- =============================================================

create table if not exists stepup_pw_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index if not exists idx_stepup_pw_attempts on stepup_pw_attempts (user_id, failed_at desc);

alter table stepup_pw_attempts enable row level security;
-- No policies → only the service role (verify-stepup-password edge fn) reads/writes.
revoke all on stepup_pw_attempts from authenticated, anon;

-- Optional housekeeping (cron later): drop old fail rows.
create or replace function public.prune_stepup_pw_attempts()
returns void language sql security definer set search_path = public as $$
  delete from stepup_pw_attempts where failed_at < now() - interval '1 day';
$$;
revoke all on function public.prune_stepup_pw_attempts() from public;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select to_regclass('public.stepup_pw_attempts') is not null;            -> t
--   select count(*) from pg_policies where tablename='stepup_pw_attempts';  -> 0 (service-role only)
-- =============================================================
