# Testing Patterns

**Analysis Date:** 2026-05-11

## Summary: No Application Tests Exist

**There are zero test files in this codebase.**

Verified:
- No files matching `*.test.{ts,tsx,js,jsx}` or `*.spec.{ts,tsx,js,jsx}` exist anywhere under `src/`, `tests/`, `e2e/`, or `playwright/`
- No `tests/`, `e2e/`, `__tests__/`, or `playwright/` directory exists at the repo root
- No test runner configuration: no `vitest.config.*`, no `jest.config.*`, no `playwright.config.*`
- No `test` script in `package.json` — only `dev`, `build`, `preview`, `cap:sync`, `cap:open`
- No CI step runs tests (the Codemagic workflow in recent commits is build-only for Android)

## Installed Test-Adjacent Packages

`package.json` devDependencies include:
- `@playwright/test ^1.59.1`
- `playwright ^1.59.1`

**These are not used for application testing.** No Playwright test files, no `playwright.config.ts`, no `playwright-report/`, no test commands. The most plausible reasons they are installed:
- Used ad-hoc by tooling/agents for screenshot capture (the repo root contains `screen-*.png`, `dbg-*.png`, `bluestacks-screen.png` artifacts that look like manually-driven captures)
- Left over from exploration / not yet wired up

**Do not assume Playwright is the chosen test framework.** Either confirm with the maintainer or treat it as unused.

## Native Boilerplate Tests (Not Application Code)

Two Android scaffolding files exist from the Capacitor `npx cap add android` template — these are **untouched defaults**, not maintained tests:
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`

They do not cover any app behavior and should not be treated as a testing strategy.

## Type Checking as the Only Automated Safety Net

The `build` script runs `tsc && vite build` (`package.json`). TypeScript strict mode (`tsconfig.json`: `"strict": true`) is the **only automated check** that runs before bundling. There is no:
- Unit test runner
- Integration test runner
- E2E test runner (despite Playwright being installed)
- Linter (no ESLint/Biome)
- Coverage measurement

## Manual Verification Practice (Inferred)

Based on repo artifacts, the current QA approach appears to be:
- Manual smoke testing on web (Vite dev server) and on device (Capacitor iOS/Android)
- Screenshots captured manually: `screen-1.png` … `screen-7-issues.png`, `dbg-1-launch.png` … `dbg-7-profile.png`, `bluestacks-screen.png` (Android emulator)
- Database state verified directly in Supabase

## Recommendations for Future Test Work

Since nothing is set up, a future test phase has free design choices. If/when tests are introduced, suggested starting points:

**Unit / component tests** (most valuable first step given React + TS):
- Add `vitest` + `@testing-library/react` + `jsdom` — integrates natively with the existing Vite toolchain
- Place tests co-located: `src/lib/phone.test.ts`, `src/components/IssueCard.test.tsx`
- Add `"test": "vitest"` and `"test:run": "vitest run"` to `package.json` scripts
- High-value first targets: `src/lib/phone.ts` (phone normalization / `isValidHKPhone`), `src/lib/export.ts`, the rollup helpers in `src/types.ts` (`computeRollup`, `getZoneLeaves`)

**E2E tests** (Playwright is already a devDependency):
- Add `playwright.config.ts` at repo root
- Create `e2e/` directory with login + create-project flows
- Add `"test:e2e": "playwright test"` script
- Use a dedicated test Supabase project to avoid polluting production data — there is no `.env.test` pattern yet

**Database / RLS tests:**
- The repo has many `vN-fix-rls-*.sql` migrations indicating RLS bugs have shipped historically. A pgTAP or Supabase-CLI-based test suite against the `supabase/` schema files would be high-leverage. None exists today.

**CI:**
- Current Codemagic workflow (`fix(ci): switch Android workflow to mac_mini_m2`) only builds Android. No test step. A `test` job would need to be added separately.

---

*Testing analysis: 2026-05-11*
