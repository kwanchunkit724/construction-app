-- Execution proof: can a manager INSERT a form_instance already marked valid
-- (valid_until in the future, suspended=false) with ZERO signoffs — faking a
-- statutory form's validity, bypassing record_form_signoff? Rollback txn.
begin;
create temp table _fi(test text, passed boolean, detail text) on commit drop;
create temp table _ctx(eq uuid, tmpl uuid) on commit drop;
grant all on _fi to authenticated;
grant all on _ctx to authenticated;

do $s$
declare v_eq uuid; v_tmpl uuid;
begin
  select id into v_tmpl from form_templates where code='CSSR-F5';
  insert into equipment_register(project_id,kind,ref_no,name_zh,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620','scaffold','FI-FORGE-'||substr(md5(random()::text),1,6),'測試竹棚','測試位','67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_eq;
  insert into _ctx values (v_eq, v_tmpl);
end $s$;

-- impersonate the assigned PM (a manager -> can_edit_project_progress true)
select set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);

do $t$
declare v_eq uuid; v_tmpl uuid; v_vu timestamptz; v_susp boolean; v_iid uuid; v_signoffs int;
begin
  select eq, tmpl into v_eq, v_tmpl from _ctx;
  set local role authenticated;
  begin
    insert into form_instances(project_id,equipment_id,template_id,valid_until,suspended,created_by)
      values ('cccc2026-2026-2026-2026-000026202620',v_eq,v_tmpl, now()+interval '180 days', false,
              'aaaa1001-1001-1001-1001-000060001001')
      returning id, valid_until, suspended into v_iid, v_vu, v_susp;
    select count(*) into v_signoffs from form_signoffs where instance_id = v_iid;
    -- GAP if the future valid_until persisted with zero signoffs
    insert into _fi values ('manager forges form_instance.valid_until (no signoff)',
      v_vu is null,
      'stored valid_until='||coalesce(v_vu::text,'NULL')||' suspended='||v_susp||' signoffs='||v_signoffs);
  exception when others then
    insert into _fi values ('manager forges form_instance.valid_until (no signoff)', true, 'blocked: '||SQLERRM);
  end;
  reset role;
exception when others then
  begin reset role; exception when others then null; end;
  insert into _fi values ('outer', false, SQLERRM);
end $t$;

select test, passed, detail from _fi;
rollback;
