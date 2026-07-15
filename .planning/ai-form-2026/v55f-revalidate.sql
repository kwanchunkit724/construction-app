-- Post-v55f re-validation: every forged INSERT now lands coerced. Rollback txn.
begin;
create temp table _v(test text, passed boolean, detail text) on commit drop;
create temp table _c(doc uuid, eq uuid, tmpl uuid) on commit drop;
grant all on _v to authenticated;
grant all on _c to authenticated;

-- setup (postgres): parent doc, equipment + template, PM membership, throwaway auth user
do $s$
declare v_doc uuid; v_eq uuid; v_tmpl uuid;
begin
  insert into documents(project_id, document_type, title, created_by)
    values ('cccc2026-2026-2026-2026-000026202620','material_submission','RV-DOC','67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_doc;
  select id into v_tmpl from form_templates where code='CSSR-F5';
  insert into equipment_register(project_id,kind,ref_no,name_zh,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620','scaffold','RV-'||substr(md5(random()::text),1,6),'測試竹棚','測試位','67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_eq;
  insert into project_members(project_id,user_id,role,status)
    values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001','subcontractor','approved')
    on conflict do nothing;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-00000000fa12','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rv@phone.local', now(), now());
  insert into _c values (v_doc, v_eq, v_tmpl);
end $s$;

-- 1) issues: forge handler='admin' + status='resolved' -> corrected
do $t1$
declare v_h text; v_st text; v_id uuid;
begin
  perform set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);
  set local role authenticated;
  insert into issues(project_id,reporter_id,reporter_role,title,current_handler_role,status)
    values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001','subcontractor_worker','RV','admin','resolved')
    returning id, current_handler_role, status into v_id, v_h, v_st;
  reset role;
  insert into _v values ('issues handler/status coerced', v_h <> 'admin' and v_st = 'open', 'handler='||v_h||' status='||v_st);
exception when others then begin reset role; exception when others then null; end;
  insert into _v values ('issues handler/status coerced', false, SQLERRM);
end $t1$;

-- 2) form_instances: forge valid_until/suspended -> NULL/false
do $t2$
declare v_eq uuid; v_tmpl uuid; v_vu timestamptz; v_su boolean;
begin
  select eq, tmpl into v_eq, v_tmpl from _c;
  perform set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);
  set local role authenticated;
  insert into form_instances(project_id,equipment_id,template_id,valid_until,suspended,created_by)
    values ('cccc2026-2026-2026-2026-000026202620',v_eq,v_tmpl, now()+interval '180 days', false,'aaaa1001-1001-1001-1001-000060001001')
    returning valid_until, suspended into v_vu, v_su;
  reset role;
  insert into _v values ('form_instances validity coerced', v_vu is null and v_su = false, 'valid_until='||coalesce(v_vu::text,'NULL')||' suspended='||v_su);
exception when others then begin reset role; exception when others then null; end;
  insert into _v values ('form_instances validity coerced', false, SQLERRM);
end $t2$;

-- 3) document_versions: forge status=approved -> submitted, reviewer null
do $t3$
declare v_doc uuid; v_st text; v_rev uuid;
begin
  select doc into v_doc from _c;
  perform set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);
  set local role authenticated;
  insert into document_versions(document_id, version_no, file_path, mime_type, size_bytes, status, reviewed_by, reviewed_at)
    values (v_doc, 1, 'x/y/v1/rv.pdf','application/pdf',100,'approved','67e25666-66e1-4a22-a535-618ec3bcf132', now())
    returning status, reviewed_by into v_st, v_rev;
  reset role;
  insert into _v values ('document_versions approval coerced', v_st = 'submitted' and v_rev is null, 'status='||v_st||' reviewed_by='||coalesce(v_rev::text,'NULL'));
exception when others then begin reset role; exception when others then null; end;
  insert into _v values ('document_versions approval coerced', false, SQLERRM);
end $t3$;

-- 4) user_profiles: forge global_role=admin -> subcontractor_worker
do $t4$
declare v_role text;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fa12","role":"authenticated"}', true);
  set local role authenticated;
  insert into user_profiles(id, phone, name, global_role)
    values ('00000000-0000-0000-0000-00000000fa12','59990002','RV','admin')
    returning global_role into v_role;
  reset role;
  insert into _v values ('user_profiles admin self-insert coerced', v_role <> 'admin', 'global_role='||v_role);
exception when others then begin reset role; exception when others then null; end;
  insert into _v values ('user_profiles admin self-insert coerced', false, SQLERRM);
end $t4$;

select test, passed, detail from _v order by test;
rollback;
