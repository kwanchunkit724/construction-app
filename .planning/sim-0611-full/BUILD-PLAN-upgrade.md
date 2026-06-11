# BUILD-PLAN-upgrade — sim-0611 backlog (S1 S2 S5 · S7 S8 S9 · S16 S17 · S20 S21 · S22 S23)

> Planning pass 2026-06-12. Grounded against worktree source + applied migrations (latest = v44).
> 5 work-packages, migrations **v45–v49**, one migration per package.
> **Deploy order rule (every package): apply the vNN migration on prod FIRST, then ship the client** —
> new client code sends new columns in insert/upsert payloads; PostgREST 400s on unknown columns.
> Packages are mutually independent (any order, parallel build OK) — see shared-file matrix at the end.

---

## Package matrix (one-glance)

| Pkg | Items | Migration | Client files |
|-----|-------|-----------|--------------|
| **P1 P-daily** | S1 S2 S5 | `v45-daily-log-v2.sql` | `src/contexts/DailiesContext.tsx`, `src/pages/DailyEdit.tsx`, `src/pages/DailyList.tsx` |
| **P2 P-docs** | S7 S8 S9 (+A4) | `v46-docs-review-deadline.sql` | `src/types.ts`, `src/contexts/DocumentsContext.tsx`, `src/components/documents/DocumentUploadSheet.tsx`, `src/pages/ProjectFiles.tsx`, NEW `src/pages/PendingReviews.tsx`, `src/App.tsx`, `src/pages/Home.tsx` |
| **P3 P-issues** | S16 S17 S23(b) | `v47-issues-number-location.sql` | `src/types.ts`, `src/contexts/IssuesContext.tsx`, `src/components/CreateIssueModal.tsx`, `src/components/IssueCard.tsx`, `src/pages/IssueDetail.tsx`, `src/lib/export.ts`, `src/pages/ProjectDetail.tsx` |
| **P4 P-onboard** | S20 S21 S23(a) | `v48-onboarding-greencard-push.sql` | `src/types.ts`, `src/pages/Profile.tsx`, `src/pages/Projects.tsx`, `src/components/ApplyToProjectModal.tsx` |
| **P5 P-platform** | S22 | `v49-document-number-drawing-carveout.sql` | none (DB-only) |

S23 was split: the issue-export N+1 (b) folds into P3, the PendingApprovalCard N+1 (a) folds into P4 —
both touch files those packages already own, so no cross-package file conflicts remain.

---

# P1 — P-daily (S1 出勤+機械 · S2 天文台警告+AM/PM · S5 複製琴日)

Today: `dailies` (v11) = one row per (project, user-foreman/engineer, date); `weather text NOT NULL`
check-constrained to `('晴','陰','雨','暴雨','熱','凍','大風')`; v35 added the HKT-today INSERT lock.
Client: `DailiesContext.upsertMyDaily` upserts on `(project_id,user_id,date)`; context does
`select('*')` so new columns flow with zero fetch changes.

## Migration `supabase/v45-daily-log-v2.sql` (additive, idempotent)

```sql
-- S1: structured labour / plant counts. jsonb arrays of {trade,count} / {type,count}.
alter table dailies add column if not exists manpower jsonb not null default '[]'::jsonb;
alter table dailies add column if not exists plant    jsonb not null default '[]'::jsonb;

-- S2: AM/PM weather (same 7-option vocab as legacy `weather`) + HKO warning signals.
alter table dailies add column if not exists weather_am text;
alter table dailies add column if not exists weather_pm text;
alter table dailies add column if not exists warning_signals text[] not null default '{}';

-- check constraints (guarded — ADD CONSTRAINT has no IF NOT EXISTS)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dailies_weather_am_chk') then
    alter table dailies add constraint dailies_weather_am_chk
      check (weather_am is null or weather_am in ('晴','陰','雨','暴雨','熱','凍','大風'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dailies_weather_pm_chk') then
    alter table dailies add constraint dailies_weather_pm_chk
      check (weather_pm is null or weather_pm in ('晴','陰','雨','暴雨','熱','凍','大風'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dailies_warning_signals_chk') then
    alter table dailies add constraint dailies_warning_signals_chk
      check (warning_signals <@ array['一號風球','三號風球','八號或以上風球',
                                      '黃雨','紅雨','黑雨','雷暴警告',
                                      '酷熱天氣警告','寒冷天氣警告']::text[]);
  end if;
end $$;
```

