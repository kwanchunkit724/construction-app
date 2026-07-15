// render-pdf.mjs — presentation.html -> presentation.pdf via Playwright chromium.
// The build-deck.mjs jsPDF path can't embed emoji/full-CJK (subset font misses glyphs),
// so the canonical PDF is a chromium print of the HTML (one landscape page per slide,
// backgrounds on). Run AFTER build-deck.mjs:  node .planning/sim-2026/render-pdf.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const htmlPath = path.join(DIR, 'presentation.html')
const pdfPath = path.join(DIR, 'presentation.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({
  path: pdfPath,
  landscape: true,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
})
await browser.close()

const { statSync } = await import('node:fs')
const kb = (statSync(pdfPath).size / 1024).toFixed(1)
console.log(`render-pdf: presentation.pdf  ${kb} KB`)
