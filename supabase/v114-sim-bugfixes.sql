-- =============================================================
-- v114-sim-bugfixes.sql
-- Fixes from 2026-10-12 production lifecycle simulation:
--   C1  VO total stuck at 0 — RLS WITH CHECK blocked sync_vo_total
--       when attaching current_version_id (BEFORE trigger changes
--       total_amount_cents; policy required it unchanged).
--   C2  SI/VO push 400 from OneSignal — push_dispatcher sent
--       contents.en = '' when payload lacked content_en.
--   H1  Assigned PM could not add 工序 — next_progress_code only
--       checked project_members, not assigned_pm_ids /
--       can_manage_project_progress.
--   H3  Owner / safety_officer / main_contractor saw 0 progress
--       items — progress_is_supervisor was narrowed in v102 and
--       excluded them. Restore view-all for those roles; keep
--       subcontractor / worker assignment-scoped.
--   H4  Digests / pushes fan-out to ALL global admins via
--       active_role_holders — scope to project members +
--       assigned PMs; admins only if they are members / PMs.
--   Also: submit_vo refuses submit without an attached version
--         (prevents locking a HK$0 VO with no version).
-- Idempotent.
-- =============================================================

-- ── C1: Creator UPDATE policy — allow total sync from version ─
drop policy if exists "Creator updates own draft VO" on variation_orders;
create policy "Creator updates own draft VO"
  on variation_orders for update to authenticated
  using (can_view_vo(auth.uid(), id))
  with check (
    created_by = auth.uid()
    and status = 'draft'
    and chain_snapshot is null
    and (
      -- Ordinary draft field edits: total must stay put (clients cannot
      -- forge amounts).
      total_amount_cents is not distinct from (
        select v.total_amount_cents from variation_orders v where v.id = variation_orders.id
      )
      -- Attaching current_version_id: sync_vo_total BEFORE trigger copies
      -- the version payload total onto the row. Allow that exact match.
      or (
        current_version_id is not null
        and total_amount_cents is not distinct from (
          select (payload->>'total_amount_cents')::bigint
            from vo_versions
           where id = current_version_id
        )
      )
    )
  );