- Do NOT touch the legacy `weather` column, its NOT NULL, or its check — live 1.4 iOS clients write it.
- No RLS / realtime / trigger changes (v35 dailies_insert today-lock stays as-is).
- manpower/plant shape is not server-validated (same posture as `freeform_items` text[]); raw-API junk
  is tolerated — note only.

## Client changes

**`src/contexts/DailiesContext.tsx`**
- New exported consts: `WARNING_SIGNAL_OPTIONS` (⚠ must equal the SQL check list, string-for-string —
  lockstep), keep `WEATHER_OPTIONS`.
- New types: `ManpowerRow { trade: string; count: number }`, `PlantRow { type: string; count: number }`.
- Extend `Daily` + `DailyPayload`: `manpower: ManpowerRow[]`, `plant: PlantRow[]`,
  `weather_am: Weather | null`, `weather_pm: Weather | null`, `warning_signals: string[]`.
- `upsertMyDaily` sends all new columns. **Compat rule: keep writing legacy `weather` = the AM choice**
  (AM required in the new UI) so old clients still render a value and the NOT NULL holds.
- New helper `yesterdayHKT(): string` =
  `new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })`
  (HK has no DST — safe).
- New `fetchMyDailyFor(date: string): Promise<Daily | null>` — single select for S5 (read allowed to all
  approved members by RLS; own row filter `user_id = profile.id`).

**`src/pages/DailyEdit.tsx`**
- Weather card → two chip rows: 上晝天氣 (required, replaces old single row) + 下晝天氣 (optional, with
  a 清除 affordance), plus a 天文台警告信號 multi-select chip row (toggle set).
- New 出勤人數 card: editable rows `[工種 text input][人數 number input][刪除]` + 新增一行 (mirror the
  existing freeform-rows UX); same for 機械 card `[機械類型][數量]`. Drop empty/zero rows on save.
- S5: 「複製琴日」 ghost button in the header area — visible when `canAuthor`; on tap fetch
  `fetchMyDailyFor(yesterdayHKT())`; if null → inline notice 「琴日冇你嘅日誌」; else seed ALL form
  state from it (weather_am/pm fall back from legacy `weather` for pre-v45 rows; progress_item_ids,
  freeform, notes, manpower, plant, warning_signals). If the form already has content / an existing
  today row, `window.confirm('會覆蓋目前內容，繼續？')` first.
- `onSave` validation: 上晝天氣 required (error 「請揀上晝天氣」); counts must be ≥1 integers.

**`src/pages/DailyList.tsx`** (`DailyBody` + header pill)
- Weather pill: show `上晝X · 下晝Y` when weather_am present, else legacy `weather` (old rows).
- Warning signals as red/amber badges next to the weather pill (8號/黑雨 red, others amber).
- New 出勤 section: `紮鐵 5人 · 天秤 1部 … 合共 N 人` summary line per daily; 機械 likewise.

## Prod execute-verify
1. REST upsert as 管工 with all new columns → 201; row echoes them.
2. **Old-client shape** upsert (weather only, no new keys) → still 201, defaults applied (`'[]'`, `'{}'`).
3. `warning_signals = ['咩都得']` → 400 check-constraint violation.
4. v35 guards intact: back-dated insert still RLS-rejected; non-foreman insert rejected.
5. `select manpower, plant, warning_signals from dailies limit 5` → old rows show defaults, no nulls.

## Backwards compat / risk
- Old iOS 1.4 writes only `weather` → fine (new cols defaulted). Old clients reading new rows ignore
  unknown JSON keys → fine.
- **Riskiest:** forgetting to keep writing legacy `weather` from the new UI — upsert would violate
  NOT NULL/check and every new-client save breaks. The executor must keep `weather: weather_am` in the
  upsert payload and add a unit-style assertion in verification.

---

# P2 — P-docs (S7 送審推送核實+老總 · S8 跨工地待我審批+死線 · S9 重新送審)

