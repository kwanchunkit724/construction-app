-- =============================================================
-- v40-split/3-helpers-and-rls.sql — RLS helpers + policies (§1.5)
-- =============================================================
-- Per-project membership role governs rights (v27 lesson), NOT
-- global_role. Two SECURITY DEFINER helpers, then RLS on the three
-- client-facing tables exactly per the §1.5 policy table.
--
-- can_view_project        — v3-progress-schema.sql:33  (any approved member)
-- can_upload_drawing      — v8-drawings.sql:91         (D-25: 判頭 EXCLUDED)
-- can_upload_document     — NEW: 判頭 INCLUDED (MAT/MS/INS are the subcon's
--                            instrument), reviewed upward.
-- can_review_document     — NEW: supervisors only (pm/general_foreman/
--                            main_contractor) — matches can_manage_project_
--                            progress (v27) membership set.
-- =============================================================

-- ── 1. Upload gate — 判頭 INCLUDED (deliberately != can_upload_drawing) ─
create or replace function can_upload_document(p_user_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- Admin
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    -- PM of this project (assigned_pm_ids)
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    -- Approved member with an upload-eligible role — subcontractor (判頭) INCLUDED
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
        and role in ('pm', 'general_foreman', 'main_contractor', 'subcontractor')
    );
$$;
revoke all on function can_upload_document(uuid, uuid) from public;
grant execute on function can_upload_document(uuid, uuid) to authenticated;

-- ── 2. Review gate — supervisors only (approve/reject) ────────
create or replace function can_review_document(p_user_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members
      where user_id = p_user_id
        and project_id = p_project_id
        and status = 'approved'
        and role in ('pm', 'general_foreman', 'main_contractor')
    );
$$;
revoke all on function can_review_document(uuid, uuid) from public;
grant execute on function can_review_document(uuid, uuid) to authenticated;

-- ── 3. Enable RLS ─────────────────────────────────────────────
alter table documents enable row level security;
alter table document_versions enable row level security;
alter table document_events enable row level security;
alter table document_counters enable row level security;

