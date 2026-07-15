-- =============================================================
-- v93-quick-issues.sql   (即時問題 — quick-mode of the issues table)
-- =============================================================
-- 即時問題 (snags) are ad-hoc site problems a 管工 logs in seconds (漏水, 燈唔著,
-- 渠塞…) that don't belong on the 進度表 and don't need the full escalation chain.
-- DECISION (brainstorm synthesis): NOT a new module/table — a quick-MODE of the
-- existing `issues` row, flagged is_quick=true. One table = one shared audit
-- trail (photo+time+identity+location) and one UI the 管工 already knows.
--
-- AUDIT-SAFETY (issues is hash-chained into audit_ledger v70; numbered by v47):
--  [1] A snag must NOT burn the formal per-project issue_no sequence (#007 is
--      dispute evidence). Snags carry issue_no = NULL until graduation.
--      -> trg_assign_issue_no (v47) gets an is_quick short-circuit.
--  [2] Graduation (升級為正式問題) is ONE-WAY: a formal issue can never be re-buried
--      back into a private snag.  -> guard_issue_quick raises on false->true.
--  [3] At graduation we late-assign the formal number from the same counter,
--      ignoring any client-sent value.  -> guard_issue_quick.
--  [4] issue_no, once assigned, is immutable for non-admin callers (no renumber).
--      -> enforce_issue_write_gate (v69) extended to pin it.
--  [5] Snags never fire OneSignal (free-tier + "don't spam"); graduation notifies
--      the handler exactly once.  -> trg_issue_created / trg_issue_updated guards.
-- Additive + idempotent. No RLS change (snags reuse the 'issues' module + the v4
-- insert policy: can_view_project AND reporter_id = auth.uid()). zh-HK.
-- =============================================================

-- 1. Additive columns (old clients insert without them; default is_quick=false
--    keeps every existing + future formal issue unchanged).
alter table issues add column if not exists is_quick boolean not null default false;
alter table issues add column if not exists snag_type text;

-- 2. [1] trg_assign_issue_no (v47) — skip the counter for snags. Verbatim v47
--    body + one short-circuit; formal inserts behave exactly as before.
create or replace function trg_assign_issue_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if new.issue_no is not null then return new; end if;
  if new.is_quick then return new; end if;            -- 即時問題: no formal number yet
  insert into issue_counters (project_id) values (new.project_id)
    on conflict (project_id) do nothing;
  select next_no into v_n from issue_counters
   where project_id = new.project_id for update;
  update issue_counters set next_no = v_n + 1 where project_id = new.project_id;
  new.issue_no := v_n;
  return new;
end; $$;

-- 3. [2]+[3] guard_issue_quick — BEFORE UPDATE, runs for ALL callers (incl admin /
--    service role, so graduation always numbers). One-way flip + late-assign.
create or replace function guard_issue_quick() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  -- One-way: never re-bury a formal issue as a snag.
  if coalesce(old.is_quick, false) = false and coalesce(new.is_quick, false) = true then
    raise exception '正式問題不可改回即時問題';
  end if;
  -- Graduation snag -> formal: assign the per-project formal number now, from the
  -- counter (never trust a client-sent issue_no on this transition).
  if coalesce(old.is_quick, false) = true and coalesce(new.is_quick, false) = false then
    if new.issue_no is null or new.issue_no is distinct from old.issue_no then
      insert into issue_counters (project_id) values (new.project_id)
        on conflict (project_id) do nothing;
      select next_no into v_n from issue_counters
       where project_id = new.project_id for update;
      update issue_counters set next_no = v_n + 1 where project_id = new.project_id;
      new.issue_no := v_n;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_guard_issue_quick on issues;
create trigger trg_guard_issue_quick before update on issues
  for each row execute function guard_issue_quick();

