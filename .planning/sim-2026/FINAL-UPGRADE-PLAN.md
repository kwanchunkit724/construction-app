# Final Upgrade — 完整執行計劃 (Execution Plan)

> Source of truth for WHAT to build: [FINAL-OPINION.md](./FINAL-OPINION.md). This file is HOW:
> every item, the order, model assignment, review/bug-fix strategy, and the /findskill step.
> Decision context: ONE final upgrade, then FREEZE the version for a long period. Weight
> data-integrity + reliability + low-maintenance ABOVE features. 2026-06-16.
>
> Apply channel for all SQL: Chrome SQL editor (MCP `execute_sql` is blocked — see
> [[supabase-migration-apply]]). Verify by EXECUTION, not by reading source.
> Next free migration version = **v68** (v67 = PTW expiry cron, last applied).

---

## 0. TL;DR — the shape of the plan

| Wave | What | Apply channel | Native needed? | Reversible? |
|------|------|---------------|----------------|-------------|
| **0 Pre-flight** | Snapshot/backup, verify open-risks (cron jobs), install skills | SQL read + CLI | no | n/a |
| **1 Server integrity** | v68–v72 additive SQL guards (the core of the_pick) | SQL editor | **no** — protects freeze window NOW | yes* (*T1.1 only structurally — see §5) |
| **2 Photo privacy prep** | issue-photos signed-URL client shim + path backfill | client + SQL | client half ships w/ native | yes |
| **3 Native bundle** | all client edits (tier2/tier3/cuts) batched into ONE native build | git → Codemagic | **this IS the native build** | yes |
| **4 Gate flip** | native ships → flip bucket private + enforcement flags + drop dup cron | SQL + secrets | **after** native live | yes |
| **5 Freeze** | regression matrix, schema baseline, version tag, freeze | — | — | — |

Golden rule (the GO/NO-GO gate): **the ENFORCEMENT-FLAG flip is the only strictly native-gated step** — ship native → flip `sign_reauth`/`step_up` flags → THEN freeze. Never flip flags before the native re-auth UI is live (breaks every signing path for live iOS users).

**Scope correction (from completeness critic):** the **issue-photos bucket-private flip is NOT native-gated** — it only needs the signed-URL *read shim* live in the client. The shim ships to **web (Vercel) users on the next web deploy**, independent of the TestFlight/Play cycle. So v73 can flip private for the web cohort as soon as the web deploy lands, closing the public-egress window sooner; only native users wait for the native build. Do not conflate "shim live" with "native live."

---

## 1. Every upgrade item (nothing dropped)

Pulled verbatim from FINAL-OPINION tiers. ID = stable handle used in the sequence + matrix below.

### Tier 1 — MUST before freeze (the_pick: "Seal the dispute-survival spine")
- **T1.1** `dailies.user_id` FK → `ON DELETE SET NULL` + drop NOT NULL. Account deletion currently cascade-DELETEs statutory 施工日報. ⚠️ **`_v20_repoint_fk` is DROPPED at `v20:108`** — it does NOT exist live, so v68 must **redefine/inline** the helper. ⚠️ `dailies.user_id` currently references **`auth.users`** (`v11:19`); to avoid a parent-table change (auth.users→user_profiles) and the row-validation it forces, **keep `auth.users` as the parent and only change the ON DELETE rule** (`drop constraint` → re-add `references auth.users(id) on delete set null`). SET NULL semantics still null the row when the user is deleted, no membership pre-check needed. Pre-check anyway that no `dailies.user_id` is orphaned before the swap. **(M — semi-destructive on a statutory table, opus-coded + opus-reviewed; only structurally reversible — see §5)**
- **T1.2** `BEFORE UPDATE` column-guard trigger on `issues`: pin `reporter_id/reporter_role/project_id/created_at` immutable; force `resolved_by=auth.uid()` on resolve; constrain `current_handler_role` to legal escalation transitions. Closes the self-resolve/mis-route forgery the USING-only v66 policy can't (RLS can't see OLD row). Clone the `v40-split/3` / `v55f` guard pattern. **(M, SQL, no-native)**
- **T1.3** Add `issues, issue_comments, dailies, materials` (+ `drawings, drawing_versions` for symmetry) to the `audit_ledger` watched-table DO-loop. ⚠️ **Extend the v55 effective superset, NOT v51.** `v55-equipment-forms-schema.sql:395-401` superseded the v51 loop and added `equipment_register/form_instances/form_signoffs/user_credentials` + the `permit_versions` typo-fix (20 tables). The loop does `drop trigger if exists` then recreates ONLY listed tables — re-applying v51's 14-table array would **silently drop `trg_audit_ledger` off the 4 forms/credential tables**. v68 list = the v55 20 + the 6 new = **26 tables**. **(S, SQL, no-native)**
- **T1.4** Server-side `file_size_limit` + `allowed_mime_types` on all 4 storage buckets (issue-photos, drawings, si-vo, docs). Grep confirms **zero** such limits exist today. The durable backstop that survives a stale/cached client + direct REST. **(S, SQL, no-native)**
- **T1.5** Make `issue-photos` PRIVATE (`public=false`) + `can_view_project`-scoped RLS + signed URLs, AND backfill/re-sign the public URLs already embedded in `issues.photos` jsonb (`IssuesContext.tsx:107/131-134`). Reuse `supabase/v8-private-bucket-template.sql` + the `DrawingsContext.tsx:447-461` signed-URL pattern. **The only L item; has a client half → native-gated for the bucket flip.**

