-- =============================================================
-- v56-ai-assistant.sql   (AI 站長 — Phase 0 schema, per AI-ASSISTANT-PLAN.md)
-- =============================================================
-- Per-project AI assistant backing tables. Additive only. The assistant runs in
-- a Supabase Edge Function AS THE USER (forwarded JWT) so every read/write is
-- RLS-bounded to exactly what the human can do; these tables only hold the
-- conversation, the proposal/provenance trail, and the per-user token budget.
--
-- Security posture (mirrors the v55f hardening):
--   * ai_actions.status is PINNED to 'proposed' on INSERT (a client cannot mint
--     an 'executed' provenance row); transitions happen via owner UPDATE.
--   * ai_usage is written ONLY through record_ai_usage() (SECURITY DEFINER,
--     computes est_cost server-side) so a user cannot under-report to dodge the
--     budget gate. Direct writes denied.
--   * ai_actions is attached to the v51 tamper-evident audit_ledger.
-- Kill switches: app_config.ai_assistant_enabled (global) AND projects.ai_enabled
--   (per-project pilot opt-in). Both must be true; checked by ai_enabled_for_project().
-- =============================================================

-- ── rollout flags ────────────────────────────────────────────────────────────
alter table app_config add column if not exists ai_assistant_enabled boolean not null default false;
alter table app_config add column if not exists ai_daily_budget_hkd  numeric(10,2) not null default 8.0;
alter table projects   add column if not exists ai_enabled boolean not null default false;

-- ── tables ───────────────────────────────────────────────────────────────────
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  title text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conversations_user on ai_conversations(user_id, project_id, updated_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null default '[]'::jsonb,   -- Anthropic message content blocks
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_conv on ai_messages(conversation_id, created_at);

create table if not exists ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  conversation_id uuid references ai_conversations(id) on delete set null,
  tool_name text not null,
  args jsonb not null default '{}'::jsonb,
  args_hash text not null,
  risk text not null check (risk in ('low','medium','high','destructive')),
  status text not null default 'proposed' check (status in ('proposed','confirmed','executed','declined','failed')),
  result jsonb,
  model text,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);
create index if not exists idx_ai_actions_user on ai_actions(user_id, created_at desc);
create index if not exists idx_ai_actions_conv on ai_actions(conversation_id);

create table if not exists ai_usage (
  user_id uuid not null references user_profiles(id) on delete cascade,
  day date not null,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  est_cost_hkd  numeric(12,4) not null default 0,
  requests int not null default 0,
  primary key (user_id, day)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table ai_conversations enable row level security;
alter table ai_messages      enable row level security;
alter table ai_actions       enable row level security;
alter table ai_usage         enable row level security;

-- ai_conversations: owner-only; create only for a project you can view
drop policy if exists ai_conversations_select on ai_conversations;
create policy ai_conversations_select on ai_conversations for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ai_conversations_insert on ai_conversations;
create policy ai_conversations_insert on ai_conversations for insert to authenticated
  with check (user_id = auth.uid() and can_view_project(auth.uid(), project_id));
drop policy if exists ai_conversations_update on ai_conversations;
create policy ai_conversations_update on ai_conversations for update to authenticated
  using (user_id = auth.uid());
drop policy if exists ai_conversations_delete on ai_conversations;
create policy ai_conversations_delete on ai_conversations for delete to authenticated
  using (user_id = auth.uid());

-- ai_messages: owner via conversation; append-only (no update/delete policy)
drop policy if exists ai_messages_select on ai_messages;
create policy ai_messages_select on ai_messages for select to authenticated
  using (exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid()));
drop policy if exists ai_messages_insert on ai_messages;
create policy ai_messages_insert on ai_messages for insert to authenticated
  with check (exists (select 1 from ai_conversations c where c.id = ai_messages.conversation_id and c.user_id = auth.uid()));

-- ai_actions: owner read + own insert/update (status pinned by trigger below)
drop policy if exists ai_actions_select on ai_actions;
create policy ai_actions_select on ai_actions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ai_actions_insert on ai_actions;
create policy ai_actions_insert on ai_actions for insert to authenticated
  with check (user_id = auth.uid() and can_view_project(auth.uid(), project_id));
drop policy if exists ai_actions_update on ai_actions;
create policy ai_actions_update on ai_actions for update to authenticated
  using (user_id = auth.uid());

-- a proposal is always BORN 'proposed' with no result (lesson from v55f: never
-- trust a client-supplied privileged column on INSERT).
create or replace function guard_ai_action_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.status := 'proposed';
  new.result := null;
  new.executed_at := null;
  return new;
end; $$;
drop trigger if exists trg_guard_ai_action_insert on ai_actions;
create trigger trg_guard_ai_action_insert before insert on ai_actions
  for each row execute function guard_ai_action_insert();

-- ai_usage: owner read only; writes go through record_ai_usage()
drop policy if exists ai_usage_select on ai_usage;
create policy ai_usage_select on ai_usage for select to authenticated
  using (user_id = auth.uid());
drop policy if exists ai_usage_no_direct_insert on ai_usage;
create policy ai_usage_no_direct_insert on ai_usage for insert to authenticated with check (false);
drop policy if exists ai_usage_no_direct_update on ai_usage;
create policy ai_usage_no_direct_update on ai_usage for update to authenticated using (false);

