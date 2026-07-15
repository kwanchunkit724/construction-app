# Architecture Patterns

**Domain:** HK construction site control — Drawings, SI/VO, PTW on top of existing Supabase + React + Capacitor stack
**Researched:** 2026-05-11
**Confidence:** HIGH (built on already-mapped existing architecture; integration choices verified against current Supabase + OneSignal docs)

---

## Scope Reminder

This is an **integration architecture** for three new feature families layered onto an already-live app. The base architecture (HashRouter SPA, AuthContext, RLS, OneSignal v1 /players, Capacitor 8) is unchanged. Every recommendation below either reuses an existing seam or introduces the smallest new seam that keeps consistency with the existing code.

---

## Recommended Architecture

### High-level component map

```
┌─────────────────────────────────────────────────────────────────────┐
│  React SPA (Vite, HashRouter)                                       │
│                                                                     │
│  AuthContext  ProjectsContext  ProgressContext  IssuesContext       │
│      │              │                │                │             │
│      └──────────────┴────────────────┴────────────────┘             │
│                          │                                          │
│      DrawingsContext     SiVoContext     PtwContext   <-- NEW       │
│           │                  │                │                     │
│           ▼                  ▼                ▼                     │
│   DrawingsModal       SI/VO List + Detail   PtwList + PtwDetail     │
│           │                  │                │                     │
│           └────── lazy-loaded PDF viewer + zoom-pan-pinch ──────┐   │
└─────────────────────────────────────────────────────────────────┼───┘
                                  │                               │
                                  ▼                               ▼
            ┌───────────────────────────────────────┐    Capacitor plugins
            │  Supabase                             │    - push-notifications
            │  ┌─────────────┐  ┌────────────────┐ │    - filesystem (offline)
            │  │  Postgres   │  │  Storage       │ │    - network (online?)
            │  │  + RLS      │  │  - drawings/   │ │
            │  │  + pg_cron  │  │  - si-vo/      │ │
            │  │  + pg_net   │  │  - ptw/        │ │  (all private buckets)
            │  └──┬──────────┘  └────────────────┘ │
            │     │                                 │
            │     ▼  pg_net POST                    │
            │  Edge Function: expire-ptw-daily      │
            │  (pg_cron @ 23:59 HKT = 15:59 UTC)    │
            └──────────────────┬────────────────────┘
                               │
                               ▼
                       OneSignal /notifications
                       (one push per state transition,
                        targeted via external_user_id)
```

### Component boundaries

| Component | Owns | Talks to | Does NOT touch |
|-----------|------|----------|----------------|
| `DrawingsContext` | `drawings` table reads + writes, Storage upload/signed-URL, realtime channel `drawings-${projectId}` | Supabase client, `progress_items` (read leaf check only) | OneSignal directly (drawings have no notifications in MVP) |
| `SiVoContext` | `site_instructions`, `variation_orders`, `vo_line_items`, `approvals` rows, realtime channel `si-vo-${projectId}` | Supabase, `project_approval_chain` for next-step lookup | Permit tables, drawing storage |
| `PtwContext` | `permits_to_work`, `permit_signoffs`, `permit_signoff_chain` rows, realtime channel `ptw-${projectId}` | Supabase, QR generator (`qrcode` npm) | Approval chain table (PTW has its own dedicated chain — see §2) |
| `expire-ptw-daily` Edge Function | Status transition `active → expired` at end-of-day HKT | Postgres direct via service role | Push (DB trigger fires push on status change) |
| Existing notification trigger style (`supabase/v5-split/`) | Fan-out push on every state transition for SI/VO/PTW | pg_net → OneSignal | UI — pure DB-side |

The orthogonal principle: **each new context is to its feature what `IssuesContext` is to issues today**. No cross-context imports. If SI references a drawing, it stores `drawing_id` and the SI UI loads `DrawingsContext` lazily.

---

## §1 — Drawings: Storage architecture

### Path scheme

```
drawings/{project_id}/{drawing_id}/v{version}/{original_filename}
drawings/{project_id}/{drawing_id}/v{version}/thumb.jpg   (256x256 JPEG, generated)
```