Facts confirmed from source:
- **S7 is ALREADY BUILT at DB level** — `supabase/v41-documents-push-trigger.sql` is applied:
  `on_document_version_submitted` (INSERT, status='submitted' → reviewers) and
  `on_document_version_reviewed` (UPDATE → submitter, rejection note carried). **Do NOT recreate it.**
  Gap found: v41's reviewer fan-out targets membership roles `('pm','main_contractor')` + assigned PMs,
  but `can_review_document` ALSO includes `general_foreman` (老總) — 老總 can approve yet gets no push
  (= backlog A4, marked ✅). v46 patches only that role list.
- `documents` UPDATE policy = creator OR reviewer → a plain client `update` can maintain a new
  `review_due_date` column with NO policy change.
- `DocumentsContext.refetch` does `select('*')` on documents → new column flows automatically.
- ProjectFiles already honours an `?item=` deep-link; we add `?doc=`.

## Migration `supabase/v46-docs-review-deadline.sql`

```sql
-- 1. S8: review deadline lives on the register header (additive, nullable).
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

-- 3. S7/A4: add 老總 to the submitted-push fan-out (create or replace
--    trg_document_version_submitted with the v41 body verbatim, changing ONLY
--    role in ('pm','main_contractor')  →  role in ('pm','main_contractor','general_foreman')).
--    Trigger object itself is untouched.
```

⚠ Qualify every column (v33/v35 lesson: OUT params named `project_id`/`title` etc. collide with
unqualified column refs in plpgsql → 42702 at RUNTIME. Alias every table and qualify, or use
`language sql`. **Verify by execution, not source.**)

## Client changes

**`src/types.ts`** — `Document.review_due_date: string | null`; new `PendingReview` interface mirroring
the RPC row.

**`src/contexts/DocumentsContext.tsx`**
- `uploadDocument` accepts optional `reviewDueDate?: string` → include `review_due_date` in the
  `documents` insert payload (covered by the existing INSERT policy; the supersede RPC is untouched).
- New `setReviewDueDate(documentId: string, date: string | null)` → plain
  `supabase.from('documents').update({ review_due_date, updated_at })` (creator-or-reviewer policy).

**`src/components/documents/DocumentUploadSheet.tsx`**
- New-document mode: optional `送審死線 (選填)` `<input type="date">` → passed to `uploadDocument`.
- S9 props: `suggestedRevisionLabel?: string` (seeds the revisionLabel state) and
  `rejectionNote?: string` (renders a red banner 「上次拒絕原因：…」 at the top of the sheet).

**`src/pages/ProjectFiles.tsx`**
- `DocumentRow` + `DocumentDetailSheet`: show 死線 date; red 「逾期」 pill when
  `review_due_date < todayHKT()` AND display-status is `submitted`.
- S9: in `DocumentDetailSheet`, when `currentVersion?.status === 'rejected'`, render a primary
  「重新送審」 button (above 上載新版本) that opens `DocumentUploadSheet` with `existingDocumentId`,
  `suggestedRevisionLabel = 'v' + (maxVersionNo + 1)`, `rejectionNote = currentVersion.review_note`.
  (Resubmit lands as a new submitted version via the existing supersede RPC → v41 push re-fires to
  reviewers automatically. Detail sheet should also let creator/reviewer edit 死線 via
  `setReviewDueDate`.)
- Honour a `?doc=<documentId>` deep-link param: after load, open the matching detail sheet (used by
  the new PendingReviews page).

**NEW `src/pages/PendingReviews.tsx`** — 「待我審批」 cross-project list.
- Calls `list_my_pending_reviews()` once on mount + pull-refresh; groups rows by project; each row:
  doc_number / title / type pill / 送審者 / submitted_at / 死線 (逾期 red, ≤3日 amber).
- Tap → `navigate('/project/' + project_id + '/files?doc=' + document_id)`.
- Empty state 「冇文件等你審批」.

**`src/App.tsx`** — lazy route `/reviews` wrapped `<ProtectedRoute><FilesGate>…` (same gating as
`/project/:id/files`).

**`src/pages/Home.tsx`** — a flag-gated (FilesFlagContext) tile/banner: call the RPC once, when
count > 0 show 「📄 待我審批 N 份文件」→ `/reviews`. (v41 push deep-links land on `/project/:id/files`;
this tile is the pull-side surface.)

## S7 verification task (no code — execute on prod, file evidence)
1. `select tgname from pg_trigger where tgname in ('on_document_version_submitted','on_document_version_reviewed');` → 2 rows.
2. Live-fire as 判頭: upload a MAT doc → check Supabase logs for the `send_push_to_users` http_post and
   that PM device receives 「📄 MAT-xxx 物料送審已提交，待批核」.
