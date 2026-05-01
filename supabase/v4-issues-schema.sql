-- =============================================================
-- Construction App v2 — Phase 4: Issue Tracking schema
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================

drop table if exists issue_comments cascade;
drop table if exists issues cascade;

-- ── issues ───────────────────────────────────────────────────
create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reporter_id uuid not null references user_profiles(id),
  reporter_role text not null,  -- snapshot at time of reporting
  title text not null,
  description text not null default '',
  photos jsonb not null default '[]'::jsonb,  -- array of public URLs
  current_handler_role text not null check (current_handler_role in (
    'pm', 'main_contractor', 'subcontractor', 'admin'
  )),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references user_profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_issues_project on issues(project_id);
create index idx_issues_status on issues(status);
create index idx_issues_handler on issues(current_handler_role);

-- ── issue_comments / activity log ────────────────────────────
create table issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  author_id uuid not null references user_profiles(id),
  action text not null check (action in (
    'reported', 'commented', 'escalated', 'resolved', 'reopened'
  )),
  body text not null default '',
  from_role text,
  to_role text,
  created_at timestamptz default now()
);

create index idx_issue_comments_issue on issue_comments(issue_id);

-- ── Helper: does user have role X in project Y? ──────────────
create or replace function has_role_in_project(p_user_id uuid, p_project_id uuid, p_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_role = 'admin' then
      exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    when p_role = 'pm' then
      exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
      or exists (
        select 1 from project_members
        where user_id = p_user_id and project_id = p_project_id
          and role = 'pm' and status = 'approved'
      )
    else
      exists (
        select 1 from project_members
        where user_id = p_user_id and project_id = p_project_id
          and role = p_role and status = 'approved'
      )
  end;
$$;

-- ── RLS for issues ───────────────────────────────────────────
alter table issues enable row level security;

create policy "Members view issues in their projects"
  on issues for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Members create issues in their projects"
  on issues for insert to authenticated
  with check (can_view_project(auth.uid(), project_id) and reporter_id = auth.uid());

-- Updates: admin OR current handler role
create policy "Admin or current handler updates issues"
  on issues for update to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or has_role_in_project(auth.uid(), project_id, current_handler_role)
    or reporter_id = auth.uid()
  );

create policy "Admin deletes issues"
  on issues for delete to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));

-- ── RLS for issue_comments ───────────────────────────────────
alter table issue_comments enable row level security;

create policy "Members view comments in their issues"
  on issue_comments for select to authenticated
  using (exists (
    select 1 from issues
    where id = issue_comments.issue_id
      and can_view_project(auth.uid(), project_id)
  ));

create policy "Members add comments to their issues"
  on issue_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from issues
      where id = issue_comments.issue_id
        and can_view_project(auth.uid(), project_id)
    )
  );

-- ── Realtime ──────────────────────────────────────────────────
alter publication supabase_realtime add table issues;
alter publication supabase_realtime add table issue_comments;

-- ── Storage bucket for issue photos ──────────────────────────
insert into storage.buckets (id, name, public)
values ('issue-photos', 'issue-photos', true)
on conflict (id) do nothing;

-- Drop existing policies on storage.objects for this bucket (idempotent)
drop policy if exists "Public read issue photos" on storage.objects;
drop policy if exists "Authenticated upload issue photos" on storage.objects;
drop policy if exists "Owner deletes issue photos" on storage.objects;

create policy "Public read issue photos"
  on storage.objects for select
  using (bucket_id = 'issue-photos');

create policy "Authenticated upload issue photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'issue-photos');

create policy "Owner deletes issue photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'issue-photos' and owner = auth.uid());
