import { test, expect, Page } from '@playwright/test'

// @ptw-fire-watch-smoke — exercises the 30-min fire-watch close-out guard
// without sleeping 30 minutes inside Playwright.
//
// Flow:
//   1. Subcon submits a hot_work PTW (5 required checklist items + worker).
//   2. Safety officer signs.
//   3. Main contractor signs → status='active'.
//   4. Subcon clicks "開始 30 分鐘火警監察" so fire_watch_started_at = now().
//   5. Admin calls public.backdate_ptw_fire_watch(ptw_id, 31) so the
//      30-min server-side guard inside close_out_ptw considers elapsed.
//   6. Subcon clicks "關閉許可證", draws signature, RPC succeeds.
//   7. Status transitions to 'closed_out' (zh: 已完工).
//
// Pre-req:
//   1. tests/fixtures/seed-phase2.sql + seed-phase3.sql + seed-test-auth.sql
//      applied (same as @ptw-smoke).
//   2. supabase/v10-ptw-test-backdate-fire-watch.sql applied so
//      public.backdate_ptw_fire_watch(uuid, int) exists.
//   3. Env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (auto-loaded by
//      vite preview server; the test reads them off the page window).
//   4. Run: npm run test:e2e -- --grep @ptw-fire-watch-smoke
//
// NOTE: keeps PTW number across logins by capturing it from the list page.

const SUBCON_PHONE = process.env.TEST_SUBCON_PHONE || '60000001'
const MC_PHONE = process.env.TEST_MC_PHONE || '60000002'
const SAFETY_PHONE = process.env.TEST_SAFETY_PHONE || '60000004'
const ADMIN_PHONE = process.env.TEST_ADMIN_PHONE || '60000099'
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
  await page.goto('/#/login')
  await page.reload()
}

async function drawSignature(page: Page) {
  const canvas = page.locator('canvas[aria-label="簽名區"]').first()
  await canvas.waitFor({ state: 'visible', timeout: 5_000 })
  const box = await canvas.boundingBox()
  if (!box) throw new Error('signature canvas has no bounding box')
  const startX = box.x + box.width * 0.25
  const startY = box.y + box.height * 0.5
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + box.width * 0.5, startY + 10, { steps: 6 })
  await page.mouse.move(startX + box.width * 0.5, startY - 10, { steps: 6 })
  await page.mouse.up()
}

// Hardcoded Supabase project endpoints — taken from the running bundle so
// page.evaluate doesn't have to reach into import.meta (which is not
// serializable across the Playwright bridge). Overridable via env to keep
// the spec portable to other Supabase projects.
const SUPABASE_BASE = process.env.TEST_SUPABASE_URL ||
  'https://syyntodkvexkbpjrskjj.supabase.co'
const SUPABASE_API_KEY = process.env.TEST_SUPABASE_ANON_KEY ||
  'sb_publishable_BHKTjGCKkot6GVa2M6BCMQ_0qBAl1jP'

// Call the admin-only backdate RPC via raw PostgREST fetch using the
// admin session's access_token from localStorage. No Supabase client
// needed — keeps page.evaluate serializable.
async function backdateFireWatchAsAdmin(page: Page, ptwId: string, minutesAgo: number) {
  const result = await page.evaluate(
    async (args) => {
      const raw = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      let token = ''
      if (raw) {
        try {
          const session = JSON.parse(localStorage.getItem(raw) || '{}')
          token = session?.access_token || ''
        } catch { /* noop */ }
      }
      const resp = await fetch(args.base + '/rest/v1/rpc/backdate_ptw_fire_watch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'apikey': args.key,
          'authorization': 'Bearer ' + (token || args.key),
        },
        body: JSON.stringify({ p_ptw_id: args.ptwId, p_minutes_ago: args.minutesAgo }),
      })
      const bodyText = await resp.text()
      return { status: resp.status, body: bodyText }
    },
    { base: SUPABASE_BASE, key: SUPABASE_API_KEY, ptwId, minutesAgo },
  )
  if (result.status !== 200) {
    throw new Error('backdate_ptw_fire_watch failed: ' + result.status + ' ' + result.body)
  }
}

