create or replace function trg_project_pm_changed() returns trigger
language plpgsql security definer
set search_path = public
as $pm_changed$
declare
  v_new_pms uuid[];
begin
  select array_agg(pm) into v_new_pms
    from unnest(new.assigned_pm_ids) pm
    where not pm = any(coalesce(old.assigned_pm_ids, '{}'::uuid[]));

  if v_new_pms is null or array_length(v_new_pms, 1) is null then
    return new;
  end if;

  perform send_push_to_users(
    v_new_pms,
    '你被指派為 PM',
    '你被指派管理工地「' || new.name || '」',
    '/project/' || new.id
  );
  return new;
end;
$pm_changed$;

drop trigger if exists on_project_pm_changed on projects;
create trigger on_project_pm_changed
  after update on projects
  for each row when (old.assigned_pm_ids is distinct from new.assigned_pm_ids)
  execute function trg_project_pm_changed();

create or replace function trg_progress_assignment_changed() returns trigger
language plpgsql security definer
set search_path = public
as $progress_assigned$
declare
  v_new_assignees uuid[];
  v_project_name text;
begin
  with new_owners as (
    select unnest(new.assigned_to) as uid
    except
    select unnest(coalesce(old.assigned_to, '{}'::uuid[]))
  ), new_delegates as (
    select unnest(new.delegated_to) as uid
    except
    select unnest(coalesce(old.delegated_to, '{}'::uuid[]))
  )
  select array_agg(distinct uid) into v_new_assignees
    from (select uid from new_owners union select uid from new_delegates) t
    where uid is not null;

  if v_new_assignees is null or array_length(v_new_assignees, 1) is null then
    return new;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  perform send_push_to_users(
    v_new_assignees,
    '你被指派工序',
    coalesce(v_project_name, '工地') || ' - ' || new.code || ' ' || new.title,
    '/project/' || new.project_id
  );
  return new;
end;
$progress_assigned$;

drop trigger if exists on_progress_assignment_changed on progress_items;
create trigger on_progress_assignment_changed
  after update on progress_items
  for each row when (
    old.assigned_to is distinct from new.assigned_to
    or old.delegated_to is distinct from new.delegated_to
  )
  execute function trg_progress_assignment_changed();
