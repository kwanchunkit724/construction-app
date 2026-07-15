-- =============================================================
-- v9-default-chain-seed.sql — Phase 2 Plan 02-08
-- =============================================================
-- Three concerns, one migration:
--
--   (a) save_chain_steps(p_project_id, p_doc_type, p_steps)
--       SECURITY DEFINER RPC for transactional chain saves
--       (delete-then-insert in one txn). Admin OR assigned PM gate.
--       Acceptable per D-15 because every in-flight doc carries
--       chain_snapshot frozen at submit (D-02) — mid-flight chain
--       edits never affect in-flight docs.
--
--   (b) seed_default_chain() + trg_seed_default_chain
--       AFTER INSERT trigger on projects that seeds the D-16
--       default SI + VO chains for every NEW project from now on.
--       PTW default deferred to Phase 3 (safety_officer role lands
--       there per RESEARCH Open Question 6).
--
--   (c) One-time idempotent BACKFILL for projects that predate
--       Phase 2 (the existing live App Store + TestFlight users
--       whose `projects` rows were created before this migration
--       runs). Each INSERT…SELECT guards itself with NOT EXISTS at
--       (project_id, doc_type, step_order) granularity so the
--       migration is safe to re-run after a partial failure
--       without duplicating rows. Per RESEARCH Open Question 5.
--
-- NON-DESTRUCTIVE: never touches user_profiles, projects,
-- progress_leaf_items, site_instructions, or variation_orders.
-- Only writes into approval_chain_steps (Phase 2-introduced
-- table, no live App Store users have rows here yet).
--
-- Apple compliance: completely orthogonal to delete_my_account
-- (which gates on in_flight_approvals(user_id), not chain config).
-- Adding chain rows cannot create or close any in-flight approval.
-- =============================================================

-- ── 1. Defensive drops (functions/triggers only — never touch tables) ──
drop trigger if exists trg_seed_default_chain on projects;
drop function if exists seed_default_chain() cascade;
drop function if exists save_chain_steps(uuid, text, jsonb) cascade;

-- ── 2. save_chain_steps RPC ─────────────────────────────────────
create or replace function save_chain_steps(
  p_project_id uuid,
  p_doc_type text,
  p_steps jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_is_admin boolean;
  v_is_assigned_pm boolean;
  v_step jsonb;
  v_idx int := 0;
begin
  if p_doc_type not in ('si','vo','ptw') then
    raise exception 'invalid doc_type';
  end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array';
  end if;

  -- Gate: admin globally OR assigned PM on this project
  v_is_admin := exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  );
  v_is_assigned_pm := exists (
    select 1 from projects where id = p_project_id and auth.uid() = any(assigned_pm_ids)
  );
  if not (v_is_admin or v_is_assigned_pm) then
    raise exception '只有管理員或本項目項目經理可以編輯簽核流程';
  end if;

  -- Delete-then-insert in a single transaction (D-15). Mid-flight
  -- docs are protected by chain_snapshot (D-02) — this is safe.
  delete from approval_chain_steps
   where project_id = p_project_id and doc_type = p_doc_type;

  for v_step in select * from jsonb_array_elements(p_steps) loop
    insert into approval_chain_steps (
      project_id, doc_type, step_order, required_role, optional_user_id
    ) values (
      p_project_id,
      p_doc_type,
      v_idx,
      v_step ->> 'required_role',
      nullif(v_step ->> 'optional_user_id','')::uuid
    );
    v_idx := v_idx + 1;
  end loop;
end;
$$;

revoke all on function save_chain_steps(uuid, text, jsonb) from public;
grant execute on function save_chain_steps(uuid, text, jsonb) to authenticated;

comment on function save_chain_steps(uuid, text, jsonb) is
  'SECURITY DEFINER chain save: delete-then-insert all steps for (project_id, doc_type) atomically. Gate: admin OR project assigned_pm. Mid-flight docs unaffected (chain_snapshot frozen at submit per D-02).';

-- ── 3. seed_default_chain() + AFTER INSERT trigger on projects ──
create or replace function seed_default_chain()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- SI default: main_contractor → pm (D-16)
  insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
  values
    (new.id, 'si', 0, 'main_contractor'),
    (new.id, 'si', 1, 'pm');

  -- VO default: main_contractor → pm → owner (D-16)
  insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
  values
    (new.id, 'vo', 0, 'main_contractor'),
    (new.id, 'vo', 1, 'pm'),
    (new.id, 'vo', 2, 'owner');

  -- PTW default deferred to Phase 3 (safety_officer role lands
  -- there per RESEARCH Open Question 6). Admin can manually
  -- configure PTW chain via /admin/projects/:id/chains when needed.
  return new;
end;
$$;

create trigger trg_seed_default_chain
  after insert on projects
  for each row execute function seed_default_chain();

comment on function seed_default_chain() is
  'AFTER INSERT trigger on projects: seeds D-16 default SI [main_contractor, pm] + VO [main_contractor, pm, owner] chains. PTW deferred to Phase 3.';

-- ── 4. One-time idempotent BACKFILL for existing projects ──────
-- Per RESEARCH Open Question 5: live App Store projects predate
-- this migration. Seed their default chains so admins start with
-- sane defaults. Idempotent — re-running won't duplicate rows
-- because each insert checks NOT EXISTS at the
-- (project_id, doc_type, step_order) granularity. Safe to re-run
-- after a partial failure.

-- SI defaults --------------------------------------------------
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'si', 0, 'main_contractor'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'si' and c.step_order = 0
 );

insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'si', 1, 'pm'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'si' and c.step_order = 1
 );

-- VO defaults --------------------------------------------------
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'vo', 0, 'main_contractor'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'vo' and c.step_order = 0
 );

insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'vo', 1, 'pm'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'vo' and c.step_order = 1
 );

insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'vo', 2, 'owner'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'vo' and c.step_order = 2
 );

-- =============================================================
-- End of v9-default-chain-seed.sql
--
-- Post-apply verification:
--   -- RPC + trigger present:
--   select proname, prosecdef from pg_proc where proname='save_chain_steps';
--   select tgname from pg_trigger where tgname='trg_seed_default_chain';
--
--   -- Backfill coverage (every project has both default chains):
--   select project_id, count(*) from approval_chain_steps
--    where doc_type='si' group by project_id;   -- each row count >= 2
--   select project_id, count(*) from approval_chain_steps
--    where doc_type='vo' group by project_id;   -- each row count >= 3
--
--   -- Idempotency: re-run the INSERT…SELECT statements above.
--   -- Counts must be unchanged.
--
--   -- Apple compliance regression (clean user):
--   select delete_my_account();
--     -- expect {"ok": true} for a user with no in-flight approvals.
--
--   -- Blocked-deletion regression (user with in-flight SI):
--   select delete_my_account();
--     -- expect {"ok": false, "blocked": true, "pending": N, "error": "你尚有 …"}.
-- =============================================================
