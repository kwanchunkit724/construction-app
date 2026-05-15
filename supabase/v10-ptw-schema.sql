-- =============================================================
-- v10-ptw-schema.sql — Phase 3 Plan 03-02 (PTW domain)
-- =============================================================
-- Depends on:
--   * v9-chain-schema.sql      (approvals, approval_chain_steps)
--   * v9-rls-helpers.sql       (active_role_holders, can_view_project)
--   * v9-split/1-push-dispatcher.sql (push_dispatcher)
--   * v10-safety-officer-role.sql (safety_officer role exists)
--   * v10-split/1-pgjwt-poc.sql   (pgjwt extension installed)
--   * v5-push-notifications.sql   (app_config table)
--
-- Installs:
--   * permits_to_work + permit_versions + permit_workers
--   * permit_scans (audit each QR verification scan)
--   * permit_signoffs (signature_pad blobs as sidecar to approvals)
--   * Sequence-per-project numbering (next_ptw_number; D-10 pattern)
--   * Lock-guard, fire-watch-elapsed RPC, activate-on-chain-complete logic
--   * mint_ptw_jwt + verify_ptw_jwt SECURITY DEFINER (server-only secret)
--   * submit_ptw RPC (chain freeze + push)
--   * close_out_ptw RPC (30-min fire-watch enforcement for hot_work)
--   * app_config columns: ptw_qr_secret + ptw_enabled
--   * pg_cron job 'ptw-expiry' replacing the rehearsal (P3-D3)
--
-- Teardown of Plan 03-01 rehearsal artifacts is at the TOP so this
-- migration is single-pass.
--
-- IMPORTANT lessons inherited from Phase 2:
--   * language sql resolves table refs at CREATE-FUNCTION parse time.
--     All functions with potential forward refs use plpgsql + EXECUTE.
--   * drop trigger if exists ... on table requires the table to exist.
--     Guard with to_regclass DO blocks for first-run idempotency.
--   * Supabase SQL Editor does NOT auto-wrap multi-statement scripts
--     in a transaction. Each block is idempotent.
-- =============================================================

-- ── 0. Teardown Plan 03-01 rehearsal artifacts ──────────────
do $$
begin
  perform cron.unschedule('ptw-expiry-rehearsal');
exception when others then null;
end $$;
drop table if exists _cron_rehearsal_log;

-- ── 1. Defensive drops (functions + triggers + sub-objects only) ──
do $$
begin
  if to_regclass('public.permit_versions') is not null then
    execute 'drop trigger if exists trg_ptw_locked_guard on permit_versions';
  end if;
  if to_regclass('public.permits_to_work') is not null then
    execute 'drop trigger if exists trg_ptw_status_trans on permits_to_work';
  end if;
end $$;
drop function if exists ptw_lock_guard() cascade;
drop function if exists next_ptw_number(uuid) cascade;
drop function if exists can_view_ptw(uuid, uuid) cascade;
drop function if exists submit_ptw(uuid) cascade;
drop function if exists close_out_ptw(uuid, text) cascade;
drop function if exists activate_ptw(uuid) cascade;
drop function if exists mint_ptw_jwt(uuid) cascade;
drop function if exists verify_ptw_jwt(text) cascade;
drop function if exists drain_ptw_expiry() cascade;

-- ── 2a. project_members.role CHECK extension ────────────────
-- safety_officer must be allowed as a project member role so that
-- approval chains can target it via active_role_holders.
alter table project_members drop constraint if exists project_members_role_check;
alter table project_members
  add constraint project_members_role_check
  check (role in ('pm','main_contractor','subcontractor',
                  'subcontractor_worker','owner','safety_officer'));

-- ── 2b. app_config extension ────────────────────────────────
alter table app_config add column if not exists ptw_qr_secret text;
alter table app_config add column if not exists ptw_enabled boolean not null default false;
-- Operator: set the real secret AFTER this migration runs:
--   update app_config set ptw_qr_secret = encode(gen_random_bytes(32), 'hex') where id = 1;
-- Operator: flip ptw_enabled = true when ready to surface UI to end users.

