-- F5 re-validation after v55e: self-insert cannot pre-verify, cannot sign. Rollback txn.
begin;
create temp table _f5b(n int, test text, passed boolean, detail text) on commit drop;
create temp table _ctx(inst uuid) on commit drop;
grant all on _f5b to authenticated;
grant all on _ctx to authenticated;

do $s$
declare v_eq uuid; v_inst uuid; v_tmpl uuid;
begin
  select id into v_tmpl from form_templates where code='CSSR-F5';
  insert into equipment_register(project_id,kind,ref_no,name_zh,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620','scaffold','F5B-'||substr(md5(random()::text),1,6),'測試竹棚','測試位','67e25666-66e1-4a22-a535-618ec3bcf132') returning id into v_eq;
  insert into form_instances(project_id,equipment_id,template_id,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620',v_eq,v_tmpl,'測試位','67e25666-66e1-4a22-a535-618ec3bcf132') returning id into v_inst;
  insert into project_members(project_id,user_id,role,status)
    values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001','main_contractor','approved') on conflict do nothing;
  insert into _ctx values (v_inst);
end $s$;

select set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);

-- TEST 5 (fixed): self-insert attempting verified_at=now() -> guard forces NULL
do $t5$
declare v_va timestamptz; v_vb uuid;
begin
  set local role authenticated;
  insert into user_credentials(user_id,credential_type,cert_name_zh,cert_no,valid_until,verified_by,verified_at)
    values ('aaaa1001-1001-1001-1001-000060001001','competent_person','合資格人士','CP-HACK',current_date+365,'aaaa1001-1001-1001-1001-000060001001',now())
    returning verified_at, verified_by into v_va, v_vb;
  reset role;
  insert into _f5b values (5,'self-insert cannot pre-verify (verified_at/by forced NULL)',
    v_va is null and v_vb is null, 'verified_at='||coalesce(v_va::text,'NULL')||' verified_by='||coalesce(v_vb::text,'NULL'));
exception when others then
  begin reset role; exception when others then null; end;
  insert into _f5b values (5,'self-insert cannot pre-verify (verified_at/by forced NULL)', true, 'insert raised: '||SQLERRM);
end $t5$;

-- TEST 6: with only the self-inserted (now-unverified) credential, signing still denied
do $t6$
declare v_inst uuid; v_id uuid;
begin
  select inst into v_inst from _ctx;
  begin
    v_id := record_form_signoff(v_inst,'pass','{}'::jsonb, repeat('A',200));
    insert into _f5b values (6,'self-inserted credential cannot be used to sign', false, 'UNEXPECTED success '||v_id);
  exception when others then
    insert into _f5b values (6,'self-inserted credential cannot be used to sign', position('合資格人士證明' in SQLERRM)>0, SQLERRM);
  end;
end $t6$;

select n,test,passed,detail from _f5b order by n;
rollback;
