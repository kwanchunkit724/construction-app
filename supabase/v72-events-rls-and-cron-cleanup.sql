-- =============================================================
-- v72-events-rls-and-cron-cleanup.sql   (Final-upgrade T2.3 server + C.2)
-- =============================================================
-- Two small, additive, no-native server changes bundled:
--
-- (A) T2.3 — Timetable events_insert gated on global_role, diverging from every
--     other module (which gates on per-project MEMBERSHIP role). v11-events-
--     schema.sql:58-70 requires up.global_role in ('admin','pm','main_contractor').
--     Effect: an approved-member general_foreman (老總) cannot log an inspection,
--     while membership role is ignored. Re-key on project_members.role to match the
--     unified pattern (admin via global OR approved member with role in
--     pm/general_foreman/main_contractor). The events_update owner-gate is left as-is.
--
-- (B) C.2 — Drop the v10 DAILY 'ptw-expiry' cron job. v67 added 'ptw-expiry-15min'
--     which fully subsumes it (both only flip active->expired). Two convergent jobs
--     = two silent-failure surfaces to reason about during an unmonitored freeze.
--     Keep ONLY 'ptw-expiry-15min'.
--
-- (Deferred, intentionally NOT here: R.7 label_status CHECK — label_status is a
--  jsonb map, not a scalar, so a value-vocab constraint would need a validation
--  trigger on the hot progress_items table. Low likelihood today (no SQL writer
--  authors it; the TS UnitState type fails safe). Documented as a known latent gap
--  rather than adding fragile surface before a freeze.)
-- Idempotent.
-- =============================================================

-- ── (A) events_insert: membership role, not global role ──────────────────────
drop policy if exists events_insert on events;
create policy events_insert on events for insert
  with check (
    created_by = auth.uid()
    and (
      exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
      or exists (
        select 1 from project_members pm
        where pm.project_id = events.project_id
          and pm.user_id = auth.uid()
          and pm.status = 'approved'
          and pm.role in ('pm','general_foreman','main_contractor')
      )
    )
  );

-- ── (B) drop the superseded daily PTW-expiry cron ────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ptw-expiry') then
    perform cron.unschedule('ptw-expiry');
  end if;
end$$;

-- =============================================================
-- PRE-APPLY CHECK (the events_insert rewrite NARROWS the global-role path — it is
-- not purely additive): confirm no live user authors events via a GLOBAL
-- main_contractor role while holding a non-MC MEMBERSHIP role, or they lose insert.
--   select distinct e.created_by from events e
--   join user_profiles up on up.id = e.created_by
--   where up.global_role = 'main_contractor'
--     and not exists (select 1 from project_members pm
--       where pm.project_id = e.project_id and pm.user_id = e.created_by
--         and pm.status='approved' and pm.role in ('pm','general_foreman','main_contractor'));
--   -- expect 0 rows. (Demo/live data is tiny; if non-zero, widen the allowlist.)
-- =============================================================
-- Verify (EXECUTE, not source):
--   -- (A) as an approved-member general_foreman: INSERT an event -> allowed;
--   --     as a global main_contractor who is NOT an approved member -> REJECTED.
--   -- (B) select jobname from cron.job where jobname like 'ptw-expiry%';
--   --     expect ONLY 'ptw-expiry-15min' to remain.
-- =============================================================
