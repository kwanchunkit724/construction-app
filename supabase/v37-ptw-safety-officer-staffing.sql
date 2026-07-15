-- =============================================================
-- v37-ptw-safety-officer-staffing.sql
-- =============================================================
-- BUG NEW-1 (P1): every project's default PTW (工作許可證) approval
-- chain is seeded as [safety_officer, main_contractor] by
-- v10-split/6-default-ptw-chain-seed.sql. A chain step's signer is
-- resolved by active_role_holders(project, role) (v9-rls-helpers.sql:24),
-- which for non-pm roles returns APPROVED project_members whose
-- project_members.role = required_role (plus admins, plus delegations).
-- So a "safety_officer holder" = an approved member with
-- project_members.role = 'safety_officer'. If a project has NONE,
-- submit_ptw still froze the chain and the permit dead-locked at step 0
-- with no recovery path for a PM (cross-user member insert → 42501,
-- second-role insert → 23505 unique, AdminProjectChains is admin-only).
-- A legit permit silently bricked.
--
-- FIX (additive, backwards-compatible — staffed projects unaffected):
--   (a) submit_ptw fail-fast guard: BEFORE freezing the chain + flipping
--       status→in_review, verify every chain step's required_role has at
--       least one active holder. If not, raise an actionable zh-HK error
--       instead of dead-locking. Uses the chain the function already
--       reads — does NOT hardcode [safety_officer, main_contractor].
--   (b) pm_assign_safety_officer(project, user): SECURITY DEFINER staffing
--       path. Lets an assigned PM (or admin) promote an APPROVED member to
--       project role 'safety_officer' WITHOUT touching project_members RLS
--       (the role change happens only through this definer RPC).
--
-- NOTE: project_members.role already permits 'safety_officer' on prod
-- (v10-ptw-schema.sql extended the CHECK and live rows already use it), so
-- this migration does NOT touch that constraint — re-stating it risks
-- dropping a value (the live CHECK also includes 'general_foreman' from
-- v13). Only the two functions below are (re)created.
--
-- Apple account-deletion safety: delete_my_account gates on
-- in_flight_approvals, NOT on role, so adding safety_officer role usage is
-- deletion-safe. delete_my_account is NOT touched here.
--
-- Idempotent (create or replace). I (the user) apply this to prod myself.
-- =============================================================

-- ── (a) submit_ptw — EXACT existing body PLUS pre-submit fail-fast guard ──
-- The guard is inserted AFTER the chain snapshot is computed but BEFORE
-- the status→in_review transition commits, so an unstaffed chain raises an
-- actionable error instead of bricking the permit at step 0.
create or replace function submit_ptw(p_ptw_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ptw permits_to_work%rowtype;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
  v_step jsonb;
  v_step_role text;
  v_step_optional uuid;
  v_role_label text;
begin
  select * into v_ptw from permits_to_work where id = p_ptw_id for update;
  if not found then raise exception 'PTW % not found', p_ptw_id; end if;
  if v_ptw.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此工作許可證';
  end if;
  if v_ptw.status not in ('draft','revision_requested') then
    raise exception '工作許可證不能從狀態 % 提交', v_ptw.status;
  end if;

  select jsonb_agg(
           jsonb_build_object('step_order', step_order,
                              'required_role', required_role,
                              'optional_user_id', optional_user_id)
           order by step_order)
    into v_snapshot
    from approval_chain_steps
   where project_id = v_ptw.project_id and doc_type = 'ptw';
  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置工作許可證審批鏈';
  end if;

  -- NEW-1 fail-fast guard: every chain step must have a resolvable signer.
  -- A step pinned to a specific optional_user_id is self-staffed; otherwise
  -- the step's required_role must have at least one active holder. If a step
  -- has neither, raise an actionable zh-HK error so the PM can staff the
  -- project before the permit dead-locks at step 0.
  for v_step in select * from jsonb_array_elements(v_snapshot) loop
    v_step_optional := nullif(v_step ->> 'optional_user_id','')::uuid;
    if v_step_optional is not null then
      continue;
    end if;
    v_step_role := v_step ->> 'required_role';
    if not exists (
      select 1 from active_role_holders(v_ptw.project_id, v_step_role)
    ) then
      v_role_label := case v_step_role
        when 'safety_officer' then '安全主任'
        when 'main_contractor' then '總承建商'
        when 'pm' then '項目經理'
        when 'general_foreman' then '總管工'
        when 'owner' then '業主'
        when 'subcontractor' then '分判'
        else v_step_role
      end;
      raise exception '此項目未有【%】，未能提交工作許可證簽核，請先委派簽核人', v_role_label;
    end if;
  end loop;

  update permits_to_work
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_ptw_id;

  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id','')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新工作許可證 ' || v_ptw.number,
    'content_zh', '需要你簽核',
    'deep_link',  '/project/' || v_ptw.project_id::text || '/ptw/' || v_ptw.id::text
  );
  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_ptw.project_id, v_first_role));
  end if;
  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;
grant execute on function submit_ptw(uuid) to authenticated;

-- ── (c) pm_assign_safety_officer — PM/admin staffing path ────
-- Promotes an APPROVED project member to project role 'safety_officer'
-- so active_role_holders(project,'safety_officer') becomes non-empty and
-- PTW chains can be signed. Role change happens ONLY through this definer
-- RPC, so project_members RLS stays untouched.
create or replace function pm_assign_safety_officer(p_project_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  is_privileged boolean;
begin
  -- Authorisation: caller must be admin OR an assigned PM of this project.
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

  -- Target must be an approved member of this project.
  if not exists (
    select 1 from project_members m
    where m.project_id = p_project_id
      and m.user_id = p_user_id
      and m.status = 'approved'
  ) then
    raise exception '該用戶並非此項目已批准成員';
  end if;

  update project_members
     set role = 'safety_officer'
   where project_id = p_project_id
     and user_id = p_user_id;
end;
$$;
grant execute on function pm_assign_safety_officer(uuid, uuid) to authenticated;

-- =============================================================
-- Post-apply verification (run as the PM of an unstaffed project):
--
--   -- 0. Pick an unstaffed project + an approved non-safety member.
--   --    Before staffing, active_role_holders for safety_officer is empty:
--   select * from active_role_holders('<project_id>', 'safety_officer');  -- expect 0 rows
--
--   -- 1. submit_ptw on a draft PTW in that project must now RAISE
--   --    '此項目未有【安全主任】...' instead of dead-locking:
--   select submit_ptw('<draft_ptw_id>');  -- expect ERROR (actionable zh-HK)
--
--   -- 2. As the PM, staff a safety officer:
--   select pm_assign_safety_officer('<project_id>', '<approved_member_id>');
--
--   -- 3. Holder now resolves:
--   select * from active_role_holders('<project_id>', 'safety_officer');  -- expect 1+ rows
--
--   -- 4. submit_ptw now succeeds (status → in_review):
--   select submit_ptw('<draft_ptw_id>');
--   select status from permits_to_work where id = '<draft_ptw_id>';  -- expect in_review
--
--   -- 5. Auth negative: a non-PM/non-admin caller must be rejected:
--   --    select pm_assign_safety_officer(...) → ERROR '只有項目經理或管理員可委派安全主任'
-- =============================================================
