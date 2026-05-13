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
insert into progress_items (id, project_id, code, title, parent_id)
values
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'SMOKE-A', 'smoke-leaf-A', null),
  ('aaaa2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'SMOKE-B', 'smoke-leaf-B', null)
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
  raise notice 'rls-smoke.sql Phase 1 passed (3 personas verified)';
end $$;

-- =============================================================
-- ── Phase 2 personas + assertions ────────────────────────────
-- =============================================================
-- Extends INF-04 with Phase 2 surface area:
--   * approval_chain_steps RLS by project membership
--   * approvals append-only (CHN-11 — no UPDATE/DELETE policies)
--   * delegations self/grantor/admin visibility
--   * active_role_holders includes delegated users
--   * in_flight_approvals smoke (gated on SI/VO existence —
--     skips cleanly when run before Plans 02-02 / 02-06)
--
-- New fixture personas (added to Phase 1's admin/mc_of_A/subcon_of_B):
--   subcontractor_worker_of_A   dddddddd-...
--   delegated_pm_via_mc_of_A    reuses mc_of_A (delegate_to)
--   pm_of_A (chain originator)  eeeeeeee-...
-- =============================================================

begin;

set local role postgres;

-- Re-seed Phase 1 fixture (Phase 1 rolled back). UUIDs match Phase 1.
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'smoke-admin@phone.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'smoke-mc@phone.local'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'smoke-subcon@phone.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'smoke-worker@phone.local'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'smoke-pm@phone.local')
on conflict (id) do nothing;

insert into user_profiles (id, phone, name, global_role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000001', 'smoke-admin', 'admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '50000002', 'smoke-mc', 'main_contractor'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '50000003', 'smoke-subcon', 'subcontractor'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '50000004', 'smoke-worker', 'subcontractor_worker'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '50000005', 'smoke-pm', 'pm')
on conflict (id) do nothing;

insert into projects (id, name, assigned_pm_ids, created_by)
values
  ('11111111-1111-1111-1111-111111111111', 'smoke-project-A', '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'smoke-project-B', '{}', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
on conflict (id) do nothing;

insert into project_members (user_id, project_id, role, status, approved_at)
values
  -- Phase 1 set
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'main_contractor', 'approved', now()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'subcontractor', 'approved', now()),
  -- Phase 2 additions
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'subcontractor_worker', 'approved', now()),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'pm', 'approved', now())
on conflict (user_id, project_id) do nothing;

-- Phase 2 fixture: project-A has a 2-step SI chain
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
values
  ('11111111-1111-1111-1111-111111111111', 'si', 0, 'main_contractor'),
  ('11111111-1111-1111-1111-111111111111', 'si', 1, 'pm')
on conflict (project_id, doc_type, step_order) do nothing;

-- Active delegation: pm_of_A → mc_of_A (current window)
insert into delegations (id, user_id, delegate_to, valid_from, valid_until)
values
  ('11111111-aaaa-aaaa-aaaa-111111111111',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   current_date - 1,
   current_date + 7)
on conflict (id) do nothing;

-- One fake approvals row tied to a stubbed doc_id (CHN-11 update-denial target)
insert into approvals (id, doc_type, doc_id, step_order, action_type, actor_id, reason)
values
  ('22222222-aaaa-aaaa-aaaa-222222222222',
   'si',
   '99999999-9999-9999-9999-999999999999',
   0,
   'approve',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   null)
on conflict (id) do nothing;

-- =============================================================
-- Persona P2-1: admin (sees all chain_steps + approvals + delegations)
-- =============================================================
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'Phase2 persona admin: role-switch failed (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from approval_chain_steps;
  if cnt <> 2 then raise exception 'persona admin: expected 2 chain_steps, got %', cnt; end if;
  -- approvals: stub SELECT policy denies ALL (false). Admin sees 0.
  -- This is correct for the spine-only migration; Plans 02-02/02-06
  -- replace the stub with doc-routed visibility.
  select count(*) into cnt from approvals;
  if cnt <> 0 then raise exception 'persona admin: expected 0 approvals (stub policy), got %', cnt; end if;
  select count(*) into cnt from delegations;
  if cnt <> 1 then raise exception 'persona admin: expected 1 delegation, got %', cnt; end if;
end $$;

