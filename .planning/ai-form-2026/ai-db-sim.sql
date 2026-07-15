-- AI function DB/RLS second-wall sims. Rollback txn, prod untouched.
-- Proves the gates, cost math, ai_actions guard, and the mutate RLS wall hold
-- even though the live LLM loop can't be run here.
begin;
create temp table _t(n int, test text, passed boolean, detail text) on commit drop;
grant all on _t to authenticated;

-- fabricate two throwaway members of PROJ: a worker (no material rights) and a
-- 判頭/subcontractor (has material rights). user_profiles insert as postgres
-- (auth.uid() null) bypasses the v55f guard so we can set the role.
do $s$
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
    ('00000000-0000-0000-0000-00000000fb01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w@phone.local', now(), now()),
    ('00000000-0000-0000-0000-00000000fb02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s@phone.local', now(), now()),
    ('00000000-0000-0000-0000-00000000fb03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','n@phone.local', now(), now());
  insert into user_profiles (id, phone, name, global_role) values
    ('00000000-0000-0000-0000-00000000fb01','59990011','W','subcontractor_worker'),
    ('00000000-0000-0000-0000-00000000fb02','59990012','S','subcontractor'),
    ('00000000-0000-0000-0000-00000000fb03','59990013','N','subcontractor');
  insert into project_members (project_id, user_id, role, status) values
    ('cccc2026-2026-2026-2026-000026202620','00000000-0000-0000-0000-00000000fb01','subcontractor_worker','approved'),
    ('cccc2026-2026-2026-2026-000026202620','00000000-0000-0000-0000-00000000fb02','subcontractor','approved');
  -- fb03 is intentionally NOT a member (non-member gate test)
end $s$;

-- T1: ai_enabled_for_project is FALSE while the global flag is off (PM uid)
do $t1$
declare v boolean;
begin
  perform set_config('request.jwt.claims','{"sub":"aaaa1001-1001-1001-1001-000060001001","role":"authenticated"}', true);
  select ai_enabled_for_project('cccc2026-2026-2026-2026-000026202620') into v;
  insert into _t values (1,'gate false while flag off', v = false, 'ai_enabled='||v);
end $t1$;

-- flip the flags in-txn
update app_config set ai_assistant_enabled = true where id = 1;
update projects set ai_enabled = true where id = 'cccc2026-2026-2026-2026-000026202620';

-- T2: gate TRUE for a member, FALSE for a non-member (membership wall)
do $t2$
declare vm boolean; vn boolean;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
  select ai_enabled_for_project('cccc2026-2026-2026-2026-000026202620') into vm;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb03","role":"authenticated"}', true);
  select ai_enabled_for_project('cccc2026-2026-2026-2026-000026202620') into vn;
  insert into _t values (2,'gate true for member, false for non-member', vm = true and vn = false, 'member='||vm||' nonmember='||vn);
end $t2$;

-- T3: record_ai_usage HKD cost math + budget gate flips
do $t3$
declare v_cost numeric; v_status jsonb;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
  -- sonnet 1M in + 1M out = 23.4 + 117 = 140.4 HKD
  select record_ai_usage('claude-sonnet-4-6', 1000000, 1000000) into v_cost;
  select ai_usage_status() into v_status;
  insert into _t values (3,'sonnet cost 140.4 + budget over -> ok=false',
    round(v_cost,2) = 140.40 and (v_status->>'ok')::boolean = false,
    'cost='||round(v_cost,2)||' status='||v_status::text);
end $t3$;

-- T3b: opus + haiku rates
do $t3b$
declare v_opus numeric; v_haiku numeric;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
  select record_ai_usage('claude-opus-4-8', 1000000, 0) into v_opus;     -- 39.0
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb03","role":"authenticated"}', true);
  select record_ai_usage('claude-haiku-4-5', 1000000, 0) into v_haiku;   -- 7.8
  insert into _t values (4,'opus in-rate 39, haiku in-rate 7.8',
    round(v_opus,2) = 39.00 and round(v_haiku,2) = 7.80, 'opus='||round(v_opus,2)||' haiku='||round(v_haiku,2));
end $t3b$;

-- T4: ai_actions client insert is FORCED to status='proposed' (guard), even if
-- the client passes 'executed'; result/executed_at nulled.
do $t4$
declare v_status text; v_result jsonb;
begin
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
  set local role authenticated;
  insert into ai_actions (user_id, project_id, tool_name, args, args_hash, risk, status, result)
    values ('00000000-0000-0000-0000-00000000fb02','cccc2026-2026-2026-2026-000026202620','order_material','{}','x','medium','executed','{"forged":true}')
    returning status, result into v_status, v_result;
  reset role;
  insert into _t values (5,'ai_actions born proposed (guard)', v_status = 'proposed' and v_result is null, 'status='||v_status||' result='||coalesce(v_result::text,'NULL'));
exception when others then
  begin reset role; exception when others then null; end;
  insert into _t values (5,'ai_actions born proposed (guard)', false, SQLERRM);
end $t4$;

-- T5: mutate SECOND WALL — worker direct INSERT into materials is RLS-denied;
-- 判頭 (subcontractor) is allowed (positive control). The tools hit this wall.
do $t5$
declare v_id uuid;
begin
  -- worker -> denied
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb01","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into materials (project_id, name, unit, qty_needed, item_ids, requested_by)
      values ('cccc2026-2026-2026-2026-000026202620','英泥','包',50,'{}','00000000-0000-0000-0000-00000000fb01') returning id into v_id;
    insert into _t values (6,'worker materials INSERT denied by RLS', false, 'GAP: worker insert succeeded '||v_id);
  exception when others then
    insert into _t values (6,'worker materials INSERT denied by RLS', true, 'blocked: '||SQLERRM);
  end;
  reset role;
  -- 判頭 -> allowed
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000fb02","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into materials (project_id, name, unit, qty_needed, item_ids, requested_by)
      values ('cccc2026-2026-2026-2026-000026202620','英泥','包',50,'{}','00000000-0000-0000-0000-00000000fb02') returning id into v_id;
    insert into _t values (7,'判頭 materials INSERT allowed (positive control)', v_id is not null, 'id='||v_id);
  exception when others then
    insert into _t values (7,'判頭 materials INSERT allowed (positive control)', false, 'unexpected block: '||SQLERRM);
  end;
  reset role;
exception when others then
  begin reset role; exception when others then null; end;
  insert into _t values (6,'T5 outer', false, SQLERRM);
end $t5$;

select n, test, passed, detail from _t order by n;
rollback;
