-- =============================================================
-- v11-contacts-schema.sql
-- =============================================================
-- Project contact directory for v1.3.
--
-- Admin/PM keep a per-project address book of trades they call
-- out to (電工 / 水喉 / 紮鐵 / 棚架 / 機電 / etc). Every member of
-- the project can read so the foreman can tap-to-call from site.
-- Write access is locked to admin or pm — workers don't curate
-- the list.
-- =============================================================

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  trade text not null,
  phone text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_project on contacts (project_id, name);
create index if not exists idx_contacts_trade on contacts (project_id, trade);

create or replace function trg_contacts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function trg_contacts_set_updated_at();

alter table contacts enable row level security;

drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = contacts.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
    and exists (
      select 1 from project_members pm
      where pm.project_id = contacts.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts for update
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
  )
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
  );

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts for delete
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table contacts;
  end if;
end$$;
