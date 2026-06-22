-- =============================================================
-- v101-test-regression-fixes.sql
-- =============================================================
-- Four regressions surfaced by the permission audit (2026-06-22),
-- each CONFIRMED live by execution against pg_policies / pg_proc:
--
--   R1 (SECURITY) materials_update — v59-modules-rls-2.sql re-created the
--      policy WITHOUT the per-row ownership scope that v16-materials-rls-fix.sql
--      had added, so ANY approved member in (pm,main_contractor,
--      general_foreman,subcontractor) can PATCH ANY material row again
--      (the exact hole v16 closed: 判頭 renamed a foreman's material via REST,
--      HTTP 200). Restore: requester OR supervisor, keep the v59 module gate.
--
--   R2 dailies_insert — v35 added an "INSERT only for today (HKT)" guard to
--      stop back/future-dated diaries; v59 then v66 re-created the INSERT
--      policy WITHOUT it. Re-add the date-lock (admin exempt, mirroring the
--      dailies_update admin-any-day rule in v12).
--
--   R3 dailies_select — v12 allowed a global admin to read any project's
--      dailies; v59 re-created dailies_select WITHOUT the admin branch, so a
--      non-member admin can no longer read. Restore the admin branch
--      (module gate kept, per the v59 convention).
--
--   R4 mint_equipment_jwt — v77 moved equipment register write rights from
--      can_edit_project_progress (pm/main_contractor/subcontractor) to
--      can_manage_equipment_forms (pm/main_contractor/safety_officer) but did
--      NOT update the QR mint gate, leaving it on can_edit_project_progress.
--      Net: a safety_officer can ADD equipment but cannot mint its QR; a
--      subcontractor can mint a QR but cannot add equipment. Align mint to
--      can_manage_equipment_forms so "who manages equipment" == "who mints QR".
--
-- Idempotent (drop policy if exists + create or replace). Re-runnable live.
-- =============================================================


-- ── R1: materials_update — restore requester-or-supervisor scope ─────────────
-- is_material_supervisor (from v16) re-created for safety: admin OR global
-- pm/general_foreman OR assigned PM of the project.
create or replace function is_material_supervisor(p_user uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_profiles up
    where up.id = p_user
      and (up.global_role = 'admin' or up.global_role in ('pm','general_foreman'))
  )
  or exists (
    select 1 from projects p
    where p.id = p_project and p_user = any(p.assigned_pm_ids)
  );
$$;
grant execute on function is_material_supervisor(uuid, uuid) to authenticated;

drop policy if exists materials_update on materials;
create policy materials_update on materials for update
  using (
    project_module_enabled(materials.project_id, 'materials')
    and ( requested_by = auth.uid() or is_material_supervisor(auth.uid(), materials.project_id) )
  )
  with check (
    project_module_enabled(materials.project_id, 'materials')
    and ( requested_by = auth.uid() or is_material_supervisor(auth.uid(), materials.project_id) )
  );


-- ── R2: dailies_insert — re-add the HKT today-lock (admin exempt) ────────────
drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert
  with check (
    user_id = auth.uid()
    and project_module_enabled(project_id, 'dailies')
    -- date-lock: non-admin may only insert today's (HKT) diary; admin may backfill
    and (
      date = (now() at time zone 'Asia/Hong_Kong')::date
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (select 1 from projects p
                 where p.id = dailies.project_id and auth.uid() = any(p.assigned_pm_ids))
      or exists (select 1 from project_members pm
                 where pm.project_id = dailies.project_id
                   and pm.user_id = auth.uid()
                   and pm.status = 'approved'
                   and pm.role = any (array['pm','general_foreman','main_contractor']))
    )
  );


-- ── R3: dailies_select — re-add the admin branch ─────────────────────────────
drop policy if exists dailies_select on dailies;
create policy dailies_select on dailies for select
  using (
    (
      exists (select 1 from project_members pm
              where pm.project_id = dailies.project_id
                and pm.user_id = auth.uid()
                and pm.status = 'approved')
      or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    )
    and project_module_enabled(project_id, 'dailies')
  );


-- ── R4: mint_equipment_jwt — align gate to can_manage_equipment_forms ────────
-- Body identical to v55c-equipment-qr.sql:21-44 except the gate (line 28):
-- can_edit_project_progress → can_manage_equipment_forms (v77 helper).
create or replace function mint_equipment_jwt(p_equipment_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_eq equipment_register%rowtype; v_secret text; v_payload json;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  select * into v_eq from equipment_register where id = p_equipment_id;
  if v_eq.id is null then raise exception '找不到機械'; end if;
  if not can_manage_equipment_forms(auth.uid(), v_eq.project_id) then
    raise exception '沒有權限產生 QR';
  end if;
  select equipment_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'equipment_qr_secret 未設定';
  end if;
  v_payload := json_build_object(
    'equipment_id', v_eq.id::text,
    'project_id',   v_eq.project_id::text,
    'ref_no',       v_eq.ref_no,
    'kind',         v_eq.kind,
    'iat', extract(epoch from now())::bigint,
    'exp', extract(epoch from now() + interval '365 days')::bigint
  );
  return extensions.sign(v_payload, v_secret);
end; $$;
revoke all on function mint_equipment_jwt(uuid) from public;
grant execute on function mint_equipment_jwt(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- R1: as 判頭 member, REST PATCH another member's material row -> 0 rows / 403
--   -- R2: as PM, INSERT dailies with date = yesterday -> rejected; today -> ok
--   -- R3: as non-member admin, SELECT dailies of a project (module on) -> rows
--   -- R4: as safety_officer member, select mint_equipment_jwt(<eq>) -> token;
--   --     as subcontractor member -> '沒有權限產生 QR'
-- =============================================================
