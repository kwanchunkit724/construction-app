-- =============================================================
-- seed-phase2.sql — Phase 2 Playwright @si-vo-smoke seed fixture
-- =============================================================
-- INF-08 Phase 2 share. Idempotent SQL seed for tests/e2e/si-vo-smoke.spec.ts.
--
-- USAGE:
--   1. Create the 4 auth phone-accounts via Supabase Studio first:
--        60000001 / test1234  (subcon foreman)
--        60000002 / test1234  (main contractor)
--        60000003 / test1234  (project manager)
--        60000099 / test1234  (admin)
--      Note the resulting UUIDs from auth.users.
--   2. Replace the UUID constants in the DO block below with the real ones,
--      OR (simpler) use the fixed UUIDs declared here and INSERT directly into
--      auth.users via the SQL Editor running as service_role.
--   3. Paste this whole file into Supabase SQL Editor and run.
--   4. Run `npm run test:e2e -- --grep @si-vo-smoke` locally with the
--      preview server running against the same Supabase instance.
--
-- All inserts use `on conflict do nothing` so this can be re-run safely.
-- The auto-seed trigger on `projects` populates default approval chains
-- (Plan 02-08: SI=[main_contractor, pm], VO=[main_contractor, pm, owner])
-- so we explicitly OVERRIDE VO to a 2-step chain after the project insert
-- to keep the smoke spec inside the seeded 3 personas (no owner persona).
-- =============================================================

begin;

-- Fixed UUIDs for the smoke fixture (separable from real prod data).
-- The spec file pins SUBCON / MC / PM phones; admins must match these
-- phones when creating the auth.users rows via Supabase Studio.
--
-- subcon_foreman: 11110001-0001-0001-0001-000000000001  phone 60000001
-- mc_user:        11110002-0002-0002-0002-000000000002  phone 60000002
-- pm_user:        11110003-0003-0003-0003-000000000003  phone 60000003
-- admin_user:     11110099-0099-0099-0099-000000000099  phone 60000099
-- project:        20002000-2000-2000-2000-200020002000
-- leaf item:      30003000-3000-3000-3000-300030003000

-- Inserting into auth.users requires service_role. If running as anon,
-- create the auth accounts via Supabase Studio first then UPDATE the UUIDs
-- below to match the real auth.users.id values.
insert into auth.users (id, email)
values
  ('11110001-0001-0001-0001-000000000001', '60000001@phone.local'),
  ('11110002-0002-0002-0002-000000000002', '60000002@phone.local'),
  ('11110003-0003-0003-0003-000000000003', '60000003@phone.local'),
  ('11110099-0099-0099-0099-000000000099', '60000099@phone.local')
on conflict (id) do nothing;

insert into user_profiles (id, phone, name, global_role, sub_role, company)
values
  ('11110001-0001-0001-0001-000000000001', '60000001', '測試判頭工人', 'subcontractor_worker', 'foreman', '測試判頭'),
  ('11110002-0002-0002-0002-000000000002', '60000002', '測試總承建商', 'main_contractor', 'engineer', '測試總承建商'),
  ('11110003-0003-0003-0003-000000000003', '60000003', '測試PM', 'pm', null, '測試管理公司'),
  ('11110099-0099-0099-0099-000000000099', '60000099', '測試管理員', 'admin', null, '測試管理公司')
on conflict (id) do nothing;

-- Project — assigned_pm_ids includes pm_user. The seed_default_chain
-- AFTER INSERT trigger (Plan 02-08) auto-seeds SI + VO + PTW chains.
insert into projects (id, name, assigned_pm_ids, zones, created_by)
values
  ('20002000-2000-2000-2000-200020002000',
   '@si-vo-smoke 測試工地',
   array['11110003-0003-0003-0003-000000000003']::uuid[],
   '[{"id":"Z1","name":"1座"}]'::jsonb,
   '11110099-0099-0099-0099-000000000099')
on conflict (id) do nothing;

-- Override the default 3-step VO chain ([main_contractor, pm, owner])
-- with a 2-step VO chain ([main_contractor, pm]) — the smoke spec does
-- not seed an owner persona. Delete-then-insert is the canonical pattern
-- per Plan 02-08 D-15.
delete from approval_chain_steps
  where project_id = '20002000-2000-2000-2000-200020002000'
    and doc_type = 'vo';
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
values
  ('20002000-2000-2000-2000-200020002000', 'vo', 0, 'main_contractor'),
  ('20002000-2000-2000-2000-200020002000', 'vo', 1, 'pm')
on conflict (project_id, doc_type, step_order) do nothing;

-- Project memberships
insert into project_members (user_id, project_id, role, status, approved_at)
values
  ('11110001-0001-0001-0001-000000000001', '20002000-2000-2000-2000-200020002000', 'subcontractor_worker', 'approved', now()),
  ('11110002-0002-0002-0002-000000000002', '20002000-2000-2000-2000-200020002000', 'main_contractor',      'approved', now()),
  ('11110003-0003-0003-0003-000000000003', '20002000-2000-2000-2000-200020002000', 'pm',                   'approved', now())
on conflict (user_id, project_id) do nothing;

-- One leaf progress_item (no children → leaf) so SI submission can pin a drawing.
insert into progress_items (id, project_id, code, title, parent_id, zone_id)
values
  ('30003000-3000-3000-3000-300030003000',
   '20002000-2000-2000-2000-200020002000',
   'SMOKE-LEAF',
   '@si-vo-smoke 測試 leaf 項目',
   null,
   'Z1')
on conflict (id) do nothing;

-- One drawing + one drawing_version on that leaf (Phase 1 schema).
insert into drawings (id, project_id, leaf_item_id, title, created_by)
values
  ('40004000-4000-4000-4000-400040004000',
   '20002000-2000-2000-2000-200020002000',
   '30003000-3000-3000-3000-300030003000',
   '@si-vo-smoke 測試圖則',
   '11110099-0099-0099-0099-000000000099')
on conflict (id) do nothing;

insert into drawing_versions (id, drawing_id, version_no, file_path, mime_type, size_bytes, status, uploaded_by)
values
  ('50005000-5000-5000-5000-500050005000',
   '40004000-4000-4000-4000-400040004000',
   1,
   '20002000-2000-2000-2000-200020002000/40004000-4000-4000-4000-400040004000/v1/smoke.pdf',
   'application/pdf',
   1024,
   'current',
   '11110099-0099-0099-0099-000000000099')
on conflict (id) do nothing;

update drawings
   set current_version_id = '50005000-5000-5000-5000-500050005000'
 where id = '40004000-4000-4000-4000-400040004000';

commit;

do $$ begin
  raise notice 'seed-phase2.sql applied — @si-vo-smoke fixture ready';
end $$;
