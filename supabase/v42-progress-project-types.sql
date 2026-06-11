-- =============================================================
-- v42-progress-project-types.sql
-- =============================================================
-- Problem 4 · Phase P1 (§3.6 item 1 of PROGRESS-TABLE-PROJECT-TYPES.md):
--   project_type on projects + the 'checklist' tracking mode.
--
-- Scope of THIS migration is deliberately minimal and ADDITIVE:
--   1. projects.project_type text not null default 'general'
--      check in ('general','small_works','drainage','maintenance')
--   2. Widen the progress_items.tracking_mode CHECK to allow 'checklist'
--      (keeping 'percentage','floors') — drop+add in one transaction.
--
-- NO new progress_items columns. 'checklist' reuses the existing
-- floor_labels / floors_completed jsonb storage (it is the same
-- labelled-checklist engine, rendered differently on the client), so
-- floorsToProgress keeps deriving actual_progress untouched. The
-- quantity / unit_status modes and their columns belong to P2/P3 and
-- are intentionally NOT created here.
--
-- get_visible_progress_items: NO CHANGE NEEDED. It is declared
--   `returns setof progress_items` and its body is `select *` /
--   `select pi.*` (see v11/v12/v13/v14/v27). A rowtype-returning
--   function and a star-projection both resolve the column list at
--   call time, so they already surface every current column and will
--   keep working with zero edits. We add no progress_items column in
--   P1, so there is nothing for it to miss either way.
--
-- Backwards compatibility (the #1 rule):
--   * Existing projects get project_type = 'general' via the column
--     DEFAULT — the client treats 'general' as today's exact behaviour,
--     so live iOS data renders byte-identical.
--   * Existing progress_items keep tracking_mode 'percentage'/'floors';
--     widening a CHECK only ADDS an allowed value, never rewrites rows
--     and never rejects an existing one.
--   * RLS untouched; realtime untouched; next_progress_code untouched.
--
-- Idempotent: safe to re-run. Verification footer at the bottom.
-- =============================================================

begin;

-- ── 1. projects.project_type (additive) ──────────────────────
alter table projects
  add column if not exists project_type text not null default 'general';

-- Constraint added separately so re-runs don't error on a duplicate
-- inline check (add column if not exists skips the column but would
-- still try to (re)attach an inline constraint on some PG versions).
alter table projects
  drop constraint if exists projects_project_type_check;
alter table projects
  add constraint projects_project_type_check
  check (project_type in ('general','small_works','drainage','maintenance'));

-- ── 2. Widen progress_items.tracking_mode enum (drop + add) ──
-- The original check (v3-5-progress-extras.sql) was attached inline by
-- `add column ... check (...)`, which PG auto-named
-- progress_items_tracking_mode_check. Drop that known name; also defend
-- against any differently-named single-column check by discovering it.
alter table progress_items
  drop constraint if exists progress_items_tracking_mode_check;

do $$
declare
  c text;
begin
  -- Catch any other CHECK constraint that references ONLY tracking_mode
  -- (e.g. if a prior re-run attached it under a non-default name).
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
  check (tracking_mode in ('percentage','floors','checklist'));

commit;

-- ── Verification ─────────────────────────────────────────────
-- Run after the COMMIT above; each query asserts the intended state.

-- (a) project_type column exists, NOT NULL, defaults to 'general'.
--     Expect one row: project_type | NO | 'general'::text
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
  and column_name = 'project_type';

-- (b) project_type CHECK lists exactly the four allowed types.
--     Expect: CHECK ((project_type = ANY (ARRAY['general'::text, ...])))
select pg_get_constraintdef(con.oid) as project_type_check
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'projects'
  and con.conname = 'projects_project_type_check';

-- (c) tracking_mode CHECK now includes 'checklist' alongside the
--     original two. Expect the ARRAY to contain percentage, floors,
--     checklist (and nothing else).
select pg_get_constraintdef(con.oid) as tracking_mode_check
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'progress_items'
  and con.conname = 'progress_items_tracking_mode_check';

-- (d) Backwards-compat: every existing project is 'general' (the
--     default backfilled all live rows). Expect zero rows returned.
select id, name, project_type
from projects
where project_type is null
   or project_type not in ('general','small_works','drainage','maintenance');

-- (e) No existing progress_items row violates the widened enum
--     (sanity — widening can only add, never reject). Expect zero rows.
select id, tracking_mode
from progress_items
where tracking_mode not in ('percentage','floors','checklist');
