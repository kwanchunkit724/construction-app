-- =============================================================
-- v9-vo-schema.sql — Phase 2 Plan 02-06 (VO domain)
-- =============================================================
-- Depends on:
--   * v9-chain-schema.sql      (approvals, approval_chain_steps)
--   * v9-si-schema.sql         (site_instructions — parent doc; approvals SELECT policy replaced here)
--   * v9-rls-helpers.sql       (active_role_holders, can_view_project, can_edit_project_progress)
--   * v9-split/1-push-dispatcher.sql (push_dispatcher)
--
-- Installs:
--   * variation_orders (one-VO-per-SI via UNIQUE(si_id), D-17)
--   * vo_versions (payload jsonb with line_items, D-18)
--   * recompute_vo_totals trigger (BEFORE INSERT on vo_versions) — recomputes
--     each subtotal_cents from quantity * unit_price_cents and rolls up
--     total_amount_cents inside payload. AUTHORITATIVE — clients cannot
--     supply a trusted total (defence-in-depth layer 1).
--   * sync_vo_total trigger (BEFORE INSERT/UPDATE OF current_version_id on
--     variation_orders) — copies total_amount_cents from referenced version.
--     Combined with the RLS UPDATE policy WITH CHECK clause below, the
--     variation_orders.total_amount_cents column is server-only (defence
--     layer 2).
--   * vo_lock_guard trigger — mirrors si_lock_guard (VO-08).
--   * can_view_vo helper (D-27 + INF-03).
--   * next_vo_number — sequence-per-project (same pattern as next_si_number).
--       Sequence name = 'vo_seq_' || replace(project_id::text, '-', '_').
--   * submit_vo(p_vo_id) RPC — snapshots VO chain, checks parent-SI lock
--     (VO-01), advances status to in_review, fires push_dispatcher for
--     chain_snapshot[0] holders.
--   * Replaces the SI-only "Members view SI approvals" policy from
--     v9-si-schema.sql with a unified "Members view approvals" policy
--     covering both doc_type='si' and doc_type='vo' branches.
--   * Realtime publication entries.
--
-- IMPORTANT — apply-tooling note (per 02-02-SUMMARY):
--   `language sql` resolves table refs at CREATE-FUNCTION parse time. All
--   functions here that touch tables created in this same file use plpgsql
--   (which resolves at execute time) or are defined after the tables.
--
-- Run once via Supabase Dashboard → SQL Editor AFTER v9-si-schema.sql.
-- =============================================================

-- ── 1. Defensive drops (triggers + functions only; never tables) ──
do $$
begin
  if to_regclass('public.vo_versions') is not null then
    execute 'drop trigger if exists trg_vo_versions_recompute on vo_versions';
    execute 'drop trigger if exists trg_vo_locked_guard on vo_versions';
  end if;
  if to_regclass('public.variation_orders') is not null then
    execute 'drop trigger if exists trg_vo_sync_total on variation_orders';
  end if;
end $$;
drop function if exists recompute_vo_totals() cascade;
drop function if exists sync_vo_total() cascade;
drop function if exists vo_lock_guard() cascade;
drop function if exists submit_vo(uuid) cascade;
drop function if exists next_vo_number(uuid) cascade;
drop function if exists can_view_vo(uuid, uuid) cascade;

-- ── 2. Tables (RESEARCH.md §4 lines 389-415; D-17 / D-18) ─────
create table variation_orders (
  id                  uuid primary key default gen_random_uuid(),
  si_id               uuid unique references site_instructions(id) on delete restrict,  -- UNIQUE = one VO per SI
  project_id          uuid not null references projects(id) on delete cascade,
  number              text not null,                  -- 'VO-001'
  current_version_id  uuid,                            -- deferred FK below
  total_amount_cents  bigint,                          -- server-only; maintained by sync_vo_total
  chain_snapshot      jsonb,
  current_step        int  not null default 0,
  status              text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved','locked','revision_requested','rejected')),
  created_by          uuid not null references user_profiles(id) on delete restrict,
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  locked_at           timestamptz,
  unique (project_id, number)
);

create table vo_versions (
  id           uuid primary key default gen_random_uuid(),
  vo_id        uuid not null references variation_orders(id) on delete cascade,
  version_no   int  not null,
  payload      jsonb not null,                          -- {description, line_items[], total_amount_cents}
  edits_by     uuid not null references user_profiles(id) on delete restrict,
  created_at   timestamptz not null default now(),
  unique (vo_id, version_no)
);

-- Deferred FK: current_version_id → vo_versions.id
alter table variation_orders
  add constraint vo_current_version_fk
  foreign key (current_version_id) references vo_versions(id) on delete set null;

