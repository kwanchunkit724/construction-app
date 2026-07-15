-- =============================================================
-- v55e-credential-insert-guard.sql  (Forms F5 security fix)
-- =============================================================
-- GAP found by the F5 denial sim: user_credentials INSERT policy is
-- `with check (user_id = auth.uid())` and guard_credential_verify only fired
-- BEFORE UPDATE — so an authenticated user could self-INSERT a row with
-- verified_at/verified_by already populated, minting a fake "qualified person"
-- and signing statutory forms (e.g. 竹棚 Form 5) without any real verification.
--
-- Fix: extend the guard to BEFORE INSERT too. A client may only ever create an
-- UNVERIFIED credential; verified_by/verified_at are NULLed on any non-sanctioned
-- insert. The single sanctioned path remains verify_user_credential(), which sets
-- the txn-local flag app.credential_verify='on' (and runs assert_step_up).
-- Migration/service inserts (auth.uid() is null) are unaffected.
-- =============================================================

create or replace function guard_credential_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;            -- definer RPC / service / migration
  if coalesce(current_setting('app.credential_verify', true), 'off') = 'on' then
    return new;                                             -- sanctioned RPC path (verify_user_credential)
  end if;
  if tg_op = 'INSERT' then
    -- clients may only self-create an UNVERIFIED credential; verification is RPC-only
    new.verified_by := null;
    new.verified_at := null;
    return new;
  end if;
  -- UPDATE: pin the verification columns to their OLD values
  if new.verified_by is distinct from old.verified_by then new.verified_by := old.verified_by; end if;
  if new.verified_at is distinct from old.verified_at then new.verified_at := old.verified_at; end if;
  return new;
end; $$;

drop trigger if exists trg_guard_credential_verify on user_credentials;
create trigger trg_guard_credential_verify before insert or update on user_credentials
  for each row execute function guard_credential_verify();

-- =============================================================
-- Post-apply verification (execute, not source):
--   As an authenticated user, INSERT into user_credentials with verified_at=now()
--   -> row is created but verified_at/verified_by come back NULL (cannot self-verify),
--   and record_form_signoff with that credential still raises the credential gate.
-- =============================================================