-- ── 3. Tables ────────────────────────────────────────────────
create table if not exists permits_to_work (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,
  ptw_type text not null
    check (ptw_type in ('hot_work','work_at_height','lifting',
                        'confined_space','excavation','electrical','scaffold')),
  current_version_id uuid,
  chain_snapshot jsonb,
  current_step int not null default 0,
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','approved',
                      'active','closed_out','expired','rejected','revision_requested')),
  created_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  activated_at timestamptz,
  expires_at timestamptz,
  fire_watch_started_at timestamptz,
  closed_out_at timestamptz,
  locked_at timestamptz,
  unique (project_id, number)
);

create table if not exists permit_versions (
  id uuid primary key default gen_random_uuid(),
  ptw_id uuid not null references permits_to_work(id) on delete cascade,
  version_no int not null,
  payload jsonb not null,
  edits_by uuid not null references user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (ptw_id, version_no)
);

create table if not exists permit_workers (
  id uuid primary key default gen_random_uuid(),
  ptw_id uuid not null references permits_to_work(id) on delete cascade,
  worker_name text not null,
  worker_phone text,
  worker_photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists permit_signoffs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals(id) on delete cascade,
  ptw_id uuid not null references permits_to_work(id) on delete cascade,
  signature_b64 text not null,
  created_at timestamptz not null default now(),
  unique (approval_id)
);

create table if not exists permit_scans (
  id uuid primary key default gen_random_uuid(),
  ptw_id uuid not null references permits_to_work(id) on delete cascade,
  scanned_by uuid not null references user_profiles(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  jwt_payload_snapshot jsonb not null
);

-- Deferred FK: current_version_id → permit_versions.id
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ptw_current_version_fk') then
    alter table permits_to_work
      add constraint ptw_current_version_fk
      foreign key (current_version_id) references permit_versions(id) on delete set null;
  end if;
end $$;

-- ── 4. Indexes ───────────────────────────────────────────────
create index if not exists idx_ptw_project on permits_to_work(project_id);
create index if not exists idx_ptw_status on permits_to_work(status);
create index if not exists idx_ptw_expires on permits_to_work(expires_at) where status='active';
create index if not exists idx_ptw_versions on permit_versions(ptw_id, version_no);
create index if not exists idx_ptw_workers on permit_workers(ptw_id);
create index if not exists idx_ptw_signoffs on permit_signoffs(ptw_id, created_at);
create index if not exists idx_ptw_scans on permit_scans(ptw_id, scanned_at);

-- ── 5. RLS enable + policies ─────────────────────────────────
alter table permits_to_work enable row level security;
alter table permit_versions enable row level security;
alter table permit_workers enable row level security;
alter table permit_signoffs enable row level security;
alter table permit_scans enable row level security;

drop policy if exists "Members view PTW" on permits_to_work;
create policy "Members view PTW"
  on permits_to_work for select to authenticated
  using (can_view_project(auth.uid(), project_id));

drop policy if exists "Creator inserts draft PTW" on permits_to_work;
create policy "Creator inserts draft PTW"
  on permits_to_work for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and can_edit_project_progress(auth.uid(), project_id)
  );

drop policy if exists "Creator updates own draft PTW" on permits_to_work;
create policy "Creator updates own draft PTW"
  on permits_to_work for update to authenticated
  using (created_by = auth.uid() and status = 'draft')
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
  );
-- NO delete policy.

drop policy if exists "Members view PTW versions" on permit_versions;
create policy "Members view PTW versions"
  on permit_versions for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id and can_view_project(auth.uid(), p.project_id))
  );

drop policy if exists "Creator inserts version when draft or revision" on permit_versions;
create policy "Creator inserts version when draft or revision"
  on permit_versions for insert to authenticated
  with check (
    edits_by = auth.uid()
    and exists (select 1 from permits_to_work p
                 where p.id = ptw_id
                   and p.created_by = auth.uid()
                   and p.status in ('draft','revision_requested')
                   and p.locked_at is null)
  );

drop policy if exists "Members view permit workers" on permit_workers;
create policy "Members view permit workers"
  on permit_workers for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id and can_view_project(auth.uid(), p.project_id))
  );

