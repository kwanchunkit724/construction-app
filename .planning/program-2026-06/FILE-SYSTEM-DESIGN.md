# FILE-SYSTEM-DESIGN.md — 文件系統 (Documents Register) linked to the Finishing Schedule

**Problems addressed:** #5 (every finishing-schedule item needs organised document submissions —
物料送審 material submissions, 施工方案 method statements, 圖則 drawings, 檢驗記錄 inspection
records) and #6 (replace the current drawings-on-progress affordance with the new file system,
without breaking live iOS v1.3 users).

**Status quo being replaced:** firms dump everything on a shared server and dig it out later.
In-app today, the only document feature is *drawings pinned to leaf progress items*
(`supabase/v8-drawings.sql`, `src/contexts/DrawingsContext.tsx`, `src/components/drawings/*`),
surfaced via a 圖則 menu row on each leaf card (`src/components/ProgressItemCard.tsx:229-231`,
`:280`). There is no project-level browse view, no document types, and no approval workflow.

---

## 0. Current state — what exists and what constrains us

### 0.1 Drawings feature (the thing Problem 6 replaces)

| Piece | Location | Key facts |
|---|---|---|
| Tables | `supabase/v8-drawings.sql:32-59` | `drawings(id, project_id, leaf_item_id, title, current_version_id, created_by)` + `drawing_versions(id, drawing_id, version_no, file_path, thumb_path, mime_type, size_bytes, revision_label, status current/superseded/withdrawn, uploaded_by, uploaded_at, superseded_at, withdrawn_at)` |
| Leaf-only trigger | `v8-drawings.sql:66-80` | `assert_progress_item_is_leaf()` blocks attaching to non-leaf items |
| Upload gate | `v8-drawings.sql:91-108` | `can_upload_drawing()` = admin OR assigned PM OR approved member role ∈ (`pm`,`main_contractor`) — **subcontractor excluded (D-25)** |
| View gate | `v8-drawings.sql:165-167` | `can_view_project()` (`v3-progress-schema.sql:33-49`) — any approved member |
| Atomic supersede | `v8-drawings.sql:115-156` | `supersede_drawing_version` RPC (invoker rights, RLS applies) |
| Storage | `v8-drawings.sql:27-29, 201-222` | PRIVATE bucket `project-drawings`, path `{project_id}/{drawing_id}/v{n}/{filename}`, RLS on first path segment, **NO update/delete policies — blobs are immortal evidence** |
| Context | `src/contexts/DrawingsContext.tsx` | 25MB hard cap (`:21`), signed URLs 1h TTL (`:22`), PDF/JPEG/PNG only (`:23`), realtime channel `drawings-${projectId}` (`:172`) |
| Upload UX | `src/components/drawings/DrawingUploadSheet.tsx:25-28` | `SOFT_LIMIT = 5MB` (warn), `HARD_LIMIT = 25MB` (reject) — already implements the CLAUDE.md "warn on >5MB" constraint |
| Per-item UI | `src/components/ProgressItemCard.tsx:229-231, 280` | 圖則 (n) kebab row toggles `DrawingsSection` inside the expanded leaf card |
| Providers | `src/pages/ProjectDetail.tsx:59`, `src/pages/SiList.tsx:44`, `src/pages/SiDetail.tsx:492` | `DrawingsProvider` mounted in three places |
| Viewer | `src/components/drawings/DrawingViewer.tsx` | Lazy-loaded PDF/image viewer with version history |

### 0.2 Hard constraints discovered

1. **SI payloads reference `drawing_versions.id`.** `SiPayload.drawing_version_ids: string[]`
   (`src/types.ts:356`) is stored inside immutable `si_versions.payload` JSONB and picked in
   `src/components/si/SiSubmitForm.tsx:128` via `useDrawings()`. Any migration **must keep those
   UUIDs resolvable** — we therefore migrate with *id preservation* (new rows reuse the same UUIDs).