3. As PM: reject with a note → submitter receives 「❌ … 已拒絕：<note>」; approve → 「✅ … 已批准」.
4. After v46: repeat (2) with an 老總 member → 老總 now also receives the push.

## Prod execute-verify (v46)
1. `list_my_pending_reviews()` as a PM assigned to 2 projects each holding a submitted version →
   both rows, due-date ordering correct. As 判頭 → 0 rows. Submitter's own submission → excluded.
2. REST insert of a document WITH `review_due_date` → persists; old-shape insert → null.
3. 判頭 (creator) can `update documents set review_due_date` on own doc; unrelated worker cannot.

## Backwards compat / risk
- Old clients never send/read `review_due_date` → ignored. RPC is new — no overload issues.
  v41 function replaced in-place (same name/signature) — trigger binding survives.
- **Riskiest:** the RPC is SECURITY DEFINER over `user_profiles` names — gate is
  `can_review_document` (the caller could approve those docs anyway, so no PII broadening), but the
  executor must keep that predicate and the `legacy_drawing_version_id is null` skip (else migrated
  drawing mirrors flood the list).

---

# P3 — P-issues (S16 編號+位置 · S17 處理紀錄 sheet · S23b export N+1)

Facts: `issues` (v4) has no number/location; `issue_comments` is the full escalation thread
(action ∈ reported/commented/escalated/resolved/reopened, from_role/to_role). Export lives in
`src/lib/export.ts # exportIssuesToExcel`, called from `ProjectDetail.tsx` which today does
**two** name lookups (a v17-RLS-limited `user_profiles select *` AND the v36
`get_issue_actor_profiles` RPC) — the RPC alone is authoritative (S23b). The exporter only reads
`.name` off the users map.

## Migration `supabase/v47-issues-number-location.sql` — run as ONE transaction

```sql
-- 1. Additive columns (old clients insert without them — trigger fills issue_no).
alter table issues add column if not exists issue_no int;
alter table issues add column if not exists location text;

-- 2. Per-project counter (document_counters pattern, v40).
create table if not exists issue_counters (
  project_id uuid primary key references projects(id) on delete cascade,
  next_no int not null default 1 check (next_no >= 1)
);
alter table issue_counters enable row level security;
-- no policies — written only inside the SECURITY DEFINER trigger fn; (optional SELECT for members).

-- 3. Assign trigger — BEFORE INSERT, only when issue_no is null (idempotent re-fire safe).
create or replace function trg_assign_issue_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if new.issue_no is not null then return new; end if;
  insert into issue_counters (project_id) values (new.project_id)
    on conflict (project_id) do nothing;
  select next_no into v_n from issue_counters
   where project_id = new.project_id for update;
  update issue_counters set next_no = v_n + 1 where project_id = new.project_id;
  new.issue_no := v_n;
  return new;
end; $$;
drop trigger if exists on_issue_assign_no on issues;
create trigger on_issue_assign_no before insert on issues
  for each row execute function trg_assign_issue_no();

-- 4. Backfill existing rows (stable order), THEN seed counters above the max.
with numbered as (
  select id, row_number() over (partition by project_id order by created_at, id) rn
  from issues where issue_no is null
)
update issues i set issue_no = n.rn from numbered n where i.id = n.id;

insert into issue_counters (project_id, next_no)
select project_id, coalesce(max(issue_no), 0) + 1 from issues group by project_id
on conflict (project_id) do update set next_no = greatest(issue_counters.next_no, excluded.next_no);

-- 5. Uniqueness guard (after backfill).
create unique index if not exists idx_issues_project_issue_no on issues (project_id, issue_no);

-- 6. S17: extend v36 RPC to ALSO cover comment authors (same name/signature/return shape →
--    plain create or replace; zero client lockstep).
--    Body = v36 verbatim plus a third UNION arm:
--      select c.author_id from issue_comments c
--        join issues i2 on i2.id = c.issue_id
--       where i2.project_id = p_project_id
--    (qualify EVERYTHING — return columns are named id/name; v33 42702 lesson.)
```

No issues-RLS changes. `issue_no` is trigger-owned; clients never send it.

## Client changes