Why this shape:
- **`project_id` first**: enables the RLS Storage policy below to match on first path segment via `storage.foldername(name)[1]`.
- **`drawing_id` next**: groups versions together; lifecycle operations (purge, list versions) are a single prefix scan.
- **`v{version}`**: human-debuggable. Version is an integer column on `drawings` (monotonic per `progress_item_id`).
- **`thumb.jpg` sibling**: same RLS scope, fetched in lists without rasterising the PDF on device.

### Tables

```sql
-- v8-drawings-schema.sql (renumbered from earlier ARCHITECTURE.md sketch
-- because we're skipping the contested v5-v7 namespace per PROJECT.md)

create table drawings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  progress_item_id uuid not null references progress_items(id) on delete cascade,
  title           text not null,
  current_version int  not null default 1,
  is_superseded   boolean not null default false,  -- soft-delete; never hard-delete
  created_by      uuid references user_profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table drawing_versions (
  id            uuid primary key default gen_random_uuid(),
  drawing_id    uuid not null references drawings(id) on delete cascade,
  version       int  not null,
  file_path     text not null,        -- drawings/{pid}/{did}/v{n}/{name}
  thumb_path    text,                 -- drawings/{pid}/{did}/v{n}/thumb.jpg
  file_mime     text not null,        -- 'application/pdf' | 'image/png' | 'image/jpeg'
  file_size_bytes bigint not null,
  revision_note text,                 -- "Rev B — added column line 5"
  uploaded_by   uuid references user_profiles(id),
  uploaded_at   timestamptz default now(),
  unique (drawing_id, version)
);

-- enforce leaf-only
create or replace function assert_progress_item_is_leaf() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from progress_items where parent_id = new.progress_item_id) then
    raise exception 'drawings can only attach to leaf progress items';
  end if;
  return new;
end $$;

create trigger drawings_leaf_only before insert or update on drawings
  for each row execute function assert_progress_item_is_leaf();
```

### Supersede vs delete

- **Hard delete is disabled in the UI.** A drawing is either *current* (`is_superseded=false`) or *superseded* (`is_superseded=true`). Both are visible in the version history; only current ones show in the leaf-item summary card.
- **New version = INSERT into `drawing_versions` + UPDATE `drawings.current_version`** in a transaction. Old versions remain in Storage. This is the audit trail — disputes reference "the drawing as of revision B".
- **"Delete" UX button** sets `is_superseded=true` with no new version. Admin can un-supersede; nobody can purge.
- Storage objects are never deleted by the app. A future janitor cron may purge orphans (file_path not referenced by any `drawing_versions` row), but not in this milestone.

### Version pinning in SI/VO/PTW

When an SI references a drawing, store `drawing_version_id` (FK to `drawing_versions`), not `drawing_id`. This is the unforgeable pin: "the instruction was given against rev B, here is rev B". If someone uploads rev C later, the SI still resolves to rev B. This is the entire reason for the audit trail.

### Storage bucket + RLS

Bucket name: `drawings`. **Private** (not public). Access only via signed URLs (`createSignedUrl`, 1-hour TTL is enough for a viewer session; refresh on viewer mount).

RLS policy template (apply identically to `si-vo` and `ptw` buckets):

```sql
-- Select: must be able to view the project
create policy "drawings_select_project_member" on storage.objects for select
  using (
    bucket_id = 'drawings'
    and can_view_project(
      (storage.foldername(name))[1]::uuid    -- first path segment = project_id
    )
  );

-- Insert: must be able to edit project progress (same role gate as drawings.create)
create policy "drawings_insert_project_editor" on storage.objects for insert
  with check (
    bucket_id = 'drawings'
    and can_edit_project_progress(
      (storage.foldername(name))[1]::uuid
    )
  );

-- Update/delete on storage.objects: disabled — we never mutate or remove blobs.
```

This pattern works because clients always upload to a path that starts with `{project_id}/`. Client-side, refuse to call `.upload(path, file)` if `path` doesn't start with the active project ID — defence-in-depth alongside RLS.

### Thumbnail strategy

**Decision: client-side first, server-side later only if needed.**

