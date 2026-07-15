-- =============================================================
-- v11-dailies-schema.sql
-- =============================================================
-- Daily site log feature (v1.2 / Plan 11).
--
-- One log per (project_id, user_id, date) so each foreman /
-- engineer keeps their own record but the project view shows all
-- members' submissions side-by-side. Edit window: only the same
-- HKT date as the log's `date` column — yesterday's diary stays
-- locked. All approved project members can READ every daily in
-- the project (transparency in disputes).
--
-- Apply order: standalone, no FK to other v11 tables.
-- =============================================================

create table if not exists dailies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weather text not null check (weather in ('晴','陰','雨','暴雨','熱','凍','大風')),
  progress_item_ids uuid[] not null default '{}',
  freeform_items text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, date)
);

create index if not exists idx_dailies_project_date
  on dailies (project_id, date desc);

create index if not exists idx_dailies_user
  on dailies (user_id);

create or replace function trg_dailies_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dailies_updated_at on dailies;
create trigger trg_dailies_updated_at
  before update on dailies
  for each row execute function trg_dailies_set_updated_at();

alter table dailies enable row level security;

-- Read: any approved project member can read every daily in that project
drop policy if exists dailies_select on dailies;
create policy dailies_select on dailies for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

-- Insert: self only, must be foreman or engineer, must be approved member
drop policy if exists dailies_insert on dailies;
create policy dailies_insert on dailies for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from user_profiles up
      where up.id = auth.uid()
        and up.global_role = 'main_contractor'
        and up.sub_role in ('foreman','engineer')
    )
    and exists (
      select 1 from project_members pm
      where pm.project_id = dailies.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

-- Update: only own row + only the SAME HKT day as `date`
drop policy if exists dailies_update on dailies;
create policy dailies_update on dailies for update
  using (
    user_id = auth.uid()
    and date = (now() at time zone 'Asia/Hong_Kong')::date
  )
  with check (
    user_id = auth.uid()
    and date = (now() at time zone 'Asia/Hong_Kong')::date
  );

-- Delete: only own row + same HKT day
drop policy if exists dailies_delete on dailies;
create policy dailies_delete on dailies for delete
  using (
    user_id = auth.uid()
    and date = (now() at time zone 'Asia/Hong_Kong')::date
  );

-- Realtime so DailyList re-fetches when peers submit
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'dailies'
  ) then
    alter publication supabase_realtime add table dailies;
  end if;
end$$;
