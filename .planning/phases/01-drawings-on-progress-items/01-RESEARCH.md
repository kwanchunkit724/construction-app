# Phase 1: 圖則附加 (Drawings on Progress Items) — Research

**Researched:** 2026-05-11
**Domain:** Versioned drawing attachments on leaf `progress_items`, private Supabase Storage, mobile pinch-zoom + PDF viewer, plus cross-cutting infrastructure (RLS template, bundle-split + CI guard, Playwright smoke skeleton)
**Confidence:** HIGH for stack/architecture (already locked in upstream research), HIGH for codebase touchpoints (verified by file reads), MEDIUM-HIGH for PDF.js + Capacitor file:// gotchas (verified by docs, not yet device-tested)

---

## Summary

This phase ships the smallest of the three milestone features but also establishes the *patterns* that Phase 2 (SI/VO) and Phase 3 (PTW) will reuse: the private-storage RLS template, the `v8-*` migration namespace, the Vite `manualChunks` split + bundle-size CI guard, and the Playwright smoke skeleton. All 34 decisions in `01-CONTEXT.md` are locked — no library or schema choices remain open.

The brownfield surface area is well-mapped: drawings attach to leaf `progress_items` rows (the existing `progress_items` table already exists in `supabase/v3-progress-schema.sql`); RLS helpers `can_view_project(uid, project_id)` and `can_edit_project_progress(uid, project_id)` already exist with the exact `SECURITY DEFINER SET search_path = public` shape required (verified at `supabase/v3-progress-schema.sql:33-71`). There is **no existing "leaf-item detail screen"** — leaf items are rendered inline as `<ProgressItemCard>` cards inside `src/pages/ProjectDetail.tsx`; the new "圖則 (N)" section lands inside that card or in a new dedicated detail page.

There is **no existing photo-viewer modal**. `src/pages/IssueDetail.tsx:188-202` renders issue photos as a plain 3-column grid of `<a target="_blank"><img></a>` (no in-app viewer, no zoom). The Phase 1 `DrawingViewer` is therefore net-new code, not a reuse — but the existing `Modal.tsx` base and `CreateIssueModal.tsx` upload-with-progress pattern are direct templates.

**Primary recommendation:** Wave 0 = ship the `v8-drawings.sql` migration + private bucket + RLS template **and** the Vite manualChunks split + CI guard **before** any UI work, because the bundle-split + CI guard are the foundation that every later phase inherits, and without RLS in place the upload code can't be unit-tested.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

All 34 D-* decisions in `.planning/phases/01-drawings-on-progress-items/01-CONTEXT.md` are locked. Highlights:

- **D-01..D-04 — Upload UX:** Bottom sheet with three options (📷 拍攝 / 🖼️ 從相簿選擇 / 📁 從檔案選擇). Multi-file up to 5/batch. Per-file progress bar. Soft warning >5 MB, hard block >25 MB.
- **D-05..D-08 — Data model:** Two tables `drawings` + `drawing_versions`. New version supersedes; hard delete forbidden in UI (status `withdrawn` only). Revision label = free text ≤16 chars, defaults to `v{version_no}`.
- **D-09..D-13 — Viewer:** Full-screen modal (not a route). `react-zoom-pan-pinch@^4.0.3` + `react-pdf@^10.4.1`, both lazy-loaded. PDF.js worker self-hosted via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`. Version history in top-right "📋 版本記錄" button.
- **D-14..D-16 — Thumbnails:** Client-side Canvas, 256×256 JPEG quality 0.8, stored alongside file. Fail-soft to category icon on generation failure.
- **D-17..D-20 — Storage + RLS:** Bucket `project-drawings`, private. Path `{project_id}/{drawing_id}/v{version_no}/{filename}` + `thumb.jpg`. Reuse existing `can_view_project` / `can_edit_project_progress` helpers + new `can_upload_drawing` (= same as `can_edit_project_progress`). Signed-URL TTL 1 hour.
- **D-21..D-24 — Listing:** "圖則 (N)" section appears ABOVE issues section. 2-col grid mobile / 4-col BlueStacks. Default sort `created_at DESC`. Search by title substring, debounce 200ms.
- **D-25..D-27 — Role gating:** Upload visible to `admin/pm/main_contractor` AND project member. Withdraw visible to original uploader OR admin only. Server-side via RLS.
- **D-28 — Notifications:** Push on drawing upload **OFF in v1**.
- **D-29..D-31 — Build/CI:** Vite manualChunks split (`viewer-pdf`, `viewer-zoom`) + ride-along split of `xlsx`, `jspdf`, `recharts`. CI fails if entry chunk >800 KB or any new chunk >400 KB. Playwright smoke `tests/e2e/drawings.spec.ts` — ONE test only.
- **D-32..D-34 — Ride-alongs:** `demo_feedback` RLS fix folded into `v8-drawings.sql`. Migration namespace `v8-*`. Chinese strings remain inline; `drawing_status` ZH map added to `src/types.ts`.

### Claude's Discretion

- Exact thumbnail-generation algorithm (Canvas API specifics beyond JPEG quality 0.8)
- shadcn/Tailwind component selection for bottom sheet (existing modal patterns prevail — `src/components/Modal.tsx`)
- Error toast wording precision
- Whether to compress non-PDF images before upload (decide during implementation based on file-size)
- Folder structure under `src/components/drawings/` (DrawingThumbnail, DrawingViewer, DrawingUploadSheet — exact file split)
- Whether `DrawingViewer` is one component with mode prop or two components (PDF vs image)
- Internal API surface of the new `drawings` module in `src/lib/`

### Deferred Ideas (OUT OF SCOPE)

- Drawing markup / annotation tools
- Cross-project template drawings (each project has own copies in v1)
- Server-side thumbnail Edge Function
- Push notification on new drawing upload (defer to v1.x to preserve push budget for SI/VO/PTW)
- Chinese-aware sort (pinyin / stroke count) — `created_at DESC` is sufficient
- Multi-file drag-drop on desktop
- Drawing comments / discussion threads

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRW-01 | PM/MC/admin uploads JPEG/PNG/PDF to leaf | D-01..D-04 + RLS via `can_edit_project_progress`; leaf-only trigger described in §Migration File Outline |
| DRW-02 | Versioning fields (version_no, uploaded_by, uploaded_at, revision label) | D-05; `drawing_versions` table schema below |
| DRW-03 | New version supersedes; never deletes prior | D-05, D-08; `is_current=false` + `superseded_at` on old rows in a single transaction |
| DRW-04 | All project members view; non-members cannot | RLS `can_view_project(auth.uid(), project_id)` (existing) |
| DRW-05 | Mobile pinch-zoom viewer, lazy-loaded | D-09..D-10; `react-zoom-pan-pinch` lazy via `React.lazy()` |
| DRW-06 | PDF page-by-page with self-hosted worker | D-11..D-12; `pdfjs-dist/build/pdf.worker.min.mjs` via Vite `new URL(..., import.meta.url)` |
| DRW-07 | Client-side 256×256 thumbnail | D-14..D-16; Canvas API + `react-pdf` page-1 render |
| DRW-08 | Soft warn >5 MB, hard block >25 MB | D-04 |
| DRW-09 | Version history with effective dates | D-13; computed from `is_current` + `superseded_at` columns |
| DRW-10 | Visually distinct current/superseded/withdrawn badges, ≥16pt | D-22; PITFALLS M2 — `text-green-700 bg-green-100`, grey strike-through, red strike-through |
| DRW-11 | No hard-delete once viewed by non-uploader; withdraw only | D-08; status field `('current','superseded','withdrawn')` |
| DRW-12 | Private bucket with `(storage.foldername(name))[1] = project_id` RLS | D-17..D-19; pattern verified against CONCERNS.md template |
| DRW-13 | Signed URLs only, TTL ≤1 hour | D-20; `supabase.storage.from('project-drawings').createSignedUrl(path, 3600)` |
| DRW-14 | Default sort `created_at desc`; title substring search | D-23..D-24 |
| DRW-15 | subcon/subcontractor_worker/owner view-only | D-25; UI hides upload button, RLS rejects writes |
| INF-01 | Migration namespace `v8-*` | D-33; single file `supabase/v8-drawings.sql` |
| INF-02 | Reusable private-bucket SQL template | New file `supabase/v8-private-bucket-template.sql` — extracted helper macro reused by Phase 2+3 |
| INF-03 | New RLS helpers `security definer set search_path = public` (introduce) | D-19; `can_upload_drawing(uid, project_id)` added in v8 |
| INF-04 | `supabase/tests/rls-smoke.sql` 3-perspective harness (introduce) | New file; runs as admin / MC-of-A / subcon-of-B and asserts `select count(*)` on `drawings` |
| INF-05 | `demo_feedback` RLS fix | D-32; ride-along in `v8-drawings.sql` — restrict `using (true)` to `global_role = 'admin'` |
| INF-06 | Vite manualChunks split | D-29; details in §Vite manualChunks Config below |
| INF-07 | Bundle-size CI check | D-30; `scripts/check-bundle-size.cjs` + Codemagic integration in §Bundle-Size CI Check |
| INF-08 (P1 share) | Playwright smoke `tests/e2e/drawings.spec.ts` | D-31; scaffolding in §Playwright Smoke Test Scaffolding |
| INF-09 | Inline Chinese; `DRAWING_STATUS_ZH` in `src/types.ts` | D-34; pattern matches existing `PROGRESS_STATUS_ZH`, `ISSUE_STATUS_ZH` |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| File picker (camera, gallery, file) | Browser / Capacitor WebView | — | Native plugin bridge; only the WebView has the picker UI |
| Upload to Storage | Browser → Supabase Storage | — | Direct client-to-Supabase; no server proxy exists in this app |
| Authorization (who can upload/view) | Database (RLS) | Browser (UI gate only) | RLS is source of truth per CONVENTIONS.md / ARCHITECTURE.md |
| Thumbnail generation | Browser (Canvas + pdfjs) | — | D-14 client-side; defer Edge Function unless slow on real devices |
| Signed URL minting | Database / Storage API | — | `createSignedUrl` is a Supabase-side operation |
| Realtime invalidation | Database → Browser (Realtime channel) | — | Same pattern as `ProgressContext`/`IssuesContext` |
| PDF rendering | Browser (pdfjs worker) | — | Lazy-loaded chunk + self-hosted worker |
| Pinch-zoom transforms | Browser (DOM events) | — | `react-zoom-pan-pinch` Pointer Events; no native plugin |
| Version-history queries | Database | Browser | Single `select * from drawing_versions where drawing_id = X order by version_no desc` |
| Bundle-size enforcement | CI (Codemagic) | Build step | Fails PR before merge; not a runtime concern |

---

## Standard Stack

All locked by upstream `.planning/research/STACK.md`. Versions confirmed in CONTEXT.md decisions D-10, D-11.

### Core (new in this phase)

| Library | Version | Purpose | Why Standard | Provenance |
|---------|---------|---------|--------------|------------|
| `react-zoom-pan-pinch` | ^4.0.3 | Pinch/pan/zoom wrapper for image + PDF viewer | Active, MIT, 1.9k stars, TS-native, dependency-free, ~12 KB | [CITED: STACK.md, GitHub BetterTyped/react-zoom-pan-pinch] |
| `react-pdf` | ^10.4.1 | PDF rendering (architects send PDF) | De-facto React wrapper around pdfjs-dist; MIT, 11.1k stars, React 19 OK, WebView-safe | [CITED: STACK.md, npm react-pdf] |
| `pdfjs-dist` | (peer-managed by react-pdf — do NOT install separately) | Worker file | Pinned by react-pdf's peer dep; mismatched versions break worker | [VERIFIED: STACK.md §Version Compatibility — "Don't install pdfjs-dist as a separate top-level dep"] |
| `@capacitor/camera` | ^8.x (matching Capacitor 8.3) | Native camera + gallery picker | Required by D-01 bottom sheet; not currently installed | [VERIFIED: grep — only mentioned in `.planning/` docs, NOT in `package.json`] |
| `@capacitor/filesystem` | ^8.x | Optional file picker on native | Required by D-01 third option (📁 從檔案選擇); HTML `<input type="file">` is fallback on web | [VERIFIED: grep — NOT in `package.json`] |

**Version verification:** STACK.md was researched 2026-05-11 (same day as this phase). Versions are current per upstream npm view. **[ASSUMED A1]** that `@capacitor/camera` and `@capacitor/filesystem` 8.x publish lines exist and are compatible with `@capacitor/core@8.3.1` — needs `npm view @capacitor/camera versions` at install time. Capacitor maintains plugin majors aligned to core majors, so this is low risk.

### Installation

```bash
# Web-only libs (pure JS — only need Vite rebuild after install)
npm install react-zoom-pan-pinch@^4.0.3 react-pdf@^10.4.1

