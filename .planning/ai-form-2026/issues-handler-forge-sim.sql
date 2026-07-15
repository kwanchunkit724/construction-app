-- Execution proof: can an authenticated member forge issues.current_handler_role
-- (skip the escalation chain) on a direct INSERT? Rollback txn, prod untouched.
begin;
create temp table _iss(test text, passed boolean, detail text) on commit drop;
grant all on _iss to authenticated;

-- ensure impersonated user can view the project (postgres setup)
insert into project_members(project_id,user_id,role,status)
  values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001','subcontractor','approved')
  on conflict do nothing;

select set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);

-- a worker-reported issue should route to 'subcontractor' first; forge straight to 'pm'
do $t$
declare v_id uuid; v_h text;
begin
  set local role authenticated;
  begin
    insert into issues(project_id,reporter_id,reporter_role,title,current_handler_role,status)
      values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001',
              'subcontractor_worker','FORGE-TEST','pm','open')
      returning id, current_handler_role into v_id, v_h;
    insert into _iss values ('forge current_handler_role=pm (worker reporter)', false,
      'GAP: insert succeeded, stored handler='||v_h||' — chain skipped');
  exception when others then
    insert into _iss values ('forge current_handler_role=pm (worker reporter)', true, 'blocked: '||SQLERRM);
  end;
  -- also try forging a pre-resolved issue
  begin
    insert into issues(project_id,reporter_id,reporter_role,title,current_handler_role,status)
      values ('cccc2026-2026-2026-2026-000026202620','aaaa1001-1001-1001-1001-000060001001',
              'subcontractor_worker','FORGE-RESOLVED','subcontractor','resolved')
      returning id into v_id;
    insert into _iss values ('forge status=resolved on insert', false, 'GAP: pre-resolved issue created '||v_id);
  exception when others then
    insert into _iss values ('forge status=resolved on insert', true, 'blocked: '||SQLERRM);
  end;
  reset role;
exception when others then
  begin reset role; exception when others then null; end;
  insert into _iss values ('outer', false, SQLERRM);
end $t$;

select test, passed, detail from _iss;
rollback;