drop policy if exists "Creator manages workers when draft or revision" on permit_workers;
create policy "Creator manages workers when draft or revision"
  on permit_workers for insert to authenticated
  with check (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id
               and p.created_by = auth.uid()
               and p.status in ('draft','revision_requested'))
  );

drop policy if exists "Members view signoffs" on permit_signoffs;
create policy "Members view signoffs"
  on permit_signoffs for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id and can_view_project(auth.uid(), p.project_id))
  );
-- INSERT into permit_signoffs is server-only (via submit_approval extension
-- in Plan 03-04 OR via close_out_ptw RPC). Direct client INSERT denied.
drop policy if exists "Insert signoffs direct" on permit_signoffs;
create policy "Insert signoffs direct"
  on permit_signoffs for insert to authenticated with check (false);

drop policy if exists "Members view PTW scans" on permit_scans;
create policy "Members view PTW scans"
  on permit_scans for select to authenticated
  using (
    exists (select 1 from permits_to_work p
             where p.id = ptw_id and can_view_project(auth.uid(), p.project_id))
  );
-- permit_scans rows written by verify_ptw_jwt RPC (SECURITY DEFINER).
drop policy if exists "Insert scans direct" on permit_scans;
create policy "Insert scans direct"
  on permit_scans for insert to authenticated with check (false);

-- ── 6. can_view_ptw helper ───────────────────────────────────
create or replace function can_view_ptw(p_user_id uuid, p_ptw_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from permits_to_work p
     where p.id = p_ptw_id and can_view_project(p_user_id, p.project_id)
  );
$$;
grant execute on function can_view_ptw(uuid, uuid) to authenticated;

