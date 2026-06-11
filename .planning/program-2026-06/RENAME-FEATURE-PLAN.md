# RENAME-FEATURE-PLAN — 大項/中項/細項 create 後可改名

**Verdict: the core capability ALREADY EXISTS and works at all three levels.**
Shipped in commit `1237b13` ("Real-workflow sim client fixes: … edit-item …") as
`EditItemModal` + `ProgressContext.updateItemMeta`. What remains is polish:
(1) renames leave **no audit-history record**, and (2) the **server-side gate is
looser than the client gate** (assigned contributors could rename via raw REST).
Both are small, additive fixes. No new screens needed.

---

## 1. Current state (verified in code)

### 1.1 Entry point — available on ALL levels, discoverable

- `src/components/ProgressItemCard.tsx:241-243` — the kebab (⋮) menu renders
  `MenuRow icon={Edit3} label="編輯（名稱／日期）"` gated only on `canEdit`,
  **not** on `isLeaf`. The card renders recursively for every level
  (`ProgressItemCard.tsx:286-299`), so 大項 (level 1), 中項 (level 2) and
  細項 (level 3+) all get the same 編輯 row.
- Kebab visibility: `hasMenuActions = canEdit || (isLeaf && !!drawingsCtx)`
  (`ProgressItemCard.tsx:153`) — every manager sees the ⋮ on every row.
  Non-managers see ⋮ only on leaves (drawings) and the 編輯 row is hidden from
  them. Correct.
- Label is explicit ("編輯（名稱／日期）"), so discoverability is fine; it sits
  one tap inside the overflow menu, same place as 指派/歷史/刪除 — consistent
  with the rest of the app.

### 1.2 Wiring — complete

- `src/pages/ProjectDetail.tsx:257` — `onEdit={setEditing}` passed through
  `ZoneSection` (`ProjectDetail.tsx:406,418,483`) into every card.
- `src/pages/ProjectDetail.tsx:303-307` — `<EditItemModal open={!!editing} … />`
  mounted once at page level.
- `src/components/EditItemModal.tsx:37-51` — validates non-empty title
  (`請輸入名稱`) and `planned_end >= planned_start`, then calls
  `updateItemMeta(item.id, { title, planned_start, planned_end })`.
  Code (編號) is shown read-only (`EditItemModal.tsx:65-67`) — title only is
  renameable, by design (code is the sort key, `ProgressContext.tsx:113`).

### 1.3 Persistence + reflection — correct everywhere

- `src/contexts/ProgressContext.tsx:189-205` — `updateItemMeta` does a plain
  `progress_items` UPDATE (sets `last_updated_by/at`), then `refetch()`.
  No delete+recreate, so **history, children, drawings, materials and
  assignments are preserved** (they all key on `item.id` / `parent_id`).
- Realtime: `progress-${projectId}` channel on `progress_items`
  (`ProgressContext.tsx:124-132`) → other open clients refetch the new title.
- Rollups: parent % is computed from descendant leaves by id
  (`ProgressItemCard.tsx:120-127` via `computeRollup`/`getDescendantLeaves`),
  so a rename never perturbs numbers; editing planned dates re-bases
  `plannedProgressOf` as the modal's comment promises.
- Exports: `src/lib/export.ts:266,380,501,620` read `it.title` from the live
  items array at export time → renamed title appears in Excel/PDF/issue export.
- Snapshots: `progress_snapshots` stores only `item_id + actual_progress`
  (`supabase/v25-progress-snapshots.sql:14-22`) → unaffected by rename.
- Push: the only UPDATE trigger on `progress_items` fires solely on
  `assigned_to/delegated_to` change (`supabase/v5-split/6-trg-pm-and-progress.sql:70-76`)
  → renames do NOT spam OneSignal. Good for the push budget.
- Offline: `updateItemMeta` is online-only (offline cache is read-only by
  design) — consistent with every other mutation.

### 1.4 Gating — client correct; server LOOSER than client

- Client: 編輯 row gated on `canEdit` = `canManageStructure`
  (`ProgressContext.tsx:64-76`): admin OR assigned PM OR approved member with
  membership role ∈ `pm / general_foreman / main_contractor`. Mirrors the v27
  server definition (`supabase/v27-progress-rights-by-membership.sql:28-42`). ✓
