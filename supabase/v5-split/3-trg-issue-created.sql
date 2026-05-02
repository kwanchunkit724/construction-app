create or replace function trg_issue_created() returns trigger
language plpgsql security definer
set search_path = public
as $issue_created$
declare
  v_targets uuid[];
  v_project_name text;
begin
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

drop trigger if exists on_issue_created on issues;
create trigger on_issue_created
  after insert on issues
  for each row execute function trg_issue_created();
