import { test, expect, Page } from '@playwright/test'

// INF-08 Phase 2 share — ONE happy-path smoke for SI submit -> approve ->
// lock -> VO raise -> approve -> PDF export.
//
// Pre-req:
//   1. Paste tests/fixtures/seed-phase2.sql once into Supabase SQL Editor.
//   2. Create the 4 auth phone accounts via Supabase Studio with PASSWORD='test1234':
//        60000001 (subcon foreman)
//        60000002 (main contractor)
//        60000003 (project manager)
//        60000099 (admin)
//      Update the UUIDs in seed-phase2.sql if Supabase auto-assigns different ones.
//   3. Run: npm run test:e2e -- --grep @si-vo-smoke
//
// Login.tsx labels are not for=-linked to inputs, so we select by
// placeholder (stable per Phase 1 drawings.spec.ts pattern).

const SUBCON_PHONE = process.env.TEST_SUBCON_PHONE || '60000001'
const MC_PHONE = process.env.TEST_MC_PHONE || '60000002'
const PM_PHONE = process.env.TEST_PM_PHONE || '60000003'
const PASSWORD = process.env.TEST_PHASE2_PASSWORD || 'test1234'
const PROJECT_ID = process.env.TEST_PHASE2_PROJECT_ID || '20002000-2000-2000-2000-200020002000'

async function loginAs(page: Page, phone: string) {
  await page.goto('/#/login')
  await page.getByPlaceholder('9123 4567').fill(phone)
  await page.getByPlaceholder('輸入密碼').fill(PASSWORD)
  await page.getByRole('button', { name: '登入' }).click()
  await page.waitForURL(/#\/(home|projects)?$/, { timeout: 15_000 }).catch(() => {})
}

async function logout(page: Page) {
  // Clear local storage so the next loginAs starts from a clean session.
  await page.context().clearCookies()
  await page.evaluate(() => {
    try { window.localStorage.clear() } catch { /* noop */ }
    try { window.sessionStorage.clear() } catch { /* noop */ }
  })
}

test.describe('@si-vo-smoke', () => {
  test('SI submit -> approve -> lock -> VO raise -> approve -> PDF', async ({ page }) => {
    // -------- 1. Subcon submits SI --------
    await loginAs(page, SUBCON_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByRole('button', { name: /新增|提交|工地指令/ }).first().click()
    await page.getByPlaceholder(/標題/).fill('@si-vo-smoke 測試工地指令')
    await page.getByPlaceholder(/描述/).fill('整體進度延誤，需要重新編排工序及加派人手協助')
    await page.getByRole('button', { name: /^提交$/ }).click()

    // Number badge SI-NNN should appear once submitted
    const siNumberLocator = page.getByText(/SI-\d+/).first()
    await siNumberLocator.waitFor({ state: 'visible', timeout: 15_000 })
    const siNumber = (await siNumberLocator.innerText()).trim()

    // -------- 2. MC approves (step 0 -> step 1) --------
    await logout(page)
    await loginAs(page, MC_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByText(siNumber).first().click()
    await page.getByRole('button', { name: /^✓?\s*批准$/ }).first().click()
    await expect(page.getByText(/審批中|批准中|已批准/)).toBeVisible({ timeout: 5_000 })

    // -------- 3. PM approves -> SI locked --------
    await logout(page)
    await loginAs(page, PM_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByText(siNumber).first().click()
    await page.getByRole('button', { name: /^✓?\s*批准$/ }).first().click()
    await expect(page.getByText(/已鎖定|已批准/)).toBeVisible({ timeout: 5_000 })

    // -------- 4. MC raises VO from locked SI --------
    await logout(page)
    await loginAs(page, MC_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByText(siNumber).first().click()
    await page.getByRole('button', { name: /提出變更指令|新增變更指令/ }).first().click()
    await page.getByPlaceholder(/描述/).first().fill('額外工程：加裝臨時防水層及加固支架')
    await page.getByRole('button', { name: /新增項目|新增行/ }).first().click()
    // First line item: 人工 5 人日 x HK$200 = HK$1,000.00
    await page.getByPlaceholder(/項目描述|描述/).last().fill('人工 5 人日')
    await page.getByPlaceholder(/數量/).fill('5')
    await page.getByPlaceholder(/單位/).fill('人日')
    await page.getByPlaceholder(/單價/).fill('200')
    await page.getByRole('button', { name: /^提交$/ }).click()

    await expect(page.getByText(/經系統核算總額/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/HK\$\s*1,?000(\.00)?/)).toBeVisible()

    const voNumberLocator = page.getByText(/VO-\d+/).first()
    await voNumberLocator.waitFor({ state: 'visible', timeout: 10_000 })
    const voNumber = (await voNumberLocator.innerText()).trim()

    // -------- 5. MC approves own-step? — depends on chain — assume MC is step 0,
    //          which is auto-satisfied by the submitter being MC. So next actor = PM. --------
    await logout(page)
    await loginAs(page, PM_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/vo`)
    await page.getByText(voNumber).first().click()
    await page.getByRole('button', { name: /^✓?\s*批准$/ }).first().click()
    await expect(page.getByText(/已鎖定|已批准/)).toBeVisible({ timeout: 5_000 })

    // -------- 6. Export PDF — assert download --------
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    await page.getByRole('button', { name: /匯出 PDF/ }).first().click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/VO-?\d+/i)
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  })
})