-- =============================================================
-- Persona P2-2: mc_of_A (member of project-A → sees chain; delegate_to → sees delegation)
-- =============================================================
reset role;
set local role postgres;
set local request.jwt.claims = '{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'Phase2 persona mc_of_A: role-switch failed (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from approval_chain_steps;
  if cnt <> 2 then raise exception 'persona mc_of_A: expected 2 chain_steps, got %', cnt; end if;
  select count(*) into cnt from approvals;
  if cnt <> 0 then raise exception 'persona mc_of_A: expected 0 approvals (stub policy), got %', cnt; end if;
  select count(*) into cnt from delegations;
  if cnt <> 1 then raise exception 'persona mc_of_A: expected 1 delegation (as delegate_to), got %', cnt; end if;
end $$;

-- =============================================================
-- Persona P2-3: subcon_of_B (project-B member only → no project-A chain visibility)
-- =============================================================
reset role;
set local role postgres;
set local request.jwt.claims = '{"sub": "cccccccc-cccc-cccc-cccc-cccccccccccc", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'Phase2 persona subcon_of_B: role-switch failed (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from approval_chain_steps;
  if cnt <> 0 then raise exception 'persona subcon_of_B: expected 0 chain_steps (no project-B chain), got %', cnt; end if;
  select count(*) into cnt from approvals;
  if cnt <> 0 then raise exception 'persona subcon_of_B: expected 0 approvals, got %', cnt; end if;
  select count(*) into cnt from delegations;
  if cnt <> 0 then raise exception 'persona subcon_of_B: expected 0 delegations, got %', cnt; end if;
end $$;

-- =============================================================
-- Persona P2-4: subcontractor_worker_of_A (member → sees chain config; not in delegation)
-- =============================================================
reset role;
set local role postgres;
set local request.jwt.claims = '{"sub": "dddddddd-dddd-dddd-dddd-dddddddddddd", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'Phase2 persona subcontractor_worker_of_A: role-switch failed (current_user = %)', current_user;
  end if;
end $$;
do $$
declare cnt int;
begin
  select count(*) into cnt from approval_chain_steps;
  if cnt <> 2 then raise exception 'persona subcontractor_worker_of_A: expected 2 chain_steps, got %', cnt; end if;
  select count(*) into cnt from approvals;
  if cnt <> 0 then raise exception 'persona subcontractor_worker_of_A: expected 0 approvals (stub), got %', cnt; end if;
  select count(*) into cnt from delegations;
  if cnt <> 0 then raise exception 'persona subcontractor_worker_of_A: expected 0 delegations, got %', cnt; end if;
end $$;

-- =============================================================
-- Persona P2-5: delegated_pm_via_mc_of_A — assert active_role_holders
-- includes mc_of_A in active_role_holders(project_A, 'pm') because of
-- the pm_of_A → mc_of_A delegation.
-- =============================================================
reset role;
set local role postgres;
do $$
declare h uuid[];
begin
  h := array(select active_role_holders('11111111-1111-1111-1111-111111111111'::uuid, 'pm'));
  if not ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid = any(h)) then
    raise exception 'active_role_holders did not include delegate mc_of_A as pm (delegation resolution failed)';
  end if;
end $$;

-- =============================================================
-- CHN-09 in_flight_approvals smoke
-- Gated on site_instructions existence — skips cleanly when run
-- before Plans 02-02 / 02-06 land.
-- =============================================================
do $$
begin
  if to_regclass('public.site_instructions') is null then
    raise notice 'Skipping in_flight_approvals smoke — site_instructions not yet created';
  else
    if in_flight_approvals('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) <> 0 then
      raise exception 'in_flight_approvals(admin) should be 0 for fresh fixture';
    end if;
  end if;
end $$;

-- =============================================================
-- CHN-11 append-only assertion: UPDATE on approvals must fail
-- (no UPDATE policy → insufficient_privilege).
-- =============================================================
set local request.jwt.claims = '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';
set local role authenticated;
do $$ begin
  if current_user <> 'authenticated' then
    raise exception 'CHN-11 setup: role-switch failed (current_user = %)', current_user;
  end if;
end $$;
do $$
declare upd_count int;
begin
  -- The stub SELECT policy hides rows so the UPDATE will simply
  -- match 0 rows even if a policy existed; to assert the absence
  -- of an UPDATE policy itself we count pg_policies entries.
  select count(*) into upd_count
    from pg_policies
   where schemaname='public'
     and tablename='approvals'
     and cmd='UPDATE';
  if upd_count <> 0 then
    raise exception 'CHN-11 violation: approvals has % UPDATE policies (expected 0)', upd_count;
  end if;
  -- Same for DELETE
  select count(*) into upd_count
    from pg_policies
   where schemaname='public'
     and tablename='approvals'
     and cmd='DELETE';
  if upd_count <> 0 then
    raise exception 'CHN-11 violation: approvals has % DELETE policies (expected 0)', upd_count;
  end if;
end $$;

-- ── Cleanup: rollback Phase 2 fixture ─────────────────────────
rollback;

do $$ begin
  raise notice 'rls-smoke Phase 2 extension passed (5 personas + CHN-11 + delegation resolution)';
end $$;
