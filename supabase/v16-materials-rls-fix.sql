-- ============================================================
-- v16-materials-rls-fix.sql
-- ============================================================
-- Tighten materials UPDATE policy so any project member cannot
-- mutate other users' material rows.
--
-- BUG (discovered by persona-sim 何判頭 2026-05-26):
--   v11-materials-schema.sql UPDATE policy allows ANY project
--   member whose global_role ∈ (admin, pm, main_contractor,
--   subcontractor) to PATCH ANY material row in the project.
--   Verified live: subcontractor renamed foreman's material via
--   direct REST PATCH and received HTTP 200.
--
-- FIX:
--   - UPDATE: requester OR supervisor (admin OR assigned PM OR
--     pm OR general_foreman). Subcontractor / main_contractor
--     non-supervisor can update only their own rows.
--   - Existing DELETE policy already correct (requester OR
--     admin/pm). Extend to include general_foreman for symmetry.
--   - INSERT policy unchanged: members in role group may create
--     requests (still tagged with requested_by = auth.uid()).
-- ============================================================

-- Helper: is this user a project supervisor (manages materials freely)?
create or replace function is_material_supervisor(p_user uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles up
    where up.id = p_user
      and (
        up.global_role = 'admin'
        or up.global_role in ('pm', 'general_foreman')
      )
  )
  or exists (
    select 1 from projects p
    where p.id = p_project and p_user = any(p.assigned_pm_ids)
  );
$$;

grant execute on function is_material_supervisor(uuid, uuid) to authenticated;

-- Tighten UPDATE: requester OR supervisor
drop policy if exists materials_update on materials;
create policy materials_update on materials for update
  using (
    requested_by = auth.uid()
    or is_material_supervisor(auth.uid(), materials.project_id)
  )
  with check (
    requested_by = auth.uid()
    or is_material_supervisor(auth.uid(), materials.project_id)
  );

-- Symmetric DELETE (add general_foreman to supervisor set)
drop policy if exists materials_delete on materials;
create policy materials_delete on materials for delete
  using (
    requested_by = auth.uid()
    or is_material_supervisor(auth.uid(), materials.project_id)
  );

-- Note: INSERT policy unchanged. It enforces role group + project
-- membership; requested_by is set by the client to auth.uid().
