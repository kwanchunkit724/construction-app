-- =============================================================
-- v9-chain-schema.sql — Phase 2 of 工地控制系統 milestone
-- =============================================================
-- Skips contested v5/v6/v7 namespace per Phase 1 D-33. Introduces
-- the shared approval-chain spine consumed by SI/VO in Phase 2
-- and PTW in Phase 3 verbatim:
--   * approval_chain_steps (admin-editable chain config per project, per doc_type)
--   * approval_action_type enum
--   * approvals (append-only audit ledger; status computed from rows)
--   * delegations (CHN-10)
--   * notification_counters (3/user/day push fatigue cap, CHN-08)
--   * notification_digest (08:00 HKT overflow drain)
--
-- Run once via Supabase Dashboard → SQL Editor.
-- Idempotent re-run NOTE: defensive drops at top cover helper
-- functions only. Tables here are FIRST-INSTALL with plain
-- `create table` (no `if not exists`) — if re-applying after a
-- failed run, the developer must manually `drop table ... cascade`
-- FIRST. This protects live user data from accidental wipes per
-- CONCERNS P18 ("never drop user-data tables on re-run").
--
-- admin_override threat-model note (T-02-04): admin_override is a
-- DISTINCT enum value (not an alias for approve). Downstream
-- chain-advance triggers (Plan 02-04) MUST treat it differently
-- from approve — specifically Phase 3 PTW will refuse to satisfy
-- safety_officer steps via admin_override. Document any divergent
-- handling in this file's consumer triggers.
-- =============================================================

-- ── 1. Defensive drops (functions only — NEVER drop user-data tables) ──
drop function if exists in_flight_approvals(uuid) cascade;
drop function if exists active_role_holders(uuid, text) cascade;

-- ── 2. Tables (RESEARCH.md §4) ────────────────────────────────

create table approval_chain_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  doc_type text not null check (doc_type in ('si','vo','ptw')),
  step_order int not null,
  required_role text not null,
  optional_user_id uuid references user_profiles(id),
  unique (project_id, doc_type, step_order)
);

create index idx_chain_steps_lookup on approval_chain_steps (project_id, doc_type, step_order);

create type approval_action_type as enum (
  'approve',
  'approve_with_edits',
  'request_revision',
  'reject',
  'admin_override',
  'delegate'
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('si','vo','ptw')),
  doc_id uuid not null,  -- polymorphic; no FK (parent table varies by doc_type)
  step_order int not null,
  action_type approval_action_type not null,
  actor_id uuid not null references user_profiles(id) on delete restrict,
  delegated_for_user_id uuid references user_profiles(id),
  reason text,
  edits_jsonb jsonb,
  created_at timestamptz not null default now(),
  -- CHN-11: reason ≥ 10 chars required for blocking / override action types
  check (
    case action_type
      when 'request_revision' then length(coalesce(reason,'')) >= 10
      when 'reject'           then length(coalesce(reason,'')) >= 10
      when 'admin_override'   then length(coalesce(reason,'')) >= 10
      else true
    end
  )
);

create index idx_approvals_doc on approvals (doc_type, doc_id, created_at);

create table delegations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  delegate_to uuid not null references user_profiles(id) on delete cascade,
  valid_from date not null,
  valid_until date not null check (valid_until >= valid_from),
  created_at timestamptz not null default now()
);

create index idx_delegations_active on delegations (user_id, valid_until);

create table notification_counters (
  user_id uuid not null references user_profiles(id) on delete cascade,
  hkt_date date not null,
  count int not null default 0,
  primary key (user_id, hkt_date)
);

create table notification_digest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  hkt_date date not null,
  items_jsonb jsonb not null,
  sent_at timestamptz,
  unique (user_id, hkt_date)
);

-- ── 3. Enable RLS on all five tables ──────────────────────────
alter table approval_chain_steps enable row level security;
alter table approvals enable row level security;
alter table delegations enable row level security;
alter table notification_counters enable row level security;
alter table notification_digest enable row level security;

-- ── 4. RLS policies ───────────────────────────────────────────

-- approval_chain_steps -----------------------------------------
create policy "Members view chain config"
  on approval_chain_steps for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Admin or assigned PM writes chain (insert)"
  on approval_chain_steps for insert to authenticated
  with check (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or exists (select 1 from projects where id = project_id and auth.uid() = any(assigned_pm_ids))
  );

create policy "Admin or assigned PM writes chain (update)"
  on approval_chain_steps for update to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or exists (select 1 from projects where id = project_id and auth.uid() = any(assigned_pm_ids))
  );

create policy "Admin or assigned PM writes chain (delete)"
  on approval_chain_steps for delete to authenticated
  using (
    exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
    or exists (select 1 from projects where id = project_id and auth.uid() = any(assigned_pm_ids))
  );

-- approvals ----------------------------------------------------
-- FORWARD-REFERENCE NOTE: the real SELECT policy needs to join to
-- site_instructions / variation_orders, which DO NOT exist at the
-- time this migration runs (they land in Plans 02-02 / 02-06).
-- We install a STUB SELECT policy here (allows no rows) so the
-- table is queryable but locked. Plans 02-02 and 02-06 must:
--   drop policy "View approvals stub" on approvals;
--   create policy "View approvals" on approvals for select ...
-- referencing their respective parent tables.
create policy "View approvals stub"
  on approvals for select to authenticated
  using (false);

-- INSERT path is via SECURITY DEFINER RPC submit_approval()
-- introduced in Plan 02-04. The placeholder INSERT policy denies
-- all direct inserts from authenticated clients — only the
-- definer-context RPC can write.
create policy "Insert approvals through RPC only"
  on approvals for insert to authenticated
  with check (false);

-- NO UPDATE policy. NO DELETE policy. Approvals are append-only
-- (CHN-11 / T-02-CR). Verified by rls-smoke.sql in Task 6.

-- delegations --------------------------------------------------
create policy "View delegations for self/grantor or admin"
  on delegations for select to authenticated
  using (
    user_id = auth.uid()
    or delegate_to = auth.uid()
    or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
  );

create policy "Self-manage own delegations (insert)"
  on delegations for insert to authenticated
  with check (user_id = auth.uid());

create policy "Self-manage own delegations (delete)"
  on delegations for delete to authenticated
  using (user_id = auth.uid());

-- NO UPDATE policy on delegations — delete + recreate is the
-- only legal mutation path.

-- notification_counters ----------------------------------------
-- Server-only table. No client-facing policies → with RLS enabled
-- and no policies, all authenticated reads/writes are denied.
-- push_dispatcher() (SECURITY DEFINER, v9-split/1) is the only
-- legitimate writer.

-- notification_digest ------------------------------------------
-- Server-only table. Same posture as notification_counters.
-- drain_notification_digest() (SECURITY DEFINER, v9-split/6) is
-- the only legitimate reader/updater.

-- ── 5. Realtime publication (D-26) ────────────────────────────
alter publication supabase_realtime add table approvals;
alter publication supabase_realtime add table delegations;
-- notification_counters + notification_digest INTENTIONALLY NOT
-- published — server-only, no client subscriptions.

-- =============================================================
-- End of v9-chain-schema.sql
-- Post-apply verification queries (run in SQL Editor):
--   select table_name from information_schema.tables
--     where table_name in (
--       'approval_chain_steps','approvals','delegations',
--       'notification_counters','notification_digest'
--     );
--   select typname from pg_type where typname='approval_action_type';
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime'
--       and tablename in ('approvals','delegations');
--   select policyname from pg_policies
--     where tablename='approvals';
-- =============================================================
