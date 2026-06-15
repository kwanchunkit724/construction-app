-- =============================================================
-- v65-weather-foreman-and-signer-rpc.sql   (post-update follow-up actions)
-- =============================================================
-- TWO actions from the follow-up review. (The third — "unify can_edit vs
-- can_manage role-source" — turned out MOOT: both can_edit_project_progress
-- (v3:64-69) and can_manage_project_progress (v27:28-42) ALREADY key on the
-- per-project project_members.role, NOT global_role. The earlier note was based
-- on a misread; no change is needed and none is made here.)
--
--  #1  Let a 大判工頭 (general_foreman) file/edit weather EOT (工期延誤) claims.
--      Today project_weather_claims writes gate on can_edit_project_progress
--      = membership role ∈ (pm, main_contractor, subcontractor). general_foreman
--      is a SUPERVISOR membership role (can_manage_project_progress =
--      pm, general_foreman, main_contractor) and plausibly records weather
--      delays on site. We broaden the three pwc write policies to
--      (can_edit OR can_manage) — net effective set becomes
--      {pm, main_contractor, subcontractor, general_foreman} (+ admin + assigned
--      PM, which both helpers already include). Both helpers are membership-role,
--      SECURITY DEFINER, and already used across the app. SELECT + the module
--      conjuncts are unchanged. Additive (only WIDENS who can write); no existing
--      writer loses access.
--
--  #3  get_form_signer_profiles(p_project_id): SECURITY DEFINER name-resolver so
--      the equipment-register export shows REAL signer names even for users RLS
--      would hide (e.g. ex-members) — mirrors get_issue_actor_profiles (v47).
--      Gated on can_view_project; row_security off so historical signers resolve.
-- Idempotent. Apply on prod.
-- =============================================================

-- ── #1  project_weather_claims writes: can_edit OR can_manage ─────────────────
-- Re-create the v59-modules-rls-2 module-gated weather write policies, swapping
-- the lone can_edit_project_progress gate for (can_edit OR can_manage) so
-- general_foreman is included. SELECT (pwc_select) is intentionally left as-is.
drop policy if exists pwc_insert on project_weather_claims;
create policy pwc_insert on project_weather_claims for insert to authenticated
  with check (
    (can_edit_project_progress(auth.uid(), project_id)
       or can_manage_project_progress(auth.uid(), project_id))
    and recorded_by = auth.uid()
    and project_module_enabled(project_id, 'weather')
  );

drop policy if exists pwc_update on project_weather_claims;
create policy pwc_update on project_weather_claims for update to authenticated
  using (
    (can_edit_project_progress(auth.uid(), project_id)
       or can_manage_project_progress(auth.uid(), project_id))
    and project_module_enabled(project_id, 'weather')
  );

-- pwc_delete: v58 gated on can_edit only, NOT module-gated (deletes never are).
-- Keep that posture; just add the can_manage branch for general_foreman parity.
drop policy if exists pwc_delete on project_weather_claims;
create policy pwc_delete on project_weather_claims for delete to authenticated
  using (
    can_edit_project_progress(auth.uid(), project_id)
      or can_manage_project_progress(auth.uid(), project_id)
  );

-- ── #3  get_form_signer_profiles — name-resolver for the equipment register ───
-- form_signoffs carries project_id + signed_by (v55:75,78) directly, so no join.
create or replace function get_form_signer_profiles(p_project_id uuid)
returns table (id uuid, name text)
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
begin
  -- Same gate as the equipment/forms SELECT policies: if the caller can't view
  -- this project, return nothing.
  if not can_view_project(auth.uid(), p_project_id) then
    return;
  end if;

  return query
    select distinct up.id, up.name
    from user_profiles up
    where up.id in (
      select fs.signed_by
      from form_signoffs fs
      where fs.project_id = p_project_id
        and fs.signed_by is not null
    );
end;
$$;
revoke all on function get_form_signer_profiles(uuid) from public;
grant execute on function get_form_signer_profiles(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- #1 policy text now references can_manage:
--   --   select policyname, pg_get_expr(qual, polrelid) as using_expr,
--   --          pg_get_expr(with_check, polrelid) as check_expr
--   --     from pg_policy where polrelid = 'project_weather_claims'::regclass;
--   --   -> pwc_insert check + pwc_update/pwc_delete using all mention
--   --      can_manage_project_progress
--   -- as a general_foreman member of <P> (membership role general_foreman):
--   --   can_edit_project_progress(uid,P) = f BUT can_manage_project_progress = t
--   --   -> weather insert now allowed (was denied before).
--   -- #3 function exists + valid:
--   --   select count(*) from pg_proc where proname='get_form_signer_profiles'; -> 1
--   --   (behavioural: as a member, get_form_signer_profiles('<P>') returns the
--   --    distinct signers incl. ex-members the RLS view would hide.)
-- =============================================================