-- ── tamper-evident: hash-chain the proposal trail ────────────────────────────
drop trigger if exists trg_audit_ledger on ai_actions;
create trigger trg_audit_ledger after insert or update or delete on ai_actions
  for each row execute function audit_ledger_append();

-- ── rollout-flag RPCs (mirror get/set_ptw_enabled) ───────────────────────────
create or replace function get_ai_assistant_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(ai_assistant_enabled, false) from app_config where id = 1;
$$;
revoke all on function get_ai_assistant_enabled() from public;
grant execute on function get_ai_assistant_enabled() to authenticated;

create or replace function set_ai_assistant_enabled(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if not exists (select 1 from user_profiles where id = v_uid and global_role = 'admin') then
    raise exception '只有系統管理員可以切換 AI 助理功能';
  end if;
  update app_config set ai_assistant_enabled = p_enabled where id = 1;
  return p_enabled;
end; $$;
revoke all on function set_ai_assistant_enabled(boolean) from public;
grant execute on function set_ai_assistant_enabled(boolean) to authenticated;

-- per-project pilot opt-in: admin or the project's assigned PM
create or replace function set_project_ai_enabled(p_project_id uuid, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and v_uid = any(assigned_pm_ids))
  ) then
    raise exception '只有管理員或項目 PM 可以切換此項目的 AI 助理';
  end if;
  update projects set ai_enabled = p_enabled where id = p_project_id;
  return p_enabled;
end; $$;
revoke all on function set_project_ai_enabled(uuid, boolean) from public;
grant execute on function set_project_ai_enabled(uuid, boolean) to authenticated;

-- single gate the Edge Function calls first: global flag AND project opt-in AND membership
create or replace function ai_enabled_for_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ai_assistant_enabled from app_config where id = 1), false)
     and coalesce((select ai_enabled from projects where id = p_project_id), false)
     and can_view_project(auth.uid(), p_project_id);
$$;
revoke all on function ai_enabled_for_project(uuid) from public;
grant execute on function ai_enabled_for_project(uuid) to authenticated;

-- ── usage / budget RPCs (server-computed cost; tamper-proof budget gate) ─────
-- est_cost in HKD ≈ USD × 7.8, rates per MTok: opus 5/25, sonnet 3/15, haiku 1/5.
create or replace function record_ai_usage(p_model text, p_input bigint, p_output bigint)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_in_rate numeric; v_out_rate numeric; v_cost numeric;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if lower(coalesce(p_model,'')) like '%opus%' then        v_in_rate := 39.0;  v_out_rate := 195.0;
  elsif lower(coalesce(p_model,'')) like '%haiku%' then     v_in_rate := 7.8;   v_out_rate := 39.0;
  else /* sonnet / default */                               v_in_rate := 23.4;  v_out_rate := 117.0;
  end if;
  v_cost := (coalesce(p_input,0)::numeric / 1000000.0) * v_in_rate
          + (coalesce(p_output,0)::numeric / 1000000.0) * v_out_rate;
  insert into ai_usage (user_id, day, input_tokens, output_tokens, est_cost_hkd, requests)
    values (v_uid, v_day, coalesce(p_input,0), coalesce(p_output,0), v_cost, 1)
  on conflict (user_id, day) do update
    set input_tokens  = ai_usage.input_tokens  + excluded.input_tokens,
        output_tokens = ai_usage.output_tokens + excluded.output_tokens,
        est_cost_hkd  = ai_usage.est_cost_hkd  + excluded.est_cost_hkd,
        requests      = ai_usage.requests      + 1;
  return (select est_cost_hkd from ai_usage where user_id = v_uid and day = v_day);
end; $$;
revoke all on function record_ai_usage(text, bigint, bigint) from public;
grant execute on function record_ai_usage(text, bigint, bigint) to authenticated;

-- budget status for the pre-call gate + the UI meter
create or replace function ai_usage_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'spent_hkd', coalesce((select est_cost_hkd from ai_usage
                            where user_id = auth.uid()
                              and day = (now() at time zone 'Asia/Hong_Kong')::date), 0),
    'budget_hkd', coalesce((select ai_daily_budget_hkd from app_config where id = 1), 8.0),
    'ok', coalesce((select est_cost_hkd from ai_usage
                    where user_id = auth.uid()
                      and day = (now() at time zone 'Asia/Hong_Kong')::date), 0)
          < coalesce((select ai_daily_budget_hkd from app_config where id = 1), 8.0)
  );
$$;
revoke all on function ai_usage_status() from public;
grant execute on function ai_usage_status() to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   select get_ai_assistant_enabled();            -> false
--   select ai_usage_status();                     -> {spent_hkd:0, budget_hkd:8.0, ok:true}
--   select to_regclass('public.ai_conversations'),to_regclass('public.ai_messages'),
--          to_regclass('public.ai_actions'),to_regclass('public.ai_usage');  -> all non-null
--   select tgname from pg_trigger where tgrelid='ai_actions'::regclass;  -> includes trg_audit_ledger + trg_guard_ai_action_insert
--   -- denial: as a user, insert ai_usage directly -> RLS with check(false) blocks.
-- =============================================================
