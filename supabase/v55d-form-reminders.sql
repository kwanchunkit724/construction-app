-- =============================================================
-- v55d-form-reminders.sql   (Forms feature F4 — expiry reminders)
-- =============================================================
-- Daily pg_cron sweep classifies form instances and pushes ONE batched reminder
-- per recipient per day, through push_dispatcher (already 3/day cap + digest, so
-- OneSignal free tier is safe). Stages fire at most once per (instance, day,
-- stage) via form_reminders_sent:
--   'pre'     — exactly remind_before_days before expiry (one heads-up)
--   'due'     — on the expiry day
--   'overdue' — weekly (Mondays) while past expiry
-- Recipients: assigned_signer_id if set, else the project's safety officers;
-- overdue additionally escalates to the assigned PMs. Server-only (cron).
-- =============================================================

create table if not exists form_reminders_sent (
  instance_id uuid not null references form_instances(id) on delete cascade,
  hkt_date date not null,
  stage text not null,
  primary key (instance_id, hkt_date, stage)
);
-- Server-only dedup table (written by the SECURITY DEFINER drain fn). RLS on,
-- NO policies = deny all direct client access.
alter table form_reminders_sent enable row level security;

create or replace function drain_form_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  r record;
begin
  -- Feature gate: do nothing until forms is switched on.
  if not coalesce((select forms_enabled from app_config where id = 1), false) then return; end if;

  -- 1) Determine which (instance, stage) fire TODAY (dedup via insert returning).
  create temp table _fired on commit drop as
  with due as (
    select fi.id as instance_id, fi.project_id, fi.assigned_signer_id, fi.valid_until, ft.name_zh,
      case
        when fi.valid_until is null then null
        when fi.valid_until::date = v_today + ft.remind_before_days then 'pre'
        when fi.valid_until::date = v_today then 'due'
        when fi.valid_until::date < v_today and extract(dow from v_today) = 1 then 'overdue'
        else null
      end as stage
    from form_instances fi
    join form_templates ft on ft.id = fi.template_id
    where not fi.suspended
  ),
  fireable as (select * from due where stage is not null),
  ins as (
    insert into form_reminders_sent (instance_id, hkt_date, stage)
    select instance_id, v_today, stage from fireable
    on conflict (instance_id, hkt_date, stage) do nothing
    returning instance_id, stage
  )
  select f.instance_id, f.project_id, f.assigned_signer_id, f.name_zh, f.stage
    from fireable f
    join ins on ins.instance_id = f.instance_id and ins.stage = f.stage;

  -- 2) Expand recipients (assigned signer, else safety officers; overdue -> + PMs).
  create temp table _recip on commit drop as
  select distinct e.recipient, fr.project_id, fr.name_zh
  from _fired fr
  cross join lateral (
    select fr.assigned_signer_id as recipient where fr.assigned_signer_id is not null
    union
    select active_role_holders(fr.project_id, 'safety_officer') as recipient where fr.assigned_signer_id is null
    union
    select unnest(p.assigned_pm_ids) from projects p where p.id = fr.project_id and fr.stage = 'overdue'
  ) e
  where e.recipient is not null;

  -- 3) One batched digest push per recipient.
  for r in
    select recipient, count(*) as n, (array_agg(name_zh))[1] as sample,
           (array_agg(project_id))[1] as a_project
    from _recip group by recipient
  loop
    perform push_dispatcher(r.recipient, jsonb_build_object(
      'heading_zh', '表格提醒',
      'content_zh', r.n || ' 項法定表格需要跟進（' || coalesce(r.sample, '') || ' …）',
      'deep_link',  '/project/' || r.a_project::text || '/equipment'));
  end loop;
end; $$;
revoke all on function drain_form_reminders() from public;  -- server/cron only

-- Schedule 07:30 HKT (23:30 UTC), idempotent (mirror the v10 'ptw-expiry' job).
do $$ begin
  perform 1 from cron.job where jobname = 'form-reminder-sweep';
  if found then perform cron.unschedule('form-reminder-sweep'); end if;
  perform cron.schedule('form-reminder-sweep', '30 23 * * *', $cron$ select drain_form_reminders(); $cron$);
exception when undefined_table or undefined_function then
  -- pg_cron not present in this environment; skip scheduling (the function still exists to call manually)
  null;
end $$;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- select drain_form_reminders();  -> runs without error (no-op while forms_enabled=false or no due forms).
--   -- select jobname, schedule from cron.job where jobname='form-reminder-sweep';  -> 1 row.
-- =============================================================
