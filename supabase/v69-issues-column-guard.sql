-- =============================================================
-- v69-issues-column-guard.sql   (Final-upgrade Tier 1.2 — dispute-survival spine)
-- =============================================================
-- DEFECT: the issues UPDATE policy is USING-only with NO with check
-- (v4-issues-schema.sql:87-93, widened in v66:19-32) and grants reporter_id =
-- auth.uid(). The reporter being able to act on their own issue is INTENTIONAL
-- (IssuesContext.tsx:258-262 — keeps escalation from dead-ending). But with no
-- column guard, a reporter (down to subcontractor_worker) can FORGE the dispute
-- record: set status=resolved with resolved_by = some PM (crediting a resolution
-- that PM never did), or jump current_handler_role past the escalation ladder, or
-- mutate reporter_id/reporter_role/project_id/created_at. RLS USING/WITH CHECK see
-- only NEW (never OLD), so transition rules cannot be expressed in policy SQL.
--
-- FIX: a BEFORE UPDATE column-guard trigger (mirrors v50-membership-role-
-- escalation-guard). For non-admin, non-service-role callers it:
--   (1) pins reporter_id / reporter_role / project_id / created_at to OLD (immutable),
--   (2) forces resolved_by = auth.uid() whenever status flips to 'resolved'
--       (the resolver is the actor — cannot credit a third party),
--   (3) constrains current_handler_role changes to the LEGAL forward ladder only
--       (subcontractor -> main_contractor -> pm; getNextHandler in types.ts).
-- It does NOT block the reporter from resolving/escalating their own issue — only
-- from forging WHO did it or jumping the chain.
--
-- NOTE (deliberate): like v50, auth.uid() IS NULL (service-role / SECURITY DEFINER
-- tooling) bypasses the guard. That privileged path is made TAMPER-EVIDENT by the
-- audit_ledger trigger added to `issues` in v70 — v70 is this guard's required
-- complement. Idempotent. Not module-gated (issue updates never were).
-- =============================================================

create or replace function enforce_issue_write_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  -- Service role / no JWT (SECURITY DEFINER RPCs, admin tooling) bypass.
  if auth.uid() is null then
    return new;
  end if;

  select (up.global_role = 'admin') into is_admin
  from user_profiles up
  where up.id = auth.uid();
  if is_admin then
    return new;
  end if;

  -- (1) Immutable origin columns — never change post-creation for non-admin.
  new.reporter_id   := old.reporter_id;
  new.reporter_role := old.reporter_role;
  new.project_id    := old.project_id;
  new.created_at    := old.created_at;

  -- (2) The resolver is always the acting user — cannot be forged onto a third party.
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_by := auth.uid();
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  -- (3) current_handler_role may only advance along the legal escalation ladder
  --     (or stay). Blocks arbitrary jumps / backward moves / illegal values.
  if new.current_handler_role is distinct from old.current_handler_role then
    if not (
      (old.current_handler_role = 'subcontractor'   and new.current_handler_role = 'main_contractor') or
      (old.current_handler_role = 'main_contractor' and new.current_handler_role = 'pm')
    ) then
      raise exception 'illegal issue handler transition: % -> % (escalation ladder is subcontractor -> main_contractor -> pm)',
        old.current_handler_role, new.current_handler_role;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_issue_write_gate on issues;
create trigger trg_enforce_issue_write_gate
  before update on issues
  for each row execute function enforce_issue_write_gate();

-- =============================================================
-- APPLY ORDER: apply v70 (audit_ledger extend) BEFORE/with this file. The admin +
-- service-role bypass above is tamper-EVIDENT only once `issues` is in the ledger
-- (v70). Do not leave v69 live without v70.
-- =============================================================
-- Verify (EXECUTE, not source):
--   -- as a subcontractor_worker REPORTER on own open issue:
--   --   * resolve it (status=resolved, resolved_by = <a PM id>)  -> row saved BUT
--   --       resolved_by is FORCED to the worker's own uid (forgery blocked).
--   --   * escalate subcontractor -> main_contractor               -> allowed.
--   --   * jump current_handler_role straight to 'pm'              -> RAISES.
--   --   * PATCH reporter_id / project_id / created_at            -> silently reverted.
--   -- legitimate handler resolve still works; admin raw PATCH still allowed (bypass).
-- =============================================================
