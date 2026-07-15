---
phase: 01-drawings-on-progress-items
plan: 08
subsystem: testing
tags: [playwright, e2e, smoke, infrastructure, INF-08]
requirements: [INF-08]
dependency_graph:
  requires:
    - "01-06 (DrawingViewer with data-testid='drawing-viewer-zoom')"
    - "01-07 (user-facing upload flow visible on leaf items)"
  provides:
    - "Playwright test scaffold (config + scripts) reusable by P2/P3 specs"
    - "ONE happy-path drawings smoke test (D-31 satisfied)"
    - "Idempotent Playwright fixture seed targeting live v2/v3 schema"
  affects:
    - "package.json scripts (preview port, test:e2e, test:e2e:install)"
tech_stack:
  added:
    - "@playwright/test (already in devDeps; first actual usage)"
  patterns:
    - "Playwright webServer block chains build && preview, probes URL until 200"
    - "Phone-as-email auth fixture (PHONE@phone.local matches src/lib/phone.ts)"
key_files:
  created:
    - playwright.config.ts
    - tests/e2e/drawings.spec.ts
    - tests/fixtures/sample-drawing.pdf
  modified:
    - package.json
    - scripts/seed-demos.js
decisions:
  - "Use placeholder selectors ('9123 4567', '輸入密碼') instead of getByLabel because Login.tsx <label> tags lack for= attribute"
  - "Add seedPlaywrightFixtures() as additive function (live v2/v3 schema) rather than touch the legacy demo seeders (which target a different `profiles` table + email auth)"
  - "Pin preview port to 5173 in package.json — vite default is 4173 (ISSUE-08 mismatch with Playwright url probe)"
metrics:
  duration_minutes: 12
  completed_date: "2026-05-12"
  tasks_completed: 3
  files_changed: 5
---

# Phase 1 Plan 08: Playwright smoke test scaffold + ONE drawing happy-path Summary

**One-liner:** First-ever test in the repo: a single Playwright spec that drives the Phase 1 drawing upload + view flow, with port-5173-aligned preview server and an idempotent Supabase fixture seed.

## What was built

1. **`playwright.config.ts`** — iPhone-13 viewport (390×844), `testDir: './tests/e2e'`, `fullyParallel: false`, single chromium project, `webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:5173', reuseExistingServer: !CI, timeout: 120s }`. Trace on failure.

2. **`tests/e2e/drawings.spec.ts`** — ONE test: PM login → open `Playwright Test Project` → tap leaf `🖼 圖則 (N)` button → click `+ 新增圖則` → click `📁 從檔案選擇` → `setInputFiles('input[type="file"]', 'tests/fixtures/sample-drawing.pdf')` → fill `圖則標題` with `A-101 平面圖` → click `上載` → assert thumbnail visible → click thumbnail → assert `[data-testid="drawing-viewer-zoom"]` visible.

3. **`tests/fixtures/sample-drawing.pdf`** — 3,305 bytes (under 100 KB cap), generated via jsPDF (`new jsPDF(); .text('Sample Drawing - Playwright Fixture', 10, 10)`), committed binary.

4. **`package.json`** — `preview` pinned to `vite preview --port 5173`; new scripts `test:e2e` and `test:e2e:install`.

5. **`scripts/seed-demos.js`** — additive `seedPlaywrightFixtures()` wired into `main()`. Idempotently provisions: PM auth user (`98765432@phone.local` / `Demo@2026`), `user_profiles` row (`global_role='pm'`), `projects` row named `Playwright Test Project` with the PM in `assigned_pm_ids`, and ONE `progress_items` row titled `Test Leaf Item` (level 1). All ops match-by-natural-key (phone / project name / leaf title) before insert. Documented env vars at top of file.

## Spec selectors used

| Step | Selector | Reason |
|------|----------|--------|
| Phone input | `getByPlaceholder('9123 4567')` | Login.tsx `<label>` lacks `for=` attribute, so `getByLabel('手機號碼')` returns nothing |
| Password input | `getByPlaceholder('輸入密碼')` | Same reason |
| Login button | `getByRole('button', { name: '登入' })` | Stable accessible name |
| Project tile | `getByText(PROJECT_NAME, { exact: true }).first()` | Home.tsx renders `<Link to="/project/{id}">{project.name}</Link>` |
| Leaf 圖則 button | `getByText(/圖則 \(\d+\)/).first()` | ProgressItemCard.tsx renders `🖼 圖則 ({drawingCount})` |
| New drawing | `getByRole('button', { name: /新增圖則/ }).first()` | Two buttons in DrawingsSection (header + empty state) — first is fine |
| File-picker entry | `getByText('📁 從檔案選擇')` | DrawingUploadSheet line 283 |
| File input | `setInputFiles('input[type="file"]', ...)` | Hidden input revealed via the chooser |
| Title field | `getByPlaceholder('圖則標題')` | DrawingUploadSheet line 319 |
| Submit | `getByRole('button', { name: '上載' })` | DrawingUploadSheet line 425 |
| Thumbnail | `getByText('A-101 平面圖')` | Drawing card title |
| Viewer | `locator('[data-testid="drawing-viewer-zoom"]')` | Plan 06 added this testid |

