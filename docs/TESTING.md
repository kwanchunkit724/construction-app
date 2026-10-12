# Testing

## Quick start

```bash
npm ci
npm test          # Vitest unit suite (no network)
npm run typecheck # tsc --noEmit
npm run build     # tsc && vite build (needs VITE_SUPABASE_* env)
```

Watch mode while developing:

```bash
npm run test:watch
```

## What the unit suite covers

Focused pure-logic and small UI tests under `src/**/*.test.{ts,tsx}`:

| Area | Files | Notes |
|------|-------|-------|
| Phone auth helpers | `src/lib/phone.test.ts` | HK mobile validation, phone↔email |
| HKD money | `src/lib/currency.test.ts` | Integer-cent parse/format/multiply |
| Progress math | `src/types.progress.test.ts` | floors/qty/unit_status %, schedule, rollup, acceptance gate, issue escalation, form status, floor labels |
| PTW | `src/lib/ptw.logic.test.ts` | Checklist templates, expiry, fire-watch, path guard |
| Guided 進度 | `src/lib/guided.test.ts` | Leaf filters + tick-based % |
| Progress templates | `src/lib/progressTemplates.test.ts` | Project-type registry + blocked display |
| Offline cache | `src/lib/offline.test.ts` | localStorage read-cache |
| Credentials | `src/lib/credentials.logic.test.ts` | Valid/verified/expiry helpers |
| DWSS refs | `src/lib/dwss.test.ts` | Document identifiers |
| Diff / HK80 / modules / QR URLs / SI path | matching `src/lib/*.test.ts` | Pure helpers |
| VO line items | `src/components/vo/validateLineItems.test.ts` | Submit validation |
| Materials late flag | `src/contexts/isMaterialLate.test.ts` | Client-side overdue |
| ProgressBar | `src/components/ProgressBar.test.tsx` | Planned marker + fill |

Supabase is **never** called. Vitest injects dummy `VITE_SUPABASE_*` values so modules that import the client can load, and `src/test/setup.ts` throws on any unexpected `fetch`.

## What stays manual / out of CI

### Playwright e2e (`npm run test:e2e`)

The five specs under `tests/e2e/` hit the **live** Supabase project. Do **not** run them against production from CI or as a PR gate. Keep them for local / staging / persona-sim sessions with known test accounts.

### Codemagic native builds

`ios-testflight` still auto-runs on push to `main`. Do not trigger `ios-app-store` / `android-play-store` without an explicit request — those ship to public stores.

### Lint

No ESLint config in this repo yet. The PR CI gate is `typecheck` + `test` + `build`.

## GitHub Actions

`.github/workflows/ci.yml` runs on `pull_request` and `workflow_dispatch` (not on push to `main`, so it does not double-run with Codemagic on merge). Steps: `npm ci` → typecheck → test → build with placeholder Supabase env.