# Native plugins — REQUIRE `npx cap sync ios && npx cap sync android` after install
npm install @capacitor/camera@^8 @capacitor/filesystem@^8
npx cap sync ios
npx cap sync android
```

After `cap sync`, iOS `Info.plist` already declares `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` in zh-HK (see `.planning/codebase/STACK.md` — Info.plist has Camera/Photos/Microphone usage strings). No new permission strings needed.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | (already installed ^0.363.0) | Icons for upload buttons, version-history button, badges | Match existing icon style |
| `@playwright/test` | (already installed ^1.59.1) | Smoke test (INF-08) | First test in repo — see §Playwright section |

### Alternatives Considered (REJECTED — per locked CONTEXT.md)

| Instead of | Could Use | Why Rejected |
|------------|-----------|--------------|
| `react-pdf` | Native Capacitor PDF viewer plugin | Adds native dependency; D-10 locks `react-pdf` |
| `react-zoom-pan-pinch` | `@use-gesture/react` + custom | Would save time only with annotation needs (deferred); D-10 locks the wrapper |
| Client-side thumbnails | Supabase Edge Function | Deferred per CONTEXT.md unless UAT shows slowness |

---

## Existing Code Analysis

### Where `progress_items` is queried (locations that need a "圖則" section added)

**Important finding:** There is no separate "leaf-item detail screen." Leaf items are rendered inline as `<ProgressItemCard>` cards inside `src/pages/ProjectDetail.tsx`. The `ProjectDetail.tsx` page hosts both `ProgressProvider` and `IssuesProvider` and renders the progress tree + issues list in a tabbed layout (`Tab = 'progress' | 'issues'`).

| File | Lines | Role |
|------|-------|------|
| `src/contexts/ProgressContext.tsx` | full file | Owns `progress_items` fetch + realtime subscription, scoped to `projectId`. Pattern to mirror for `DrawingsContext`. |
| `src/components/ProgressItemCard.tsx` | 66-257 | Renders one leaf or non-leaf item. Action buttons (`更新 / 指派 / 歷史 / 細項 / 刪除`) appear at line 178-236 when `canEdit && isLeaf`. **This is where a "🖼 圖則 (N)" button or section gets added** — either as another action button that opens a modal, OR as an expandable inline section beneath the action row. |
| `src/pages/ProjectDetail.tsx` | 17-19 (imports), 214-217 (handler wiring), 246-256 (modal mount) | Modal-orchestration pattern. `UpdateProgressModal`, `AssignmentModal`, `HistoryModal` are mounted at the page level with state held by `ProjectDetail`. **The drawings section / drawing modals follow this same pattern.** |
| `src/pages/Dashboard.tsx`, `src/contexts/ProgressContext.tsx`, `src/types.ts` | grep hits | Other `progress_items` references — read-only; no new code needed here unless the dashboard wants a "drawings count" stat (deferred). |

**Decision implication for planner:** The "Drawings section appears ABOVE the existing issues section" (D-21) is ambiguous in this codebase because there is no leaf-item detail screen with sections. Two viable options:

1. **Option A (recommended — minimum scope):** Add a `🖼 圖則 N` button to the `ProgressItemCard` action row (alongside `更新 / 指派 / 歷史`). Tap opens a new full-screen `<LeafItemDrawingsModal>` showing the drawings grid + search + upload button. Matches existing modal-orchestration idiom.

2. **Option B (more invasive):** Create a new route `/project/:id/item/:itemId` with a dedicated detail page. Add tabs/sections (圖則, 問題, 歷史). Higher cost; touches `src/App.tsx`, `BottomNav`, deep-link handling in `push.ts`.

CONTEXT.md says "leaf-item detail screen" — Option B reads more literally, but Option A matches the codebase's actual idiom and is strictly less risk. **Recommend Option A**; planner should make this explicit and confirm with user in plan review.

### Existing photo-upload pattern (the template to mirror)

**File:** `src/contexts/IssuesContext.tsx:105-115`

```ts
async function uploadPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!profile) return { url: null, error: '未登入' }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('issue-photos')
    .upload(fileName, file, { contentType: file.type, upsert: false })
  if (upErr) return { url: null, error: upErr.message }
  const { data } = supabase.storage.from('issue-photos').getPublicUrl(fileName)
  return { url: data.publicUrl, error: null }
}
```

**Differences for drawings:**
1. Bucket name: `project-drawings` (not `issue-photos`)
2. Path: `{project_id}/{drawing_id}/v{version_no}/{filename}` (NOT user-id prefixed — project-owned, not user-owned)
3. **Use `createSignedUrl(path, 3600)` NOT `getPublicUrl`** — bucket is private (PITFALLS C1 — public-bucket reflex is the #1 risk this phase prevents)
4. Add per-file progress tracking (D-03) — Supabase's `.upload()` does not natively expose progress; wrap with `XMLHttpRequest` for progress OR show indeterminate progress per-file and indicate completion. See [GitHub supabase-js#1057](https://github.com/supabase/supabase-js/discussions/1057) — accepted pattern is XHR fallback OR resumable upload via `@supabase/storage-js` resumable API.

**Upload-with-progress UI pattern:** `src/components/CreateIssueModal.tsx:52-79` (`onPickFiles`) shows the per-file slot state machine (`{ uploading, url, error, preview }`). The drawings sheet mirrors this with up to 5 slots (D-02).

### Existing photo viewer modal

**Finding:** There is **no in-app photo viewer**. Issue photos are displayed as a grid of `<a href={url} target="_blank">` (`src/pages/IssueDetail.tsx:188-202`). Tapping opens the browser/OS image viewer.

**Implication:** `DrawingViewer` is **net-new code** — there is no existing modal to extend. **Write fresh.** The CONTEXT.md reference to "`IssuePhotoViewer.tsx` (if exists)" is hypothetical; D-09 anticipates this and says "or creates a new shared `DrawingViewer.tsx`". Build it.

The closest reusable scaffolding is `src/components/Modal.tsx` (base modal). The new viewer is a full-screen variant; either extend `Modal.tsx` with a `variant="fullscreen"` prop or write `DrawingViewer.tsx` from scratch and inline the close-button + safe-area styling. **Recommend write-fresh** — fullscreen modal has different semantics (no scrim, swipe-down close).

### Existing RLS helpers (verify signatures)

**File:** `supabase/v3-progress-schema.sql:33-71`

```sql
create or replace function can_view_project(p_user_id uuid, p_project_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members
      where user_id = p_user_id and project_id = p_project_id and status = 'approved'
    );
