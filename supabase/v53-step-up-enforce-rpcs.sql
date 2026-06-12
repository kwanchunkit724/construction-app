-- =============================================================
-- v53-step-up-enforce-rpcs.sql   (Security upgrade Phase 2 / Part B enforcement)
-- =============================================================
-- Wires server-side step-up enforcement into the high-risk RPCs against the
-- v52-step-up-foundation.sql CONTRACT. Each function below is re-created with
-- its CURRENT (highest-version) body VERBATIM, plus a SINGLE line
--   perform assert_step_up('<action_class>');
-- inserted IMMEDIATELY AFTER the function's existing authorization / permission
-- checks and BEFORE any mutation. Ordering matters:
--   * an UNAUTHORIZED caller still hits the original permission error first
--     (assert_step_up is reached only after the auth gate passes), and
--   * a PERMITTED-but-not-stepped-up caller gets '此操作需要二步驗證確認'
--     BEFORE any write happens.
-- assert_step_up does NOT consume the grant (multi-use, 5-min TTL), so a single
-- mint covers a batch of same-class actions.
--
-- Each re-created function preserves its ORIGINAL signature, language,
-- security definer, set search_path (and any other SET clauses), and grants.
-- All wirings use `create or replace` and are idempotent.
--
-- WIRED (source file -> action_class):
--   submit_approval            v10-submit-approval-add-ptw.sql  -> approval
--   record_ptw_signoff         v10-split/5-fix-acted-at.sql     -> approval
--   save_chain_steps           v9-default-chain-seed.sql        -> approval
--   pm_assign_safety_officer   v50-membership-role-escalation-guard.sql -> approval
--   admin_update_user_role     v17-user-profiles-rls-hardening.sql -> membership
--   review_document_version    v40-split/4-rpcs.sql             -> document
--   withdraw_document_version  v40-split/4-rpcs.sql             -> document
--   delete_my_account          v9-account-deletion-extend.sql   -> account_delete
--
-- NOT wired here (out of scope for the named-RPC list / no single RPC found):
--   progress_delete action_class — see TODO note at the foot of this file.
--
-- NON-DESTRUCTIVE: replaces function bodies only. No table/data changes.
-- =============================================================

-- ── 1. submit_approval -> approval ───────────────────────────
-- Source: v10-submit-approval-add-ptw.sql (latest body; v9 + ptw doc_type).
-- assert_step_up placed right after the per-step authorization block
-- (admin_override / optional_user / active_role_holders gates and the
-- delegation lookup), i.e. after the last permission raise '你冇權批准呢個步驟'
-- and before the first mutation (the approve_with_edits version insert / the
-- main approvals insert).
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