2. **Per-project membership role, not global role, governs rights** — the v27 lesson
   (`supabase/v27-progress-rights-by-membership.sql:1-26`). All new RLS helpers must gate on
   `project_members.role` + `status='approved'` (plus admin / `assigned_pm_ids`).
3. **Storage blobs are immortal** (`supabase/v8-private-bucket-template.sql §4`). We must NOT copy
   or move existing blobs (would double Free-tier usage) — migrated rows keep pointing at the
   `project-drawings` bucket.
4. **Old clients keep running.** iOS v1.3 in the wild writes to `drawings`/`drawing_versions`
   directly. New tables only; old write paths must keep functioning and their data must appear in
   the new register (sync trigger, §4.3).
5. **Feature flag precedent exists**: `app_config.ptw_enabled` + `get_ptw_enabled`/`set_ptw_enabled`
   RPCs (`supabase/v10-split/7-ptw-enabled-rpcs.sql`, `src/hooks/usePtwEnabled.ts`,
   `src/contexts/PtwFlagContext.tsx`). We clone this pattern for `files_enabled`.
6. **Image compression exists**: `src/lib/image-compress.ts` (1920px / q0.82 → ~300-600KB). PDFs
   cannot be compressed client-side → keep the 5MB soft-warn / 25MB hard-cap from DrawingUploadSheet.
7. Latest migration is `v37-ptw-safety-officer-staffing.sql` → **new migration is v38**.

---

## 1. Data model — `supabase/v38-documents-schema.sql`

New tables only. `drawings` / `drawing_versions` are untouched (kept live for old clients during
the dual-write window, frozen later — never dropped).

### 1.1 `documents` (the register header)

```sql
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  progress_item_id uuid references progress_items(id) on delete set null, -- NULL = project-level doc
  document_type text not null check (document_type in
    ('material_submission','method_statement','drawing','inspection','other')),
  title text not null,
  doc_number text,                       -- 'MAT-001' / 'MS-003' / 'DWG-012' — per-project sequence
  current_version_id uuid,               -- FK added after document_versions exists (v8 pattern)
  created_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  legacy_drawing_id uuid                  -- set on rows mirrored/backfilled from drawings
);
```

Notes:
- `progress_item_id` is **nullable** — material submissions usually attach to a finishing-schedule
  leaf item, but contracts/programmes/project-wide method statements live at project level.
  When non-null, a leaf-only trigger applies (reuse the `assert_progress_item_is_leaf` shape from
  `v8-drawings.sql:66-80`, tolerant of NULL).
- No `zone_id` column — browse-by-zone derives from the joined progress item
  (`progress_items.zone_id`, `v3-progress-schema.sql:16`). Avoids a denormalised field that goes
  stale if an item is re-zoned.
- `doc_number`: human-citable register number, per project per type, generated by a
  `next_document_number(p_project_id, p_type)` RPC backed by a `document_counters` table with row
  locks (same idea as `v11-next-progress-code.sql`). Prefix map: MAT / MS / DWG / INS / DOC.
- **Backfilled/mirrored rows reuse the drawing's UUID** (`documents.id = drawings.id`,
  `document_versions.id = drawing_versions.id`) — this is what keeps `SiPayload.drawing_version_ids`
  resolvable against the new table with zero data rewrite (constraint 0.2-1).

### 1.2 `document_versions` (revisions; the workflow + audit trail lives here)

```sql
create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no int not null,
  revision_label text,                   -- ≤16 chars, 'Rev A'; defaults to v{n} in app
  bucket_id text not null default 'project-docs'
    check (bucket_id in ('project-docs','project-drawings')),
  file_path text not null,               -- {project_id}/{document_id}/v{n}/{filename}
  thumb_path text,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null,
  status text not null default 'submitted' check (status in
    ('draft','submitted','approved','rejected','superseded','withdrawn')),
  submitted_by uuid references user_profiles(id) on delete set null,
  submitted_at timestamptz default now(),
  reviewed_by uuid references user_profiles(id) on delete set null,   -- approver/rejecter
  reviewed_at timestamptz,
  review_note text,                      -- rejection reason / approval comment
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  legacy_drawing_version_id uuid,
  unique (document_id, version_no)
);

alter table documents add constraint documents_current_version_fk
  foreign key (current_version_id) references document_versions(id) on delete set null;
```

