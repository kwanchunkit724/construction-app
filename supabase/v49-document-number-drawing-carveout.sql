-- =============================================================
-- v49-document-number-drawing-carveout.sql
-- =============================================================
-- Backlog S22. next_document_number (v40-split/4-rpcs.sql) gates only
-- can_upload_document, so a 判頭/老總 can burn a DWG- counter number over
-- raw REST even though the documents INSERT policy + supersede RPC both
-- enforce can_upload_drawing (D-25) for drawing-type rows. The client UI
-- already pre-blocks; this closes the REST hole and stops gaps in the
-- official DWG sequence.
--
-- v40 body verbatim + ONE guard, placed AFTER the can_upload_document
-- check and BEFORE the counter upsert/lock (a denied call must never
-- create or bump a counter row). Same signature -> plain create or
-- replace; grants unchanged. Idempotent.
-- =============================================================

create or replace function next_document_number(p_project_id uuid, p_type text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text;
  v_n int;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if not can_upload_document(v_uid, p_project_id) then
    raise exception '沒有權限產生文件編號';
  end if;

  -- S22: drawing-type number generation needs the stricter drawing gate
  -- (D-25 — 判頭/老總 may not issue drawings). Placed before any counter
  -- write so a denied call leaves the DWG sequence untouched.
  if p_type = 'drawing' and not can_upload_drawing(v_uid, p_project_id) then
    raise exception '沒有權限產生文件編號';
  end if;

  v_prefix := case p_type
    when 'material_submission' then 'MAT'
    when 'method_statement'    then 'MS'
    when 'drawing'             then 'DWG'
    when 'inspection'          then 'INS'
    when 'other'               then 'DOC'
    else null
  end;
  if v_prefix is null then
    raise exception '未知文件類型: %', p_type;
  end if;

  insert into document_counters (project_id, document_type, next_no)
  values (p_project_id, p_type, 1)
  on conflict (project_id, document_type) do nothing;

  select next_no into v_n
    from document_counters
   where project_id = p_project_id and document_type = p_type
   for update;

  update document_counters
     set next_no = v_n + 1
   where project_id = p_project_id and document_type = p_type;

  return v_prefix || '-' || lpad(v_n::text, 3, '0');
end;
$$;
revoke all on function next_document_number(uuid, text) from public;
grant execute on function next_document_number(uuid, text) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- 判頭: drawing-type -> error, counter untouched:
--   select next_document_number('<project>','drawing');   -- expect ERROR 沒有權限產生文件編號
--   -- 判頭: material_submission -> still works:
--   select next_document_number('<project>','material_submission');  -- expect MAT-xxx
--   -- PM/main_contractor: drawing-type -> DWG-xxx
-- =============================================================
