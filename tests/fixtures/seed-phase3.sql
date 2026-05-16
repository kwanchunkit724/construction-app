-- =============================================================
-- seed-phase3.sql — Phase 3 Playwright @ptw-smoke seed extension
-- =============================================================
-- INF-08 Phase 3 share. Extends seed-phase2.sql with:
--   * safety_officer test user (60000004) approved on the smoke project
--   * PTW chain on the smoke project: [safety_officer, main_contractor]
--     (overriding the default seeded by seed_default_chain trigger — same
--     shape, just makes the smoke fixture explicit)
--
-- USAGE:
--   1. Apply seed-phase2.sql first (it creates the project + 4 users).
--   2. Create the safety_officer auth account via Supabase Studio:
--        phone 60000004 / password test1234
--      Then update the UUID below to match auth.users.id.
--   3. Apply this file.
--   4. Run: npm run test:e2e -- --grep @ptw-smoke
-- =============================================================

begin;

-- Safety officer test user
insert into auth.users (id, email)
values ('11110004-0004-0004-0004-000000000004', '60000004@phone.local')
on conflict (id) do nothing;

insert into user_profiles (id, phone, name, global_role, sub_role, company)
values (
  '11110004-0004-0004-0004-000000000004',
  '60000004',
  '測試安全主任',
  'safety_officer',
  'safety',
  '測試管理公司'
)
on conflict (id) do nothing;

insert into project_members (user_id, project_id, role, status, approved_at)
values (
  '11110004-0004-0004-0004-000000000004',
  '20002000-2000-2000-2000-200020002000',
  'safety_officer',
  'approved',
  now()
)
on conflict (user_id, project_id) do nothing;

-- PTW chain (idempotent: matches seed_default_chain trigger output)
delete from approval_chain_steps
 where project_id = '20002000-2000-2000-2000-200020002000'
   and doc_type = 'ptw';
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
values
  ('20002000-2000-2000-2000-200020002000', 'ptw', 0, 'safety_officer'),
  ('20002000-2000-2000-2000-200020002000', 'ptw', 1, 'main_contractor');

commit;

do $$ begin
  raise notice 'seed-phase3.sql applied — @ptw-smoke fixture ready';
end $$;
