-- =============================================================
-- v41-documents-push-trigger.sql — documents register push (§3.6)
-- =============================================================
-- Budget-conscious OneSignal notifications for the documents register, on
-- EXACTLY TWO events (no spam — §3.6):
--
--   1. a version reaching status 'submitted'  (an INSERT — supersede RPC sets
--      status='submitted' on the new row, including v1 and every resubmit)
--        → notify the project's REVIEWERS: approved members with role in
--          (pm, main_contractor) PLUS the project's assigned_pm_ids, minus the
--          submitter.  「📄 <doc_number> 物料送審已提交，待批核」
--
--   2. a version transitioning to 'approved' / 'rejected'  (an UPDATE via the
--      review RPC)
--        → notify the SUBMITTER only (submitted_by).
--          「✅ <doc_number> 已批准」 / 「❌ <doc_number> 已拒絕（附原因）」
--
-- NO push for: new uploads that are not yet submitted (none in v1 — all land
-- submitted), withdraw, supersede, or the 'migrated' backfill / legacy-mirror
-- writes.  Legacy/migrated mirror rows (legacy_drawing_version_id IS NOT NULL,
-- bucket project-drawings, status approved/superseded/withdrawn — never
-- 'submitted') are explicitly skipped so a v1.3 drawing flowing through the
-- sync trigger (v40-split/7) never triggers a document push.
--
-- Reuses send_push_to_users (v5-split/2-send-push.sql) VERBATIM — same
-- credentials lookup, same OneSignal payload, same swallow-on-error posture.
-- All trigger fns are SECURITY DEFINER + idempotent (drop trigger/fn first).
-- The doc-type label is resolved to its zh-HK name so the body reads naturally
-- ("物料送審" / "施工方案" / etc.).
-- =============================================================

-- ── helper: zh-HK label for a document_type (mirrors DOCUMENT_TYPE_ZH) ─
create or replace function document_type_zh(p_type text)
returns text
language sql immutable
set search_path = public
as $$
  select case p_type
    when 'material_submission' then '物料送審'
    when 'method_statement'    then '施工方案'
    when 'drawing'             then '圖則'
    when 'inspection'          then '檢驗記錄'
    when 'other'               then '其他文件'
    else '文件'
  end;
$$;

-- ── 1. submitted → notify project reviewers ───────────────────
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
  -- Skip legacy / migrated mirror rows — they are governed by the drawings
  -- table + sync trigger and never represent a genuine new submission.
  if new.legacy_drawing_version_id is not null then
    return new;
  end if;

  -- Only fire when the row is actually 'submitted'.
  if new.status <> 'submitted' then
    return new;
  end if;

  -- Resolve the parent document → project + doc_number + type.
  select d.project_id, d.doc_number, d.document_type
    into v_project_id, v_doc_number, v_doc_type
    from documents d
   where d.id = new.document_id;

  if v_project_id is null then
    return new;
  end if;

  -- Reviewers = approved members with role in (pm, main_contractor), unioned
  -- with the project's assigned_pm_ids (the project PMs), minus the submitter.
  -- Mirrors the recipient-resolution shape of trg_issue_created (v5-split/3).
  select array_agg(distinct uid) into v_targets
    from (
      select user_id as uid
        from project_members
       where project_id = v_project_id
         and status = 'approved'
         and role in ('pm', 'main_contractor')
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

drop trigger if exists on_document_version_submitted on document_versions;
create trigger on_document_version_submitted
  after insert on document_versions
  for each row execute function trg_document_version_submitted();

-- ── 2. approved / rejected → notify the submitter ─────────────
create or replace function trg_document_version_reviewed() returns trigger
language plpgsql security definer
set search_path = public
as $doc_reviewed$
declare
  v_project_id uuid;
  v_doc_no text;
  v_doc_type text;
  v_label text;
  v_title text;
  v_body text;
begin
  -- Skip legacy / migrated mirror rows.
  if new.legacy_drawing_version_id is not null
     or old.legacy_drawing_version_id is not null then
    return new;
  end if;

  -- Only fire on the genuine transition INTO approved/rejected.
  if new.status not in ('approved', 'rejected')
     or new.status is not distinct from old.status then
    return new;
  end if;

  -- Nobody to notify if the uploader account is gone.
  if new.submitted_by is null then
    return new;
  end if;

  select d.project_id, d.doc_number, d.document_type
    into v_project_id, v_doc_no, v_doc_type
    from documents d
   where d.id = new.document_id;

  if v_project_id is null then
    return new;
  end if;

  v_label := document_type_zh(v_doc_type);

  if new.status = 'approved' then
    v_title := '✅ ' || coalesce(v_doc_no, v_label) || ' 已批准';
    v_body  := v_label || ' 已獲批准';
  else
    v_title := '❌ ' || coalesce(v_doc_no, v_label) || ' 已拒絕';
    -- Carry the rejection reason when present (附原因, §3.6) — trimmed for the
    -- notification body, the full note still lives on the version row.
    v_body  := '已拒絕'
      || case
           when new.review_note is not null and btrim(new.review_note) <> ''
             then '：' || left(btrim(new.review_note), 80)
           else ''
         end;
  end if;

  perform send_push_to_users(
    array[new.submitted_by],
    v_title,
    v_body,
    '/project/' || v_project_id || '/files'
  );
  return new;
end;
$doc_reviewed$;

drop trigger if exists on_document_version_reviewed on document_versions;
create trigger on_document_version_reviewed
  after update on document_versions
  for each row execute function trg_document_version_reviewed();

-- =============================================================
-- POST-APPLY VERIFICATION (verify by EXECUTION — MEMORY note):
--   -- objects exist:
--   select proname from pg_proc where proname in
--     ('trg_document_version_submitted','trg_document_version_reviewed',
--      'document_type_zh');                                   -- expect 3 rows
--   select tgname from pg_trigger where tgname in
--     ('on_document_version_submitted','on_document_version_reviewed'); -- 2 rows
--
--   -- submit path (as an uploader): create v1 via supersede RPC, then check
--   -- the OneSignal call fired to reviewers (inspect supabase logs for the
--   -- send_push_to_users http_post, or that no error was raised):
--   select supersede_document_version('<doc_id>',1,'project-docs',
--     '<project_id>/<doc_id>/v1/a.pdf',null,'application/pdf',1024,'Rev A',null);
--   -- → reviewers (pm + main_contractor members + assigned_pm_ids, minus
--   --   uploader) receive 「📄 MAT-001 物料送審已提交，待批核」.
--
--   -- review path (as a DIFFERENT reviewer):
--   select review_document_version('<v1_id>','reject','色板不符');
--   -- → uploader receives 「❌ MAT-001 已拒絕：色板不符」.
--   select review_document_version('<v2_id>','approve','OK');
--   -- → uploader receives 「✅ MAT-001 已批准」.
--
--   -- legacy parity: inserting a drawing_version via the old path mirrors a
--   -- document_version with legacy_drawing_version_id set + status 'approved'
--   -- → NO push fires (both guards skip legacy rows).
-- =============================================================
-- End of v41-documents-push-trigger.sql
-- =============================================================
