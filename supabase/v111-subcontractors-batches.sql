-- =============================================================
-- v111-subcontractors-batches.sql  (進度表結構 T2 — 判頭公司實體 + 判紙記錄)
-- =============================================================
-- Panel verdict follow-through: 公司 = 商業責任, 個人 = 報數人 — two layers.
-- subcontractor_companies names the firm a 判紙 is let to (NSC vs labour-only);
-- assignment_batches records each 判紙-shaped bulk assignment (分區 × 樓層範圍
-- × 工種 × 公司 × 邊啲人 × 邊個撳 × 幾時) so "睇返成張判紙" is a SELECT,
-- not a two-years-later history-replay reconstruction. The batch tool still
-- writes assigned_to[] on every matched leaf (views/permissions unchanged) —
-- the batch row is the DOCUMENT, the leaf arrays are the MECHANISM.
-- Additive only: two new tables, nothing existing touched.
-- =============================================================

create table if not exists subcontractor_companies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  kind text not null default 'labour' check (kind in ('nsc','labour')),
  contact text,
  created_by uuid not null references user_profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_sub_companies_project on subcontractor_companies(project_id);

create table if not exists assignment_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zone_id text,
  floor_from text,
  floor_to text,
  trade text references trades(code),
  company_id uuid references subcontractor_companies(id) on delete set null,
  assignee_ids uuid[] not null default '{}',
  item_count integer not null default 0,
  note text,
  created_by uuid not null references user_profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_assignment_batches_project on assignment_batches(project_id, created_at desc);

alter table subcontractor_companies enable row level security;
alter table assignment_batches enable row level security;

drop policy if exists sub_companies_select on subcontractor_companies;
create policy sub_companies_select on subcontractor_companies for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists sub_companies_insert on subcontractor_companies;
create policy sub_companies_insert on subcontractor_companies for insert to authenticated
  with check (created_by = auth.uid() and can_manage_project_progress(auth.uid(), project_id));
drop policy if exists sub_companies_update on subcontractor_companies;
create policy sub_companies_update on subcontractor_companies for update to authenticated
  using (can_manage_project_progress(auth.uid(), project_id))
  with check (can_manage_project_progress(auth.uid(), project_id));
drop policy if exists sub_companies_delete on subcontractor_companies;
create policy sub_companies_delete on subcontractor_companies for delete to authenticated
  using (can_manage_project_progress(auth.uid(), project_id));

drop policy if exists assignment_batches_select on assignment_batches;
create policy assignment_batches_select on assignment_batches for select to authenticated
  using (can_view_project(auth.uid(), project_id));
-- batches are an append-only 判紙 record: insert by managers, NO update/delete
-- policy (a mis-assigned 判紙 is corrected by a new batch, the old row stays
-- in the trail — dispute-survival spine).
drop policy if exists assignment_batches_insert on assignment_batches;
create policy assignment_batches_insert on assignment_batches for insert to authenticated
  with check (created_by = auth.uid() and can_manage_project_progress(auth.uid(), project_id));

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   to_regclass both tables -> non-null.
--   as [TEST] PM: insert company -> ok (read back); insert batch -> ok.
--   as [TEST] worker: insert company -> RLS denied; select -> sees PM's row.
--   as [TEST] PM: update/delete a batch -> 0 rows (append-only).
-- =============================================================
