-- =============================================================
-- v62-memory-graph-rls-parity.sql   (#4 fix — per-user progress visibility)
-- =============================================================
-- v61 gated memory_notes reads on can_view_project (project-level). But PROGRESS
-- visibility is FINER than project membership: a worker sees only their own /
-- delegated items + ancestors (the v27 contract, via get_visible_progress_items),
-- NOT every sibling. So memory_recall / graph_neighbors as written LEAK progress
-- notes a member can't otherwise see — and the AI 站長's recall_memory /
-- graph_neighbors tools would surface them (an RLS-parity / O4 violation).
--
-- FIX: re-create both read RPCs so PROGRESS-type notes additionally obey
-- get_visible_progress_items(project) for the caller. Other entity types
-- (issue / document / contact / project) are already project-level-visible in the
-- app (their tables gate on can_view_project), so they need no extra filter.
-- Idempotent (create or replace). No table/data change.
-- =============================================================

-- ── graph_neighbors — hide a progress focus/neighbour the caller can't see ─────
create or replace function graph_neighbors(p_note_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_etype text;
  v_eid uuid;
  v_focus jsonb;
  v_neighbors jsonb;
begin
  select project_id, entity_type, entity_id into v_project, v_etype, v_eid
    from memory_notes where id = p_note_id;
  if v_project is null then
    raise exception '找不到記憶節點';
  end if;
  if not can_view_project(v_uid, v_project) then
    raise exception '無權限查看此項目的記憶圖譜';
  end if;
  -- RLS parity: a progress focus note outside the caller's visible set is hidden.
  if v_etype = 'progress'
     and not exists (select 1 from get_visible_progress_items(v_project) gv where gv.id = v_eid) then
    raise exception '無權限查看此記憶節點';
  end if;

  select to_jsonb(f) into v_focus
  from (select id, entity_type, title, summary from memory_notes where id = p_note_id) f;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_neighbors
  from (
    -- outgoing: focus -> neighbour
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.to_note
    where l.from_note = p_note_id
      and (n.entity_type <> 'progress'
           or n.entity_id in (select gv.id from get_visible_progress_items(v_project) gv))
    union
    -- incoming: neighbour -> focus
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.from_note
    where l.to_note = p_note_id
      and (n.entity_type <> 'progress'
           or n.entity_id in (select gv.id from get_visible_progress_items(v_project) gv))
    limit 60
  ) x;

  return jsonb_build_object('note', v_focus, 'neighbors', v_neighbors);
end;
$$;
revoke all on function graph_neighbors(uuid) from public;
grant execute on function graph_neighbors(uuid) to authenticated;

-- ── memory_recall — progress notes obey per-user visibility ────────────────────
create or replace function memory_recall(p_project_id uuid, p_query text default null)
returns setof memory_notes
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pat text := '%' || coalesce(p_query, '') || '%';
begin
  if not can_view_project(v_uid, p_project_id) then
    raise exception '無權限查看此項目的記憶圖譜';
  end if;

  return query
  select *
  from memory_notes m
  where m.project_id = p_project_id
    -- RLS parity (v27): progress notes only if the caller can see that item.
    and (m.entity_type <> 'progress'
         or m.entity_id in (select gv.id from get_visible_progress_items(p_project_id) gv))
    and (
      p_query is null
      or m.title ilike v_pat
      or m.summary ilike v_pat
      or exists (select 1 from unnest(m.tags) t where t ilike v_pat)
    )
  order by m.source_updated_at desc nulls last, m.updated_at desc
  limit 60;
end;
$$;
revoke all on function memory_recall(uuid, text) from public;
grant execute on function memory_recall(uuid, text) to authenticated;

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- a worker who sees 0 progress via get_visible_progress_items must now see 0
--   -- PROGRESS notes via memory_recall (issues/docs/contacts still visible):
--   --   select count(*) from memory_recall('<demo>', null) where entity_type='progress';
--   --     as worker -> matches their get_visible_progress_items count (e.g. 0)
--   --     as pm     -> their full visible progress count (unchanged)
--   -- graph_neighbors on a progress note the worker can't see -> raises 無權限.
-- =============================================================
