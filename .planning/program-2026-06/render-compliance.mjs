import { chromium } from 'playwright'

const src = 'file:///C:/Users/user/construction-app/.claude/worktrees/sweet-goldstine-e99977/.planning/program-2026-06/compliance-cert.html'
const out = 'C:/Users/user/Desktop/CK-DWSS-合規證明書.pdf'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(src, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: out,
  printBackground: true,
  preferCSSPageSize: true,
})
await browser.close()
console.log('PDF written:', out)
