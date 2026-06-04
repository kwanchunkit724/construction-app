-- ============================================================
-- v24-perf-indexes.sql
-- ============================================================
-- Forward-looking performance indexes for the hot query + RLS paths.
-- The dataset is tiny today (16 MB, biggest business table ~89 rows), so
-- this changes nothing now — it's insurance so the common filters stay
-- index-backed as projects accumulate months of issues / dailies /
-- materials / progress history across many companies.
--
-- Every index is `if not exists` and named idx_perf_* to avoid clashing
-- with any existing index. Tables are small so creation is instant.
--
-- Apply via Supabase Dashboard SQL Editor (one-shot paste). Idempotent.
-- ============================================================

-- RLS admin check: nearly every policy does
--   exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
-- id is the PK (already indexed); index global_role so the predicate is cheap.
create index if not exists idx_perf_user_profiles_role on user_profiles(global_role);

-- Membership lookups (ProjectsContext + most RLS project-scoping).
create index if not exists idx_perf_project_members_user on project_members(user_id);
create index if not exists idx_perf_project_members_project on project_members(project_id);
create index if not exists idx_perf_project_members_status on project_members(status);

-- Per-project list reads (the .eq('project_id') + order('created_at') pattern).
create index if not exists idx_perf_issues_project on issues(project_id);
create index if not exists idx_perf_issues_created on issues(created_at desc);
create index if not exists idx_perf_progress_items_project on progress_items(project_id);
create index if not exists idx_perf_progress_history_item on progress_history(item_id);
create index if not exists idx_perf_materials_project on materials(project_id);
create index if not exists idx_perf_dailies_project on dailies(project_id);

-- Approval-flow reads filter on doc_type across all projects.
create index if not exists idx_perf_approvals_doc_type on approvals(doc_type);

-- Optional helper for future RLS policies: a STABLE function is planned-once
-- per statement instead of re-evaluated per row. NOT wired into existing
-- policies here (that rewrite is a separate, reviewed change) — provided so
-- new policies can use `is_admin()` cleanly.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and global_role = 'admin'
  );
$$;
