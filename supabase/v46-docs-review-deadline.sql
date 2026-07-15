-- =============================================================
-- v46-docs-review-deadline.sql
-- =============================================================
-- Backlog S8 (review deadline + cross-project 待我審批 feed) and
-- S7/A4 (add 老總 general_foreman to the submitted-push fan-out).
-- Additive + idempotent. No RLS / realtime changes.
--   * documents UPDATE policy is already creator-OR-reviewer → the new
--     review_due_date column needs no policy change.
--   * DocumentsContext.refetch does select('*') → the column auto-flows.
--   * v41's two triggers stay bound; only the submitted-fn body is
--     replaced in-place (same name/signature).
-- ⚠ Every column in the RPC is table-qualified — OUT params named
--   project_id/title/document_type collide with unqualified refs in
--   plpgsql (v33/v35 42702 lesson). VERIFY BY EXECUTION, not source.
-- =============================================================

-- 1. S8: review deadline on the register header (additive, nullable).
alter table documents add column if not exists review_due_date date;

-- 2. S8: cross-project pending-review feed — one round trip for all sites.
drop function if exists list_my_pending_reviews();
create function list_my_pending_reviews()
returns table (
  project_id uuid, project_name text,
  document_id uuid, doc_number text, title text, document_type text,
  review_due_date date,
  version_id uuid, version_no int, revision_label text,
  submitted_by uuid, submitted_by_name text, submitted_at timestamptz
)
language plpgsql stable security definer
set search_path = public set row_security = off
as $$
begin
  return query
    select d.project_id, p.name,
           d.id, d.doc_number, d.title, d.document_type,
           d.review_due_date,
           dv.id, dv.version_no, dv.revision_label,
           dv.submitted_by, up.name, dv.submitted_at
      from document_versions dv
      join documents d on d.id = dv.document_id
      join projects  p on p.id = d.project_id
      left join user_profiles up on up.id = dv.submitted_by
     where dv.status = 'submitted'
       and dv.legacy_drawing_version_id is null
       and can_review_document(auth.uid(), d.project_id)
       and dv.submitted_by is distinct from auth.uid()   -- self-review is blocked anyway
     order by d.review_due_date nulls last, dv.submitted_at;
end; $$;
grant execute on function list_my_pending_reviews() to authenticated;

-- 3. S7/A4: add 老總 (general_foreman) to the submitted-push fan-out.
--    v41 trg_document_version_submitted body VERBATIM, changing ONLY the
--    reviewer role list role in ('pm','main_contractor')
--                        → role in ('pm','main_contractor','general_foreman').
--    can_review_document already grants 老總 approval rights; this closes the
--    "can approve but never notified" gap (A4). document_type_zh + the trigger
--    object itself are untouched (v41 still owns them).
create or replace function trg_document_version_submitted() returns trigger
language plpgsql security definer
set search_path = public
as $doc_submitted$
declare
  v_project_id uuid;
  v_doc_number text;
  v_doc_type text;
  v_targets uuid[];
  v_label text;
begin
  -- Skip legacy / migrated mirror rows.
  if new.legacy_drawing_version_id is not null then
    return new;
  end if;

  -- Only fire when the row is actually 'submitted'.
  if new.status <> 'submitted' then
    return new;
  end if;

  select d.project_id, d.doc_number, d.document_type
    into v_project_id, v_doc_number, v_doc_type
    from documents d
   where d.id = new.document_id;

  if v_project_id is null then
    return new;
  end if;

  -- Reviewers = approved members with role in (pm, main_contractor, general_foreman),
  -- unioned with the project's assigned_pm_ids, minus the submitter.
  select array_agg(distinct uid) into v_targets
    from (
      select user_id as uid
        from project_members
       where project_id = v_project_id
         and status = 'approved'
         and role in ('pm', 'main_contractor', 'general_foreman')
      union
      select unnest(assigned_pm_ids) as uid
        from projects
       where id = v_project_id
    ) t
   where uid is not null
     and uid is distinct from new.submitted_by;

  v_label := document_type_zh(v_doc_type);

  perform send_push_to_users(
    v_targets,
    '📄 ' || coalesce(v_doc_number, v_label) || ' ' || v_label || '已提交，待批核',
    coalesce(v_doc_number, v_label) || ' 已送審，請審批',
    '/project/' || v_project_id || '/files'
  );
  return new;
end;
$doc_submitted$;
-- trigger binding survives the in-place replace (no drop/create trigger needed).

-- =============================================================
-- Post-apply verification (execute, not source):
--   -- list_my_pending_reviews(): as a PM on 2 projects each with a submitted
--   --   version -> 2 rows, due-date nulls-last ordering. As 判頭 -> 0 rows.
--   --   Submitter's own submission -> excluded.
--   -- REST insert of a document WITH review_due_date -> persists; old-shape
--   --   insert -> null. 判頭(creator) can update own doc's review_due_date;
--   --   unrelated worker cannot.
--   -- live-fire submit as 判頭 on a project with an 老總 member -> 老總 now
--   --   also receives 「📄 …已提交，待批核」 (was missing pre-v46).
--   select proname from pg_proc where proname in
--     ('list_my_pending_reviews','trg_document_version_submitted');  -- 2 rows
-- =============================================================