Design decision — **status lives on the version, not the header**: a submission cycle is per
revision (Rev A submitted → rejected → Rev B submitted → approved). The register UI derives the
document's display status from `current_version_id`'s status. This generalises the drawings model
(`current/superseded/withdrawn`) into the full submission workflow. `bucket_id` lets migrated rows
keep their blobs in `project-drawings` (constraint 0.2-3) while new uploads go to `project-docs`.

Status transitions (enforced inside RPCs, §1.4):

```
submitted ──approve──▶ approved          (reviewer)
submitted ──reject───▶ rejected          (reviewer, review_note required)
submitted/approved/rejected ──new version uploaded──▶ superseded (supersede RPC)
own version ──withdraw──▶ withdrawn      (uploader or admin; current pointer rebinds)
'draft' is reserved in the enum for a future save-before-submit flow; v1 uploads land as 'submitted'.
```

### 1.3 `document_events` (append-only audit trail)

Core value is "a shared audit trail that survives disputes" — make every transition an immutable row:

```sql
create table document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  event_type text not null check (event_type in
    ('created','version_uploaded','submitted','approved','rejected','superseded','withdrawn','migrated')),
  actor_id uuid references user_profiles(id) on delete set null,
  note text,
  created_at timestamptz default now()
);
```

Written by the RPCs (not by clients directly). RLS: SELECT for `can_view_project`; **no
INSERT/UPDATE/DELETE policies for clients** (rows only appear via the RPC bodies, which are
`security definer` for the event-insert step only, or via a `security definer` helper
`log_document_event(...)`).

### 1.4 RPCs

| RPC | Rights model | Behaviour |
|---|---|---|
| `next_document_number(p_project_id, p_type)` | `can_upload_document` | Locks `document_counters` row, returns `'MAT-007'` etc. |
| `supersede_document_version(p_document_id, p_version_no, p_bucket, p_file_path, p_thumb_path, p_mime, p_size, p_revision_label, p_submitted_by)` | invoker (RLS applies) — clone of `supersede_drawing_version` (`v8-drawings.sql:115-156`) | Insert new version `status='submitted'` + mark previous non-withdrawn versions `superseded` + repoint `current_version_id` + log events — one transaction |
| `review_document_version(p_version_id, p_action 'approve'\|'reject', p_note)` | invoker; UPDATE policy gated on `can_review_document`; **self-review blocked in body** (`submitted_by <> auth.uid()` unless admin) | Sets status/reviewed_by/reviewed_at/review_note + logs event |
| `withdraw_document_version(p_version_id)` | uploader-or-admin (mirrors `"Uploader or admin withdraws"`, `v8-drawings.sql:194-199`) | Withdraw + rebind `current_version_id` to highest non-withdrawn (moves the client-side rebind logic of `DrawingsContext.tsx:390-442` into one transaction — fixes that known multi-step race) |
| `get_files_enabled()` / `set_files_enabled(boolean)` | any authenticated / admin only | Clone of `v10-split/7-ptw-enabled-rpcs.sql` over a new `app_config.files_enabled boolean not null default false` column |

### 1.5 RLS helpers + policies (per-project membership roles, per v27)

```sql
-- Upload: 判頭 INCLUDED — material submissions & method statements are prepared by the
-- subcontractor and reviewed upward. This deliberately differs from can_upload_drawing (D-25).
create or replace function can_upload_document(p_user_id uuid, p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
  or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
  or exists (select 1 from project_members
             where user_id = p_user_id and project_id = p_project_id and status = 'approved'
               and role in ('pm','general_foreman','main_contractor','subcontractor'));
$$;

-- Review (approve/reject): supervisors only — matches can_manage_project_progress (v27) membership set.
create or replace function can_review_document(p_user_id uuid, p_project_id uuid)
returns boolean ... role in ('pm','general_foreman','main_contractor') ...;
```

Policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `documents` | `can_view_project(auth.uid(), project_id)` | `can_upload_document(...)` **AND** `(document_type <> 'drawing' OR can_upload_drawing(...))` — keeps D-25 parity: 判頭 may submit MAT/MS/INS but not issue drawings | title/metadata edit: creator or `can_review_document` | none (immortal register) |
| `document_versions` | join to parent doc + `can_view_project` | join + `can_upload_document` (+ drawing-type carve-out as above) | two policies: uploader-or-admin (withdraw path) OR `can_review_document` (review path) | none |
| `document_events` | join + `can_view_project` | none (RPC-only) | none | none |

Realtime: `alter publication supabase_realtime add table documents, document_versions;`
(events table not published — fetched on demand in the detail view).

Indexes: `documents(project_id)`, `documents(progress_item_id)`,
`documents(project_id, document_type)`, `document_versions(document_id)`,
`document_versions(status)`.

---

## 2. Storage layout

### 2.1 Bucket

New PRIVATE bucket `project-docs`, instantiated from `v8-private-bucket-template.sql` exactly like
`v9-si-vo-storage-bucket.sql` did:

```
Path:  {project_id}/{document_id}/v{version_no}/{filename}
       {project_id}/{document_id}/v{version_no}/thumb.jpg
RLS:   SELECT  → can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
       INSERT  → can_upload_document(auth.uid(), (storage.foldername(name))[1]::uuid)
       NO update / delete policies — blobs are immortal evidence (template §4)
```

Client mirrors the defence-in-depth `filePath.startsWith(`${projectId}/`)` assertion
(`DrawingsContext.tsx:248`) and the strict `sanitizeFilename` (`src/lib/drawings.ts:38-53`) via a
new `src/lib/documents.ts` (path helpers `docsPathFor` / `docsThumbPathFor`, type/status ZH label
maps, prefix map for numbering).

**Migrated drawings never move**: their `document_versions.bucket_id = 'project-drawings'` and
`file_path` is byte-identical to the old row. `getViewerUrl` simply signs against
`version.bucket_id` instead of the hard-coded `BUCKET` constant (`DrawingsContext.tsx:20, 448-453`).

### 2.2 Free-tier budget (1GB) — concrete numbers + guardrails

Realistic finishing schedule: ~100 leaf items × 2–3 document types × ~2 revisions ≈ 400–600 files
per project. At uncompressed iPhone-photo/PDF sizes (~3–5MB) that bursts 1GB on a single project,
so guardrails are mandatory:

1. **Images: always compress before upload** via `compressImage` (`src/lib/image-compress.ts:13`,
   1920px / q0.82 → ~300–600KB). DocumentUploadSheet calls it unconditionally for `image/*` —
   same as `PtwPhotoPicker.tsx:39`.
2. **PDFs: 5MB soft warn / 25MB hard cap** — reuse the exact `SOFT_LIMIT`/`HARD_LIMIT` UX from
   `DrawingUploadSheet.tsx:25-28` (amber banner 「檔案大於 5MB，建議先壓縮再上載」; red reject at 25MB).
3. **Thumbnails**: reuse `generateThumbnail` (`src/lib/thumbnails.ts`) — JPEG thumbs are ~30KB,
   negligible, and they make the register grid browsable without signing full files.
4. **Visible usage meter**: Files page header shows `sum(size_bytes)` for the project
   (one aggregate query over `document_versions`) as 「已用儲存空間 ~XXX MB」 with an amber state
   ≥700MB account-wide. This is the cheap early-warning before a paid-tier decision.
5. Signed URLs only, 1h TTL — same as `SIGNED_URL_TTL` (`DrawingsContext.tsx:22`); never
   `getPublicUrl` on a private bucket (PITFALLS C1).

---

## 3. UI (zh-HK)

### 3.1 Naming

Feature name: **文件** (register page title 「文件總覽」). Type labels
(`DOCUMENT_TYPE_ZH` in `src/types.ts`):

