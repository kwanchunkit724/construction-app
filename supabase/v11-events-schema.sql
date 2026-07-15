-- =============================================================
-- v11-events-schema.sql
-- =============================================================
-- Manual calendar events for the v1.2 timetable feature.
--
-- The timetable RPC unions three sources: material planned
-- arrivals, progress-item planned_end completions, and rows from
-- this table. Manual events let PMs add meetings, inspections,
-- milestones the other two sources don't model directly.
--
-- Write access: admin / pm / main_contractor only — keeps the
-- shared schedule from getting noisy from worker doodles.
-- =============================================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  event_type text not null default 'other'
    check (event_type in ('meeting','inspection','milestone','other')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_project_starts on events (project_id, starts_at);

create or replace function trg_events_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
  before update on events
  for each row execute function trg_events_set_updated_at();

alter table events enable row level security;

drop policy if exists events_select on events;
create policy events_select on events for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = events.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists events_insert on events;
create policy events_insert on events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = events.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor')
    )
  );

drop policy if exists events_update on events;
create policy events_update on events for update
  using (
    created_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role in ('admin','pm'))
  );

drop policy if exists events_delete on events;
create policy events_delete on events for delete
  using (
    created_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role in ('admin','pm'))
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
end$$;
