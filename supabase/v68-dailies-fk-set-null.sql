-- =============================================================
-- v68-dailies-fk-set-null.sql   (Final-upgrade Tier 1.1 — dispute-survival spine)
-- =============================================================
-- DEFECT: dailies.user_id references auth.users(id) ON DELETE CASCADE
-- (v11-dailies-schema.sql:19). Apple-required account deletion therefore
-- cascade-DELETEs every 施工日報 (statutory daily site log) the user authored —
-- irreversible loss of a dispute record. v20-delete-account-fk-cascade repointed
-- every OTHER authored table to ON DELETE SET NULL but explicitly left dailies
-- "unchanged" (v20:41-42), wrongly grouping a statutory record with
-- notification/membership rows where cascade is correct.
--
-- FIX: change ONLY the ON DELETE rule to SET NULL, KEEPING the auth.users parent
-- (do NOT repoint to user_profiles — that would cross FK parents and force a
-- row-existence pre-validation). SET NULL semantics still null the author ref when
-- the account is deleted, so the daily survives anonymized. Pure DDL, no data
-- migration, no orphan risk. Constraint name discovered dynamically (robust to the
-- original auto-name dailies_user_id_fkey).
-- Idempotent. Backwards-compatible (live iOS users unaffected — only deletion path changes).
-- =============================================================

begin;

-- Drop NOT NULL so a deleted author's rows can hold user_id = NULL.
alter table dailies alter column user_id drop not null;

-- Discover + drop the existing FK on dailies.user_id, then re-add with SET NULL.
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  where con.conrelid = 'public.dailies'::regclass
    and con.contype = 'f'
    and con.conkey = array[
      (select attnum from pg_attribute
       where attrelid = 'public.dailies'::regclass and attname = 'user_id')
    ];
  if cname is not null then
    execute format('alter table dailies drop constraint %I', cname);
  end if;
end $$;

alter table dailies
  add constraint dailies_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

commit;

-- =============================================================
-- Verify (EXECUTE, not source):
--   -- 1. confirm the rule + nullability:
--   select a.attnotnull,
--          (select confdeltype from pg_constraint
--             where conrelid='public.dailies'::regclass and contype='f'
--               and conkey = array[a.attnum]) as on_delete   -- 'n' = SET NULL
--   from pg_attribute a
--   where a.attrelid='public.dailies'::regclass and a.attname='user_id';
--   -- expect attnotnull=false, on_delete='n'
--
--   -- 2. Apple-path assertion: delete a throwaway user who authored a daily ->
--   --    deletion succeeds (no 23503) AND the daily row survives with user_id IS NULL.
-- =============================================================
