-- =============================================================
-- v10-split/3-trg-approval-ptw-branch.sql — Phase 3 Plan 03-02
-- =============================================================
-- Replaces dispatch_after_approval to add 'ptw' branch.
-- Original (v9-split/4) handled 'si' + 'vo' + delegate / revision /
-- reject / approve+advance. This drop-in replacement adds:
--   * 'ptw' load-parent branch (reads permits_to_work)
--   * On chain-complete for ptw: call activate_ptw(doc_id) instead
--     of plain 'locked'. activate_ptw sets status='active', mints
--     activated_at, computes expires_at = 23:59 HKT today.
--   * 'safety_officer' as a valid required_role in active_role_holders
--     (already supported via the v10-safety-officer-role.sql CHECK
--     extension; helper uses role string from chain_snapshot).
--
-- Other branches (si / vo) unchanged.
--
-- IDEMPOTENT: drop + create function.
-- =============================================================

drop trigger if exists trg_approval_created on approvals;
drop function if exists dispatch_after_approval() cascade;

create or replace function dispatch_after_approval()
returns trigger language plpgsql security definer set search_path = public
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
                        when 'ptw' then '工作許可證'
                        else '文件'
                      end;
begin
  -- ── Load parent doc row ──
  if new.doc_type = 'si' then
    select project_id, created_by, chain_snapshot, current_step, number
      into v_project_id, v_creator, v_chain, v_current_step, v_number
      from site_instructions where id = new.doc_id;
  elsif new.doc_type = 'vo' then
    if to_regclass('public.variation_orders') is null then return new; end if;
    execute 'select project_id, created_by, chain_snapshot, current_step, number
               from variation_orders where id = $1'
      into v_project_id, v_creator, v_chain, v_current_step, v_number
      using new.doc_id;
  elsif new.doc_type = 'ptw' then
    if to_regclass('public.permits_to_work') is null then return new; end if;
    execute 'select project_id, created_by, chain_snapshot, current_step, number
               from permits_to_work where id = $1'
      into v_project_id, v_creator, v_chain, v_current_step, v_number
      using new.doc_id;
  else
    return new;
  end if;

  if v_chain is null then return new; end if;
  v_chain_len := jsonb_array_length(v_chain);

  -- delegate: no chain advance
  if new.action_type = 'delegate' then return new; end if;

  -- request_revision: reset to step 0
  if new.action_type = 'request_revision' then
    if new.doc_type = 'si' then
      update site_instructions set status='revision_requested', current_step=0 where id=new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status=$1, current_step=0 where id=$2'
        using 'revision_requested', new.doc_id;
    elsif new.doc_type = 'ptw' then
      execute 'update permits_to_work set status=$1, current_step=0 where id=$2'
        using 'revision_requested', new.doc_id;
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number,'') || ' 已退回',
      'content_zh', '請依意見修訂後重新提交',
      'deep_link', '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- reject: terminal
  if new.action_type = 'reject' then
    if new.doc_type = 'si' then
      update site_instructions set status='rejected' where id=new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status=$1 where id=$2' using 'rejected', new.doc_id;
    elsif new.doc_type = 'ptw' then
      execute 'update permits_to_work set status=$1 where id=$2' using 'rejected', new.doc_id;
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number,'') || ' 已被拒絕',
      'content_zh', '請查看拒絕原因',
      'deep_link', '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- approve / approve_with_edits / admin_override → advance
  v_new_step := v_current_step + 1;

  if v_new_step >= v_chain_len then
    -- Chain completed
    if new.doc_type = 'si' then
      update site_instructions
         set status='locked', locked_at=now(), current_step=v_new_step
       where id=new.doc_id;
    elsif new.doc_type = 'vo' then
      execute 'update variation_orders set status=$1, locked_at=now(), current_step=$2 where id=$3'
        using 'locked', v_new_step, new.doc_id;
    elsif new.doc_type = 'ptw' then
      -- PTW: activate (sets status, activated_at, expires_at HKT 23:59).
      -- current_step already advanced inside activate_ptw via separate update.
      execute 'update permits_to_work set current_step=$1 where id=$2'
        using v_new_step, new.doc_id;
      perform activate_ptw(new.doc_id);
    end if;
    v_payload := jsonb_build_object(
      'heading_zh', v_doc_label || ' ' || coalesce(v_number,'') ||
                    case when new.doc_type='ptw' then ' 已激活' else ' 已鎖定' end,
      'content_zh', case when new.doc_type='ptw'
                          then '工作許可證至今晚 23:59 有效'
                          else '所有審批已完成' end,
      'deep_link', '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
    );
    perform push_dispatcher(v_creator, v_payload);
    return new;
  end if;

  -- Advance to next step
  if new.doc_type = 'si' then
    update site_instructions set current_step=v_new_step, status='in_review' where id=new.doc_id;
  elsif new.doc_type = 'vo' then
    execute 'update variation_orders set current_step=$1, status=$2 where id=$3'
      using v_new_step, 'in_review', new.doc_id;
  elsif new.doc_type = 'ptw' then
    execute 'update permits_to_work set current_step=$1, status=$2 where id=$3'
      using v_new_step, 'in_review', new.doc_id;
  end if;

  v_next_role := v_chain -> v_new_step ->> 'required_role';
  v_optional := nullif(v_chain -> v_new_step ->> 'optional_user_id','')::uuid;
  if v_optional is not null then
    v_recipients := array[v_optional];
  else
    v_recipients := array(select active_role_holders(v_project_id, v_next_role));
  end if;
  v_payload := jsonb_build_object(
    'heading_zh', v_doc_label || ' ' || coalesce(v_number,'') || ' 需要你簽核',
    'content_zh', '請查看詳情',
    'deep_link', '/project/' || v_project_id::text || '/' || new.doc_type || '/' || new.doc_id::text
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
