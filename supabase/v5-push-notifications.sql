-- =============================================================
-- Construction App v2 — Phase B: Push Notifications (OneSignal)
-- Run this in Supabase Dashboard → SQL Editor
-- AFTER running, also run:
--   update app_config
--     set onesignal_app_id = '<your app id>',
--         onesignal_rest_key = '<your rest key>'
--     where id = 1;
-- =============================================================

-- Enable pg_net for outbound HTTP from triggers
create extension if not exists pg_net with schema extensions;

-- ── 1. user_profiles.onesignal_id ────────────────────────────
alter table user_profiles add column if not exists onesignal_id text;

-- ── 2. app_config (private — RLS denies all) ─────────────────
create table if not exists app_config (
  id int primary key default 1,
  onesignal_app_id text,
  onesignal_rest_key text,
  constraint app_config_single_row check (id = 1)
);

insert into app_config (id) values (1) on conflict (id) do nothing;

alter table app_config enable row level security;
-- No policies: nobody can read this directly. Only SECURITY DEFINER fn can.

-- ── 3. Helper: send push to a list of user_ids ───────────────
create or replace function send_push_to_users(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_deep_link text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_app_id text;
  v_rest_key text;
  v_player_ids text[];
  v_payload jsonb;
begin
  select onesignal_app_id, onesignal_rest_key
    into v_app_id, v_rest_key
    from app_config where id = 1;

  if v_app_id is null or v_rest_key is null then
    raise log 'OneSignal credentials not configured. Skipping push.';
    return;
  end if;

  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;

  select array_agg(onesignal_id) into v_player_ids
    from user_profiles
    where id = any(p_user_ids) and onesignal_id is not null;

  if v_player_ids is null or array_length(v_player_ids, 1) is null then
    return;
  end if;

  v_payload := jsonb_build_object(
    'app_id', v_app_id,
    'include_subscription_ids', v_player_ids,
    'headings', jsonb_build_object('en', p_title, 'zh-Hant', p_title),
    'contents', jsonb_build_object('en', p_body, 'zh-Hant', p_body),
    'ios_sound', 'default'
  );

  if p_deep_link is not null then
    v_payload := v_payload || jsonb_build_object(
      'data', jsonb_build_object('deep_link', p_deep_link)
    );
  end if;

  perform net.http_post(
    url := 'https://api.onesignal.com/notifications',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Key ' || v_rest_key
    )
  );
exception when others then
  raise log 'send_push_to_users error: %', sqlerrm;
end;
$$;

-- ── 4. Trigger: Issue created ────────────────────────────────
create or replace function trg_issue_created() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_project_name text;
begin
  -- Users with the target role in this project (excl. reporter)
  select array_agg(user_id) into v_targets
    from project_members
    where project_id = new.project_id
      and role = new.current_handler_role
      and status = 'approved'
      and user_id <> new.reporter_id;

  -- If handler is PM, also include assigned PMs (who may not have membership row)
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
    '🔔 新問題報告',
    coalesce(v_project_name, '工地') || ' · ' || new.title,
    '/project/' || new.project_id || '/issue/' || new.id
  );
  return new;
end;
$$;

drop trigger if exists on_issue_created on issues;
create trigger on_issue_created
  after insert on issues
  for each row execute function trg_issue_created();

-- ── 5. Trigger: Issue escalated or resolved ──────────────────
create or replace function trg_issue_updated() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_targets uuid[];
  v_project_name text;
begin
  select name into v_project_name from projects where id = new.project_id;

  -- Escalation: handler role changed and still open
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
      '⬆ 問題已上呈',
      coalesce(v_project_name, '工地') || ' · ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  -- Resolved: notify reporter
  if old.status = 'open' and new.status = 'resolved' then
    perform send_push_to_users(
      array[new.reporter_id]::uuid[],
      '✅ 問題已解決',
      coalesce(v_project_name, '工地') || ' · ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  -- Reopened: notify the resolver if known
  if old.status = 'resolved' and new.status = 'open' and old.resolved_by is not null then
    perform send_push_to_users(
      array[old.resolved_by]::uuid[],
      '🔁 問題重新開啟',
      coalesce(v_project_name, '工地') || ' · ' || new.title,
      '/project/' || new.project_id || '/issue/' || new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_issue_updated on issues;
create trigger on_issue_updated
  after update on issues
  for each row execute function trg_issue_updated();

-- ── 6. Trigger: Membership approved/rejected ────────────────
create or replace function trg_membership_updated() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_project_name text;
begin
  if old.status = new.status then
    return new;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  if new.status = 'approved' then
    perform send_push_to_users(
      array[new.user_id]::uuid[],
      '✅ 工地申請通過',
      '你已加入「' || coalesce(v_project_name, '工地') || '」',
      '/projects'
    );
  elsif new.status = 'rejected' then
    perform send_push_to_users(
      array[new.user_id]::uuid[],
      '❌ 工地申請被拒',
      '「' || coalesce(v_project_name, '工地') || '」嘅申請被拒絕',
      '/projects'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_membership_updated on project_members;
create trigger on_membership_updated
  after update on project_members
  for each row execute function trg_membership_updated();

-- ── 7. Trigger: PM assigned ──────────────────────────────────
create or replace function trg_project_pm_changed() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_pms uuid[];
begin
  -- Find newly added PMs (in NEW but not in OLD)
  select array_agg(pm) into v_new_pms
    from unnest(new.assigned_pm_ids) pm
    where not pm = any(coalesce(old.assigned_pm_ids, '{}'::uuid[]));

  if v_new_pms is null or array_length(v_new_pms, 1) is null then
    return new;
  end if;

  perform send_push_to_users(
    v_new_pms,
    '📋 你被指派為 PM',
    '你被指派管理工地「' || new.name || '」',
    '/project/' || new.id
  );
  return new;
end;
$$;

drop trigger if exists on_project_pm_changed on projects;
create trigger on_project_pm_changed
  after update on projects
  for each row when (old.assigned_pm_ids is distinct from new.assigned_pm_ids)
  execute function trg_project_pm_changed();

-- ── 8. Trigger: Progress item assignment changed ─────────────
create or replace function trg_progress_assignment_changed() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_new_assignees uuid[];
  v_project_name text;
begin
  -- Newly added owners + delegatees
  select array_agg(distinct uid) into v_new_assignees
    from (
      select unnest(new.assigned_to) as uid
      where not unnest(new.assigned_to) = any(coalesce(old.assigned_to, '{}'::uuid[]))
      union
      select unnest(new.delegated_to)
      where not unnest(new.delegated_to) = any(coalesce(old.delegated_to, '{}'::uuid[]))
    ) t
    where uid is not null;

  if v_new_assignees is null or array_length(v_new_assignees, 1) is null then
    return new;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  perform send_push_to_users(
    v_new_assignees,
    '👷 你被指派工序',
    coalesce(v_project_name, '工地') || ' · ' || new.code || ' ' || new.title,
    '/project/' || new.project_id
  );
  return new;
end;
$$;

drop trigger if exists on_progress_assignment_changed on progress_items;
create trigger on_progress_assignment_changed
  after update on progress_items
  for each row when (
    old.assigned_to is distinct from new.assigned_to
    or old.delegated_to is distinct from new.delegated_to
  )
  execute function trg_progress_assignment_changed();