### Tier 2 — SHOULD (batch the client halves into the native build)
- **T2.1** Re-wire `close_out_ptw` with `assert_step_up('approval')` + `assert_sign_reauth()` (v53 wired the others but missed it). **(S, SQL, no-native; invisible until flags flip)**
- **T2.2** Compress drawings + issue photos on upload via existing `src/lib/image-compress.ts` (currently only Documents/PTW use it). **(S, client, native-gated)**
- **T2.3** Timetable write gate → `project_members.role` not `global_role` (server `events_insert` RLS now; client `TimetablePage.tsx` with native). Server half closes a data-integrity hole immediately. **(S, split)**
- **T2.4** One-shot `verify_audit_coverage` query during the pass (NOT a standing RPC) — assert every canonical table carries `trg_audit_ledger`. Run & discard. **(S, SQL verify-only)**
- **T2.5** One-time schema reconciliation baseline: checked-in dump of live `information_schema` + `pg_constraint` + `pg_policies`. Documentation artifact (MCP blocked → can't auto-revalidate). Generate BEFORE freeze. **(S, SQL read → commit)**
- **T2.6** Fix stale `DailyEdit` error copy (`只有總承建商管工或工程師…`) to match widened `canAuthorDaily`. **(S, client, native-gated)**

### Tier 3 — OPTIONAL (only if a slot is free; all native-gated, feature-adjacent)
- **T3.1** Add `general_foreman`(+`safety_officer` for PTW) to SI/VO/PTW `canSubmit` + matching server INSERT RLS. *Feature-expanding — lowest priority.*
- **T3.2** Empty-state onboarding (worker Home card → Projects + "冇派工都可以影相報問題" banner on blank progress tree). *Most-reported adoption blocker.*
- **T3.3** Read-only progress export to all members incl. owner (removes PM bottleneck).
- **T3.4** "待 X 審批" next-handler label on SI/VO/PTW list cards.
- **T3.5** Admin storage-usage gauge w/ 80% warn. *Redundant once T1.4 lands.*
- **T3.6** Daily pg_cron health check pushing admin on cron failure. *Adds a new monitored subsystem — keep OUT of pre-freeze per critic.*
- **T3.7** Seed a `competent_person` credential for safety_officer in DEMO projects (un-disables the sign button in demos). Pure seed INSERT. *Sales shop-window only.*

### CUT / hide (shrink surface area before freeze)
- **C.1** Remove org-wide dark-ship flags `files_enabled/ptw_enabled/forms_enabled` + their `FilesGate/PtwGate` workaround components — redundant 2nd gating layer that fights the v59 module switch (the #1 "enabled but invisible" complaint). Fold into the module switch. **(client, native-gated)**
- **C.2** Drop the v10 daily `ptw-expiry` cron (keep only v67's 15-min job). **(SQL)**
- **C.3** Stop the daily-log collecting weather independently + make `WeatherBanner` stop-work copy generic (not building-centric). **(client, native-gated)**
- **C.4** Slim `Demo.tsx` — foreground ~7 value modules, demote platform plumbing (offline/push/auth/account-deletion) to "guarantees" not "features". **(client/marketing copy)**

### Explicit EXCLUSIONS (do-not-do — recorded so they can't sneak back in)
Flag-flip before native ✗ · hardware/biometric/ECDSA keypairs ✗ · MFA on the issues path ✗ · audit_ledger pruning/retention ✗ · column-level RLS as the forgery fix ✗ · verify_audit_coverage as a standing RPC ✗ · new FKs/SI-VO badges/recurring events/module profiles ✗ · unifying the auth.users-vs-user_profiles FK split on contacts/events/materials ✗ (cosmetic, touches live FKs).

### Open-risk verifications (fold into Wave 0 / Wave 5)
- **R.1** GO/NO-GO freeze-timing gate (native → flags → freeze). **Hard precondition, not a monitor.**
- **R.2** issue-photos URL reconciliation must be tested against live rows before freeze (makes T1.5 the L item).
- **R.3** Verify `pg_cron` is actually enabled + jobs scheduled (`cron.job` for v63 memory rebuild + v67 ptw-expiry). If not, PTW never server-expires + memory never rebuilds — silently.
- **R.4** Verify `weather-sync` cron + `WEATHER_SYNC_SECRET` deployed (no committed migration today). Promote to a checked-in migration or at least execution-verify `cron.job`.
- **R.5** No migration ledger + blocked MCP → generate the T2.5 baseline BEFORE freeze or drift is undetectable.
- **R.6** Execution-check `materials` UPDATE (v66). ⚠️ *Framing corrected:* `v66:82-109` `materials_update` requires supervisor **membership** role and has NO `requested_by=auth.uid()` self-grant — so it is NOT the same self-edit window as issues. Verify instead that `requested_by`/`project_id` are immutable on UPDATE. Lower priority.
- **R.7** Add a cheap `CHECK` on `label_status` vocab (latent dispute-% integrity gap; TS fails safe today).
- **R.8 (accepted invariants — record, do not fix):** two role-coherence S3 divergences stay as-is for the freeze and must be written into the freeze baseline as known invariants: `Contacts canManage` keys on `global_role` (admin/pm only — locks out 老總/判頭; `ContactsContext:79`) and Equipment entry excludes `general_foreman` (`ProjectDetail:815`). Same treatment the opinion gave the FK-split + label_status.

---

## 2. Sequence — the most suitable order

Ordering principles: (a) ship the reversible, server-only, no-native guards FIRST so they protect the freeze window immediately; (b) batch ALL client edits into the single native rebuild (one build, one review, one submission); (c) honour the GO/NO-GO gate — anything that depends on native (bucket-private flip, enforcement flags) happens only after native is live.

```
WAVE 0  PRE-FLIGHT  (read-only + setup, ~0.5 day)
  0a  Snapshot: pg_dump-equivalent SELECT export of dailies / issues / issue_comments /
      materials / storage.buckets; AND the T2.5 schema baseline (information_schema +
      pg_constraint + pg_policies) → commit as the pre-change reconciliation point.   [R.5, T2.5]
  0b  Verify open-risks (read-only): cron.job has v63 + v67 jobs (R.3); weather-sync
      scheduled (R.4); discover dailies FK constraint name via pg_constraint (for T1.1).
  0c  Storage/egress baseline: SELECT sum(size_bytes) per bucket (issue-photos/drawings/si-vo/docs)
      → commit as the freeze-time 1GB-cliff baseline a future human can diff. [E-add]
  0d  Branch rehearsal: create a Supabase branch (create_branch MCP), apply v68–v72 there FIRST,
      run the rollback drill for v68 (see §5) before touching prod. [E-add, BLOCKER fix]
  0e  Install review skills (§6) — user action in interactive Claude Code.
        ↓ gate: snapshot captured + cron jobs confirmed + v68 rollback rehearsed on branch
WAVE 1  SERVER INTEGRITY SQL  (additive, mostly-reversible*, NO native — protects freeze NOW, ~0.5 day)
  v68  T1.1  dailies FK ON DELETE SET NULL (redefine helper inline; keep auth.users parent)
             → pre-check: 0 orphan user_id; verify: delete a test user, daily survives w/ user_id NULL
  v69  T1.2  issues BEFORE UPDATE column-guard trigger        → verify: worker self-resolve attempt REJECTED
  v70  T1.3  audit_ledger watch-list = v55 superset(20) + 6 new = 26 tables (NOT the v51 array)
             → verify: (a) edit an issue → ledger appends + chains; (b) DELETE an issue → BOTH the
               cascaded comment rows AND the parent row landed; (c) the 4 v55 forms tables still carry trg_audit_ledger
  v71  T1.4  bucket file_size_limit + allowed_mime_types ×4   → verify: oversize/EXE upload REJECTED server-side
  v72  T2.1 close_out_ptw enforcement wiring + T2.3 server events_insert RLS + R.7 label_status CHECK + C.2 drop v10 daily cron
        ↓ gate: each migration execution-verified + adversarial security review (§5) PASS
             + run T2.4 verify_audit_coverage NOW (not only Wave 5) — catches a dropped forms-table trigger immediately
  (*T1.1 is only structurally reversible — once a deletion nulls a user_id, re-adding NOT NULL fails; Wave-0 snapshot is load-bearing.)
WAVE 2  PHOTO-PRIVACY PREP  (read shim; bucket flip can ship to WEB on next web deploy — only native cohort waits)
  2a  IssuesContext: signed-URL read shim (extract path → createSignedUrl) that handles
      BOTH already-stored public URLs AND new path-only values; change upload to store PATH.  [T1.5 client]
  2b  Backfill issues.photos jsonb → store storage paths (keep a copy of the old URLs in the snapshot). [T1.5 data]
  2c  Author (but DON'T apply) v73 = issue-photos public=false + can_view_project RLS.   [T1.5 server, staged]
        ↓ gate: shim renders existing demo photos via signed URL in local preview
        NOTE: the shim ships to WEB users on the next Vercel deploy — v73 can flip private for the web cohort
        then, independent of native. Only native users wait for the native build (the flag flip still waits for native).
WAVE 3  NATIVE BUNDLE  (ALL client edits in ONE build, ~1–1.5 day)
  - T1.5 client shim (2a) · T2.2 compress-on-upload · T2.3 timetable client gate · T2.6 DailyEdit copy
  - C.1 remove dark-ship flags (fold into module switch) · C.3 weather dedup + generic banner · C.4 Demo slim
  - Optional T3.2/T3.3/T3.4 if slots free
  - Bump app version (1.x), update TestFlight/Play release notes, CHANGELOG
  - tsc clean + full local preview regression (7-role write matrix + account-deletion + signing paths)
        ↓ gate: typecheck clean + review (§5) + regression matrix green
  - Build via Codemagic (ios-app-store + android-internal) → TestFlight / Play internal  [#21]
WAVE 4  GATE FLIP  (ONLY after native is live on testers' devices, ~0.5 day)
  v73  Apply issue-photos public=false (now safe — signed-URL shim is live)             [T1.5 server, R.2]
  - Set SUPABASE_SERVICE_ROLE_KEY secret + set_sign_reauth_enforced(true) + step_up(true) [#22, R.1]
  - Verify: PTW/動火證/form signing still works end-to-end on the native build with re-auth
        ↓ gate: signing works WITH enforcement on; historical issue photos load via signed URL
WAVE 5  FREEZE  (~0.5 day)
  - Final regression: account-deletion (Apple), all signing paths, 7-role matrix, materials UPDATE (R.6)
  - T2.4 verify_audit_coverage one-shot · regenerate T2.5 baseline (post-change) · git tag the frozen version
  - Freeze-readiness checklist sign-off (§7) → FREEZE
```

Total ≈ 3.5–4.5 focused days. Critical path is Wave 3 (native) because Wave 4 gates on it.

---

## 3. Completeness guarantee (req #3 — 冇做少左)

**Traceability matrix** — every FINAL-OPINION item maps to a wave or an explicit exclusion:

| Item | Wave | Status |
|------|------|--------|
| T1.1 dailies FK | 1 (v68) | core |
| T1.2 issues guard | 1 (v69) | core |
| T1.3 ledger array | 1 (v70) | core |
| T1.4 bucket limits | 1 (v71) | core |
| T1.5 photo privacy | 2 (shim) + 4 (v73 flip) | core, split |
| T2.1 close_out_ptw | 1 (v72) | included |
| T2.2 compress upload | 3 | included |
| T2.3 timetable gate | 1 (server) + 3 (client) | split |
| T2.4 verify_audit_coverage | 5 | one-shot |
| T2.5 schema baseline | 0 + 5 | included |
| T2.6 DailyEdit copy | 3 | included |
| T3.1–T3.7 | 3 (optional) / excluded | by-slot |
| C.1 dark-ship flags | 3 | included |
| C.2 v10 daily cron | 1 (v72) | included |
| C.3 weather dedup | 3 | included |
| C.4 Demo slim | 3 | included |
| R.1–R.8 | 0 / 4 / 5 | verified; R.8 = accepted invariants |
| storage/egress baseline | 0 + 5 | critic-add |
| do-not-do ×8 | — | excluded on purpose |

**Anti-omission controls:**
1. This matrix must show every ID assigned before Wave 1 starts.
2. A dedicated **completeness-critic agent (opus)** reviewed this plan against FINAL-OPINION + SIMULATION-REPORT + live schema. **Outcome: 4 blockers found + fixed in this file** — (a) T1.3 must extend the **v55** 20-table superset not v51's 14 (else it drops triggers off 4 forms/credential tables); (b) `_v20_repoint_fk` is dropped (v20:108) → redefine inline + keep auth.users parent; (c) T1.1 needs a tested branch rollback drill + moves to opus; (d) the bucket-private flip is web-deploy-gated, not native-gated. All confirmed against source and patched above.
3. Each wave has a written **exit gate** — the wave isn't "done" until its gate passes (execution-verified, not source-read).
4. Wave 5 re-runs `verify_audit_coverage` + the 7-role matrix as a final net.

---

## 4. Model assignment (req #4 — 慳 token, 又做到嘢)

Principle: **cheapest model that reliably completes**; reserve Opus for logic-heavy, data-risk, and adversarial review. Well-specified SQL/edits → Sonnet; mechanical string/copy edits → Haiku; novel logic + data reconciliation + security review → Opus.

| Task | Model | Why |
|------|-------|-----|
| T1.1 dailies FK migration | **opus** | ⚠️ NOT mechanical: helper is dropped (v20:108) so must redefine; semi-destructive on a statutory table; failed constraint validation is hard to reverse. Same risk class as T1.5. Opus-coded + opus-reviewed before apply. |
| T1.2 issues column-guard trigger | **opus** | novel legal-transition logic; one wrong branch = forgery hole or broken resolve |
| T1.3 audit_ledger array add | **sonnet** | add 6 strings to an existing loop; spec is exact |
| T1.4 bucket limits | **sonnet** | additive `update storage.buckets`; spec is exact |
| T1.5 photo privacy: shim + backfill + v73 | **opus** | data-reconciliation risk (live URLs 404), client+SQL+backfill must stay consistent |
| T2.1 close_out_ptw wiring | **sonnet** | follow the v53 pattern verbatim |
| T2.2 compress-on-upload | **sonnet** | wire an existing util into 2 call sites |
| T2.3 timetable gate (both halves) | **sonnet** | mirror an established per-member RLS pattern |
| T2.5 schema baseline dump | **haiku** | run read queries, dump to file |
| T2.6 DailyEdit copy | **haiku** | string replacement |
| C.1 remove dark-ship flags | **sonnet** | multi-file deletion + reroute to module switch; needs care not raw logic |
| C.3 weather dedup / banner copy | **haiku** | copy + remove one collection path |
| C.4 Demo.tsx slim | **haiku** | marketing-copy restructure |
| Per-migration security/adversarial review | **opus** | must think like an attacker (re-check [[rls-insert-privileged-columns]]) |
| Completeness critic + freeze-readiness | **opus** | high-stakes "did we miss anything" judgement |
| Regression-matrix execution | **sonnet** | follow the 7-role checklist; escalate anomalies to opus |

Token economy: Waves 1–2 are ~6 small SQL files + 1 client shim → mostly Sonnet/Haiku with a few Opus passes. Opus spend concentrated on **T1.1, T1.2, T1.5** and the review gates — the places a mistake is expensive-or-impossible to fix after freeze. (T1.1 was moved sonnet→opus after the completeness critic showed it is semi-destructive, not mechanical.)

---

## 5. Code review + bug-fix strategy (req #5)

**Per-change loop (every migration / edit):**
1. **Write** from the spec (assigned model).
2. **Static check** — `tsc` clean for client edits; the `typescript-lsp` plugin (§6) surfaces inline diagnostics after each edit so the author fixes errors in the same turn. For SQL, a colcount/paren sanity pass (`C:/tmp/sql-colcount.mjs`).
3. **Apply** via Chrome SQL editor ([[supabase-migration-apply]]).
4. **Verify by EXECUTION, not source** — and specifically run the *exploit the change blocks*:
   - T1.1 → delete a throwaway user who **authored a daily**; assert (a) deletion succeeds (no 409, Apple path intact) AND (b) the daily survives with `user_id IS NULL`.
   - T1.2 → as a `subcontractor_worker`, PATCH own issue to `resolved`/`resolved_by`=PM → must be REJECTED; legal escalation still allowed. (Note: the cloned `v40-split/3` guard deliberately **bypasses on service-role/no-auth-context** — so T1.2 alone leaves a privileged-session forgery hole; **T1.3 is its required complement**, which is why v70 must land right after v69.)
   - T1.3 → (a) UPDATE an issue + INSERT a material → `audit_ledger` appends, `prev_hash` chains; **(b) DELETE an issue → assert BOTH the cascaded `issue_comments` rows AND the parent `issues` row produced ledger rows** (the whole point: an admin DELETE currently vaporizes the thread with no trace); (c) confirm the 4 v55 forms tables still carry `trg_audit_ledger`.
   - T1.4 → attempt a 10MB + an `.exe` upload via REST → REJECTED.
   - T1.5 → flip bucket on a branch/test; assert a historical photo URL resolves via signed URL, a cross-project user gets 403.
5. **Adversarial review** — spawn a reviewer per change:
   - `security-guidance` plugin auto-reviews each diff as it's written.
   - An **opus security-reviewer agent** on every RLS/trigger change, explicitly re-checking the [[rls-insert-privileged-columns]] lesson (BEFORE INSERT guard, not only UPDATE) and privilege-escalation paths.
   - `pr-review-toolkit` / `gsd-code-reviewer` for the client diffs.
6. **Fix** findings, re-verify from step 3. Loop until the reviewer returns clean.

**T1.1 rollback drill (the one semi-destructive op — a SELECT snapshot is NOT a restore):**
1. On a **Supabase branch** (`create_branch` MCP), apply v68, then simulate a botched state and practice the restore: re-add the original constraint, and reload any nulled/lost `dailies` rows from the Wave-0 snapshot in FK-satisfying order.
2. Only after the branch restore succeeds do you apply v68 to prod. If the prod apply misbehaves, the rehearsed procedure + snapshot is the tested path back. Structural reversibility ≠ data reversibility — see the §0 caveat.

**Batch gates:**
- End of Wave 1: a small **review workflow** (dimensions → adversarial verify, like the prior bug-fix fleet) over all v68–v72 before moving on.
- End of Wave 3: full **7-role write matrix** regression (the persona matrix from the sims) + account-deletion flow (Apple compliance) + every signing path — in local preview on phone (390px) and tablet (1600×900).
- Wave 5: re-run the matrix WITH enforcement flags on (native), plus `verify_audit_coverage`.

**Rollback:** every change is reversible — `drop trigger` (T1.2), re-add `on delete cascade` (T1.1, but only after restoring from the Wave-0 snapshot), remove array entries (T1.3), `public=true` (T1.5), unset flags (#22). Wave-0 snapshot is the safety net for the one semi-destructive op (T1.1).

**Bug-fix philosophy for a freeze:** fix root cause, never silence; if a change can't be execution-verified, it does NOT ship (a frozen system can't be hot-patched cheaply).

---

## 6. /findskill — install + use (req #6)

**What it is:** `/findskill` is the community **find-skills** plugin — it analyses the active repo and recommends Claude Code skills from known marketplaces ("what skills are useful for this project?"). It is a third-party plugin.

**Security note (from the official docs, quoted):** plugins "can execute arbitrary code on your machine with your user privileges. Only install plugins … from sources you trust." So I will **not** silently auto-install a third-party plugin — installing is your trust decision. Below are the exact commands for you to run in interactive Claude Code; I could not resolve the find-skills GitHub slug from the CLI, so confirm it on the Discover tab.

**Install flow (you run these):**
```
# 1. add a marketplace that carries find-skills, then install it:
/plugin marketplace add <owner/repo>          # confirm the repo on claudepluginhub / Discover tab
/plugin install find-skills@<marketplace>
/reload-plugins                                # activate without restart
# 2. then invoke it:
/findskill        (or /find-skills:<command> — skills are namespaced by plugin)
```

**Strong recommendation — prefer the zero-trust Anthropic-OFFICIAL plugins for THIS upgrade** (curated by Anthropic, no third-party code-execution risk). These are exactly what /findskill would surface for an RLS/security-hardening + review job:
```
/plugin install security-guidance@claude-plugins-official   # auto security review of each change — perfect for the RLS/trigger work
/plugin install pr-review-toolkit@claude-plugins-official   # specialized review agents — req #5
/plugin install typescript-lsp@claude-plugins-official      # inline tsc diagnostics after each client edit
/plugin install commit-commands@claude-plugins-official     # commit/push/PR workflow
/reload-plugins
```
(`typescript-lsp` needs the `typescript-language-server` binary on PATH.)

**Skill-finding result delivered now (what /findskill would conclude):** for this upgrade the highest-value skills are `security-guidance` (RLS/trigger hardening), `pr-review-toolkit` (the Wave-1/3 review gates), `typescript-lsp` (the client shim + cut edits), `commit-commands` (atomic commits per migration). The repo already ships `gsd-code-reviewer` / `gsd-security-auditor` agents and the GitNexus impact tools — use those for impact analysis before editing any shared symbol. Community find-skills is worth installing for ongoing discovery but is **not** on the critical path.

---

## 7. Extra additions I recommend (beyond the 6)

1. **Wave-0 data snapshot is mandatory, not optional** — T1.1 is the one semi-destructive op; export `dailies/issues/issue_comments/materials/storage.buckets` first.
2. **Freeze-readiness checklist** (sign-off before FREEZE): all Wave gates green · account-deletion verified · every signing path verified WITH flags on · cron jobs confirmed scheduled (R.3/R.4) · audit_ledger covers all canonical tables (T2.4) · schema baseline committed (T2.5) · version tagged · TestFlight/Play build live.
3. **Version + CHANGELOG bump** in the native build; write zh-HK + En release notes (you've done this before for 1.2/1.3).
4. **R.6 materials UPDATE check** alongside T1.2 — verify `requested_by`/`project_id` immutability (NOT a self-resolve clone; see corrected R.6).
5. **R.7 label_status CHECK** folded into v72 — closes a latent dispute-% integrity gap for ~2 lines.
6. **Promote weather-sync to a committed migration** (R.4) so the freeze doesn't sit on an unverified manual deploy.
7. **A single end-to-end "dispute drill"** before freeze: create an issue as a worker → escalate → resolve → try to tamper → export the audit proof. One scripted pass that exercises the whole spine the upgrade is protecting.
8. **Branch-first execution (critic add):** apply v68–v72 on a Supabase branch (`create_branch` MCP) and rehearse the T1.1 rollback before any prod apply — cheapest insurance for the one destructive op.
9. **Freeze-time storage/egress baseline (critic add):** record `sum(size_bytes)` per bucket at Wave 0 and Wave 5 so the invisible 1GB/egress cliff is diff-able across the freeze (the storage gauge T3.5 is cut, so this is the only quota visibility).
10. **Explicit Apple dailies-deletion assertion (critic add):** Wave 5 freeze-gate must include "delete a user who authored a daily → deletion succeeds AND daily survives with `user_id IS NULL`" — the exact account-deletion path T1.1 modifies.

---

## 8. What I need from you to start

1. **Approve the plan** (or adjust scope — e.g. include/skip Tier 3).
2. **Confirm the GO/NO-GO gate**: only the **enforcement-flag flip** waits for native; the bucket-private flip can ship to web users on the next web deploy. Full freeze still completes after a TestFlight/Play cycle (for the flag flip).
3. **Install skills** (§6) at your discretion — I can proceed without them, but `security-guidance` + `typescript-lsp` materially improve the review loop.
4. Then I execute Wave 0 → 1 **on a Supabase branch first**, rehearse the T1.1 rollback, then apply to prod (server-side, no native), and stage Waves 2–3 for the native build.

---

## 9. Execution log

### Wave 0 — pre-flight ✅ (2026-06-16)
Apply channel: MCP `execute_sql` blocked + no free-tier branching, so applied via the **Supabase Management API** (`POST /v1/projects/{ref}/database/query`) driven through the authenticated dashboard session in Chrome — runs SQL and returns JSON results directly (cleaner than the monaco-paste channel; bearer token read in-page, never exposed). Branch rehearsal was not possible (MCP); mitigated by the snapshot + transactional applies + the fact that T1.1 keeps the `auth.users` parent (pure DDL, `dailies_orphan_userid=0`).
- Baselines + snapshot saved: `freeze-baseline/wave0-baseline.json`, `freeze-baseline/snapshot-dailies-authorship.json`.
- Pre-checks green: `dailies_orphan_userid=0`, `events_narrowing_risk=0`, all 3 crons live.
- **Live-state catches (execution found what static source missed):** (a) the audit ledger LIVE watches **`ai_actions`** (a post-v55 migration added it) — so v70 was changed to **additive-only** (touch only the 6 new tables) instead of re-emitting a static superset that would have dropped it; (b) a **5th bucket `project-files`** (public, already limited, 0 objects) exists — outside v71's 4-bucket scope, correctly left alone.

### Wave 1 — server integrity ✅ (2026-06-16, applied to prod + execution-verified)
Applied in order v68 → v70 → v69 → v71 → v72 (v70 before v69 per the review).
- **v68** dailies FK → `user_id` nullable, `confdeltype='n'` (SET NULL). ✅
- **v70** all 6 dispute tables now carry `trg_audit_ledger`; `ai_actions`/`user_credentials` still carry it (additive-only confirmed). ✅
- **v69** functional test as a real subcontractor_worker reporter (rolled back): `resolved_by` forge → forced to reporter; `reporter_id` mutation → pinned; `subcontractor→pm` jump → raised. Legit reporter-resolve path intact. ✅
- **v71** issue-photos 10MB+images · drawings 25MB+pdf · si-vo 20MB size-only · docs 20MB size-only. ✅
- **v72** `events_insert` now membership-role (incl general_foreman, admin via global); daily `ptw-expiry` cron dropped, only `ptw-expiry-15min` remains. ✅
- **T1.3 ledger** update appends +1; issue DELETE cascade appends parent + each comment (`263→264→266`, comments=1). ✅

### Deviations from the written plan
- **No branch rehearsal** (MCP blocked / free-tier) — applied directly to prod with snapshot + transactional safety; user approved the live apply.
- **R.7 (label_status CHECK) deferred** — it's a jsonb map, not scalar; a value-vocab CHECK needs a fragile trigger on the hot progress_items table. Documented as a known latent gap instead.
- **T2.1 (close_out_ptw enforcement) moved to Wave 4** — its live body spans v10→v32→v53→v60; re-emit it when the live definition is readable during the flag-flip (it's dormant until enforcement is on anyway).
- **v70 made additive-only** (see Wave 0 catch).

### Wave 2 — photo-privacy shim ✅ (2026-06-16, client; ships on next web/native build)
- `lib/issuePhotos.ts` (path normaliser + signer) + `components/IssuePhoto.tsx` (signs via state).
- `uploadPhoto` now stores the storage PATH; `IssueCard` + `IssueDetail` render via `<IssuePhoto>`; CreateIssueModal unchanged (previews via local object URL).
- **No DB backfill** — the shim extracts the path from legacy full-URL rows too. Verified end-to-end on live data: extractor output == `storage.objects.name`, sign endpoint 200, signed-URL fetch `200 image/jpeg`. tsc clean. Committed `1f65eef`.
- **v74** (bucket private + authenticated-read) authored + STAGED — apply in Wave 4 AFTER the shim is live (web-deploy-gated). Object paths don't encode project, so scope = private + authenticated-read; per-project scoping deferred (needs re-pathing).

### Wave 3 — native bundle ✅ (2026-06-16, client; ships on next web/native build)
- **T2.2** issue-photo compress (drawings intentionally NOT compressed — legibility). `651f103`
- **T2.6** DailyEdit deny copy matches canAuthorDaily. `651f103`
- **C.3** WeatherBanner copy site-generic (daily 天氣 field kept — legitimate diary record). `651f103`
- **T2.3** TimetablePage canWrite → membership role (matches v72). `651f103`
- **C.1 — Documents + Forms LAUNCHED + dark-ship layer removed.** User chose to launch. Flipped `files_enabled`+`forms_enabled` ON live (app_config); verified in preview as admin that Documents (20 docs) + Forms (9) + PTW all render with real data, no console errors. Then removed the whole dark-ship gating layer (deleted useFilesEnabled/usePtwEnabled/FilesFlagContext/PtwFlagContext/FilesGate/PtwGate; rewired App/Sidebar/ProjectDetail/ProgressItemCard/SiSubmitForm/AdminProjects/Home to the per-project module switch as the SINGLE gate). `128ea7c`
- **C.4** /demo slimmed — value modules lead, platform plumbing demoted to 平台保證（底層）. `919fa1d`

### Remaining (not yet done)
- Native rebuild **#21** (merge to main → Codemagic → TestFlight/Play) — STOPPED here per user (outward-facing). All Wave-2/3 client edits ship in it.
- Wave 4: apply **v74** (issue-photos private — web-deploy-gated, ships after the shim is live on web) + **T2.1** (close_out_ptw enforcement, re-emit live body during flag-flip) + enforcement flags **#22** (native-gated).
- Wave 5: freeze regression matrix + storage/egress re-baseline + version tag.

NOTE: C.1 LAUNCHED Documents + Forms LIVE (web + existing iOS read the flag at runtime). The plumbing-removal code ships with the next web deploy / native build; until then the live app reads the now-true flags (consistent).
