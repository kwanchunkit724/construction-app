-- Execution proof for the two CRITICAL gaps. Rollback txn, prod untouched.
-- A) document_versions: member self-INSERTs a version born status='approved' with a fake reviewer.
-- B) user_profiles: a fresh signup self-INSERTs global_role='admin'.
begin;
create temp table _r(test text, passed boolean, detail text) on commit drop;
create temp table _ctx(doc uuid) on commit drop;
grant all on _r to authenticated;
grant all on _ctx to authenticated;

-- ---- setup A: a parent documents row (postgres) ----
do $sa$
declare v_doc uuid;
begin
  insert into documents(project_id, document_type, title, created_by)
    values ('cccc2026-2026-2026-2026-000026202620','material_submission','FORGE-DOC',
            '67e25666-66e1-4a22-a535-618ec3bcf132')
    returning id into v_doc;
  insert into _ctx values (v_doc);
end $sa$;

-- ---- TEST A: forge an approved document_version (impersonate PM, a can_upload_document member) ----
do $ta$
declare v_doc uuid; v_st text; v_rev uuid;
begin
  select doc into v_doc from _ctx;
  perform set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into document_versions(document_id, version_no, file_path, mime_type, size_bytes, status, reviewed_by, reviewed_at)
      values (v_doc, 1, 'x/y/v1/forge.pdf', 'application/pdf', 100, 'approved',
              '67e25666-66e1-4a22-a535-618ec3bcf132', now())
      returning status, reviewed_by into v_st, v_rev;
    insert into _r values ('forge document_version status=approved + fake reviewer', v_st <> 'approved',
      'stored status='||v_st||' reviewed_by='||coalesce(v_rev::text,'NULL'));
  exception when others then
    insert into _r values ('forge document_version status=approved + fake reviewer', true, 'blocked: '||SQLERRM);
  end;
  reset role;
exception when others then
  begin reset role; exception when others then null; end;
  insert into _r values ('A-outer', false, SQLERRM);
end $ta$;

-- ---- setup B: fabricate a throwaway auth user (postgres) ----
do $sb$
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-00000000fa11','00000000-0000-0000-0000-000000000000',
            'authenticated','authenticated','forgetest@phone.local', now(), now());
exception when others then
  -- if auth.users shape differs, record it; test B will then fail to set up
  insert into _r values ('B-setup auth.users insert', false, 'setup failed: '||SQLERRM);
end $sb$;

-- ---- TEST B: self-INSERT a profile as global_role='admin' ----
do $tb$
declare v_role text;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fa11","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into user_profiles(id, phone, name, global_role)
      values ('00000000-0000-0000-0000-00000000fa11','59990001','HACK','admin')
      returning global_role into v_role;
    insert into _r values ('self-insert user_profiles global_role=admin', v_role <> 'admin',
      'stored global_role='||v_role);
  exception when others then
    insert into _r values ('self-insert user_profiles global_role=admin', true, 'blocked: '||SQLERRM);
  end;
  reset role;
exception when others then
  begin reset role; exception when others then null; end;
  insert into _r values ('B-outer', false, SQLERRM);
end $tb$;

select test, passed, detail from _r order by test;
rollback;
