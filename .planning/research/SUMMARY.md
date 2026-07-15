# Research Synthesis — 工地控制系統 Milestone

**Scope:** Drawings (P1) → SI/VO (P2) → PTW (P3), brownfield onto live CK工程 app.
**Synthesised:** 2026-05-11
**Confidence:** HIGH for stack + architecture; MEDIUM-HIGH for HK domain features; HIGH for pitfalls.

---

## Stack (Additive Libraries)

All additive, all lazy-loaded. **Net initial-bundle delta: 0 KB** (actually −400 KB once `xlsx`/`jspdf`/`recharts` get split out per CONCERNS.md ride-along).

| Library | Version | Bundle (gz) | Purpose | Phase |
|---|---|---|---|---|
| `react-zoom-pan-pinch` | ^4.0.3 | ~12 KB | Pinch/pan/zoom for drawings + PTW QR display | P1 (reused P3) |
| `react-pdf` (+ `pdfjs-dist` worker) | ^10.4.1 | ~15 KB JS + ~180 KB worker | PDF rendering for architect drawings | P1 |
| `react-hook-form` | ^7.54 | ~12 KB | VO line-item table (dynamic rows + cross-row totals) | P2 (likely needed) |
| `capacitor-voice-recorder` OR `@capgo/capacitor-audio-recorder` | ^7.0.6 / current | ~2 KB JS + native | Voice-memo SI capture | P2 (optional) |
| `qrcode.react` (SVG only) | ^4.2.0 | ~6 KB | QR on active PTW | P3 |
| `react-signature-canvas` (+ `signature_pad`) | ^1.1.0-alpha | ~14 KB | Signature pad for PTW + VO signoff | P3 |
| `@capacitor/network` | latest | ~2 KB JS | Offline detection → fail-fast banners | P3 |

**Critical:** PDF.js worker MUST be self-hosted via Vite `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` — Capacitor `file://` CSP blocks CDN workers.

---

## Table-Stakes Features (per phase)

### Phase 1 — Drawings MVP
- Upload PDF/image to **leaf** progress item (trigger-enforced) → **private** bucket + RLS
- Multiple drawings per leaf; revision label + uploaded_by + timestamp; latest-revision badge
- Pinch-zoom + PDF viewer (lazy-loaded)
- Role gate: edit = PM / MC / admin (mirrors `can_edit_project_progress`)
- File-size warning > 5 MB, hard-block > 25 MB
- Client-side thumbnail (256×256 JPEG) on upload — no Edge Function in MVP

### Phase 2 — SI/VO MVP
- SI auto-numbering per project (SI-001…); title + description + photo attachments
- Recipient = subcon company from `project_members`
- VO references originating SI; **structured line items** (labour / material / preliminaries / contingency) in HKD `numeric(14,2)`
- Status: draft → submitted → approved/rejected; **read-only after terminal**
- **Configurable approval chain per project** (via `project_approval_chains` table — shared infra)
- Push on every transition (next required actor only — see M1)
- PDF export (single SI / single VO)
- Subcon "protest" comment on SI (differentiator)

### Phase 3 — PTW MVP
- Add `safety_officer` global role (Apple account-deletion coverage required)
- Top 3 work types: 動火 / 高空 / 吊運 (types 4–7 stub-render 敬請期待)
- Per-type JSON checklist (in code) — confined-space 2024 CoP-aligned
- Signoff chain: subcon foreman → safety officer → MC site agent; photo evidence each step
- Validity window same-day default (HKT 23:59); **no auto-renewal**
- Status: pending_safety → pending_mc → active → expired → completed
- **Signed-JWT QR** on active permit (offline-verifiable by LD inspector)
- pg_cron daily expire at 15:59 UTC; close-out step (動火 = 30-min fire-watch countdown)
- Dashboard "live permits now" widget
- Read-only audit archive forever

---

## Differentiators vs Procore / Aconex / Paper

