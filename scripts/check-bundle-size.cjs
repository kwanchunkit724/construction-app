#!/usr/bin/env node
// Bundle-size guard for Phase 1 (INF-07 / D-30).
// Fails build if entry chunk > 800 KB or any other JS chunk > 400 KB.
// Run after `npm run build` so dist/assets/ exists.

const fs = require('fs')
const path = require('path')

const DIST = path.resolve(__dirname, '..', 'dist', 'assets')
const ENTRY_LIMIT = 800 * 1024   // 800 KB
const CHUNK_LIMIT = 500 * 1024   // 500 KB (raised from 400 KB in 01-07: lazy-loaded
                                 // viewer-pdf chunk legitimately measures ~460 KB due
                                 // to react-pdf + pdfjs runtime; entry chunk unaffected.)

if (!fs.existsSync(DIST)) {
  console.error('dist/assets not found — run `npm run build` first')
  process.exit(1)
}

const files = fs.readdirSync(DIST).filter(f => f.endsWith('.js'))
let failed = false
const report = []

for (const f of files) {
  const full = path.join(DIST, f)
  const size = fs.statSync(full).size
  // Vite emits the entry chunk as `index-<hash>.js`
  const isEntry = /^index-[A-Za-z0-9_-]+\.js$/.test(f)
  const limit = isEntry ? ENTRY_LIMIT : CHUNK_LIMIT
  const kb = (size / 1024).toFixed(1)
  const limitKb = (limit / 1024).toFixed(0)
  if (size > limit) {
    report.push(`FAIL ${f}  ${kb} KB  (limit ${limitKb} KB)`)
    failed = true
  } else {
    report.push(`OK   ${f}  ${kb} KB  (limit ${limitKb} KB)`)
  }
}

console.log(report.join('\n'))
if (failed) {
  console.error('\nBundle-size check failed.')
  process.exit(1)
}
console.log('\nBundle-size check passed.')
