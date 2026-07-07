-- =============================================================
-- v108-progress-templates.sql   (進度表 #4 — 每地盤工序範本, E4/E5 as decided)
-- =============================================================
-- Reusable 工序 bundles (走廊工作 / 垃圾房工作 / 𨋢大堂工作…) per project.
-- E4: PROJECT scope — each 地盤 owns its own template list (no global/user
-- tiers). E5: COPY-IN — applying a template stamps ordinary progress_items;
-- editing the template later does NOT touch anything already inserted (never
-- retroactive; live projects can't change shape under the 判頭 mid-work).
--
-- Additive: one new table, zero changes to progress_items. The template body
-- is a jsonb array of item seeds:
--   [{ title, tracking_mode, floor_labels, qty_total, qty_unit,
--      acceptance_required }]
-- Copy-in happens client-side through the existing addItem path (same RLS,
-- same next_progress_code numbering, same audit) — a template is just a
-- pre-filled hand, not a new write path.
--
-- Authorization mirrors progress structure edits: anyone who can create
-- progress items (can_manage_project_progress) can manage + apply templates;
-- any project viewer can read them.
-- =============================================================

create table if not exists progress_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_by uuid not null references user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_progress_templates_project on progress_templates(project_id);

alter table progress_templates enable row level security;

drop policy if exists progress_templates_select on progress_templates;
create policy progress_templates_select on progress_templates for select to authenticated
  using (can_view_project(auth.uid(), project_id));

drop policy if exists progress_templates_insert on progress_templates;
create policy progress_templates_insert on progress_templates for insert to authenticated
  with check (
    created_by = auth.uid()
    and can_manage_project_progress(auth.uid(), project_id)
  );

drop policy if exists progress_templates_update on progress_templates;
create policy progress_templates_update on progress_templates for update to authenticated
  using (can_manage_project_progress(auth.uid(), project_id))
  with check (can_manage_project_progress(auth.uid(), project_id));

drop policy if exists progress_templates_delete on progress_templates;
create policy progress_templates_delete on progress_templates for delete to authenticated
  using (can_manage_project_progress(auth.uid(), project_id));

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   select to_regclass('public.progress_templates');            -> non-null
--   -- as [TEST] PM: insert a template -> allowed, read back row.
--   -- as [TEST] worker (no manage right): insert -> 0 rows / RLS error.
--   -- as [TEST] worker: select -> sees the PM's template (viewer read).
-- =============================================================