-- Idempotent: drop policies before recreating.
-- NOTE: the two document_versions UPDATE policies below ("Uploader or admin
-- withdraws version" + "Reviewers review version") are dropped here but are
-- intentionally NOT recreated (B3 i) — review/withdraw now flow exclusively
-- through SECURITY DEFINER RPCs, and the guard trigger (§8) is the row-level
-- defence. Dropping them is what removes the self-approval / evidence-rewrite
-- hole on any environment that already applied the earlier draft.
drop policy if exists "Members view documents" on documents;
drop policy if exists "Editors insert documents" on documents;
drop policy if exists "Creators or reviewers edit documents" on documents;
drop policy if exists "Members view document versions" on document_versions;
drop policy if exists "Editors insert document versions" on document_versions;
drop policy if exists "Uploader or admin withdraws version" on document_versions;
drop policy if exists "Reviewers review version" on document_versions;
drop policy if exists "Members view document events" on document_events;
drop policy if exists "Members view document counters" on document_counters;

-- ── 4. documents policies (§1.5) ──────────────────────────────
-- SELECT: any approved member.
create policy "Members view documents"
  on documents for select to authenticated
  using (can_view_project(auth.uid(), project_id));

-- INSERT: can_upload_document AND drawing-type carve-out — a row with
-- document_type='drawing' additionally requires can_upload_drawing, so
-- 判頭 may submit MAT/MS/INS/other but NOT issue drawings (D-25 parity).
create policy "Editors insert documents"
  on documents for insert to authenticated
  with check (
    can_upload_document(auth.uid(), project_id)
    and (document_type <> 'drawing' or can_upload_drawing(auth.uid(), project_id))
  );

-- UPDATE (title/metadata edit): creator OR a reviewer. No DELETE policy
-- (immortal register).
create policy "Creators or reviewers edit documents"
  on documents for update to authenticated
  using (
    created_by = auth.uid()
    or can_review_document(auth.uid(), project_id)
  )
  with check (
    created_by = auth.uid()
    or can_review_document(auth.uid(), project_id)
  );

-- ── 5. document_versions policies (§1.5) ──────────────────────
-- SELECT: join to parent doc + can_view_project.
create policy "Members view document versions"
  on document_versions for select to authenticated
  using (exists (
    select 1 from documents d
    where d.id = document_versions.document_id
      and can_view_project(auth.uid(), d.project_id)
  ));

-- INSERT: join + can_upload_document (+ drawing-type carve-out, mirroring
-- the header). The supersede RPC is the supported upload path; this policy
-- still governs the legacy DrawingsContext direct-insert path during the
-- dual-write window, so it is RETAINED.
create policy "Editors insert document versions"
  on document_versions for insert to authenticated
  with check (exists (
    select 1 from documents d
    where d.id = document_versions.document_id
      and can_upload_document(auth.uid(), d.project_id)
      and (d.document_type <> 'drawing' or can_upload_drawing(auth.uid(), d.project_id))
  ));

-- B3(i): NO UPDATE policy on document_versions.
--
-- The original draft had TWO permissive UPDATE policies here:
--   (a) "Uploader or admin withdraws version" — submitted_by = auth.uid()
--       OR admin. DROPPED: it was dead weight AND a hole. withdraw_document_
--       version is SECURITY DEFINER and bypasses RLS, so the policy was never
--       needed for the supported path; meanwhile it let an uploader PATCH
--       their own row directly over REST to status='approved' (self-approval)
--       or rewrite file_path/file pointers (evidence rewrite).
--   (b) "Reviewers review version" — can_review_document on the parent.
--       DROPPED too: review now goes exclusively through review_document_
--       version, which is SECURITY DEFINER (B1) and gates can_review_document
--       in-body, so it does not need an RLS UPDATE grant. Keeping (b) would
--       have re-opened a direct-PATCH path for a reviewer to approve a
--       version while skipping the self-review block / submitted-only guard.
--
-- With BOTH gone, RLS denies every direct UPDATE on document_versions; the
-- only mutation paths are the three SECURITY DEFINER RPCs. The BEFORE UPDATE
-- guard trigger below (B3 ii) is defence-in-depth: even those definer RPCs
-- (and any future definer code) cannot illegally flip status or rewrite an
-- immutable file pointer.
-- No DELETE policy on document_versions either (immortal register).

-- ── 6. document_events policies (§1.5) ────────────────────────
-- SELECT: join + can_view_project. NO insert/update/delete policies —
-- rows only appear via the security-definer log_document_event helper
-- called inside the RPCs (split 4).
create policy "Members view document events"
  on document_events for select to authenticated
  using (exists (
    select 1 from documents d
    where d.id = document_events.document_id
      and can_view_project(auth.uid(), d.project_id)
  ));

-- ── 7. document_counters policies ─────────────────────────────
-- SELECT only (so a client could preview the next number if desired);
-- writes happen exclusively inside next_document_number (definer).
create policy "Members view document counters"
  on document_counters for select to authenticated
  using (can_view_project(auth.uid(), project_id));

-- ── 8. B3(ii) — column-level write-guard on document_versions ──
-- Cloned from guard_progress_item_meta (v38-meta-change-history.sql:33-66).
-- Defence-in-depth that holds EVEN against the SECURITY DEFINER RPCs and any
-- future definer code (RLS does not apply inside a definer body; this BEFORE
-- UPDATE trigger does). It enforces the §1.2 transition rules at the row
-- level:
--   * status → 'approved'/'rejected' requires can_review_document on the
--     parent project AND submitted_by is distinct from the actor (no self-
--     review), unless the actor is a global admin;
--   * status → 'withdrawn' requires uploader-or-admin;
--   * file_path / bucket_id / mime_type / size_bytes / version_no /
--     document_id are IMMUTABLE (immortal evidence — no self-approval via
--     evidence rewrite, even by a reviewer).
--
-- Bypasses (mirroring v38 + B4):
--   * auth.uid() IS NULL  → backfill / migrations / service-role have no auth
--     context; let them through (the single-tx backfill in split 6 sets
--     'superseded'/'withdrawn' directly).
--   * legacy mirror rows (legacy_drawing_version_id IS NOT NULL) → the sync
--     trigger (split 7) runs under a live v1.3 user's auth context and
--     legitimately flips a mirror's status (current→superseded→withdrawn) and
--     pins its file pointer; re-validating it here would break those forward
--     writes. The drawings table already governs the legacy path. So a row
--     that carries a legacy id is exempt from BOTH the status and the
--     immutability checks.
create or replace function guard_document_version_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_project uuid;
  v_is_admin boolean;
begin
  -- Service role / migrations / backfill (no auth context) bypass the guard.
  if v_actor is null then
    return new;
  end if;

  -- Legacy-mirrored rows are governed by the drawings table + sync trigger.
  if new.legacy_drawing_version_id is not null
     or old.legacy_drawing_version_id is not null then
    return new;
  end if;

  select d.project_id into v_project
    from documents d where d.id = new.document_id;

  select exists (select 1 from user_profiles where id = v_actor and global_role = 'admin')
    into v_is_admin;

  -- Immutable evidence columns — a version's blob pointer / identity never
  -- changes after insert (any attempt is rejected for non-admin and admin
  -- alike; supersede creates a NEW row instead).
  if new.file_path   is distinct from old.file_path
     or new.bucket_id    is distinct from old.bucket_id
     or new.mime_type    is distinct from old.mime_type
     or new.size_bytes   is distinct from old.size_bytes
     or new.version_no   is distinct from old.version_no
     or new.document_id  is distinct from old.document_id then
    raise exception '文件版本的檔案內容／識別欄位不可更改';
  end if;

  -- Approve / reject transition — reviewer-only, no self-review (unless admin).
  if new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    if not (v_is_admin
            or (can_review_document(v_actor, v_project)
                and old.submitted_by is distinct from v_actor)) then
      raise exception '沒有審批權限或不可審批自己提交的文件';
    end if;
  end if;

  -- Withdraw transition — uploader-or-admin.
  if new.status is distinct from old.status
     and new.status = 'withdrawn' then
    if not (v_is_admin or old.submitted_by is not distinct from v_actor) then
      raise exception '只有上載者或管理員可以撤回';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_document_version_write on document_versions;
create trigger trg_guard_document_version_write
  before update on document_versions
  for each row execute function guard_document_version_write();

-- =============================================================
-- End of v40-split/3-helpers-and-rls.sql
-- =============================================================
