-- =============================================================
-- v44-progress-unit-status.sql
-- =============================================================
-- Problem 4 · Phase P3 (§3.6 item 3 / §2.3 / §3.2 of
--   PROGRESS-TABLE-PROJECT-TYPES.md):
--   the 'unit_status' tracking mode for 大樓維修 (MBIS/MWIS) — a defect
--   register whose unit isn't a % or a boolean tick but a 5-state machine
--   (未處理 → 維修中 → 已修復 → 待覆檢 → 已簽收 / signed-off).
--
-- Scope of THIS migration is deliberately minimal and ADDITIVE:
--   1. progress_items   + label_status jsonb not null default '{}'::jsonb
--                         (a { label: UnitState } map; '{}' for every
--                          non-unit_status leaf — i.e. every existing row)
--   2. progress_history + label_status jsonb (nullable) — so a unit_status
--                          tick journals which labels changed state
--   3. Widen progress_items.tracking_mode CHECK to add 'unit_status'
--      (keeping 'percentage','floors','checklist','quantity') — drop-by-name
--      + defensive DO-block sweep + re-add, all in ONE transaction.
--
-- % derivation stays client-side, exactly like floors/quantity: the client
-- materialises actual_progress = round(signed_off / total * 100) via
-- unitStatusToProgress on every update (and keeps floors_completed in sync =
-- the signed-off labels), so plannedProgressOf, deriveStatus, variance,
-- snapshots, export and the weighted rollup all keep seeing a normal
-- materialised 0–100 %. No new derivation in SQL.
--
-- get_visible_progress_items: NO RE-CREATION NEEDED. Confirmed by reading
--   v27-progress-rights-by-membership.sql — it is declared
--   `returns setof progress_items` and BOTH branches project with a star
--   (`select * from progress_items ...` for supervisors, `select pi.* from
--   progress_items pi ...` for contributors). A rowtype-returning function
--   and a star-projection both resolve their column list at CALL time, so
--   the new progress_items.label_status column AUTO-SURFACES through the RPC
--   with zero edits. (progress_history is read by a plain table select, also
--   unaffected.)
--
-- Backwards compatibility (the #1 rule):
--   * Existing progress_items keep tracking_mode
--     percentage/floors/checklist/quantity; widening a CHECK only ADDS an
--     allowed value, never rewrites rows and never rejects an existing one.
--   * label_status has a NOT NULL default of '{}'::jsonb, so every existing
--     row backfills to an empty map and the client (Record<string,UnitState>)
--     reads it as "no labelled units" — a non-unit_status leaf is byte-
--     identical to today. progress_history.label_status is nullable (NULL on
--     every existing and every non-unit_status history row).
--   * RLS untouched; realtime untouched; next_progress_code untouched;
--     no destructive change to progress_items or user_profiles
--     (App Store constraint respected).
--
-- Idempotent: safe to re-run. Verification footer at the bottom.
-- =============================================================

begin;

-- ── 1. progress_items: label_status map (additive) ───────────
-- A { "15/F-A": "signed_off", "15/F-B": "fixing", ... } object. NOT NULL
-- with a '{}' default so existing rows backfill to an empty map (= no
-- tracked units), keeping every current project byte-identical.
alter table progress_items
  add column if not exists label_status jsonb not null default '{}'::jsonb;

-- ── 2. progress_history: carry the per-tick label states ─────
-- nullable — only unit_status ticks write it; NULL on every other (and
-- every pre-v44) history row, so the audit trail degrades gracefully.
alter table progress_history
  add column if not exists label_status jsonb;

-- ── 3. Widen progress_items.tracking_mode enum (drop + add) ──
-- v43 attached the check as progress_items_tracking_mode_check listing
-- (percentage,floors,checklist,quantity). Drop that known name; also defend
-- against any differently-named single-column check (e.g. a prior re-run
-- under a non-default name) before re-adding the widened version.
alter table progress_items
  drop constraint if exists progress_items_tracking_mode_check;

do $$
declare
  c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'progress_items'
      and nsp.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%tracking_mode%'
  loop
    execute format('alter table progress_items drop constraint %I', c);
  end loop;
end$$;

alter table progress_items
  add constraint progress_items_tracking_mode_check
  check (tracking_mode in ('percentage','floors','checklist','quantity','unit_status'));

commit;

-- ── Verification ─────────────────────────────────────────────
-- Run after the COMMIT above; each query asserts the intended state.

-- (a) progress_items.label_status exists, NOT NULL, defaults to '{}'.
--     Expect one row: label_status | NO | '{}'::jsonb
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'progress_items'
  and column_name = 'label_status';

-- (b) progress_history.label_status exists, nullable.
--     Expect one row: label_status | YES | (null)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'progress_history'
  and column_name = 'label_status';

-- (c) tracking_mode CHECK now includes 'unit_status' alongside the original
--     four. Expect the ARRAY to contain percentage, floors, checklist,
--     quantity, unit_status (and nothing else).
select pg_get_constraintdef(con.oid) as tracking_mode_check
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'progress_items'
  and con.conname = 'progress_items_tracking_mode_check';

-- (d) No existing progress_items row violates the widened enum (sanity —
--     widening can only add, never reject). Expect zero rows.
select id, tracking_mode
from progress_items
where tracking_mode not in ('percentage','floors','checklist','quantity','unit_status');

-- (e) Backwards-compat: every existing leaf has an empty label_status map
--     (the '{}' default backfilled all live rows). Informational — lists any
--     rows that already carry a non-empty map (only newly-created
--     unit_status items differ). Expect zero rows immediately post-migration.
select id, code, tracking_mode, label_status
from progress_items
where label_status is not null
  and label_status <> '{}'::jsonb;
