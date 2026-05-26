-- =============================================================
-- v11-materials-schema.sql
-- =============================================================
-- On-site material orders for v1.2.
--
-- Subcontractor submits the request with the planned arrival
-- date/time; MC/PM can adjust planned_arrival_at; anyone with
-- write access can record incoming qty (qty_arrived). status is
-- a generated column so the UI badge stays consistent regardless
-- of who edited the row last.
--
-- item_ids is a uuid[] of progress_items the material feeds.
-- Used both by the ItemDetail "needed materials" panel and the
-- timetable RPC which surfaces planned arrivals on the calendar.
-- =============================================================

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  unit text not null,
  qty_needed numeric not null check (qty_needed > 0),
  qty_arrived numeric not null default 0 check (qty_arrived >= 0),
  item_ids uuid[] not null default '{}',
  requested_by uuid references auth.users(id) on delete set null,
  planned_arrival_at timestamptz,
  arrived_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stored status is purely qty-driven so the expression stays immutable
  -- (Postgres rejects now()/timeofday() inside generated columns). The
  -- "late" pseudo-status (requested + past planned_arrival_at) is computed
  -- at read time on the client and inside get_timetable.
  status text generated always as (
    case
      when qty_arrived >= qty_needed then 'arrived'
      when qty_arrived > 0 then 'partial'
      else 'requested'
    end
  ) stored
);

create index if not exists idx_materials_project on materials (project_id, created_at desc);
create index if not exists idx_materials_planned on materials (planned_arrival_at);
create index if not exists idx_materials_items on materials using gin (item_ids);

create or replace function trg_materials_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- auto-stamp arrived_at the first time the order becomes fully received
  if new.qty_arrived >= new.qty_needed and new.arrived_at is null then
    new.arrived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_materials_updated_at on materials;
create trigger trg_materials_updated_at
  before update on materials
  for each row execute function trg_materials_set_updated_at();

alter table materials enable row level security;

-- Read: any approved project member
drop policy if exists materials_select on materials;
create policy materials_select on materials for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
    )
  );

-- Insert: subcontractor / foreman / engineer / MC / PM / admin (writer = creator)
drop policy if exists materials_insert on materials;
create policy materials_insert on materials for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
  );

-- Update: same role group can revise planned_arrival_at, record qty_arrived, etc.
drop policy if exists materials_update on materials;
create policy materials_update on materials for update
  using (
    exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
  )
  with check (
    exists (
      select 1 from project_members pm
      join user_profiles up on up.id = pm.user_id
      where pm.project_id = materials.project_id
        and pm.user_id = auth.uid()
        and pm.status = 'approved'
        and up.global_role in ('admin','pm','main_contractor','subcontractor')
    )
  );

-- Delete: only requester OR admin/pm (prevents subcon from removing peers' orders)
drop policy if exists materials_delete on materials;
create policy materials_delete on materials for delete
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from user_profiles
      where id = auth.uid() and global_role in ('admin','pm')
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'materials'
  ) then
    alter publication supabase_realtime add table materials;
  end if;
end$$;