**`src/types.ts`** — `Issue.issue_no: number | null`, `Issue.location: string | null`; helper
`formatIssueNo(n: number | null): string` → `n ? '#' + String(n).padStart(3, '0') : '—'`.

**`src/contexts/IssuesContext.tsx`** — `createIssue(title, description, photos, location?: string)`;
include `location: location?.trim() || null` in the insert. (issue_no untouched — trigger.)

**`src/components/CreateIssueModal.tsx`** — optional 位置 input (placeholder 「例如：3樓 A室 / 天台」,
maxLength 60) between 標題 and 描述; pass through.

**`src/components/IssueCard.tsx`** — prepend `formatIssueNo(issue.issue_no)` mono chip; show 位置 chip
when set. **`src/pages/IssueDetail.tsx`** — same in the header.

**`src/lib/export.ts`** — `exportIssuesToExcel(project, issues, users, comments: IssueComment[])`:
- Sheet 1 問題清單: new first columns 編號 (`formatIssueNo`) and 位置; widen `!cols` accordingly.
- Sheet 2 處理紀錄 (S17): one row per comment, ordered by issue_no then created_at:
  `編號 · 問題標題 · 時間 · 動作 (ISSUE_ACTION_ZH) · 操作人 (users[author_id]?.name ?? '前成員') ·
  內容 (body) · 由 (ISSUE_HANDLER_ZH[from_role] ?? '') · 至 (ISSUE_HANDLER_ZH[to_role] ?? '')`.
  `XLSX.utils.book_append_sheet(wb, ws2, '處理紀錄')`.
- Import `IssueComment` + `ISSUE_ACTION_ZH` from types.

**`src/pages/ProjectDetail.tsx`** (`onExportIssuesXlsx`) — S23b:
- DELETE the `user_profiles.select('*').in('id', ids)` pre-query; build the users map from
  `get_issue_actor_profiles` alone (it now also resolves comment authors). Keep the partial-cast shape
  (`{ id, name } as UserProfile`) — exporter only reads `.name`.
- ONE comments query: `supabase.from('issue_comments').select('*')
  .in('issue_id', issues.map(i => i.id)).order('created_at')` → pass to the exporter.
  (Chunk `.in()` at ~200 ids if defensive — issue counts are small.)

## Prod execute-verify
1. Post-backfill: `select project_id, count(*), count(distinct issue_no) from issues group by 1`
   → counts equal; `next_no = max(issue_no)+1` per project.
2. REST insert (old-client shape, no issue_no/location) as a worker → row gets next number.
3. Two rapid concurrent inserts on one project → distinct consecutive numbers (FOR UPDATE held).
4. `get_issue_actor_profiles` returns the name of an ex-member who only COMMENTED (not reported).
5. Export from the app on a project with escalated issues → 2 sheets, escalation rows show 由/至.

## Backwards compat / risk
- Old clients insert issues without the new fields → trigger assigns number, location null. Old
  clients reading rows ignore extra keys. `select('*')` everywhere → no fetch changes.
- **Riskiest:** the backfill/trigger/unique-index ordering on a LIVE table — must run as one
  transaction (Supabase SQL editor runs a pasted script atomically); if it half-applies, the unique
  index step is the failure detector. Re-run safe: backfill only touches `issue_no is null`.

---

# P4 — P-onboard (S20 平安咭 · S21 新申請推送 · S23a applicant N+1)

Facts: `user_profiles` may gain additive nullable columns (no destructive change). Applicant PII
reaches approvers ONLY via `admin_or_pm_list_applicants` (v31→v33→v35 — broke twice; current body =
v35). Push on memberships exists ONLY for UPDATE (`v5-split/5-trg-membership.sql`) — INSERT (the
application itself) is silent. `Projects.tsx # PendingApprovalCard` calls the applicants RPC once
PER CARD although it returns all pending applicants of the project (S23a).

## Migration `supabase/v48-onboarding-greencard-push.sql`