| key | zh-HK | doc_number prefix |
|---|---|---|
| `material_submission` | 物料送審 | MAT |
| `method_statement` | 施工方案 | MS |
| `drawing` | 圖則 | DWG |
| `inspection` | 檢驗記錄 | INS |
| `other` | 其他文件 | DOC |

Status labels (`DOCUMENT_STATUS_ZH`): 草稿 / 已送審 / 已批准 / 已拒絕 / 已取代 / 已撤回 — colour
language follows house conventions (amber=已送審 pending, green=已批准, red=已拒絕,
site-grey=已取代/已撤回), matching the badge palette in CLAUDE.md.

### 3.2 Project-level file system view — `src/pages/ProjectFiles.tsx`

Route `/project/:id/files` (pattern of `/project/:id/materials` etc., `src/App.tsx:94-98`),
lazy-loaded, wrapped in `DocumentsProvider`. Entry points:
- a 5th card in `ToolsSwitcher` (`ProjectDetail.tsx:550-611`): 📁 文件 — 「物料送審 · 施工方案 · 圖則 · 檢驗記錄」
- a Sidebar item (desktop) next to the existing per-project tools.
(Do **not** add a 5th top tab — the 4-tab strip is already full at 390px.)

Layout (mobile-first, 390px):
```
┌──────────────────────────────────────────┐
│ ← 文件總覽            已用空間 ~120MB  ⟳ │
│ [搜尋 標題 / 編號…………………………… 🔍]          │
│ 類型: [全部][物料送審][施工方案][圖則][檢驗][其他] │  ← horizontal chip row
│ 狀態: [全部][已送審][已批准][已拒絕]          │  ← second chip row
│ 檢視: [按進度項目 ▾]  (按類型 / 按狀態)       │
├──────────────────────────────────────────┤
│ ▸ 3/F 油漆工程 (P-3-12)        4 份文件    │  ← group = leaf progress item
│   ┌ MAT-007 乳膠漆色板  Rev B  🟢已批准 ┐   │     (code+title from progress_items)
│   └ MS-002  油漆施工方案 v1   🟡已送審 ┘   │
│ ▸ 未連結項目 (工地整體)         2 份文件    │  ← progress_item_id IS NULL group
└──────────────────────────────────────────┘
│ (+) 上載文件                              │  ← FAB, visible if can_upload_document
```
- "按進度項目" grouping is the default — it IS the finishing-schedule view the問題 statement asks
  for. Group headers show `progress_items.code + title + zone` (zone via
  `project.zones.find(...)`, as `ProgressItemCard.tsx:104-108` already does).
- Row tap → DocumentDetailSheet: version list (Rev/date/uploader/status/size), 批核 / 拒絕 buttons
  for reviewers on `submitted` versions (rejection requires a note → `review_note`), 上載新版本,
  撤回, full event timeline from `document_events` (the audit trail rendered as
  「張三 已批准 Rev B · 2026-06-11 14:30」).
- Tap a version → viewer (generalised `DrawingViewer`, §3.4).

### 3.3 Per-progress-item documents panel — `src/components/documents/DocumentsSection.tsx`

Drop-in successor of `DrawingsSection` in the expanded leaf card:
- `ProgressItemCard.tsx:229-231` kebab row 「圖則 (n)」 → 「文件 (n)」 (count = documents where
  `progress_item_id === item.id`); `:280` renders `<DocumentsSection progressItemId={item.id} />`.
- Inside: type-chip filter + the same 2/4-column thumbnail grid as `DrawingsSection.tsx:205-275`,
  each tile badged with type (物料/方案/圖則/檢驗) and status pill; 上載文件 button opens
  DocumentUploadSheet pre-linked to this item.
- 「在文件總覽開啟」 link → `/project/:id/files?item=<id>` for the full-register context.

### 3.4 Components (new `src/components/documents/`, mirroring `drawings/`)

