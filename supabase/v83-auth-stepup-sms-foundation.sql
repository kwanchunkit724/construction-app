-- =============================================================
-- v83-auth-stepup-sms-foundation.sql
--   (Easier step-up factors + signup SMS verification — DB foundation)
-- =============================================================
-- GOAL (per owner decision 2026-06-18): make the L3 step-up easier than TOTP by
-- supporting a fallback chain — 生物認證 (biometric, native) → 密碼重輸 (password
-- re-auth, web / biometric-fail) → SMS 6-digit (last resort) — and require an SMS
-- phone-verification at SIGN-UP. Provider = Twilio (owner-configured).
--
-- This migration is ONLY the DB foundation — the safe, zero-live-impact part:
--   1. signup_sms_required rollout flag on app_config (DEFAULT FALSE) + get/set,
--      MIRRORING v54 step_up_enforced exactly. While OFF, sign-up is byte-for-byte
--      unchanged for the live 1.4 app — no SMS demanded.
--   2. phone_verifications — a service-role-only OTP store (code_hash, never
--      plaintext) for BOTH purposes ('signup' | 'step_up').
--
-- NO new grant-mint RPC is needed: step_up_grants (v52) already has NO client
-- write policy, so the verification Edge Functions mint grants by a service-role
-- INSERT — exactly how verify-sign-password mints sign_reauth_grants (v60). The
-- biometric/password/SMS factors all converge on that one server-side mint.
--
-- NOT in this file (staged — need Twilio creds + native rebuild + Edge deploy):
--   * Edge Functions: verify-stepup-password (no Twilio), send/verify-stepup-sms,
--     send/verify-phone-otp (Twilio).
--   * StepUpContext fallback-chain rewrite + Capacitor biometric plugin.
--   * Signup flow SMS gate (flag-gated).
-- See .planning/program-2026-06/AUTH-biometric-sms-spec.md.
--
-- Additive only; idempotent; zh-HK; ASI. No destructive change to live tables.
-- =============================================================

-- ── 1. signup SMS rollout flag (mirror v54 step_up_enforced) ───────────────────
alter table app_config add column if not exists signup_sms_required boolean not null default false;

create or replace function get_signup_sms_required()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select signup_sms_required from app_config where id = 1), false) $$;
grant execute on function get_signup_sms_required() to authenticated, anon;
-- anon CAN read it: the Signup screen (pre-auth) must know whether to demand SMS.

create or replace function set_signup_sms_required(p_on boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin') then
    raise exception '只有管理員可以設定';
  end if;
  update app_config set signup_sms_required = p_on where id = 1;
end;
$$;
revoke all on function set_signup_sms_required(boolean) from public;
grant execute on function set_signup_sms_required(boolean) to authenticated;

-- ── 2. phone_verifications — service-role-only OTP store ───────────────────────
-- One row per issued code. The Edge Functions (send-*) INSERT a row with a SHA-256
-- HASH of the 6-digit code (never the plaintext); the (verify-*) functions hash
-- the supplied code, compare, increment attempts, and mark consumed_at — all via
-- the service role. RLS is ON with NO policies → authenticated/anon can neither
-- read nor write (OTP hashes must never be client-visible). Only the service role
-- (which bypasses RLS) touches this table.
create table if not exists phone_verifications (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,                       -- HK 8-digit (normalised, no +852)
  purpose      text not null check (purpose in ('signup','step_up')),
  code_hash    text not null,                       -- sha256(hex) of the 6-digit code
  action_class text,                                -- step_up only (e.g. 'approval'); null for signup
  user_id      uuid references auth.users(id) on delete cascade,  -- step_up only; null for signup
  attempts     int  not null default 0,
  max_attempts int  not null default 5,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_phone_verifications_lookup
  on phone_verifications (phone, purpose, expires_at desc);
create index if not exists idx_phone_verifications_user
  on phone_verifications (user_id) where user_id is not null;

alter table phone_verifications enable row level security;
-- Deliberately NO policies → only the service role (Edge Functions) may read/write.
-- Defensive belt-and-braces: also revoke direct DML from client roles.
revoke all on phone_verifications from authenticated, anon;

-- ── 3. Optional housekeeping: prune expired/consumed OTP rows ──────────────────
-- Safe to call from a cron later (not scheduled here). Keeps the table small.
create or replace function prune_phone_verifications()
returns void
language sql security definer
set search_path = public
as $$
  delete from phone_verifications
   where (consumed_at is not null and consumed_at < now() - interval '1 day')
      or expires_at < now() - interval '1 day';
$$;
revoke all on function prune_phone_verifications() from public;
-- no client grant — invoked by cron / service role only.

-- =============================================================
-- Post-apply verification (execute, not source):
--   select column_name from information_schema.columns
--     where table_name='app_config' and column_name='signup_sms_required';   -- 1 row
--   select get_signup_sms_required();                                        -- false (live unaffected)
--   select to_regclass('public.phone_verifications') is not null;            -- t
--   select count(*) from pg_policies where tablename='phone_verifications';  -- 0 (service-role only)
--   select proname from pg_proc where proname in
--     ('get_signup_sms_required','set_signup_sms_required','prune_phone_verifications'); -- 3 rows
--   -- RLS check: as an authenticated member, select * from phone_verifications -> 0 rows / denied.
-- =============================================================