Why client-side for v1:
- PDFs in this app are typically 1–5 MB single-page or first-page-is-cover drawings. Rendering page 1 in a `pdfjs-dist` worker on the device takes < 500 ms on a modern phone.
- Eliminates an Edge Function + storage write path entirely for this milestone.
- The upload UX is already async ("uploading… processing…"); adding a 500 ms thumbnail step is invisible.

Flow:
1. User picks file. We compute SHA-256 to dedupe (optional) and detect MIME.
2. If image → `createImageBitmap` → resize to 256×256 → JPEG blob.
3. If PDF → `pdfjs-dist` `getDocument().getPage(1).render(canvas, viewport)` at scale fitting 256×256 → `canvas.toBlob('image/jpeg', 0.7)`.
4. Upload both: original at `v{n}/{name}`, thumb at `v{n}/thumb.jpg`, in parallel.
5. INSERT `drawing_versions` row with both paths.

Mobile concerns ([Nutrient PDF viewer notes](https://www.nutrient.io/blog/how-to-build-a-reactjs-pdf-viewer-with-react-pdf/)): iOS Safari caps canvas memory ~256 MB. For thumbnails (small canvas) this is fine. For the full viewer we still lazy-load `pdfjs-dist` and cap render scale.

Server-side fallback (deferred — not in this milestone): if we see clients producing bad thumbnails (older Android WebViews, very large PDFs), add a Supabase Edge Function `generate-drawing-thumb` triggered by Storage webhook on object create. Until that signal appears, don't build it.

### Realtime + viewer

- `DrawingsContext` subscribes to `postgres_changes` filtered to `project_id`. On any change → refetch the affected `progress_item_id` slice.
- Viewer modal: lazy import `react-zoom-pan-pinch` and `pdfjs-dist` so they stay out of the main 1.2 MB bundle (per CONCERNS.md).
- Signed URL refresh: viewer remembers `expiresAt` from URL params; if user keeps viewer open > 50 min, call `createSignedUrl` again before expiry.

---

## §2 — Approval chain state machine

### Schema decision: separate rows, not JSONB

```sql
-- Per-project, per-document-type chain definition.
-- Document types: 'si' | 'vo' | 'ptw'  (PTW has its own chain, see §3)
create table project_approval_chains (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  doc_type      text not null check (doc_type in ('si','vo','ptw')),
  step_order    int  not null,
  role          text not null,   -- 'main_contractor' | 'architect' | 'client' | 'pm' | 'safety_officer'
  approver_user_id uuid references user_profiles(id),  -- nullable: role-only step
  is_required   boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (project_id, doc_type, step_order)
);

-- Per-document approval log
create table approvals (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  doc_type        text not null check (doc_type in ('si','vo','ptw')),
  doc_id          uuid not null,                 -- soft FK (resolved by doc_type)
  step_order      int  not null,
  role            text not null,
  approver_user_id uuid references user_profiles(id),
  decision        text not null check (decision in ('approved','rejected','revoked')),
  comment         text,
  decided_at      timestamptz default now(),
  chain_snapshot  jsonb not null  -- frozen copy of the chain rows at submission time
);
```

**Why separate rows beat JSONB-on-project:**
1. **RLS targeting**: an approver's "what's waiting on me" query is `select * from approvals_pending_for(auth.uid())` — a view joining `project_approval_chains` to current docs. Trivial with rows; gnarly with JSONB.
2. **FK integrity to `user_profiles`**: if an approver is deactivated mid-flow, the FK + a trigger can flag the chain step as "needs reassignment". JSONB loses this.
3. **Indexing**: `(project_id, doc_type, step_order)` is a B-tree lookup. `jsonb_path_query` is not.
4. **Audit independence**: the `approvals` table is append-only. The chain *definition* (`project_approval_chains`) can mutate. Decisions captured against the snapshot in `chain_snapshot` preserve "what the chain looked like when I signed".

**Re-ordering / inserting mid-flow:**
- Chain definition is mutable by admins at any time (UPDATE on `project_approval_chains`).
- In-flight docs **freeze** their chain at submission time via `chain_snapshot`. Mid-flight chain edits do not retroactively change a doc's required signoffs.
- New docs created after the edit use the new chain.
- This is the only sane semantics. "Inserting an approver mid-flow on an already-in-flight doc" is explicitly out-of-scope; if needed the user must reject + resubmit.

### State machine (SI / VO — applies the same to both)

```
draft  ─submit──▶  pending(step=1)  ─approve──▶  pending(step=2)  ─approve──▶  fully_approved
   ▲                  │                              │                                    │
   │                  reject                         reject                            close
   └────────────────────┴──────────────────────────────┘                                  │
                                                                                          ▼
                                                                                       closed
```

Computed status (not a stored column — derived from approvals):
- `draft` — no `approvals` rows
- `pending(N)` — last approval's `step_order < max(step_order)` and decision='approved' OR no approvals yet (then N=1)
- `rejected` — most recent decision='rejected'
- `fully_approved` — all required steps have decision='approved'
- `closed` — explicit close action by issuer (separate boolean column `is_closed`)

Implementation: a SQL view `si_status_view` / `vo_status_view` that joins approvals. Contexts read from the view. Triggers on `approvals` insert fire OneSignal pushes to the *next* approver (see §4).

### Audit log

The `approvals` table **is** the audit log. Append-only. Every state transition is a row. To "see what happened on SI #42": `select * from approvals where doc_id = '...' order by decided_at`. Include `chain_snapshot` for full context.

A `revoke` decision (admin power) writes another row with `decision='revoked'` rather than deleting. Status computation considers the latest decision per step.

---

## §3 — PTW lifecycle

### State machine

```
draft ─submit─▶ pending_safety ─approve─▶ pending_mc ─approve─▶ active
                      │                        │                   │
                      reject                   reject              │
                                                                   │ end of day (HKT 23:59)
                                                                   ▼
                                                                expired
                                                                   │
                                                                   │ optional close-out signatures
                                                                   ▼
                                                                completed
```

Cancelled is a terminal status reachable from any pre-active state. PTW uses the same `project_approval_chains` infrastructure with `doc_type='ptw'`, except the chain is conventionally `[safety_officer, main_contractor]` (admin can extend, e.g. add PM).

```sql
create table permits_to_work (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  permit_number     text not null,                 -- "PTW-2026-0042"
  work_type         text not null check (work_type in
                      ('hot_work','confined_space','height','lifting',
                       'excavation','electrical','scaffolding')),
  work_location     text not null,
  work_description  text not null,
  requested_by      uuid references user_profiles(id),
  requested_at      timestamptz default now(),
  valid_from        timestamptz not null,
  valid_to          timestamptz not null,          -- always end of HKT day for MVP
  status            text not null default 'draft' check (status in
                      ('draft','pending_safety','pending_mc','active',
                       'expired','completed','cancelled','rejected')),
  qr_token          text unique,                   -- random 32-byte URL-safe; nullable until active
  attached_drawings jsonb default '[]',            -- [{drawing_version_id, label}]
  attachments       jsonb default '[]',            -- storage paths in ptw/ bucket
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table permit_signoffs (
  id          uuid primary key default gen_random_uuid(),
  permit_id   uuid not null references permits_to_work(id) on delete cascade,
  signer_id   uuid not null references user_profiles(id),
  role        text not null,                 -- 'safety_officer'|'main_contractor'|'pm'|'worker'
  phase       text not null check (phase in ('approval','closeout')),
  decision    text not null check (decision in ('approved','rejected')),
  comment     text,
  signature_blob text,                       -- base64 PNG of canvas signature (small)
  signed_at   timestamptz default now()
);
```

### QR-code encoding

**Decision: signed JWT, not a deep link with the permit ID.**

The QR encodes a short URL containing a signed token:
```
https://ck-construction.app/qr?t=<jwt>
                                ▲
                                 │
            { permit_id, project_id, valid_to, iat, exp }
            signed HS256 with secret in app_config.ptw_qr_secret
```

Why JWT:
- **Tamper-proof**: a foreman cannot screenshot yesterday's QR and pretend it's today's — the JWT `exp` matches `permits_to_work.valid_to`. Verifier rejects expired.
- **Offline-readable**: any scanner can verify the signature without a DB round-trip. Useful when a Labour Department inspector arrives — show the permit on the worker's phone screen, the QR carries its own proof of authenticity (subject to clock skew tolerance).
- **No PII in QR**: only opaque IDs, not worker names.

The `/qr` endpoint (a Vercel static page using HashRouter, or a tiny Edge Function) decodes the token, fetches permit details if user is authenticated and has project access, otherwise renders a public "valid permit / expired / invalid signature" summary card. The point of QR-scanning is the inspector — they don't need full details, they need "is this a real, active permit for this site today?"

Library: `jose` (browser-compatible JWT) on issue side (Edge Function or DB function using pgjwt). Verify on read.

### Auto-expire mechanism

**Decision: Supabase Cron + Edge Function, not client-side.**

Client-side expiry is unsafe: a worker with the app closed at midnight has a permit that's still `status='active'` in the DB until they next open the app. Inspectors querying via QR get a stale answer.

Implementation per [Supabase Cron docs](https://supabase.com/docs/guides/cron):

```sql
-- pg_cron schedule: every day 23:59 HKT = 15:59 UTC
select cron.schedule(
  'expire-active-ptw',
  '59 15 * * *',
  $$
    update permits_to_work
    set status = 'expired', updated_at = now()
    where status = 'active' and valid_to <= now()
    returning id;
  $$
);
```

No Edge Function strictly needed — pg_cron can run plain SQL. The DB trigger on `permits_to_work` UPDATE already fires push notifications, so the same path notifies the requester.

If we later need richer expiry logic (notify safety officer to do close-out walk, generate a summary PDF), upgrade to Cron → Edge Function via pg_net POST. Not in this milestone.

### Permit close-out signatures

After `expired` (or `active`, if work finished early), the requester can submit close-out:
- INSERT `permit_signoffs` rows with `phase='closeout'`.
- Required closeout signers: requester + safety officer (mirrors approval). Admin-configurable via `project_approval_chains` with a `phase` column (deferred — MVP hardcodes the two-signer closeout).
- When all required closeout signatures present → `status='completed'`.

---

## §4 — Notification flows

### Trigger pattern (reuse existing v5-split style)

For each doc-type state transition, a row-level trigger calls the existing `send_push_to_users(user_ids uuid[], headings jsonb, contents jsonb, data jsonb)` function. Examples:

| Transition | Recipient | Trigger location |
|------------|-----------|------------------|
| SI submitted | Next approver in chain | `trg_si_approval_inserted` |
| SI step approved | Next approver in chain (or issuer if final) | `trg_si_approval_inserted` |
| SI rejected | Issuer | `trg_si_approval_inserted` |
| VO submitted / step / final | Same pattern | `trg_vo_approval_inserted` |
| PTW submitted | Safety officers on project | `trg_ptw_status_change` |
| PTW safety approved | Main contractors on project | `trg_ptw_status_change` |
| PTW active | Requester (with QR deep link) | `trg_ptw_status_change` |
| PTW expired | Requester (close-out reminder) | `trg_ptw_status_change` |
| Drawing uploaded | Project PMs (digest, optional v2) | DEFERRED — drawings are not push-worthy in MVP |

The "next approver" resolution is a SQL helper:
```sql
create or replace function next_approver_for(doc_type text, doc_id uuid, project_id uuid)
returns uuid language sql security definer set search_path = public as $$
  -- returns the approver_user_id (or any user with the role) for the next pending step
$$;
```

Push payload template (bilingual, matches existing convention):
```jsonc
{
  "headings": { "en": "SI #042 awaiting your approval", "zh-Hant": "工地指令 #042 等待批核" },
  "contents": { "en": "Plumbing rerouting at Block A 3/F", "zh-Hant": "A座3樓水喉改道" },
  "data": { "deep_link": "/project/{pid}/si-vo/{si_id}" }
}
```

The existing `pushNotificationActionPerformed` listener in `src/lib/push.ts` already handles `data.deep_link` — no change needed.

### Action buttons / reply-from-push

**Verdict: technically supported by OneSignal, deferred for this milestone.**

OneSignal's [action buttons docs](https://documentation.onesignal.com/docs/en/action-buttons) confirm support on iOS, Android, and web — you set `buttons: [{ id, text, icon }]` in the notification payload. The OneSignal Capacitor SDK exposes click events.

But we are not using the OneSignal Capacitor SDK — we use raw `@capacitor/push-notifications` and only OneSignal's REST API for fan-out. The native action-button callback would need to surface to JS through a custom handler, which means either:
- migrating to the OneSignal Capacitor SDK (adds another native dependency, conflicts with the existing /players v1 registration), or
- writing custom native handlers in `AppDelegate.swift` and an Android `NotificationOpenedHandler`.

Neither is justified by the value of one-tap approval in MVP. **Tap-to-open-app and approve in-app** is the pattern. Action buttons are a v2 polish item; flag in PITFALLS.

### Spam budget

OneSignal Free tier limits and PROJECT.md's "don't spam" constraint:
- One push per transition. No "reminder" pushes in MVP.
- Bundle when possible: if a single SI has 3 sequential auto-approvals (e.g. admin pre-approving), the trigger sends to the *final* next approver only, not each interim role. Implement via a debounced trigger function or by only firing on transitions that change `current_pending_role`.

---

## §5 — Offline considerations

**Decision: fail fast for state-changing actions. Read-only cached views for everything else.**

### Why fail fast for signoffs

PTW signoff is a *legal-evidentiary act* — the worker is asserting to the Labour Department that conditions were met at time T. An offline-queued signoff that syncs hours later corrupts the timestamp evidence. A safety officer "signing" at 8:00 AM but actually offline-queued at 7:30 AM before doing the inspection is exactly the fraud the system exists to prevent.

Rules:
- **PTW approval and closeout signoffs require live connectivity.** UI shows "no signal — move to area with signal to sign" using `@capacitor/network` to detect status.
- **SI/VO approval similarly requires online.** Approval timestamps are the audit anchor.
- **Drawing upload requires online** — chunked uploads to Supabase Storage; we don't queue large blobs.

### What CAN work offline (read-only)

- **Viewing a previously-loaded drawing**: cache via `@capacitor/filesystem` after first signed-URL fetch, keyed by `drawing_version_id`. Drawings rarely change once published; cached blob is safe.
- **Viewing pending PTW details**: the QR-scan flow specifically — when a Labour Department inspector arrives in a basement with no signal, the QR's embedded JWT proves authenticity offline. The app shows cached permit details if the local DB has them.
- **Reading the project's progress tree**: already cached in-memory via context; no behaviour change.

### Detection mechanism

Add `@capacitor/network` plugin (small, official, in maintenance). Surface `isOnline` in a new `NetworkContext` or attach to `AuthContext` (low effort). Gate all mutation buttons with `disabled={!isOnline}` plus a friendly Chinese banner: 「目前無網絡 — 請移至有信號位置簽核」.

### Resync after reconnect

Already handled by Supabase realtime: each context's channel auto-reconnects and refetches on `SUBSCRIBED` event. No code needed.

---

## Data flow narratives

### Flow A — Worker requests PTW

1. Worker opens `/project/{id}/ptw` → `PtwContext.create({ work_type, work_location, valid_from, valid_to, attached_drawings })`.
2. INSERT into `permits_to_work` with `status='pending_safety'`, no `qr_token` yet.
3. DB trigger `trg_ptw_status_change` calls `send_push_to_users(safety_officer_ids_for_project(p), …)` via pg_net → OneSignal.
4. Safety officer's device receives push → tap → HashRouter navigates to `/project/{id}/ptw/{permitId}`.
5. Officer reviews + clicks approve → `PtwContext.signoff(permitId, 'approved', comment, signatureBlob)`.
6. INSERT into `permit_signoffs`. Trigger advances `permits_to_work.status` to `pending_mc`. Another push fires.
7. MC approves → status `active`, `qr_token` generated (DB function `gen_ptw_qr(permit_id)` using pgjwt or random+JWT in Edge Function), push to requester with deep link.
8. Worker shows QR to inspector. JWT is self-verifying.
9. 23:59 HKT — pg_cron flips active rows to `expired`. Trigger pushes requester to do closeout.

### Flow B — Subcon issues SI referencing a drawing

1. Subcon opens leaf progress item → drawings modal → notes "this is the as-built" → records `drawing_version_id`.
2. Subcon creates SI in `/project/{id}/si-vo` with `related_drawing_version_id = …`.
3. INSERT `site_instructions`; no approvals row yet (status=`draft`). User clicks submit.
4. Submit handler INSERTs into `project_approval_chains` snapshot → creates initial `approvals` row only when each step is reached; OR (simpler) pre-creates pending placeholders. **Decision: don't pre-create.** Status is derived from "highest step with decision='approved'" so a missing row means "still waiting on step N+1".
5. Trigger on `site_instructions` insert (or a separate `si_submitted` event row) computes `next_approver_for('si', si_id, project_id)` and pushes them.
6. Approver opens SI → sees drawing rev B inline (signed URL on `drawing_versions.file_path`) → approves. INSERT `approvals(decision='approved', step_order=1)`.
7. Trigger fires next push. Chain advances until last step → final approval → push to issuer "fully approved" → SI is now binding.

---

## Suggested build order (within each phase)

Confirming **Drawings → SI/VO → PTW**, with sub-steps:

### Phase 1 — Drawings
1. Migration `v8-drawings-schema.sql` + private `drawings` bucket + RLS policies.
2. `Drawing` types in `src/types.ts`.
3. `DrawingsContext` with realtime; basic fetch + upload (no thumbnail yet).
4. `DrawingsModal` opened from `ProgressItemCard` (image preview only, no PDF).
5. Add `pdfjs-dist` (lazy chunk) + client-side thumbnail generation on upload.
6. PDF viewer with `react-zoom-pan-pinch` (lazy chunk).
7. Version history UI; supersede toggle.
8. Smoke Playwright test: upload → view → version-2 upload → version-1 still accessible.

### Phase 2 — SI/VO
1. Migration `v9-si-vo-schema.sql` including `project_approval_chains`, `approvals`, `site_instructions`, `variation_orders`, `vo_line_items`.
2. Admin UI: chain editor on project detail (admin-only tab). Reorder via drag; save reorders `step_order`.
3. `SiVoContext` + `useChain(projectId, docType)` hook reading current chain.
4. SI list + detail + submit + approve flows.
5. VO list + detail + line-item editor (labour/material/preliminaries/contingency).
6. DB triggers `trg_si_approval_inserted`, `trg_vo_approval_inserted` + push payloads (zh-Hant + en).
7. Drawing-pinning UI in SI detail (reuse drawings modal in select-mode).
8. Smoke test: 3-step chain → approve through → final notification fires.

### Phase 3 — PTW
1. Migration `v10-ptw-schema.sql` (use `project_approval_chains` already in place).
2. New global role `safety_officer` — extend `user_profiles.global_role` check + `AdminUsers` UI + RLS helpers. **This is the cross-cutting change with highest risk** — gate behind a feature flag if possible.
3. `PtwContext` + list + create UI for top-3 work types (hot work / confined space / height).
4. Signoff flow with signature canvas (small library or pure canvas).
5. QR generation: Edge Function `mint-ptw-qr` using `jose` (or Postgres `pgjwt` if available) — verify via Edge Function `verify-ptw-qr`.
6. pg_cron job for daily expiry.
7. Public `/qr?t=…` route for inspector view.
8. `@capacitor/network` integration + offline banners on PTW pages.
9. Smoke test: create → safety approve → MC approve → active w/ QR → cron-simulate expire → closeout.

### Dependencies the user might have missed

- **`safety_officer` role addition is structural and touches existing tables** (`user_profiles` CHECK constraint, possibly RLS helpers that whitelist global roles). Do this as the *first* migration of Phase 3 in isolation — easier to roll back if it breaks live users than to bundle with PTW schema.
- **`project_approval_chains` table is shared between SI/VO and PTW.** Build it in Phase 2 with `doc_type` already supporting `'ptw'`. Phase 3 only needs to populate seed chain rows, not invent the table.
- **QR / JWT signing requires a secret in `app_config`** — adds a row to an existing table; ensure migration ordering doesn't conflict with rotation.
- **`@capacitor/network` is a new native plugin**, which means a Capacitor sync + CI rebuild + Codemagic verification before Phase 3 ships. Treat as a Phase 3 pre-flight item.

---

## Anti-patterns to avoid

### Anti-pattern: storing approval chain as JSONB on `projects`
**Why bad:** Loses RLS targeting for "what's waiting on me" queries; FK to deactivated users silently breaks; reordering requires whole-document rewrite.
**Instead:** rows in `project_approval_chains`.

### Anti-pattern: hard-deleting drawings or drawing_versions
**Why bad:** The entire feature exists to be unforgeable evidence. A "delete" button on the audit trail defeats the product.
**Instead:** `is_superseded=true`. Storage blobs are never deleted by app code.

### Anti-pattern: client-side PTW expiry
**Why bad:** Workers with closed apps leave active permits in the DB past their valid_to. Inspectors querying by QR get stale truth.
**Instead:** pg_cron flips status at 23:59 HKT.

### Anti-pattern: offline-queued signoffs
**Why bad:** Signature timestamps are the evidentiary anchor. Drift-corrupted signoffs are worse than no signoffs.
**Instead:** fail fast, surface "no signal" banner, require physical relocation to sign.

### Anti-pattern: public Storage buckets for drawings / PTW attachments
**Why bad:** Cross-site data leakage; competitors / disgruntled subcons can scrape. Existing `issue-photos` public bucket is a v1 shortcut, not a precedent.
**Instead:** private buckets + `can_view_project()` RLS on `storage.objects` per the policy template above.

### Anti-pattern: pre-creating "pending" approval rows
**Why bad:** Approvals table becomes a state mutation log instead of an append-only audit log. Reorders on the chain become row-update minefields.
**Instead:** approvals rows are created only on actual decisions; status is computed from `max(step_order where decision='approved')` joined to the chain snapshot.

---

## Scalability considerations

| Concern | Now (1 site, ~50 users) | 10 sites, 500 users | 100 sites, 5000 users |
|---------|--------------------------|----------------------|------------------------|
| Drawing storage | OK | OK (drawings small + few per item) | Move thumbs to Edge Function-generated + CDN |
| Realtime channels | One per (context × project) | One per (context × project) — still fine | Consider broadcasting via a fan-out edge function if Supabase realtime quota hit |
| Push notifications | OneSignal Free tier OK | Approaching Free tier limits — budget review | Paid OneSignal + digest bundling |
| pg_cron expiry | Runs in ms | Runs in ms | Runs in ms (indexed on `(status, valid_to)`) |
| Storage egress | Within Free tier 1 GB cap | Likely over — paid tier required | Required |

The architecture does not change shape at any of these scales; what changes is the tier of the underlying services. Good.

---

## Sources

- Existing project docs (HIGH confidence): `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/INTEGRATIONS.md`.
- [Supabase Cron docs](https://supabase.com/docs/guides/cron) — pg_cron schedule for daily expiry (HIGH).
- [Scheduling Edge Functions | Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions) — pattern for cron → Edge Function via pg_net (HIGH).
- [OneSignal action buttons](https://documentation.onesignal.com/docs/en/action-buttons) — confirmed supported, but requires SDK migration; flagged as deferred (HIGH).
- [react-pdf docs](https://www.npmjs.com/package/react-pdf) and [Nutrient mobile PDF viewer notes](https://www.nutrient.io/blog/how-to-build-a-reactjs-pdf-viewer-with-react-pdf/) — pdfjs-dist on mobile canvas constraints (MEDIUM — third-party blog, but consistent with pdfjs upstream).
- [OneSignal Capacitor sample](https://github.com/OneSignalDevelopers/onesignal-ionic-capacitor-sample) — confirms Capacitor SDK exists separately from raw push-notifications plugin (HIGH).

Sources:
- [Supabase Cron docs](https://supabase.com/docs/guides/cron)
- [Scheduling Edge Functions | Supabase Docs](https://supabase.com/docs/guides/functions/schedule-functions)
- [OneSignal action buttons](https://documentation.onesignal.com/docs/en/action-buttons)
- [react-pdf on npm](https://www.npmjs.com/package/react-pdf)
- [Nutrient: How to build a React PDF viewer with react-pdf (2026)](https://www.nutrient.io/blog/how-to-build-a-reactjs-pdf-viewer-with-react-pdf/)
- [OneSignal Ionic/Capacitor sample](https://github.com/OneSignalDevelopers/onesignal-ionic-capacitor-sample)