- Server: the `progress_items` UPDATE policy is the v15 one
  (`supabase/v15-progress-edit-rights-split.sql:71-82`):
  `can_manage_project_progress(...) OR auth.uid() = any(assigned_to) OR any(delegated_to)`
  — **row-level, not column-level**. So a worker assigned to a leaf can, via
  raw REST, change `title`, `code`, `planned_start/end`, `zone_id`, even
  `parent_id`/`level` on that row. The UI never exposes this, but for an app
  whose core value is "audit trail that survives disputes", a contributor
  silently retitling the work item they're being measured on is a real
  (if low-likelihood) hole. Pre-existing since v15; rename UI just makes it
  more visible.

### 1.5 Audit trail — renames are invisible to history

- `progress_history` records only progress ticks (`actual_progress`,
  `floors_completed`, `notes` — `supabase/v3-5-progress-extras.sql:19-27`);
  `updateItemMeta` writes no history row (`ProgressContext.tsx:189-205` calls
  no `recordHistory`). After a rename the only trace is the row's own
  `last_updated_by/at` being bumped — which also makes a rename look like a
  "progress touch" to anything reading that timestamp.
- In a dispute, "判頭 says the item used to be called X / dated Y" is exactly
  the contested fact. Today nothing proves what the title/dates were before.

---

## 2. Remaining gap → implementation plan (small)

The headline requirement「大項/中項/細項 create 後可改名」is **satisfied**.
Two polish items close it out fully:

### Task A (P1) — record renames/date-changes in the audit history

DB (new migration `supabase/v38-meta-change-history.sql`, additive only):

1. `alter table progress_history add column if not exists change_type text not null default 'progress'`
   and `add column if not exists meta jsonb` (old rows untouched; old clients
   ignore new columns — backwards compatible per constraints).
2. No RLS change needed: the v34 INSERT policy
   (`supabase/v34-realworld-sim-fixes.sql:127-136`) already allows anyone who
   can update the item to insert history.

Client:

3. `src/contexts/ProgressContext.tsx` — in `updateItemMeta`, after a successful
   UPDATE, insert a history row when anything actually changed:
   `{ item_id, actual_progress: item.actual_progress, change_type: 'meta',
      meta: { title: [old,new], planned_start: [old,new], planned_end: [old,new] },
      notes: '', updated_by: profile.id }` (diff only changed keys; reuse the
   non-blocking `console.error` pattern of `recordHistory`,
   `ProgressContext.tsx:172-184`).
4. `src/types.ts` — extend `ProgressHistoryEntry` with
   `change_type?: 'progress' | 'meta'` and `meta?: Record<string,[string|null,string|null]>`.
5. `src/components/HistoryModal.tsx` — for `change_type === 'meta'` rows render
   a compact line instead of the % badge, e.g.
   `名稱：「舊名」→「新名」` / `計劃日期：6月1日→6月8日` (zh-HK). ~20 lines.

### Task B (P2, hardening) — close the server/client gate mismatch

New trigger in the same v38 migration: `before update on progress_items`
raise exception when any of `title / code / planned_start / planned_end /
zone_id / parent_id / level / tracking_mode / floor_labels` is distinct and
`not can_manage_project_progress(auth.uid(), new.project_id)` (skip when
`auth.uid() is null` so service-role/migrations pass). Contributors keep
updating `actual_progress / floors_completed / status / notes /
last_updated_*` — exactly what `UpdateProgressModal` sends. This also blocks
`parent_id`/`level` tampering for free.

### Task C (P3, optional UX nits — take or leave)

- `EditItemModal` on a **parent** lets you set planned dates that have no
  visible effect (parent 計劃% is rolled up from leaves,
  `ProgressItemCard.tsx:124`). Either hide the date fields for non-leaves or
  add a hint `非細項日期不影響計劃進度`. One conditional.
- 編號 (code) rename stays out of scope: it is the tree sort key and embedded
  in zone-numbering logic — renaming it safely is a different feature.

### Verification

1. `npm run build` (tsc strict).
2. As membership-PM on test project `cccc2026-…2620`: rename a 大項, a 中項,
   a 細項 → title updates in list, rollup % unchanged, 歷史 shows the meta row.
3. As assigned worker (REST, anon key + worker JWT): `PATCH progress_items?id=eq.<leaf>`
   with `{"title":"hax"}` → expect 403/exception after Task B; progress tick
   still succeeds.
4. Export Excel/PDF → new title present.

**Effort:** Task A ≈ 1–2 h, Task B ≈ 1 h, Task C ≈ 15 min. No new tables, no
destructive changes, no push-budget impact.
