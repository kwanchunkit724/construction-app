import { test, expect } from '@playwright/test'

// INF-08 / D-31: ONE happy-path smoke test for the Phase 1 drawing flow.
// Flow: login as PM → open seeded project → tap leaf item's 圖則 button →
//       upload sample PDF → assert thumbnail appears → tap to open viewer →
//       assert pinch-zoom container rendered (data-testid="drawing-viewer-zoom").
//
// Required env (set by developer running the test locally):
//   TEST_PM_PHONE      seeded PM phone, e.g. 98765432
//   TEST_PM_PASSWORD   seeded PM password, e.g. Demo@2026
//   TEST_PROJECT_NAME  optional, defaults to 'Playwright Test Project'

const PHONE = process.env.TEST_PM_PHONE || '98765432'
const PASSWORD = process.env.TEST_PM_PASSWORD || 'Demo@2026'
const PROJECT_NAME = process.env.TEST_PROJECT_NAME || 'Playwright Test Project'

test('PM uploads drawing on leaf progress item and opens viewer', async ({ page }) => {
  // 1. Login
  await page.goto('/#/login')
  await page.getByLabel('手機號碼').fill(PHONE)
  await page.getByLabel('密碼').fill(PASSWORD)
  await page.getByRole('button', { name: '登入' }).click()

  // Wait for post-login navigation (Home renders "我的工地" or similar)
  await page.waitForURL(/#\/(home|projects)?$/, { timeout: 15_000 }).catch(() => {})

  // 2. Open seeded project
  await page.getByText(PROJECT_NAME, { exact: true }).first().click()

  // 3. Tap the leaf item's 圖則 button (text contains "圖則 (N)")
  const drawingsBtn = page.getByText(/圖則 \(\d+\)/).first()
  await drawingsBtn.waitFor({ state: 'visible', timeout: 15_000 })
  await drawingsBtn.click()

  // 4. Open the upload sheet
  await page.getByRole('button', { name: /新增圖則/ }).first().click()

  // 5. Choose "從檔案選擇" and attach the fixture
  await page.getByText('📁 從檔案選擇').click()
  await page.setInputFiles('input[type="file"]', 'tests/fixtures/sample-drawing.pdf')

  // 6. Fill title + submit
  await page.getByPlaceholder('圖則標題').fill('A-101 平面圖')
  await page.getByRole('button', { name: '上載' }).click()

  // 7. Thumbnail appears
  await expect(page.getByText('A-101 平面圖')).toBeVisible({ timeout: 30_000 })

  // 8. Tap thumbnail → assert viewer's pinch-zoom container present
  await page.getByText('A-101 平面圖').click()
  await expect(page.locator('[data-testid="drawing-viewer-zoom"]')).toBeVisible({ timeout: 10_000 })
})