## Seed deltas

- Targets the live **v2/v3 schema** (`user_profiles` + `projects` + `progress_items`), NOT the legacy `profiles`/email schema used by the demo scenarios above. Docstring at top of file clarifies the distinction.
- All inserts are idempotent via natural-key lookups — re-running the seed is safe.
- Adds 4 rows total when no existing fixture: 1 auth user, 1 user_profiles, 1 project, 1 progress_item.

## Port-5173 alignment (ISSUE-08)

- Before: `package.json` had `"preview": "vite preview"`, which binds Vite's default port **4173**. Playwright's `webServer.url` was specified as `http://localhost:5173`, so the URL probe would never succeed and the test runner would hang for 120 s before failing.
- After: `"preview": "vite preview --port 5173"` matches the Playwright probe URL. Local run confirms preview boots on 5173 and serves the freshly-built `dist/`.

## Runtime observed (worktree dry-run)

- `npx playwright test --list` discovered 1 test in 1 file (config valid).
- `npx playwright install chromium` succeeded (chromium-1217 installed).
- `npx playwright test` — webServer started, built successfully (with the existing chunk-size-warning noise), preview booted on 5173, browser launched, navigated to `/#/login`. **Failed** at the first selector (`getByLabel('手機號碼')`) because the labels weren't `for=`-linked. Fixed in commit `42ff6c6` (placeholder selectors). Re-run requires the seed to have populated Supabase first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Login selectors switched from getByLabel → getByPlaceholder**
- **Found during:** Task 3 dry-run.
- **Issue:** `Login.tsx` `<label className="label">手機號碼</label>` is not `for=`-linked to its sibling `<input>`. Playwright's `getByLabel('手機號碼')` therefore returned no candidates, timing out at 60 s.
- **Fix:** Switched to `getByPlaceholder('9123 4567')` and `getByPlaceholder('輸入密碼')` which are stable in the current Login.tsx.
- **Files modified:** `tests/e2e/drawings.spec.ts`
- **Commit:** `42ff6c6`

**2. [Rule 2 - Critical functionality] Seed targets correct schema**
- **Found during:** Task 2 read of `scripts/seed-demos.js`.
- **Issue:** Existing seed-demos.js targets a legacy `profiles` table with `<username>@kwanchunkit.app` emails. The live app uses `user_profiles` + phone-as-email (`{phone}@phone.local`) per `src/lib/phone.ts`. Mirroring the existing pattern verbatim would produce fixtures the app can't actually read or log in with.
- **Fix:** Added `seedPlaywrightFixtures()` as a separate additive function targeting the live v2/v3 schema, with a docstring at the top of the file calling out the distinction. Legacy demo flows untouched.
- **Files modified:** `scripts/seed-demos.js`
- **Commit:** `1fb55ac`

## Authentication / fixture gates encountered

The BLOCKING checkpoint (Task 3) requires `SUPABASE_SERVICE_ROLE_KEY` to run the seed and a populated Supabase project to log into. Both are operator-side prerequisites — see "Awaiting" below.

## Deferred Issues

- Wiring the smoke test into Codemagic CI is explicitly out of scope per D-31 ("ONE test only", not yet wired to CI in this phase).
- Bundle size warnings during `npm run build` from the webServer log are pre-existing (Plan 04/06 territory) — not in scope for this plan.

## Self-Check: PASSED

- [x] `playwright.config.ts` exists, contains `testDir.*tests/e2e`, `390`, `localhost:5173`, `npm run build && npm run preview`.
- [x] `package.json` contains `vite preview --port 5173` and `test:e2e` script.
- [x] `tests/e2e/drawings.spec.ts` exists, contains `drawing-viewer-zoom` and `新增圖則`.
- [x] `tests/fixtures/sample-drawing.pdf` exists (3,305 bytes < 100 KB).
- [x] `scripts/seed-demos.js` contains `Playwright Test Project`, `TEST_PM_PHONE` (and `98765432`), `Test Leaf Item`.
- [x] Commits exist: `ee31173`, `1fb55ac`, `42ff6c6`.

## Awaiting (developer-side, BLOCKING checkpoint)

To turn the green light on for this plan, the developer must, on their workstation:

1. Set `SUPABASE_SERVICE_ROLE_KEY` (and optionally `TEST_PM_PHONE` / `TEST_PM_PASSWORD`) in their environment.
2. Run `node scripts/seed-demos.js` once — observe `🧪 Playwright Test Project` block prints PM/project/leaf creations or `↺ already exists` lines.
3. Run `npm run test:e2e:install` once (downloads chromium ≈140 MB).
4. Run `TEST_PM_PHONE=98765432 TEST_PM_PASSWORD=Demo@2026 npm run test:e2e`. Expect: `1 passed`. End-to-end runtime should be <60 s once warm.

If the test fails after seeding, inspect `playwright-report/` and re-evaluate selectors in `tests/e2e/drawings.spec.ts`.
