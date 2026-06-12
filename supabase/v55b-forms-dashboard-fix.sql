-- v55b: fix get_forms_dashboard — the `with inst` CTE was referenced in two
-- separate SELECTs (out of scope in the second). Collapse to ONE statement that
-- builds counts + rows together over the joined set.
create or replace function get_forms_dashboard(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  if not can_view_project(auth.uid(), p_project_id) then raise exception '沒有權限'; end if;

  with inst as (
    select fi.id, fi.equipment_id, fi.location_zh, fi.valid_until, fi.suspended,
           ft.name_zh as tmpl_name, ft.code as tmpl_code,
           case
             when fi.suspended then 'suspended'
             when fi.valid_until is null then 'missing'
             when fi.valid_until < now() then 'expired'
             when fi.valid_until <= now() + (ft.remind_before_days || ' days')::interval then 'expiring'
             else 'valid'
           end as status
    from form_instances fi
    join form_templates ft on ft.id = fi.template_id
    where fi.project_id = p_project_id
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'valid',    count(*) filter (where i.status = 'valid'),
      'expiring', count(*) filter (where i.status = 'expiring'),
      'expired',  count(*) filter (where i.status = 'expired'),
      'missing',  count(*) filter (where i.status = 'missing'),
      'suspended',count(*) filter (where i.status = 'suspended')),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'instance_id', i.id, 'equipment_id', i.equipment_id, 'template_code', i.tmpl_code,
      'template_name', i.tmpl_name, 'equipment_name', e.name_zh,
      'location', coalesce(i.location_zh, e.location_zh),
      'status', i.status, 'valid_until', i.valid_until, 'suspended', i.suspended)
      order by (i.status='suspended') desc, (i.status='expired') desc, i.valid_until nulls first), '[]'::jsonb)
  ) into v_result
  from inst i left join equipment_register e on e.id = i.equipment_id;

  return coalesce(v_result, jsonb_build_object('counts','{}'::jsonb,'rows','[]'::jsonb));
end; $$;
grant execute on function get_forms_dashboard(uuid) to authenticated;