| Component | Source of truth to copy from | Delta |
|---|---|---|
| `DocumentsSection.tsx` | `drawings/DrawingsSection.tsx` | type chips, status pills, can_upload includes 判頭 (except type=圖則) |
| `DocumentUploadSheet.tsx` | `drawings/DrawingUploadSheet.tsx` | adds 類型 picker + optional 進度項目 picker (leaf items only) + auto doc_number preview; keeps 5MB warn / 25MB cap; compresses images |
| `DocumentViewer.tsx` | `drawings/DrawingViewer.tsx` | generalise props from `(drawing, version)` to `(title, versions, bucket-aware signer)`; keep lazy `viewer-pdf` chunking (`vite.config.ts` manualChunks) |
| `DocumentVersionHistory.tsx` | `drawings/DrawingVersionHistory.tsx` | adds status + reviewer + review_note per row |
| `DocumentReviewBar.tsx` | new | 批核 ✓ / 拒絕 ✗ (+note modal), rendered only when `can_review` and current version is 已送審 |
| `ProjectFiles.tsx` (page) | new | §3.2 |

### 3.5 Context — `src/contexts/DocumentsContext.tsx`

Mirrors `DrawingsContext` shape exactly (project-scoped provider, named context export for the
optional-hook pattern used by `ProgressItemCard.tsx:17-19`):

```ts
interface DocumentsContextType {
  projectId: string
  documents: Document[]
  versionsByDocument: Record<string, DocumentVersion[]>
  uploaderNameById: Record<string, string>
  loading: boolean; fetchError: string | null
  uploadDocument(args: { documentType, title, file, progressItemId?, revisionLabel?, onProgress? })
  uploadVersion(args: { documentId, file, revisionLabel?, onProgress? })   // → supersede RPC
  reviewVersion(versionId, action: 'approve'|'reject', note?)             // → review RPC
  withdrawVersion(versionId)                                              // → withdraw RPC
  getViewerUrl(v) / getThumbUrl(v)   // signs against v.bucket_id, not a constant
  canUpload: boolean; canReview: boolean   // computed from memberships, mirrors DB helpers
}
```
Realtime channel `documents-${projectId}` on both tables with the same
`debounce(refetch, REFETCH_DEBOUNCE_MS)` pattern (`DrawingsContext.tsx:170-188`).
Mounted in `ProjectDetail.tsx` next to the existing providers (`:57-65`) and in `ProjectFiles.tsx`.

### 3.6 Push (OneSignal budget)

One new trigger file in `v5-split/` style, firing on exactly two events to avoid spam:
- version `submitted` → notify project reviewers (PM + main_contractor members): 「📄 MAT-007 物料送審已提交，待批核」
- version `approved`/`rejected` → notify `submitted_by` only: 「✅ MAT-007 已批准 / ❌ 已拒絕（附原因）」
No notifications for uploads of new revisions of already-rejected docs beyond the standard
submitted event, none for withdraw/supersede.

---

## 4. Problem 6 — migrating drawings into the file system without breaking live users

### 4.1 Strategy in one line

**Expand-and-contract with id-preserving backfill + one-directional sync trigger; old clients keep
writing `drawings`, new clients read only `documents`; flip the write path in a later release.**

### 4.2 Backfill (inside v38, single transaction)

```sql
-- 1. Headers (id preserved!)
insert into documents (id, project_id, progress_item_id, document_type, title,
                       created_by, created_at, updated_at, legacy_drawing_id)
select d.id, d.project_id, d.leaf_item_id, 'drawing', d.title,
       d.created_by, d.created_at, d.updated_at, d.id
from drawings d
on conflict (id) do nothing;

-- 2. Versions (id preserved; blobs stay in project-drawings; status mapped)
insert into document_versions (id, document_id, version_no, revision_label, bucket_id,
       file_path, thumb_path, mime_type, size_bytes, status,
       submitted_by, submitted_at, superseded_at, withdrawn_at, legacy_drawing_version_id)
select v.id, v.drawing_id, v.version_no, v.revision_label, 'project-drawings',
       v.file_path, v.thumb_path, v.mime_type, v.size_bytes,
       case v.status when 'current' then 'approved'        -- drawings had no review cycle;
                     when 'superseded' then 'superseded'   -- current = the issued/operative one
                     when 'withdrawn' then 'withdrawn' end,
       v.uploaded_by, v.uploaded_at, v.superseded_at, v.withdrawn_at, v.id
from drawing_versions v
on conflict (id) do nothing;

-- 3. Current pointers + one 'migrated' event per document
update documents dd set current_version_id = d.current_version_id
  from drawings d where d.id = dd.id;
```

