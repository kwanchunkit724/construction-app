import { test, expect, Page } from '@playwright/test'

// Apple Guideline 5.1.1(v) regression — two end-to-end scenarios for the
// public.delete_my_account() RPC + Profile DeleteAccountSheet UI:
//
//   1. Clean user (no in-flight SI/VO) → cascade delete + sign-out.
//   2. User who is the active SI submitter on an unresolved approval chain →
//      RPC returns { ok:false, blocked:true, pending:N } and the
//      blocked-deletion banner ("未能刪除帳戶") is rendered.
//
// Pre-req:
//   1. Paste tests/fixtures/seed-phase2.sql once into Supabase SQL Editor.
//      That seeds these phone accounts (all PASSWORD = 'test1234'):
//        60000001 subcon foreman
//        60000002 main contractor
//        60000003 project manager
//        60000099 admin
//      plus project 20002000-... with default SI/VO approval chains.
//   2. v9-account-deletion-extend.sql must be applied so delete_my_account()
//      returns json with the blocked/pending shape.
//   3. Run: npm run test:e2e -- --grep @delete-account-smoke
//
// Login.tsx labels are not for=-linked to inputs, so we select by placeholder
// (stable per Phase 1 drawings.spec.ts / Phase 2 si-vo-smoke.spec.ts).
//
// NOTE: Test 1 permanently deletes the auth user. Re-running test 1 requires
// recreating the auth account via Supabase Studio (the seed-phase2.sql insert
// into auth.users is idempotent on (id) but Studio account creation is not).
// For repeatable local runs, point TEST_CLEAN_PHONE at a disposable phone.

const SUBCON_PHONE = process.env.TEST_SUBCON_PHONE || '60000001'
const MC_PHONE = process.env.TEST_MC_PHONE || '60000002'
const PM_PHONE = process.env.TEST_PM_PHONE || '60000003'
// Defaults to the admin persona because admin has no chain assignments and
// hence no in-flight approvals. Override TEST_CLEAN_PHONE to a disposable
// account if you want to keep the admin around between runs.
const CLEAN_PHONE = process.env.TEST_CLEAN_PHONE || '60000099'
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
  await page.context().clearCookies()
  await page.evaluate(() => {
    try { window.localStorage.clear() } catch { /* noop */ }
    try { window.sessionStorage.clear() } catch { /* noop */ }
  })
}

async function openDeleteSheet(page: Page) {
  await page.goto('/#/profile')
  // Two-step confirm: first tap "刪除帳號" on the Profile page, which opens
  // the modal carrying the irreversible-warning copy + final "確認刪除".
  await page.getByRole('button', { name: /刪除帳號/ }).first().click()
  await expect(page.getByText('確定刪除帳號？')).toBeVisible({ timeout: 5_000 })
}

test.describe('@delete-account-smoke', () => {
  test('clean user can delete account', async ({ page }) => {
    await loginAs(page, CLEAN_PHONE)
    await openDeleteSheet(page)

    // Capture the RPC response so we can assert ok:true even when the UI
    // races ahead to /login on success.
    const rpcPromise = page.waitForResponse(
      resp => resp.url().includes('/rest/v1/rpc/delete_my_account'),
      { timeout: 15_000 },
    )

    await page.getByRole('button', { name: /確認刪除/ }).click()
    const rpcResp = await rpcPromise
    expect(rpcResp.status()).toBe(200)
    const body = await rpcResp.json().catch(() => null)
    expect(body).toMatchObject({ ok: true })

    // After signOut() the AuthContext clears the session — ProtectedRoute
    // bounces to /login. Allow either /login or /home depending on routing
    // race, but assert the session is gone via the login form being visible.
    await page.waitForURL(/#\/login/, { timeout: 10_000 }).catch(() => {})
    await expect(page.getByPlaceholder('9123 4567')).toBeVisible({ timeout: 10_000 })
  })

  test('user with in-flight SI is blocked from deletion', async ({ page }) => {
    // 1. Subcon submits an SI so the default chain [main_contractor, pm]
    //    starts ticking with main_contractor as the current actor. That
    //    leaves an unresolved approval chain whose submitter (subcon) is
    //    counted by in_flight_approvals().
    await loginAs(page, SUBCON_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByRole('button', { name: /新增|提交|工地指令/ }).first().click()
    await page.getByPlaceholder(/標題/).fill('@delete-account-smoke 待處理 SI')
    await page.getByPlaceholder(/描述/).fill('刪除帳戶守衛測試 — 此 SI 故意不批准')
    await page.getByRole('button', { name: /^提交$/ }).click()

    const siNumberLocator = page.getByText(/SI-\d+/).first()
    await siNumberLocator.waitFor({ state: 'visible', timeout: 15_000 })

    // 2. Stay logged in as the subcon and try to delete. The pending SI
    //    means in_flight_approvals(uid) > 0 and the RPC must return
    //    { ok:false, blocked:true, pending:N }.
    await openDeleteSheet(page)

    const rpcPromise = page.waitForResponse(
      resp => resp.url().includes('/rest/v1/rpc/delete_my_account'),
      { timeout: 15_000 },
    )

    await page.getByRole('button', { name: /確認刪除/ }).click()
    const rpcResp = await rpcPromise
    expect(rpcResp.status()).toBe(200)
    const body = await rpcResp.json().catch(() => null) as
      | { ok?: boolean; blocked?: boolean; pending?: number; error?: string }
      | null
    expect(body?.ok).toBe(false)
    expect(body?.blocked).toBe(true)
    expect(body?.pending ?? 0).toBeGreaterThan(0)

    // 3. Blocked-deletion banner is rendered with the zh-HK guard copy.
    await expect(page.getByText('未能刪除帳戶')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/尚有.*項待處理嘅簽核工作/)).toBeVisible()

    // 4. Confirm button is replaced by the close-only banner — i.e. the
    //    irreversible "確認刪除" CTA is no longer reachable.
    await expect(page.getByRole('button', { name: /確認刪除/ })).toHaveCount(0)

    // 5. Session must still be valid — navigate back to profile and assert
    //    the user is still signed in.
    await page.getByRole('button', { name: /關閉/ }).click()
    await expect(page.getByText(/手機號碼/)).toBeVisible({ timeout: 5_000 })

    // 6. Cleanup: MC + PM approve the dangling SI so the seed fixture
    //    returns to a quiescent state for the next test run.
    await logout(page)
    await loginAs(page, MC_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByText(/SI-\d+/).first().click()
    await page.getByRole('button', { name: /^✓?\s*批准$/ }).first().click().catch(() => {})

    await logout(page)
    await loginAs(page, PM_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/si`)
    await page.getByText(/SI-\d+/).first().click()
    await page.getByRole('button', { name: /^✓?\s*批准$/ }).first().click().catch(() => {})
  })
})
