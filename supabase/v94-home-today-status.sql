-- =============================================================
-- v94-home-today-status.sql   (今日工地概況 — Home "today checklist" feed)
-- =============================================================
-- Retention brainstorm rank-1: a Home banner that answers "is anything still
-- open for me today?" for each of the user's sites — 日誌 written? 進度 touched
-- by me today? 文件 activity in the last 24h? It rewards INPUT/showing-up, never
-- OUTPUT numbers, so it can't tempt fake ticks (audit-safe by construction).
--
-- Home mounts NO Dailies/Progress/Documents providers and has no pinned-project
-- concept, so a pure-client derivation isn't possible there. This ONE read-only
-- SECURITY DEFINER RPC returns the three booleans per viewable project in a
-- single round-trip; the client gates the 日誌 pill with its own canAuthorDaily
-- (Home already has memberships + projects in scope), so non-authors never see a
-- permanent red 日誌. Writes nothing. zh-HK. Idempotent.
-- =============================================================

create or replace function public.get_my_site_status()
returns table (
  project_id uuid,
  daily_done boolean,        -- I submitted today's 日誌 on this project (HKT)
  progress_today boolean,    -- I logged a 進度 update today (HKT)
  doc_24h boolean            -- any 文件/圖則 activity on this project in the last 24h
)
language sql
security definer
stable
set search_path = public
as $$
  with v as (select (now() at time zone 'Asia/Hong_Kong')::date as today)
  select
    p.id,
    exists (
      select 1 from dailies d, v
      where d.project_id = p.id and d.user_id = auth.uid() and d.date = v.today
    ),
    exists (
      select 1 from progress_history ph
      join progress_items pi on pi.id = ph.item_id, v
      where pi.project_id = p.id
        and ph.updated_by = auth.uid()
        and (ph.created_at at time zone 'Asia/Hong_Kong')::date = v.today
    ),
    (
      exists (
        select 1 from documents doc
        where doc.project_id = p.id and doc.created_at > now() - interval '24 hours'
      )
      or exists (
        select 1 from drawings dr
        where dr.project_id = p.id and dr.created_at > now() - interval '24 hours'
      )
    )
  from projects p
  where can_view_project(auth.uid(), p.id);
$$;

revoke all on function public.get_my_site_status() from public;
grant execute on function public.get_my_site_status() to authenticated;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   -- as a member who wrote today's daily on project X:
--   --   select * from get_my_site_status();  -> row for X with daily_done = true.
--   -- a project the caller is NOT a member of -> never appears (can_view_project gate).
-- =============================================================