-- Refuse submit without a version (stops locking empty / HK$0 orphans).
-- Zero-amount VOs with a real version (empty line items) are still allowed.
create or replace function submit_vo(p_vo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vo variation_orders%rowtype;
  v_si_locked timestamptz;
  v_snapshot jsonb;
  v_first_role text;
  v_first_optional uuid;
  v_holder uuid;
  v_payload jsonb;
  v_recipients uuid[];
begin
  select * into v_vo from variation_orders where id = p_vo_id for update;
  if not found then raise exception 'VO % not found', p_vo_id; end if;
  if v_vo.created_by <> auth.uid() then raise exception '只有提交人可以提交此變更指令'; end if;
  if v_vo.status not in ('draft','revision_requested') then
    raise exception '變更指令不能從狀態 % 提交', v_vo.status;
  end if;
  if v_vo.current_version_id is null then
    raise exception '請先儲存變更內容再提交（未有版本）';
  end if;
  if v_vo.si_id is not null then
    select locked_at into v_si_locked from site_instructions where id = v_vo.si_id;
    if v_si_locked is null then raise exception '所引用的工地指令尚未鎖定 (VO-01)'; end if;
  end if;
  select jsonb_agg(
           jsonb_build_object(
             'step_order', step_order,
             'required_role', required_role,
             'optional_user_id', optional_user_id
           ) order by step_order
         )
    into v_snapshot
    from approval_chain_steps
   where project_id = v_vo.project_id and doc_type = 'vo';
  if v_snapshot is null or jsonb_array_length(v_snapshot) = 0 then
    raise exception '此項目尚未配置變更指令審批鏈';
  end if;
  update variation_orders
     set chain_snapshot = v_snapshot,
         status = 'in_review',
         current_step = 0,
         submitted_at = coalesce(submitted_at, now())
   where id = p_vo_id;
  v_first_role := v_snapshot->0->>'required_role';
  v_first_optional := nullif(v_snapshot->0->>'optional_user_id', '')::uuid;
  v_payload := jsonb_build_object(
    'heading_zh', '新變更指令 ' || v_vo.number,
    'content_zh', '需要你批准',
    'heading_en', 'New VO ' || v_vo.number,
    'content_en', 'Needs your approval',
    'deep_link',  '/project/' || v_vo.project_id::text || '/vo/' || v_vo.id::text
  );
  if v_first_optional is not null then
    v_recipients := array[v_first_optional];
  else
    v_recipients := array(select active_role_holders(v_vo.project_id, v_first_role));
  end if;
  foreach v_holder in array v_recipients loop
    perform push_dispatcher(v_holder, v_payload);
  end loop;
end;
$$;

revoke all on function submit_vo(uuid) from public;
grant execute on function submit_vo(uuid) to authenticated;

-- ── C2: push_dispatcher — never send empty English content ────
create or replace function push_dispatcher(p_target uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_count int;
  v_rest_key text;
  v_app_id text;
  v_heading_en text;
  v_content_en text;
begin
  insert into notification_counters (user_id, hkt_date, count)
    values (p_target, v_today, 1)
    on conflict (user_id, hkt_date)
    do update set count = notification_counters.count + 1
    returning count into v_count;

  -- OneSignal requires non-empty English (or "any") content. Fall back to
  -- the Chinese strings, then a neutral English placeholder.
  v_heading_en := coalesce(
    nullif(p_payload->>'heading_en', ''),
    nullif(p_payload->>'heading_zh', ''),
    'Notification'
  );
  v_content_en := coalesce(
    nullif(p_payload->>'content_en', ''),
    nullif(p_payload->>'content_zh', ''),
    'Open the app for details'
  );

  if v_count <= 3 then
    select onesignal_rest_key, onesignal_app_id
      into v_rest_key, v_app_id
      from app_config limit 1;
    if v_app_id is null or v_rest_key is null then
      raise log 'OneSignal credentials not configured.';
      return;
    end if;
    perform net.http_post(
      url := 'https://api.onesignal.com/notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Basic ' || v_rest_key
      ),
      body := jsonb_build_object(
        'app_id', v_app_id,
        'include_aliases', jsonb_build_object('external_id', jsonb_build_array(p_target::text)),
        'target_channel', 'push',
        'headings', jsonb_build_object(
          'zh-Hant', coalesce(p_payload->>'heading_zh', v_heading_en),
          'en',      v_heading_en
        ),
        'contents', jsonb_build_object(
          'zh-Hant', coalesce(p_payload->>'content_zh', v_content_en),
          'en',      v_content_en
        ),
        'data', jsonb_build_object('deep_link', p_payload->>'deep_link')
      )
    );
  else
    insert into notification_digest (user_id, hkt_date, items_jsonb)
      values (p_target, v_today, jsonb_build_array(p_payload))
      on conflict (user_id, hkt_date)
      do update set items_jsonb = notification_digest.items_jsonb || excluded.items_jsonb;
  end if;
end;
$$;

revoke all on function push_dispatcher(uuid, jsonb) from authenticated, anon;

-- ── H4: active_role_holders — no global-admin fan-out ─────────
-- Admins who are assigned PMs or approved members of the project
-- still receive notifications via the other unions.
create or replace function active_role_holders(p_project_id uuid, p_required_role text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select unnest(assigned_pm_ids)
    from projects
   where id = p_project_id
     and p_required_role = 'pm'
  union
  select pm.user_id
    from project_members pm
   where pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
  union
  select d.delegate_to
    from delegations d
    join project_members pm
      on pm.user_id = d.user_id
     and pm.project_id = p_project_id
     and pm.status = 'approved'
     and pm.role = p_required_role
   where current_date between d.valid_from and d.valid_until;
$$;

-- ── H1: next_progress_code recognises assigned PM / managers ──
create or replace function next_progress_code(
  p_project_id uuid,
  p_zone_id text,
  p_parent_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_code text;
  v_max_suffix int;
  v_parent_pattern text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not can_manage_project_progress(auth.uid(), p_project_id) then
    raise exception 'not a member of this project';
  end if;

  if p_parent_id is null then
    select coalesce(max((regexp_match(code, '^(\d+)$'))[1]::int), 0)
      into v_max_suffix
      from progress_items
     where project_id = p_project_id
       and zone_id is not distinct from p_zone_id
       and parent_id is null
       and code ~ '^\d+$';
    return lpad((v_max_suffix + 1)::text, 2, '0');
  end if;

  select code into v_parent_code
    from progress_items
   where id = p_parent_id and project_id = p_project_id;
  if v_parent_code is null then
    raise exception 'parent item not found in this project';
  end if;

  v_parent_pattern := regexp_replace(v_parent_code, '([.\\-+*?()\[\]\\\\^$|])', '\\\\\\1', 'g');

  select coalesce(
           max((regexp_match(code, '^' || v_parent_pattern || '-(\d+)$'))[1]::int),
           0
         )
    into v_max_suffix
    from progress_items
   where parent_id = p_parent_id
     and code ~ ('^' || v_parent_pattern || '-\d+$');

  return v_parent_code || '-' || lpad((v_max_suffix + 1)::text, 2, '0');
end;
$$;

revoke all on function next_progress_code(uuid, text, uuid) from public;
grant execute on function next_progress_code(uuid, text, uuid) to authenticated;

-- ── H3: broaden progress view-all roles ───────────────────────
-- v102 excluded main_contractor (zone 工程師 noise). Lifecycle sim
-- showed 總承建商 / 業主 / 安全主任 all saw "0 個進度項目", which
-- blocks oversight. Restore view-all for those three; keep
-- subcontractor + subcontractor_worker assignment-scoped.
create or replace function progress_is_supervisor(p_uid uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_uid and global_role = 'admin')
    or exists (select 1 from projects p where p.id = p_project and p_uid = any(p.assigned_pm_ids))
    or exists (
      select 1 from project_members pm
      where pm.project_id = p_project
        and pm.user_id = p_uid
        and pm.status = 'approved'
        and pm.role in ('pm', 'general_foreman', 'main_contractor', 'owner', 'safety_officer')
    );
$$;

grant execute on function progress_is_supervisor(uuid, uuid) to authenticated;

-- =============================================================
-- End of v114-sim-bugfixes.sql
-- =============================================================
