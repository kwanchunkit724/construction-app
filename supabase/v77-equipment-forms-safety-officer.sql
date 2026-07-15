-- =============================================================
-- v77-equipment-forms-safety-officer.sql
-- =============================================================
-- FUNCTION-REVIEW fix #2. The 機械/表格 (equipment register + statutory forms)
-- feature exists primarily for the SAFETY OFFICER, and the client canManage gate
-- (EquipmentContext.tsx) correctly offers the UI to admin / assigned-PM /
-- approved {pm, main_contractor, safety_officer}. But the DB write paths gated on
-- can_edit_project_progress (= {pm, main_contractor, subcontractor}, EXCLUDES
-- safety_officer): next_equipment_ref RAISES 沒有權限, and the equipment_register
-- INSERT policy ANDs can_edit_project_progress with its own safety_officer
-- membership clause (making that clause DEAD). Net: a safety_officer fills the
-- whole modal then hits 沒有權限 — a broken workflow for the feature's own persona.
--
-- Fix: a dedicated helper can_manage_equipment_forms() that matches the UI's
-- canManage exactly (admin OR assigned-PM OR approved {pm,main_contractor,
-- safety_officer}), and switch the equipment/forms write+update paths to it.
-- We deliberately do NOT widen can_edit_project_progress (that would wrongly let
-- safety_officer edit PROGRESS). Switching also drops subcontractor from these
-- writes — correct, since the UI never offered equipment/forms management to
-- subcontractors (closes the minor RLS-vs-UI gap the review also noted).
--
-- Idempotent. Read paths (can_view_project) + record_form_signoff (credential-
-- gated) are unchanged.
-- =============================================================

create or replace function can_manage_equipment_forms(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Admin
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    -- Assigned PM of this project
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    -- Approved member with an equipment/forms-management role
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
        and role in ('pm', 'main_contractor', 'safety_officer')
    );
$$;
grant execute on function can_manage_equipment_forms(uuid, uuid) to authenticated;

-- ── equipment_register write/update -> can_manage_equipment_forms ──
drop policy if exists equipment_write on equipment_register;
create policy equipment_write on equipment_register for insert to authenticated
  with check (can_manage_equipment_forms(auth.uid(), project_id));
drop policy if exists equipment_update on equipment_register;
create policy equipment_update on equipment_register for update to authenticated
  using (can_manage_equipment_forms(auth.uid(), project_id));

-- ── form_instances write/update -> can_manage_equipment_forms ──
drop policy if exists form_instances_write on form_instances;
create policy form_instances_write on form_instances for insert to authenticated
  with check (can_manage_equipment_forms(auth.uid(), project_id));
drop policy if exists form_instances_update on form_instances;
create policy form_instances_update on form_instances for update to authenticated
  using (can_manage_equipment_forms(auth.uid(), project_id));

-- ── next_equipment_ref RPC -> can_manage_equipment_forms (body otherwise verbatim) ──
create or replace function next_equipment_ref(p_project_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  if not can_manage_equipment_forms(auth.uid(), p_project_id) then
    raise exception '沒有權限';
  end if;
  insert into equipment_counters (project_id) values (p_project_id) on conflict do nothing;
  select next_no into v_n from equipment_counters where project_id = p_project_id for update;
  update equipment_counters set next_no = v_n + 1 where project_id = p_project_id;
  return 'EQ-' || lpad(v_n::text, 3, '0');
end; $$;
grant execute on function next_equipment_ref(uuid) to authenticated;

-- Verify (execute): can_manage_equipment_forms exists + returns true for a real
-- approved safety_officer membership; policies + next_equipment_ref reference it.
