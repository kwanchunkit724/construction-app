-- =============================================================
-- v9-rpc-submit-approval.sql — Chain-write gate
-- =============================================================
-- Client cannot INSERT into approvals directly (RLS denies).
-- This SECURITY DEFINER RPC validates the caller is in
-- active_role_holders for the current step (or admin for
-- admin_override), then inserts the approvals row. The
-- AFTER INSERT trigger trg_approval_created (Plan 02-02)
-- handles chain advancement and push fan-out.
--
-- Lesson from 02-01: variation_orders ships in Plan 02-06.
-- All references to it use plpgsql + EXECUTE so the function
-- compiles cleanly today (table refs resolve at call time, not
-- CREATE-FUNCTION parse time).
-- =============================================================

drop function if exists submit_approval(text, uuid, approval_action_type, text, jsonb) cascade;

create or replace function submit_approval(
  p_doc_type text,
  p_doc_id uuid,
  p_action_type approval_action_type,
  p_reason text default null,
  p_edits_jsonb jsonb default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project_id uuid;
  v_chain jsonb;
  v_current_step int;
  v_status text;
  v_required_role text;
  v_optional_user uuid;
  v_holders uuid[];
  v_is_admin boolean;
  v_delegated_for uuid;
  v_grantor uuid;
  v_approval_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_doc_type not in ('si','vo') then raise exception 'unsupported doc_type %', p_doc_type; end if;

  -- FOR UPDATE locks the doc row preventing concurrent-approver race (T-02-03).
  if p_doc_type = 'si' then
    select project_id, chain_snapshot, current_step, status
      into v_project_id, v_chain, v_current_step, v_status
      from site_instructions where id = p_doc_id for update;
  else
    -- variation_orders lands in Plan 02-06; defer ref to call time via EXECUTE.
    if to_regclass('public.variation_orders') is null then
      raise exception 'variation_orders not yet provisioned (Plan 02-06)';
    end if;
    execute 'select project_id, chain_snapshot, current_step, status from variation_orders where id = $1 for update'
      into v_project_id, v_chain, v_current_step, v_status using p_doc_id;
  end if;

  if v_project_id is null then raise exception 'doc not found'; end if;
  if v_chain is null then raise exception 'doc not submitted'; end if;
  if v_status in ('locked','rejected') then raise exception 'doc is terminal (status=%)', v_status; end if;

  -- Reason length check matches the table CHECK (defence-in-depth for UX).
  if p_action_type in ('request_revision','reject','admin_override')
     and length(coalesce(p_reason,'')) < 10 then
    raise exception '需要至少 10 個字元嘅原因';
  end if;

  v_required_role := v_chain -> v_current_step ->> 'required_role';
  v_optional_user := nullif(v_chain -> v_current_step ->> 'optional_user_id','')::uuid;
  v_is_admin := exists (select 1 from user_profiles where id = v_uid and global_role = 'admin');

  if p_action_type = 'admin_override' then
    if not v_is_admin then raise exception 'admin_override requires admin role'; end if;
  else
    -- Validate caller is allowed to act for this step.
    if v_optional_user is not null then
      if v_uid <> v_optional_user and not v_is_admin then
        raise exception 'this step is reserved for a specific user';
      end if;
    else
      v_holders := array(select active_role_holders(v_project_id, v_required_role));
      if not (v_uid = any(v_holders)) and not v_is_admin then
        raise exception '你冇權批准呢個步驟';
      end if;
    end if;

    -- Delegation tracking: if caller acts via delegation, find grantor.
    select user_id into v_grantor
      from delegations
     where delegate_to = v_uid
       and current_date between valid_from and valid_until
       and exists (
         select 1 from project_members pm
          where pm.project_id = v_project_id
            and pm.user_id = delegations.user_id
            and pm.status = 'approved'
            and pm.role = v_required_role
       )
     limit 1;
    v_delegated_for := v_grantor;
  end if;

  -- BLOCKER 1 fix: approve_with_edits writes the new si_versions row server-side
  -- in the SAME transaction as the approvals INSERT. This closes the audit-gap and
  -- removes the two-write race window from SiContext (Plan 02-04 Task 5).
  if p_action_type = 'approve_with_edits' and p_edits_jsonb is not null then
    if p_doc_type = 'si' then
      declare
        v_next_ver int;
        v_new_version_id uuid;
      begin
        select coalesce(max(version_no), 0) + 1 into v_next_ver
          from si_versions where si_id = p_doc_id;
        -- Bypasses si_versions RLS because SECURITY DEFINER runs as definer.
        insert into si_versions (si_id, version_no, payload, edits_by)
          values (p_doc_id, v_next_ver, p_edits_jsonb, v_uid)
          returning id into v_new_version_id;
        update site_instructions set current_version_id = v_new_version_id where id = p_doc_id;
      end;
    elsif p_doc_type = 'vo' then
      -- VO equivalent lands in Plan 02-06: vo_versions write here. The recompute_vo_totals
      -- trigger (Plan 02-06) ensures total_amount_cents is server-recomputed before commit.
      declare
        v_next_ver int;
        v_new_version_id uuid;
      begin
        execute 'select coalesce(max(version_no), 0) + 1 from vo_versions where vo_id = $1'
          into v_next_ver using p_doc_id;
        execute 'insert into vo_versions (vo_id, version_no, payload, edits_by) values ($1,$2,$3,$4) returning id'
          into v_new_version_id using p_doc_id, v_next_ver, p_edits_jsonb, v_uid;
        execute 'update variation_orders set current_version_id = $1 where id = $2'
          using v_new_version_id, p_doc_id;
      end;
    end if;
  end if;

  insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, delegated_for_user_id, reason, edits_jsonb)
  values (p_doc_type, p_doc_id, v_current_step, p_action_type, v_uid, v_delegated_for, p_reason, p_edits_jsonb)
  returning id into v_approval_id;

  return v_approval_id;
end;
$$;

revoke all on function submit_approval(text, uuid, approval_action_type, text, jsonb) from public;
grant execute on function submit_approval(text, uuid, approval_action_type, text, jsonb) to authenticated;
