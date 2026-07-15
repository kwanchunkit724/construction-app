-- =============================================================
-- v106-issue-person-handoff.sql
-- =============================================================
-- 問題 gains a PERSON layer on top of the role-tier model. Today an issue is
-- routed to current_handler_role (a tier: 判頭→總承建商→PM) and escalation only
-- walks that ladder UP — so nobody is personally accountable and there is no way
-- to hand an issue back DOWN. This adds:
--   * issues.current_handler_id  — the SPECIFIC person now responsible
--     (NULL = legacy tier-only row → today's behaviour is preserved exactly).
--   * 3 unified handoffs (one data op: reassign to chosen person + reason):
--       上呈 (up)  /  同層轉交 (same tier)  /  彈番落去 (down).
--   * audit columns issue_comments.from_user / to_user + actions reassigned/bounced.
--   * targeted push to the assigned person (replaces tier broadcast when named).
--
-- Backwards-compatible / additive only. No column dropped; existing role-only
-- issues keep working. RLS + guard rewritten to (a) let the named assignee act and
-- (b) allow any tier transition (the v69 forward-only ladder blocked 彈落/同層) —
-- every move is now an explicit, reasoned, audited handoff so the ladder lock is
-- no longer the integrity mechanism. Origin-immutability + resolved_by forcing KEPT.
--
-- Also aligns a documented client/server gap (CLAUDE.md: RLS + client gating must
-- match): canActOnIssue grants 安全主任 / 老總 project-wide act-rights but the v4
-- UPDATE policy never did — the server would reject their writes. Added here.
-- =============================================================

-- ── 1) issues: the specific-person handler ───────────────────────────────────
alter table issues add column if not exists current_handler_id uuid references user_profiles(id);
create index if not exists idx_issues_handler_id on issues(current_handler_id);

-- ── 2) issue_comments: person-level audit + new handoff actions ──────────────
alter table issue_comments add column if not exists from_user uuid references user_profiles(id);
alter table issue_comments add column if not exists to_user   uuid references user_profiles(id);

-- extend the action CHECK (drop whatever it is currently named, re-add widened)
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'issue_comments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%reported%'
  loop
    execute 'alter table issue_comments drop constraint ' || quote_ident(c);
  end loop;
end$$;
alter table issue_comments add constraint issue_comments_action_check
  check (action in ('reported','commented','escalated','resolved','reopened','reassigned','bounced'));

-- ── 3) write-gate: keep origin-immutability + resolver-forcing; DROP the
--       forward-only ladder lock (person handoffs go up / same / down now). ────
create or replace function enforce_issue_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  -- Service role / no JWT (SECURITY DEFINER RPCs, admin tooling) bypass.
  if auth.uid() is null then
    return new;
  end if;

  select (up.global_role = 'admin') into is_admin
  from user_profiles up
  where up.id = auth.uid();
  if is_admin then
    return new;
  end if;

  -- (1) Immutable origin columns — never change post-creation for non-admin.
  new.reporter_id   := old.reporter_id;
  new.reporter_role := old.reporter_role;
  new.project_id    := old.project_id;
  new.created_at    := old.created_at;

  -- (2) The resolver is always the acting user — cannot be forged onto a third party.
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_by := auth.uid();
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  -- (3) current_handler_role may move to any valid tier (up/same/down). The column
  --     CHECK still bounds it to pm/main_contractor/subcontractor/admin. Direction
  --     is now a deliberate, reasoned, audited handoff (issue_comments), not a lock.
  return new;
end;
$$;

-- ── 4) UPDATE RLS: named assignee can act; align supervisor act-rights ────────
drop policy if exists "Admin or current handler updates issues" on issues;
create policy "Admin or current handler updates issues"
  on issues for update to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or has_role_in_project(auth.uid(), project_id, current_handler_role)
    or current_handler_id = auth.uid()
    or reporter_id = auth.uid()
    or has_role_in_project(auth.uid(), project_id, 'safety_officer')
    or has_role_in_project(auth.uid(), project_id, 'general_foreman')
  )
  with check (true);

-- ── 5) people-picker source: members + assigned PMs the caller can see ───────
create or replace function get_project_handlers(p_project_id uuid)
returns table (user_id uuid, name text, role text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not can_view_project(auth.uid(), p_project_id) then
    return;
  end if;
  return query
    select x.user_id, up.name, x.role
    from (
      select pm.user_id, pm.role::text as role
      from project_members pm
      where pm.project_id = p_project_id and pm.status = 'approved'
      union
      select unnest(p.assigned_pm_ids), 'pm'
      from projects p where p.id = p_project_id
    ) x
    join user_profiles up on up.id = x.user_id;
end;
$$;
revoke all on function get_project_handlers(uuid) from public;
grant execute on function get_project_handlers(uuid) to authenticated;

-- ── 6) push: notify the NAMED person on assignment; tier broadcast otherwise ─
create or replace function trg_issue_updated() returns trigger
language plpgsql security definer
set search_path = public
as $issue_updated$
declare
  v_targets uuid[];
  v_project_name text;
begin
  select name into v_project_name from projects where id = new.project_id;

  if new.status = 'open'
     and new.current_handler_id is not null
     and new.current_handler_id is distinct from old.current_handler_id then
    -- a specific person was just put on the hook — tell exactly them
    perform send_push_to_users(
      array[new.current_handler_id]::uuid[],
      '問題已指派畀你',
      coalesce(v_project_name, '工地') || ' - ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  elsif old.current_handler_role <> new.current_handler_role and new.status = 'open' then
    -- legacy / unnamed tier move: broadcast to the tier (old behaviour)
    select array_agg(user_id) into v_targets
      from project_members
      where project_id = new.project_id
        and role = new.current_handler_role
        and status = 'approved';

    if new.current_handler_role = 'pm' then
      select array_agg(distinct uid) into v_targets
        from (
          select unnest(coalesce(v_targets, '{}'::uuid[])) as uid
          union
          select unnest(assigned_pm_ids) from projects where id = new.project_id
        ) t
        where uid is not null;
    end if;

    perform send_push_to_users(
      v_targets,
      '問題已上呈',
      coalesce(v_project_name, '工地') || ' - ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  if old.status = 'open' and new.status = 'resolved' then
    perform send_push_to_users(
      array[new.reporter_id]::uuid[],
      '問題已解決',
      coalesce(v_project_name, '工地') || ' - ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  if old.status = 'resolved' and new.status = 'open' and old.resolved_by is not null then
    perform send_push_to_users(
      array[old.resolved_by]::uuid[],
      '問題重新開啟',
      coalesce(v_project_name, '工地') || ' - ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  return new;
end;
$issue_updated$;

drop trigger if exists on_issue_updated on issues;
create trigger on_issue_updated
  after update on issues
  for each row execute function trg_issue_updated();

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select column_name from information_schema.columns
--     where table_name='issues' and column_name='current_handler_id';        -> 1 row
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid='issue_comments'::regclass and contype='c';             -> includes reassigned/bounced
--   -- RLS as the NAMED assignee (set local role authenticated + jwt sub=<assignee>):
--   --   update issues set current_handler_role='subcontractor', current_handler_id=<x>
--   --     where id=<i>;  -> allowed (was main_contractor -> bounced down; old ladder would RAISE)
--   -- RLS as a NON-member, non-handler: same update -> 0 rows (denied).
--   -- guard: as non-admin, PATCH reporter_id -> silently reverted; resolve forces resolved_by=self.
-- =============================================================
