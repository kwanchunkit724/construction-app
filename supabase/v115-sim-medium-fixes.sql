-- =============================================================
-- v115-sim-medium-fixes.sql
-- Follow-up to v114 / lifecycle simulation medium items:
--   M4  VO approve requires sign_reauth (same non-repudiation
--       gate as PTW/form signoffs) for approve / approve_with_edits /
--       admin_override. Reject / request_revision stay step-up only.
--   pending_users  Legacy table (plaintext password column, RLS off,
--       unused by app — 0 rows, no client/RPC references). Enable RLS
--       with deny-by-default for authenticated/anon; admin SELECT only
--       so the table cannot leak if anything ever writes to it again.
-- Idempotent.
-- =============================================================

-- ── M4: submit_approval — VO money path needs assert_sign_reauth ─
create or replace function public.submit_approval(
  p_doc_type text,
  p_doc_id uuid,
  p_action_type approval_action_type,
  p_reason text default null,
  p_edits_jsonb jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  perform assert_step_up('approval');

  -- VO approvals move money on the contract. Require the same fresh-password
  -- proof used for PTW / form e-signatures (no-op while sign_reauth_enforced
  -- is false). Reject / request_revision stay step-up only.
  if p_doc_type = 'vo'
     and p_action_type in ('approve', 'approve_with_edits', 'admin_override') then
    perform assert_sign_reauth();
  end if;

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
  end if;

  insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, delegated_for_user_id, reason, edits_jsonb)
  values (p_doc_type, p_doc_id, v_current_step, p_action_type, v_uid, v_delegated_for, p_reason, p_edits_jsonb)
  returning id into v_approval_id;

  return v_approval_id;
end;
$function$;

revoke all on function public.submit_approval(text, uuid, approval_action_type, text, jsonb) from public;
grant execute on function public.submit_approval(text, uuid, approval_action_type, text, jsonb) to authenticated;

-- ── pending_users: lock down unused legacy table ──────────────
-- Contains a plaintext `password` column. App uses project_members for
-- applications; this table has 0 rows and no code references. Enable RLS
-- and only allow global admins to SELECT (no insert/update/delete for
-- authenticated) so accidental writes or anon reads cannot leak credentials.
alter table public.pending_users enable row level security;

drop policy if exists "pending_users_admin_select" on public.pending_users;
create policy "pending_users_admin_select"
  on public.pending_users for select to authenticated
  using (exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  ));

-- No insert/update/delete policies for authenticated/anon → denied by default.
revoke insert, update, delete on public.pending_users from authenticated, anon;
grant select on public.pending_users to authenticated;

-- =============================================================
-- End of v115-sim-medium-fixes.sql
-- =============================================================