```sql
-- 1. S20: green card on the PERSON (valid across sites) — additive nullable.
alter table user_profiles add column if not exists green_card_no text;
alter table user_profiles add column if not exists green_card_expiry date;

-- 2. S20: extend the applicant RPC's return columns. RETURN TYPE CHANGES ⇒ must
--    DROP then CREATE (create-or-replace fails on return-type change).
drop function if exists admin_or_pm_list_applicants(uuid);
create function admin_or_pm_list_applicants(p_project_id uuid)
returns table (id uuid, name text, phone text, company text,
               green_card_no text, green_card_expiry date)
-- body = v35 FIX-1 verbatim (is_privileged / is_sub_approver gates, pending filter,
-- subcontractor sees only subcontractor_worker rows) with the SELECT list extended:
--   select up.id, up.name, up.phone, up.company, up.green_card_no, up.green_card_expiry
-- EVERY column qualified `up.` / `m.` (42702 lesson — twice burned on this function).
...
grant execute on function admin_or_pm_list_applicants(uuid) to authenticated;

-- 3. S21: push on NEW pending application (INSERT trigger; v5-split style; reuses
--    send_push_to_users verbatim).
create or replace function trg_membership_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project_name text; v_applicant text; v_targets uuid[];
begin
  if new.status <> 'pending' then return new; end if;   -- admin-seeded approved rows: silent
  select name into v_project_name from projects where id = new.project_id;
  select up.name into v_applicant from user_profiles up where up.id = new.user_id;
  select array_agg(distinct uid) into v_targets from (
    select unnest(assigned_pm_ids) as uid from projects where id = new.project_id
    union
    select pm.user_id from project_members pm           -- 判頭 approve their workers
     where pm.project_id = new.project_id and pm.status = 'approved'
       and pm.role = 'subcontractor' and new.role = 'subcontractor_worker'
  ) t where uid is not null and uid is distinct from new.user_id;
  perform send_push_to_users(
    v_targets,
    '👷 新成員申請',
    coalesce(v_applicant,'有人') || ' 申請加入「' || coalesce(v_project_name,'工地') || '」',
    '/projects');
  return new;
end; $$;
drop trigger if exists on_membership_created on project_members;
create trigger on_membership_created after insert on project_members
  for each row execute function trg_membership_created();
```

Recipient set mirrors the client `pendingForMe` gate (assigned PMs; approved 判頭 only for worker
applications). Admins are deliberately excluded from push (they see everything anyway — push budget).
Push budget: one notification per application — negligible.

**Executor pre-check:** confirm `user_profiles` has a self-UPDATE RLS policy covering arbitrary own
columns (push.ts already self-updates `onesignal_id`, so one exists — verify by execution; if it's
column-scoped, add a self-update policy for the two new columns in v48).

## Client changes

**`src/types.ts`** — `UserProfile.green_card_no: string | null`, `green_card_expiry: string | null`.

**`src/pages/Profile.tsx`** — new 平安咭 card: 號碼 text input + 到期日 date input, 儲存 →
`supabase.from('user_profiles').update({...}).eq('id', profile.id)`; show amber 「將於30日內到期」/
red 「已過期」 hint. (Signup flow untouched — preserves the Apple-reviewed auth path.)

**`src/components/ApplyToProjectModal.tsx`** — when the chosen role is `subcontractor_worker` and the
profile has no green card on file, show a non-blocking amber notice 「申請工人角色建議先喺個人資料
登記平安咭」 linking to `/profile`. Application itself is NOT blocked.

**`src/pages/Projects.tsx`** — owns both S20-display and S23a:
- S23a: hoist the RPC. In the `Projects` component: `useEffect` over
  `Array.from(new Set(pendingForMe.map(m => m.project_id)))` → call `admin_or_pm_list_applicants`
  ONCE per project → `Record<projectId, Applicant[]>` state. Pass the matched `applicant` (and a
  `loadError`) into `PendingApprovalCard` as props; delete the per-card `useEffect`/RPC entirely.
- `Applicant` type gains `green_card_no: string | null; green_card_expiry: string | null`.
- S20: `PendingApprovalCard` renders 平安咭 line — number + expiry; red 「平安咭已過期」 when
  `expiry < today`; site-grey 「未登記平安咭」 when null. Approval is informed, not blocked.

## Prod execute-verify
1. **RPC by execution** (v35 lesson — this exact function shipped broken twice):
   as an assigned PM via REST → rows include the two new fields, NO 42702; as a plain worker → `[]`.
2. Old-shape caller compatibility: live 1.4 clients read only id/name/phone/company — extra keys in
   the JSON rows are ignored. Confirm a 1.4 build still renders PendingApprovalCard.
