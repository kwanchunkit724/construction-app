-- ============================================================
-- v18-rls-audit-hardening.sql
-- ============================================================
-- Systematic RLS audit pass after persona-sim round 2 found two
-- holes via casual probing. Goal: cover every table once and close
-- common patterns (`true` quals, global PM checks without project
-- scoping, legacy single-tenant tables left open).
--
-- Categories addressed:
--
--   A. Legacy tables nothing in /src references. They sit on the
--      v1 single-tenant `profiles.project_id` model with
--      `super-admin` checks via `get_my_role()` (which reads from
--      `profiles`). Rather than re-secure that model, lock them
--      down to admin-only so no live code or attacker can touch
--      them by accident. Tables: profiles, sub_contracts, boq_items,
--      daily_diaries, material_requests, ncrs, ptw_requests,
--      submittals, toolbox_talks.
--
--   B. `projects` had a "name discovery" policy with qual=`true`
--      letting any authenticated user enumerate every project's
--      name + zones + assigned_pm_ids across all companies. Drop it
--      — admin / approved member / assigned PM policies still cover
--      legitimate reads.
--
--   C. `contacts` and `events` UPDATE/DELETE checked global PM
--      role only, not whether that PM was actually assigned to the
--      specific project. A PM at project A could mutate contacts /
--      events at project B. Tighten to assigned PM OR admin.
-- ============================================================

-- ── A. Lock legacy tables to admin-only -------------------------------

-- Defense pattern: drop the loose ALL/SELECT policies and recreate
-- a single admin-only SELECT (still permissive enough for ad-hoc
-- inspection if someone bothers to log in as admin). No UI uses
-- these tables — anyone hitting them via REST today is reconnaissance.

do $$
declare
  tbl text;
  pol text;
begin
  foreach tbl in array array[
    'profiles', 'sub_contracts', 'boq_items', 'daily_diaries',
    'material_requests', 'ncrs', 'ptw_requests', 'submittals',
    'toolbox_talks'
  ]
  loop
    -- Drop every existing policy on the table.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol, tbl);
    end loop;

    -- Recreate admin-only SELECT (RLS stays enabled).
    execute format(
      $f$create policy %I on public.%I for select using (
            exists (
              select 1 from user_profiles up
              where up.id = auth.uid() and up.global_role = 'admin'
            )
          )$f$,
      tbl || '_admin_select_only', tbl
    );
  end loop;
end $$;

-- ── B. Drop the "any authenticated reads all projects" policy ---------

drop policy if exists "Authenticated can read all projects (name discovery)"
  on projects;

-- Members, PMs, and admins already have their own SELECT policies on
-- projects. The wide-open one was a debugging leftover.

-- ── C. Tighten contacts UPDATE/DELETE to assigned PM ------------------

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts for update
  using (
    user_is_admin()
    or exists (
      select 1 from projects p
      where p.id = contacts.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  )
  with check (
    user_is_admin()
    or exists (
      select 1 from projects p
      where p.id = contacts.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  );

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts for delete
  using (
    user_is_admin()
    or exists (
      select 1 from projects p
      where p.id = contacts.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  );

-- ── C2. Tighten events UPDATE/DELETE the same way ---------------------

drop policy if exists events_update on events;
create policy events_update on events for update
  using (
    user_is_admin()
    or events.created_by = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = events.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  )
  with check (
    user_is_admin()
    or events.created_by = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = events.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  );

drop policy if exists events_delete on events;
create policy events_delete on events for delete
  using (
    user_is_admin()
    or events.created_by = auth.uid()
    or exists (
      select 1 from projects p
      where p.id = events.project_id
        and auth.uid() = any(p.assigned_pm_ids)
    )
  );
