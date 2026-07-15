// Render a branded social HTML card to a crisp PNG (Playwright headless).
// Usage: node scripts/render-cover.mjs <out> <url> <selector> <w> <h>
import { chromium } from 'playwright'

const OUT = process.argv[2] || 'public/marketing/fb-cover.png'
const URL = process.argv[3] || 'http://localhost:5173/marketing/fb-cover.html'
const SEL = process.argv[4] || '.cover'
const W = Number(process.argv[5] || 1640)
const H = Number(process.argv[6] || 624)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000) // let webfonts settle
const el = await page.$(SEL)
await el.screenshot({ path: OUT })
await browser.close()
console.log('WROTE', OUT)
