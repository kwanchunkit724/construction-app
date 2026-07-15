-- =============================================================
-- v38-meta-change-history.sql
-- =============================================================
-- Program 2026-06 Wave 1 (problem 3 polish + DB-REVIEW P1-A / P1-C).
-- The rename capability (大/中/細項 改名 + 改日期) already shipped in 1237b13
-- (EditItemModal + ProgressContext.updateItemMeta). This migration closes the
-- two gaps the review found:
--
--   (A) AUDIT: metadata edits (rename / date change) wrote NO history row, yet
--       "判頭 says the item used to be called X / due Y" is exactly the contested
--       fact. progress_history gains change_type + meta so the client can journal
--       a rename as an immutable, attributed row alongside progress ticks.
--
--   (B) WRITE-GUARD: the progress_items UPDATE policy (v15) is ROW-level — a
--       contributor in assigned_to/delegated_to can, via raw REST, rewrite
--       title/code/planned dates/zone/parent/level/tracking_mode/floor_labels on
--       the very item they are measured on. The UI never exposes it; this trigger
--       makes the server enforce what the UI implies: structural / metadata columns
--       are manager-only (can_manage_project_progress, v27). Contributors keep
--       updating actual_progress / floors_completed / status / notes / assignments.
--
-- Additive + backwards-compatible: old iOS v1.3 clients ignore the new columns,
-- and no legitimate client path writes a protected column except updateItemMeta
-- (which is already manager-gated). Idempotent.
-- =============================================================

-- ── (A) journal metadata edits ──────────────────────────────
alter table progress_history
  add column if not exists change_type text not null default 'progress',
  add column if not exists meta jsonb;

-- ── (B) column-level write-guard on progress_items ──────────
create or replace function guard_progress_item_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / migrations (no auth context) bypass the guard.
  if auth.uid() is null then
    return new;
  end if;

  if (new.title         is distinct from old.title
      or new.code          is distinct from old.code
      or new.planned_start is distinct from old.planned_start
      or new.planned_end   is distinct from old.planned_end
      or new.zone_id       is distinct from old.zone_id
      or new.parent_id     is distinct from old.parent_id
      or new.level         is distinct from old.level
      or new.tracking_mode is distinct from old.tracking_mode
      or new.floor_labels  is distinct from old.floor_labels)
     and not can_manage_project_progress(auth.uid(), new.project_id)
  then
    raise exception '只有項目管理人員可更改項目的名稱／編號／日期／結構';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_progress_item_meta on progress_items;
create trigger trg_guard_progress_item_meta
  before update on progress_items
  for each row execute function guard_progress_item_meta();

-- =============================================================
-- Post-apply verification (verify by EXECUTION, not source):
--   -- as a CONTRIBUTOR (assigned worker JWT), via REST:
--   --   PATCH progress_items?id=eq.<assigned leaf> {"title":"hax"}  → ERROR (guard)
--   --   PATCH progress_items?id=eq.<assigned leaf> {"actual_progress":40,"status":"in-progress"} → OK
--   -- as a MANAGER (PM/老總): updateItemMeta rename → OK + a change_type='meta' history row appears
--   select change_type, meta, actual_progress from progress_history
--     where item_id = '<id>' order by created_at desc limit 3;
-- =============================================================
