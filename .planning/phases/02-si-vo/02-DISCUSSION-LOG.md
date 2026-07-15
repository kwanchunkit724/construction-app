# Phase 2: SI / VO - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `02-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 02-si-vo
**Mode:** `--auto` (recommended option auto-selected per gray area)
**Areas discussed:** Approval-chain infrastructure, Push-fatigue cap, SI capture UX, Approver UX, Chain admin UI, VO data model, VO PDF export, Delegation, Bundle discipline

---

## Approval-chain infrastructure

| Option | Description | Selected |
|--------|-------------|----------|
| `approval_chain_steps` table per (project, doc_type, step_order) | Normalized; easy admin UI; supports indexed lookup | ✓ |
| JSONB column on `projects.approval_chain` | Simpler initial schema; harder to evolve and validate | |
| Edge-function-driven chain | Pure infrastructure; needs server runtime; overkill for v1 | |

**Selected:** Normalized table — directly mirrors CHN-02 wording and gives clean RLS.
**Notes:** Snapshot to `chain_snapshot jsonb` at submission protects in-flight docs from mid-flight edits.

---

## `approvals` audit table

| Option | Description | Selected |
|--------|-------------|----------|
| Append-only `approvals` rows; status computed | INSERT-only; full history; rejection is a new row | ✓ |
| Mutable status on parent doc | Smaller table; loses audit history; fails CHN-11 | |
| Hybrid (mutable status + history table) | Two sources of truth; consistency burden | |

**Selected:** Append-only.
**Notes:** Directly satisfies CHN-11. Doc status is derived from latest `approvals` rows of each step.

---

## Push-fatigue cap (3/user/day)

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres `notification_counters` + pg_cron digest at 08:00 HKT | Counter is local DB state; digest is a single cron; cheap | ✓ |
| OneSignal segment-based dedup | Vendor-side; opaque; harder to retry on send failure | |
| Edge function pre-send filter | Adds runtime hop; not needed at ≤200 users | |

**Selected:** Postgres counter + pg_cron digest.
**Notes:** HKT 08:00 = UTC 00:00, simple cron expression. Counter survives OneSignal failures.

---

## SI submission form fields

| Option | Description | Selected |
|--------|-------------|----------|
| Title + description + drawing pin + photos + voice + location (all in one screen, voice/location optional) | Matches SI-02 verbatim; one-form UX subcons can scan in seconds | ✓ |
| Multi-step wizard | More guided but slower; subcons typically submit from job-site (one screen wins) | |
| Title + description only; attachments after submission | Misses the "submit-with-evidence" guardrail subcons need | |

**Selected:** Single-screen form with voice/location optional.
**Notes:** Voice capped at 2 min, 5 MB; location captures (lat, lng, accuracy_m) at submit, no live map.

---

## Drawing version pinning UX

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-pin to current `drawing_versions` row at submit; subcon may manually re-pick | Zero friction; "current at submit time" is the default expectation | ✓ |
| Force subcon to pick version manually each time | Heavy; subcons rarely understand version diffs | |
| Pin to drawing_id (not version) | Fails SI-03 explicit requirement | |

**Selected:** Auto-pin current version, allow manual override.

---

## SI/VO body storage

| Option | Description | Selected |
|--------|-------------|----------|
| `si_versions.payload jsonb` (whole body in JSONB) | Append-only versioning trivial; matches `drawing_versions` pattern | ✓ |
| Normalized columns on `si_versions` | More SQL queryability but harder to diff cleanly | |

**Selected:** JSONB payload.
**Notes:** Diff card walks `payload` keys field-by-field.

---

## Approver actions

| Option | Description | Selected |
|--------|-------------|----------|
| 4 buttons always visible: 批准 / 批准並修改 / 退回 / 拒絕 | Matches SI-07 verbatim; predictable affordances | ✓ |
| 2 buttons (批准 / 拒絕) with edit hidden behind menu | Cleaner but hides the most common power-action | |
| Slider with multi-state | Too cute; unfamiliar to HK construction users | |

**Selected:** 4 always-visible buttons.
**Notes:** 退回 (request_revision) resets chain to step 0; 拒絕 (reject) is terminal. Both require `reason ≥ 10`.

