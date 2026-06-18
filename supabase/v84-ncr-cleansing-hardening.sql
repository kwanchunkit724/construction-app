-- =============================================================
-- v84-ncr-cleansing-hardening.sql
--   (Post-review hardening of the v81 cleansing + v82 NCR modules)
-- =============================================================
-- Adversarial review (2026-06-18) of the new cleansing/NCR code surfaced four
-- real issues fixed here on the DB side:
--
--  [HIGH] cleansing_inspections INSERT forged a VERIFIED record. The INSERT RLS
--    only pinned created_by; verified_by/verified_at were unpinned and only a
--    BEFORE UPDATE trigger existed → a low-priv editor could insert a row with
--    verified_by/verified_at already set, forging a manager sign-off. Same class
--    as v55f-insert-guards. FIX: BEFORE INSERT guard nulling verified_* when
--    auth.uid() is not null (service/migration inserts with null uid bypass).
--
--  [HIGH] ncr_reports INSERT forged a CLOSED / corrective-submitted NCR. status,
--    corrective_*, root_cause/corrective_action/preventive_action, closed_* were
--    unpinned on INSERT. FIX: BEFORE INSERT guard forcing the clean initial
--    state (status='open', all CAR/close cols null) when auth.uid() is not null.
--
--  [HIGH] reopen_ncr → re-submit silently OVERWROTE the prior CAR with no history
--    (the v82 comment promised history that did not exist). FIX: ncr_corrective_
--    history table; submit_ncr_corrective archives EVERY submission before the
--    overwrite, so the full rejected-then-revised corrective trail survives a
--    dispute.
--
--  [LOW] void_ncr let the raiser void an NCR after a CAR was submitted, dodging
--    the verifier. FIX: once status='corrective_submitted', only an admin may
--    void (raiser can still void while 'open').
--
-- Additive / idempotent / no destructive change to existing rows. zh-HK. ASI.
-- =============================================================

-- ── 1. [HIGH] cleansing BEFORE INSERT guard ───────────────────────────────────
create or replace function public.guard_cleansing_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Authenticated client inserts can never self-set the verified outcome. Only
  -- verify_cleansing() (SECURITY DEFINER, via UPDATE) sets these. Service-role /
  -- migration inserts (auth.uid() null) are unaffected.
  if auth.uid() is not null then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cleansing_guard_insert on cleansing_inspections;
create trigger trg_cleansing_guard_insert before insert on cleansing_inspections
  for each row execute function public.guard_cleansing_insert();

-- ── 2. [HIGH] ncr_reports BEFORE INSERT guard ─────────────────────────────────
create or replace function public.guard_ncr_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Authenticated client inserts always start clean ('open', no CAR, not closed).
  -- Only the SECURITY DEFINER transition RPCs advance status / stamp actors.
  if auth.uid() is not null then
    new.status := 'open';
    new.corrective_by := null;
    new.corrective_at := null;
    new.root_cause := null;
    new.corrective_action := null;
    new.preventive_action := null;
    new.closed_by := null;
    new.closed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ncr_guard_insert on ncr_reports;
create trigger trg_ncr_guard_insert before insert on ncr_reports
  for each row execute function public.guard_ncr_insert();

-- ── 3. [HIGH] ncr_corrective_history — preserve every CAR submission ──────────
create table if not exists ncr_corrective_history (
  id uuid primary key default gen_random_uuid(),
  ncr_id uuid not null references ncr_reports(id) on delete cascade,
  root_cause text,
  corrective_action text,
  preventive_action text,
  submitted_by uuid not null references user_profiles(id) on delete restrict,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_ncr_corr_hist on ncr_corrective_history (ncr_id, submitted_at desc);

alter table ncr_corrective_history enable row level security;
-- Readable by anyone who can view the parent NCR's project (module-gated); only
-- the SECURITY DEFINER submit RPC writes it (no client write policy).
drop policy if exists ncr_corr_hist_select on ncr_corrective_history;
create policy ncr_corr_hist_select on ncr_corrective_history for select to authenticated
  using (
    exists (
      select 1 from ncr_reports n
      where n.id = ncr_corrective_history.ncr_id
        and can_view_project(auth.uid(), n.project_id)
        and project_module_enabled(n.project_id, 'ncr')
    )
  );

-- Re-create submit_ncr_corrective (v82 body) + archive each submission to history
-- BEFORE the in-place overwrite, so a reopen→re-submit never silently loses the
-- prior corrective trail.
create or replace function public.submit_ncr_corrective(
  p_id uuid, p_root_cause text, p_corrective_action text, p_preventive_action text
) returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  if not can_edit_project_progress(v_uid, v_project) then raise exception '沒有權限提交糾正措施'; end if;
  if v_status <> 'open' then raise exception 'NCR 並非待糾正狀態'; end if;
  if coalesce(trim(p_corrective_action), '') = '' then raise exception '請填寫糾正措施'; end if;
  -- Archive this submission (append-only) so every CAR version survives.
  insert into ncr_corrective_history (ncr_id, root_cause, corrective_action, preventive_action, submitted_by)
  values (p_id, p_root_cause, p_corrective_action, p_preventive_action, v_uid);
  update ncr_reports
     set root_cause = p_root_cause,
         corrective_action = p_corrective_action,
         preventive_action = p_preventive_action,
         corrective_by = v_uid, corrective_at = now(),
         status = 'corrective_submitted'
   where id = p_id;
end;
$$;
grant execute on function public.submit_ncr_corrective(uuid, text, text, text) to authenticated;

-- ── 4. [LOW] void_ncr — raiser can't void after a CAR exists (admin only) ─────
create or replace function public.void_ncr(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_raiser uuid; v_uid uuid := auth.uid(); v_is_admin boolean;
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status, raised_by into v_project, v_status, v_raiser from ncr_reports where id = p_id;
  if v_project is null then raise exception '找不到 NCR 記錄'; end if;
  v_is_admin := exists (select 1 from user_profiles where id = v_uid and global_role = 'admin');
  if not (v_raiser = v_uid or v_is_admin) then raise exception '只有提出人或管理員可以作廢 NCR'; end if;
  if v_status = 'closed' then raise exception '已關閉的 NCR 不可作廢'; end if;
  if v_status = 'void' then return; end if;
  -- Once a corrective action is submitted, only an admin may void — the raiser
  -- cannot unilaterally escape the verifier's close/reopen gate.
  if v_status = 'corrective_submitted' and not v_is_admin then
    raise exception '已提交糾正措施，只有管理員可以作廢';
  end if;
  update ncr_reports set status = 'void' where id = p_id;
end;
$$;
grant execute on function public.void_ncr(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- guards present:
--   select tgname from pg_trigger where tgname in ('trg_cleansing_guard_insert','trg_ncr_guard_insert'); -- 2
--   -- forgery blocked (as an authenticated editor):
--   --   insert cleansing_inspections(... verified_at=now()) -> row lands with verified_at NULL.
--   --   insert ncr_reports(... status='closed', closed_by=<pm>) -> row lands status='open', closed_by NULL.
--   select to_regclass('public.ncr_corrective_history') is not null;            -- t
--   select count(*) from pg_policies where tablename='ncr_corrective_history';  -- 1
--   -- submit_ncr_corrective now writes a history row each call;
--   -- void_ncr from 'corrective_submitted' as the raiser (non-admin) -> raises.
-- =============================================================
