-- =============================================================
-- v9-rls-helpers.sql — Phase 2 RLS helpers (extends INF-03)
-- =============================================================
-- Adds:
--   * active_role_holders(project_id, required_role) → setof uuid
--   * in_flight_approvals(user_id) → int
--
-- can_view_si() and can_view_vo() are NOT defined here — they land
-- in plan 02-02 (alongside site_instructions) and plan 02-06
-- (alongside variation_orders), to avoid forward-referencing
-- those tables in this migration.
--
-- All functions: language sql, stable, security definer,
-- search_path = public (PITFALLS C6 / Phase 1 D-32).
-- Run AFTER v9-chain-schema.sql.
-- =============================================================

-- ── active_role_holders ───────────────────────────────────────
-- Union of:
--   * Admins (always)
--   * Assigned PMs (only when required_role='pm')
--   * Approved project_members with matching role
--   * Delegations: users delegated TO by a holder of required_role
create or replace function active_role_holders(
  p_project_id uuid,
  p_required_role text
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Admins always
  select id from user_profiles where global_role = 'admin'
  union
  -- Assigned PMs when required_role = 'pm'
  select unnest(assigned_pm_ids)
    from projects
   where id = p_project_id
     and p_required_role = 'pm'
  union
  -- Approved members with matching role
  select pm.user_id
    from project_members pm
   where pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
  union
  -- Delegations: anyone delegated TO by a user who would normally hold this role
  select d.delegate_to
    from delegations d
    join project_members pm
      on pm.user_id = d.user_id
     and pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
   where current_date between d.valid_from and d.valid_until;
$$;

-- ── in_flight_approvals ───────────────────────────────────────
-- FORWARD-REFERENCE NOTE:
--   This function references site_instructions and variation_orders
--   tables that DO NOT exist when this migration runs. Postgres
--   resolves `language sql` function bodies on first call, not at
--   create time — so the CREATE succeeds. The function will error
--   if invoked before Plans 02-02 / 02-06 land. The only legitimate
--   caller (delete_my_account, Task 4) is also guarded — but only
--   downstream plans will actually exercise it after SI/VO tables
--   exist.
create or replace function in_flight_approvals(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with active_si as (
    select s.id, s.project_id, s.current_step,
           (s.chain_snapshot -> s.current_step ->> 'required_role') as req_role
      from site_instructions s
     where s.status in ('submitted','in_review','revision_requested')
  ),
  active_vo as (
    select v.id, v.project_id, v.current_step,
           (v.chain_snapshot -> v.current_step ->> 'required_role') as req_role
      from variation_orders v
     where v.status in ('submitted','in_review','revision_requested')
  )
  select count(*)::int from (
    select 1 from active_si s
      where p_user_id = any(array(select active_role_holders(s.project_id, s.req_role)))
    union all
    select 1 from active_vo v
      where p_user_id = any(array(select active_role_holders(v.project_id, v.req_role)))
    union all
    select 1 from site_instructions where created_by = p_user_id and status = 'revision_requested'
    union all
    select 1 from variation_orders where created_by = p_user_id and status = 'revision_requested'
  ) x;
$$;

-- ── Grants ────────────────────────────────────────────────────
grant execute on function active_role_holders(uuid, text) to authenticated;
grant execute on function in_flight_approvals(uuid) to authenticated;

-- =============================================================
-- End of v9-rls-helpers.sql
-- =============================================================
