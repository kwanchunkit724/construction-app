-- =============================================================
-- v61-memory-graph.sql   (Server-hosted memory graph — #4)
-- =============================================================
-- A SERVER-hosted knowledge graph that lives entirely in Supabase
-- (the always-up server) — NO GitHub, NO local Obsidian, NO external
-- setup. It is DERIVED one-way from the app's existing data: every
-- progress item / document / issue / contact / project becomes a
-- memory_note, and the latent FK graph already in Postgres becomes
-- memory_links. Supabase stays the single source of truth; this graph
-- is a rebuildable projection, never authored by hand. The AI 站長
-- reads it server-side via graph_neighbors / memory_recall.
--
-- Additive only. No destructive change to any live table. zh-HK
-- summaries. RLS-bounded reads (can_view_project). The rebuild is
-- SECURITY DEFINER and admin-OR-service-role only — clients have NO
-- insert/update/delete policy, so the projection cannot be forged.
--
-- Built on the REAL columns that exist today (read the schemas — never
-- invent a relationship):
--   * progress_items (v3 + v3-5): id, project_id, parent_id, code, title,
--     status, actual_progress, blocked_reason (v43), last_updated_at.
--   * documents (v40-split/1): id, project_id, progress_item_id,
--     document_type, title, doc_number, updated_at.
--   * issues (v4 + v47): id, project_id, title, status,
--     current_handler_role, issue_no, updated_at.
--   * contacts (v11): id, project_id, name, trade, phone, updated_at.
--   * projects (v2): id, name, zones, created_at.
-- Edges actually buildable from real columns (everything else is SKIPPED,
-- not faked):
--   * progress -> document   'governing'  via documents.progress_item_id
--   * progress -> progress    'parent'     via progress_items.parent_id
--   * (any) -> project        'belongs_to' via the note's project_id
-- DELIBERATELY SKIPPED (no real linking column exists — would be invented):
--   * progress -> issue 'blocked_by'  — issues has NO progress_item_id;
--     progress_items.blocked_reason is free text, not an issue FK.
--   * progress -> contact 'owner'     — progress_items.assigned_to is a
--     uuid[] of user_profiles, NOT a contacts FK; contacts has no link.
--   * document supersede chain 'supersedes' — no supersedes/superseded_by
--     column on documents; only version status='superseded' exists.
-- =============================================================

-- ── 1. memory_notes — one node per source row ─────────────────
create table if not exists memory_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  entity_type text not null check (entity_type in
    ('progress','document','issue','contact','project')),
  entity_id uuid not null,
  node_type text not null default 'entity',
  title text,
  summary text,
  tags text[] not null default '{}',
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (project_id, entity_type, entity_id)
);
create index if not exists idx_memory_notes_project on memory_notes(project_id);
create index if not exists idx_memory_notes_entity on memory_notes(entity_type, entity_id);
create index if not exists idx_memory_notes_tags on memory_notes using gin (tags);

-- ── 2. memory_links — typed edges between notes ───────────────
create table if not exists memory_links (
  from_note uuid not null references memory_notes(id) on delete cascade,
  to_note uuid not null references memory_notes(id) on delete cascade,
  edge_type text not null,
  primary key (from_note, to_note, edge_type)
);
create index if not exists idx_memory_links_to on memory_links(to_note);

-- ── 3. RLS — read-only to members; writes via the rebuild fn only ─
alter table memory_notes enable row level security;
alter table memory_links enable row level security;

-- Members of the project may read its notes. There is NO insert/update/
-- delete policy on purpose: only rebuild_project_memory (SECURITY DEFINER)
-- or the service role may write, so the derived graph can't be forged.
drop policy if exists memory_notes_select on memory_notes;
create policy memory_notes_select on memory_notes for select to authenticated
  using (can_view_project(auth.uid(), project_id));

-- A link is visible iff the viewer can see the project of its from_note
-- (both endpoints share the same project — links are intra-project only).
drop policy if exists memory_links_select on memory_links;
create policy memory_links_select on memory_links for select to authenticated
  using (exists (
    select 1 from memory_notes n
    where n.id = from_note and can_view_project(auth.uid(), n.project_id)
  ));

