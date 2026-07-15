-- =============================================================
-- v51-audit-ledger-tamper-evidence.sql   (Security upgrade Phase 1 / Part B)
-- =============================================================
-- Tamper-EVIDENT append-only hash-chained audit ledger.
-- Goal (.planning/security-2026-06/ Part B): make any change to critical records
-- detectable. Every INSERT/UPDATE/DELETE on a watched table appends a row to
-- `audit_ledger`; each row stores the sha256 of (its fields + the PREVIOUS row's
-- hash). Altering or deleting ANY past record — even via the Supabase dashboard /
-- service-role key (triggers fire regardless of RLS) — breaks the chain, which
-- `verify_integrity()` detects. The ledger itself is immutable (UPDATE/DELETE
-- raise) and unreadable to clients except through the gated verify/export RPCs.
--
-- Honest scope: tamper-EVIDENT, not tamper-impossible. A Postgres superuser could
-- disable a trigger to write unlogged, but cannot edit a PAST ledger row without
-- breaking the chain. Determinism (critique M6): hash input uses occurred_at AT
-- TIME ZONE 'UTC' (session-tz-independent) and jsonb::text (canonical key order).
-- pgcrypto digest via the extensions schema. Idempotent.
-- =============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists audit_ledger (
  seq         bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  actor_id    uuid,                 -- auth.uid() at write time (null = service role / system)
  table_name  text not null,
  row_pk      text not null,
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  payload     jsonb not null,       -- NEW row image (I/U) or OLD (D)
  prev_hash   bytea,                -- previous row's hash; null only for genesis
  hash        bytea not null
);
alter table audit_ledger enable row level security;
-- No policies → deny all direct client access. Reads only via verify/export RPCs.
revoke insert, update, delete on audit_ledger from authenticated, anon;

-- Canonical hash input — MUST be byte-identical in the append trigger and in
-- verify_integrity(). UTC-normalised timestamp + jsonb canonical text.
create or replace function audit_ledger_canon(
  p_occurred_at timestamptz, p_actor uuid, p_table text, p_pk text,
  p_action text, p_payload jsonb, p_prev bytea
) returns text
language sql immutable
set search_path = public, extensions
as $$
  select to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      || '|' || coalesce(p_actor::text, '')
      || '|' || p_table
      || '|' || p_pk
      || '|' || p_action
      || '|' || p_payload::text
      || '|' || coalesce(encode(p_prev, 'hex'), 'GENESIS');
$$;

-- Generic append trigger fn — attached to every watched table below.
create or replace function audit_ledger_append() returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_now     timestamptz := clock_timestamp();
  v_actor   uuid := auth.uid();
  v_payload jsonb;
  v_pk      text;
  v_prev    bytea;
  v_hash    bytea;
begin
  -- Serialize ledger appends so prev_hash always reads the true head (linear chain).
  perform pg_advisory_xact_lock(902150951);

  if tg_op = 'DELETE' then v_payload := to_jsonb(old); else v_payload := to_jsonb(new); end if;
  v_pk := coalesce(v_payload->>'id', v_payload->>'seq', v_payload->>'number', md5(v_payload::text));

  select al.hash into v_prev from audit_ledger al order by al.seq desc limit 1;

  v_hash := extensions.digest(
    audit_ledger_canon(v_now, v_actor, tg_table_name, v_pk, tg_op, v_payload, v_prev),
    'sha256'
  );

  insert into audit_ledger (occurred_at, actor_id, table_name, row_pk, action, payload, prev_hash, hash)
  values (v_now, v_actor, tg_table_name, v_pk, tg_op, v_payload, v_prev, v_hash);

  return null;  -- AFTER trigger
end;
$$;

-- Immutability: the ledger is append-only. UPDATE/DELETE always raise.
create or replace function audit_ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '審計帳本唯讀，不可修改或刪除 (audit_ledger is append-only)';
end;
$$;
drop trigger if exists trg_audit_ledger_immutable on audit_ledger;
create trigger trg_audit_ledger_immutable
  before update or delete on audit_ledger
  for each row execute function audit_ledger_immutable();

