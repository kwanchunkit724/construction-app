-- =============================================================
-- Construction App v2 — Phase 1 Schema
-- Run this entire file in Supabase Dashboard → SQL Editor
-- WARNING: This drops ALL existing tables (clean slate rebuild)
-- =============================================================

-- ── 1. Drop v1 tables ────────────────────────────────────────
drop table if exists progress_history cascade;
drop table if exists progress_items cascade;
drop table if exists site_messages cascade;
drop table if exists project_members cascade;
drop table if exists projects cascade;
drop table if exists user_profiles cascade;
drop table if exists issues cascade;
drop table if exists issue_history cascade;

-- ── 2. Create tables (in dependency order) ──────────────────

create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  name text not null,
  global_role text not null check (global_role in (
    'admin','pm','main_contractor','subcontractor','subcontractor_worker','owner'
  )),
  sub_role text check (sub_role in ('engineer','foreman','safety')),
  company text,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zones jsonb not null default '[]'::jsonb,
  assigned_pm_ids uuid[] not null default '{}',
  created_by uuid references user_profiles(id),
  created_at timestamptz default now()
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  role text not null check (role in (
    'pm','main_contractor','subcontractor','subcontractor_worker','owner'
  )),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  applied_at timestamptz default now(),
  approved_by uuid references user_profiles(id),
  approved_at timestamptz,
  unique(user_id, project_id)
);

-- ── 3. Indexes ───────────────────────────────────────────────
create index idx_user_profiles_phone on user_profiles(phone);
create index idx_project_members_project on project_members(project_id);
create index idx_project_members_user on project_members(user_id);
create index idx_project_members_status on project_members(status);

-- ── 4. Enable RLS ────────────────────────────────────────────
alter table user_profiles enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;

-- ── 5. user_profiles policies ────────────────────────────────
create policy "Anyone authenticated can read profiles"
  on user_profiles for select to authenticated using (true);

create policy "Users can insert own profile"
  on user_profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on user_profiles for update to authenticated
  using (auth.uid() = id);

-- ── 6. projects policies ─────────────────────────────────────
create policy "Admin full access on projects"
  on projects for all to authenticated
  using (exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  ))
  with check (exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  ));

create policy "PM reads assigned projects"
  on projects for select to authenticated
  using (auth.uid() = any(assigned_pm_ids));

create policy "Approved members read joined projects"
  on projects for select to authenticated
  using (exists (
    select 1 from project_members
    where project_id = projects.id
      and user_id = auth.uid()
      and status = 'approved'
  ));

-- For project discovery (apply-to-join picker)
create policy "Authenticated can read all projects (name discovery)"
  on projects for select to authenticated using (true);

-- ── 7. project_members policies ──────────────────────────────
create policy "User reads own memberships"
  on project_members for select to authenticated
  using (user_id = auth.uid());

create policy "Admin reads all memberships"
  on project_members for select to authenticated
  using (exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  ));

create policy "PM reads project memberships"
  on project_members for select to authenticated
  using (exists (
    select 1 from projects p
    where p.id = project_id and auth.uid() = any(p.assigned_pm_ids)
  ));

create policy "Subcontractor reads workers in own project"
  on project_members for select to authenticated
  using (exists (
    select 1 from project_members pm2
    where pm2.user_id = auth.uid()
      and pm2.project_id = project_members.project_id
      and pm2.role = 'subcontractor'
      and pm2.status = 'approved'
  ));

create policy "User can apply to projects"
  on project_members for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy "Admin updates memberships"
  on project_members for update to authenticated
  using (exists (
    select 1 from user_profiles where id = auth.uid() and global_role = 'admin'
  ));

create policy "PM approves memberships"
  on project_members for update to authenticated
  using (exists (
    select 1 from projects p
    where p.id = project_id and auth.uid() = any(p.assigned_pm_ids)
  ));

create policy "Subcontractor approves workers"
  on project_members for update to authenticated
  using (
    role = 'subcontractor_worker'
    and exists (
      select 1 from project_members pm2
      where pm2.user_id = auth.uid()
        and pm2.project_id = project_members.project_id
        and pm2.role = 'subcontractor'
        and pm2.status = 'approved'
    )
  );

-- ── 8. Realtime publication ──────────────────────────────────
alter publication supabase_realtime add table user_profiles;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_members;
