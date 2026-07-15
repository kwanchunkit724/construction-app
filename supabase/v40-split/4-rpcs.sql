-- =============================================================
-- v40-split/4-rpcs.sql — workflow RPCs (§1.4)
-- =============================================================
-- log_document_event           — SECURITY DEFINER helper. document_events
--                                 has no INSERT policy; every audit row is
--                                 written through here from inside the RPCs.
-- next_document_number         — SECURITY DEFINER; counter row-lock; gated
--                                 can_upload_document in-body.
-- apply_document_supersede_side_effects — SECURITY DEFINER helper; marks prior
--                                 versions superseded + repoints current ptr.
-- supersede_document_version   — clone of supersede_drawing_version
--                                 (v8-drawings.sql:115-156). B1: SECURITY
--                                 DEFINER with in-body upload gate (+ drawing
--                                 carve-out); submitted_by forced to caller
--                                 (B3); one transaction.
-- review_document_version      — approve/reject. B1: SECURITY DEFINER with
--                                 in-body can_review_document gate; self-review
--                                 blocked (unless admin); note required on
--                                 reject; FOUND-checked UPDATE (B2).
-- withdraw_document_version    — SECURITY DEFINER; uploader-or-admin in-body;
--                                 rebinds current pointer to highest
--                                 non-withdrawn version (multi-step client
--                                 rebind moved into one tx).
-- =============================================================

drop function if exists log_document_event(uuid, uuid, text, uuid, text) cascade;
drop function if exists next_document_number(uuid, text) cascade;
drop function if exists apply_document_supersede_side_effects(uuid, uuid) cascade;
drop function if exists supersede_document_version(uuid, int, text, text, text, text, bigint, text, uuid) cascade;
drop function if exists review_document_version(uuid, text, text) cascade;
drop function if exists withdraw_document_version(uuid) cascade;