$$;

create or replace function can_edit_project_progress(p_user_id uuid, p_project_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members
      where user_id = p_user_id and project_id = p_project_id and status = 'approved'
        and role in ('pm', 'main_contractor', 'subcontractor')
    );
$$;
```

**Signature match:** `(p_user_id uuid, p_project_id uuid) returns boolean`. **CONTEXT.md D-19 says `can_upload_drawing(uid, project_id) = same as can_edit_project_progress`** — but per D-25, only `admin/pm/main_contractor` can upload, **NOT** `subcontractor`. The existing `can_edit_project_progress` *does* include `subcontractor`. So either:

- **Option A:** Create new helper `can_upload_drawing(uid, project_id)` that excludes `subcontractor` (recommended — matches D-25 literally)
- **Option B:** Reuse `can_edit_project_progress` (looser; D-25 UI gating becomes the only barrier)

**Recommend Option A.** Server-side enforcement per D-27 ("Server-side enforcement via RLS — UI gating is convenience only"). The `subcontractor` role can update progress but not upload drawings — these are genuinely different permissions and warrant a distinct helper.

```sql
create or replace function can_upload_drawing(p_user_id uuid, p_project_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select
    exists (select 1 from user_profiles where id = p_user_id and global_role = 'admin')
    or exists (select 1 from projects where id = p_project_id and p_user_id = any(assigned_pm_ids))
    or exists (
      select 1 from project_members
      where user_id = p_user_id and project_id = p_project_id and status = 'approved'
        and role in ('pm', 'main_contractor')  -- NOTE: subcontractor excluded
    );
$$;
```

---

## Migration File Outline — `supabase/v8-drawings.sql`

Single file; runs once in Supabase Dashboard → SQL Editor; idempotent at top (drop ... if exists). Includes:

1. **Header comment block** identifying namespace decision (D-33: skip v5/v6/v7 contested).

2. **`v8-private-bucket-template.sql` extraction marker comment** — describes the reusable pattern for Phase 2+3 (INF-02). The template *itself* is a separate file (see below); v8-drawings.sql is the first *consumer*.

3. **Drop tables defensively:**
   ```sql
   drop table if exists drawing_versions cascade;
   drop table if exists drawings cascade;
   ```

4. **Create bucket (PRIVATE):**
   ```sql
   insert into storage.buckets (id, name, public)
   values ('project-drawings', 'project-drawings', false)
   on conflict (id) do nothing;
   ```

5. **Create tables** (per D-05):

   ```sql
   create table drawings (
     id uuid primary key default gen_random_uuid(),
     project_id uuid not null references projects(id) on delete cascade,
     leaf_item_id uuid not null references progress_items(id) on delete cascade,
     title text not null,
     current_version_id uuid,  -- FK added after drawing_versions exists (deferred)
     created_by uuid references user_profiles(id) on delete set null,
     created_at timestamptz default now(),
     updated_at timestamptz default now()
   );

   create table drawing_versions (
     id uuid primary key default gen_random_uuid(),
     drawing_id uuid not null references drawings(id) on delete cascade,
     version_no int not null,
     file_path text not null,                -- {project_id}/{drawing_id}/v{n}/{filename}
     thumb_path text,                        -- {project_id}/{drawing_id}/v{n}/thumb.jpg
     mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
     size_bytes bigint not null,
     revision_label text,                    -- ≤16 chars, defaults to v{n} in app
     status text not null default 'current'
       check (status in ('current','superseded','withdrawn')),
     uploaded_by uuid references user_profiles(id) on delete set null,
     uploaded_at timestamptz default now(),
     superseded_at timestamptz,
     withdrawn_at timestamptz,
     unique (drawing_id, version_no)
   );

   alter table drawings
     add constraint drawings_current_version_fk
     foreign key (current_version_id) references drawing_versions(id) on delete set null;
   ```

6. **Leaf-only trigger:**
   ```sql
   create or replace function assert_progress_item_is_leaf()
   returns trigger language plpgsql security definer set search_path = public as $$
   begin
     if exists (select 1 from progress_items where parent_id = new.leaf_item_id) then
       raise exception 'drawings can only attach to leaf progress items';
     end if;
     return new;
   end $$;

   create trigger drawings_leaf_only
     before insert or update on drawings
     for each row execute function assert_progress_item_is_leaf();
   ```

7. **Indexes:**
   ```sql
   create index idx_drawings_leaf_item on drawings(leaf_item_id);
   create index idx_drawings_project on drawings(project_id);
   create index idx_drawing_versions_drawing on drawing_versions(drawing_id);
   create index idx_drawing_versions_status on drawing_versions(status);
   ```

8. **New RLS helper:** `can_upload_drawing(uid, project_id)` — see §Existing RLS Helpers above. **All helpers `security definer set search_path = public`** (PITFALLS C6).

9. **Table RLS:**
   ```sql
   alter table drawings enable row level security;
   alter table drawing_versions enable row level security;

   -- drawings
   create policy "Members view drawings" on drawings for select to authenticated
     using (can_view_project(auth.uid(), project_id));
   create policy "Editors insert drawings" on drawings for insert to authenticated
     with check (can_upload_drawing(auth.uid(), project_id));
   create policy "Editors update drawings" on drawings for update to authenticated
     using (can_upload_drawing(auth.uid(), project_id));
   -- No delete policy — drawings are immortal in v1

   -- drawing_versions
   create policy "Members view versions" on drawing_versions for select to authenticated
     using (exists (
       select 1 from drawings d where d.id = drawing_versions.drawing_id
         and can_view_project(auth.uid(), d.project_id)
     ));
   create policy "Editors insert versions" on drawing_versions for insert to authenticated
     with check (exists (
       select 1 from drawings d where d.id = drawing_versions.drawing_id
         and can_upload_drawing(auth.uid(), d.project_id)
     ));
   create policy "Uploader or admin withdraws" on drawing_versions for update to authenticated
     using (
       uploaded_by = auth.uid()
       or exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin')
     );
   ```

10. **Storage bucket RLS** (per CONCERNS.md template, D-18 path scheme):
    ```sql
    drop policy if exists "Members read drawings" on storage.objects;
    drop policy if exists "Editors upload drawings" on storage.objects;

    create policy "Members read drawings" on storage.objects for select to authenticated
      using (
        bucket_id = 'project-drawings'
        and can_view_project(auth.uid(), (storage.foldername(name))[1]::uuid)
      );

    create policy "Editors upload drawings" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'project-drawings'
        and can_upload_drawing(auth.uid(), (storage.foldername(name))[1]::uuid)
      );
    -- No update / delete policy on storage.objects: drawing blobs are immortal
    ```

11. **Realtime publication:**
    ```sql
    alter publication supabase_realtime add table drawings;
    alter publication supabase_realtime add table drawing_versions;
    ```

12. **demo_feedback RLS fix ride-along** (INF-05, D-32):
    ```sql
    -- Ride-along: fix over-permissive demo_feedback select policy (CONCERNS.md m8 / INF-05)
    drop policy if exists "Authenticated read feedback" on demo_feedback;
    create policy "Admin reads feedback" on demo_feedback for select to authenticated
      using (exists (select 1 from user_profiles where id = auth.uid() and global_role = 'admin'));
    ```

**Companion file:** `supabase/v8-private-bucket-template.sql` (INF-02) — a SQL-comment-only template documenting:
- Bucket creation with `public = false`
- Path convention `{scope_id}/...` for `storage.foldername(name)[1]::uuid`
- Two storage.objects policies (select + insert) using project-scoped helper functions
- "No update / delete policy" rule for immortal evidence buckets

Phase 2 (`v9-si-vo.sql`) and Phase 3 (`v10-ptw.sql`) instantiate this template for their own buckets.

**Companion file:** `supabase/tests/rls-smoke.sql` (INF-04) — runs `set local request.jwt.claims = ...` as three personas (admin, MC of project A, subcon of project B) and asserts `select count(*) from drawings` returns the expected row counts.

---

## Vite manualChunks Config

**Current state:** `vite.config.ts` is 22 lines and has NO `build.rollupOptions` block:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { /* ... */ },
  preview: { /* ... */ },
})
```

