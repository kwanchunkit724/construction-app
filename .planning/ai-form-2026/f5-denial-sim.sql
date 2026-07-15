-- F5 denial sims (Forms) — rollback txn, prod untouched. Execution-proof.
-- Run in Supabase SQL editor; reads _f5 result grid; ROLLBACK at end.
begin;
create temp table _f5(n int, test text, passed boolean, detail text) on commit drop;
create temp table _ctx(inst uuid) on commit drop;
grant all on _f5 to authenticated;
grant all on _ctx to authenticated;

-- setup (postgres; RLS bypassed): equipment + CSSR-F5 instance + PM membership
do $s$
declare v_eq uuid; v_inst uuid; v_tmpl uuid;
begin
  select id into v_tmpl from form_templates where code='CSSR-F5';
  insert into equipment_register(project_id,kind,ref_no,name_zh,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620','scaffold','F5-SIM-'||substr(md5(random()::text),1,6),'測試竹棚','測試位','67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_eq;
  insert into form_instances(project_id,equipment_id,template_id,location_zh,created_by)
    values ('cccc2026-2026-2026-2026-000026202620',v_eq,v_tmpl,'測試位','67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_inst;
  insert into project_members(project_id,user_id,role,status)
    values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001','main_contractor','approved')
    on conflict do nothing;
  insert into _ctx values (v_inst);
end $s$;

-- impersonate PM via JWT claim (record_form_signoff reads auth.uid() from this)
select set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);

-- TEST 1: member WITHOUT matching credential cannot sign (covers worker + uncredentialed)
do $t1$
declare v_inst uuid; v_id uuid;
begin
  select inst into v_inst from _ctx;
  begin
    v_id := record_form_signoff(v_inst,'pass','{}'::jsonb, repeat('A',200));
    insert into _f5 values (1,'uncredentialed member blocked from signing',false,'UNEXPECTED success '||v_id);
  exception when others then
    insert into _f5 values (1,'uncredentialed member blocked from signing', position('合資格人士證明' in SQLERRM)>0, SQLERRM);
  end;
end $t1$;

-- self-INSERT a verified credential AS the PM (tests the suspected insert-path gap)
do $cred$
begin
  -- run as authenticated so the RLS insert policy (user_id = auth.uid()) is what allows it
  set local role authenticated;
  begin
    insert into user_credentials(user_id,credential_type,cert_name_zh,cert_no,valid_until,verified_by,verified_at)
      values ('aaaa1001-1001-1001-1001-000060001001','competent_person','合資格人士','CP-SIM-1',current_date+365,'aaaa1001-1001-1001-1001-000060001001',now());
    insert into _f5 values (5,'SELF-INSERT verified credential (expect BLOCKED)', false, 'GAP: self-verified insert succeeded');
  exception when others then
    insert into _f5 values (5,'SELF-INSERT verified credential (expect BLOCKED)', true, SQLERRM);
  end;
  reset role;
end $cred$;

-- ensure a verified credential exists for the positive control (postgres path, definitely valid)
insert into user_credentials(user_id,credential_type,cert_name_zh,cert_no,valid_until,verified_by,verified_at)
  select 'aaaa1001-1001-1001-1001-000060001001','competent_person','合資格人士','CP-SIM-2',current_date+365,'67e25666-66e1-4a22-a535-618ec3bcf132',now()
  where not exists (select 1 from user_credentials where user_id='aaaa1001-1001-1001-1001-000060001001' and credential_type='competent_person' and verified_at is not null);

-- TEST 2: credentialed member CAN sign (positive control — gate is not always-deny)
do $t2$
declare v_inst uuid; v_id uuid;
begin
  select inst into v_inst from _ctx;
  begin
    v_id := record_form_signoff(v_inst,'pass','{}'::jsonb, repeat('B',200));
    insert into _f5 values (2,'credentialed member CAN sign (positive control)', v_id is not null, 'signoff '||coalesce(v_id::text,'null'));
  exception when others then
    insert into _f5 values (2,'credentialed member CAN sign (positive control)', false, SQLERRM);
  end;
end $t2$;

-- TEST 3: direct INSERT into form_signoffs blocked by RLS with check(false)
do $t3$
declare v_inst uuid;
begin
  select inst into v_inst from _ctx;
  set local role authenticated;
  begin
    insert into form_signoffs(instance_id,project_id,result,payload,signed_by,signature_b64)
      values (v_inst,'cccc2026-2026-2026-2026-000026202620','pass','{}'::jsonb,'aaaa1001-1001-1001-1001-000060001001',repeat('C',200));
    insert into _f5 values (3,'direct form_signoffs insert blocked by RLS', false, 'UNEXPECTED insert ok');
  exception when others then
    insert into _f5 values (3,'direct form_signoffs insert blocked by RLS', true, SQLERRM);
  end;
  reset role;
end $t3$;

-- TEST 4: audit hash-chain still verifies after a signoff
do $t4$
declare v_ok boolean;
begin
  select verify_integrity() into v_ok;
  insert into _f5 values (4,'verify_integrity() green after signoff', coalesce(v_ok,false), 'verify_integrity='||coalesce(v_ok::text,'null'));
exception when others then
  insert into _f5 values (4,'verify_integrity() green after signoff', false, SQLERRM);
end $t4$;

select n,test,passed,detail from _f5 order by n;
rollback;
