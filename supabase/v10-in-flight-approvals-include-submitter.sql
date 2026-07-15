-- =============================================================
-- v10-in-flight-approvals-include-submitter.sql
-- =============================================================
-- Extends in_flight_approvals() so the SUBMITTER of an unresolved
-- SI / VO / PTW is counted while status is 'submitted' or
-- 'in_review' (previously only 'revision_requested' counted the
-- submitter — but the submitter is part of the approval chain
-- from the moment they submit).
--
-- Apple Guideline 5.1.1(v): delete_my_account() depends on this
-- helper to refuse account deletion while the user owns dangling
-- approval work. The @delete-account-smoke spec (Plan 02-09
-- regression) submits an SI as subcon then attempts deletion;
-- with the old function the submitter was not counted while
-- status='submitted' and the cascade-delete would fail on
-- site_instructions.created_by_fkey instead of returning the
-- {ok:false, blocked:true, pending:N} guard payload.
--
-- Also adds the PTW branch (Plan 03 added permits_to_work but
-- the v9 helper predated that table).
--
-- NON-DESTRUCTIVE: function body replacement, no data writes.
-- IDEMPOTENT: create or replace.
-- =============================================================

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
  v_ptw_exists boolean := to_regclass('public.permits_to_work') is not null;
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
         where created_by = $1
           and status in ('submitted','in_review','revision_requested')
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
         where created_by = $1
           and status in ('submitted','in_review','revision_requested')
      ) x
    $sql$ into v_partial using p_user_id;
    v_count := v_count + coalesce(v_partial, 0);
  end if;

  if v_ptw_exists then
    execute $sql$
      select count(*)::int from (
        select 1
          from permits_to_work p
         where p.status in ('submitted','in_review','revision_requested')
           and $1 = any(array(
             select active_role_holders(
               p.project_id,
               (p.chain_snapshot -> p.current_step ->> 'required_role')
             )
           ))
        union all
        select 1 from permits_to_work
         where created_by = $1
           and status in ('submitted','in_review','revision_requested')
      ) x
    $sql$ into v_partial using p_user_id;
    v_count := v_count + coalesce(v_partial, 0);
  end if;

  return v_count;
end;
$$;

grant execute on function in_flight_approvals(uuid) to authenticated;

-- Post-apply verification:
--   select prosrc from pg_proc where proname='in_flight_approvals';
--     -- must contain "permits_to_work" and three occurrences of
--     -- "status in ('submitted','in_review','revision_requested')"
