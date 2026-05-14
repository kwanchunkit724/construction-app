-- =============================================================
-- v9-si-schema.sql — Phase 2 Plan 02-02 (SI domain)
-- =============================================================
-- Depends on:
--   * v9-chain-schema.sql   (approvals, approval_chain_steps, approval_action_type)
--   * v9-rls-helpers.sql    (active_role_holders)
--   * v9-split/1-push-dispatcher.sql (push_dispatcher)
--   * v3-progress-schema.sql (can_view_project, can_edit_project_progress)
--
-- Installs:
--   * site_instructions + si_versions + protest_comments
--   * can_view_si() helper (security definer)
--   * next_si_number() — sequence-per-project pattern (D-10)
--       sequence name = 'si_seq_' || replace(project_id::text, '-', '_')
--       Lazy-created on first call; nextval is atomic & concurrency-safe.
--       Same pattern reused by Phase 3 PTW (next_ptw_number).
--   * si_lock_guard trigger (SI-10) — post-lock immutability of si_versions
--   * submit_si(p_si_id) RPC — snapshots chain, fires push for step 0
--   * Replaces Plan 02-01's "View approvals stub" with SI-aware policy
--   * Realtime publication entries
--
-- IMPORTANT: language sql resolves table refs at CREATE-FUNCTION parse
-- time. All forward-table-ref-free functions in this file use language
-- sql safely; submit_si uses plpgsql because it has procedural flow.
--
-- Run once via Supabase Dashboard → SQL Editor AFTER 02-01 files.
-- =============================================================

-- ── 1. Defensive drops (functions + triggers + sub-objects only) ──
drop trigger if exists trg_si_locked_guard on si_versions;
drop function if exists si_lock_guard() cascade;
drop function if exists submit_si(uuid) cascade;
drop function if exists next_si_number(uuid) cascade;
drop function if exists can_view_si(uuid, uuid) cascade;

-- Tables: do NOT drop on re-run (CONCERNS P18 — never drop user-data).
-- For a clean re-install in dev, the operator must drop manually:
--   drop table if exists protest_comments cascade;
--   drop table if exists si_versions cascade;
--   drop table if exists site_instructions cascade;

-- ── 2. Tables (RESEARCH.md §4 + D-09/D-10/D-11/D-14) ──────────

create table site_instructions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,
  current_version_id uuid,                           -- deferred FK below
  chain_snapshot jsonb,                              -- frozen at submit (CHN-03)
  current_step int not null default 0,
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','locked','revision_requested','rejected')),
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked_at timestamptz,
  unique (project_id, number)
);

create table si_versions (
  id uuid primary key default gen_random_uuid(),
  si_id uuid not null references site_instructions(id) on delete cascade,
  version_no int not null,
  payload jsonb not null,                            -- {title, description, drawing_version_ids[], photo_paths[], voice_path, lat, lng, accuracy_m}
  edits_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (si_id, version_no)
);

create table protest_comments (
  id uuid primary key default gen_random_uuid(),
  si_id uuid not null references site_instructions(id) on delete cascade,
  author_id uuid not null references user_profiles(id) on delete restrict,
  body text not null check (length(body) > 0),
  created_at timestamptz not null default now()
);

-- Deferred FK: current_version_id → si_versions.id
alter table site_instructions
  add constraint si_current_version_fk
  foreign key (current_version_id) references si_versions(id) on delete set null;

-- ── 3. Indexes ────────────────────────────────────────────────
create index idx_si_project on site_instructions(project_id);
create index idx_si_status  on site_instructions(status);
create index idx_si_versions on si_versions(si_id, version_no);
create index idx_protest_si on protest_comments(si_id, created_at);

-- ── 4. RLS enable + policies ─────────────────────────────────
alter table site_instructions enable row level security;
alter table si_versions enable row level security;
alter table protest_comments enable row level security;

-- site_instructions
create policy "Members view SI"
  on site_instructions for select to authenticated
  using (can_view_project(auth.uid(), project_id));

create policy "Submitter creates SI"
  on site_instructions for insert to authenticated
  with check (
    can_edit_project_progress(auth.uid(), project_id)
    and created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
  );

-- Status transitions are driven by SECURITY DEFINER RPCs
-- (submit_si, dispatch_after_approval). Direct UPDATE by clients is
-- restricted to the creator while still in draft (e.g. editing title
-- before submit). chain_snapshot must remain null at this stage.
create policy "Creator updates own draft"
  on site_instructions for update to authenticated
  using (created_by = auth.uid() and status = 'draft')
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
  );
-- NO delete policy on site_instructions.

-- si_versions
create policy "Members view versions"
  on si_versions for select to authenticated
  using (
    exists (
      select 1 from site_instructions s
       where s.id = si_id and can_view_project(auth.uid(), s.project_id)
    )
  );

-- BLOCKER 1 fix (audit chain integrity): approve_with_edits NO LONGER
-- inserts si_versions via this client-side policy. The submit_approval
-- RPC (Plan 02-04) constructs the new si_versions row server-side
-- INSIDE the same transaction as the approvals INSERT (SECURITY DEFINER
-- bypasses RLS). That guarantees we cannot have a versions row without
-- its corresponding approvals row on network failure, and prevents any
-- active_role_holder from writing arbitrary versions outside the audit
-- chain. The policy below allows only the creator to insert versions
-- while the SI is draft or revision_requested (subcontractor revising
-- their own draft before re-submit).
create policy "Creator inserts versions when draft or revision"
  on si_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (
      select 1 from site_instructions s
       where s.id = si_id
         and s.created_by = auth.uid()
         and s.status in ('draft','revision_requested')
         and s.locked_at is null
    )
  );
-- NO update, NO delete on si_versions (append-only).

