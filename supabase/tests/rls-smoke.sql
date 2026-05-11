-- =============================================================
-- rls-smoke.sql — INF-04 3-persona RLS harness
-- =============================================================
-- Paste into Supabase Dashboard → SQL Editor (run as a single
-- query). Runs three personas via `set local request.jwt.claims`
-- and asserts `select count(*)` from drawings + drawing_versions
-- returns the expected numbers. ABORTs on mismatch via
-- raise exception.
--
-- ISSUE-05 fix: each persona block opens with a role-switch
-- assertion (current_user must equal 'authenticated') so we fail
-- LOUDLY if `set local role authenticated` silently no-ops on a
-- given Postgres instance.
--
-- Wrapped in begin/rollback so no fixture rows persist.
-- =============================================================

begin;

-- ── Fixture (inserted as service role / postgres so RLS is bypassed) ──
set local role postgres;

-- Stable UUIDs for assertions
-- project-A:    11111111-1111-1111-1111-111111111111
-- project-B:    22222222-2222-2222-2222-222222222222
-- admin:        aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- mc_of_a:      bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- subcon_of_b:  cccccccc-cccc-cccc-cccc-cccccccccccc

-- Auth users (must exist before user_profiles inserts due to FK)
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'smoke-admin@phone.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'smoke-mc@phone.local'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'smoke-subcon@phone.local')
on conflict (id) do nothing;

insert into user_profiles (id, phone, name, global_role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000001', 'smoke-admin', 'admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '50000002', 'smoke-mc', 'main_contractor'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '50000003', 'smoke-subcon', 'subcontractor')
on conflict (id) do nothing;

insert into projects (id, name, assigned_pm_ids, created_by)
values
  ('11111111-1111-1111-1111-111111111111', 'smoke-project-A', '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'smoke-project-B', '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict (id) do nothing;

insert into project_members (user_id, project_id, role, status, approved_at)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'main_contractor', 'approved', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'subcontractor', 'approved', now())
on conflict (user_id, project_id) do nothing;

-- One leaf progress_item per project (no children → leaf)
insert into progress_items (id, project_id, name, parent_id)
values
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'smoke-leaf-A', null),
  ('aaaa2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'smoke-leaf-B', null)
on conflict (id) do nothing;

-- One drawing per project (created as postgres → RLS bypassed)
insert into drawings (id, project_id, leaf_item_id, title, created_by)
values
  ('dddd1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'smoke-drawing-A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('dddd2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222', 'smoke-drawing-B', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict (id) do nothing;

insert into drawing_versions (id, drawing_id, version_no, file_path, mime_type, size_bytes, status, uploaded_by)
values
  ('eeee1111-1111-1111-1111-111111111111', 'dddd1111-1111-1111-1111-111111111111', 1, '11111111-1111-1111-1111-111111111111/dddd1111-1111-1111-1111-111111111111/v1/a.pdf', 'application/pdf', 1000, 'current', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('eeee2222-2222-2222-2222-222222222222', 'dddd2222-2222-2222-2222-222222222222', 1, '22222222-2222-2222-2222-222222222222/dddd2222-2222-2222-2222-222222222222/v1/b.pdf', 'application/pdf', 1000, 'current', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict (id) do nothing;

update drawings set current_version_id = 'eeee1111-1111-1111-1111-111111111111' where id = 'dddd1111-1111-1111-1111-111111111111';
update drawings set current_version_id = 'eeee2222-2222-2222-2222-222222222222' where id = 'dddd2222-2222-2222-2222-222222222222';

-- =============================================================
-- Persona 1: admin (should see all 2 drawings + 2 versions)
-- =============================================================
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'persona did not switch to authenticated (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from drawings;
  if cnt <> 2 then
    raise exception 'persona admin: expected 2 drawings, got %', cnt;
  end if;
  select count(*) into cnt from drawing_versions;
  if cnt <> 2 then
    raise exception 'persona admin: expected 2 drawing_versions, got %', cnt;
  end if;
end $$;

-- =============================================================
-- Persona 2: mc_of_a (should see only project-A: 1 drawing + 1 version)
-- =============================================================
reset role;
set local role postgres;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'persona did not switch to authenticated (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from drawings;
  if cnt <> 1 then
    raise exception 'persona mc_of_a: expected 1 drawing, got %', cnt;
  end if;
  select count(*) into cnt from drawing_versions;
  if cnt <> 1 then
    raise exception 'persona mc_of_a: expected 1 drawing_version, got %', cnt;
  end if;
end $$;

-- =============================================================
-- Persona 3: subcon_of_b (should see only project-B: 1 drawing + 1 version)
-- Note: subcon CAN VIEW per can_view_project (approved member) but
-- CANNOT upload per can_upload_drawing (subcontractor EXCLUDED — D-25).
-- =============================================================
reset role;
set local role postgres;
set local request.jwt.claims = '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'persona did not switch to authenticated (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from drawings;
  if cnt <> 1 then
    raise exception 'persona subcon_of_b: expected 1 drawing, got %', cnt;
  end if;
  select count(*) into cnt from drawing_versions;
  if cnt <> 1 then
    raise exception 'persona subcon_of_b: expected 1 drawing_version, got %', cnt;
  end if;
end $$;

-- ── Cleanup: rollback fixture (transaction undone) ────────────
rollback;

do $$ begin
  raise notice 'rls-smoke.sql passed (3 personas verified)';
end $$;