3. Self-update `green_card_no` via REST as the user → 204; as a different user → denied.
4. Insert a pending membership (worker) → assigned PM AND the project's approved 判頭 receive the
   push (check pg_net / OneSignal log); insert an `approved` row directly → NO push.
5. Account deletion (v6/v20 path) still cascades — new columns are on user_profiles, deleted with the
   row; no new FK.

## Backwards compat / risk
- Additive columns on `user_profiles` only — `select('*')` in AuthContext picks them up; no policy
  narrowing touched (v17 hardening untouched: green card is exposed to approvers ONLY through the
  gated RPC, and to co-members exactly as far as v17 already exposes profile rows).
- **Riskiest:** the `admin_or_pm_list_applicants` DROP+CREATE — third intervention on a function with
  a prod-breakage history. The drop and create must sit in the same script run, every column must be
  qualified, and verification MUST be by execution against prod immediately after apply.

---

# P5 — P-platform (S22 next_document_number 圖則 carve-out)

Fact: `next_document_number` (v40-split/4) gates only `can_upload_document` — a 判頭/老總 can burn DWG
numbers over raw REST even though the `documents` INSERT policy + supersede RPC both enforce
`can_upload_drawing` for drawing-type rows. Client already pre-blocks in the UI (DocumentsContext
D-25 guard) — this closes the REST hole only.

## Migration `supabase/v49-document-number-drawing-carveout.sql`

`create or replace function next_document_number(p_project_id uuid, p_type text)` — v40 body verbatim
with ONE addition, placed immediately after the existing `can_upload_document` check and **before**
the counter upsert/lock (a denied call must not create or bump a counter row):

```sql
  if p_type = 'drawing' and not can_upload_drawing(v_uid, p_project_id) then
    raise exception '沒有權限產生文件編號';
  end if;
```

Same signature → plain replace, grants unchanged, zero client change.

## Prod execute-verify
1. As 判頭: `rpc next_document_number(p_type:'drawing')` → error 沒有權限產生文件編號;
   `document_counters` row for (project,'drawing') unchanged/uncreated.
2. As 判頭: `p_type:'material_submission'` → returns next MAT-xxx (unbroken).
3. As PM/main_contractor: drawing-type call → returns DWG-xxx.

## Backwards compat / risk
Low. Error string matches the one DocumentsContext already maps (「沒有權限產生文件編號」).
**Riskiest (minor):** pasting a stale v40 body — executor must copy the CURRENT prod definition
(`select prosrc from pg_proc`) or the repo v40-split/4 file, not retype it.

---

# Cross-package shared-file & sequencing notes

- **`src/types.ts` is touched by P2, P3, P4** (disjoint additions: Document field / Issue fields +
  helper / UserProfile fields). Parallel builds will merge-conflict here — either serialize the
  rebases or land the three small types additions as a first micro-commit before fanning out.
- Everything else is disjoint:
  - P1 owns DailiesContext + Daily pages (nobody else touches them).
  - P2 owns DocumentsContext / DocumentUploadSheet / ProjectFiles / App.tsx / Home.tsx /
    PendingReviews.
  - P3 owns IssuesContext / CreateIssueModal / IssueCard / IssueDetail / export.ts /
    ProjectDetail.tsx.
  - P4 owns Profile / Projects / ApplyToProjectModal. (`ProjectsContext.tsx` is NOT modified —
    applyToProject signature unchanged.)
- SQL: P2 replaces `trg_document_version_submitted` (v41 fn); P5 replaces `next_document_number`
  (v40 fn) — different functions, no overlap. P4's RPC drop+create is self-contained.
- Migration apply order v45→v49 is conventional but NOT required — packages are independent. The only
  hard rule: each vNN lands on prod before its package's client ships (new insert/upsert columns:
  dailies cols v45, documents.review_due_date v46, issues.location v47, user_profiles green card v48).
- ExportMenu / Sidebar / BottomNav: no changes required by any package (P2's entry is a Home tile +
  route; adding a Sidebar item is optional polish, NOT in scope).
- GitNexus discipline for the executor: run `gitnexus_impact` on `exportIssuesToExcel`,
  `upsertMyDaily`, `uploadDocument`, `createIssue`, `admin_or_pm_list_applicants` call sites before
  editing; `gitnexus_detect_changes()` before each package commit.