-- protest_comments (D-14 — only after lock; audit-only)
create policy "Members view protest"
  on protest_comments for select to authenticated
  using (
    exists (
      select 1 from site_instructions s
       where s.id = si_id and can_view_project(auth.uid(), s.project_id)
    )
  );

create policy "Insert protest only when locked"
  on protest_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from site_instructions s
       where s.id = si_id
         and s.status = 'locked'
         and can_view_project(auth.uid(), s.project_id)
    )
  );
-- NO update, NO delete on protest_comments.

-- ── 5. can_view_si helper (INF-03 extension; D-27) ────────────
create or replace function can_view_si(p_user_id uuid, p_si_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from site_instructions s
     where s.id = p_si_id and can_view_project(p_user_id, s.project_id)
  );
$$;

grant execute on function can_view_si(uuid, uuid) to authenticated;

-- ── 6. next_si_number — sequence-per-project (D-10) ────────────
-- One Postgres sequence per project, created lazily on first call.
-- Sequences are atomic and concurrency-safe — nextval handles
-- per-project contention without any advisory lock. unique(project_id,
-- number) at the table level is the fail-safe. Phase 3 PTW reuses
-- this pattern (next_ptw_number).
--
-- Sequence-name mapping rule:
--   sequence name = 'si_seq_' || replace(project_id::text, '-', '_')
create or replace function next_si_number(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq_name text := 'si_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  -- Lazy create sequence on first call (idempotent)
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'SI-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function next_si_number(uuid) to authenticated;

-- ── 7. Lock-guard trigger (SI-10 / T-02-LCK) ──────────────────
-- BEFORE INSERT on si_versions: if parent site_instructions is
-- already locked, the new version is rejected. Combined with the
-- absence of UPDATE/DELETE policies on si_versions, this enforces
-- post-lock immutability.
create or replace function si_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked timestamptz;
begin
  select locked_at into v_locked from site_instructions where id = new.si_id;
  if v_locked is not null then
    raise exception '工地指令已鎖定，不允許新增版本 (SI-10)';
  end if;
  return new;
end;
$$;

create trigger trg_si_locked_guard
  before insert on si_versions
  for each row execute function si_lock_guard();

-- ── 8. submit_si RPC (CHN-03 chain freeze + CHN-07 first-step push) ──
-- Snapshots approval_chain_steps where (project_id, doc_type='si')
-- ordered by step_order into chain_snapshot. Sets status='in_review',
-- current_step=0, submitted_at=now(). Then fires push_dispatcher to
-- chain_snapshot[0] holders.
--
-- Caller must be the SI creator. Source status must be draft or
-- revision_requested (the revise-and-resubmit path).
create or replace function submit_si(p_si_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_si site_instructions%rowtype;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_si from site_instructions where id = p_si_id for update;
  if not found then
    raise exception 'SI % not found', p_si_id;
  end if;

  if v_si.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此工地指令';
  end if;

  if v_si.status not in ('draft','revision_requested') then
    raise exception '工地指令不能從狀態 % 提交', v_si.status;
  end if;

  -- Snapshot chain (CHN-03 / D-02) — frozen at submit time
  select jsonb_agg(
           jsonb_build_object(
             'step_order', step_order,
             'required_role', required_role,
             'optional_user_id', optional_user_id
           ) order by step_order
         )
    into v_snapshot
    from approval_chain_steps
   where project_id = v_si.project_id and doc_type = 'si';

  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置工地指令審批鏈';
  end if;

  update site_instructions
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_si_id;

  -- Fan-out push to first step holders
  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id', '')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新工地指令 ' || v_si.number,
    'content_zh', '需要你批准',
    'deep_link',  '/project/' || v_si.project_id::text || '/si/' || v_si.id::text
  );

  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_si.project_id, v_first_role));
  end if;

  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;

grant execute on function submit_si(uuid) to authenticated;

-- ── 9. Replace approvals view-stub from Plan 02-01 ─────────────
-- Plan 02-01 installed a `with check (false)` SELECT stub on approvals.
-- Now that site_instructions exists, replace the stub with a proper
-- SI-aware policy. VO + PTW branches will be added in Plan 02-06 /
-- Phase 3 by dropping + re-creating the policy with additional ORs.
drop policy if exists "View approvals stub" on approvals;
create policy "Members view SI approvals"
  on approvals for select to authenticated
  using (
    doc_type = 'si' and exists (
      select 1 from site_instructions s
       where s.id = doc_id and can_view_project(auth.uid(), s.project_id)
    )
    -- VO branch added in Plan 02-06
    -- PTW branch added in Phase 3
  );

-- Direct client INSERT into approvals stays denied. The only legal
-- write path is the SECURITY DEFINER submit_approval RPC (Plan 02-04).
drop policy if exists "Insert approvals through RPC only" on approvals;
drop policy if exists "Insert approvals direct" on approvals;
create policy "Insert approvals direct"
  on approvals for insert to authenticated
  with check (false);

-- ── 10. Realtime publication (D-26) ──────────────────────────
alter publication supabase_realtime add table site_instructions;
alter publication supabase_realtime add table si_versions;
alter publication supabase_realtime add table protest_comments;

-- =============================================================
-- End of v9-si-schema.sql
-- Post-apply verification queries (run in SQL Editor):
--   select table_name from information_schema.tables
--     where table_name in ('site_instructions','si_versions','protest_comments');
--   select proname, prosecdef from pg_proc
--     where proname in ('can_view_si','next_si_number','submit_si','si_lock_guard');
--   select tgname from pg_trigger where tgname in ('trg_si_locked_guard');
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime'
--       and tablename in ('site_instructions','si_versions','protest_comments');
--   select policyname from pg_policies
--     where tablename='approvals' and policyname='Members view SI approvals';
-- =============================================================
