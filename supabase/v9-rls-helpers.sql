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
--   tables that DO NOT exist when this migration runs. To allow CREATE
--   to succeed before those tables land (Plans 02-02 / 02-06), we use
--   language plpgsql with EXECUTE — the body is a string literal and
--   table references are resolved only at call time. If invoked before
--   the SI/VO tables exist, the function returns 0 (the to_regclass
--   guards short-circuit each branch).
create or replace function in_flight_approvals(p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_si_exists boolean := to_regclass('public.site_instructions') is not null;
  v_vo_exists boolean := to_regclass('public.variation_orders') is not null;
  v_partial int;
begin
  if v_si_exists then
    execute $sql$
      select count(*)::int from (
        select 1
          from site_instructions s
         where s.status in ('submitted','in_review','revision_requested')
           and $1 = any(array(
             select active_role_holders(
               s.project_id,
               (s.chain_snapshot -> s.current_step ->> 'required_role')
             )
           ))
        union all
        select 1 from site_instructions
         where created_by = $1 and status = 'revision_requested'
      ) x
    $sql$ into v_partial using p_user_id;
    v_count := v_count + coalesce(v_partial, 0);
  end if;

  if v_vo_exists then
    execute $sql$
      select count(*)::int from (
        select 1
          from variation_orders v
         where v.status in ('submitted','in_review','revision_requested')
           and $1 = any(array(
             select active_role_holders(
               v.project_id,
               (v.chain_snapshot -> v.current_step ->> 'required_role')
             )
           ))
        union all
        select 1 from variation_orders
         where created_by = $1 and status = 'revision_requested'
      ) x
    $sql$ into v_partial using p_user_id;
    v_count := v_count + coalesce(v_partial, 0);
  end if;

  return v_count;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────
grant execute on function active_role_holders(uuid, text) to authenticated;
grant execute on function in_flight_approvals(uuid) to authenticated;

-- =============================================================
-- End of v9-rls-helpers.sql
-- =============================================================
