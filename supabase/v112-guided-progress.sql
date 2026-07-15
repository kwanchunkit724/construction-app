-- =============================================================
-- v112-guided-progress.sql  (進度表重整 — guided 模式基建)
-- =============================================================
-- The guided 進度表 is NOT a second tree. One leaf row carries all four
-- dimensions — 分區(zone_id) × 工種(trade/label) × 位置(location) × 工序(title)
-- — plus the existing floors checklist (floor_labels / floors_completed).
-- Every drill page (大樓→分區→工種→樓層→位置→工序) is a client-side
-- filter + group-by over the same flat leaves. History / RLS / realtime /
-- export / offline cache machinery is untouched.
--
-- Additive only:
--   projects.progress_mode   'classic' (default, every existing row) | 'guided'
--   projects.site_map        jsonb grid placement for the 2.5D map
--   progress_items.location  the 位置 dimension (走廊 / 垃圾房 / 𨋢大堂 …)
--   project_dicts            per-project dictionaries (工種 / 位置 / 工序 /
--                            文件類型 / 圖則類型); locked rows are the
--                            hard-coded entries that must never be deleted.
--
-- 分區 kind (大樓/外圍) + per-tower floors live INSIDE projects.zones jsonb
-- ({id,name,kind,floors}) — no schema change needed, old rows read kind as
-- undefined and are treated as classic.
-- =============================================================

alter table projects add column if not exists progress_mode text not null default 'classic'
  check (progress_mode in ('classic','guided'));
alter table projects add column if not exists site_map jsonb;
alter table progress_items add column if not exists location text;
-- guided-mode 工種 is a per-project user-defined LABEL (結構 / 泥水及裝修 / BS…),
-- not a code from the global trades dictionary — progress_items.trade has an
-- FK to trades(code), so guided rows use a separate free-text column instead
-- of loosening that constraint.
alter table progress_items add column if not exists trade_label text;
-- guided 文件 tab: 圖則分類 (結構圖 / Arch圖 / GDP / 水電圖 / 泥井圖 …) or a
-- user-defined 文件類型 label. NULL on every classic document.
alter table documents add column if not exists category_label text;

create table if not exists project_dicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('trade','location','process','doc_type','drawing_type')),
  label text not null,
  sort_order integer not null default 0,
  locked boolean not null default false,
  created_by uuid references user_profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, kind, label)
);
create index if not exists idx_project_dicts_project on project_dicts(project_id, kind, sort_order);

alter table project_dicts enable row level security;

drop policy if exists project_dicts_select on project_dicts;
create policy project_dicts_select on project_dicts for select to authenticated
  using (can_view_project(auth.uid(), project_id));
drop policy if exists project_dicts_insert on project_dicts;
create policy project_dicts_insert on project_dicts for insert to authenticated
  with check (can_manage_project_progress(auth.uid(), project_id));
drop policy if exists project_dicts_update on project_dicts;
create policy project_dicts_update on project_dicts for update to authenticated
  using (can_manage_project_progress(auth.uid(), project_id))
  with check (can_manage_project_progress(auth.uid(), project_id));
-- locked rows (圖則, 施工方案及物料送審) are undeletable at the policy level —
-- no trigger needed, the DELETE simply matches zero rows.
drop policy if exists project_dicts_delete on project_dicts;
create policy project_dicts_delete on project_dicts for delete to authenticated
  using (can_manage_project_progress(auth.uid(), project_id) and not locked);

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   \d project_dicts -> exists; projects/progress_items new columns exist.
--   as [TEST] PM: insert trade dict row -> ok (read back); delete -> ok.
--   insert locked doc_type row -> ok; delete it -> 0 rows (locked).
--   as [TEST] worker: insert dict row -> RLS denied; select -> sees rows.
-- =============================================================
