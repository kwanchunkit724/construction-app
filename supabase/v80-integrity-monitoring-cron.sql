-- =============================================================
-- v80-integrity-monitoring-cron.sql
-- =============================================================
-- ISO/IEC 27001 A.8.16 (monitoring activities) — closes the "verify_integrity is
-- on-demand only, no scheduled monitoring" gap noted in the ISMS assessment.
--
-- verify_integrity() (v51) RAISES when auth.uid() is null, so pg_cron (which has
-- no JWT) cannot call it. This adds a system-context run_integrity_check() that
-- performs the SAME chain walk WITHOUT the auth gate, records the outcome to an
-- append-only integrity_check_log, and is scheduled daily. Admins read the log;
-- an intact=false row is the alert signal (a future hook can fan it to push via
-- the existing push_dispatcher).
--
-- Additive + idempotent. The on-demand verify_integrity()/export_ledger_proof()
-- RPCs are unchanged.
-- =============================================================

create extension if not exists pg_cron;

create table if not exists integrity_check_log (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  intact      boolean not null,
  result      jsonb not null
);
alter table integrity_check_log enable row level security;

-- Admins may read the monitoring history; no client writes (system/cron only).
drop policy if exists integrity_check_log_admin_read on integrity_check_log;
create policy integrity_check_log_admin_read on integrity_check_log for select to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));
revoke insert, update, delete on integrity_check_log from authenticated, anon;

-- System-context integrity check (no auth gate — for pg_cron). Mirrors
-- verify_integrity()'s walk + recompute, then logs the verdict.
create or replace function run_integrity_check()
returns integrity_check_log
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_expect_prev bytea := null;
  v_first boolean := true;
  v_recomputed bytea;
  v_count bigint := 0;
  v_head_seq bigint := null;
  v_head_hash bytea := null;
  v_result jsonb := null;
  v_row integrity_check_log;
begin
  for r in select * from audit_ledger order by seq asc loop
    v_count := v_count + 1;
    if not v_first and r.prev_hash is distinct from v_expect_prev then
      v_result := jsonb_build_object('intact', false, 'break_at', r.seq, 'reason', 'prev_hash mismatch', 'count', v_count);
      exit;
    end if;
    v_recomputed := extensions.digest(
      audit_ledger_canon(r.occurred_at, r.actor_id, r.table_name, r.row_pk, r.action, r.payload, r.prev_hash),
      'sha256'
    );
    if v_recomputed is distinct from r.hash then
      v_result := jsonb_build_object('intact', false, 'break_at', r.seq, 'reason', 'hash mismatch (row altered)', 'count', v_count);
      exit;
    end if;
    v_expect_prev := r.hash;
    v_first := false;
    v_head_seq := r.seq;
    v_head_hash := r.hash;
  end loop;

  if v_result is null then
    v_result := jsonb_build_object(
      'intact', true, 'break_at', null, 'count', v_count,
      'head_seq', v_head_seq,
      'head_hash', case when v_head_hash is null then null else encode(v_head_hash,'hex') end
    );
  end if;

  insert into integrity_check_log (intact, result)
    values ((v_result->>'intact')::boolean, v_result)
    returning * into v_row;
  return v_row;
end;
$$;
revoke all on function run_integrity_check() from public, authenticated, anon;

-- Daily 02:00 HKT (= 18:00 UTC). Idempotent re-schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'integrity-daily-check') then
    perform cron.unschedule('integrity-daily-check');
  end if;
end$$;
select cron.schedule('integrity-daily-check', '0 18 * * *', $cron$ select run_integrity_check(); $cron$);

-- Verify (execute): run_integrity_check() inserts a row with intact=true on the
-- current (untampered) ledger; cron.job has an 'integrity-daily-check' entry.
