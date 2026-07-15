-- =============================================================
-- v10-split/4-record-ptw-signoff-rpc.sql — Phase 3 Plan 03-05
-- =============================================================
-- After submit_approval inserts the approvals row, the client calls
-- record_ptw_signoff to attach the signature_pad blob as a sidecar
-- permit_signoffs row. Sidecar must be SECURITY DEFINER because
-- permit_signoffs has 'with check (false)' INSERT policy.
--
-- The sidecar is keyed by (approval_id) UNIQUE so callers can't
-- silently overwrite an existing signature.
-- =============================================================

drop function if exists record_ptw_signoff(uuid, text);

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

  -- Find the most recent approval by this caller on this PTW that
  -- doesn't yet have a signoff sidecar.
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
-- Post-apply verification:
--   select proname, prosecdef from pg_proc where proname='record_ptw_signoff';
--   -- expect: 1 row, prosecdef=t
-- =============================================================
