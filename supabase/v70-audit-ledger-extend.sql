-- =============================================================
-- v70-audit-ledger-extend.sql   (Final-upgrade Tier 1.3 — dispute-survival spine)
-- =============================================================
-- DEFECT: the hash-chained audit_ledger (v51) makes core records tamper-evident,
-- but its watched-table set OMITS the four most litigable WhatsApp-replacement
-- records: issues, issue_comments, dailies, materials. A service-role/dashboard
-- edit or an admin DELETE on these leaves NO trace today — and an admin issue
-- DELETE cascade-vaporizes the whole issue_comments thread (v4:35) silently.
--
-- IMPORTANT — ADDITIVE-ONLY. This migration touches ONLY the 6 new tables and
-- leaves every existing trg_audit_ledger untouched. Re-emitting the full watch-
-- list (as v55 did) is fragile: the LIVE list has DRIFTED past the v55 static set
-- — a post-v55 migration added `ai_actions` to the ledger (verified live 2026-06-16:
-- 19 watched tables incl ai_actions, which no static migration source lists).
-- Re-emitting a static superset would silently DROP whatever the live set has that
-- the source doesn't (e.g. ai_actions). So we add triggers to ONLY the 6 dispute
-- tables and never drop/recreate the others. Idempotent (drop-if-exists per new
-- table). Uses the existing audit_ledger_append() (v51).
-- =============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'issues','issue_comments','dailies','materials','drawings','drawing_versions'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_audit_ledger on %I', t);
      execute format('create trigger trg_audit_ledger after insert or update or delete on %I for each row execute function audit_ledger_append()', t);
    end if;
  end loop;
end$$;

-- =============================================================
-- Verify (EXECUTE, not source):
--   -- (a) coverage — every canonical table now carries trg_audit_ledger:
--   select c.relname from pg_class c
--   where c.relname in ('issues','issue_comments','dailies','materials','drawings',
--                       'drawing_versions','equipment_register','form_instances',
--                       'form_signoffs','user_credentials')
--     and not exists (select 1 from pg_trigger tg
--                     where tg.tgrelid=c.oid and tg.tgname='trg_audit_ledger');
--   -- expect 0 rows (none missing — the v55 forms tables MUST still be covered).
--
--   -- (b) chain — UPDATE an issue + INSERT a material -> audit_ledger appends,
--   --     each new row's prev_hash = the previous row's row_hash.
--
--   -- (c) DELETE-cascade — DELETE an issue that has comments -> BOTH the cascaded
--   --     issue_comments rows AND the parent issues row produced ledger entries
--   --     (the whole point: an admin DELETE no longer vaporizes the thread silently).
-- =============================================================