-- ── 7. next_ptw_number (sequence-per-project, D-10 pattern) ──
create or replace function next_ptw_number(p_project_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_seq_name text := 'ptw_seq_' || replace(p_project_id::text, '-', '_');
  v_next bigint;
begin
  execute format('create sequence if not exists %I minvalue 1 start 1', v_seq_name);
  execute format('select nextval(%L)', v_seq_name) into v_next;
  return 'PTW-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function next_ptw_number(uuid) to authenticated;

-- ── 8. Lock-guard trigger ────────────────────────────────────
create or replace function ptw_lock_guard()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_locked timestamptz;
begin
  select locked_at into v_locked from permits_to_work where id = new.ptw_id;
  if v_locked is not null then
    raise exception '工作許可證已鎖定，不允許新增版本';
  end if;
  return new;
end;
$$;
create trigger trg_ptw_locked_guard
  before insert on permit_versions
  for each row execute function ptw_lock_guard();

-- ── 9. mint_ptw_jwt — server-side signed token mint ──────────
-- Returns a signed JWT containing permit metadata. Secret read from
-- app_config.ptw_qr_secret; never exposed to client.
create or replace function mint_ptw_jwt(p_permit_id uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_permit permits_to_work%rowtype;
  v_secret text;
  v_payload json;
begin
  select * into v_permit from permits_to_work where id = p_permit_id;
  if not found then raise exception 'permit not found'; end if;
  if v_permit.status <> 'active' then
    raise exception 'permit not active (status=%)', v_permit.status;
  end if;
  if v_permit.expires_at is null then raise exception 'permit has no expiry'; end if;

  select ptw_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'app_config.ptw_qr_secret not configured (need 32+ char secret)';
  end if;

  v_payload := json_build_object(
    'permit_id', v_permit.id::text,
    'project_id', v_permit.project_id::text,
    'ptw_type', v_permit.ptw_type,
    'number', v_permit.number,
    'iat', extract(epoch from now())::bigint,
    'exp', extract(epoch from v_permit.expires_at)::bigint
  );
  return extensions.sign(v_payload, v_secret);
end;
$$;
revoke all on function mint_ptw_jwt(uuid) from public;
-- Not granted to authenticated — server-only callable (from trigger paths).

-- ── 10. verify_ptw_jwt — inspector scan path ─────────────────
-- Authenticated callers verify a scanned token. Writes permit_scans
-- audit row. Returns payload on success, raises on invalid/expired.
create or replace function verify_ptw_jwt(p_token text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_secret text;
  v_payload jsonb;
  v_valid boolean;
  v_permit_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select ptw_qr_secret into v_secret from app_config where id = 1;
  if v_secret is null then raise exception 'PTW QR not configured'; end if;

  select payload::jsonb, valid into v_payload, v_valid
    from extensions.verify(p_token, v_secret);
  if not coalesce(v_valid, false) then raise exception 'invalid signature'; end if;

  if (v_payload->>'exp')::bigint < extract(epoch from now())::bigint then
    raise exception 'token expired';
  end if;

  v_permit_id := (v_payload->>'permit_id')::uuid;
  -- Caller must be able to view the project the permit belongs to
  -- (C2 mitigation: login-gated scan, not anonymous).
  if not exists (
    select 1 from permits_to_work p
     where p.id = v_permit_id and can_view_project(v_uid, p.project_id)
  ) then
    raise exception '你冇權查看呢張工作許可證';
  end if;

  insert into permit_scans (ptw_id, scanned_by, jwt_payload_snapshot)
    values (v_permit_id, v_uid, v_payload);
  return v_payload;
end;
$$;
grant execute on function verify_ptw_jwt(text) to authenticated;

-- ── 11. submit_ptw RPC ───────────────────────────────────────
create or replace function submit_ptw(p_ptw_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ptw permits_to_work%rowtype;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_ptw from permits_to_work where id = p_ptw_id for update;
  if not found then raise exception 'PTW % not found', p_ptw_id; end if;
  if v_ptw.created_by <> auth.uid() then
    raise exception '只有提交人可以提交此工作許可證';
  end if;
  if v_ptw.status not in ('draft','revision_requested') then
    raise exception '工作許可證不能從狀態 % 提交', v_ptw.status;
  end if;

  select jsonb_agg(
           jsonb_build_object('step_order', step_order,
                              'required_role', required_role,
                              'optional_user_id', optional_user_id)
           order by step_order)
    into v_snapshot
    from approval_chain_steps
   where project_id = v_ptw.project_id and doc_type = 'ptw';
  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置工作許可證審批鏈';
  end if;

  update permits_to_work
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_ptw_id;

  v_first_role := v_snapshot -> 0 ->> 'required_role';
  v_first_optional := nullif(v_snapshot -> 0 ->> 'optional_user_id','')::uuid;

  v_payload := jsonb_build_object(
    'heading_zh', '新工作許可證 ' || v_ptw.number,
    'content_zh', '需要你簽核',
    'deep_link',  '/project/' || v_ptw.project_id::text || '/ptw/' || v_ptw.id::text
  );
  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_ptw.project_id, v_first_role));
  end if;
  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;
grant execute on function submit_ptw(uuid) to authenticated;

-- ── 12. activate_ptw — called by dispatch trigger on chain complete ──
-- Sets status='active', activated_at=now(), expires_at = today 23:59 HKT.
-- Patches dispatch_after_approval (Plan 02-02) to call this for ptw branch.
create or replace function activate_ptw(p_ptw_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_expires timestamptz;
begin
  -- 23:59 HKT cutoff (today, in HKT). pg_cron sweeps at 16:00 UTC (=00:00 HKT next day).
  v_expires := (date_trunc('day', now() at time zone 'Asia/Hong_Kong')
                + interval '23 hours 59 minutes')
               at time zone 'Asia/Hong_Kong';
  update permits_to_work
     set status = 'active',
         activated_at = now(),
         expires_at = v_expires,
         locked_at = now()
   where id = p_ptw_id;
end;
$$;
revoke all on function activate_ptw(uuid) from public;
-- Server-only; called from dispatch_after_approval (SECURITY DEFINER).

-- ── 13. close_out_ptw RPC (30-min fire-watch for hot_work) ──
create or replace function close_out_ptw(p_ptw_id uuid, p_signature_b64 text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ptw permits_to_work%rowtype;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select * into v_ptw from permits_to_work where id = p_ptw_id for update;
  if not found then raise exception 'PTW not found'; end if;
  if v_ptw.created_by <> v_uid then
    raise exception '只有提交人可以關閉此工作許可證';
  end if;
  if v_ptw.status <> 'active' then
    raise exception '只有 active 狀態嘅工作許可證可以關閉';
  end if;
  if v_ptw.ptw_type = 'hot_work' then
    if v_ptw.fire_watch_started_at is null then
      raise exception '必須先開始 30 分鐘火警監察';
    end if;
    if v_ptw.fire_watch_started_at + interval '30 minutes' > now() then
      raise exception '30 分鐘火警監察未完成';
    end if;
  end if;
  if p_signature_b64 is null or length(p_signature_b64) < 100 then
    raise exception '需要簽名';
  end if;
  -- Record close-out as an approval row + signoff sidecar.
  insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, reason)
    values ('ptw', p_ptw_id,
            jsonb_array_length(coalesce(v_ptw.chain_snapshot, '[]'::jsonb)),
            'approve', v_uid, '完工關閉');
  -- The latest approval row holds this close-out:
  insert into permit_signoffs (approval_id, ptw_id, signature_b64)
    select id, p_ptw_id, p_signature_b64
      from approvals
     where doc_id = p_ptw_id and actor_id = v_uid
     order by created_at desc limit 1;
  update permits_to_work set status='closed_out', closed_out_at=now() where id=p_ptw_id;
end;
$$;
grant execute on function close_out_ptw(uuid, text) to authenticated;

-- ── 14. drain_ptw_expiry — cron job, replaces rehearsal ─────
create or replace function drain_ptw_expiry()
returns void language plpgsql security definer set search_path = public
as $$
begin
  update permits_to_work
     set status = 'expired'
   where status = 'active' and expires_at <= now();
end;
$$;
revoke all on function drain_ptw_expiry() from public;

do $$ begin
  perform cron.unschedule('ptw-expiry');
exception when others then null;
end $$;
select cron.schedule('ptw-expiry', '0 16 * * *',
  $cron$ select drain_ptw_expiry(); $cron$);

-- ── 15. Realtime publication ─────────────────────────────────
do $$ begin
  perform 1 from pg_publication_tables
   where pubname='supabase_realtime' and tablename='permits_to_work';
  if not found then
    execute 'alter publication supabase_realtime add table permits_to_work';
  end if;
  perform 1 from pg_publication_tables
   where pubname='supabase_realtime' and tablename='permit_versions';
  if not found then
    execute 'alter publication supabase_realtime add table permit_versions';
  end if;
  perform 1 from pg_publication_tables
   where pubname='supabase_realtime' and tablename='permit_workers';
  if not found then
    execute 'alter publication supabase_realtime add table permit_workers';
  end if;
  perform 1 from pg_publication_tables
   where pubname='supabase_realtime' and tablename='permit_signoffs';
  if not found then
    execute 'alter publication supabase_realtime add table permit_signoffs';
  end if;
end $$;

-- ── 16. Approvals view-policy extension: add ptw branch ─────
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
    or
    (doc_type = 'ptw' and exists (
      select 1 from permits_to_work p
       where p.id = doc_id and can_view_project(auth.uid(), p.project_id)
    ))
  );

-- =============================================================
-- End of v10-ptw-schema.sql
-- Post-apply verification queries listed at bottom of split file
-- (see v10-split/3-ptw-verify.sql) or inline:
--
--   select table_name from information_schema.tables
--    where table_name in ('permits_to_work','permit_versions','permit_workers',
--                         'permit_signoffs','permit_scans');           -- expect 5
--   select proname, prosecdef from pg_proc
--    where proname in ('submit_ptw','close_out_ptw','activate_ptw',
--                      'mint_ptw_jwt','verify_ptw_jwt','can_view_ptw',
--                      'next_ptw_number','ptw_lock_guard','drain_ptw_expiry');
--   select jobname, schedule from cron.job where jobname='ptw-expiry';
--   select column_name from information_schema.columns
--    where table_name='app_config' and column_name in ('ptw_qr_secret','ptw_enabled');
-- =============================================================