-- ── 4. rebuild_project_memory — derive notes + links for one project ─
-- Idempotent UPSERT of one note per source row, then a full rebuild of
-- this project's links. Prunes notes whose source row is gone. Gate:
-- admin OR no auth context (service role / cron). Never client-callable.
create or replace function rebuild_project_memory(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- admin-OR-no-auth(service-role) gate
  if v_uid is not null
     and not exists (select 1 from user_profiles where id = v_uid and global_role = 'admin') then
    raise exception '只有系統管理員或伺服器排程可以重建記憶圖譜';
  end if;

  if not exists (select 1 from projects where id = p_project_id) then
    return;
  end if;

  -- ── 4a. project note ────────────────────────────────────────
  insert into memory_notes as m
    (project_id, entity_type, entity_id, node_type, title, summary, tags, source_updated_at, updated_at)
  select
    p.id,
    'project',
    p.id,
    'entity',
    p.name,
    '工程項目「' || p.name || '」，共 ' ||
      coalesce(jsonb_array_length(p.zones), 0)::text || ' 個區域。',
    array['project'],
    p.created_at,
    now()
  from projects p
  where p.id = p_project_id
  on conflict (project_id, entity_type, entity_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  -- ── 4b. progress notes ──────────────────────────────────────
  insert into memory_notes as m
    (project_id, entity_type, entity_id, node_type, title, summary, tags, source_updated_at, updated_at)
  select
    pi.project_id,
    'progress',
    pi.id,
    'entity',
    pi.code || ' ' || pi.title,
    '進度項目 ' || pi.code || '「' || pi.title || '」，狀態：' || pi.status ||
      '，完成度 ' || pi.actual_progress::text || '%' ||
      coalesce('，受阻原因：' || nullif(pi.blocked_reason, ''), '') || '。',
    array['progress', pi.status]
      || case when pi.status = 'blocked' or pi.blocked_reason is not null
              then array['blocked'] else array[]::text[] end,
    pi.last_updated_at,
    now()
  from progress_items pi
  where pi.project_id = p_project_id
  on conflict (project_id, entity_type, entity_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  -- ── 4c. document notes ──────────────────────────────────────
  insert into memory_notes as m
    (project_id, entity_type, entity_id, node_type, title, summary, tags, source_updated_at, updated_at)
  select
    d.project_id,
    'document',
    d.id,
    'entity',
    coalesce(nullif(d.doc_number, '') || ' ', '') || d.title,
    '文件「' || d.title || '」，類別：' || d.document_type ||
      coalesce('，編號 ' || nullif(d.doc_number, ''), '') || '。',
    array['document', d.document_type],
    d.updated_at,
    now()
  from documents d
  where d.project_id = p_project_id
  on conflict (project_id, entity_type, entity_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  -- ── 4d. issue notes ─────────────────────────────────────────
  insert into memory_notes as m
    (project_id, entity_type, entity_id, node_type, title, summary, tags, source_updated_at, updated_at)
  select
    i.project_id,
    'issue',
    i.id,
    'entity',
    coalesce('#' || i.issue_no::text || ' ', '') || i.title,
    '問題「' || i.title || '」，狀態：' || i.status ||
      '，現時處理人：' || i.current_handler_role || '。',
    array['issue', i.status]
      || case when i.status = 'open' then array['open'] else array[]::text[] end,
    i.updated_at,
    now()
  from issues i
  where i.project_id = p_project_id
  on conflict (project_id, entity_type, entity_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  -- ── 4e. contact notes ───────────────────────────────────────
  insert into memory_notes as m
    (project_id, entity_type, entity_id, node_type, title, summary, tags, source_updated_at, updated_at)
  select
    c.project_id,
    'contact',
    c.id,
    'entity',
    c.name,
    '聯絡人「' || c.name || '」，工種：' || c.trade || '，電話：' || c.phone || '。',
    array['contact', c.trade],
    c.updated_at,
    now()
  from contacts c
  where c.project_id = p_project_id
  on conflict (project_id, entity_type, entity_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  -- ── 4f. prune notes whose source row no longer exists ───────
  delete from memory_notes m
  where m.project_id = p_project_id
    and not exists (
      select 1 from progress_items pi where pi.id = m.entity_id and m.entity_type = 'progress'
      union all
      select 1 from documents d where d.id = m.entity_id and m.entity_type = 'document'
      union all
      select 1 from issues i where i.id = m.entity_id and m.entity_type = 'issue'
      union all
      select 1 from contacts c where c.id = m.entity_id and m.entity_type = 'contact'
      union all
      select 1 from projects p where p.id = m.entity_id and m.entity_type = 'project'
    );

  -- ── 4g. rebuild this project's links (delete-then-insert) ───
  delete from memory_links l
  where exists (
    select 1 from memory_notes n where n.id = l.from_note and n.project_id = p_project_id
  );

  -- progress -> document 'governing' (documents.progress_item_id is a real FK)
  insert into memory_links (from_note, to_note, edge_type)
  select fp.id, td.id, 'governing'
  from documents d
  join memory_notes fp on fp.entity_type = 'progress' and fp.entity_id = d.progress_item_id
  join memory_notes td on td.entity_type = 'document' and td.entity_id = d.id
  where d.project_id = p_project_id
    and d.progress_item_id is not null
  on conflict do nothing;

  -- progress -> progress 'parent' (progress_items.parent_id is a real FK)
  insert into memory_links (from_note, to_note, edge_type)
  select cn.id, pn.id, 'parent'
  from progress_items child
  join memory_notes cn on cn.entity_type = 'progress' and cn.entity_id = child.id
  join memory_notes pn on pn.entity_type = 'progress' and pn.entity_id = child.parent_id
  where child.project_id = p_project_id
    and child.parent_id is not null
  on conflict do nothing;

  -- (any) -> project 'belongs_to' (every note carries a real project_id)
  insert into memory_links (from_note, to_note, edge_type)
  select n.id, pj.id, 'belongs_to'
  from memory_notes n
  join memory_notes pj on pj.entity_type = 'project' and pj.entity_id = p_project_id
  where n.project_id = p_project_id
    and n.entity_type <> 'project'
  on conflict do nothing;
end;
$$;
revoke all on function rebuild_project_memory(uuid) from public;
-- callable by the service role / cron (no auth) and by admins; the in-body
-- gate enforces admin-OR-no-auth, so authenticated non-admins are rejected.
grant execute on function rebuild_project_memory(uuid) to authenticated;

-- ── 5. graph_neighbors — a note + its 1-hop neighbourhood ─────
-- RLS-bounded: caller must can_view_project on the note's project, else
-- raise. Returns the focus note plus up to 60 linked notes (either
-- direction), each carrying the connecting edge_type.
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
  v_focus jsonb;
  v_neighbors jsonb;
begin
  select project_id into v_project from memory_notes where id = p_note_id;
  if v_project is null then
    raise exception '找不到記憶節點';
  end if;
  if not can_view_project(v_uid, v_project) then
    raise exception '無權限查看此項目的記憶圖譜';
  end if;

  select to_jsonb(f) into v_focus
  from (
    select id, entity_type, title, summary
    from memory_notes where id = p_note_id
  ) f;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_neighbors
  from (
    -- outgoing edges: focus -> neighbour
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.to_note
    where l.from_note = p_note_id
    union
    -- incoming edges: neighbour -> focus
    select n.id, n.entity_type, n.title, n.summary, l.edge_type
    from memory_links l
    join memory_notes n on n.id = l.from_note
    where l.to_note = p_note_id
    limit 60
  ) x;

  return jsonb_build_object('note', v_focus, 'neighbors', v_neighbors);
end;
$$;
revoke all on function graph_neighbors(uuid) from public;
grant execute on function graph_neighbors(uuid) to authenticated;

-- ── 6. memory_recall — tiered keyword recall over a project ───
-- RLS-bounded (raises if the caller can't view the project). When p_query
-- is null, returns all of the project's notes; otherwise filters notes
-- whose title / summary / any tag ILIKE-matches the query. Capped at 60.
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
--   select to_regclass('public.memory_notes') is not null,
--          to_regclass('public.memory_links') is not null;            -> t,t
--   -- pick a real project id, then:
--   select rebuild_project_memory('<project-uuid>');                  -> void (idempotent; re-run safe)
--   select entity_type, count(*) from memory_notes
--     where project_id = '<project-uuid>' group by 1;                 -> rows per entity present
--   select edge_type, count(*) from memory_links l
--     join memory_notes n on n.id = l.from_note
--     where n.project_id = '<project-uuid>' group by 1;               -> governing / parent / belongs_to
--   select memory_recall('<project-uuid>', '進度');                   -> matching notes (<=60)
--   select graph_neighbors((select id from memory_notes
--     where project_id = '<project-uuid>' limit 1));                  -> { note, neighbors[] }
--   -- as a NON-member: memory_recall / graph_neighbors -> raises 無權限 ...
--   -- as a NON-admin authenticated user: rebuild_project_memory -> raises 只有系統管理員 ...
-- =============================================================
