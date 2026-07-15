-- =============================================================
-- v78-withdraw-drawing-version-atomic.sql
-- =============================================================
-- FUNCTION-REVIEW fix #3. DrawingsContext.withdrawVersion did the withdraw +
-- current_version_id rebind as THREE separate client statements (lookup → mark
-- withdrawn → pick+repoint). A concurrent upload of the SAME drawing between
-- steps could make the rebind repoint 'current' to an older version (lost-update
-- race; self-healing but a transiently-wrong register). DocumentsContext already
-- avoids this via the atomic withdraw_document_version RPC; drawings predated it.
--
-- This adds the matching atomic RPC: in ONE transaction, mark the version
-- withdrawn and (if it was current) rebind drawings.current_version_id to the
-- highest non-withdrawn version. SECURITY DEFINER with an in-body uploader-or-
-- admin gate (mirrors the v8 "Uploader or admin withdraws" RLS). No step-up
-- (drawings withdraw never had one — behaviour parity; atomicity is the fix).
-- =============================================================

create or replace function withdraw_drawing_version(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_drawing_id uuid;
  v_uploaded_by uuid;
  v_is_admin boolean;
  v_was_current boolean;
  v_next_current uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;

  select dv.drawing_id, dv.uploaded_by
    into v_drawing_id, v_uploaded_by
    from drawing_versions dv
   where dv.id = p_version_id;
  if v_drawing_id is null then
    raise exception '找不到版本';
  end if;

  select exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    into v_is_admin;

  -- Authorisation mirrors the v8 "Uploader or admin withdraws" rule.
  -- NULL-safe: if uploaded_by is NULL (uploader deleted), only an admin may withdraw.
  if (v_uploaded_by is distinct from v_uid) and not v_is_admin then
    raise exception '只有上載者或管理員可以撤回';
  end if;

  select (current_version_id = p_version_id) into v_was_current
    from drawings where id = v_drawing_id;

  update drawing_versions
     set status = 'withdrawn', withdrawn_at = now()
   where id = p_version_id;
  if not found then
    raise exception '找不到版本';
  end if;

  -- Rebind the current pointer atomically if we just withdrew it.
  if coalesce(v_was_current, false) then
    select id into v_next_current
      from drawing_versions
     where drawing_id = v_drawing_id
       and status <> 'withdrawn'
     order by version_no desc
     limit 1;

    update drawings
       set current_version_id = v_next_current,
           updated_at = now()
     where id = v_drawing_id;
  end if;
end;
$$;

revoke all on function withdraw_drawing_version(uuid) from public;
grant execute on function withdraw_drawing_version(uuid) to authenticated;

-- Verify (execute): function exists + grant to authenticated; client calls
-- supabase.rpc('withdraw_drawing_version', { p_version_id }) instead of 3 statements.