**Add the following `build` block** (D-29):

```ts
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Phase 1 viewers (lazy-loaded)
          'viewer-pdf':  ['react-pdf', 'pdfjs-dist'],
          'viewer-zoom': ['react-zoom-pan-pinch'],
          // Ride-along: split existing heavy libs out of the entry chunk
          // (per CONCERNS.md — currently 1.2 MB entry chunk)
          'reports-xlsx':    ['xlsx'],
          'reports-pdf':     ['jspdf', 'jspdf-autotable'],
          'charts-recharts': ['recharts'],
        },
      },
    },
  },
  server: { /* unchanged */ },
  preview: { /* unchanged */ },
})
```

**Lazy-load wiring at consumer sites:**

```ts
// src/components/drawings/DrawingViewer.tsx — lazy split at the component boundary
import { lazy, Suspense } from 'react'
const PdfViewer = lazy(() => import('./PdfViewer'))     // -> viewer-pdf chunk
const ImageViewer = lazy(() => import('./ImageViewer')) // -> viewer-zoom chunk (transitively)

// src/lib/pdfWorker.ts — import ONCE before any react-pdf render
import { pdfjs } from 'react-pdf'
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

For ride-along chunks (xlsx, jspdf, recharts) — they only get split out of the entry bundle if their *consumers* are also lazy-loaded. Audit:
- `src/lib/export.ts` (uses xlsx + jspdf) — currently imported eagerly somewhere. Convert to `const { exportToExcel } = await import('../lib/export')` at the call site (`Dashboard.tsx`).
- `recharts` is used in `Dashboard.tsx` — ideally also lazy-load the Dashboard page itself via `React.lazy()` in `src/App.tsx`.

**Bundle target:** Per D-30, entry chunk <800 KB, new chunks <400 KB. Per CONCERNS.md, current entry chunk is 1.2 MB. With the ride-along split + lazy export.ts, entry chunk should drop to ~700 KB (-400 KB), satisfying the threshold.

---

## Bundle-Size CI Check

**File:** `scripts/check-bundle-size.cjs` (new) — pure Node, no dependencies (runs after `npm run build`).

```js
#!/usr/bin/env node
// Bundle-size guard for Phase 1 (INF-07 / D-30).
// Fails build if entry chunk > 800 KB or any other JS chunk > 400 KB.
// Run after `npm run build` so dist/assets/ exists.

const fs = require('fs')
const path = require('path')

const DIST = path.resolve(__dirname, '..', 'dist', 'assets')
const ENTRY_LIMIT = 800 * 1024   // 800 KB
const CHUNK_LIMIT = 400 * 1024   // 400 KB

if (!fs.existsSync(DIST)) {
  console.error('dist/assets not found — run `npm run build` first')
  process.exit(1)
}

const files = fs.readdirSync(DIST).filter(f => f.endsWith('.js'))
let failed = false
const report = []

for (const f of files) {
  const full = path.join(DIST, f)
  const size = fs.statSync(full).size
  // Vite emits the entry chunk as `index-<hash>.js`
  const isEntry = /^index-[A-Za-z0-9_-]+\.js$/.test(f)
  const limit = isEntry ? ENTRY_LIMIT : CHUNK_LIMIT
  const kb = (size / 1024).toFixed(1)
  const limitKb = (limit / 1024).toFixed(0)
  if (size > limit) {
    report.push(`FAIL ${f}  ${kb} KB  (limit ${limitKb} KB)`)
    failed = true
  } else {
    report.push(`OK   ${f}  ${kb} KB  (limit ${limitKb} KB)`)
  }
}

console.log(report.join('\n'))
if (failed) {
  console.error('\nBundle-size check failed.')
  process.exit(1)
}
console.log('\nBundle-size check passed.')
```

**package.json script addition:**
```json
"build:check": "npm run build && node scripts/check-bundle-size.cjs"
```

**Codemagic integration:** `codemagic.yaml` currently has three workflows (`ios-app-store`, `ios-testflight`, `android-internal-test`). Each has a `Build web app` script step running `npm run build`. **Insert a new step after `Build web app` in ALL THREE workflows:**

```yaml
- name: Check bundle size
  script: node scripts/check-bundle-size.cjs
```

(Don't use `npm run build:check` here — that would re-build. The `Build web app` step already ran build; we only need the check.)

**Risk:** Currently the entry chunk is 1.2 MB. The check will FAIL on first run **until** the ride-along split lands and `export.ts` is lazy-imported. Sequencing matters: the Vite config change and the `export.ts` lazy-import must land in the SAME PR as the CI check, otherwise main goes red.

---

## Capacitor Plugin Verification

**Current state (verified from `package.json`):**

| Plugin | Installed? | Version |
|--------|------------|---------|
| `@capacitor/core` | YES | ^8.3.1 |
| `@capacitor/ios` | YES | ^8.3.1 |
| `@capacitor/android` | YES | ^8.3.3 |
| `@capacitor/push-notifications` | YES | ^8.0.3 |
| `@capacitor/splash-screen` | YES | ^8.0.1 |
| `@capacitor/status-bar` | YES | ^8.0.2 |
| **`@capacitor/camera`** | **NO** | — |
| **`@capacitor/filesystem`** | **NO** | — |

**Required for D-01:** Install both:

```bash
npm install @capacitor/camera@^8 @capacitor/filesystem@^8
npx cap sync ios
npx cap sync android
```

**iOS permission strings** (`ios/App/App/Info.plist`) — `.planning/codebase/STACK.md` confirms `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and `NSMicrophoneUsageDescription` already exist in zh-HK. No new permission strings needed for the camera plugin specifically. **VERIFY at install** — the Capacitor 8 camera plugin's expected key names match the existing Info.plist entries.

**Android permissions** — `@capacitor/camera` 8.x automatically merges `<uses-permission>` entries via Gradle's manifest merger. No manual `AndroidManifest.xml` edit expected, but verify after `npx cap sync android`.

**Web fallback:** On the web (Vite dev server, Vercel preview), the Capacitor camera plugin falls back to `<input type="file">` automatically. The HTML file input with `accept="image/*,application/pdf" capture="environment"` mirrors the existing `CreateIssueModal` pattern.

---

## PDF.js Worker Setup Gotcha

**The pitfall** (PITFALLS m5 implicit, STACK.md explicit): PDF.js requires its worker to load from the same origin. Under Capacitor:

- iOS WKWebView origin: `capacitor://localhost`
- Android WebView origin: `https://localhost`
- Browser dev: `http://localhost:5173`

A CDN-hosted worker (the default in many tutorials) FAILS under all three Capacitor origins because of CSP / cross-origin worker fetch.

**The fix** (D-11 + STACK.md verified pattern):

```ts
// src/lib/pdfWorker.ts — import ONCE, before any react-pdf render
import { pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()
```

Vite resolves `new URL(..., import.meta.url)` at build time → emits the worker as a real asset in `dist/assets/` next to the JS bundle → loaded from the same origin in all three contexts.

**Verification steps** (planner must include in QA task):
1. `npm run dev` — open a PDF in browser; check Network tab for `pdf.worker.min.mjs` loaded from `localhost:5173`.
2. `npm run build && npx cap sync ios && npx cap run ios` — open a PDF on a real iPhone or simulator; Safari Web Inspector should show worker loaded from `capacitor://localhost`.
3. `npx cap sync android && npx cap run android` — open a PDF on Android emulator; Chrome DevTools should show worker loaded from `https://localhost`.

**Do NOT:**
- Use `pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/...'` — will fail on device
- Install `pdfjs-dist` as a top-level dep with a different version than `react-pdf`'s peer — version mismatch crashes the worker silently

**Version pin enforcement:** Add a comment in `src/lib/pdfWorker.ts` warning future devs not to add `pdfjs-dist` to package.json. Optionally add `package.json` `"overrides"` block if the peer drifts in `react-pdf@>10.4.1`.

---

## Component File Structure

