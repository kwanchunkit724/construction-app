-- =============================================================
-- v10-safety-officer-role.sql — Phase 3 Plan 03-01 (de-risking spike)
-- =============================================================
-- Adds `safety_officer` to user_profiles.global_role CHECK constraint.
--
-- NON-DESTRUCTIVE:
--   * Touches user_profiles CHECK only (live App Store schema).
--   * No data writes. Existing rows already in {admin, pm, main_contractor,
--     subcontractor, subcontractor_worker, owner} all still pass new CHECK.
--   * Apple Guideline 5.1.1(v) preserved: delete_my_account() is
--     orthogonal — it gates on auth.uid() existence + in_flight_approvals,
--     not on the role string. New role users delete normally.
--
-- Standalone per P3-D1 (role migration BEFORE PTW schema). Subsequent
-- Phase 3 plans assume this CHECK extension is in place.
--
-- IDEMPOTENT: re-running this drops + recreates the named constraint.
-- =============================================================

alter table user_profiles drop constraint if exists user_profiles_global_role_check;

alter table user_profiles
  add constraint user_profiles_global_role_check
  check (global_role in (
    'admin',
    'pm',
    'main_contractor',
    'subcontractor',
    'subcontractor_worker',
    'owner',
    'safety_officer'
  ));

-- =============================================================
-- Post-apply verification:
--   -- New role accepted (rollback after):
--   begin;
--   insert into user_profiles (id, phone, name, global_role)
--     values (gen_random_uuid(), '90000001', '測試安全主任', 'safety_officer');
--   rollback;
--
--   -- Bad role still rejected:
--   begin;
--   insert into user_profiles (id, phone, name, global_role)
--     values (gen_random_uuid(), '90000002', '測試', 'bogus');
--   -- expect: ERROR 23514 violates check constraint
--   rollback;
--
--   -- Existing rows still pass:
--   select global_role, count(*) from user_profiles group by global_role;
--
--   -- delete_my_account smoke (does NOT mention role):
--   select prosrc from pg_proc where proname='delete_my_account';
--   -- expect: prosrc contains 'in_flight_approvals' (Plan 02-01 extension)
-- =============================================================
