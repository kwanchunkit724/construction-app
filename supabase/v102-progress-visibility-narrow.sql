-- =============================================================
-- v102-progress-visibility-narrow.sql
-- =============================================================
-- Stage-A test findings (2026-06-22), both confirmed live by execution:
--
--   A1  main_contractor (工程師/管工) saw ALL zones. The live
--       get_visible_progress_items keyed its "see everything" branch on
--       can_manage_project_progress (admin / assigned-PM / membership role in
--       pm,general_foreman,main_contractor — v27), so main_contractor was a
--       supervisor for VIEW. Requirement: per-zone 工程師/管工 see only the items
--       assigned/delegated to them (+ ancestor chain), like 判頭/工人. Fix: the
--       "see all" tier is now admin / assigned-PM / pm / general_foreman ONLY.
--
--   A2  The narrowing was RPC-only. The base table SELECT policy was
--       can_view_project(...) (any approved member → every row), so a narrowed
--       user could read all items via a raw PostgREST select, bypassing the RPC.
--       Fix: the SELECT policy now enforces the SAME per-item visibility
--       server-side.
--
-- Single source of truth: progress_is_supervisor() + progress_item_visible()
-- are used by BOTH the RPC and the table policy, so they can never drift.
-- SECURITY DEFINER (owner bypasses RLS) → the inner reads do not re-enter the
-- policy. Idempotent.
--
-- Perf note: progress_item_visible walks an item's subtree per call; for the
-- table policy that is per-row. Progress trees are small (10²–10³ items) and
-- reads are not hot, so this is acceptable; if a very large project ever needs
-- it, precompute a visible-id set per (uid,project) instead.
-- =============================================================

-- Supervisor = sees every item in a project they belong to.
-- (main_contractor intentionally EXCLUDED — they are narrowed like subcontractor.)
create or replace function progress_is_supervisor(p_uid uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from user_profiles where id = p_uid and global_role = 'admin')
    or exists (select 1 from projects p where p.id = p_project and p_uid = any(p.assigned_pm_ids))
    or exists (
      select 1 from project_members pm
      where pm.project_id = p_project and pm.user_id = p_uid and pm.status = 'approved'
        and pm.role in ('pm','general_foreman')
    );
$$;
grant execute on function progress_is_supervisor(uuid, uuid) to authenticated;

-- Per-item visibility: a member sees an item iff that item OR any of its
-- descendants is assigned/delegated to them (→ assigned leaves + their ancestor
-- chain). Supervisors see all; non-members see nothing.
create or replace function progress_item_visible(p_uid uuid, p_item uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when not can_view_project(p_uid, p_project) then false
    when progress_is_supervisor(p_uid, p_project) then true
    else exists (
      with recursive sub as (
        select id, assigned_to, delegated_to from progress_items where id = p_item
        union all
        select c.id, c.assigned_to, c.delegated_to
        from progress_items c join sub s on c.parent_id = s.id
      )
      select 1 from sub where p_uid = any(assigned_to) or p_uid = any(delegated_to)
    )
  end;
$$;
grant execute on function progress_item_visible(uuid, uuid, uuid) to authenticated;

-- A2: table SELECT policy now enforces the narrowing server-side.
drop policy if exists "Members can view progress items" on progress_items;
create policy "Members can view progress items" on progress_items for select
  using ( progress_item_visible(auth.uid(), id, project_id) );

-- A1: RPC narrows main_contractor too (same rule as the policy).
create or replace function get_visible_progress_items(p_project_id uuid)
returns setof progress_items language sql stable security definer set search_path = public as $$
  select pi.* from progress_items pi
  where pi.project_id = p_project_id
    and progress_item_visible(auth.uid(), pi.id, p_project_id)
  order by pi.level, pi.code;
$$;
grant execute on function get_visible_progress_items(uuid) to authenticated;

-- =============================================================
-- Verify (execute, as each user via jwt.claims):
--   一座工程師/管工  -> only A* (6 / 3), 0 foreign-zone
--   一座判頭/工人    -> only A* (6 / 3)
--   PM / 老總        -> all 32 ; 業主 / 安全主任 -> 0
--   raw select progress_items as 判頭 -> 6 rows (was 32)
-- =============================================================
