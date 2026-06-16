-- =============================================================
-- v70-audit-ledger-extend.sql   (Final-upgrade Tier 1.3 — dispute-survival spine)
-- =============================================================
-- DEFECT: the hash-chained audit_ledger (v51) makes core records tamper-evident,
-- but its watched-table set OMITS the four most litigable WhatsApp-replacement
-- records: issues, issue_comments, dailies, materials. A service-role/dashboard
-- edit or an admin DELETE on these leaves NO trace today — and an admin issue
-- DELETE cascade-vaporizes the whole issue_comments thread (v4:35) silently.
--
-- IMPORTANT: the EFFECTIVE watch-list is v55's, NOT v51's. v55-equipment-forms-
-- schema.sql:395-401 superseded the v51 loop and added equipment_register /
-- form_instances / form_signoffs / user_credentials (+ the permit_versions typo
-- fix). The DO-loop does `drop trigger if exists` then recreates ONLY listed
-- tables, so re-applying v51's 14-table array would DROP trg_audit_ledger off
-- those 4 forms/credential tables. This migration re-emits the FULL superset:
-- v55's 18 + 6 new (issues, issue_comments, dailies, materials, drawings,
-- drawing_versions) = 24 tables, and becomes the single source of truth going
-- forward. Idempotent; uses the existing audit_ledger_append() (v51).
-- =============================================================

do $$
declare t text;
begin
  foreach t in array array[
    -- v55 effective superset (do not drop any of these):
    'approvals','site_instructions','si_versions','variation_orders','vo_versions',
    'permits_to_work','permit_versions','permit_signoffs',
    'documents','document_versions','document_events',
    'progress_history','project_members','user_profiles',
    'equipment_register','form_instances','form_signoffs','user_credentials',
    -- v70 additions — the WhatsApp-replacement dispute records:
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