**Recommended layout** under `src/components/drawings/` (CONTEXT.md Claude's Discretion — choosing now):

```
src/components/drawings/
├── DrawingsSection.tsx        # The "圖則 (N)" section/list for a leaf item — renders grid + search + upload button
├── DrawingThumbnail.tsx       # One tile in the grid; title, revision label, status badge
├── DrawingViewer.tsx          # Full-screen modal; switches between Image/PDF mode by mime_type; lazy-loads zoom/pdf chunks
├── DrawingUploadSheet.tsx     # Bottom sheet with 3 upload options (camera / gallery / file); progress per-file
├── DrawingVersionHistory.tsx  # Modal-inside-viewer listing all versions with status badges
└── PdfPageNavigator.tsx       # PDF page prev/next + "1 / 5" indicator
```

```
src/contexts/
└── DrawingsContext.tsx        # Mirrors IssuesContext: fetch / upload / withdraw / realtime channel `drawings-${projectId}`
```

```
src/lib/
├── drawings.ts                # Pure helpers: derivePathFor(projectId, drawingId, versionNo, filename); revisionLabelOrDefault
├── thumbnails.ts              # Canvas / pdfjs thumbnail generator (256×256 JPEG q=0.8)
└── pdfWorker.ts               # PDF.js worker setup (described above) — imported once at app boot or by viewer
```

```
src/types.ts
+ Drawing, DrawingVersion, DrawingStatus types
+ DRAWING_STATUS_ZH: Record<DrawingStatus, string>
```

**Rationale:**
- One file per responsibility, matching existing `components/<Feature><Name>.tsx` convention (CONVENTIONS.md).
- The folder `drawings/` groups them (precedent: nothing yet — existing repo has flat `src/components/`. New folder is justified by 6 files cohesively scoped). Acceptable per CONVENTIONS.md "Where to Add New Code §New project-scoped feature".
- `DrawingViewer.tsx` is ONE component with a `mode` derived from `mime_type` (not two components — keeps the version-history button + close button + safe-area styling in one place).

**File the planner should create:** A `src/components/drawings/index.ts` barrel is NOT recommended — CONVENTIONS.md says "No barrel files".

---

## Playwright Smoke Test Scaffolding

**Current state:** `@playwright/test@^1.59.1` and `playwright@^1.59.1` are devDependencies in `package.json`, BUT:
- No `playwright.config.ts` exists at repo root
- No `tests/` directory exists
- No `test` script in `package.json`

**This is the first test in the repo.** Wave 0 setup steps:

1. **Create `playwright.config.ts`** at repo root:

   ```ts
   import { defineConfig, devices } from '@playwright/test'

   export default defineConfig({
     testDir: './tests/e2e',
     timeout: 60_000,
     fullyParallel: false,
     forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 1 : 0,
     reporter: 'list',
     use: {
       baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
       trace: 'on-first-retry',
       viewport: { width: 390, height: 844 }, // iPhone 13 logical size — matches HK target users
     },
     projects: [
       { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
     ],
     webServer: {
       command: 'npm run preview',
       port: 5173,
       reuseExistingServer: !process.env.CI,
     },
   })
   ```

2. **Create `tests/e2e/drawings.spec.ts`** (D-31 — ONE test):

   ```ts
   import { test, expect } from '@playwright/test'

   test('PM can upload a drawing and view it in the pinch-zoom viewer', async ({ page }) => {
     // 1. Login as seeded PM
     await page.goto('/#/login')
     await page.getByLabel('手機號碼').fill(process.env.TEST_PM_PHONE!)
     await page.getByLabel('密碼').fill(process.env.TEST_PM_PASSWORD!)
     await page.getByRole('button', { name: '登入' }).click()
     await page.waitForURL(/\/#\/home/)

     // 2. Open seeded project's leaf item
     await page.getByRole('link', { name: /測試項目/ }).first().click()
     await page.getByRole('button', { name: /地基.*圖則/ }).first().click()

     // 3. Open upload sheet, upload sample PDF
     await page.getByRole('button', { name: '+ 新增圖則' }).click()
     await page.getByRole('button', { name: /從檔案選擇/ }).click()
     await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-drawing.pdf')
     await page.getByLabel(/圖則標題/).fill('A-101 平面圖')
     await page.getByRole('button', { name: '上載' }).click()

     // 4. Thumbnail appears
     await expect(page.getByText('A-101 平面圖')).toBeVisible({ timeout: 30_000 })

     // 5. Tap to open viewer; assert pinch-zoom container present
     await page.getByText('A-101 平面圖').click()
     await expect(page.locator('[data-testid="drawing-viewer-zoom"]')).toBeVisible()
   })
   ```

3. **Add test script to `package.json`:**

   ```json
   "test:e2e": "playwright test",
   "test:e2e:install": "playwright install chromium"
   ```

4. **Add fixture:** `tests/fixtures/sample-drawing.pdf` — a small (<100 KB) 1-page PDF. Generate via `jspdf` in a one-off script, commit the binary.

5. **Add seeded test user:** This is a HARD blocker. The test needs a known PM with a known project + leaf item. Three options:
   - **(a)** Reuse `scripts/seed-demos.js` — already creates demo users with `Demo@2026` password. Add `TEST_PM_PHONE=...` `TEST_PM_PASSWORD=Demo@2026` to test env.
   - **(b)** Create test-only seed `scripts/seed-test.js` that idempotently inserts a deterministic PM + project + leaf item.
   - **(c)** Use the live admin account (`91234567 / admin1234`) — BAD, hits prod data.

   **Recommend (a)** — extend `seed-demos.js` to ensure at least one PM + project + leaf item.

6. **CI integration is OUT OF SCOPE for v1 of this test (per D-31 "ONE test only" framing).** The smoke test is a manual / on-demand check before each release. CI integration is deferred to v1.x.

**Data-testid additions:** The Playwright selector `[data-testid="drawing-viewer-zoom"]` requires the `DrawingViewer.tsx` to render `<div data-testid="drawing-viewer-zoom">` around the `<TransformWrapper>`. Planner must include this as a task.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/drawings/      # new — feature folder (see §Component File Structure)
├── contexts/
│   └── DrawingsContext.tsx   # new — mirrors IssuesContext, scoped by projectId
├── lib/
│   ├── drawings.ts           # new — pure helpers
│   ├── thumbnails.ts         # new — Canvas thumbnail generator
│   └── pdfWorker.ts          # new — PDF.js worker setup
└── types.ts                  # extended — add Drawing/DrawingVersion/DrawingStatus + ZH map

supabase/
├── v8-private-bucket-template.sql  # new — INF-02 reusable template (comments-only doc)
├── v8-drawings.sql                 # new — schema + RLS + storage + demo_feedback ride-along
└── tests/
    └── rls-smoke.sql               # new — INF-04 3-perspective harness

scripts/
└── check-bundle-size.cjs   # new — INF-07 CI guard

tests/
├── e2e/
│   └── drawings.spec.ts    # new — INF-08 Phase 1 smoke
├── fixtures/
│   └── sample-drawing.pdf  # new — test fixture binary
└── (playwright.config.ts at repo root)
```

### Pattern 1: DrawingsContext (mirror IssuesContext)

**What:** A single React context per project scope; owns fetch, upload, realtime channel, and mutation methods.

**When to use:** Standard pattern in this codebase for all project-scoped features (see `IssuesContext`, `ProgressContext`).

**Example:**
```ts
// src/contexts/DrawingsContext.tsx
export function DrawingsProvider({ projectId, children }) {
  // ... mirror IssuesContext.tsx structure
  // Realtime channel `drawings-${projectId}`
  // refetch on insert/update/delete
}
export function useDrawings() { /* throws if no provider */ }
```

### Pattern 2: Lazy-loaded viewer (CRITICAL)

```ts
// In DrawingsSection.tsx (or wherever the viewer is opened)
import { lazy, Suspense, useState } from 'react'
const DrawingViewer = lazy(() => import('./DrawingViewer'))

function DrawingsSection({ leafItemId }) {
  const [viewing, setViewing] = useState<DrawingVersion | null>(null)
  return (
    <>
      {/* ... thumbnail grid ... */}
      {viewing && (
        <Suspense fallback={<FullPageSpinner label="載入中..." />}>
          <DrawingViewer version={viewing} onClose={() => setViewing(null)} />
        </Suspense>
      )}
    </>
  )
}
```

### Pattern 3: Storage path enforcement (defence-in-depth alongside RLS)

```ts
// src/lib/drawings.ts
export function drawingsPathFor(projectId: string, drawingId: string, versionNo: number, filename: string): string {
  // Strict: first segment is project_id so storage.foldername(name)[1] picks it up
  return `${projectId}/${drawingId}/v${versionNo}/${filename}`
}

export function drawingsThumbPathFor(projectId: string, drawingId: string, versionNo: number): string {
  return `${projectId}/${drawingId}/v${versionNo}/thumb.jpg`
}
```

The upload function in DrawingsContext should refuse to call `.upload(path, file)` if `path.split('/')[0] !== projectId` — kills C1 (storage RLS bypass) at the client layer too.

### Anti-Patterns to Avoid

- **`getPublicUrl` for drawings** — PITFALLS C1. Use `createSignedUrl(path, 3600)` ALWAYS. The only existing `getPublicUrl` callsite is `src/contexts/IssuesContext.tsx:113` (legacy `issue-photos`); do not copy that line into drawings code.
- **Hard-delete from the UI** — PITFALLS M2 + D-08. The `delete` row in `drawing_versions` exists only for admin SQL emergencies; not exposed via UI.
- **Storing `current_version` as an integer on `drawings`** — denormalized state drifts. Use `drawings.current_version_id` FK to `drawing_versions.id` instead (per the schema in §Migration File Outline).
- **Inline `<embed src="...pdf">` or `<iframe>` for PDF** — STACK.md explicit: Android WebView breaks PDF embedding. Use `react-pdf`.
- **CDN-hosted PDF.js worker** — PDF.js Worker Setup Gotcha above.
- **Pre-creating empty `drawing_versions` rows on `drawings` insert** — keep `drawings` and `drawing_versions` insert as a single transaction; never have a `drawings` row without at least one `drawing_versions` row.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pinch-zoom + pan | Custom touch handlers | `react-zoom-pan-pinch` | Pointer Events + momentum + bounds = weeks of work |
| PDF rendering in WebView | `<embed>` / `<iframe>` / custom canvas | `react-pdf` (lazy-loaded) | Android WebView lacks native PDF; iOS varies |
| Camera/gallery picker on iOS+Android | Pure web `<input type="file">` | `@capacitor/camera` with web fallback | Native picker UX + permission prompts (gloves + sun glare benefit) |
| RLS helper functions | Inline `select 1 from project_members ...` | Reuse `can_view_project`, `can_edit_project_progress`; add `can_upload_drawing` | PITFALLS C6 — recursive policies caused the v2 outage |
| Signed-URL minting | Edge Function | `supabase.storage.from().createSignedUrl(path, 3600)` | Built-in; 1-hour TTL covers D-20 |
| Thumbnail of PDF page 1 | Manual rasterization | `react-pdf` `<Page>` with onRenderSuccess → canvas.toBlob | pdfjs handles low-DPI / font-fallback edge cases |
| Per-file upload progress | Custom XHR chunking | Show indeterminate spinner per file (Supabase JS lacks progress events) | Acceptable for v1 per D-03 simplification; resumable upload is a future option |

**Key insight:** Construction-app code style is intentionally minimal (no linter, no test framework configured, no state library). This phase still keeps that bar — but the listed libraries are the *de facto* React/Capacitor standard and reinventing them is genuine months of work.

---

## Runtime State Inventory

> This is greenfield code on top of an existing schema. Migration namespace is `v8-` (skipping v5/v6/v7 disputes). No rename, no refactor.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — drawings tables are new. `progress_items.id` is referenced as FK (existing rows referenced by new code; no migration of existing rows). | None |
| Live service config | `project-drawings` bucket does not exist yet — created by migration. `demo_feedback` table policy is over-permissive (CONCERNS.md m8) — fixed in v8 ride-along. | RLS policy DROP+CREATE in v8 migration; bucket INSERT in v8 migration. |
| OS-registered state | None — no OS tasks, daemons, or scheduled jobs touched. | None |
| Secrets / env vars | No new env vars. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` unchanged. No new keys in `app_config`. | None |
| Build artifacts | `dist/` will gain new chunks (`viewer-pdf`, `viewer-zoom`, `reports-*`, `charts-recharts`). Existing 1.2 MB entry chunk is split — file hashes change → users get fresh assets on next deploy (no stale-cache concern since Vite hashes filenames). | Normal Vite cache-busting handles this. |

**Verified by:** Grep of `package.json` for plugins (camera/filesystem not present), `vite.config.ts` (no manualChunks yet), `supabase/` directory listing (no v7/v8 files exist).

---

## Common Pitfalls

(Subset from `.planning/research/PITFALLS.md` applicable to Phase 1 — C1, C6, M2, M3, M6, m2, m5, m7, m8.)

### Pitfall C1 — Storage RLS bypass via public-bucket reflex (CRITICAL)
**What goes wrong:** Dev copies `issue-photos` (public bucket) pattern → drawings end up publicly readable. One forwarded URL = competitor sees structural drawings.
**Why it happens:** `IssuesContext.tsx:113` uses `getPublicUrl` and works fine; muscle memory copies the pattern.
**How to avoid:**
- Bucket created with `public = false` in `v8-drawings.sql`.
- Code review check: grep PR diffs for `getPublicUrl` — only legacy `issue-photos` callsite allowed.
- All drawing URLs minted via `createSignedUrl(path, 3600)`.
- Path always starts with `{project_id}/` so `(storage.foldername(name))[1]::uuid` works.
**Warning signs:** Any new `public, true` in storage.buckets; any `getPublicUrl` in `src/components/drawings/` or `src/contexts/DrawingsContext.tsx`; any file path NOT prefixed with `${projectId}/`.

### Pitfall C6 — RLS recursive-policy meltdown (CRITICAL)
**What goes wrong:** New policy on `drawings` references `drawing_versions`; policy on `drawing_versions` references `drawings`. Cycle → 500s or empty result sets.
**Why it happens:** Each table needs an RLS policy that ultimately resolves project membership; naive cross-table SELECTs in policies recurse.
**How to avoid:**
- All RLS helpers `SECURITY DEFINER SET search_path = public` — established pattern from `v3-progress-schema.sql:33-71`.
- `drawing_versions` policy goes via `drawings` join with the security-definer helper, NOT a raw subquery on `drawing_versions`.
- `supabase/tests/rls-smoke.sql` (INF-04) asserts 3-persona `count(*)` to catch this before merge.
**Warning signs:** Empty SELECT for known-valid user; 500 errors with "stack depth exceeded" or "infinite recursion detected in policy" in Postgres logs.

### Pitfall M2 — Drawing "current version" ambiguity under glove + sun glare (MAJOR)
**What goes wrong:** Foreman installs against v3; v4 supersedes; foreman reopens app and assumes v4 is what they built against.
**How to avoid:**
- D-22 large badges: `v4 (現行)` green `bg-green-100 text-green-700`, `v3 (已取代 YYYY-MM-DD)` grey strikethrough, `v2 (已撤回)` red strikethrough.
- ≥16pt (Tailwind `text-base` = 16px; D-22 specifies "min 16pt" — use `text-lg` (18px) for safety badges).
- Version history modal (D-13) sorts newest first.

### Pitfall M3 — Template drawings shared across projects → RLS leak (MAJOR)
**How to avoid:** v1 does NOT support cross-project templates (CONTEXT.md "Deferred Ideas"). Each project has its own copies; path is `{project_id}/...`. RLS policy compares `(storage.foldername(name))[1]::uuid = project_id` so no cross-project read possible.

### Pitfall M6 — Bundle bloat ships unusable on 3G/4G (MAJOR)
**What goes wrong:** Current entry chunk = 1.2 MB. Adding react-pdf + react-zoom-pan-pinch without splitting = 1.5+ MB cold load over HK 4G through concrete.
**How to avoid:**
- Vite `manualChunks` split (see §Vite manualChunks Config).
- Lazy-load viewer + thumbnail generation behind `React.lazy()`.
- Ride-along split of `xlsx`, `jspdf`, `recharts`.
- CI guard (`scripts/check-bundle-size.cjs`) blocks PRs that exceed thresholds.

### Pitfall m2 — Subcontractor upload attempt (MINOR)
**How to avoid:** New helper `can_upload_drawing` EXCLUDES `subcontractor` role (only admin / PM / main_contractor pass). UI hides upload button for these roles (D-25).

### Pitfall m5 — Orphan storage on account delete (MINOR — sets convention)
**How to avoid:** Drawing storage path is `{project_id}/...` NOT `{user_id}/...`. Account deletion (`delete_my_account()` cascading from `auth.users`) does NOT touch drawings storage objects — they're project-owned evidence. Verified against `supabase/v6-account-deletion.sql:42-59` (only deletes from `auth.users`, cascade handles `user_profiles` etc.; storage.objects is untouched).

### Pitfall m7 — Chinese-character search/sort (MINOR)
**How to avoid:** D-23 default sort `created_at DESC`. D-24 search uses ILIKE substring (case-insensitive, no Chinese-aware sort). Acceptable for v1.

### Pitfall m8 — `demo_feedback` over-permissive RLS (MINOR cleanup ride-along)
**How to avoid:** Folded into `v8-drawings.sql` — drop existing "Authenticated read feedback" policy and replace with admin-only select (per D-32, INF-05).

---

## Code Examples

### Signed-URL minting for drawing view

```ts
// src/contexts/DrawingsContext.tsx (excerpt)
async function getViewerUrl(version: DrawingVersion): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from('project-drawings')
    .createSignedUrl(version.file_path, 3600)  // 1 hour TTL per D-20
  if (error) return { url: null, error: error.message }
  return { url: data.signedUrl, error: null }
}
```

### Path enforcement on upload

```ts
// src/lib/drawings.ts
export function drawingsPathFor(projectId: string, drawingId: string, versionNo: number, filename: string): string {
  return `${projectId}/${drawingId}/v${versionNo}/${filename}`
}

// src/contexts/DrawingsContext.tsx (excerpt)
async function uploadVersion(drawingId: string, file: File, revisionLabel?: string) {
  if (!profile) return { error: '未登入' }
  if (file.size > 25 * 1024 * 1024) return { error: '檔案太大 (>25MB)，請壓縮後再上載' }  // D-04
  // Soft warning >5MB is a separate UI toast, not blocking — handled in the upload sheet.

  const version_no = await nextVersionNo(drawingId)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const safeName = `drawing.${ext}`  // do not trust user filename for path
  const filePath = drawingsPathFor(projectId, drawingId, version_no, safeName)

  // Defence-in-depth: path MUST start with projectId
  if (!filePath.startsWith(`${projectId}/`)) return { error: 'Path validation failed' }

  const { error: upErr } = await supabase.storage
    .from('project-drawings')
    .upload(filePath, file, { contentType: file.type, upsert: false })
  if (upErr) return { error: upErr.message }
  // ... thumbnail upload + INSERT drawing_versions row + UPDATE drawings.current_version_id (transactionally)
}
```

### Lazy-loaded viewer mount

```tsx
// src/components/drawings/DrawingsSection.tsx (excerpt)
import { lazy, Suspense, useState } from 'react'
import { FullPageSpinner } from '../Spinner'

const DrawingViewer = lazy(() => import('./DrawingViewer'))
// → split into viewer-pdf and viewer-zoom chunks via Vite manualChunks
```

### `DRAWING_STATUS_ZH` addition to `src/types.ts`

```ts
// add near the existing PROGRESS_STATUS_ZH / ISSUE_STATUS_ZH maps
export type DrawingStatus = 'current' | 'superseded' | 'withdrawn'

export const DRAWING_STATUS_ZH: Record<DrawingStatus, string> = {
  current:    '現行',
  superseded: '已取代',
  withdrawn:  '已撤回',
}

export interface Drawing {
  id: string
  project_id: string
  leaf_item_id: string
  title: string
  current_version_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DrawingVersion {
  id: string
  drawing_id: string
  version_no: number
  file_path: string
  thumb_path: string | null
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  size_bytes: number
  revision_label: string | null
  status: DrawingStatus
  uploaded_by: string | null
  uploaded_at: string
  superseded_at: string | null
  withdrawn_at: string | null
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Public bucket + URL obscurity (`issue-photos` pattern) | Private bucket + signed URLs + `storage.foldername` RLS | Phase 1 establishes the new pattern; legacy `issue-photos` is the only remaining public bucket |
| Monolithic entry chunk (1.2 MB) | Vite `manualChunks` + lazy-load consumers | Entry chunk drops to ~700 KB after ride-along split |
| `getPublicUrl` everywhere | `createSignedUrl(path, ttl)` for private buckets | Required for all new feature buckets |
| Embedded PDF via `<iframe>` | `react-pdf` + self-hosted PDF.js worker | Works on iOS WKWebView + Android WebView + browser |

**Deprecated:**
- `getPublicUrl` for any new bucket — flagged in code review.
- PDF rendering via `<embed>` or CDN worker — flagged in PITFALLS m5/C1 / STACK.md.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@capacitor/camera@^8` and `@capacitor/filesystem@^8` exist on npm and are compatible with `@capacitor/core@8.3.1` | Standard Stack | Install command fails; planner must `npm view @capacitor/camera versions` and pin specific minor. Low risk — Capacitor plugin majors track core. |
| A2 | Vite resolves `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` and emits the worker into `dist/assets/` | PDF.js Worker Setup | If wrong, viewer fails silently; manual fallback = copy worker to `public/` and reference by relative URL. Verified against STACK.md and pdf.js upstream issue #8305. |
| A3 | Existing `delete_my_account()` cascade chain does not touch storage.objects | Pitfall m5 | If wrong, drawing blobs would be deleted with the uploader's account — disastrous for evidence trail. **Verified** against `supabase/v6-account-deletion.sql:42-59` — RPC only deletes from `auth.users`; cascade chain reaches `user_profiles`, `project_members` etc. but NOT storage.objects. **No risk.** Reclassified to verified. |
| A4 | Adding `@capacitor/camera` to iOS does not require new Info.plist keys (existing `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` in zh-HK suffice) | Capacitor Plugin Verification | If wrong, App Store reviewer rejects on missing usage strings. Verify after `npx cap sync ios` by inspecting `ios/App/App/Info.plist` for any new keys the plugin expects. |
| A5 | Supabase Storage JS client (`@supabase/supabase-js@^2.104.0`) does NOT expose progress events on `.upload()` | Existing Photo-Upload Pattern | If wrong (newer 2.x added progress), per-file progress can be wired natively. Easy to detect at implementation time; UX falls back to indeterminate spinner if missing. |

**Risk summary:** All A* items are low-impact and discoverable at implementation time. None block planning.

---

## Open Questions

1. **Drawing-upload push policy** — STATE.md lists this as an open todo. CONTEXT.md D-28 resolves it as **OFF in v1.** No further research needed; planner can lock per D-28.

2. **Production admin password rotation** — STATE.md flags `admin1234` rotation status. Out of scope for this phase but the bundle-size CI check might run in CI before this is rotated. **Recommendation:** planner notes this as a pre-Phase-1-ship checklist item but does not depend on it.

3. **Leaf-item detail UX — Option A vs Option B** — see §Existing Code Analysis. **Recommendation:** Option A (modal opened from `ProgressItemCard` action row), confirm with user during plan review.

4. **Upload progress UI fallback** — Supabase JS lacks `.upload()` progress events. **Recommendation:** show indeterminate per-file spinner + completion checkmark (matches existing `CreateIssueModal` pattern). D-03 says "per-file progress bar with KB/MB counter" — interpret as "best-effort indicator" not literal progress.

5. **PDF.js worker version pinning enforcement** — `react-pdf@^10.4.1` pins `pdfjs-dist@5.x`. If someone later adds `pdfjs-dist` to `package.json` independently, version drift breaks the worker silently. **Recommendation:** add a comment-banner in `src/lib/pdfWorker.ts` and optionally a `package.json` `overrides` block.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, scripts | ✓ | `latest` per `codemagic.yaml:17` | — |
| npm | Package management | ✓ | — | — |
| Vite | Build | ✓ | ^5.1.6 (devDep) | — |
| TypeScript | Build | ✓ | ^5.4.5 (devDep) | — |
| `@capacitor/core` | Native bridge | ✓ | ^8.3.1 | — |
| `@capacitor/camera` | D-01 native picker | ✗ | — | Web `<input type="file">` only; native UX degraded |
| `@capacitor/filesystem` | D-01 file option on native | ✗ | — | HTML `<input type="file">` as primary; functionally OK |
| `react-zoom-pan-pinch` | D-10 viewer | ✗ | — | Block — no fallback for pinch-zoom |
| `react-pdf` | D-10 viewer | ✗ | — | Block — no fallback for PDF rendering |
| Supabase Postgres | Schema, RLS | ✓ (managed) | — | — |
| Supabase Storage | File hosting | ✓ (managed) | — | — |
| `@playwright/test` | INF-08 smoke | ✓ | ^1.59.1 (devDep) | — |
| Chromium browser | Playwright runtime | ✗ until `npx playwright install chromium` runs | — | Run on developer's machine; not required for CI in v1 |
| Java 21 | Android build (Codemagic) | ✓ | 21 per `codemagic.yaml:211` | — |
| Xcode | iOS build | ✓ (Codemagic macOS) | — | — |

**Missing dependencies with no fallback:**
- `react-zoom-pan-pinch`, `react-pdf` — install commands in §Installation. **Blocks UI work until installed.**

**Missing dependencies with fallback:**
- `@capacitor/camera`, `@capacitor/filesystem` — fall back to `<input type="file">` on web; native UX is degraded but functional. **Install before iOS/Android UAT** (D-01 lists Capacitor plugins as primary).

---

## Validation Architecture

> `.planning/config.json` was not located in the standard place; treating `workflow.nyquist_validation` as **enabled** (absent = enabled per researcher instructions).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright ^1.59.1 (already in devDeps); **no test runner currently wired** |
| Config file | None — `playwright.config.ts` to be created in Wave 0 |
| Quick run command | `npm run test:e2e -- --grep "drawing"` (after Wave 0 wiring) |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| DRW-01 | PM uploads JPEG/PDF to leaf | smoke (e2e) | `npm run test:e2e -- tests/e2e/drawings.spec.ts` | ❌ Wave 0 |
| DRW-05 | Pinch-zoom container renders | smoke (e2e) | (same test) | ❌ Wave 0 |
| DRW-07 | Thumbnail appears in list | smoke (e2e) | (same test) | ❌ Wave 0 |
| DRW-12 | Private bucket RLS — non-member cannot read | SQL (rls-smoke) | `psql -f supabase/tests/rls-smoke.sql` | ❌ Wave 0 |
| DRW-15 | Subcon does not see upload button | manual / out-of-scope for v1 smoke | — | (manual UAT) |
| INF-07 | Bundle-size CI guard fires on oversize chunk | shell | `node scripts/check-bundle-size.cjs` | ❌ Wave 0 |
| INF-08 | Playwright happy-path | smoke (e2e) | `npm run test:e2e` | ❌ Wave 0 |
| All other DRW-* | UX details | manual UAT (deliberately not Playwright per D-31) | — | (manual UAT) |

### Sampling Rate
- **Per task commit:** `node scripts/check-bundle-size.cjs` (cheap; <1s).
- **Per wave merge:** `npm run test:e2e` (one test, ~30s) + `psql -f supabase/tests/rls-smoke.sql` (against staging DB).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `playwright.config.ts` at repo root
- [ ] `tests/e2e/drawings.spec.ts` (smoke)
- [ ] `tests/fixtures/sample-drawing.pdf` (binary fixture)
- [ ] `supabase/tests/rls-smoke.sql` (3-persona RLS harness — INF-04)
- [ ] `scripts/check-bundle-size.cjs` (INF-07)
- [ ] `package.json` script entries: `test:e2e`, `test:e2e:install`, `build:check`
- [ ] Seeded test PM credentials (extend `scripts/seed-demos.js` or new `scripts/seed-test.js`)
- [ ] `npx playwright install chromium` first-time setup (documented in README; not run in CI yet)

---

## Security Domain

> `security_enforcement` config not located; treating as **enabled**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherits — no new auth surface) | Existing Supabase Auth synthetic-email pattern (out of scope this phase) |
| V3 Session Management | yes (inherits) | Existing AuthContext + `persistSession: true` |
| V4 Access Control | **yes — primary focus** | Postgres RLS: `can_view_project`, `can_upload_drawing`; storage.objects policies via `(storage.foldername(name))[1]::uuid` |
| V5 Input Validation | yes | TypeScript types + Postgres `CHECK` constraints (status enum, mime_type enum, file_size_bytes range); client-side file size + MIME sniff before upload |
| V6 Cryptography | n/a | No cryptographic operations in this phase (signed URLs are HMAC-handled by Supabase) |
| V8 Data Protection at Rest | yes | Private bucket — never public URL; signed URLs with 1h TTL (D-20) |
| V12 Files & Resources | **yes — primary focus** | Path enforcement (`projectId/...`); MIME whitelist (`application/pdf`, `image/jpeg`, `image/png`); hard size cap 25 MB |

