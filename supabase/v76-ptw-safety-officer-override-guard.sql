-- =============================================================
-- v76-ptw-safety-officer-override-guard.sql
-- =============================================================
-- FUNCTION-REVIEW fix #1 (safety-critical). The v9 chain schema promised that
-- PTW would REFUSE to satisfy a mandatory safety_officer step via admin_override
-- (a 工作許可證 hot-work / confined-space permit must carry a real safety-officer
-- sign-off, not an admin shortcut). Phase 3 shipped without that refusal:
-- submit_approval's admin_override branch (latest body in v53-step-up-enforce-rpcs.sql)
-- only checks v_is_admin, so an admin could advance a PTW past its safety_officer
-- step. blocking at submit_approval is the chokepoint — if the approval insert is
-- refused, the dispatch trigger (v10-split/3) never advances the chain.
--
-- This re-creates submit_approval with its v53 body VERBATIM plus ONE guard
-- inside the admin_override branch:
--   if p_doc_type='ptw' and v_required_role='safety_officer' -> raise.
-- Everything else (step-up assert, optional_user/active_role_holders gates,
-- approve_with_edits, the approvals insert, signature/grants) is unchanged.
--
-- Additive + idempotent (create or replace). No table/data changes. Affects ONLY
-- the ptw + safety_officer + admin_override path; SI/VO and all other PTW steps
-- are untouched.
-- =============================================================

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
  if p_doc_type not in ('si','vo','ptw') then raise exception 'unsupported doc_type %', p_doc_type; end if;

  if p_doc_type = 'si' then
    select project_id, chain_snapshot, current_step, status
      into v_project_id, v_chain, v_current_step, v_status
      from site_instructions where id = p_doc_id for update;
  elsif p_doc_type = 'vo' then
    if to_regclass('public.variation_orders') is null then
      raise exception 'variation_orders not yet provisioned (Plan 02-06)';
    end if;
    execute 'select project_id, chain_snapshot, current_step, status from variation_orders where id = $1 for update'
      into v_project_id, v_chain, v_current_step, v_status using p_doc_id;
  else
    -- ptw
    if to_regclass('public.permits_to_work') is null then
      raise exception 'permits_to_work not yet provisioned (Plan 03)';
    end if;
    execute 'select project_id, chain_snapshot, current_step, status::text from permits_to_work where id = $1 for update'
      into v_project_id, v_chain, v_current_step, v_status using p_doc_id;
  end if;

  if v_project_id is null then raise exception 'doc not found'; end if;
  if v_chain is null then raise exception 'doc not submitted'; end if;
  if v_status in ('locked','rejected') then raise exception 'doc is terminal (status=%)', v_status; end if;

  if p_action_type in ('request_revision','reject','admin_override')
     and length(coalesce(p_reason,'')) < 10 then
    raise exception '需要至少 10 個字元嘅原因';
  end if;

  v_required_role := v_chain -> v_current_step ->> 'required_role';
  v_optional_user := nullif(v_chain -> v_current_step ->> 'optional_user_id','')::uuid;
  v_is_admin := exists (select 1 from user_profiles where id = v_uid and global_role = 'admin');

  if p_action_type = 'admin_override' then
    if not v_is_admin then raise exception 'admin_override requires admin role'; end if;
    -- v76 fix #1: a mandatory safety_officer step on a 工作許可證 (PTW) must be
    -- satisfied by a real safety-officer sign-off, never by admin shortcut.
    if p_doc_type = 'ptw' and v_required_role = 'safety_officer' then
      raise exception '安全主任簽核步驟不可以用管理員指派代替，必須由安全主任親自簽核';
    end if;
  else
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

  -- v53 step-up: authorization passed above; require a fresh MFA grant before any write.
  perform assert_step_up('approval');

  if p_action_type = 'approve_with_edits' and p_edits_jsonb is not null then
    if p_doc_type = 'si' then
      declare
        v_next_ver int;
        v_new_version_id uuid;
      begin
        select coalesce(max(version_no), 0) + 1 into v_next_ver
          from si_versions where si_id = p_doc_id;
        insert into si_versions (si_id, version_no, payload, edits_by)
          values (p_doc_id, v_next_ver, p_edits_jsonb, v_uid)
          returning id into v_new_version_id;
        update site_instructions set current_version_id = v_new_version_id where id = p_doc_id;
      end;
    elsif p_doc_type = 'vo' then
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
    -- ptw: approve_with_edits not supported (no permit_versions edit flow today).
  end if;

  insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, delegated_for_user_id, reason, edits_jsonb)
  values (p_doc_type, p_doc_id, v_current_step, p_action_type, v_uid, v_delegated_for, p_reason, p_edits_jsonb)
  returning id into v_approval_id;

  return v_approval_id;
end;
$$;

revoke all on function submit_approval(text, uuid, approval_action_type, text, jsonb) from public;
grant execute on function submit_approval(text, uuid, approval_action_type, text, jsonb) to authenticated;

-- Verify (execute, not source):
--   select pg_get_functiondef('submit_approval(text,uuid,approval_action_type,text,jsonb)'::regprocedure)
--     like '%安全主任簽核步驟不可以用管理員指派代替%';  -- expect t
-- Functional: as admin, admin_override on a ptw whose current step required_role='safety_officer'
--   must raise; admin_override on a non-safety_officer ptw step OR on si/vo is unaffected.
