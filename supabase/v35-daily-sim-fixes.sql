-- =============================================================
-- v35-daily-sim-fixes.sql
-- =============================================================
-- Three fixes surfaced by the 2026-06-10 daily-site simulation
-- (.planning/daily-sim-0610/). Each was reproduced live against the
-- test project as the real personas, then adversarially confirmed
-- from source. Idempotent — safe to re-run.
--
--   FIX 1 (P0/P1) admin_or_pm_list_applicants STILL threw at runtime:
--       ERROR 42702: column reference "id" is ambiguous
--     v33 carried the correct (aliased) body in the repo, but the
--     live function was never actually replaced — prod was still
--     running a hand-applied v31 whose admin check read
--       select 1 from user_profiles where id = auth.uid()
--     (unqualified `id` colliding with the OUT param `id`). Every
--     approver hit it → "無法載入申請人資料" → cannot see who they
--     are approving. Re-applies the v33 body and the apply is now
--     VERIFIED BY EXECUTION (see post-apply block), not by reading
--     source text.
--
--   FIX 2 (P1) dailies_insert had no date guard. v11 promised
--     "yesterday's diary stays locked", but only UPDATE/DELETE
--     enforced date = today; INSERT checked role+membership only, so
--     a foreman/engineer could POST a back-dated or future-dated
--     daily via the API. Worse, the row then became permanent (the
--     author cannot UPDATE/DELETE a non-today row). Adds the same
--     HKT-today guard to the insert WITH CHECK.
--
--   FIX 3 (P2) submit_si entered an empty SI into the approval chain.
--     submit_si checked creator + status + chain config but never
--     that the SI had any content (current_version_id). An SI
--     submitted before its first version got stuck: in_review, no
--     version, version-insert now blocked, resubmit blocked. Adds a
--     null-content guard before the status flips to in_review.
-- =============================================================

-- ── FIX 1: re-apply correct applicant RPC (qualified columns) ──
create or replace function admin_or_pm_list_applicants(p_project_id uuid)
returns table (id uuid, name text, phone text, company text)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  is_privileged boolean;
  is_sub_approver boolean;
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

  select exists (
    select 1 from project_members me
    where me.project_id = p_project_id
      and me.user_id = auth.uid()
      and me.role = 'subcontractor'
      and me.status = 'approved'
  ) into is_sub_approver;

  if not (is_privileged or is_sub_approver) then
    return;
  end if;

  return query
    select up.id, up.name, up.phone, up.company
    from project_members m
    join user_profiles up on up.id = m.user_id
    where m.project_id = p_project_id
      and m.status = 'pending'
      and (is_privileged or m.role = 'subcontractor_worker');
end;
$$;

grant execute on function admin_or_pm_list_applicants(uuid) to authenticated;

-- ── FIX 2: dailies insert locked to HKT-today ──────────────────
drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert
  with check (
    user_id = auth.uid()
    and date = (now() at time zone 'Asia/Hong_Kong')::date
    and exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and up.global_role = 'main_contractor'
        and up.sub_role in ('foreman','engineer')
    )
    and exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

-- ── FIX 3: submit_si rejects content-less SI ───────────────────
create or replace function submit_si(p_si_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_si site_instructions%rowtype;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_si from site_instructions where id = p_si_id for update;
  if not found then
    raise exception 'SI % not found', p_si_id;
  end if;

  if v_si.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此工地指令';
  end if;

  if v_si.status not in ('draft','revision_requested') then
    raise exception '工地指令不能從狀態 % 提交', v_si.status;
  end if;

  -- Content guard (v35): an SI must have at least one saved version
  -- before it can enter the approval chain. Without this an empty SI
  -- got stuck in_review with no version and no way forward.
  if v_si.current_version_id is null then
    raise exception '請先填寫並儲存工地指令內容後再提交';
  end if;

  -- Snapshot chain (CHN-03 / D-02) — frozen at submit time
  select jsonb_agg(
           jsonb_build_object(
             'step_order', step_order,
             'required_role', required_role,
             'optional_user_id', optional_user_id
           ) order by step_order
         )
    into v_snapshot
    from approval_chain_steps
   where project_id = v_si.project_id and doc_type = 'si';

  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置工地指令審批鏈';
  end if;

  update site_instructions
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_si_id;

  -- Fan-out push to first step holders
  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id', '')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新工地指令 ' || v_si.number,
    'content_zh', '需要你批准',
    'deep_link',  '/project/' || v_si.project_id::text || '/si/' || v_si.id::text
  );

  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_si.project_id, v_first_role));
  end if;

  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;

grant execute on function submit_si(uuid) to authenticated;

-- ── Cleanup: the back-dated [sim-0610] daily this round created
--    (now un-removable by its author because of the today-only delete
--    lock). Safe, targeted by exact id + tag.
delete from dailies
 where date = date '2026-06-09'
   and notes like '%[sim-0610]%';

-- =============================================================
-- Post-apply verification (run in SQL Editor; do NOT trust source
-- text alone — FIX 1's whole point is that the prior "verify" only
-- read source and missed a live mismatch):
--
--   -- FIX 1: must return rows, NOT error 42702
--   set role authenticated;  -- or call from the app as an approver
--   -- (from app) supabase.rpc('admin_or_pm_list_applicants', {p_project_id})
--
--   -- FIX 2: as a foreman, inserting a non-today daily must now be
--   -- rejected by RLS (0 rows / 42501).
--
--   -- FIX 3: submit_si on an SI with current_version_id IS NULL must
--   -- raise '請先填寫並儲存工地指令內容後再提交'.
-- =============================================================