-- ── 1. log_document_event — SECURITY DEFINER audit writer ─────
-- Bypasses the (absent) document_events INSERT policy so only RPC bodies
-- (and the sync triggers, split 7) can append audit rows. actor defaults
-- to auth.uid() when not supplied.
create or replace function log_document_event(
  p_document_id uuid,
  p_version_id uuid,
  p_event_type text,
  p_actor_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into document_events (document_id, version_id, event_type, actor_id, note)
  values (p_document_id, p_version_id, p_event_type, coalesce(p_actor_id, auth.uid()), p_note)
  returning id into v_id;
  return v_id;
end;
$$;
-- Not granted to authenticated directly — only invoked from other functions.
revoke all on function log_document_event(uuid, uuid, text, uuid, text) from public;

-- ── 2. next_document_number — counter row-lock (§1.4) ─────────
-- Locks (or creates) the (project, type) counter row, returns 'MAT-007'
-- etc. SECURITY DEFINER (writes the private counters table) but re-checks
-- can_upload_document so a non-uploader cannot burn numbers. Prefix map:
-- MAT / MS / DWG / INS / DOC.
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

  -- Ensure a counter row exists, then lock it for the increment.
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

-- ── 3a. apply_document_supersede_side_effects — SECURITY DEFINER ──
-- B1 update: supersede_document_version is now SECURITY DEFINER and gates
-- upload rights IN-BODY (can_upload_document + drawing carve-out), so the
-- whole RPC — including the new-version INSERT — runs as the definer owner
-- and is not RLS-filtered. The two side effects below (marking PRIOR
-- versions superseded, and repointing the header's current_version_id) were
-- already split out into this definer helper because under the OLD invoker
-- design they would have been silently no-op'd by RLS: prior versions may
-- have been submitted by a different uploader (a 判頭 team-mate), and the
-- header UPDATE policy is creator-or-reviewer only. They stay here for
-- clarity / re-use; the helper remains revoked from public so it can only be
-- invoked from within the (now definer) supersede RPC.
create or replace function apply_document_supersede_side_effects(
  p_document_id uuid,
  p_new_version_id uuid
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Mark every prior non-withdrawn, non-superseded version superseded
  -- (covers submitted/approved/rejected → superseded per §1.2 transitions).
  update document_versions
     set status = 'superseded', superseded_at = now()
   where document_id = p_document_id
     and id <> p_new_version_id
     and status not in ('withdrawn','superseded');

  update documents
     set current_version_id = p_new_version_id,
         updated_at = now()
   where id = p_document_id;
end;
$$;
-- Not granted to authenticated — only invoked from supersede_document_version.
revoke all on function apply_document_supersede_side_effects(uuid, uuid) from public;

-- ── 3b. supersede_document_version — clone of supersede_drawing_version ─
-- B1: SECURITY DEFINER with in-body authorization. The previous INVOKER
-- design relied on the document_versions INSERT policy to gate upload
-- rights — but that policy was the only thing standing between a caller and
-- the write, and once log_document_event / apply_document_supersede_side_
-- effects are (correctly) revoked from public, an INVOKER body cannot call
-- them at all → permission denied at runtime. So this RPC now runs as the
-- definer owner and re-implements the gate explicitly:
--   * resolve the parent document's project_id + document_type, then
--   * require can_upload_document(auth.uid(), project), AND
--   * the drawing-type carve-out: a 'drawing' document additionally requires
--     can_upload_drawing (D-25 — 判頭 may NOT issue drawings).
-- submitted_by is FORCED to auth.uid() (B3 trust boundary): the caller can
-- no longer spoof another uploader by passing p_submitted_by. The legacy
-- p_submitted_by parameter is retained for signature compatibility but
-- ignored. Marks prior versions superseded + repoints current_version_id
-- (definer helper 3a) + logs events, all in ONE transaction. Mirrors
-- supersede_drawing_version (v8-drawings.sql:115-156).
create or replace function supersede_document_version(
  p_document_id uuid,
  p_version_no int,
  p_bucket text,
  p_file_path text,
  p_thumb_path text,
  p_mime text,
  p_size bigint,
  p_revision_label text,
  p_submitted_by uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_doc_type text;
  new_id uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;

  -- Resolve the parent document for the authorization decision.
  select d.project_id, d.document_type
    into v_project, v_doc_type
    from documents d
   where d.id = p_document_id;
  if v_project is null then
    raise exception '找不到文件';
  end if;

  -- B1 in-body gate (was the INSERT policy under the old invoker design).
  if not can_upload_document(v_uid, v_project) then
    raise exception '沒有上載權限';
  end if;
  -- Drawing-type carve-out (D-25 parity with the table INSERT policy).
  if v_doc_type = 'drawing' and not can_upload_drawing(v_uid, v_project) then
    raise exception '沒有上載圖則權限';
  end if;

  -- B3: submitted_by is forced to the authenticated caller — p_submitted_by
  -- is ignored so a caller cannot attribute the upload to someone else.
  insert into document_versions (
    document_id, version_no, revision_label, bucket_id, file_path, thumb_path,
    mime_type, size_bytes, status, submitted_by, submitted_at
  )
  values (
    p_document_id, p_version_no, p_revision_label, coalesce(p_bucket, 'project-docs'),
    p_file_path, p_thumb_path, p_mime, p_size, 'submitted', v_uid, now()
  )
  returning id into new_id;

  -- Side effects (definer; see 3a for why).
  perform apply_document_supersede_side_effects(p_document_id, new_id);

  -- Audit: a new revision was uploaded and submitted. Actor = caller.
  perform log_document_event(p_document_id, new_id, 'version_uploaded', v_uid, p_revision_label);
  perform log_document_event(p_document_id, new_id, 'submitted', v_uid, null);

  return new_id;
end;
$$;
grant execute on function supersede_document_version(uuid, int, text, text, text, text, bigint, text, uuid) to authenticated;

-- ── 4. review_document_version — approve / reject (§1.4) ──────
-- B1: SECURITY DEFINER with in-body authorization (same reason as the
-- supersede RPC — it calls the revoked log_document_event helper, which an
-- INVOKER body could not). Body gates the write with can_review_document on
-- the parent project, blocks SELF-review (submitted_by = auth.uid()) unless
-- the caller is a global admin, and requires a note on reject. Only a
-- 'submitted' version is reviewable.
create or replace function review_document_version(
  p_version_id uuid,
  p_action text,
  p_note text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
  v_project uuid;
  v_submitted_by uuid;
  v_status text;
  v_is_admin boolean;
  v_new_status text;
begin
  if v_uid is null then raise exception '未登入'; end if;
  if p_action not in ('approve','reject') then
    raise exception '未知審批動作: %', p_action;
  end if;
  if p_action = 'reject' and (p_note is null or btrim(p_note) = '') then
    raise exception '拒絕文件必須填寫原因';
  end if;

  select dv.document_id, dv.submitted_by, dv.status, d.project_id
    into v_doc_id, v_submitted_by, v_status, v_project
    from document_versions dv
    join documents d on d.id = dv.document_id
   where dv.id = p_version_id;
  if v_doc_id is null then
    raise exception '找不到文件版本';
  end if;
  if v_status <> 'submitted' then
    raise exception '只有【已送審】的版本可以審批（目前狀態: %）', v_status;
  end if;

  -- B1 in-body authorization gate (was the "Reviewers review version" UPDATE
  -- policy under the old invoker design).
  if not can_review_document(v_uid, v_project) then
    raise exception '沒有審批權限';
  end if;

  select exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    into v_is_admin;

  -- Self-review block — a submitter cannot approve/reject their own
  -- submission unless they are a global admin. `is distinct from` keeps the
  -- NULL submitted_by case (deleted uploader) from accidentally matching.
  if v_submitted_by is not distinct from v_uid and not v_is_admin then
    raise exception '不可審批自己提交的文件';
  end if;

  v_new_status := case when p_action = 'approve' then 'approved' else 'rejected' end;

  update document_versions
     set status = v_new_status,
         reviewed_by = v_uid,
         reviewed_at = now(),
         review_note = p_note
   where id = p_version_id
     and status = 'submitted';   -- guard against a concurrent state change

  -- B2: never log an event for an UPDATE that hit 0 rows (would forge an
  -- audit row). B1 already gates this, so this is belt-and-braces — it also
  -- catches the race where the version left 'submitted' between the SELECT
  -- and the UPDATE.
  if not found then
    raise exception '沒有審批權限';
  end if;

  perform log_document_event(v_doc_id, p_version_id, v_new_status, v_uid, p_note);
end;
$$;
grant execute on function review_document_version(uuid, text, text) to authenticated;

-- ── 5. withdraw_document_version — uploader-or-admin (§1.4) ───
-- Mirrors "Uploader or admin withdraws" (v8-drawings.sql:194-199). Marks
-- the version withdrawn, and if it was the current pointer, rebinds
-- current_version_id to the highest-version non-withdrawn version (NULL if
-- none) — all in one transaction (fixes the DrawingsContext multi-step
-- rebind race, §1.4).
--
-- SECURITY DEFINER (with an explicit in-body uploader-or-admin gate)
-- rather than invoker: a pure UPLOADER who is neither the document creator
-- nor a reviewer would otherwise be falsely denied the documents UPDATE
-- (current-pointer rebind) by the "Creators or reviewers edit documents"
-- policy. The body re-checks `submitted_by = auth.uid() OR admin`, so the
-- definer rights grant no extra reach beyond the §1.4 rule.
create or replace function withdraw_document_version(p_version_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
  v_submitted_by uuid;
  v_is_admin boolean;
  v_was_current boolean;
  v_next_current uuid;
begin
  if v_uid is null then raise exception '未登入'; end if;

  select dv.document_id, dv.submitted_by
    into v_doc_id, v_submitted_by
    from document_versions dv
   where dv.id = p_version_id;
  if v_doc_id is null then
    raise exception '找不到文件版本';
  end if;

  select exists (select 1 from user_profiles where id = v_uid and global_role = 'admin')
    into v_is_admin;

  -- Authorisation mirrors the v8 "Uploader or admin withdraws" rule.
  -- NULL-safe: if submitted_by is NULL (uploader account deleted), only an
  -- admin may withdraw — `is distinct from` keeps the NULL case non-true.
  if (v_submitted_by is distinct from v_uid) and not v_is_admin then
    raise exception '只有上載者或管理員可以撤回';
  end if;

  select (current_version_id = p_version_id) into v_was_current
    from documents where id = v_doc_id;

  update document_versions
     set status = 'withdrawn', withdrawn_at = now()
   where id = p_version_id;

  -- B2 belt-and-braces: don't log a 'withdrawn' audit row if the UPDATE hit
  -- 0 rows (the version vanished between the SELECT and here). The in-body
  -- uploader-or-admin gate above is the real authorization.
  if not found then
    raise exception '找不到文件版本';
  end if;

  -- Rebind the current pointer if we just withdrew it.
  if coalesce(v_was_current, false) then
    select id into v_next_current
      from document_versions
     where document_id = v_doc_id
       and status <> 'withdrawn'
     order by version_no desc
     limit 1;

    update documents
       set current_version_id = v_next_current,
           updated_at = now()
     where id = v_doc_id;
  end if;

  perform log_document_event(v_doc_id, p_version_id, 'withdrawn', v_uid, null);
end;
$$;
grant execute on function withdraw_document_version(uuid) to authenticated;

-- =============================================================
-- End of v40-split/4-rpcs.sql
-- =============================================================
