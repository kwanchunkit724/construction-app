// build-deck.mjs — builds presentation.html + presentation.pdf + presentation.pptx
// from deck-content.json. Pure node (no pptxgenjs/jszip). ESM, 2-space, single quotes.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const OUT = __dirname

const deck = JSON.parse(fs.readFileSync(path.join(OUT, 'deck-content.json'), 'utf8'))
const slides = deck.slides || []

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
const PALETTE = {
  bg: '#0f172a',
  bg2: '#1e293b',
  accent: '#f97316',
  text: '#f8fafc',
  muted: '#94a3b8',
  line: '#334155'
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// 1) HTML — self-contained slide deck (PRIMARY deliverable)
// ---------------------------------------------------------------------------
function buildHtml() {
  const css = `
    :root{
      --bg:${PALETTE.bg};--bg2:${PALETTE.bg2};--accent:${PALETTE.accent};
      --text:${PALETTE.text};--muted:${PALETTE.muted};--line:${PALETTE.line};
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{
      font-family:'PingFang HK','Microsoft JhengHei','Heiti TC','Noto Sans CJK HK',sans-serif;
      background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;
    }
    .deck{display:block}
    section.slide{
      position:relative;min-height:100vh;width:100%;
      display:flex;flex-direction:column;justify-content:center;
      padding:6vh 8vw 14vh;scroll-snap-align:start;overflow:hidden;
      background:linear-gradient(135deg,var(--bg) 0%,var(--bg2) 100%);
      border-bottom:1px solid var(--line);
    }
    section.slide::before{
      content:'';position:absolute;top:0;left:0;width:10px;height:100%;
      background:var(--accent);opacity:.9;
    }
    .kicker{
      display:inline-block;font-size:clamp(.8rem,1.4vw,1.05rem);letter-spacing:.18em;
      text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:1.2rem;
    }
    h1.title{font-size:clamp(2rem,5.2vw,4.4rem);line-height:1.12;font-weight:800;letter-spacing:-.01em}
    h2.title{font-size:clamp(1.7rem,4vw,3.2rem);line-height:1.18;font-weight:800}
    .subtitle{font-size:clamp(1.05rem,2.2vw,1.7rem);color:var(--muted);margin-top:1rem;line-height:1.5;max-width:60ch}
    ul.bullets{list-style:none;margin-top:2.2rem;display:flex;flex-direction:column;gap:1rem;max-width:78ch}
    ul.bullets li{
      position:relative;padding-left:2rem;font-size:clamp(1rem,1.9vw,1.45rem);line-height:1.5;
    }
    ul.bullets li::before{
      content:'';position:absolute;left:0;top:.62em;width:.7rem;height:.7rem;border-radius:2px;
      background:var(--accent);transform:rotate(45deg);
    }
    /* cover */
    .slide.cover{justify-content:center;align-items:flex-start;text-align:left}
    .slide.cover h1.title{font-size:clamp(3rem,9vw,7rem);color:var(--text)}
    .slide.cover .subtitle{font-size:clamp(1.2rem,2.6vw,2rem);color:var(--accent);font-weight:600;max-width:50ch}
    /* section divider */
    .slide.section{justify-content:center;align-items:center;text-align:center;background:radial-gradient(circle at 50% 40%,var(--bg2),var(--bg))}
    .slide.section h2.title{font-size:clamp(2.4rem,6vw,5rem)}
    .slide.section .subtitle{margin-left:auto;margin-right:auto}
    .slide.section ul.bullets{align-items:center}
    .slide.section ul.bullets li{padding-left:0;color:var(--accent);font-weight:600}
    .slide.section ul.bullets li::before{display:none}
    /* stats */
    .slide.stats ul.bullets{margin-top:2.4rem;gap:1.4rem}
    .slide.stats ul.bullets li{
      padding:1rem 1.2rem 1rem 1.6rem;border:1px solid var(--line);border-left:4px solid var(--accent);
      border-radius:.75rem;background:rgba(255,255,255,.03);font-size:clamp(1.05rem,2vw,1.5rem);
    }
    .slide.stats ul.bullets li::before{display:none}
    /* closing */
    .slide.closing{justify-content:center;background:radial-gradient(circle at 30% 30%,var(--bg2),var(--bg))}
    .slide.closing h2.title{color:var(--accent)}
    /* notes footer */
    .notes{
      position:absolute;bottom:0;left:0;right:0;padding:1rem 8vw;
      font-size:clamp(.78rem,1.2vw,.95rem);color:var(--muted);line-height:1.45;
      border-top:1px solid var(--line);background:rgba(0,0,0,.25);
    }
    .notes b{color:var(--accent);font-weight:700;letter-spacing:.06em}
    .pageno{position:absolute;top:5vh;right:6vw;font-size:.9rem;color:var(--muted);letter-spacing:.1em}
    .hint{
      position:fixed;bottom:14px;right:16px;z-index:50;font-size:.8rem;color:var(--muted);
      background:rgba(15,23,42,.85);border:1px solid var(--line);border-radius:999px;
      padding:.4rem .9rem;backdrop-filter:blur(4px);
    }
    @media print{
      .hint{display:none}
      html,body{background:#fff}
      section.slide{
        min-height:auto;height:100vh;page-break-after:always;break-after:page;
        background:var(--bg)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;
      }
      section.slide:last-child{page-break-after:auto}
    }
    @page{size:landscape}
  `

  const body = slides.map((s, i) => {
    const kind = s.kind || 'feature'
    const titleTag = kind === 'cover' ? 'h1' : 'h2'
    const kicker = kind === 'cover' ? 'CK工程 · 地盤管理系統'
      : kind === 'section' ? '過場'
      : kind === 'stats' ? '數據'
      : kind === 'closing' ? '總結'
      : '功能'
    const kickerHtml = `<span class="kicker">${esc(kicker)}</span>`
    const subHtml = s.subtitle ? `<p class="subtitle">${esc(s.subtitle)}</p>` : ''
    const bullets = (s.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')
    const bulletsHtml = bullets ? `<ul class="bullets">${bullets}</ul>` : ''
    const notesHtml = s.notes ? `<div class="notes"><b>講者備註</b> · ${esc(s.notes)}</div>` : ''
    return `  <section class="slide ${esc(kind)}" id="slide-${i + 1}" tabindex="-1">
    <span class="pageno">${i + 1} / ${slides.length}</span>
    ${kickerHtml}
    <${titleTag} class="title">${esc(s.title || '')}</${titleTag}>
    ${subHtml}
    ${bulletsHtml}
    ${notesHtml}
  </section>`
  }).join('\n')

  const nav = `
  <script>
    (function(){
      var slides = Array.prototype.slice.call(document.querySelectorAll('section.slide'))
      function current(){
        var mid = window.scrollY + window.innerHeight/2
        var best = 0
        for(var i=0;i<slides.length;i++){ if(slides[i].offsetTop <= mid) best = i }
        return best
      }
      function go(n){
        n = Math.max(0, Math.min(slides.length-1, n))
        slides[n].scrollIntoView({behavior:'smooth',block:'start'})
      }
      document.addEventListener('keydown', function(e){
        if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){ e.preventDefault(); go(current()+1) }
        else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); go(current()-1) }
        else if(e.key==='Home'){ e.preventDefault(); go(0) }
        else if(e.key==='End'){ e.preventDefault(); go(slides.length-1) }
      })
    })()
  </script>`

  return `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title || 'CK工程')} — 簡報</title>
<style>${css}</style>
</head>
<body>
<main class="deck">
${body}
</main>
<div class="hint">← → 切換 · 按 P 列印</div>
${nav}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// 2) PDF — jsPDF, one landscape page per slide, CJK via subset font
// ---------------------------------------------------------------------------
function buildPdf() {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // load CJK subset font
  let hasFont = false
  try {
    const ttf = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'noto-sans-hk-subset.ttf'))
    const b64 = ttf.toString('base64')
    doc.addFileToVFS('NotoHK.ttf', b64)
    doc.addFont('NotoHK.ttf', 'NotoHK', 'normal')
    hasFont = true
  } catch (e) {
    console.warn('PDF: CJK font not loaded, falling back to helvetica —', e.message)
  }
  const FONT = hasFont ? 'NotoHK' : 'helvetica'
  doc.setFont(FONT, 'normal')

  const MX = 48
  const slate = [15, 23, 42]
  const slate2 = [30, 41, 59]
  const orange = [249, 115, 22]
  const white = [248, 250, 252]
  const muted = [148, 163, 184]

  // naive CJK-aware wrap: jsPDF splitTextToSize handles latin; for mixed CJK we
  // break greedily by measured width per char.
  function wrap(text, maxW, size) {
    doc.setFontSize(size)
    const words = String(text).split(/(\s+)/)
    const lines = []
    let cur = ''
    for (const w of words) {
      const test = cur + w
      if (doc.getTextWidth(test) <= maxW || cur === '') {
        // still might overflow on a single long CJK run — break by char
        if (doc.getTextWidth(test) <= maxW) { cur = test; continue }
      }
      // overflow: flush then char-break the word
      if (cur) { lines.push(cur); cur = '' }
      let chunk = ''
      for (const ch of w) {
        if (doc.getTextWidth(chunk + ch) > maxW && chunk) { lines.push(chunk); chunk = ch }
        else chunk += ch
      }
      cur = chunk
    }
    if (cur) lines.push(cur)
    return lines.map(l => l.replace(/\s+$/,'')).filter((l, idx, a) => !(l === '' && idx === a.length - 1))
  }

  slides.forEach((s, i) => {
    if (i > 0) doc.addPage('a4', 'landscape')
    const kind = s.kind || 'feature'

    // background
    const bg = (kind === 'section' || kind === 'closing') ? slate2 : slate
    doc.setFillColor(bg[0], bg[1], bg[2])
    doc.rect(0, 0, pageW, pageH, 'F')
    // accent bar
    doc.setFillColor(orange[0], orange[1], orange[2])
    doc.rect(0, 0, 10, pageH, 'F')

    let y = 70
    // kicker
    const kicker = kind === 'cover' ? 'CK工程 · 地盤管理系統'
      : kind === 'section' ? '過場'
      : kind === 'stats' ? '數據'
      : kind === 'closing' ? '總結'
      : '功能'
    doc.setFont(FONT, 'normal'); doc.setFontSize(11)
    doc.setTextColor(orange[0], orange[1], orange[2])
    doc.text(kicker, MX, y)
    // page number
    doc.setTextColor(muted[0], muted[1], muted[2])
    doc.text(`${i + 1} / ${slides.length}`, pageW - MX, y, { align: 'right' })
    y += 30

    // title
    const titleSize = kind === 'cover' ? 40 : (kind === 'section' || kind === 'closing') ? 34 : 26
    doc.setTextColor(white[0], white[1], white[2])
    const titleLines = wrap(s.title || '', pageW - MX * 2, titleSize)
    doc.setFontSize(titleSize)
    for (const line of titleLines) { y += titleSize * 1.15; doc.text(line, MX, y) }

    // subtitle
    if (s.subtitle) {
      y += 18
      const subSize = 15
      doc.setFontSize(subSize)
      doc.setTextColor(muted[0], muted[1], muted[2])
      const subLines = wrap(s.subtitle, pageW - MX * 2, subSize)
      for (const line of subLines) { y += subSize * 1.3; doc.text(line, MX, y) }
    }

    // bullets
    y += 24
    const bSize = 13
    doc.setFontSize(bSize)
    const notesReserve = s.notes ? 86 : 24
    for (const b of (s.bullets || [])) {
      const lines = wrap(b, pageW - MX * 2 - 18, bSize)
      // diamond marker
      const my = y + bSize * 0.9
      doc.setFillColor(orange[0], orange[1], orange[2])
      doc.triangle(MX, my, MX + 7, my - 4, MX + 7, my + 4, 'F')
      doc.setTextColor(white[0], white[1], white[2])
      lines.forEach((line, li) => {
        y += bSize * 1.35
        doc.text(line, MX + 16, y)
      })
      y += 6
      if (y > pageH - notesReserve - 30) break // guard against overflow
    }

    // notes footer
    if (s.notes) {
      const ny = pageH - 70
      doc.setDrawColor(51, 65, 85)
      doc.setLineWidth(0.5)
      doc.line(MX, ny - 12, pageW - MX, ny - 12)
      doc.setFontSize(9)
      doc.setTextColor(muted[0], muted[1], muted[2])
      const nLines = wrap('講者備註 · ' + s.notes, pageW - MX * 2, 9).slice(0, 4)
      let nyy = ny
      for (const line of nLines) { doc.text(line, MX, nyy); nyy += 12 }
    }
  })

  const buf = Buffer.from(doc.output('arraybuffer'))
  return buf
}

// ---------------------------------------------------------------------------
// 3) PPTX — pure-node OOXML + hand-rolled STORE-method ZIP
// ---------------------------------------------------------------------------

// CRC-32 (standard polynomial 0xEDB88320), table-driven
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// Build a ZIP using STORE (method 0, no compression). Returns Buffer.
function zipStore(entries) {
  const localChunks = []
  const central = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const data = e.data
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)   // local file header sig
    lh.writeUInt16LE(20, 4)           // version needed
    lh.writeUInt16LE(0x0800, 6)       // flags: bit 11 = UTF-8 names
    lh.writeUInt16LE(0, 8)            // method 0 = store
    lh.writeUInt16LE(0, 10)           // mod time
    lh.writeUInt16LE(0x21, 12)        // mod date (arbitrary valid)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18) // compressed size
    lh.writeUInt32LE(data.length, 22) // uncompressed size
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)           // extra len
    localChunks.push(lh, nameBuf, data)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)   // central dir sig
    ch.writeUInt16LE(20, 4)           // version made by
    ch.writeUInt16LE(20, 6)           // version needed
    ch.writeUInt16LE(0x0800, 8)       // flags UTF-8
    ch.writeUInt16LE(0, 10)           // method
    ch.writeUInt16LE(0, 12)           // time
    ch.writeUInt16LE(0x21, 14)        // date
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)           // extra len
    ch.writeUInt16LE(0, 32)           // comment len
    ch.writeUInt16LE(0, 34)           // disk number
    ch.writeUInt16LE(0, 36)           // internal attrs
    ch.writeUInt32LE(0, 38)           // external attrs
    ch.writeUInt32LE(offset, 42)      // local header offset
    central.push(Buffer.concat([ch, nameBuf]))

    offset += lh.length + nameBuf.length + data.length
  }

  const centralBuf = Buffer.concat(central)
  const localBuf = Buffer.concat(localChunks)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)         // EOCD sig
  eocd.writeUInt16LE(0, 4)                  // disk
  eocd.writeUInt16LE(0, 6)                  // disk w/ central
  eocd.writeUInt16LE(entries.length, 8)     // entries on disk
  eocd.writeUInt16LE(entries.length, 10)    // total entries
  eocd.writeUInt32LE(centralBuf.length, 12) // central size
  eocd.writeUInt32LE(localBuf.length, 16)   // central offset
  eocd.writeUInt16LE(0, 20)                 // comment len

  return Buffer.concat([localBuf, centralBuf, eocd])
}

function pxToEmu(px) { return Math.round(px * 9525) }
// slide is 13.333in x 7.5in (16:9) -> EMU
const SLIDE_W = 12192000
const SLIDE_H = 6858000

function pptxEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function slideXml(s) {
  const kind = s.kind || 'feature'
  const titlePx = kind === 'cover' ? 4400 : (kind === 'section' || kind === 'closing') ? 3600 : 2800
  const titleColor = (kind === 'closing') ? 'F97316' : 'F8FAFC'

  // body paragraphs: subtitle (orange) + bullets (white)
  const paras = []
  if (s.subtitle) {
    paras.push(
      `<a:p><a:pPr><a:buNone/></a:pPr>` +
      `<a:r><a:rPr lang="zh-HK" sz="1600" b="1"><a:solidFill><a:srgbClr val="F97316"/></a:solidFill></a:rPr>` +
      `<a:t>${pptxEscape(s.subtitle)}</a:t></a:r></a:p>`
    )
    paras.push(`<a:p><a:pPr><a:buNone/></a:pPr><a:endParaRPr lang="zh-HK" sz="600"/></a:p>`)
  }
  for (const b of (s.bullets || [])) {
    paras.push(
      `<a:p>` +
      `<a:pPr marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>` +
      `<a:r><a:rPr lang="zh-HK" sz="1400"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:rPr>` +
      `<a:t>${pptxEscape(b)}</a:t></a:r></a:p>`
    )
  }
  if (s.notes) {
    paras.push(`<a:p><a:pPr><a:buNone/></a:pPr><a:endParaRPr lang="zh-HK" sz="600"/></a:p>`)
    paras.push(
      `<a:p><a:pPr><a:buNone/></a:pPr>` +
      `<a:r><a:rPr lang="zh-HK" sz="1000" i="1"><a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill></a:rPr>` +
      `<a:t>${pptxEscape('講者備註 · ' + s.notes)}</a:t></a:r></a:p>`
    )
  }
  if (paras.length === 0) paras.push(`<a:p><a:endParaRPr lang="zh-HK"/></a:p>`)

  const titleX = pxToEmu(48)
  const titleY = pxToEmu(40)
  const titleW = SLIDE_W - pxToEmu(96)
  const titleH = pxToEmu(120)
  const bodyX = pxToEmu(48)
  const bodyY = pxToEmu(170)
  const bodyW = SLIDE_W - pxToEmu(96)
  const bodyH = SLIDE_H - pxToEmu(210)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${SLIDE_W}" cy="${SLIDE_H}"/><a:chOff x="0" y="0"/><a:chExt cx="${SLIDE_W}" cy="${SLIDE_H}"/></a:xfrm></p:grpSpPr>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="AccentBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${pxToEmu(12)}" cy="${SLIDE_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="F97316"/></a:solidFill></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-HK"/></a:p></p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="3" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${titleX}" y="${titleY}"/><a:ext cx="${titleW}" cy="${titleH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody>
<a:bodyPr anchor="t" wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>
<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:rPr lang="zh-HK" sz="${titlePx}" b="1"><a:solidFill><a:srgbClr val="${titleColor}"/></a:solidFill></a:rPr><a:t>${pptxEscape(s.title || '')}</a:t></a:r></a:p>
</p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="4" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${bodyX}" y="${bodyY}"/><a:ext cx="${bodyW}" cy="${bodyH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody>
<a:bodyPr anchor="t" wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>
${paras.join('\n')}
</p:txBody>
</p:sp>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`
}

function buildPptx() {
  const n = slides.length
  const sldIds = slides.map((_, i) => i + 1)

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${sldIds.map(i => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n')}
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`

  // presentation rels: master, slides, presProps, theme
  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${sldIds.map(i => `<Relationship Id="rId${i + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`).join('\n')}
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`

  const sldIdList = sldIds.map((i, idx) => `<p:sldId id="${256 + idx}" r:id="rId${i + 10}"/>`).join('')
  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>${sldIdList}</p:sldIdLst>
<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="screen16x9"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`

  const presProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`

  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CK">
<a:themeElements>
<a:clrScheme name="CK">
<a:dk1><a:srgbClr val="0F172A"/></a:dk1>
<a:lt1><a:srgbClr val="F8FAFC"/></a:lt1>
<a:dk2><a:srgbClr val="1E293B"/></a:dk2>
<a:lt2><a:srgbClr val="E2E8F0"/></a:lt2>
<a:accent1><a:srgbClr val="F97316"/></a:accent1>
<a:accent2><a:srgbClr val="FB923C"/></a:accent2>
<a:accent3><a:srgbClr val="94A3B8"/></a:accent3>
<a:accent4><a:srgbClr val="334155"/></a:accent4>
<a:accent5><a:srgbClr val="64748B"/></a:accent5>
<a:accent6><a:srgbClr val="CBD5E1"/></a:accent6>
<a:hlink><a:srgbClr val="F97316"/></a:hlink>
<a:folHlink><a:srgbClr val="FB923C"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="CK">
<a:majorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang HK"/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Arial"/><a:ea typeface="PingFang HK"/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="CK">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`

  const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Title Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${pxToEmu(48)}" y="${pxToEmu(40)}"/><a:ext cx="${SLIDE_W - pxToEmu(96)}" cy="${pxToEmu(120)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-HK"/><a:t>標題</a:t></a:r></a:p></p:txBody>
</p:sp>
<p:sp>
<p:nvSpPr><p:cNvPr id="3" name="Body Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="${pxToEmu(48)}" y="${pxToEmu(170)}"/><a:ext cx="${SLIDE_W - pxToEmu(96)}" cy="${SLIDE_H - pxToEmu(210)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-HK"/><a:t>內容</a:t></a:r></a:p></p:txBody>
</p:sp>
</p:spTree>
</p:cSld>
<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
<p:txStyles>
<p:titleStyle><a:lvl1pPr><a:defRPr sz="2800" b="1"><a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="PingFang HK"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="PingFang HK"/></a:defRPr></a:lvl1pPr></p:bodyStyle>
<p:otherStyle/>
</p:txStyles>
</p:sldMaster>`

  const slideMasterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`

  const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank">
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`

  const slideLayoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`

  function slideRels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  }

  const entries = []
  const add = (name, str) => entries.push({ name, data: Buffer.from(str, 'utf8') })

  add('[Content_Types].xml', contentTypes)
  add('_rels/.rels', rootRels)
  add('ppt/presentation.xml', presentation)
  add('ppt/_rels/presentation.xml.rels', presRels)
  add('ppt/presProps.xml', presProps)
  add('ppt/theme/theme1.xml', theme)
  add('ppt/slideMasters/slideMaster1.xml', slideMaster)
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRels)
  add('ppt/slideLayouts/slideLayout1.xml', slideLayout)
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRels)
  slides.forEach((s, i) => {
    add(`ppt/slides/slide${i + 1}.xml`, slideXml(s))
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRels())
  })

  return zipStore(entries)
}

// ---------------------------------------------------------------------------
// Self-validate a STORE zip by reparsing the central directory
// ---------------------------------------------------------------------------
function validateZip(buf) {
  // find EOCD (scan from end)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('EOCD not found')
  const total = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOff = buf.readUInt32LE(eocd + 16)
  const names = []
  let p = cdOff
  for (let e = 0; e < total; e++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central dir sig at entry ' + e)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const cmtLen = buf.readUInt16LE(p + 32)
    const storedCrc = buf.readUInt32LE(p + 16)
    const sizeU = buf.readUInt32LE(p + 24)
    const lho = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    // verify local header + CRC of stored data
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error('bad local header sig for ' + name)
    const lNameLen = buf.readUInt16LE(lho + 26)
    const lExtra = buf.readUInt16LE(lho + 28)
    const dataStart = lho + 30 + lNameLen + lExtra
    const data = buf.subarray(dataStart, dataStart + sizeU)
    if (crc32(data) !== storedCrc) throw new Error('CRC mismatch for ' + name)
    names.push(name)
    p += 46 + nameLen + extraLen + cmtLen
  }
  return { total, cdSize, cdOff, names }
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
function fmtKB(bytes) { return (bytes / 1024).toFixed(1) + ' KB' }

console.log(`build-deck: ${slides.length} slides from deck-content.json`)

// HTML
const html = buildHtml()
const htmlPath = path.join(OUT, 'presentation.html')
fs.writeFileSync(htmlPath, html, 'utf8')
const htmlSize = fs.statSync(htmlPath).size
console.log(`  presentation.html  ${fmtKB(htmlSize)}  (${htmlSize} bytes)`)

// PDF
let pdfSize = 0
try {
  const pdf = buildPdf()
  const pdfPath = path.join(OUT, 'presentation.pdf')
  fs.writeFileSync(pdfPath, pdf)
  pdfSize = fs.statSync(pdfPath).size
  console.log(`  presentation.pdf   ${fmtKB(pdfSize)}  (${pdfSize} bytes)`)
} catch (e) {
  console.error('  presentation.pdf  FAILED:', e.message)
}

// PPTX
let pptxSize = 0
let pptxOk = false
let pptxNames = []
try {
  const pptx = buildPptx()
  const pptxPath = path.join(OUT, 'presentation.pptx')
  fs.writeFileSync(pptxPath, pptx)
  pptxSize = fs.statSync(pptxPath).size
  const v = validateZip(fs.readFileSync(pptxPath))
  pptxOk = true
  pptxNames = v.names
  console.log(`  presentation.pptx  ${fmtKB(pptxSize)}  (${pptxSize} bytes)`)
  console.log(`  pptx self-validate OK: ${v.total} zip entries, central dir @${v.cdOff} (${v.cdSize} bytes), all CRC-32 verified`)
} catch (e) {
  console.error('  presentation.pptx  UNRELIABLE:', e.message)
}

console.log('done.')
