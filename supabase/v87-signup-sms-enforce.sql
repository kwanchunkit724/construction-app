-- =============================================================
-- v87-signup-sms-enforce.sql
--   (Server-enforce signup SMS — close the client-only-gate bypass, #3)
-- =============================================================
-- The auth-upgrade review found [medium] that the signup SMS verification was a
-- CLIENT-ONLY gate (Signup.tsx): a custom client could skip verify-phone-otp and
-- call supabase.auth.signUp() + insert user_profiles directly, creating an account
-- with an UNVERIFIED phone once signup_sms_required is flipped ON.
--
-- FIX: a BEFORE INSERT trigger on user_profiles that — ONLY for self-registration
-- (the signing-up user inserting their own profile, auth.uid() = new.id) AND ONLY
-- when signup_sms_required is ON — requires a recently CONSUMED signup OTP for the
-- new row's phone (within 15 min). Everything else is a no-op:
--   * flag OFF (the live default) → no-op → live 1.4 signup is byte-for-byte
--     unchanged. This trigger is dormant until the owner flips the flag.
--   * admin / service-role / seed inserts (auth.uid() null, or auth.uid() != new.id)
--     → bypass → admin user creation + migrations are unaffected.
--
-- CLAUDE.md: additive (new trigger only) — NOT a destructive change to
-- user_profiles (no column/data alteration). Idempotent. zh-HK. ASI.
-- =============================================================

create or replace function public.enforce_signup_sms()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only self-registration, only when the feature is on.
  if auth.uid() is not null
     and auth.uid() = new.id
     and coalesce((select signup_sms_required from app_config where id = 1), false) then
    if not exists (
      select 1 from phone_verifications
       where phone = new.phone
         and purpose = 'signup'
         and consumed_at is not null
         and consumed_at > now() - interval '15 minutes'
    ) then
      raise exception '註冊需要先完成手機短訊驗證';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_signup_sms on user_profiles;
create trigger trg_enforce_signup_sms before insert on user_profiles
  for each row execute function public.enforce_signup_sms();

-- =============================================================
-- Post-apply verification (execute, not source):
--   select tgname from pg_trigger where tgname = 'trg_enforce_signup_sms';   -- 1 row
--   select get_signup_sms_required();                                        -- false (still dormant)
--   -- Behaviour (flag OFF, today): a self-signup profile insert succeeds with no
--   --   OTP — live signup unchanged. A service-role insert always bypasses.
--   -- After the owner flips signup_sms_required ON: a self-signup insert WITHOUT a
--   --   consumed signup verification for that phone in the last 15 min -> raises
--   --   '註冊需要先完成手機短訊驗證'; with one (set by verify-phone-otp) -> succeeds.
-- =============================================================