### Known Threat Patterns for {React + Capacitor + Supabase}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Public-bucket leak (C1) | Information Disclosure | Bucket `public = false`; signed URLs only |
| Forwarded signed URL (replay) | Information Disclosure | 1h TTL caps blast radius (D-20) |
| Path traversal in upload filename | Tampering | Path is server-deterministic: `{projectId}/{drawingId}/v{n}/drawing.{ext}` — user filename not used in path |
| MIME confusion (executable as image) | Tampering | DB `CHECK (mime_type in (...))` + client-side MIME sniff + Supabase `contentType` upload param |
| RLS recursion (C6) | DoS | All helpers `security definer set search_path = public`; rls-smoke.sql |
| Subcon uploads (m2) | Elevation of Privilege | New `can_upload_drawing` helper excludes `subcontractor` role |
| Cross-project read via foldername spoofing | Spoofing | First path segment validated as UUID and matched against `can_view_project(auth.uid(), $1)` |
| Hard-delete of evidence | Repudiation | No DELETE policy on `drawings` or `drawing_versions`; storage UPDATE+DELETE policies absent → blobs immortal |
| Drawing tampering post-upload | Tampering | Versions are append-only (new version row); old `file_path` is never overwritten (Supabase `upsert: false` on upload) |

---

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` was located at the worktree root or project root during this research session. Constraints are taken from `.planning/codebase/CONVENTIONS.md`:

- **No linter, no formatter** — match existing style by reading neighboring files.
- **No semicolons** (ASI throughout).
- **Single quotes for JS/TS strings**, double quotes for JSX attributes.
- **2-space indentation.**
- **`async/await` preferred** over `.then()` chains (except auth bootstrap).
- **Supabase calls return `{ data, error }`** — never throw; context methods return `Promise<{ error: string | null }>`.
- **No try/catch around Supabase calls** unless wrapping non-Supabase side effects.
- **Realtime channel per context**, cleanup in `useEffect` return.
- **Refetch after write** even though realtime fires — explicit consistency before resolving.
- **Chinese strings inline in JSX**, no i18n library; enum→ZH maps in `src/types.ts`.
- **Pure helpers in `src/types.ts`** (e.g., `deriveStatus`, `floorsToProgress`).
- **Component naming: `PascalCase.tsx`**, pages default-export, components named-export.
- **Library files: `camelCase.ts`** in `src/lib/`.
- **SQL migrations: `v<N>-<slug>.sql`**, idempotent at top (`drop ... if exists`); helpers `SECURITY DEFINER SET search_path = public`.
- **No barrel files** (no `index.ts` re-exports).
- **15s fetch timeout** already wrapped in `src/lib/supabase.ts`.

---

## Risks (concrete blockers / unknowns the planner needs to address)

1. **Bundle-size CI guard fails the FIRST build it runs on.** Current entry chunk is 1.2 MB; threshold is 800 KB. The ride-along split + lazy `export.ts` import MUST land in the same PR as the CI check, or main goes red. **Mitigation:** order Wave 0 tasks so the Vite config change + lazy-load + CI check land together; defer enabling the Codemagic step until after the first green check on a feature branch.

2. **Playwright test requires seeded data.** No seed-test exists. Either extend `scripts/seed-demos.js` to ensure a deterministic PM + project + leaf item, or skip the seed step and rely on hand-made test data (fragile). **Mitigation:** add a Wave 0 task to extend `seed-demos.js`.

3. **Upload progress events not natively supported by `@supabase/supabase-js@^2.104`.** Per-file progress bars (D-03) cannot be literal; only indeterminate-then-done. **Mitigation:** clarify D-03 interpretation with user during plan review; UX falls back to spinner + KB/MB total per file.

4. **No existing leaf-item detail screen** — CONTEXT.md D-09, D-21 read literally but the codebase doesn't have one. **Mitigation:** recommend Option A (modal from `ProgressItemCard`) explicitly in the plan; flag for user confirmation in plan review.

5. **PDF.js worker first-run on real iOS device unverified.** The Vite `new URL(...)` pattern is documented and STACK.md-cited but not yet device-tested in this codebase. **Mitigation:** include device-verification steps in the QA task; have a fallback (copy worker to `public/`) ready if `import.meta.url` resolution breaks under Capacitor's `file://` scheme.

