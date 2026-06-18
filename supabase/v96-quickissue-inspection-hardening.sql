-- =============================================================
-- v96-quickissue-inspection-hardening.sql  (post-review fixes for v93/v94/v95)
-- =============================================================
-- Adversarial review (commit e5be675) confirmed 1 high + 4 distinct med:
--  [HIGH] issue_no FORGE at INSERT: trg_assign_issue_no (v93) early-returns on a
--    client-sent issue_no BEFORE the is_quick check, and no BEFORE INSERT guard
--    scrubs it — a worker can POST is_quick=true/false with issue_no=42, occupying
--    or duplicating a formal dispute number and colliding with the unique index.
--    FIX: scrub issue_no to NULL for ALL authenticated callers (the counter, not
--    the client, owns it; service-role/backfill with auth.uid() NULL keeps theirs).
--  [med] 巡查 closed-round marks are still PATCH/DELETE-able via REST (no guard) →
--    evidence tampering after a round is sealed. FIX: BEFORE UPDATE/DELETE guard.
--  [med] markFloor non-atomic (snag committed before mark) + re-mark orphans the
--    prior fail-snag. FIX: a single atomic mark_inspection_floor() RPC that marks +
--    spawns/reuses/resolves the linked snag in one transaction.
--  [med] get_my_site_status doc_24h pill not module-gated. FIX: gate on 'documents'.
-- Idempotent. zh-HK.
-- =============================================================

-- ── [HIGH] issue_no is trigger-owned: scrub any client value on INSERT ──────────
create or replace function trg_assign_issue_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  -- Clients never own issue_no. Null it for authenticated callers so a forged
  -- number can't occupy/duplicate a formal slot; service-role (auth.uid() NULL,
  -- e.g. v47 backfill) keeps any explicit value.
  if auth.uid() is not null then new.issue_no := null; end if;
  if new.issue_no is not null then return new; end if;
  if new.is_quick then return new; end if;            -- 即時問題: no formal number yet
  insert into issue_counters (project_id) values (new.project_id)
    on conflict (project_id) do nothing;
  select next_no into v_n from issue_counters where project_id = new.project_id for update;
  update issue_counters set next_no = v_n + 1 where project_id = new.project_id;
  new.issue_no := v_n;
  return new;
end; $$;

-- ── [med] seal closed 巡查 rounds: block REST UPDATE/DELETE of their marks ───────
-- One guard for both events. Non-admin callers cannot mutate a mark whose round is
-- no longer 'open' (round NULL = parent being cascade-deleted → allowed), and
-- cannot move a mark across round/project or reassign its author.
create or replace function guard_inspection_mark_mutate() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round_status text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin') then
    return coalesce(new, old);
  end if;
  select status into v_round_status from inspection_rounds where id = coalesce(new.round_id, old.round_id);
  if v_round_status is not null and v_round_status <> 'open' then
    raise exception '此巡查已結束，不可再修改';
  end if;
  if tg_op = 'UPDATE' then
    new.round_id := old.round_id;
    new.project_id := old.project_id;
    new.marked_by := old.marked_by;
    return new;
  end if;
  return old;
end; $$;
drop trigger if exists trg_inspection_mark_guard_update on inspection_marks;
create trigger trg_inspection_mark_guard_update before update on inspection_marks
  for each row execute function guard_inspection_mark_mutate();
drop trigger if exists trg_inspection_mark_guard_delete on inspection_marks;
create trigger trg_inspection_mark_guard_delete before delete on inspection_marks
  for each row execute function guard_inspection_mark_mutate();

