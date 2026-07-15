-- =============================================================
-- v90-labour-module.sql   (勞工人力日報 / G.F.527 — module catalogue key 'labour')
-- =============================================================
-- GF527 Labour Return is a REPORT derived from the existing dailies.manpower data
-- (no new table, no double entry). It only needs a module catalogue key so the
-- admin per-project toggle + ModulesContext recognise it; the page reads dailies
-- (already RLS-gated by can_view_project / the dailies policies). This migration
-- just extends get_project_modules with 'labour'. Idempotent.
-- =============================================================

create or replace function public.get_project_modules(p_project_id uuid)
returns table (module_key text, enabled boolean)
language sql security definer stable set search_path = public as $$
  select k.module_key, coalesce(pm.enabled, true) as enabled
  from (values
    ('progress'),('issues'),('si'),('vo'),('ptw'),('weather'),('documents'),
    ('materials'),('contacts'),('timetable'),('dailies'),('equipment'),('assistant'),
    ('cleansing'),('ncr'),('risc'),('labour')
  ) as k(module_key)
  left join project_modules pm
    on pm.project_id = p_project_id and pm.module_key = k.module_key;
$$;
grant execute on function public.get_project_modules(uuid) to authenticated;

-- Post-apply: select count(*) = 17 from get_project_modules('<project-id>'::uuid);  -> t
