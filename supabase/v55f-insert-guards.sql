-- =============================================================
-- v55f-insert-guards.sql   (RLS INSERT privilege-escalation hardening)
-- =============================================================
-- An adversarial re-audit (after the v55e user_credentials fix) found the SAME
-- class of gap on four more tables: an INSERT RLS policy lets a member create
-- their own row, but a privilege/approval/routing column is left unpinned and
-- the only guard is a BEFORE UPDATE trigger (which never fires on INSERT). All
-- four were CONFIRMED exploitable by execution (rollback-txn sims forging the
-- columns as the relevant role). This migration adds BEFORE INSERT guards that
-- force every newly inserted row into a clean, unprivileged initial state.
-- Legitimate flows already create rows in exactly this state, so it is
-- non-breaking; service/migration inserts (auth.uid() is null) bypass.
--
-- Severity summary (all confirmed by execution):
--   user_profiles.global_role='admin'  — CRITICAL: fresh signup self-registers as admin (total takeover)
--   document_versions.status='approved' — CRITICAL: forge an approved HK submission + fake reviewer into the audit register
--   issues.current_handler_role/status  — HIGH: skip the escalation chain / fabricate a pre-resolved issue
--   form_instances.valid_until          — HIGH: fake a valid statutory form (e.g. 竹棚 Form 5) with zero signoffs
-- =============================================================

-- ── 1. user_profiles: block self-INSERT of a privileged global_role ──────────
-- v17 closed the UPDATE self-promotion, but the trigger was BEFORE UPDATE only.
-- A brand-new signup INSERTs its own profile (policy: with check (auth.uid()=id))
-- and could set global_role='admin'. Admin RPCs (auth.uid()=admin) and service
-- inserts (auth.uid() null) are unaffected; only a non-admin self-insert of the
-- 'admin' role is coerced down to the lowest-privilege role.
create or replace function guard_user_profile_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  if auth.uid() is null then return new; end if;                 -- service / migration / admin RPC (definer)
  select (global_role = 'admin') into is_admin from user_profiles where id = auth.uid();
  if coalesce(is_admin, false) then return new; end if;          -- an existing admin may seed any role
  -- a non-admin (incl. a fresh signup whose own row does not yet exist) may not self-mint admin
  if new.global_role = 'admin' then
    new.global_role := 'subcontractor_worker';
  end if;
  return new;
end; $$;
drop trigger if exists trg_guard_user_profile_insert on user_profiles;
create trigger trg_guard_user_profile_insert before insert on user_profiles
  for each row execute function guard_user_profile_insert();

-- ── 2. document_versions: a new version is always born unreviewed ────────────
-- guard_document_version_write (v40) was BEFORE UPDATE only. On INSERT a member
-- could set status='approved' + reviewed_by=<any PM>, forging an approval into
-- the immortal document register. Pin the review/supersede outcome columns; the
-- review_document_version / supersede RPCs set them later via UPDATE.
create or replace function guard_document_version_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- service / migration / legacy backfill
  if new.status is null or new.status not in ('draft','submitted') then
    new.status := 'submitted';                                   -- never born approved/rejected/superseded/withdrawn
  end if;
  new.reviewed_by   := null;
  new.reviewed_at   := null;
  new.review_note   := null;
  new.superseded_at := null;
  new.withdrawn_at  := null;
  return new;
end; $$;
drop trigger if exists trg_guard_document_version_insert on document_versions;
create trigger trg_guard_document_version_insert before insert on document_versions
  for each row execute function guard_document_version_insert();

-- ── 3. issues: server computes routing/status, never trusts the client ───────
-- INSERT policy only pinned reporter_id = auth.uid(). current_handler_role,
-- status, resolved_by/at and the reporter_role snapshot were all forgeable.
-- Recompute from the reporter's real global_role (the getInitialHandler map).
create or replace function guard_issue_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null then return new; end if;                 -- service / migration
  select global_role into v_role from user_profiles where id = new.reporter_id;
  new.reporter_role := coalesce(v_role, new.reporter_role);
  new.current_handler_role := case v_role
    when 'subcontractor_worker' then 'subcontractor'
    when 'subcontractor'        then 'main_contractor'
    when 'main_contractor'      then 'pm'
    when 'owner'                then 'pm'
    when 'pm'                   then 'pm'
    when 'admin'                then 'pm'
    else 'pm'
  end;
  new.status := 'open';                                          -- new issues are always open
  new.resolved_by := null;
  new.resolved_at := null;
  return new;
end; $$;
drop trigger if exists trg_guard_issue_insert on issues;
create trigger trg_guard_issue_insert before insert on issues
  for each row execute function guard_issue_insert();

-- ── 4. form_instances: validity is an outcome of a signoff, not an insert ────
-- A manager could INSERT an instance with valid_until in the future + suspended
-- =false and ZERO signoffs, faking a valid statutory form. valid_until /
-- last_signoff_id / suspended are set ONLY by record_form_signoff (UPDATE).
create or replace function guard_form_instance_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- service / migration
  new.valid_until    := null;                                    -- unsigned => no validity yet
  new.last_signoff_id := null;
  new.suspended      := false;
  return new;
end; $$;
drop trigger if exists trg_guard_form_instance_insert on form_instances;
create trigger trg_guard_form_instance_insert before insert on form_instances
  for each row execute function guard_form_instance_insert();

-- =============================================================
-- Post-apply verification (execute, not source): re-run the rollback-txn forge
-- sims — each forged INSERT now lands coerced:
--   user_profiles.global_role -> 'subcontractor_worker'
--   document_versions.status  -> 'submitted', reviewed_by NULL
--   issues.current_handler_role -> computed handler, status 'open'
--   form_instances.valid_until -> NULL, suspended false
-- =============================================================
