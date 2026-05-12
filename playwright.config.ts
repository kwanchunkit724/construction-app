import { defineConfig, devices } from '@playwright/test'

// Phase 1 — INF-08 / D-31: ONE happy-path smoke test for drawing upload + view.
// webServer command CHAINS build then preview so the preview server has fresh
// dist/ to serve. The url-based probe waits until http://localhost:5173 returns
// 200 before starting tests. Port 5173 is pinned in package.json `preview`
// script (vite preview --port 5173) — ISSUE-08 alignment.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 390, height: 844 }, // iPhone 13
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
})
