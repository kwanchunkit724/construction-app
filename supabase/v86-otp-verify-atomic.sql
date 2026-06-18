-- =============================================================
-- v86-otp-verify-atomic.sql
--   (Harden OTP verification — atomic, row-locked, server-authoritative)
-- =============================================================
-- The auth-upgrade review (2026-06-18) found [HIGH] that verify-stepup-sms and
-- verify-phone-otp did a NON-ATOMIC read-then-write of phone_verifications.attempts
-- (SELECT attempts → attempts+1 → UPDATE), so N parallel POSTs for one issued code
-- all read attempts=0, all write 1, and all pass the max_attempts gate → the
-- lockout was bypassable by firing guesses concurrently (6-digit brute-force).
-- Same class let a single code mint multiple grants concurrently.
--
-- FIX: one SECURITY DEFINER function does the whole verify atomically under a row
-- lock (`for update` — concurrent calls serialize on the row), so the attempt cap
-- holds and a code is consumed exactly once. For step-up it ALSO mints the grant,
-- bound to the row's user_id (server-recorded at send time), not any client value.
-- The edge functions become thin callers: hash the code, call this, map the verdict.
--
-- Verdicts: 'ok' | 'bad' (wrong code) | 'locked' (attempts exhausted) |
--           'expired' (no live unconsumed code).
--
-- service_role-only (the edge functions call it). Never client-callable —
-- the grant mint must only follow the edge function's JWT identity check.
-- Additive / idempotent. zh-HK. ASI.
-- =============================================================

create or replace function public.verify_phone_code(
  p_phone text,
  p_purpose text,
  p_action_class text,
  p_code_hash text,
  p_user_id uuid
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row phone_verifications%rowtype;
begin
  -- Lock the newest live candidate. `for update` (blocking) serializes concurrent
  -- guesses on the same row; after a waiter wakes it re-checks the predicate, so a
  -- consumed row is no longer a candidate → returns 'expired'.
  select * into v_row
    from phone_verifications
   where phone = p_phone
     and purpose = p_purpose
     and (action_class is not distinct from p_action_class)
     and consumed_at is null
     and expires_at > now()
   order by created_at desc
   limit 1
   for update;

  if v_row.id is null then return 'expired'; end if;
  if v_row.attempts >= v_row.max_attempts then return 'locked'; end if;

  -- Spend one attempt atomically (we hold the row lock).
  update phone_verifications set attempts = attempts + 1 where id = v_row.id;

  if v_row.code_hash is distinct from p_code_hash then
    return 'bad';
  end if;

  -- Correct code: consume it exactly once.
  update phone_verifications set consumed_at = now() where id = v_row.id;

  -- Step-up: mint the grant bound to the row's recorded user_id + action_class
  -- (never a client-supplied id). Mirrors mint_step_up_grant's TTL.
  if p_purpose = 'step_up' and v_row.user_id is not null then
    delete from step_up_grants where user_id = v_row.user_id and expires_at <= now();
    insert into step_up_grants (user_id, action_class, expires_at)
    values (v_row.user_id, v_row.action_class, now() + interval '5 minutes');
  end if;

  return 'ok';
end;
$$;

revoke all on function public.verify_phone_code(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.verify_phone_code(text, text, text, text, uuid) to service_role;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select proname from pg_proc where proname = 'verify_phone_code';   -- 1 row
--   -- access: authenticated/anon cannot execute (service_role only):
--   select has_function_privilege('authenticated', 'public.verify_phone_code(text,text,text,text,uuid)', 'execute'); -- f
--   -- behaviour (as service role): seed a phone_verifications step_up row with a known
--   -- sha256, then verify_phone_code(phone,'step_up',class,wrong_hash,uid) x5 -> 'bad' then 'locked';
--   -- with the right hash before lockout -> 'ok' + a step_up_grants row appears for uid;
--   -- a second call on the same (now consumed) row -> 'expired'.
-- =============================================================
