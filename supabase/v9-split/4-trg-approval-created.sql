-- =============================================================
-- v9-split/4-trg-approval-created.sql
-- Shared chain-advance trigger consumed by SI + VO + (future PTW)
-- =============================================================
-- Fires AFTER INSERT on approvals. Routes by doc_type to update
-- site_instructions or variation_orders. Handles all 6 action_types
-- per D-03: approve, approve_with_edits, request_revision, reject,
-- admin_override, delegate. Fan-outs push to the next step's
-- recipients via push_dispatcher (Plan 02-01).
--
-- VO branch is gated by to_regclass('public.variation_orders') so
-- this file can apply BEFORE Plan 02-06 ships VO. The trigger
-- short-circuits VO rows until that table lands.
--
-- PTW handling is deferred to Phase 3 (returns no-op here).
--
-- Lesson from Plan 02-01 hot-fix: any function with forward table
-- refs must use plpgsql + EXECUTE — language sql resolves table
-- refs at CREATE-FUNCTION parse time. This function uses EXECUTE
-- for the VO branch for that reason.
-- =============================================================

drop trigger if exists trg_approval_created on approvals;
drop function if exists dispatch_after_approval() cascade;

create or replace function dispatch_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_creator uuid;
  v_chain jsonb;
  v_current_step int;
  v_new_step int;
  v_chain_len int;
  v_number text;
  v_next_role text;
  v_optional uuid;
  v_recipients uuid[];
  v_holder uuid;
  v_payload jsonb;
  v_doc_label text := case new.doc_type
                        when 'si' then '工地指令'
                        when 'vo' then '變更指令'
                        else '文件'
                      end;
begin
  -- ── Load parent doc row ────────────────────────────────────
  if new.doc_type = 'si' then
    select project_id, created_by, chain_snapshot, current_step, number
      into v_project_id, v_creator, v_chain, v_current_step, v_number
      from site_instructions where id = new.doc_id;
  elsif new.doc_type = 'vo' then
    -- VO table lands in Plan 02-06; short-circuit until then.
    if to_regclass('public.variation_orders') is null then
      return new;
    end if;
    execute 'select project_id, created_by, chain_snapshot, current_step, number
               from variation_orders where id = $1'
      into v_project_id, v_creator, v_chain, v_current_step, v_number
      using new.doc_id;
  else
    -- ptw handled in Phase 3
    return new;
  end if;

  if v_chain is null then
    return new;
  end if;
  v_chain_len := jsonb_array_length(v_chain);

  -- ── delegate: no chain advance (delegation rows live elsewhere) ──
  if new.action_type = 'delegate' then
    return new;
  end if;

  -- ── request_revision: reset to step 0; push to creator ─────
  if new.action_type = 'request_revision' then
    if new.doc_type = 'si' then
      update site_instructions
         set status = 'revision_requested',
             current_step = 0
       where id = new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status = $1, current_step = 0 where id = $2'
        using 'revision_requested', new.doc_id;
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number, '') || ' 已退回',
      'content_zh', '請依意見修訂後重新提交',
      'deep_link',  '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- ── reject: terminal; push to creator ─────────────────────
  if new.action_type = 'reject' then
    if new.doc_type = 'si' then
      update site_instructions set status = 'rejected' where id = new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status = $1 where id = $2'
        using 'rejected', new.doc_id;
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number, '') || ' 已被拒絕',
      'content_zh', '請查看拒絕原因',
      'deep_link',  '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- ── approve / approve_with_edits / admin_override → advance ──
  v_new_step := v_current_step + 1;

  if v_new_step >= v_chain_len then
    -- Chain completed → lock
    if new.doc_type = 'si' then
      update site_instructions
         set status = 'locked',
             locked_at = now(),
             current_step = v_new_step
       where id = new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status = $1, locked_at = now(), current_step = $2 where id = $3'
        using 'locked', v_new_step, new.doc_id;
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number, '') || ' 已鎖定',
      'content_zh', '所有審批已完成',
      'deep_link',  '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- ── Advance to next step ─────────────────────────────────
  if new.doc_type = 'si' then
    update site_instructions
       set current_step = v_new_step,
           status = 'in_review'
     where id = new.doc_id;
  elsif new.doc_type = 'vo' then
    execute 'update variation_orders set current_step = $1, status = $2 where id = $3'
      using v_new_step, 'in_review', new.doc_id;
  end if;

  v_next_role := v_chain -> v_new_step ->> 'required_role';
  v_optional  := nullif(v_chain -> v_new_step ->> 'optional_user_id', '')::uuid;

  if v_optional is not null then
    v_recipients := array[v_optional];
  else
    v_recipients := array(select active_role_holders(v_project_id, v_next_role));
  end if;

  v_payload := jsonb_build_object(
    'heading_zh', v_doc_label || ' ' || coalesce(v_number, '') || ' 需要你批准',
    'content_zh', '請查看詳情',
    'deep_link',  '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
  );

  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;

  return new;
end;
$$;

create trigger trg_approval_created
  after insert on approvals
  for each row execute function dispatch_after_approval();

-- =============================================================
-- End of v9-split/4-trg-approval-created.sql
-- Post-apply verification:
--   select tgname from pg_trigger where tgname = 'trg_approval_created';
--   select proname, prosecdef from pg_proc where proname = 'dispatch_after_approval';
-- =============================================================