1. **`drawings.progress_item_id` FK — the moat.** Procore + Aconex keep drawings and progress in separate worlds. Linking at the leaf means "tap leaf → see exactly the drawing that governs this work."
2. **VO line items linkable to progress items** (`vo_line_items.progress_item_id` nullable FK). Connects cost to physical work.
3. **HK CoP-anchored PTW** with HK terminology and Labour Dept Form-5-style certificate — mirrors Cap. 59I + Cap. 59AC 2024 CoP exactly.
4. **Subcon "protest" comment on SI** — non-confrontational on-record disagreement. Kills month-end 扯皮.
5. **SI → drawing-version pin** (`drawing_version_id` not `drawing_id`). SI eternally resolves to exact revision at instruction time. Unforgeable.

---

## Anti-Features (Deliberately NOT this milestone)

| Anti-feature | Why |
|---|---|
| Drawing markup / annotation | 4-week project on its own; bundle bloat. Screenshot into 問題 instead. |
| Drawing OCR / search inside PDFs | HK PDFs are low-DPI scans; 60-70% accuracy = false expectation. |
| VO multi-currency | HKD only. FX + rate-locking complexity not worth it. |
| SI / VO retroactive entry | Backdating destroys trust value. App-time stamps authoritative. |
| Real-time collaborative SI / VO drafts | Single-author 95% of usage. Op-transform scope creep. |
| Permit auto-renewal across days | Each shift = fresh risk assessment + atmosphere check (CoP). |
| PTW types 4–7 UI | Schema ready; UI stub. Build one per quarter by demand. |
| VO parallel approvers | HK contracts almost always sequential. |
| Per-line subcon comment threads | Turns status doc into Slack. |
| Offline-queued signoffs | Signature timestamps are evidentiary — drift-corrupted = worse than nothing. |
| OneSignal action-buttons in push | Needs SDK migration; defer to v2. |
| MS Project / Primavera export | Separate integration phase. |

---

## Architecture Highlights

- **Storage path scheme:** `drawings/{project_id}/{drawing_id}/v{version}/{file}` + sibling `thumb.jpg`. First path segment = `project_id` → `storage.foldername(name)[1]::uuid` unlocks RLS template from CONCERNS.md. **Same shape** for `si-attachments/`, `vo-quotations/`, `ptw/`.
- **Private buckets only.** Signed URLs (TTL 1h for drawings, 15min for PTW photos).
- **Approval chain = `project_approval_chains` TABLE** (rows, NOT JSONB on projects). Columns: `(project_id, doc_type ∈ {si,vo,ptw}, step_order, role, approver_user_id?)`. In-flight docs **freeze** chain via `chain_snapshot jsonb` at submission.
- **Approvals are append-only.** `approvals` table is audit log; status **computed from rows**, not stored. Reject = new row, not mutation.
- **Drawing versioning = supersede, never delete.** `is_superseded boolean` + `drawing_versions` history. Storage blobs immortal. SI/VO/PTW reference `drawing_version_id` for unforgeable pinning.
- **PTW QR = signed JWT** (`jose` or `pgjwt`, secret in `app_config.ptw_qr_secret`). Self-verifying offline.
- **PTW expiry = pg_cron @ 15:59 UTC** (= 23:59 HKT). Server is the only timekeeper.
- **`safety_officer` role added BEFORE PTW migration** as a standalone migration. Touches `user_profiles.global_role` CHECK, RLS helpers, AdminUsers UI, account-deletion RPC.
- **Offline: fail fast.** State-changing acts gated on `@capacitor/network` `isOnline`. PTW signoffs require live connectivity.
- **Migration namespace `v8-`** for Phase 1 (skip contested v5/v6/v7). `v9-` for Phase 2, `v10-` for Phase 3. Fold `demo_feedback` RLS fix into v8 ride-along.

---

## Watch Out For (Top Pitfalls by Phase)

### Phase 1 — Drawings
- **C1: Storage RLS bypass via public-bucket reflex** — grep PRs for `getPublicUrl`; only `issue-photos` legacy allowed.
- **C6: RLS recursive-policy meltdown** — every new helper `security definer set search_path = public`. Add `supabase/tests/rls-smoke.sql`.
- **M2: Drawing version ambiguity** under sun-glare + gloves — big badge `v4 (現行)` green vs `v3 (已取代)` grey strike-through, min 16pt.
- **M6: Bundle bloat** — CI check: fail PR if entry chunk > 800 KB. Land Vite `manualChunks` split in this phase.
- **m8: `demo_feedback` RLS** — fold into v8 migration.

