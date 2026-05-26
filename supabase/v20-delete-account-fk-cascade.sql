-- ============================================================
-- v20-delete-account-fk-cascade.sql
-- ============================================================
-- Apple compliance follow-up (persona-sim R3 finding by 何判頭):
--   delete_my_account RPC returns HTTP 409 FK constraint when the
--   user has touched any business records (created PTW / SI / VO /
--   issue comment / approval). Apple App Store account-deletion
--   review will fail if any active user with non-trivial history
--   cannot delete their account.
--
-- FIX:
--   1. Audit-only foreign keys to user_profiles.id: allow NULL on
--      the column AND change ON DELETE to SET NULL so the row
--      survives ("已刪除用戶" placeholder on the UI side) but
--      the deletion succeeds.
--   2. delete_my_account RPC: unchanged behaviour, but it now
--      works because the cascade chain resolves cleanly.
--
-- Tables touched (NOT NULL → NULL + RESTRICT/NO ACTION → SET NULL):
--   approvals.actor_id
--   issue_comments.author_id
--   issues.reporter_id
--   permit_scans.scanned_by
--   permit_versions.edits_by
--   permits_to_work.created_by
--   protest_comments.author_id
--   si_versions.edits_by
--   site_instructions.created_by
--   variation_orders.created_by
--   vo_versions.edits_by
--   progress_history.updated_by              (was NO ACTION)
--   progress_items.last_updated_by           (was NO ACTION)
--   issue_comments / issues already NO ACTION → change to SET NULL
--
-- Legacy tables (admin-only since v18, no live writes from the app):
--   daily_diaries.author_id, material_requests.requested_by,
--   ptw_requests.requested_by, sub_contracts.created_by —
--   also flipped to NULL+SET NULL so user deletion isn't blocked
--   by a stranded legacy row.
--
-- CASCADE-already columns (dailies.user_id, delegations.*,
-- notification_*, project_members.user_id) are unchanged.
-- ============================================================

-- Helper to drop+recreate FK with new ON DELETE rule -----------

create or replace function _v20_repoint_fk(
  p_table text, p_col text, p_constraint text, p_target text default 'user_profiles'
) returns void language plpgsql as $$
begin
  execute format('alter table %I alter column %I drop not null', p_table, p_col);
  execute format('alter table %I drop constraint if exists %I', p_table, p_constraint);
  execute format(
    'alter table %I add constraint %I foreign key (%I) references %I(id) on delete set null',
    p_table, p_constraint, p_col, p_target
  );
end $$;

-- Discover FK constraint names ---------------------------------

do $$
declare
  rec record;
  constraint_name text;
begin
  for rec in
    select * from (values
      ('approvals','actor_id'),
      ('issue_comments','author_id'),
      ('issues','reporter_id'),
      ('permit_scans','scanned_by'),
      ('permit_versions','edits_by'),
      ('permits_to_work','created_by'),
      ('protest_comments','author_id'),
      ('si_versions','edits_by'),
      ('site_instructions','created_by'),
      ('variation_orders','created_by'),
      ('vo_versions','edits_by'),
      ('progress_history','updated_by'),
      ('progress_items','last_updated_by'),
      ('daily_diaries','author_id'),
      ('material_requests','requested_by'),
      ('ptw_requests','requested_by'),
      ('sub_contracts','created_by')
    ) as t(tbl, col)
  loop
    select tc.constraint_name into constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = rec.tbl
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = rec.col
    limit 1;

    if constraint_name is not null then
      perform _v20_repoint_fk(rec.tbl, rec.col, constraint_name);
      raise notice 'repointed %.% (% → SET NULL)', rec.tbl, rec.col, constraint_name;
    else
      raise notice 'no FK found for %.%', rec.tbl, rec.col;
    end if;
  end loop;
end $$;

-- Cleanup helper --------------------------------------------------

drop function _v20_repoint_fk(text, text, text, text);
