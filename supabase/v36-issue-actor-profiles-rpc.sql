-- =============================================================
-- v36-issue-actor-profiles-rpc.sql
-- =============================================================
-- BUG NEW-3 (P2): the issues Excel export resolves 報告者 / 解決者
-- names from a plain `user_profiles.select('*').in('id', ids)` in
-- ProjectDetail.tsx. The v17 user_profiles RLS hardening only exposes
-- profiles of approved CO-MEMBERS of a shared project, so an actor who
-- reported or resolved an issue but is NOT a current member (left the
-- project, was removed, or was never approved) resolves to nothing and
-- the export prints '—'. That silently loses audit-trail identity — the
-- product's core promise is that the trail survives disputes even after
-- someone leaves the site.
--
-- FIX (additive, no broadening of PII): a SECURITY DEFINER function that
-- returns ONLY the {id, name} of users who are actually actors (reporter
-- or resolver) on issues in a project the caller can already view. The
-- caller is gated on the SAME predicate the issues SELECT policy uses —
-- can_view_project(auth.uid(), project_id) (see v4-issues-schema.sql:80
-- and v3-progress-schema.sql:33). No project-wide member list leaks; the
-- caller only learns names attached to issues they can already see.
--
-- Idempotent (create or replace). I (the user) apply this to prod myself.
-- =============================================================

create or replace function get_issue_actor_profiles(p_project_id uuid)
returns table (id uuid, name text)
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
begin
  -- Same authorisation gate as the issues SELECT policy. If the caller
  -- can't view this project's issues, return nothing.
  if not can_view_project(auth.uid(), p_project_id) then
    return;
  end if;

  return query
    select distinct up.id, up.name
    from user_profiles up
    where up.id in (
      select i.reporter_id
      from issues i
      where i.project_id = p_project_id
      union
      select i.resolved_by
      from issues i
      where i.project_id = p_project_id
        and i.resolved_by is not null
    );
end;
$$;

grant execute on function get_issue_actor_profiles(uuid) to authenticated;
