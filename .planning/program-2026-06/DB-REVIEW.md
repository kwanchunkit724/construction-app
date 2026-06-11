# DB-REVIEW — senior backend / system-analyst review of the CK工程 database

> Problem 1 (part B) · 2026-06-11 · grounded in `supabase/*.sql` v2→v37, `DB-STRUCTURE.md`,
> CLAUDE.md, and the bugs the 2026-06-10/11 daily-sim surfaced (v33/v34/v35/v36/v37).
> Lens: the product's core promise — **a shared audit trail that survives disputes**, multi-site,
> per-project role model — on Supabase Free (1GB), with live iOS App Store users who must not break.

## 0. Verdict

The schema is **fundamentally sound and unusually well-disciplined for a solo build**: append-only
audit tables, immutable storage blobs, frozen approval-chain snapshots, server-computed money,
on-delete `restrict` for authors, and a coherent per-project RBAC. It earns the "survives disputes"
claim better than the WhatsApp/paper status quo by an order of magnitude. The weaknesses are not
structural rot — they are (a) **RLS column-granularity gaps**, (b) a **role-resolution quirk**
(`active_role_holders` treats every admin as a holder of every role), (c) **incomplete audit coverage**
on metadata mutations, and (d) **migration-application discipline** (the v33 incident). Prioritised
below.

## 1. P0 / P1 findings

### P1-A — RLS is row-level, not column-level, on `progress_items` (and others)
The v15 UPDATE policy (`supabase/v15-progress-edit-rights-split.sql:71-82`) lets anyone who
`can_manage_project_progress` **OR** is in `assigned_to`/`delegated_to` update the *whole row*. A
contributor assigned to a leaf can, via raw REST, rewrite `title`, `code`, `planned_start/end`,
`zone_id`, even `parent_id`/`level` — silently re-parenting or retitling the very work item they are
measured on. The UI never exposes it, but for a dispute-evidence product this is a real hole.
**Fix:** a `before update` trigger on `progress_items` that rejects changes to structural/metadata
columns unless `can_manage_project_progress` (skip when `auth.uid() is null` for migrations). Same
pattern should audit `dailies`, `materials` for who-can-change-what beyond the row gate. (Captured as
Task B in `RENAME-FEATURE-PLAN.md`; fold into the rename v38.)

### P1-B — `active_role_holders` makes every admin a holder of every role
`supabase/v9-rls-helpers.sql:34-35` unconditionally unions all `global_role='admin'` users into the
holder set for **any** `required_role`. Consequence proven live in the daily-sim: a PTW step requiring
`safety_officer` resolves to the 3 system admins, so the new fail-fast guard in v37 effectively never
fires, and more importantly an approval that should require an on-site safety officer can be satisfied
by a remote system admin. **This is convenient for bootstrapping but is an authority-model smell**: an
audit ("who was authorised to sign this 動火證?") will list system admins who have no site competence.
**Recommendation:** keep admin as a *break-glass* signer but (a) record `admin_override=true` on
approvals signed by an admin who is not the project's role-holder (the `approvals` log already
distinguishes overrides — extend it), and (b) consider a project-scoped holder check for the v37 guard
so it fires when no *project-level* signer exists. Do not silently rely on admins as routine signers.

### P1-C — Audit coverage has holes the product's promise implies are filled
`progress_history` records only progress ticks; **metadata edits (rename, date change via
`updateItemMeta`) write no history row** — yet "判頭 says the item used to be called X / due Y" is
exactly the contested fact. Similarly, assignment changes (`setAssignment`) and item deletion are not
journaled. **Fix:** extend `progress_history` with `change_type` + `meta jsonb` and log meta/assignment
changes (rename v38, Task A). Longer term, a generic `audit_events` table would close the
"every mutation is journaled" gap the dispute narrative promises.

### P1-D — Migration application discipline (the v33 lesson)
v33's correct body sat in the repo for weeks but never reached prod — a hand-applied edit dropped a
qualifier and the "verify" only read source text, so a runtime `42702` shipped. Root cause is process,
not schema. **Recommendation (now partially in place):** (1) every migration applied via a method that
preserves bytes (clipboard→monaco, not retyping); (2) **verify by EXECUTION** — call the RPC / hit the
policy as the affected persona, never trust source; (3) a `schema_migrations` ledger table the app can
read to assert prod == repo (today there is no record of which vNN actually ran on prod). The v37
incident (an over-narrow CHECK re-statement that dropped `general_foreman`, caught by 23514) shows the
discipline working — keep it.