Because ids are preserved, `SiPayload.drawing_version_ids` (`src/types.ts:356`) resolves against
`document_versions` with no payload rewrite, and `SiSubmitForm`'s picker can be re-pointed from
`useDrawings()` (`SiSubmitForm.tsx:22`) to `useDocuments()` filtered to `document_type='drawing'`
in the same release.

### 4.3 Dual-write window (sync trigger, also in v38)

Old clients (iOS v1.3) keep inserting into `drawings`/`drawing_versions` and calling
`supersede_drawing_version`. Three `security definer` AFTER triggers mirror forward:

- `AFTER INSERT ON drawings` → upsert `documents` (same id, type `drawing`).
- `AFTER INSERT ON drawing_versions` → upsert `document_versions` (same id, bucket
  `project-drawings`, status map as §4.2).
- `AFTER UPDATE ON drawings / drawing_versions` → propagate `current_version_id` /
  superseded/withdrawn transitions.

**One direction only — no recursion risk.** During the window, the NEW client also writes
`document_type='drawing'` uploads through the *legacy* path (`drawings` insert +
`supersede_drawing_version`), letting the trigger mirror them forward. Result: old clients see
every drawing (their table is still the write path); new clients see everything (documents is a
superset). All other document types write directly to `documents` and are simply invisible to old
clients — acceptable, they never had those features.

### 4.4 Client-side deprecation (app v1.4, behind `files_enabled`)

| Flag OFF (default at ship) | Flag ON |
|---|---|
| `DrawingsSection` renders as today | `ProgressItemCard` kebab row 「圖則 (n)」→「文件 (n)」, renders `DocumentsSection`; the "view drawing" affordance now opens the PDF **from the documents register** (same blobs, signed via `bucket_id`) |
| Tools tab has no 文件 card | 文件 card + `/project/:id/files` route live (route itself gated like `PtwGate`, `src/App.tsx:90-92`) |
| `SiSubmitForm` picks from `useDrawings()` | picks from `useDocuments()` type=`drawing` (ids identical → payload format unchanged) |

`FilesFlagProvider` clones `PtwFlagContext.tsx` over `get_files_enabled`/`set_files_enabled`; the
admin toggle sits next to the PTW toggle in AdminProjects. This doubles as the Apple-review staging
gate, same as PTW's C3 rationale.

### 4.5 Contract phase (later, v39 + app v1.5)

When v1.3/v1.4-flag-off sessions ≈ 0 (observable via OneSignal/app-version telemetry):
1. **v39-documents-write-flip.sql**: revoke the legacy write path — replace the
   `"Editors insert drawings"` / version-insert policies (`v8-drawings.sql:169-192`) with
   deny-all (or `false`) policies; keep SELECT policies forever (old read-only clients may linger);
   drop the sync triggers.
2. App v1.5: `DocumentsContext.upload` for type=`drawing` now inserts directly into `documents`;
   delete `src/components/drawings/` UI components and slim `DrawingsContext` away (the
   `DrawingsProvider` mounts at `ProjectDetail.tsx:59`, `SiList.tsx:44`, `SiDetail.tsx:492` are
   replaced by `DocumentsProvider`).
3. `drawings`/`drawing_versions` tables and the `project-drawings` bucket are **never dropped** —
   immortal evidence + the migrated `document_versions.bucket_id='project-drawings'` rows point
   into that bucket permanently.

---

## 5. Phased implementation plan

