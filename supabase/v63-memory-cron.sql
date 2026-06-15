-- =============================================================
-- v63-memory-cron.sql   (#4 — auto-refresh the AI memory graph, server-side)
-- =============================================================
-- Keeps the memory graph fresh WITHOUT the laptop, an Edge Function, or any
-- shared secret. A pg_cron job runs entirely inside Postgres and calls
-- rebuild_project_memory(id) (v61) for every project on a schedule.
--
-- Why this is safe / backwards-compatible (無影響):
--   * Purely ADDITIVE: one extension + one wrapper function + one cron job.
--     No table, RLS, or existing-function change. Live clients are untouched.
--   * rebuild_project_memory is SECURITY DEFINER and its gate allows the
--     no-auth (cron) context (v61: raises only when auth.uid() is non-null AND
--     non-admin). pg_cron has no JWT -> auth.uid() is NULL -> allowed.
--   * memory_notes / memory_links have NO client write policy, so the only
--     writer is this definer function. The graph is a one-way derived view of
--     progress / documents / issues / contacts under projects.
--   * Idempotent: rebuild UPSERTs + prunes; re-running changes nothing if the
--     source data is unchanged. The cron (re)schedule is unschedule-then-add.
-- =============================================================

-- pg_cron lives in the `cron` schema on Supabase; safe to re-run.
create extension if not exists pg_cron;

-- ── Wrapper: rebuild every project, isolating per-project failures ──────────
-- A single `select rebuild_project_memory(id) from projects` would abort the
-- whole set on the first error. This loops and captures per-project outcome so
-- one bad project never blocks the rest. Definer + not client-granted = only
-- cron / service-role / the table owner can run it.
create or replace function rebuild_all_project_memory()
returns table(project_id uuid, ok boolean, err text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from projects loop
    begin
      perform rebuild_project_memory(r.id);
      project_id := r.id; ok := true; err := null;
      return next;
    exception when others then
      project_id := r.id; ok := false; err := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;
revoke all on function rebuild_all_project_memory() from public;
-- (intentionally NO grant to authenticated: cron / service-role / owner only)

-- ── Schedule: every 6 hours (UTC). Unschedule-first keeps this idempotent. ──
do $$
begin
  perform cron.unschedule('rebuild-memory-graph');
exception when others then
  -- job did not exist yet — fine
  null;
end $$;

select cron.schedule(
  'rebuild-memory-graph',
  '0 */6 * * *',
  $cron$ select rebuild_all_project_memory() $cron$
);

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- the job is registered:
--   --   select jobname, schedule, active from cron.job where jobname='rebuild-memory-graph';
--   -- a manual run rebuilds every project without error:
--   --   select count(*) as projects, count(*) filter (where ok) as ok_count
--   --     from rebuild_all_project_memory();
--   -- after the first scheduled run, inspect history:
--   --   select status, return_message, start_time
--   --     from cron.job_run_details
--   --     where jobid=(select jobid from cron.job where jobname='rebuild-memory-graph')
--   --     order by start_time desc limit 3;
-- =============================================================
