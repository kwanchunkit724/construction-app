create or replace function trg_membership_updated() returns trigger
language plpgsql security definer
set search_path = public
as $membership_updated$
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
      '工地申請通過',
      '你已加入「' || coalesce(v_project_name, '工地') || '」',
      '/projects'
    );
  elsif new.status = 'rejected' then
    perform send_push_to_users(
      array[new.user_id]::uuid[],
      '工地申請被拒',
      '「' || coalesce(v_project_name, '工地') || '」嘅申請被拒絕',
      '/projects'
    );
  end if;
  return new;
end;
$membership_updated$;

drop trigger if exists on_membership_updated on project_members;
create trigger on_membership_updated
  after update on project_members
  for each row execute function trg_membership_updated();