-- ── 3. recompute_vo_totals — D-18 defence-in-depth layer 1 ─────
-- BEFORE INSERT on vo_versions. For each line item, computes
--   subtotal_cents = round(quantity * unit_price_cents)
-- and rolls up total_amount_cents inside payload. Overwrites any
-- client-supplied subtotal/total values. Even if the client lies,
-- the stored row reflects server arithmetic.
create or replace function recompute_vo_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint := 0;
  v_items jsonb := coalesce(new.payload->'line_items','[]'::jsonb);
  v_recomputed jsonb := '[]'::jsonb;
  v_item jsonb;
  v_sub bigint;
begin
  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_sub := round(
      (v_item->>'quantity')::numeric * (v_item->>'unit_price_cents')::bigint
    )::bigint;
    v_recomputed := v_recomputed || jsonb_build_object(
      'category',              v_item->>'category',
      'description',           v_item->>'description',
      'quantity',              (v_item->>'quantity')::numeric,
      'unit',                  v_item->>'unit',
      'unit_price_cents',      (v_item->>'unit_price_cents')::bigint,
      'subtotal_cents',        v_sub,
      'progress_leaf_item_id', v_item->'progress_leaf_item_id'
    );
    v_total := v_total + v_sub;
  end loop;
  new.payload := jsonb_set(new.payload, '{line_items}', v_recomputed);
  new.payload := jsonb_set(new.payload, '{total_amount_cents}', to_jsonb(v_total));
  return new;
end;
$$;

create trigger trg_vo_versions_recompute
  before insert on vo_versions
  for each row execute function recompute_vo_totals();

-- ── 4. sync_vo_total — D-18 defence-in-depth layer 2 ──────────
-- BEFORE INSERT OR UPDATE OF current_version_id on variation_orders.
-- Copies total_amount_cents from referenced version's payload. Any
-- client value supplied for this column is overwritten.
create or replace function sync_vo_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if new.current_version_id is not null then
    select (payload->>'total_amount_cents')::bigint into v_total
      from vo_versions where id = new.current_version_id;
    new.total_amount_cents := v_total;
  end if;
  return new;
end;
$$;

create trigger trg_vo_sync_total
  before insert or update of current_version_id on variation_orders
  for each row execute function sync_vo_total();

-- ── 5. Indexes ────────────────────────────────────────────────
create index idx_vo_project on variation_orders (project_id);
create index idx_vo_status  on variation_orders (status);
create index idx_vo_versions on vo_versions (vo_id, version_no);

-- ── 6. vo_lock_guard trigger (VO-08; mirrors si_lock_guard) ────
create or replace function vo_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked timestamptz;
begin
  select locked_at into v_locked from variation_orders where id = new.vo_id;
  if v_locked is not null then
    raise exception 'VO is locked; new versions are not allowed (VO-08)';
  end if;
  return new;
end;
$$;

create trigger trg_vo_locked_guard
  before insert on vo_versions
  for each row execute function vo_lock_guard();

-- ── 7. can_view_vo helper (D-27) ──────────────────────────────
create or replace function can_view_vo(p_user_id uuid, p_vo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from variation_orders v
     where v.id = p_vo_id and can_view_project(p_user_id, v.project_id)
  );
$$;

grant execute on function can_view_vo(uuid, uuid) to authenticated;

-- ── 8. next_vo_number — sequence-per-project (D-10 pattern) ────
-- Sequence-name mapping rule:
--   sequence name = 'vo_seq_' || replace(project_id::text, '-', '_')
-- Same pattern as next_si_number; Phase 3 PTW will reuse next_ptw_number.
create or replace function next_vo_number(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq_name text := 'vo_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'VO-' || lpad(v_next::text, 3, '0');
end;
$$;

grant execute on function next_vo_number(uuid) to authenticated;

-- ── 9. RLS enable + policies ──────────────────────────────────
alter table variation_orders enable row level security;
alter table vo_versions enable row level security;

-- variation_orders: SELECT
create policy "Members view VO"
  on variation_orders for select to authenticated
  using (can_view_project(auth.uid(), project_id));

-- variation_orders: INSERT — only against a LOCKED parent SI (VO-01)
create policy "Creator inserts draft VO"
  on variation_orders for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and exists (
      select 1 from site_instructions s
       where s.id = si_id
         and s.status = 'locked'
         and s.locked_at is not null
         and can_edit_project_progress(auth.uid(), s.project_id)
    )
  );

