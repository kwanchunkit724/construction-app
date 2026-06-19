-- =============================================================
-- v99-daily-brief-rpc.sql — AI 站長「每日概況」(daily brief)
-- =============================================================
-- One SECURITY DEFINER RPC that the ai-assistant Edge Function calls (as the
-- user, via supabase.rpc) to assemble a single jsonb "今日工地概況":
--
--   at_risk_no_method_statement — leaf progress_items that have NO linked
--                                  method-statement document (dispute risk:
--                                  工序未有施工方案). Falls back to "leaf items
--                                  with ZERO linked documents" when the
--                                  documents table is absent.
--   open_issues                 — count + a few open, non-quick issues.
--   expiring_ptws               — active permits whose expires_at (= valid_to)
--                                  is within the next 3 days.
--   late_materials              — ordered-but-not-arrived materials past their
--                                  planned arrival date.
--   pending_approvals           — document versions awaiting review (submitted).
--
-- DESIGN NOTES
--  * Gated by can_view_project(auth.uid(), p_project_id) — returns {} when the
--    caller cannot see the project (mirrors the RLS ceiling the rest of the AI
--    tools already respect; v3-progress-schema.sql:33).
--  * SECURITY DEFINER so a single round-trip can read across documents / issues
--    / permits / materials without N RLS-bounded sub-queries; the project gate
--    above is the authorization wall.
--  * GRACEFUL DEGRADATION: every source is wrapped in a to_regclass() existence
--    check. If a table doesn't exist on this deployment (e.g. permits_to_work /
--    materials / documents not yet migrated), that key is simply OMITTED from
--    the result jsonb rather than raising — so the function is forward/backward
--    compatible across schema versions.
--  * Each list is capped at 10 rows for token economy on the AI side.
--  * Additive + idempotent (create or replace). No table/RLS changes.
--
-- ASSUMED SCHEMA (verify before deploy — see report):
--   progress_items(id, project_id, parent_id, code, title)         v3
--   documents(id, project_id, progress_item_id, document_type)     v40
--     document_type includes 'method_statement'
--   document_versions(id, document_id, status)  status 'submitted' = 待審  v40
--   issues(id, project_id, issue_no, title, status, is_quick)      v4 + v47 + v93
--   permits_to_work(id, project_id, number, ptw_type, status, expires_at)  v10
--     expires_at is the "valid_to" column; status 'active'
--   materials(id, project_id, name, unit, qty_needed, qty_arrived,
--             status, planned_arrival_at)  status 'arrived' = received  v11
-- =============================================================

create or replace function get_daily_brief(p_project_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_chunk  jsonb;
  v_count  int;
begin
  -- Authorization wall: the AI may only brief on a project the human can see.
  if not can_view_project(auth.uid(), p_project_id) then
    return '{}'::jsonb;
  end if;

  -- ── 1. 未有施工方案 (method statement) 的工序 ────────────────────
  -- Leaf progress items (no children) with NO linked method_statement document.
  -- If the documents table is absent on this deployment, approximate as leaf
  -- items with ZERO linked documents of any type.
  if to_regclass('public.progress_items') is not null then
    if to_regclass('public.documents') is not null then
      select coalesce(jsonb_agg(t), '[]'::jsonb)
        into v_chunk
      from (
        select pi.id, pi.code, pi.title
        from progress_items pi
        where pi.project_id = p_project_id
          and not exists (                       -- leaf only
            select 1 from progress_items c where c.parent_id = pi.id
          )
          and not exists (                       -- no linked method statement
            select 1 from documents d
            where d.progress_item_id = pi.id
              and d.document_type = 'method_statement'
          )
        order by pi.code
        limit 10
      ) t;
    else
      select coalesce(jsonb_agg(t), '[]'::jsonb)
        into v_chunk
      from (
        select pi.id, pi.code, pi.title
        from progress_items pi
        where pi.project_id = p_project_id
          and not exists (
            select 1 from progress_items c where c.parent_id = pi.id
          )
        order by pi.code
        limit 10
      ) t;
    end if;
    v_result := v_result || jsonb_build_object('at_risk_no_method_statement', v_chunk);
  end if;

  -- ── 2. 待處理問題 (open, non-quick issues) ──────────────────────
  if to_regclass('public.issues') is not null then
    select count(*) into v_count
    from issues i
    where i.project_id = p_project_id
      and i.status = 'open'
      and coalesce(i.is_quick, false) = false;

    select coalesce(jsonb_agg(t), '[]'::jsonb)
      into v_chunk
    from (
      select i.issue_no, i.title
      from issues i
      where i.project_id = p_project_id
        and i.status = 'open'
        and coalesce(i.is_quick, false) = false
      order by i.created_at desc
      limit 10
    ) t;

    v_result := v_result || jsonb_build_object(
      'open_issues', jsonb_build_object('count', v_count, 'items', v_chunk)
    );
  end if;

  -- ── 3. 即將到期工作許可證 (PTW expiring within 3 days) ───────────
  -- expires_at is the permit's valid_to; only active permits can expire.
  if to_regclass('public.permits_to_work') is not null then
    select coalesce(jsonb_agg(t), '[]'::jsonb)
      into v_chunk
    from (
      select p.id, p.number, p.ptw_type, p.expires_at
      from permits_to_work p
      where p.project_id = p_project_id
        and p.status = 'active'
        and p.expires_at is not null
        and p.expires_at >= now()
        and p.expires_at <= now() + interval '3 days'
      order by p.expires_at asc
      limit 10
    ) t;
    v_result := v_result || jsonb_build_object('expiring_ptws', v_chunk);
  end if;

  -- ── 4. 過期未到物料 (ordered but not arrived, past planned date) ─
  if to_regclass('public.materials') is not null then
    select coalesce(jsonb_agg(t), '[]'::jsonb)
      into v_chunk
    from (
      select m.id, m.name, m.unit, m.qty_needed, m.qty_arrived, m.planned_arrival_at
      from materials m
      where m.project_id = p_project_id
        and m.status <> 'arrived'
        and m.planned_arrival_at is not null
        and m.planned_arrival_at < now()
      order by m.planned_arrival_at asc
      limit 10
    ) t;
    v_result := v_result || jsonb_build_object('late_materials', v_chunk);
  end if;

  -- ── 5. 待審文件 (document versions awaiting review) ──────────────
  if to_regclass('public.documents') is not null
     and to_regclass('public.document_versions') is not null then
    select coalesce(jsonb_agg(t), '[]'::jsonb)
      into v_chunk
    from (
      select d.id as document_id, d.title, d.doc_number, d.document_type, dv.id as version_id
      from document_versions dv
      join documents d on d.id = dv.document_id
      where d.project_id = p_project_id
        and dv.status = 'submitted'
      order by dv.submitted_at asc nulls last
      limit 10
    ) t;
    v_result := v_result || jsonb_build_object('pending_approvals', v_chunk);
  end if;

  return v_result;
end;
$$;

grant execute on function get_daily_brief(uuid) to authenticated;

-- =============================================================
-- Post-apply verification (EXECUTE, not source):
--   -- as a project member:   select get_daily_brief('<project_uuid>');
--   --   -> jsonb with the keys above; at_risk_no_method_statement lists leaf
--   --      工序 without a method_statement doc.
--   -- as a NON-member:        select get_daily_brief('<project_uuid>');  -> {}
--   -- on a deployment missing permits_to_work/materials -> those keys absent,
--   --   no error.
--   select proname, prosecdef from pg_proc where proname = 'get_daily_brief';  -> secdef t
-- =============================================================
