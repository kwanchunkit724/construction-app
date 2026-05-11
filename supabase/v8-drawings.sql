-- =============================================================
-- v8-drawings.sql — Phase 1 of 工地控制系統 milestone
-- =============================================================
-- Skips contested v5/v6/v7 namespace per D-33. Introduces:
--   * drawings + drawing_versions tables
--   * project-drawings PRIVATE bucket
--   * can_upload_drawing helper (excludes subcontractor — D-25)
--   * supersede_drawing_version RPC (ISSUE-09 atomicity fix)
--   * leaf-only trigger (drawing → progress_items leaf)
--   * RLS on tables + storage.objects
--   * Realtime publication entries
--   * demo_feedback RLS fix ride-along (INF-05 / D-32 / m8)
--
-- Run once in Supabase Dashboard → SQL Editor.
-- Idempotent at top via defensive drops.
-- =============================================================

-- ── 1. Defensive drops (idempotent re-run) ────────────────────
drop function if exists supersede_drawing_version(uuid, int, text, text, text, bigint, text, uuid) cascade;
drop trigger if exists drawings_leaf_only on drawings;
drop function if exists assert_progress_item_is_leaf() cascade;
drop function if exists can_upload_drawing(uuid, uuid) cascade;
drop table if exists drawing_versions cascade;
drop table if exists drawings cascade;

-- ── 2. PRIVATE bucket (per v8-private-bucket-template.sql / D-17) ──
insert into storage.buckets (id, name, public)
values ('project-drawings', 'project-drawings', false)
on conflict (id) do nothing;

-- ── 3. Tables (D-05) ──────────────────────────────────────────
create table drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  leaf_item_id uuid not null references progress_items(id) on delete cascade,
  title text not null,
  current_version_id uuid,  -- FK added after drawing_versions exists (deferred below)
  created_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table drawing_versions (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references drawings(id) on delete cascade,
  version_no int not null,
  file_path text not null,                -- {project_id}/{drawing_id}/v{n}/{filename}
  thumb_path text,                        -- {project_id}/{drawing_id}/v{n}/thumb.jpg
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null,
  revision_label text,                    -- ≤16 chars; defaults to v{n} in app
  status text not null default 'current'
    check (status in ('current','superseded','withdrawn')),
  uploaded_by uuid references user_profiles(id) on delete set null,
  uploaded_at timestamptz default now(),
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  unique (drawing_id, version_no)
);

alter table drawings
  add constraint drawings_current_version_fk
  foreign key (current_version_id) references drawing_versions(id) on delete set null;

-- ── 4. Leaf-only trigger (T-01-08 mitigation) ─────────────────
create or replace function assert_progress_item_is_leaf()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from progress_items where parent_id = new.leaf_item_id) then
    raise exception 'drawings can only attach to leaf progress items';
  end if;
  return new;
end;
$$;

create trigger drawings_leaf_only
  before insert or update on drawings
  for each row execute function assert_progress_item_is_leaf();

-- ── 5. Indexes ────────────────────────────────────────────────
create index idx_drawings_leaf_item on drawings(leaf_item_id);
create index idx_drawings_project on drawings(project_id);
create index idx_drawing_versions_drawing on drawing_versions(drawing_id);
create index idx_drawing_versions_status on drawing_versions(status);

-- ── 6. RLS helper: can_upload_drawing (D-19, D-25) ────────────
-- Same shape as can_edit_project_progress (v3-progress-schema.sql:51-71)
-- but EXCLUDES 'subcontractor' role (per D-25 — subcons view only).
create or replace function can_upload_drawing(p_user_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- Admin
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    -- PM of this project
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    -- Approved member with role pm OR main_contractor (subcontractor EXCLUDED)
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
        and role in ('pm', 'main_contractor')
    );
$$;