test.describe('@ptw-fire-watch-smoke', () => {
  test('hot_work PTW → fire-watch backdated → close_out succeeds', async ({ page }) => {
    test.setTimeout(180_000)

    // -------- 1. Subcon submits hot_work PTW --------
    await loginAs(page, SUBCON_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await page.getByRole('button', { name: /新增|工作許可證/ }).first().click()
    await page.getByRole('button', { name: /^動火$/ }).first().click()
    await page.getByPlaceholder(/工作範圍/).fill('@ptw-fire-watch-smoke 焊接')
    const requiredKeys = ['滅火器就位', '指定火警監察員', '11 米內無可燃物', '火花擋板', '通風良好']
    for (const key of requiredKeys) {
      await page.getByRole('button', { name: new RegExp(key) }).first().click()
    }
    await page.getByPlaceholder('工人姓名').first().fill('@ptw-fire-watch-smoke 工人A')
    await page.getByRole('button', { name: /^提交$/ }).click()

    const ptwNumberLocator = page.getByText(/PTW-\d+/).first()
    await ptwNumberLocator.waitFor({ state: 'visible', timeout: 15_000 })
    const ptwNumber = (await ptwNumberLocator.textContent())!.trim()
    expect(ptwNumber).toMatch(/PTW-\d+/)

    // -------- 2. Safety officer signs --------
    await logout(page)
    await loginAs(page, SAFETY_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await page.getByText(ptwNumber).first().click()
    await page.getByRole('button', { name: /簽署批准/ }).first().click()
    await drawSignature(page)
    await page.getByRole('button', { name: /確認簽名/ }).click()
    // Wait for the approval row to actually land — the "簽核紀錄 (1)"
    // counter reflects approvals.length, so it confirms submit_approval +
    // record_ptw_signoff completed before we logout (logout's page.goto
    // aborts in-flight fetches, so racing past this wait silently drops
    // the safety signature — see net::ERR_ABORTED in the trace).
    await expect(page.getByText(/簽核紀錄 \(1\)/).first()).toBeVisible({ timeout: 15_000 })

    // -------- 3. MC signs → active --------
    await logout(page)
    await loginAs(page, MC_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await page.getByText(ptwNumber).first().click()
    await page.getByRole('button', { name: /簽署批准/ }).first().click()
    await drawSignature(page)
    await page.getByRole('button', { name: /確認簽名/ }).click()
    // Same fence — wait for the chain to fully close (2 approvals + active
    // status) before logging out. Otherwise the MC signoff RPC can be
    // aborted by the logout's page.goto.
    await expect(page.getByText(/簽核紀錄 \(2\)/).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/生效中/).first()).toBeVisible({ timeout: 10_000 })

    // -------- 4. Subcon starts fire watch via UI, then admin backdates --------
    //
    // The "開始 30 分鐘火警監察" button now calls the SECURITY DEFINER RPC
    // start_ptw_fire_watch (v10-start-ptw-fire-watch.sql) — the prior
    // direct UPDATE was silently dropped by the draft-only UPDATE RLS
    // policy. Clicking the button here covers the real user path.
    // Admin then backdates the timestamp 31 minutes so close_out_ptw's
    // 30-min server-side guard considers it elapsed (skips real wait).
    await logout(page)
    await loginAs(page, SUBCON_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await page.getByText(ptwNumber).first().click()
    await page.waitForURL(/#\/project\/[^/]+\/ptw\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await page.getByRole('button', { name: /開始 30 分鐘火警監察/ }).click()
    // Countdown view shows once fire_watch_started_at is set.
    await expect(page.getByText(/還需 \d+ 分/).first()).toBeVisible({ timeout: 10_000 })

    const ptwId = page.url().match(/\/ptw\/([0-9a-f-]{36})/)![1]
    await logout(page)
    await loginAs(page, ADMIN_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await backdateFireWatchAsAdmin(page, ptwId, 31)

    // -------- 5. Subcon closes out --------
    await logout(page)
    await loginAs(page, SUBCON_PHONE)
    await page.goto(`/#/project/${PROJECT_ID}/ptw`)
    await page.getByText(ptwNumber).first().click()
    // After 31-min backdate the green "已完成" message shows on next render.
    await expect(page.getByText(/火警監察已完成/).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /關閉許可證/ }).click()
    await drawSignature(page)
    await page.getByRole('button', { name: /確認簽名/ }).click()

    // -------- 6. Status transitions to closed_out --------
    await expect(page.getByText(/已完工/).first()).toBeVisible({ timeout: 15_000 })
  })
})
