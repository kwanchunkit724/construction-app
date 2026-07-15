---
phase: 03-ptw
created: 2026-05-15
status: discussing
prior_phases: [01-drawings-on-progress-items, 02-si-vo]
---

# Phase 3 — PTW (工作許可證 / Permit to Work) — Context

## Goal (per ROADMAP)

Safety officer reviews + signs 動火 / 高空 / 吊運 permits from subcon foreman → MC signs → auto-issues signed-JWT QR → inspector verifies in-app → auto-expires HKT 23:59 same day. Read-only audit archive aligned with HK Labour Dept CoP evidence requirements.

## Locked from Phase 1 + Phase 2

- **Reuse `approval_chain_steps`** verbatim. Phase 3 seeds chain rows for `doc_type='ptw'`. No new chain table.
- **Reuse Phase 1 private-bucket template** for PTW photos (PPE, worker, scene). Signed URLs TTL 15min.
- **Reuse `push_dispatcher` + 3/user/day fatigue cap + 08:00 HKT digest** from Phase 2.
- **Reuse `dispatch_after_approval` trigger** for chain advance. Add `ptw` branch (currently no-op return new).
- **Reuse `submit_approval` RPC** for safety-officer + MC sign actions. New `action_type='sign'` may be needed (vs reusing `approve`).
- **Reuse `delete_my_account()` in_flight guard** — extend `in_flight_approvals()` to count pending PTW.
- **Reuse Phase 2 chain-snapshot pattern (D-02)** — frozen at submit, mid-flight unaffected by config edits.
- **Reuse rls-smoke harness** — extend with PTW personas.

## Decisions (picked from research, locked)

| ID | Decision | Source |
|---|---|---|
| P3-D1 | **`safety_officer` global role migration = Plan 03-01 (separate concern, before PTW schema)** | RESEARCH SUMMARY.md L99 |
| P3-D2 | **JWT lib = `pgjwt` Postgres extension** (server-only mint, secret in `app_config.ptw_qr_secret` never leaves server) — mitigates C2 QR screenshot abuse | RESEARCH SUMMARY.md L97 |
| P3-D3 | **PTW expiry = pg_cron job at `0 16 * * *` UTC (= 00:00 HKT next day = 23:59 cutoff same day)** | RESEARCH SUMMARY.md L98 |
| P3-D4 | **動火 close-out = 30-min fire-watch countdown + foreman re-sign** | ROADMAP SC3 |
| P3-D5 | **Offline state-changing PTW acts blocked via `@capacitor/network` isOnline**. Read-only past permits work from cache | ROADMAP SC5 |
| P3-D6 | **`app_config.ptw_enabled` feature flag** gates entire PTW surface for Apple re-review staging | RESEARCH SUMMARY.md L98, ROADMAP SC4 |
| P3-D7 | **PTW v1 types = 動火 / 高空 / 吊運 only** ship full UI. 密閉空間 / 掘地 / 電力 / 棚架 = stub picker entry "敬請期待" | ROADMAP SC4 |
| P3-D8 | **Apple framing = "internal site coordination" copy throughout** — NOT "regulatory submission" or "permit issuance" | RESEARCH SUMMARY.md L124 |
| P3-D9 | **safety_officer bypass mitigation (m6)** — admin can `admin_override` (logged) but does NOT satisfy safety-step signoff. Audit cleanly distinguishes real safety signature from admin override | ROADMAP SC2 |
| P3-D10 | **De-risking spike = Plan 03-01** (the role migration). Subsequent plans land schema + UI on proven foundation | ROADMAP "1–2 day de-risking spike" + RESEARCH SUMMARY.md L141 |
| P3-D11 | **Phase 2 lessons inherited:** all forward-ref functions use plpgsql + EXECUTE; never PowerShell clipboard for non-ASCII SQL; SQL Editor doesn't auto-wrap multi-statement in txn; `drop trigger if exists ... on table` guard with to_regclass | Plans 02-01 / 02-02 / 02-06 SUMMARYs |

## New Deps (Phase 3)

