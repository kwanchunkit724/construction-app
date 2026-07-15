-- =============================================================
-- v47-issues-number-location.sql  — run as ONE transaction
-- =============================================================
-- Backlog S16 (per-project issue number + location) and S17 (extend the
-- v36 actor-profiles RPC to also resolve comment authors, for the 處理紀錄
-- export sheet). Additive. issue_no is trigger-owned — clients never send
-- it. No issues-RLS changes.
-- The Supabase SQL editor runs a pasted script atomically; the unique index
-- (step 5) is the failure detector if the backfill half-applies. Re-run safe
-- (backfill only touches issue_no is null; counter seed is upsert-greatest).
-- ⚠ Qualify every column in the RPC (OUT params id/name — v33 42702 lesson).
-- =============================================================

-- 1. Additive columns (old clients insert without them — trigger fills issue_no).
alter table issues add column if not exists issue_no int;
alter table issues add column if not exists location text;

-- 2. Per-project counter (document_counters pattern, v40).
create table if not exists issue_counters (
  project_id uuid primary key references projects(id) on delete cascade,
  next_no int not null default 1 check (next_no >= 1)
);
alter table issue_counters enable row level security;
-- no policies — written only inside the SECURITY DEFINER trigger fn.

-- 3. Assign trigger — BEFORE INSERT, only when issue_no is null (re-fire safe).
create or replace function trg_assign_issue_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if new.issue_no is not null then return new; end if;
  insert into issue_counters (project_id) values (new.project_id)
    on conflict (project_id) do nothing;
  select next_no into v_n from issue_counters
   where project_id = new.project_id for update;
  update issue_counters set next_no = v_n + 1 where project_id = new.project_id;
  new.issue_no := v_n;
  return new;
end; $$;
drop trigger if exists on_issue_assign_no on issues;
create trigger on_issue_assign_no before insert on issues
  for each row execute function trg_assign_issue_no();

-- 4. Backfill existing rows (stable order), THEN seed counters above the max.
with numbered as (
  select id, row_number() over (partition by project_id order by created_at, id) rn
  from issues where issue_no is null
)
update issues i set issue_no = n.rn from numbered n where i.id = n.id;

insert into issue_counters (project_id, next_no)
select project_id, coalesce(max(issue_no), 0) + 1 from issues group by project_id
on conflict (project_id) do update set next_no = greatest(issue_counters.next_no, excluded.next_no);

-- 5. Uniqueness guard (after backfill).
create unique index if not exists idx_issues_project_issue_no on issues (project_id, issue_no);

-- 6. S17: extend v36 get_issue_actor_profiles to ALSO cover comment authors.
--    Same name/signature/return shape -> plain create or replace, zero client
--    lockstep. v36 body verbatim + a third UNION arm for issue_comments.
create or replace function get_issue_actor_profiles(p_project_id uuid)
returns table (id uuid, name text)
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
begin
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
      union
      select c.author_id
      from issue_comments c
      join issues i2 on i2.id = c.issue_id
      where i2.project_id = p_project_id
    );
end;
$$;
grant execute on function get_issue_actor_profiles(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- backfill: select project_id, count(*), count(distinct issue_no)
--   --   from issues group by 1  -> counts equal; next_no = max+1 per project.
--   -- REST insert (old-client shape) as worker -> row gets next number.
--   -- two rapid concurrent inserts on one project -> distinct consecutive nos.
--   -- get_issue_actor_profiles returns name of an ex-member who only COMMENTED.
--   -- export from app on a project with escalated issues -> 2 sheets, 由/至.
-- =============================================================