## 2. P2 findings

### P2-A — `global_role` vs `project_members.role` duality is a recurring foot-gun
The v27 correction ("per-project membership role governs rights, NOT global_role") fixed real bugs, but
the two role axes still coexist and several helpers mix them (`active_role_holders` keys on
`project_members.role` for signers but `global_role` for admins; `can_upload_drawing` mixes both). This
is the single most error-prone area (multiple sim bugs traced here). **Recommendation:** a one-page
canonical "rights resolution" doc + a single set of `can_*` helpers that every policy calls, so the
rule lives in one place. The coming file-system helpers (`can_upload_document`/`can_review_document`)
must follow v27 exactly — flagged in `FILE-SYSTEM-DESIGN.md §1.5`.

### P2-B — Storage growth on Free tier (1GB) is the real scaling cliff, not rows
Realtime debounce + indexes were addressed (`SCALING-REVIEW.md`). The binding constraint is **Storage**:
drawings + permit photos today, and the coming file system multiplies it (`FILE-SYSTEM-DESIGN.md §2.2`
estimates 400-600 files/project bursting 1GB on one project). **Recommendation:** the file-system build
MUST ship the compress-images-always + 5MB-warn/25MB-cap + a visible project storage meter, and there
should be an account-wide ≥700MB amber alert before a paid-tier decision is forced. Treat the 1GB as a
near-term product event, not a someday.

### P2-C — `tracking_mode` / template widening touches a live hot table
Problem 4 widens the `progress_items.tracking_mode` CHECK and adds columns. Additive and safe, but
`get_visible_progress_items` is a `select`-shaped RPC whose column list must be re-created in lockstep
or new columns won't reach the client (`PROGRESS-TABLE-PROJECT-TYPES.md §3.4` calls this out). This is
the exact class of "RPC column list drifts from table" bug — verify by EXECUTION after applying.

### P2-D — Equal-weight rollup misreports mixed-size work
`computeRollup` averages leaves equally (`src/types.ts:204-217`); a 250m sewer run and a 12m connection
count the same. Not wrong for the original tower use-case, but it lies for drainage/linear work.
Addressed by the weighted-rollup change in problem 4 (ship weight=1 default so existing projects are
byte-identical).

## 3. What's genuinely strong (keep / don't regress)

- **Immutable evidence everywhere:** append-only `progress_history`/`*_events`, no UPDATE/DELETE storage
  policies, `si_versions`/`vo_versions` lock guards, frozen `chain_snapshot`. This is the spine of the
  ISO 9001 story (`ISO9001-RESEARCH.md`) — every new feature must preserve it.
- **Server-computed money** (VO `total_amount_cents`, client cannot supply a total) — exemplary.
- **on-delete `restrict` for authors** + the v20 account-deletion FK strategy that preserves records
  while satisfying Apple 5.1.1(v) — do not weaken when adding new FKs (file-system actor columns must
  use `on delete set null`, already specified).
- **Approval chains as data** (`approval_chain_steps` + snapshot) — reuse this primitive for the ISO
  NCR/ITP gaps (G1/G2) rather than inventing new workflow engines.

## 4. Recommendations summary (ranked)

| # | Action | Effort | Where |
|---|---|---|---|
| 1 | Column-level write guard on `progress_items` (P1-A) | Low | rename v38, Task B |
| 2 | Journal metadata/assignment changes (P1-C) | Low | rename v38, Task A |
| 3 | `schema_migrations` ledger + execute-verify discipline (P1-D) | Low | one migration + skill note (done in [[supabase-migration-apply]]) |
| 4 | Project-scoped holder check / admin-override flag for signers (P1-B) | Medium | follow-up migration |
| 5 | Single canonical `can_*` rights layer + rights doc (P2-A) | Medium | refactor, do alongside file-system |
| 6 | Storage meter + always-compress before file-system ships (P2-B) | Low | inside file-system build |
| 7 | Re-create `get_visible_progress_items` in lockstep with column adds (P2-C) | Low | inside problem-4 migration |

None of these block the planned feature work; items 1, 2, 6, 7 ride along inside the migrations the
feature work already needs. Items 4 and 5 are the deeper authority-model cleanups worth a dedicated
pass after the file system lands.