| Package | Size | Use | Lazy-load? |
|---|---|---|---|
| `qrcode.react` ^4.2.0 | ~6 KB | QR render on active PTW | Yes (PTW detail page only) |
| `react-signature-canvas` + `signature_pad` | ~14 KB | Foreman + MC + safety-officer signoff pad | Yes (signoff modal only) |
| `@capacitor/network` | ~2 KB | `isOnline` for offline-fail-fast | Yes (PTW context only) |
| `pgjwt` Postgres extension | server-side | JWT sign / verify | Server only — no client cost |

**Bundle budget:** entry chunk currently 644.3 KB / 800 KB CI limit. Phase 3 new deps must lazy-load to stay under.

## Open Questions (defer to discuss / spike)

1. **JWT payload schema** — fields: `permit_id`, `iat`, `exp` (HKT 23:59), `project_id`, `type`, `worker_count`. Verify in `permit_scans` audit row.
2. **QR verification flow** — login-gated screen. Show worker photo + permit details. Log scan in `permit_scans` table. Confirm scan UI placement (BottomNav new icon? `/scan` route?).
3. **30-min fire-watch countdown** — server-side timestamp vs client timer? Server timestamp = `fire_watch_started_at`; client UI counts down from server value. Submit close-out requires `now() >= fire_watch_started_at + interval '30 minutes'`.
4. **Re-submission after rejection** — same as SI/VO (`revision_requested` → resubmit), OR PTW = single-shot (rejected = dead, new permit required)? Defer to discuss.
5. **PTW types 4–7 stub presentation** — disabled picker entry vs "coming soon" banner vs entirely hidden? Stub picker entry with "敬請期待" label matches research.

## Plan Outline (TBD — to draft after spike)

| Wave | Plan | Scope |
|---|---|---|
| 1 | 03-01 | **De-risking spike**: `safety_officer` role migration (user_profiles CHECK + delete_my_account extend + rls-smoke persona + AdminUsers picker). pgjwt extension proof. pg_cron expiry rehearsal with synthetic permit. `@capacitor/network` smoke. Plan-quality gate before continuing. |
| 2 | 03-02 | PTW schema (v10-ptw-schema.sql): `permits_to_work`, `permit_versions`, `permit_signoffs`, `permit_scans`, `permit_workers`. Triggers: lock-guard, fire-watch-elapsed, expiry-cron. RPC: `submit_ptw`. Reuse SI/VO pattern. |
| 3 | 03-03 | TS types + PtwContext + signed-JWT helper (`src/lib/ptw-jwt.ts`) + QR generator wrapper. Lazy `qrcode.react`. |
| 4 | 03-04 | Native plugins: `@capacitor/network`, signature-canvas. zh-HK permission strings. cap sync. |
| 5 | 03-05 | PTW UI: PtwSubmitForm (3 type tabs + checklist + worker list + photo capture), PtwList, PtwDetail (QR + sign timeline), PtwApproverBar (safety_officer + MC + close-out signoff). |
| 6 | 03-06 | QR verification flow: `/verify/:jwt` route, scan logging, login gate, worker photo display. `permit_scans` writes. |
| 7 | 03-07 | Admin chain config extend (PTW tab in AdminProjectChains) + `app_config.ptw_enabled` admin toggle + chain seed for 動火 / 高空 / 吊運. |
| 8 | 03-08 | INF-08 Phase 3 share: Playwright `@ptw-smoke` (submit → safety sign → MC sign → QR scan → close-out → archive). End-of-phase walkthrough mirroring 01-09 / 02-09. |

Estimated waves: 8. Estimated SQL apply checkpoints: 3 (Plan 03-01 role migration, Plan 03-02 schema, Plan 03-07 seed). All via base64 → Monaco path.

## Threat Model Carryover (from ROADMAP risks)

- **C2 QR screenshot abuse** → P3-D2 pgjwt signed (not raw permit_id) + login-gated verify + photo display + `permit_scans` audit
- **C3 Apple re-review** → P3-D6 + P3-D8 feature flag + framing
- **m6 safety_officer bypass via admin** → P3-D9 admin_override logged but doesn't satisfy

## Next Action

**`/gsd-plan-phase 3`** to decompose plan outline above into executable plans.

OR start inline with Plan 03-01 (the spike) — pure SQL + small role-migration code, no UI dependencies, low risk. Spike output validates the 5 open questions before locking later plans.
