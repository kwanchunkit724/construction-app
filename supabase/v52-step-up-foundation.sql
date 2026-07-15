-- =============================================================
-- v52-step-up-foundation.sql   (Security upgrade Phase 2 / Part A foundation)
-- =============================================================
-- Server-verified step-up authorization for high-risk actions. Factor = Supabase
-- native MFA (TOTP) → an MFA-verified session is AAL2 (auth.jwt()->>'aal'='aal2').
-- A thief with only the phone+password reaches AAL1 only → cannot mint a grant →
-- cannot approve/sign/delete. This file is the CONTRACT the client + the ~12
-- high-risk RPC wirings build against. Additive; pgcrypto for gen_random_uuid.
--
-- CONTRACT
--   mint_step_up_grant(p_action_class text) returns uuid
--     - requires auth.uid() not null AND aal2; else raises '需要二步驗證' / '請先完成二步驗證'.
--     - clears the caller's expired grants, inserts a fresh 5-min grant, returns its id.
--   assert_step_up(p_action_class text) returns void
--     - raises '此操作需要二步驗證確認' unless a NON-expired grant exists for
--       (auth.uid(), p_action_class). Does NOT consume the grant → one mint covers
--       a 5-min batch of same-class actions (convenience). Called via `perform
--       assert_step_up('<class>')` at the top of each high-risk RPC.
--   Action classes: 'approval' (SI/VO/PTW approve/reject/sign-off, chain edit,
--   safety-officer staffing), 'membership' (approve/reject/role change),
--   'document' (review/withdraw version), 'progress_delete', 'account_delete'.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists step_up_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  action_class text not null,
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists idx_step_up_grants_lookup
  on step_up_grants (user_id, action_class, expires_at);

alter table step_up_grants enable row level security;
-- Caller may read their OWN grants (UX: client can show "二步驗證有效，5 分鐘內免再驗").
drop policy if exists step_up_grants_select_own on step_up_grants;
create policy step_up_grants_select_own on step_up_grants
  for select to authenticated using (user_id = auth.uid());
-- No client INSERT/UPDATE/DELETE — grants are minted only by the definer RPC.
revoke insert, update, delete on step_up_grants from authenticated, anon;

-- Grant TTL — single source of truth.
create or replace function step_up_ttl() returns interval
  language sql immutable as $$ select interval '5 minutes' $$;

-- mint_step_up_grant — requires a fresh AAL2 (MFA-verified) session.
create or replace function mint_step_up_grant(p_action_class text)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_aal text := auth.jwt() ->> 'aal';
  v_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_action_class is null or p_action_class = '' then
    raise exception '缺少操作類別';
  end if;
  -- The whole point: only an MFA-verified (AAL2) session may mint a grant.
  if v_aal is distinct from 'aal2' then
    raise exception '請先完成二步驗證 (MFA) 再進行此操作';
  end if;

  delete from step_up_grants where user_id = v_uid and expires_at <= now();

  insert into step_up_grants (user_id, action_class, expires_at)
  values (v_uid, p_action_class, now() + step_up_ttl())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function mint_step_up_grant(text) from public;
grant execute on function mint_step_up_grant(text) to authenticated;

-- assert_step_up — the server enforcement point, called inside each high-risk RPC.
-- Raises unless a non-expired grant of the right class exists for the caller.
create or replace function assert_step_up(p_action_class text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid();
begin
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

-- Convenience read for the client: seconds remaining on the freshest grant of a
-- class (0 / null = none). Lets the UI skip the prompt when a grant is still warm.
create or replace function step_up_remaining(p_action_class text)
returns integer
language sql stable security definer
set search_path = public, extensions
as $$
  select greatest(0, coalesce(
    (select extract(epoch from (max(g.expires_at) - now()))::int
       from step_up_grants g
      where g.user_id = auth.uid() and g.action_class = p_action_class
        and g.expires_at > now()), 0));
$$;
grant execute on function step_up_remaining(text) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- AAL1 session (normal login, no MFA): mint_step_up_grant('approval')
--   --   -> ERROR '請先完成二步驗證'.  assert_step_up('approval') -> ERROR step-up required.
--   -- (AAL2 happy-path is verified via the client MFA flow in Phase 3.)
--   -- step_up_remaining('approval') as AAL1 -> 0.
-- =============================================================