-- 4. [4] enforce_issue_write_gate (v69) — re-create verbatim + pin issue_no
--    immutable once assigned (a formal #007 can never be renumbered by a
--    non-admin PATCH). Fires BEFORE guard_issue_quick (trg_e* < trg_g*), and on a
--    graduation row old.issue_no is NULL so this pin is a no-op there.
create or replace function enforce_issue_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
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

  -- (1b) v93: the assigned formal number is immutable (dispute evidence). A snag
  -- still has NULL here and is numbered later by guard_issue_quick at graduation.
  if old.issue_no is not null then
    new.issue_no := old.issue_no;
  end if;

  -- (2) The resolver is always the acting user — cannot be forged onto a third party.
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_by := auth.uid();
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  -- (3) current_handler_role may only advance along the legal escalation ladder.
  if new.current_handler_role is distinct from old.current_handler_role then
    if not (
      (old.current_handler_role = 'subcontractor'   and new.current_handler_role = 'main_contractor') or
      (old.current_handler_role = 'main_contractor' and new.current_handler_role = 'pm')
    ) then
      raise exception 'illegal issue handler transition: % -> % (escalation ladder is subcontractor -> main_contractor -> pm)',
        old.current_handler_role, new.current_handler_role;
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists trg_enforce_issue_write_gate on issues;
create trigger trg_enforce_issue_write_gate
  before update on issues
  for each row execute function enforce_issue_write_gate();

-- 5. [5] Push guards. trg_issue_created: snags are silent. Verbatim v5-split body
--    + one short-circuit.
create or replace function trg_issue_created() returns trigger
language plpgsql security definer
set search_path = public
as $issue_created$
declare
  v_targets uuid[];
  v_project_name text;
begin
  if new.is_quick then return new; end if;            -- 即時問題: no push on create

  select array_agg(user_id) into v_targets
    from project_members
    where project_id = new.project_id
      and role = new.current_handler_role
      and status = 'approved'
      and user_id <> new.reporter_id;

  if new.current_handler_role = 'pm' then
    select array_agg(distinct uid) into v_targets
      from (
        select unnest(coalesce(v_targets, '{}'::uuid[])) as uid
        union
        select unnest(assigned_pm_ids) from projects where id = new.project_id
      ) t
      where uid is not null and uid <> new.reporter_id;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  perform send_push_to_users(
    v_targets,
    '新問題報告',
    coalesce(v_project_name, '工地') || ' - ' || new.title,
    '/project/' || new.project_id || '/issue/' || new.id
  );
  return new;
end;
$issue_created$;

-- trg_issue_updated: snag-internal updates stay silent; graduation (true->false)
-- notifies the new handler ONCE (mirrors created); formal issues unchanged.
create or replace function trg_issue_updated() returns trigger
language plpgsql security definer
set search_path = public
as $issue_updated$
declare
  v_targets uuid[];
  v_project_name text;
begin
  -- While still a snag: no pushes at all.
  if new.is_quick then return new; end if;

  select name into v_project_name from projects where id = new.project_id;

  -- Graduation: a snag just became a formal issue -> notify the handler once, then stop.
  if coalesce(old.is_quick, false) = true and new.is_quick = false then
    select array_agg(user_id) into v_targets
      from project_members
      where project_id = new.project_id
        and role = new.current_handler_role
        and status = 'approved'
        and user_id <> new.reporter_id;
    if new.current_handler_role = 'pm' then
      select array_agg(distinct uid) into v_targets
        from (
          select unnest(coalesce(v_targets, '{}'::uuid[])) as uid
          union
          select unnest(assigned_pm_ids) from projects where id = new.project_id
        ) t
        where uid is not null and uid <> new.reporter_id;
    end if;
    perform send_push_to_users(
      v_targets,
      '即時問題已升級',
      coalesce(v_project_name, '工地') || ' - ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
    return new;
  end if;

  if old.current_handler_role <> new.current_handler_role and new.status = 'open' then
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

-- 6. Partial index for the snag list (per project; query by project + reporter).
create index if not exists idx_issues_quick on issues (project_id, reporter_id) where is_quick;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select count(*) from pg_trigger where tgname = 'trg_guard_issue_quick';   -> 1
--   -- create a snag (is_quick=true) as a worker -> issue_no IS NULL, NO push.
--   -- graduate it (update is_quick=false) -> gets next formal issue_no, one push
--   --    to the handler; a second graduation attempt false->true RAISES
--   --    '正式問題不可改回即時問題'.
--   -- formal-issue PATCH trying to change issue_no (non-admin) -> silently pinned.
--   -- many snags on one project -> all keep issue_no NULL (unique index allows it).
-- =============================================================
