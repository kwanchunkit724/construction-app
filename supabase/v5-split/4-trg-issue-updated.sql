create or replace function trg_issue_updated() returns trigger
language plpgsql security definer
set search_path = public
as $issue_updated$
declare
  v_targets uuid[];
  v_project_name text;
begin
  select name into v_project_name from projects where id = new.project_id;

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

drop trigger if exists on_issue_updated on issues;
create trigger on_issue_updated
  after update on issues
  for each row execute function trg_issue_updated();
