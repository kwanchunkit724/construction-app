-- v75-ptw-lift-type.sql — add 升降機 (lift) to the PTW work-type allow-list.
--
-- electrical (電力) and scaffold (棚架) were already permitted by the v10 CHECK
-- constraint; they only needed UI authorability (src/types.ts PTW_TYPE_V1 +
-- src/lib/ptw.ts checklistTemplate). 'lift' is the one genuinely new work type,
-- so the DB allow-list must learn it before a 升降機 permit can be inserted.
--
-- Additive + idempotent. No existing rows are touched (the new value only
-- widens the allowed set). Safe to re-run.

alter table permits_to_work drop constraint if exists permits_to_work_ptw_type_check;

alter table permits_to_work
  add constraint permits_to_work_ptw_type_check
  check (ptw_type in ('hot_work','work_at_height','lifting',
                      'confined_space','excavation','electrical','scaffold','lift'));

-- Verify (run after apply):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'permits_to_work'::regclass and conname = 'permits_to_work_ptw_type_check';
--   -- expect the CHECK list to include 'lift'
