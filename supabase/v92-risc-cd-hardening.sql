-- =============================================================
-- v92-risc-cd-hardening.sql   (post-review hardening: RISC v89 + CD v91 + NCR parity)
-- =============================================================
-- Adversarial review of the 3 new modules surfaced:
--  [HIGH] revise_cd not atomic → two concurrent revisions = two 'current' rows for
--    one CD number. FIX: SELECT ... FOR UPDATE + a partial unique index backstop.
--  [med] RISC (and NCR, same class) UPDATE path lets the raiser/admin forge the
--    inspector/verdict attribution columns via a direct UPDATE that keeps status
--    unchanged. FIX: BEFORE UPDATE guards that revert those columns when status is
--    NOT changing — the SECURITY DEFINER transition RPCs always change status, so
--    they pass; a direct same-status forge is reverted.
--  [med] inspect_risc didn't server-enforce a comment on 'fail'; withdraw_cd had
--    no status precondition; revise_cd allowed a duplicate revision string; the 4
--    transition RPCs lacked the project_module_enabled guard. FIX: all added.
--  [low] insert guards now also stamp the timestamps server-side (no backdating).
-- Idempotent; re-creates functions + adds 2 triggers + 1 index. zh-HK. ASI.
-- =============================================================

-- ── insert guards: also stamp timestamps server-side (anti-backdate) ──────────
create or replace function public.guard_risc_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.status := 'submitted';
    new.inspected_by := null; new.inspected_at := null; new.result_comment := null;
    new.created_at := now(); new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.guard_cd_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.status := 'current';
    new.issued_at := now(); new.created_at := now(); new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ── BEFORE UPDATE guards: block direct forging of verdict/actor columns ───────
-- When an authenticated UPDATE does NOT change status, the privileged actor /
-- result columns are forced back to their OLD values. The transition RPCs
-- (inspect_risc / submit_ncr_corrective / close_ncr / reopen_ncr) all change
-- status in the same UPDATE, so they are unaffected; a direct same-status forge
-- is neutralised.
create or replace function public.guard_risc_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.status = old.status then
    new.inspected_by := old.inspected_by;
    new.inspected_at := old.inspected_at;
    new.result_comment := old.result_comment;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_risc_guard_update on risc_requests;
create trigger trg_risc_guard_update before update on risc_requests
  for each row execute function public.guard_risc_update();

create or replace function public.guard_ncr_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.status = old.status then
    new.corrective_by := old.corrective_by;
    new.corrective_at := old.corrective_at;
    new.root_cause := old.root_cause;
    new.corrective_action := old.corrective_action;
    new.preventive_action := old.preventive_action;
    new.closed_by := old.closed_by;
    new.closed_at := old.closed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ncr_guard_update on ncr_reports;
create trigger trg_ncr_guard_update before update on ncr_reports
  for each row execute function public.guard_ncr_update();