-- ── [med] atomic mark + snag reconciliation ─────────────────────────────────────
-- Replaces the client's spawn-then-delete-then-insert (non-atomic, orphans snags).
-- One transaction: validate (open + module + edit-right), reconcile the prior
-- mark's snag, replace the mark. fail → reuse the existing open snag or spawn a
-- new one; pass/na → resolve the prior open snag so it never dangles.
create or replace function mark_inspection_floor(
  p_round_id uuid, p_floor_label text, p_result text, p_note text, p_photos text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_round inspection_rounds%rowtype;
  v_existing inspection_marks%rowtype;
  v_role text; v_handler text; v_snag uuid; v_link uuid; v_mark uuid; v_title text;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_result not in ('pass','fail','na') then raise exception '無效結果'; end if;
  select * into v_round from inspection_rounds where id = p_round_id;
  if v_round.id is null then raise exception '找不到巡查'; end if;
  if not project_module_enabled(v_round.project_id, 'inspection') then raise exception '巡查模組未啟用'; end if;
  if v_round.status <> 'open' then raise exception '此巡查已結束，不可再標記'; end if;
  if not can_edit_project_progress(v_uid, v_round.project_id) then raise exception '沒有權限標記巡查'; end if;

  select * into v_existing from inspection_marks where round_id = p_round_id and floor_label = p_floor_label;

  v_role := coalesce(
    (select role from project_members where project_id = v_round.project_id and user_id = v_uid and status = 'approved' limit 1),
    (select global_role from user_profiles where id = v_uid));
  v_handler := case
    when v_role = 'subcontractor_worker' then 'subcontractor'
    when v_role = 'subcontractor' then 'main_contractor'
    else 'pm' end;
  v_title := '[巡查] ' || v_round.title || ' · ' || p_floor_label || ' 不合格';

  if p_result = 'fail' then
    if v_existing.id is not null and v_existing.result = 'fail' and v_existing.linked_issue_id is not null
       and exists (select 1 from issues where id = v_existing.linked_issue_id and is_quick and status = 'open') then
      -- reuse the existing open snag — refresh its content, no churn
      update issues set title = v_title, description = coalesce(p_note, ''), location = p_floor_label,
             photos = to_jsonb(p_photos), updated_at = now()
        where id = v_existing.linked_issue_id;
      v_link := v_existing.linked_issue_id;
    else
      insert into issues (project_id, reporter_id, reporter_role, title, description, location,
                          snag_type, photos, current_handler_role, status, is_quick)
      values (v_round.project_id, v_uid, v_role, v_title, coalesce(p_note, ''), p_floor_label,
              case v_round.category when 'leak' then 'leak' when 'defect' then 'finish' else 'other' end,
              to_jsonb(p_photos), v_handler, 'open', true)
      returning id into v_snag;
      insert into issue_comments (issue_id, author_id, action, body, to_role)
        values (v_snag, v_uid, 'reported', '', v_handler);
      v_link := v_snag;
    end if;
  else
    -- no longer failing → resolve the prior snag so it doesn't dangle open
    if v_existing.id is not null and v_existing.result = 'fail' and v_existing.linked_issue_id is not null then
      update issues set status = 'resolved', resolved_by = v_uid, resolved_at = now(), updated_at = now()
        where id = v_existing.linked_issue_id and status = 'open' and is_quick;
      insert into issue_comments (issue_id, author_id, action, body)
        select v_existing.linked_issue_id, v_uid, 'resolved', '巡查覆核已修正'
        where exists (select 1 from issues where id = v_existing.linked_issue_id);
    end if;
    v_link := null;
  end if;

  if v_existing.id is not null then
    delete from inspection_marks where id = v_existing.id;
  end if;
  insert into inspection_marks (round_id, project_id, floor_label, result, note, photos, linked_issue_id, marked_by)
    values (p_round_id, v_round.project_id, p_floor_label, p_result, p_note, p_photos, v_link, v_uid)
    returning id into v_mark;
  return v_mark;
end; $$;
grant execute on function mark_inspection_floor(uuid, text, text, text, text[]) to authenticated;

-- ── [med] Home doc_24h pill: gate on the documents module ───────────────────────
create or replace function public.get_my_site_status()
returns table (project_id uuid, daily_done boolean, progress_today boolean, doc_24h boolean)
language sql security definer stable set search_path = public as $$
  with v as (select (now() at time zone 'Asia/Hong_Kong')::date as today)
  select p.id,
    exists (select 1 from dailies d, v where d.project_id = p.id and d.user_id = auth.uid() and d.date = v.today),
    exists (select 1 from progress_history ph join progress_items pi on pi.id = ph.item_id, v
            where pi.project_id = p.id and ph.updated_by = auth.uid()
              and (ph.created_at at time zone 'Asia/Hong_Kong')::date = v.today),
    (project_module_enabled(p.id, 'documents') and (
       exists (select 1 from documents doc where doc.project_id = p.id and doc.created_at > now() - interval '24 hours')
       or exists (select 1 from drawings dr where dr.project_id = p.id and dr.created_at > now() - interval '24 hours')))
  from projects p
  where can_view_project(auth.uid(), p.id);
$$;
revoke all on function public.get_my_site_status() from public;
grant execute on function public.get_my_site_status() to authenticated;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   -- as a worker: insert issues(...,is_quick=true,issue_no=42) -> row lands with
--   --    issue_no NULL (forge scrubbed). formal insert with issue_no=42 -> NULL +
--   --    counter assigns the real next number.
--   select count(*) from pg_trigger where tgname in
--     ('trg_inspection_mark_guard_update','trg_inspection_mark_guard_delete');     -> 2
--   select count(*) from pg_proc where proname = 'mark_inspection_floor';          -> 1
--   -- PATCH a mark whose round is 'done' (non-admin) -> RAISES 此巡查已結束.
--   -- mark_inspection_floor fail then pass on same floor -> snag spawned then resolved.
-- =============================================================