-- ── 7. supersede_drawing_version RPC (ISSUE-09 fix) ───────────
-- Single-transaction atomic supersession. Plan 05's uploadVersion
-- calls supabase.rpc('supersede_drawing_version', { ... }).
-- NOT security definer — RLS still applies; caller must satisfy
-- can_upload_drawing on the drawing_versions insert + drawings update.
create function supersede_drawing_version(
  p_drawing_id uuid,
  p_version_no int,
  p_file_path text,
  p_thumb_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_revision_label text,
  p_uploaded_by uuid
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into drawing_versions (
    drawing_id, version_no, file_path, thumb_path, mime_type,
    size_bytes, revision_label, status, uploaded_by, uploaded_at
  )
  values (
    p_drawing_id, p_version_no, p_file_path, p_thumb_path, p_mime_type,
    p_size_bytes, p_revision_label, 'current', p_uploaded_by, now()
  )
  returning id into new_id;

  update drawing_versions
    set status = 'superseded', superseded_at = now()
    where drawing_id = p_drawing_id
      and id <> new_id
      and status = 'current';

  update drawings
    set current_version_id = new_id,
        updated_at = now()
    where id = p_drawing_id;

  return new_id;
end;
$$;

grant execute on function supersede_drawing_version(uuid, int, text, text, text, bigint, text, uuid) to authenticated;

-- ── 8. Enable RLS on tables ───────────────────────────────────
alter table drawings enable row level security;
alter table drawing_versions enable row level security;

-- ── 9. Table policies ─────────────────────────────────────────

-- drawings (no delete policy — immortal in v1)
create policy "Members view drawings"
  on drawings for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Editors insert drawings"
  on drawings for insert to authenticated
  with check (can_upload_drawing(auth.uid(), project_id));

create policy "Editors update drawings"
  on drawings for update to authenticated
  using (can_upload_drawing(auth.uid(), project_id));

-- drawing_versions
create policy "Members view versions"
  on drawing_versions for select to authenticated
  using (exists (
    select 1 from drawings d
    where d.id = drawing_versions.drawing_id
      and can_view_project(auth.uid(), d.project_id)
  ));

create policy "Editors insert versions"
  on drawing_versions for insert to authenticated
  with check (exists (
    select 1 from drawings d
    where d.id = drawing_versions.drawing_id
      and can_upload_drawing(auth.uid(), d.project_id)
  ));

create policy "Uploader or admin withdraws"
  on drawing_versions for update to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

-- ── 10. storage.objects RLS for project-drawings bucket ───────
-- (D-18 path scheme: {project_id}/... → foldername[1] = project_id)
-- T-01-01 mitigation: bucket is private; only signed URLs work.
drop policy if exists "Members read drawings" on storage.objects;
drop policy if exists "Editors upload drawings" on storage.objects;

create policy "Members read drawings"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-drawings'
    and can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

create policy "Editors upload drawings"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-drawings'
    and can_upload_drawing(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- NO update / delete policies on storage.objects — drawing blobs
-- are IMMORTAL evidence (T-01-04 mitigation).

-- ── 11. Realtime publication ──────────────────────────────────
alter publication supabase_realtime add table drawings;
alter publication supabase_realtime add table drawing_versions;

-- ── 12. demo_feedback RLS fix ride-along (INF-05 / D-32 / m8) ─
-- Old policy allowed any authenticated user to read all feedback.
-- Replace with admin-only. Drop both casings to be safe (the
-- existing definition in scripts/create-feedback-table.sql uses
-- lowercase "authenticated users can read feedback").
drop policy if exists "Authenticated read feedback" on demo_feedback;
drop policy if exists "authenticated users can read feedback" on demo_feedback;

create policy "Admin reads feedback"
  on demo_feedback for select to authenticated
  using (exists (
    select 1 from user_profiles
    where id = auth.uid() and global_role = 'admin'
  ));

-- =============================================================
-- End of v8-drawings.sql
-- Verification queries (run after applying — see Plan 01-01 Task 4):
--   select table_name from information_schema.tables
--     where table_name in ('drawings','drawing_versions');
--   select id, public from storage.buckets where id = 'project-drawings';
--   select proname from pg_proc where proname in
--     ('can_upload_drawing','supersede_drawing_version','assert_progress_item_is_leaf');
--   select policyname from pg_policies where tablename = 'demo_feedback';
-- =============================================================