-- variation_orders: UPDATE — column-level write denial for total_amount_cents
-- (D-17 / VO-05 defence-in-depth, layer 0 at RLS gate). The "is not distinct
-- from" form handles NULL safely. Combined with trg_vo_sync_total trigger,
-- even a future migration that relaxes this WITH CHECK can't subvert the
-- invariant. Subselect references variation_orders to compare against the
-- pre-update value of total_amount_cents.
create policy "Creator updates own draft VO"
  on variation_orders for update to authenticated
  using (can_view_vo(auth.uid(), id))
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and total_amount_cents is not distinct from (
      select v.total_amount_cents from variation_orders v where v.id = variation_orders.id
    )
  );
-- NO delete policy on variation_orders.

-- vo_versions: SELECT
create policy "Members view VO versions"
  on vo_versions for select to authenticated
  using (
    exists (
      select 1 from variation_orders v
       where v.id = vo_id and can_view_project(auth.uid(), v.project_id)
    )
  );

-- vo_versions: INSERT — creator can append versions while VO is draft or
-- revision_requested AND parent VO is not locked. Lock enforcement is also
-- via trg_vo_locked_guard (belt-and-braces).
create policy "Creator inserts VO version when not locked"
  on vo_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (
      select 1 from variation_orders v
       where v.id = vo_id
         and v.created_by = auth.uid()
         and v.status in ('draft','revision_requested')
         and v.locked_at is null
    )
  );
-- NO update, NO delete on vo_versions (append-only).

-- ── 10. Unified approvals view-policy (replaces SI-only from 02-02) ──
-- Plan 02-02 installed a SI-only "Members view SI approvals" policy. Now
-- that variation_orders exists, replace it with a unified version covering
-- doc_type='si' + doc_type='vo'. PTW branch added in Phase 3.
drop policy if exists "Members view SI approvals" on approvals;
drop policy if exists "Members view approvals" on approvals;
create policy "Members view approvals"
  on approvals for select to authenticated
  using (
    (doc_type = 'si' and exists (
      select 1 from site_instructions s
       where s.id = doc_id and can_view_project(auth.uid(), s.project_id)
    ))
    or
    (doc_type = 'vo' and exists (
      select 1 from variation_orders v
       where v.id = doc_id and can_view_project(auth.uid(), v.project_id)
    ))
    -- PTW branch added in Phase 3
  );

-- ── 11. submit_vo RPC (mirrors submit_si + parent-SI lock check VO-01) ──
create or replace function submit_vo(p_vo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vo variation_orders%rowtype;
  v_si_locked timestamptz;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_vo from variation_orders where id = p_vo_id for update;
  if not found then
    raise exception 'VO % not found', p_vo_id;
  end if;
  if v_vo.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此變更指令';
  end if;
  if v_vo.status not in ('draft','revision_requested') then
    raise exception '變更指令不能從狀態 % 提交', v_vo.status;
  end if;

  -- VO-01: parent SI must be locked
  select locked_at into v_si_locked from site_instructions where id = v_vo.si_id;
  if v_si_locked is null then
    raise exception '父工地指令尚未鎖定 (VO-01)';
  end if;

  -- Snapshot chain (CHN-03) — frozen at submit time
  select jsonb_agg(
           jsonb_build_object(
             'step_order', step_order,
             'required_role', required_role,
             'optional_user_id', optional_user_id
           ) order by step_order
         )
    into v_snapshot
    from approval_chain_steps
   where project_id = v_vo.project_id and doc_type = 'vo';

  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置變更指令審批鏈';
  end if;

  update variation_orders
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_vo_id;

  -- Fan-out push to first step holders
  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id', '')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新變更指令 ' || v_vo.number,
    'content_zh', '需要你批准',
    'deep_link',  '/project/' || v_vo.project_id::text || '/vo/' || v_vo.id::text
  );

  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_vo.project_id, v_first_role));
  end if;

  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;

grant execute on function submit_vo(uuid) to authenticated;

-- ── 12. Realtime publication (D-26) ──────────────────────────
alter publication supabase_realtime add table variation_orders;
alter publication supabase_realtime add table vo_versions;

-- =============================================================
-- End of v9-vo-schema.sql
-- Post-apply verification queries (run in SQL Editor):
--   select table_name from information_schema.tables
--     where table_name in ('variation_orders','vo_versions');
--   select tgname from pg_trigger
--     where tgname in ('trg_vo_versions_recompute','trg_vo_sync_total','trg_vo_locked_guard');
--   select proname, prosecdef from pg_proc
--     where proname in ('submit_vo','next_vo_number','can_view_vo',
--                       'recompute_vo_totals','sync_vo_total','vo_lock_guard');
--   select policyname from pg_policies
--     where tablename='approvals' and policyname='Members view approvals';
--   select tablename from pg_publication_tables
--     where pubname='supabase_realtime'
--       and tablename in ('variation_orders','vo_versions');
-- =============================================================