### Phase 2 — SI/VO
- **C4: Chain user-departure deadlock** — store chain as **roles + slot rules**, not user IDs. Delegation table. Block account-delete if user has in-flight approvals.
- **C5: MC silently editing subcon's SI** — `with check (false)` after submission. Edits create new `si_versions`; approval pins to `version_id`.
- **M1: Push fatigue** — notify ONLY next required actor; daily 08:00 digest for everyone else. Hard cap 3 push/user/day.
- **M7: VO math drift** — `decimal(12,2)`, never float. `total_amount` server-computed. Integer-cents arithmetic in JS.
- **M8: Pinch-zoom + signature collisions** — fullscreen signature modal with **locked zoom**.
- **m1: 主判/分判 comment visibility asymmetry** — `visibility enum('internal','shared')`.

### Phase 3 — PTW
- **C2: QR screenshot abuse** — signed JWT (not raw permit_id). Verification screen requires login; large worker photo. `permit_scans` audit table.
- **C3: Apple re-review on PTW copy** — frame as "internal site coordination", NOT regulatory submission. Land behind `app_config.ptw_enabled` flag.
- **M4: Timezone-aware expiry** — server-side HKT computation. Display `有效至 YYYY-MM-DD HH:mm 香港時間`.
- **m6: `safety_officer` bypass via admin** — admin can `override` (logged), not `sign`. Permission predicate explicitly checks role.

### Cross-cutting (establish in Phase 1)
- Private bucket template, RLS helper pattern, lazy-load discipline, bundle CI check.

---

## Build-Order Implications

Phase order **Drawings → SI/VO → PTW** is confirmed. Three non-obvious implications:

1. **Phase 2 carries hidden weight.** It ships `project_approval_chains` + `approvals` infrastructure that Phase 3 reuses verbatim. Build chain admin UI + RLS in Phase 2 with PTW already as a supported `doc_type`. Phase 3 then only seeds chain rows.

2. **Phase 3 has the highest concentration of new surface area:**
   - New global role (`safety_officer`) touching live `user_profiles`
   - New native plugin (`@capacitor/network`)
   - New Edge Function patterns (mint/verify JWT)
   - First use of `pg_cron`
   - Apple re-review risk
   - Public `/qr?t=…` route (first non-authed surface)

   **Recommend a 1-2 day de-risking spike at start of Phase 3.**

3. **Drawings unblocks SI/VO inline references.** Don't reorder.

---

## Open Questions (deferred to phase research)

| Question | Phase | When to resolve |
|---|---|---|
| `capacitor-voice-recorder@7` on Cap 8 — or swap to `@capgo`? | P2 | Day 1 spike if voice in scope |
| VO form complexity crosses RHF threshold? | P2 | After UX sketch |
| Per-permit-type checklist JSON shape for 動火/高空 | P3 | Phase 3 research |
| JWT mint: Edge Function (`jose`) vs in-DB (`pgjwt`) | P3 | Phase 3 spike |
| Drawing-upload push: whole project, PMs only, or off in MVP? | P1 | Phase 1 planning |

---

## Confidence Assessment

| Area | Confidence | Why |
|---|---|---|
| Stack (libs + versions) | HIGH | 5 of 6 libs widely-deployed in WebView |
| Features (table stakes) | HIGH | Anchored in HK regulations + PROJECT.md |
| Architecture (chain + RLS + storage) | HIGH | Reuses proven patterns |
| Architecture (PTW JWT + offline) | MEDIUM-HIGH | JWT pattern well-known; mint location TBD |
| Pitfalls | HIGH | Most already evidenced in CONCERNS.md |

---

## Executive Summary

The 工地控制系統 milestone layers three regulated-evidence workflows onto a live React 19 + Capacitor 8 + Supabase app. Phase 1 (Drawings) attaches versioned PDFs to leaf progress items and establishes the private-bucket RLS template. Phase 2 (SI/VO) introduces a configurable approval-chain primitive that becomes shared infrastructure. Phase 3 (PTW) reuses that chain plus pg_cron expiry, signed-JWT QR codes, and a new `safety_officer` role.

Architecture is overwhelmingly additive — no rewrites — but Phase 3 concentrates surface-area risk and should kick off with a 1-2 day de-risking spike.

**Ready for requirements definition.**