-- Attach the append trigger to each watched critical table that exists.
do $$
declare t text;
begin
  foreach t in array array[
    'approvals','site_instructions','si_versions','variation_orders','vo_versions',
    'permits_to_work','ptw_versions','permit_signoffs',
    'documents','document_versions','document_events',
    'progress_history','project_members','user_profiles'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_audit_ledger on %I', t);
      execute format('create trigger trg_audit_ledger after insert or update or delete on %I for each row execute function audit_ledger_append()', t);
    end if;
  end loop;
end$$;

-- verify_integrity — walk the chain, recompute every hash, detect the first break.
-- Returns metadata only (never payloads). Gated to admin / project owner-ish: any
-- authenticated user may verify (it reveals only integrity status + head hash, no
-- record content), which is exactly the "prove it's intact" affordance.
create or replace function verify_integrity(p_from bigint default 0)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_expect_prev bytea := null;
  v_first boolean := true;
  v_recomputed bytea;
  v_count bigint := 0;
  v_head_seq bigint := null;
  v_head_hash bytea := null;
begin
  if auth.uid() is null then raise exception '未登入'; end if;
  for r in select * from audit_ledger where seq >= p_from order by seq asc loop
    v_count := v_count + 1;
    -- chain link: this row's prev_hash must equal the previous row's hash
    if not v_first and r.prev_hash is distinct from v_expect_prev then
      return jsonb_build_object('intact', false, 'break_at', r.seq, 'reason', 'prev_hash mismatch', 'count', v_count);
    end if;
    -- content: recompute this row's hash from its stored fields
    v_recomputed := extensions.digest(
      audit_ledger_canon(r.occurred_at, r.actor_id, r.table_name, r.row_pk, r.action, r.payload, r.prev_hash),
      'sha256'
    );
    if v_recomputed is distinct from r.hash then
      return jsonb_build_object('intact', false, 'break_at', r.seq, 'reason', 'hash mismatch (row altered)', 'count', v_count);
    end if;
    v_expect_prev := r.hash;
    v_first := false;
    v_head_seq := r.seq;
    v_head_hash := r.hash;
  end loop;
  return jsonb_build_object(
    'intact', true, 'break_at', null, 'count', v_count,
    'head_seq', v_head_seq, 'head_hash', case when v_head_hash is null then null else encode(v_head_hash,'hex') end,
    'verified_at', to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;
grant execute on function verify_integrity(bigint) to authenticated;

-- export_ledger_proof — admin-only cryptographic proof: chain metadata + hashes
-- (NOT payloads), so the integrity can be re-verified offline by a third party.
create or replace function export_ledger_proof()
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v_is_admin boolean;
begin
  select (up.global_role = 'admin') into v_is_admin from user_profiles up where up.id = auth.uid();
  if not coalesce(v_is_admin, false) then raise exception '只有管理員可匯出完整證明'; end if;
  return jsonb_build_object(
    'generated_at', to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'verification', verify_integrity(0),
    'chain', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seq', al.seq, 'at', to_char(al.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'table', al.table_name, 'action', al.action, 'row', al.row_pk,
        'hash', encode(al.hash,'hex')) order by al.seq)
      from audit_ledger al), '[]'::jsonb)
  );
end;
$$;
grant execute on function export_ledger_proof() to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- 1. write something on a watched table (e.g. update a doc's review_due_date)
--   --    -> a new audit_ledger row appends.
--   -- 2. select verify_integrity(0); -> {"intact": true, "head_seq": N, ...}
--   -- 3. simulate tampering INSIDE a rolled-back txn:
--   --      begin;
--   --      -- temporarily allow: alter table audit_ledger disable trigger trg_audit_ledger_immutable;  (owner only)
--   --      update audit_ledger set payload = payload || '{"x":1}' where seq = (select min(seq) from audit_ledger);
--   --      select verify_integrity(0);  -> {"intact": false, "break_at": <seq>, "reason":"hash mismatch (row altered)"}
--   --      rollback;
--   -- 4. as a normal user, update audit_ledger -> raises (append-only).
-- =============================================================