---

## Diff view style

| Option | Description | Selected |
|--------|-------------|----------|
| Field-by-field labelled diff card with old→new for each changed key, line-level +/- for description | Non-technical-user-friendly; highlights the 扯皮 surface | ✓ |
| Git-style unified diff | Familiar to devs; alien to 主判 + 分判 | |
| Side-by-side full-document compare | Real estate hungry on 390 px phone | |

**Selected:** Labelled field-by-field diff.

---

## Chain admin UI shape

| Option | Description | Selected |
|--------|-------------|----------|
| Per-project page with tab picker [SI \| VO \| PTW]; drag-handle reorderable rows | Mirrors how 工地 actually scope chains; visual reorder is fast | ✓ |
| Global chain template; per-project override JSONB | Two sources of truth; admins forget to override | |
| Wizard on project creation only | Cannot adjust mid-project (subcons join late) | |

**Selected:** Per-project page with tabs.
**Notes:** Default chain seeded on project creation; admin can mutate any time.

---

## VO line item storage

| Option | Description | Selected |
|--------|-------------|----------|
| `vo_versions.payload jsonb.line_items[]` | Append-only; matches SI pattern; trigger recomputes totals | ✓ |
| Separate `vo_line_items` table | More queryable but split-source audit complexity | |
| Computed view over a sibling table | Adds index overhead; harder to version | |

**Selected:** JSONB array inside `vo_versions.payload`.
**Notes:** `total_amount_cents` is a `GENERATED ALWAYS AS` column on `variation_orders` for VO-05 server-computed total.

---

## VO PDF export approach

| Option | Description | Selected |
|--------|-------------|----------|
| `jspdf` + `jspdf-autotable` client-side (existing pattern in `src/lib/export.ts`) | Already in deps; consistent with `exportProgressToPDF`; no edge fn needed | ✓ |
| Server-side Puppeteer (Edge function) | Better fidelity; adds runtime + cold-start latency | |
| Hand-rolled `<canvas>` rasterizer | Reinvents the wheel | |

**Selected:** Client-side `jspdf` + `jspdf-autotable`.
**Notes:** Drawing thumbnails fetched via signed URL → base64 → embedded. ≤6 thumbnails per page.

---

## Delegation UX

| Option | Description | Selected |
|--------|-------------|----------|
| Self-service from Profile page; date-range delegate picker | Each user manages own absences; admin not bottleneck | ✓ |
| Admin-only delegation | Slow; admins are not always reachable | |
| Auto-delegate based on calendar integration | Out of scope; no calendar in v1 | |

**Selected:** Self-service from Profile.

---

## Realtime + RLS

| Option | Description | Selected |
|--------|-------------|----------|
| Realtime on all new tables; RLS helpers per doc type | Mirrors Phase 1; approver/subcon screens auto-refresh | ✓ |
| Polling | Wasteful; UX feels stale | |
| WebSocket pub/sub on Edge | Overkill | |

**Selected:** Postgres realtime channels + `can_view_si` / `can_view_vo` helpers.

---

## Bundle discipline

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `manualChunks` from Phase 1; verify VO PDF export stays chunked | Reuses INF-06 chunking; no regression | ✓ |
| Move PDF export to dynamic `import()` only | Already chunked from Phase 1 — duplicating wouldn't help | |

**Selected:** Reuse Phase 1 `manualChunks`.

---

## Claude's Discretion

- Diff-card colour and spacing (to be set in `/gsd-ui-phase 2`).
- Voice recorder waveform vs simple `0:00 / 2:00` counter.
- Geolocation tile provider (OSM vs static thumbnail vendor).
- Push notification deep-link URL shape (extends existing `#/...`).

## Deferred Ideas

- PTW chain reuse → Phase 3.
- Multi-VO per SI → v2.
- Parallel approvers → v2.
- Payment-claim integration → Phase 4 candidate.
- Cost-attribution dashboard → future analytics phase.
- Server-side PDF rendering → if quality complaints arise.
- OneSignal segment-based dedup → if Postgres counter proves insufficient.
- Drawing "new version available" badge on locked SI → v2.
