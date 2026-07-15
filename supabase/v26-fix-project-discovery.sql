-- =============================================================
-- v26-fix-project-discovery.sql — restore "apply to join" onboarding
-- =============================================================
-- v18-rls-audit-hardening.sql dropped the policy
--   "Authenticated can read all projects (name discovery)"
-- assuming members / PMs / admins already have their own SELECT policies on
-- projects. But a BRAND-NEW user has none of those — no membership, not a PM,
-- not admin — so they match NO select policy and see ZERO projects. The
-- 「申請加入工地」 (apply to join a site) list is built from the projects the
-- client can read (src/pages/Projects.tsx → availableProjects), so it comes up
-- empty and a new user can never apply. Onboarding is broken.
--
-- Re-add the authenticated discovery policy. A project's name + zones are not
-- secret to a logged-in construction user who needs to find which site to join;
-- the row-level data exposed is the same the original v2 schema intended.
-- (Membership, progress, issues, documents etc. remain protected by their own
-- per-table RLS — this only lets an authenticated user SEE that a project
-- exists in order to apply.)
-- Backwards compatible: policy only; no schema change.
-- =============================================================

drop policy if exists "Authenticated can read all projects (name discovery)" on projects;

create policy "Authenticated can read all projects (name discovery)"
  on projects for select to authenticated
  using (true);