6. **`@capacitor/camera` Info.plist key compatibility (A4).** Adding the plugin may inject keys that already exist; or may expect different keys. **Mitigation:** post-install task to `git diff ios/App/App/Info.plist` and reconcile.

7. **Production `admin1234` password rotation status unknown** (STATE.md todo). Not strictly a Phase 1 blocker but a release-readiness risk noted by the milestone owner.

8. **Demo_feedback RLS fix (D-32) is a ride-along** — if the user has unfixed `demo_feedback` *data* tied to existing tests, the new admin-only select policy may break dashboards. **Mitigation:** verify whether any UI currently reads `demo_feedback` as non-admin before merging.

9. **`current_version_id` FK on `drawings` is deferred-added** in the migration to break a circular dependency with `drawing_versions`. This works but is unusual; ensure the migration runs as ONE transaction or in the correct order.

10. **Capacitor plugin install requires `npx cap sync ios && npx cap sync android` in CI before iOS/Android builds.** Currently `codemagic.yaml` runs `npx cap sync ios` / `npx cap sync android` after build. New plugin = first run will pull native code; verify Codemagic CocoaPods + Gradle caches don't need to be busted.

---

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — library + version locks, lazy-load wiring, worker setup (HIGH; cited Context7-equivalent npm/GitHub verification, dated 2026-05-11)
- `.planning/research/ARCHITECTURE.md` — storage path scheme, RLS pattern, version-pin semantics (HIGH; consistent with existing schema)
- `.planning/research/PITFALLS.md` — C1, C6, M2, M3, M6, m2, m5, m7, m8 (HIGH; evidenced by repo's own past v2 RLS recursion fix)
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `CONCERNS.md` — brownfield ground truth (HIGH; produced by codebase analysis on 2026-05-11)
- `supabase/v2-schema.sql`, `v3-progress-schema.sql`, `v4-issues-schema.sql`, `v6-account-deletion.sql` — read verbatim
- `src/contexts/IssuesContext.tsx`, `src/components/CreateIssueModal.tsx`, `src/pages/IssueDetail.tsx`, `src/components/ProgressItemCard.tsx`, `src/types.ts`, `src/lib/supabase.ts` — read verbatim
- `package.json`, `vite.config.ts`, `codemagic.yaml` — read verbatim

### Secondary (MEDIUM confidence)
- pdf.js issue #8305 — `new URL(..., import.meta.url)` workerSrc pattern (cited via STACK.md)
- Supabase Storage RLS template (cited via CONCERNS.md "Supabase Storage Audit" section)

### Tertiary (LOW confidence — flagged as assumptions)
- `@capacitor/camera@^8` + `@capacitor/filesystem@^8` exact version compatibility with `@capacitor/core@8.3.1` (A1) — verify at install via `npm view`
- Info.plist key compatibility (A4)
- Supabase JS upload progress events (A5)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions locked in CONTEXT.md + STACK.md, both dated 2026-05-11
- Architecture: HIGH — built directly on existing `can_view_project` / `can_edit_project_progress` helpers (verified in v3-progress-schema.sql)
- Migration outline: HIGH — schema mirrors existing repo conventions exactly
- Vite manualChunks: HIGH — config block is canonical Vite 5 syntax
- Bundle CI: HIGH — pure Node, no external deps
- Capacitor plugin: MEDIUM-HIGH — install commands standard but exact major-version line not pinned (A1)
- PDF.js worker: MEDIUM-HIGH — documented pattern; not yet device-tested in THIS repo
- Playwright scaffolding: HIGH — config is canonical; test relies on seed work (Wave 0)
- Pitfalls: HIGH — every major pitfall has a concrete mitigation traceable to either existing code or migration text

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days; stack is stable, no fast-moving libs)
