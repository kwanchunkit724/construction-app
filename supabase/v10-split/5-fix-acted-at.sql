-- =============================================================
-- v10-split/5-fix-acted-at.sql — Hot-fix for Plan 03-02/03-05 bug
-- =============================================================
-- Both close_out_ptw (v10-ptw-schema.sql §13) and record_ptw_signoff
-- (v10-split/4) referenced approvals.acted_at — column does not exist
-- on approvals (Phase 2 uses created_at). Functions compiled fine but
-- would raise at first invocation.
--
-- Re-create both with correct column.
-- =============================================================

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
  insert into approvals (doc_type, doc_id, step_order, action_type, actor_id, reason)
    values ('ptw', p_ptw_id,
            jsonb_array_length(coalesce(v_ptw.chain_snapshot, '[]'::jsonb)),
            'approve', v_uid, '完工關閉');
  insert into permit_signoffs (approval_id, ptw_id, signature_b64)
    select id, p_ptw_id, p_signature_b64
      from approvals
     where doc_id = p_ptw_id and actor_id = v_uid
     order by created_at desc limit 1;
  update permits_to_work set status='closed_out', closed_out_at=now() where id=p_ptw_id;
end;
$$;
grant execute on function close_out_ptw(uuid, text) to authenticated;

create or replace function record_ptw_signoff(
  p_ptw_id uuid,
  p_signature_b64 text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_approval_id uuid;
  v_signoff_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_signature_b64 is null or length(p_signature_b64) < 100 then
    raise exception '需要簽名';
  end if;
  select a.id
    into v_approval_id
    from approvals a
   where a.doc_type = 'ptw'
     and a.doc_id = p_ptw_id
     and a.actor_id = v_uid
     and not exists (select 1 from permit_signoffs s where s.approval_id = a.id)
   order by a.created_at desc
   limit 1;
  if v_approval_id is null then
    raise exception '找不到對應嘅簽核紀錄 — 請先批准呢張工作許可證';
  end if;
  insert into permit_signoffs (approval_id, ptw_id, signature_b64)
  values (v_approval_id, p_ptw_id, p_signature_b64)
  returning id into v_signoff_id;
  return v_signoff_id;
end;
$$;
revoke all on function record_ptw_signoff(uuid, text) from public;
grant execute on function record_ptw_signoff(uuid, text) to authenticated;

-- =============================================================
-- Verify:
--   select prosrc like '%created_at%' as ok, prosrc like '%acted_at%' as still_bad
--     from pg_proc where proname='close_out_ptw';
--   -- expect: ok=true, still_bad=false
-- =============================================================
