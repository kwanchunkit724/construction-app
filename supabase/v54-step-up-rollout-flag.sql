-- =============================================================
-- v54-step-up-rollout-flag.sql   (Security Part A — safe rollout gate)
-- =============================================================
-- DEPLOY-ORDER SAFETY. v52+v53 wired assert_step_up into 8 high-risk RPCs and
-- are already on prod. But the CLIENT that can mint an AAL2 step-up grant
-- (StepUpContext / SecuritySetup) is NOT yet live on the App Store / web /
-- Android. With enforcement hard-on, the existing live clients (no step-up UI)
-- would hit assert_step_up and be LOCKED OUT of every approval / role change /
-- document review / account deletion — a production outage.
--
-- Fix: gate assert_step_up behind app_config.step_up_enforced (DEFAULT FALSE).
-- While OFF, assert_step_up is a NO-OP → the v53 `perform assert_step_up(...)`
-- calls do nothing → old clients keep working exactly as before. mint/assert
-- machinery stays in place. Flip the flag ON only AFTER the step-up client is
-- live on all platforms (App Store review out, web deployed, Android updated).
-- Mirrors the ptw_enabled / files_enabled rollout-flag pattern. Idempotent.
-- =============================================================

alter table app_config add column if not exists step_up_enforced boolean not null default false;

-- Redefine assert_step_up with the rollout gate at the top (v52 body otherwise).
create or replace function assert_step_up(p_action_class text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid();
begin
  -- Rollout gate: until enforcement is switched on for all live clients, this
  -- is a no-op so the existing (pre-step-up) clients are not locked out.
  if not coalesce((select step_up_enforced from app_config where id = 1), false) then
    return;
  end if;

  if v_uid is null then raise exception '未登入'; end if;
  if not exists (
    select 1 from step_up_grants g
    where g.user_id = v_uid
      and g.action_class = p_action_class
      and g.expires_at > now()
  ) then
    raise exception '此操作需要二步驗證確認 (step-up required)';
  end if;
end;
$$;
revoke all on function assert_step_up(text) from public;
grant execute on function assert_step_up(text) to authenticated;

-- Read the flag (any authenticated user — the client uses it to decide whether
-- to even run the step-up prompt; harmless to expose).
create or replace function get_step_up_enforced()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce((select step_up_enforced from app_config where id = 1), false) $$;
grant execute on function get_step_up_enforced() to authenticated;

-- Admin-only switch to roll enforcement on/off.
create or replace function set_step_up_enforced(p_on boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from user_profiles up where up.id = auth.uid() and up.global_role = 'admin') then
    raise exception '只有管理員可以設定';
  end if;
  update app_config set step_up_enforced = p_on where id = 1;
end;
$$;
revoke all on function set_step_up_enforced(boolean) from public;
grant execute on function set_step_up_enforced(boolean) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- flag is OFF by default: a permitted PM/Admin at AAL1 can now run the
--   --   high-risk RPCs again (assert_step_up returns immediately) — prod unblocked.
--   --   e.g. save_chain_steps as assigned PM -> NO step-up raise.
--   -- after the new client is live everywhere: select set_step_up_enforced(true);
--   --   then the AAL1 callers are refused with 此操作需要二步驗證確認 again.
-- =============================================================