-- ── inspect_risc: + module gate + server-enforced fail-comment ────────────────
create or replace function public.inspect_risc(p_id uuid, p_result text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_result not in ('pass','fail') then raise exception '無效結果'; end if;
  if p_result = 'fail' and coalesce(trim(p_comment), '') = '' then raise exception '不通過時請填寫備註'; end if;
  select project_id, status into v_project, v_status from risc_requests where id = p_id;
  if v_project is null then raise exception '找不到檢查申請'; end if;
  if not project_module_enabled(v_project, 'risc') then raise exception 'RISC 模組未啟用'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then raise exception '只有管理員 / PM / 總承建商可以檢查驗收'; end if;
  if v_status <> 'submitted' then raise exception '此申請並非待檢查狀態'; end if;
  update risc_requests
     set status = case when p_result = 'pass' then 'passed' else 'failed' end,
         inspected_by = v_uid, inspected_at = now(), result_comment = p_comment
   where id = p_id;
end;
$$;
grant execute on function public.inspect_risc(uuid, text, text) to authenticated;

-- ── cancel_risc: + module gate ────────────────────────────────────────────────
create or replace function public.cancel_risc(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_raiser uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status, raised_by into v_project, v_status, v_raiser from risc_requests where id = p_id;
  if v_raiser is null then raise exception '找不到檢查申請'; end if;
  if not project_module_enabled(v_project, 'risc') then raise exception 'RISC 模組未啟用'; end if;
  if not (v_raiser = v_uid or exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')) then
    raise exception '只有提出人或管理員可以取消';
  end if;
  if v_status <> 'submitted' then raise exception '已檢查的申請不可取消'; end if;
  update risc_requests set status = 'cancelled' where id = p_id;
end;
$$;
grant execute on function public.cancel_risc(uuid) to authenticated;

-- ── revise_cd: FOR UPDATE (atomic) + dup-revision guard + module gate ─────────
create or replace function public.revise_cd(p_id uuid, p_revision text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_row controlled_documents%rowtype; v_uid uuid := auth.uid(); v_new uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if coalesce(trim(p_revision), '') = '' then raise exception '請輸入版本'; end if;
  -- FOR UPDATE serialises concurrent revisions on this document; the loser re-reads
  -- status='superseded' and is rejected → exactly one new 'current' row.
  select * into v_row from controlled_documents where id = p_id for update;
  if v_row.id is null then raise exception '找不到受控文件'; end if;
  if not project_module_enabled(v_row.project_id, 'controlled_docs') then raise exception '受控文件模組未啟用'; end if;
  if not can_edit_project_progress(v_uid, v_row.project_id) then raise exception '沒有權限發出新版本'; end if;
  if v_row.status <> 'current' then raise exception '只可以從生效版本發出新版本'; end if;
  if v_row.revision = p_revision then raise exception '新版本與現有版本相同，請輸入不同版本號'; end if;
  update controlled_documents set status = 'superseded' where id = p_id;
  insert into controlled_documents (project_id, number, title, doc_category, revision, status, holders, notes, issued_by)
  values (v_row.project_id, v_row.number, v_row.title, v_row.doc_category, p_revision, 'current', v_row.holders, p_note, v_uid)
  returning id into v_new;
  return v_new;
end;
$$;
grant execute on function public.revise_cd(uuid, text, text) to authenticated;

-- ── withdraw_cd: + status precondition (current only) + module gate ───────────
create or replace function public.withdraw_cd(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_status text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '未登入'; end if;
  select project_id, status into v_project, v_status from controlled_documents where id = p_id;
  if v_project is null then raise exception '找不到受控文件'; end if;
  if not project_module_enabled(v_project, 'controlled_docs') then raise exception '受控文件模組未啟用'; end if;
  if not (
    exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    or exists (select 1 from projects where id = v_project and v_uid = any(assigned_pm_ids))
    or exists (select 1 from project_members where project_id = v_project and user_id = v_uid
               and status = 'approved' and role in ('pm','main_contractor'))
  ) then raise exception '只有管理員 / PM / 總承建商可以撤回受控文件'; end if;
  if v_status <> 'current' then raise exception '只可以撤回生效中的版本'; end if;
  update controlled_documents set status = 'withdrawn' where id = p_id;
end;
$$;
grant execute on function public.withdraw_cd(uuid) to authenticated;

-- ── [HIGH backstop] partial unique index: one 'current' per (project, number) ─
create unique index if not exists uq_cd_current
  on controlled_documents (project_id, number) where status = 'current';

-- =============================================================
-- Post-apply verification (execute, not source):
--   select count(*) from pg_trigger where tgname in ('trg_risc_guard_update','trg_ncr_guard_update'); -> 2
--   select indexname from pg_indexes where indexname='uq_cd_current';   -> 1 row
--   -- inspect_risc('<submitted>','fail','') -> raises 不通過時請填寫備註.
--   -- revise_cd twice quickly on one current doc -> 2nd raises (FOR UPDATE) OR the
--   --   unique index rejects the 2nd insert; exactly one 'current' remains.
--   -- a raiser direct UPDATE setting inspected_by while status='submitted' -> the
--   --   guard reverts inspected_by to NULL (forge neutralised).
-- =============================================================
