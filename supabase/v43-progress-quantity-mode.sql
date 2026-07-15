-- =============================================================
-- v43-progress-quantity-mode.sql
-- =============================================================
-- Problem 4 · Phase P2 (§3.6 item 2 of PROGRESS-TABLE-PROJECT-TYPES.md):
--   the 'quantity' tracking mode for 渠務 / linear work, plus the
--   quantity-carrying audit columns and a real 'blocked' reason.
--
-- Scope of THIS migration is deliberately minimal and ADDITIVE. It does
-- NOT build 'unit_status' or its label_status column — that is P3.
--
--   1. progress_items     + qty_total numeric            (nullable)
--                         + qty_done  numeric not null default 0
--                         + qty_unit  text               (nullable)
--                         + blocked_reason text          (nullable)
--   2. progress_history   + qty_done  numeric            (nullable)
--   3. progress_snapshots + qty_done  numeric            (nullable)
--   4. Widen progress_items.tracking_mode CHECK to add 'quantity'
--      (keeping 'percentage','floors','checklist') — drop-by-name +
--      defensive DO-block sweep + re-add, all in ONE transaction.
--
-- % derivation stays client-side: qtyToProgress(done,total) writes
-- actual_progress the same way updateFloors does, so plannedProgressOf,
-- deriveStatus, variance display, snapshots and the rollup all keep
-- seeing a normal materialised 0–100 %. No new derivation in SQL.
--
-- get_visible_progress_items: NO RE-CREATION NEEDED. Confirmed by reading
--   v27-progress-rights-by-membership.sql — it is declared
--   `returns setof progress_items` and its body is `select * from
--   progress_items ...` / `select pi.* from progress_items pi ...`. A
--   rowtype-returning function and a star-projection both resolve their
--   column list at call time, so the four new progress_items columns
--   (qty_total / qty_done / qty_unit / blocked_reason) AUTO-SURFACE through
--   the RPC with zero edits. (progress_history / progress_snapshots are
--   read by plain table selects, also unaffected.)
--
-- Backwards compatibility (the #1 rule):
--   * Existing progress_items keep tracking_mode percentage/floors/checklist;
--     widening a CHECK only ADDS an allowed value, never rewrites rows and
--     never rejects an existing one.
--   * Every new column is nullable (or has a default), so existing rows are
--     untouched: qty_done backfills to 0, the rest to NULL. A non-quantity
--     leaf has qty_total = NULL, which the client treats as weight = 1 —
--     so computeRollup stays byte-identical for every existing project.
--   * RLS untouched; realtime untouched; next_progress_code untouched;
--     no destructive change to progress_items or user_profiles
--     (App Store constraint respected).
--
-- Idempotent: safe to re-run. Verification footer at the bottom.
-- =============================================================

begin;

-- ── 1. progress_items: quantity + blocked columns (additive) ──
alter table progress_items
  add column if not exists qty_total numeric,
  add column if not exists qty_done numeric not null default 0,
  add column if not exists qty_unit text,
  add column if not exists blocked_reason text;

-- ── 2. progress_history: carry the metres (本期 +86m) ─────────
alter table progress_history
  add column if not exists qty_done numeric;

-- ── 3. progress_snapshots: period deltas in real units ───────
alter table progress_snapshots
  add column if not exists qty_done numeric;

-- ── 4. Widen progress_items.tracking_mode enum (drop + add) ──
-- v42 attached the check as progress_items_tracking_mode_check. Drop that
-- known name; also defend against any differently-named single-column
-- check (e.g. a prior re-run under a non-default name).
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
  check (tracking_mode in ('percentage','floors','checklist','quantity'));

commit;

-- ── Verification ─────────────────────────────────────────────
-- Run after the COMMIT above; each query asserts the intended state.

-- (a) The four new progress_items columns exist with the right shape.
--     Expect four rows:
--       qty_total      | YES | (null)
--       qty_done       | NO  | 0
--       qty_unit       | YES | (null)
--       blocked_reason | YES | (null)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'progress_items'
  and column_name in ('qty_total','qty_done','qty_unit','blocked_reason')
order by column_name;

-- (b) progress_history.qty_done exists, nullable.
--     Expect one row: qty_done | YES | (null)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'progress_history'
  and column_name = 'qty_done';

-- (c) progress_snapshots.qty_done exists, nullable.
--     Expect one row: qty_done | YES | (null)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'progress_snapshots'
  and column_name = 'qty_done';

-- (d) tracking_mode CHECK now includes 'quantity' alongside the original
--     three. Expect the ARRAY to contain percentage, floors, checklist,
--     quantity (and nothing else).
select pg_get_constraintdef(con.oid) as tracking_mode_check
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'progress_items'
  and con.conname = 'progress_items_tracking_mode_check';

-- (e) No existing progress_items row violates the widened enum (sanity —
--     widening can only add, never reject). Expect zero rows.
select id, tracking_mode
from progress_items
where tracking_mode not in ('percentage','floors','checklist','quantity');

-- (f) Backwards-compat: every existing leaf is weight = 1 because qty_total
--     is NULL until someone authors a quantity item. Expect: all pre-existing
--     rows have qty_total IS NULL (only newly-created quantity items differ).
--     Informational — lists any rows that already carry a qty_total.
select id, code, tracking_mode, qty_total, qty_done, qty_unit
from progress_items
where qty_total is not null;
