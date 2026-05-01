-- =============================================================
-- Construction App v2 — Phase 3: Progress Tracking schema
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================

-- ── Drop if exists (idempotent) ───────────────────────────────
drop table if exists progress_items cascade;

-- ── Table ─────────────────────────────────────────────────────
create table progress_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_id uuid references progress_items(id) on delete cascade,
  code text not null,
  title text not null,
  zone_id text,
  level int not null default 1 check (level >= 1),
  planned_start date,
  planned_end date,
  planned_progress int not null default 0 check (planned_progress between 0 and 100),
  actual_progress int not null default 0 check (actual_progress between 0 and 100),
  status text not null default 'not-started' check (status in ('not-started','in-progress','completed','delayed','blocked')),
  notes text not null default '',
  last_updated_by uuid references user_profiles(id),
  last_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index idx_progress_items_project on progress_items(project_id);
create index idx_progress_items_parent on progress_items(parent_id);

-- ── Helper functions (SECURITY DEFINER, bypass RLS internally) ──
create or replace function can_view_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
    );
$$;

create or replace function can_edit_project_progress(p_user_id uuid, p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Admin
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    -- PM of this project
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    -- Member with edit-eligible role (PM, main contractor, subcontractor)
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
        and role in ('pm', 'main_contractor', 'subcontractor')
    );
$$;

-- ── RLS ───────────────────────────────────────────────────────
alter table progress_items enable row level security;

create policy "Members can view progress items"
  on progress_items for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Editors can insert progress items"
  on progress_items for insert to authenticated
  with check (can_edit_project_progress(auth.uid(), project_id));

create policy "Editors can update progress items"
  on progress_items for update to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));

create policy "Editors can delete progress items"
  on progress_items for delete to authenticated
  using (can_edit_project_progress(auth.uid(), project_id));

-- ── Realtime ──────────────────────────────────────────────────
alter publication supabase_realtime add table progress_items;