| Phase | Deliverable | Files | Gate |
|---|---|---|---|
| **A — DB (v38)** | `supabase/v38-documents-schema.sql`: tables (§1.1–1.3) + `document_counters` + bucket `project-docs` + RLS helpers/policies (§1.5, §2.1) + RPCs (§1.4) + `app_config.files_enabled` + backfill (§4.2) + sync triggers (§4.3) + realtime + verification queries (v8 footer style) | one migration file (split into `v38-split/` if >~600 lines, per v5/v9/v10 precedent) | rls-smoke additions in `supabase/tests/rls-smoke.sql`: 判頭 can insert MAT but not DWG; worker/owner read-only; reviewer can approve, submitter cannot self-approve; non-member sees nothing; storage path probe |
| **B — types + lib + context** | `Document`, `DocumentVersion`, `DocumentEvent`, `DocumentType`, `DocumentStatus`, `DOCUMENT_TYPE_ZH`, `DOCUMENT_STATUS_ZH` in `src/types.ts` (next to the Drawing block at `:295-329`); `src/lib/documents.ts` (paths, sanitize re-export, prefix map); `src/contexts/DocumentsContext.tsx` (§3.5); `src/contexts/FilesFlagContext.tsx` | `tsc` clean; dev-only console.asserts in lib (drawings.ts:58 pattern) |
| **C — per-item panel swap** | `components/documents/*` (§3.4); `ProgressItemCard` 圖則→文件 swap behind flag; `SiSubmitForm` re-point; `DocumentsProvider` mounted in `ProjectDetail`/`SiList`/`SiDetail` alongside (not yet replacing) `DrawingsProvider` | flag OFF → pixel-identical to today; flag ON → drawings visible as 圖則-type documents |
| **D — Files page** | `src/pages/ProjectFiles.tsx` + route + ToolsSwitcher card + Sidebar entry + storage meter + push trigger SQL (`v5-split/` style, §3.6) | test at 390px and 1600×900 BlueStacks per CLAUDE.md before merge |
| **E — rollout** | flag ON for test project `cccc2026-…26202620` → daily-sim event (`.claude/skills/daily-sim`) covering submit→reject→resubmit→approve chain incl. denial directions → flag ON globally → App Store v1.4 | monitor; then Phase F |
| **F — contract (later)** | `v39-documents-write-flip.sql` + app v1.5 removal of `drawings/` UI (§4.5) | only when old-version sessions ≈ 0 |

## 6. Version bump + rollout notes

- **DB**: `v38-documents-schema.sql` (additive only — safe to run while v1.3 clients are live;
  triggers and new tables are invisible to them). `v39-documents-write-flip.sql` deferred and
  explicitly NOT safe until old clients are gone.
- **App**: v1.3 → **v1.4** (`ios/App` marketing version + codemagic workflows). Ship with
  `files_enabled=false`; flip server-side after store approval — no client release needed to
  activate (PTW precedent). App Store「新功能」note: 「新增文件總覽 — 物料送審、施工方案、圖則、
  檢驗記錄一站式管理，並與裝修進度表逐項連結」.
- **Apple compliance**: no new auth flow, no new role; `safety_officer`/all roles inherit existing
  account-deletion (v6/v9/v20 cascades cover the new FKs via `on delete set null` to
  `user_profiles`) — verify `v20-delete-account-fk-cascade.sql` enumeration is extended for
  `documents.created_by`, `document_versions.submitted_by/reviewed_by`, `document_events.actor_id`.
- **Storage**: watch the 1GB meter (§2.2-4); the migration itself adds **zero** storage (no blob copies).
- **Risk register**: (1) sync-trigger status-map drift — covered by rls-smoke + daily-sim assertions
  comparing a freshly inserted legacy drawing against its mirrored document row; (2) signed-URL
  signer must branch on `bucket_id` — a missed branch 404s every migrated drawing (test explicitly);
  (3) `document_counters` contention is negligible at this scale but the RPC must still
  `select ... for update`.