-- ── 2. record_ptw_signoff -> approval ────────────────────────
-- Source: v10-split/5-fix-acted-at.sql (latest body; created_at fix).
-- The authorization gate here is implicit: the caller must own an unsigned
-- 'ptw' approval row (a.actor_id = v_uid). assert_step_up placed right after
-- that '找不到對應嘅簽核紀錄' raise (so a caller with no such approval still
-- gets the original error first) and before the permit_signoffs insert.
create or replace function record_ptw_signoff(
  p_ptw_id uuid,
  p_signature_b64 text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_approval_id uuid;
  v_signoff_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_signature_b64 is null or length(p_signature_b64) < 100 then
    raise exception '需要簽名';
  end if;
  select a.id
    into v_approval_id
    from approvals a
   where a.doc_type = 'ptw'
     and a.doc_id = p_ptw_id
     and a.actor_id = v_uid
     and not exists (select 1 from permit_signoffs s where s.approval_id = a.id)
   order by a.created_at desc
   limit 1;
  if v_approval_id is null then
    raise exception '找不到對應嘅簽核紀錄 — 請先批准呢張工作許可證';
  end if;
  -- v53 step-up: authorization (owns an unsigned approval) passed; require MFA grant before signing.
  perform assert_step_up('approval');
  insert into permit_signoffs (approval_id, ptw_id, signature_b64)
  values (v_approval_id, p_ptw_id, p_signature_b64)
  returning id into v_signoff_id;
  return v_signoff_id;
end;
$$;
revoke all on function record_ptw_signoff(uuid, text) from public;
grant execute on function record_ptw_signoff(uuid, text) to authenticated;

-- ── 3. save_chain_steps -> approval ──────────────────────────
-- Source: v9-default-chain-seed.sql (latest body).
-- assert_step_up placed right after the admin-OR-assigned-PM permission raise
-- '只有管理員或本項目項目經理可以編輯簽核流程' and before the
-- delete-then-insert mutation.
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

  -- v53 step-up: chain-edit authorization passed; require MFA grant before mutating the chain.
  perform assert_step_up('approval');

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

-- ── 4. pm_assign_safety_officer -> approval ──────────────────
-- Source: v50-membership-role-escalation-guard.sql (LATEST body — sets
-- app.member_role_change to opt through the role-escalation guard trigger).
-- assert_step_up placed after the privilege raise '只有項目經理或管理員可委派安全主任'
-- AND after the member-existence validation '該用戶並非此項目已批准成員',
-- but BEFORE the first mutation (set_config + update). Placing it before
-- set_config ensures no txn-local state is altered by an un-stepped-up caller.
create or replace function pm_assign_safety_officer(p_project_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  is_privileged boolean;
begin
  select (
    exists (
      select 1 from user_profiles up
      where up.id = auth.uid() and up.global_role = 'admin'
    )
    or exists (
      select 1 from projects p
      where p.id = p_project_id and auth.uid() = any(p.assigned_pm_ids)
    )
  ) into is_privileged;

  if not is_privileged then
    raise exception '只有項目經理或管理員可委派安全主任';
  end if;

  if not exists (
    select 1 from project_members m
    where m.project_id = p_project_id
      and m.user_id = p_user_id
      and m.status = 'approved'
  ) then
    raise exception '該用戶並非此項目已批准成員';
  end if;

  -- v53 step-up: privilege + member checks passed; require MFA grant before the role write.
  perform assert_step_up('approval');

  -- Opt through the role-escalation guard for this one sanctioned write.
  perform set_config('app.member_role_change', 'on', true);

  update project_members
     set role = 'safety_officer'
   where project_id = p_project_id
     and user_id = p_user_id;
end;
$$;
grant execute on function pm_assign_safety_officer(uuid, uuid) to authenticated;

-- ── 5. admin_update_user_role -> membership ──────────────────
-- Source: v17-user-profiles-rls-hardening.sql (latest body).
-- NOTE preserves BOTH `set search_path = public` and `set row_security = off`.
-- assert_step_up placed right after the 'admin only' permission raise and
-- before the user_profiles update.
create or replace function admin_update_user_role(
  p_target uuid,
  p_global_role text,
  p_sub_role text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1 from user_profiles
    where user_profiles.id = auth.uid()
      and user_profiles.global_role = 'admin'
  ) then
    raise exception 'admin only';
  end if;
  -- v53 step-up: admin authorization passed; require MFA grant before the role write.
  perform assert_step_up('membership');
  update user_profiles
  set global_role = p_global_role,
      sub_role = nullif(p_sub_role, '')::text
  where user_profiles.id = p_target;
end;
$$;
grant execute on function admin_update_user_role(uuid, text, text) to authenticated;

-- ── 6. review_document_version -> document ───────────────────
-- Source: v40-split/4-rpcs.sql (latest body).
-- assert_step_up placed after BOTH the can_review_document gate ('沒有審批權限')
-- and the self-review block ('不可審批自己提交的文件'), i.e. after the last
-- authorization raise and before the document_versions update.
create or replace function review_document_version(
  p_version_id uuid,
  p_action text,
  p_note text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
  v_project uuid;
  v_submitted_by uuid;
  v_status text;
  v_is_admin boolean;
  v_new_status text;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_action not in ('approve','reject') then
    raise exception '未知審批動作: %', p_action;
  end if;
  if p_action = 'reject' and (p_note is null or btrim(p_note) = '') then
    raise exception '拒絕文件必須填寫原因';
  end if;

  select dv.document_id, dv.submitted_by, dv.status, d.project_id
    into v_doc_id, v_submitted_by, v_status, v_project
    from document_versions dv
    join documents d on d.id = dv.document_id
   where dv.id = p_version_id;
  if v_doc_id is null then
    raise exception '找不到文件版本';
  end if;
  if v_status <> 'submitted' then
    raise exception '只有【已送審】的版本可以審批（目前狀態: %）', v_status;
  end if;

  -- B1 in-body authorization gate (was the "Reviewers review version" UPDATE
  -- policy under the old invoker design).
  if not can_review_document(v_uid, v_project) then
    raise exception '沒有審批權限';
  end if;

  select exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    into v_is_admin;

  -- Self-review block — a submitter cannot approve/reject their own
  -- submission unless they are a global admin. `is distinct from` keeps the
  -- NULL submitted_by case (deleted uploader) from accidentally matching.
  if v_submitted_by is not distinct from v_uid and not v_is_admin then
    raise exception '不可審批自己提交的文件';
  end if;

  -- v53 step-up: review authorization passed; require MFA grant before the status write.
  perform assert_step_up('document');

  v_new_status := case when p_action = 'approve' then 'approved' else 'rejected' end;

  update document_versions
     set status = v_new_status,
         reviewed_by = v_uid,
         reviewed_at = now(),
         review_note = p_note
   where id = p_version_id
     and status = 'submitted';   -- guard against a concurrent state change

  -- B2: never log an event for an UPDATE that hit 0 rows (would forge an
  -- audit row). B1 already gates this, so this is belt-and-braces — it also
  -- catches the race where the version left 'submitted' between the SELECT
  -- and the UPDATE.
  if not found then
    raise exception '沒有審批權限';
  end if;

  perform log_document_event(v_doc_id, p_version_id, v_new_status, v_uid, p_note);
end;
$$;
grant execute on function review_document_version(uuid, text, text) to authenticated;

-- ── 7. withdraw_document_version -> document ─────────────────
-- Source: v40-split/4-rpcs.sql (latest body).
-- assert_step_up placed right after the uploader-or-admin permission raise
-- '只有上載者或管理員可以撤回' and before the v_was_current read + the
-- document_versions update.
create or replace function withdraw_document_version(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
  v_submitted_by uuid;
  v_is_admin boolean;
  v_was_current boolean;
  v_next_current uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;

  select dv.document_id, dv.submitted_by
    into v_doc_id, v_submitted_by
    from document_versions dv
   where dv.id = p_version_id;
  if v_doc_id is null then
    raise exception '找不到文件版本';
  end if;

  select exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    into v_is_admin;

  -- Authorisation mirrors the v8 "Uploader or admin withdraws" rule.
  -- NULL-safe: if submitted_by is NULL (uploader account deleted), only an
  -- admin may withdraw — `is distinct from` keeps the NULL case non-true.
  if (v_submitted_by is distinct from v_uid) and not v_is_admin then
    raise exception '只有上載者或管理員可以撤回';
  end if;

  -- v53 step-up: uploader-or-admin authorization passed; require MFA grant before the withdraw write.
  perform assert_step_up('document');

  select (current_version_id = p_version_id) into v_was_current
    from documents where id = v_doc_id;

  update document_versions
     set status = 'withdrawn', withdrawn_at = now()
   where id = p_version_id;

  -- B2 belt-and-braces: don't log a 'withdrawn' audit row if the UPDATE hit
  -- 0 rows (the version vanished between the SELECT and here). The in-body
  -- uploader-or-admin gate above is the real authorization.
  if not found then
    raise exception '找不到文件版本';
  end if;

  -- Rebind the current pointer if we just withdrew it.
  if coalesce(v_was_current, false) then
    select id into v_next_current
      from document_versions
     where document_id = v_doc_id
       and status <> 'withdrawn'
     order by version_no desc
     limit 1;

    update documents
       set current_version_id = v_next_current,
           updated_at = now()
     where id = v_doc_id;
  end if;

  perform log_document_event(v_doc_id, p_version_id, 'withdrawn', v_uid, null);
end;
$$;
grant execute on function withdraw_document_version(uuid) to authenticated;

-- ── 8. delete_my_account -> account_delete ───────────────────
-- Source: v9-account-deletion-extend.sql (latest body; returns json).
-- assert_step_up placed after the auth check and the in-flight-approvals guard
-- (both of which RETURN a json error, not raise) and immediately before the
-- destructive `delete from auth.users`.
-- NOTE: assert_step_up RAISES (it does not return json), so an authenticated,
-- non-blocked, but NOT-stepped-up caller receives a raised exception
-- ('此操作需要二步驗證確認') rather than a {ok:false,...} json object. This is
-- the intended fail-closed behaviour for the account-delete step-up; the
-- client should surface the raised error. Apple Guideline 5.1.1(v): the
-- happy-path delete still succeeds once the caller has a fresh AAL2 grant.
create or replace function public.delete_my_account()
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pending int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '未登入');
  end if;

  -- ── In-flight approval guard (CHN-09 / T-02-06) ────────────
  v_pending := in_flight_approvals(v_uid);
  if v_pending > 0 then
    return json_build_object(
      'ok', false,
      'blocked', true,
      'pending', v_pending,
      'error', '你尚有 ' || v_pending || ' 項待處理嘅簽核工作，需要管理員重新分派後先可以刪除帳戶。'
    );
  end if;

  -- v53 step-up: caller authenticated and not blocked; require MFA grant before the destructive delete.
  perform assert_step_up('account_delete');

  -- BEGIN: preserved verbatim from v6-account-deletion.sql
  -- Apple compliance: this path is unchanged from v6. The new
  -- in_flight_approvals guard above returns BEFORE this path runs
  -- only when the user has pending approvals; users with zero
  -- pending approvals still delete successfully and return {ok:true}.
  --
  -- Delete the auth user. ON DELETE CASCADE on user_profiles.id
  -- removes the profile and all dependents (project_members, etc.)
  -- Authored content FKs were loosened in v6 (set null on delete)
  -- so projects.created_by + project_members.approved_by become NULL.
  delete from auth.users where id = v_uid;
  -- END: preserved verbatim from v6

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'v9 extension of v6 RPC. Returns json. Blocks delete when in_flight_approvals(caller) > 0 with zh-HK error message; otherwise preserves v6 cascade (auth.users delete + dependent cascades). v53: requires a fresh AAL2 step-up grant (action_class=account_delete) before the destructive delete. Apple Guideline 5.1.1(v) compliance preserved for users with zero pending approvals.';

-- =============================================================
-- TODO / NOT WIRED (could not safely wire from the named list):
--   * progress_delete action_class — the v52 contract reserves a
--     'progress_delete' class, but the TASK did not name a delete-progress
--     RPC, and no single SECURITY DEFINER RPC named delete_progress_item /
--     delete_progress / progress_delete was located via grep. Progress-item
--     deletion appears to go through RLS-gated DELETEs on progress_items /
--     progress_leaf_items rather than a step-up-able RPC, which assert_step_up
--     cannot intercept (RLS policies cannot call a definer-only assert).
--     Wiring 'progress_delete' therefore needs either (a) a new
--     delete_progress_item RPC to funnel deletes through, or (b) a BEFORE
--     DELETE trigger that calls assert_step_up('progress_delete'). Deferred —
--     out of scope for this enforce-existing-RPCs migration.
--
-- Post-apply verification (execute, not source):
--   -- As a permitted caller WITHOUT a fresh AAL2 grant, each RPC below must
--   -- raise '此操作需要二步驗證確認' BEFORE any write:
--   --   submit_approval('si', <id>, 'approve');
--   --   record_ptw_signoff(<ptw_id>, <sig>);
--   --   save_chain_steps(<project_id>, 'si', '[...]'::jsonb);
--   --   pm_assign_safety_officer(<project_id>, <user_id>);
--   --   admin_update_user_role(<target>, 'pm', null);
--   --   review_document_version(<ver_id>, 'approve');
--   --   withdraw_document_version(<ver_id>);
--   --   delete_my_account();
--   -- As an UNAUTHORIZED caller, each must still raise its ORIGINAL permission
--   -- error first (step-up is reached only after the auth gate passes).
--   -- After mint_step_up_grant(<class>) on an AAL2 session, the same call as a
--   -- permitted caller succeeds (grant is multi-use within 5-min TTL).
-- =============================================================
