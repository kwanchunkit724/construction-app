-- =============================================================
-- v10-split/6-default-ptw-chain-seed.sql — Phase 3 Plan 03-07
-- =============================================================
-- Extends Plan 02-08's seed_default_chain trigger to also seed
-- the PTW default chain [safety_officer, main_contractor].
-- Then backfills the 2 live projects with the PTW default.
--
-- NON-DESTRUCTIVE: NOT EXISTS guard at step granularity. Safe to re-run.
-- =============================================================

-- 1. Re-create seed_default_chain to include PTW default.
create or replace function seed_default_chain()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
  values
    (new.id, 'si', 0, 'main_contractor'),
    (new.id, 'si', 1, 'pm');

  insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
  values
    (new.id, 'vo', 0, 'main_contractor'),
    (new.id, 'vo', 1, 'pm'),
    (new.id, 'vo', 2, 'owner');

  -- PTW default: safety_officer -> main_contractor (Phase 3 Plan 03-07).
  insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
  values
    (new.id, 'ptw', 0, 'safety_officer'),
    (new.id, 'ptw', 1, 'main_contractor');

  return new;
end;
$$;

comment on function seed_default_chain() is
  'AFTER INSERT trigger on projects: seeds D-16 default SI [main_contractor, pm] + VO [main_contractor, pm, owner] + PTW [safety_officer, main_contractor] chains.';

-- 2. Backfill PTW chain rows for existing live projects.
insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'ptw', 0, 'safety_officer'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'ptw' and c.step_order = 0
 );

insert into approval_chain_steps (project_id, doc_type, step_order, required_role)
select p.id, 'ptw', 1, 'main_contractor'
  from projects p
 where not exists (
   select 1 from approval_chain_steps c
    where c.project_id = p.id and c.doc_type = 'ptw' and c.step_order = 1
 );

-- =============================================================
-- Post-apply verification:
--   select project_id, count(*) from approval_chain_steps
--    where doc_type='ptw' group by project_id;
--   -- expect each row count >= 2
-- =============================================================
