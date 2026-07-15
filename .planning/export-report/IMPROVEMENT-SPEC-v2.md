# IMPROVEMENT-SPEC-v2 — 進度報告匯出 (Progress Report Export)

> Scope: `src/lib/export.ts` (`buildReportModel`, `exportProgressToPDF`, `exportProgressToExcel`, `exportPreset`) + `src/components/ExportProgressModal.tsx`.
> Reviewed by 5 personas (design / PM / non-tech owner / frontline foreman / office exporter). Every change below is grounded in a named pain point.

---

## 1. Problems (observed in the user's real exported PDF — treated as fact)

| # | Problem | Root cause in code | Personas |
|---|---------|--------------------|----------|
| P1 | A data row (02-07) is sliced in half by a black bar at the A4 page break | `exportProgressToPDF` rasterises the whole table with html2canvas, then slices by **raw pixel height** `pageHCanvasPx` with no row awareness (export.ts:438-451) | all 5 (blocker) |
| P2 | A wall of `0% / +0% / 未開始` rows buries the 2-3 that matter | `exportPreset('owner'/'internal')` ship `statuses:[...ALL_STATUSES], onlyBehind:false` (export.ts:128,133) | design/pm/nontech/frontline |
| P3 | No plain-language headline — boss can't read it in 10s | summary is 3 number-only KPI cards baked into the PNG (export.ts:358-374); no `追得上/落後咗` sentence, nothing copy-pasteable | nontech/frontline/design |
| P4 | 11 dense columns at 11px; `層級` repeats indent, `追蹤` shows cryptic `樓層 (0/19)`, monospace `編號` codes are dev IDs | unconditional columns in `zoneSections` (export.ts:376-405); tracking string at export.ts:218 | design/frontline/nontech |
| P5 | 業主版 and 內部版 are the **same** dense grid — only depth differs | `exportPreset` only changes row filters + depth (export.ts:125-134); one render path | design/nontech/pm |
| P6 | Unreadable on a 390px phone in WhatsApp | hardcoded `width:1100px` (export.ts:349) + forced `landscape a4` (export.ts:432) | frontline (blocker)/nontech |
| P7 | Delay context (notes) dropped from the shared PDF | `ItemRow.notes` collected (export.ts:221) and written to Excel, but no notes cell in the PDF table | pm/design |
| P8 | Can't tell which preset you're on; last-used raw opts silently restored | Preset buttons have no active state (modal:76-78); `loadPrefs` restores raw opts (modal:16-27) | exporter/pm |
| P9 | No row count / preview before a multi-second render | modal has 12+ controls, no `buildReportModel` count surfaced | exporter |
| P10 | PDF shares, Excel hides in Documents — same report, two paths | `exportProgressToPDF` → `shareOrDownloadBlob` (export.ts:453); `exportProgressToExcel` → `downloadBlob` (export.ts:339) | exporter |

---

## 2. Target design — **two audiences, one model, two render paths**

The central call from the persona conflict (PM wants detail, owner wants simplicity): **do not compromise into one middling layout.**

### 2.1 Owner one-pager (業主版) — "讀得明 in 10 秒"
A single A4 **portrait** page, no tree table:
1. **Headline banner** (largest type): `2座 — 整體 18%，落後計劃 6%，3 項要跟進` with a green ✓ / red ⚠ glyph. Readable as a WhatsApp thumbnail.
2. **整體 KPI strip**: 實際% / 計劃% / 差距 (本期 +Δ% once snapshots land — backlog #12).
3. **Per-zone horizontal bars**: one row per 分區 — zone name + a filled bar (實際) with a planned tick + `落後 N 項` badge. No codes, no 層級, no 追蹤, no ISO dates.
4. **需要關注 list**: only delayed/blocked/behind leaves, by **name**, with `負責` + one-line note. Capped (e.g. top 10), `其餘 M 項按計劃/未開始` as a count.
5. **Footer band** (repeated): 工程名 · 期數 · 資料截止日 · 製表人 · 第 X/Y 頁.

### 2.2 Internal detailed appendix (內部版)
Owner one-pager as **page 1**, then the full tree table rebuilt on **jspdf-autotable** (row-atomic breaks, repeated header, selectable text). Adds 編號 / 名稱(indented) / 實際% / 計劃% / 差距 / 狀態 / 說明(notes) / 負責 / 計劃完成. Floor progress shown as an inline `12/19樓` badge in 名稱, not a separate 追蹤/層級 column.

### 2.3 Owner-one-pager / appendix decision table
| Element | 業主版 | 內部版 |
|---|---|---|
| Headline banner | ✓ | ✓ |
| Per-zone bars | ✓ | ✓ (page 1) |
| 需關注 list | ✓ | ✓ |
| Full tree table | ✗ | ✓ (appendix) |
| 編號 / 層級 / 追蹤 cols | ✗ | 編號 only (層級/追蹤 dropped) |
| 說明 (notes) | inline in 需關注 | ✓ column |

---

## 3. Concrete code changes

### 3.1 `src/lib/export.ts`

**(a) Presets — kill the not-started wall (P2). Add an `audience` field (P5).**
```ts
export interface ExportProgressOptions {
  // …existing…
  audience: 'owner' | 'internal'   // NEW — selects render path
}
const NO_NOTSTARTED = ALL_STATUSES.filter(s => s !== 'not-started')
export function exportPreset(p, project): ExportProgressOptions {
  const zoneIds = project.zones.map(z => z.id)
  if (p === 'owner')     return { zoneIds, includeUnzoned:true, depth:2, statuses:NO_NOTSTARTED, onlyBehind:false, groupByZone:true, showSummary:true, showGap:true, reportPeriod:'', audience:'owner' }
  if (p === 'exception') return { …, statuses:['delayed','blocked'], onlyBehind:true, audience:'internal' }
  return { zoneIds, includeUnzoned:true, depth:3, statuses:NO_NOTSTARTED, onlyBehind:false, …, audience:'internal' } // internal: not-started demoted to a count
}
```

**(b) `buildReportModel` — expose a plain-language verdict + per-zone bar data + not-started count (P3, P2).**
```ts
interface ReportModel {
  summary: { …, notStarted: number,
    verdict: { tone:'ok'|'warn'|'bad'; line: string } }  // NEW
  // …
}
// after computing summary:
const tone = summary.behind > 0 ? 'bad' : summary.gap < -3 ? 'warn' : 'ok'
const verdict = {
  tone,
  line: `${project.name} — 整體 ${summary.actual}%，` +
        (summary.gap < 0 ? `落後計劃 ${-summary.gap}%` : '追得上計劃') +
        (summary.behind ? `，${summary.behind} 項要跟進` : '')
}
```
Also replace the cryptic tracking string (export.ts:218) — make it owner-readable and drop the standalone level concept:
```ts
tracking: it.tracking_mode === 'floors'
  ? `${it.floors_completed.length}/${it.floor_labels.length}樓`   // was 樓層 (0/19)
  : ''
```

**(c) `exportProgressToPDF` — split by `audience`; fix the slice bug (P1, P5, P6, P7).**
- Add `renderOwnerOnePager(doc, model)` that lays out §2.1 **directly in jsPDF** (portrait), using `ensureChineseFont(doc)` (already exists, export.ts:535) — no html2canvas, so nothing to slice.
- Replace the html2canvas raster + `while (yOffsetPx < canvas.height)` slice loop (export.ts:431-451) with **`autoTable`** for the appendix (the engine already used in `exportVOToPDF`, export.ts:627):
```ts
const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' })
await ensureChineseFont(doc)
renderOwnerOnePager(doc, model)                  // page 1 — both audiences
if (opts.audience === 'internal') {
  for (const z of model.zones) {
    doc.addPage()
    autoTable(doc, {
      head: [['編號','名稱','實際%','計劃%','差距','狀態','說明','負責','計劃完成']],
      body: z.rows.map(r => [r.code, '　'.repeat(r.depth)+r.title, r.eff.actual+'%',
              r.eff.planned+'%', (r.eff.gap>=0?'+':'')+r.eff.gap+'%',
              STATUS_PILL[r.eff.status].mark+PROGRESS_STATUS_ZH[r.eff.status],
              r.notes, r.assignee ?? '', r.end]),
      styles:{ font:'NotoHK', fontSize:9, cellPadding:4 },
      headStyles:{ fillColor:[249,115,22] },
      didDrawPage: (d) => drawFooterBand(doc, project, opts, d.pageNumber), // P-footer
      rowPageBreak:'avoid',   // ← row-atomic: NO more half-cut rows (P1)
    })
  }
}
```
`autoTable` repeats the header on every page, keeps rows whole (`rowPageBreak:'avoid'`), produces selectable text, and `didDrawPage` gives the repeated 第X/Y頁 footer. This **deletes the entire html2canvas slice path** that caused P1.

**(d) Plain-text share body (P3, P6).** Pass `model.summary.verdict.line` as the Share `text` so WhatsApp shows a readable sentence next to the file:
```ts
await shareOrDownloadBlob(blob, filename, model.summary.verdict.line)
```

**(e) `exportProgressToExcel` — headline + unify delivery (P3, P10).**
- Insert `model.summary.verdict.line` as Excel row 1 (before the existing 整體 line at export.ts:271).
- Route Excel through `shareOrDownloadBlob` (the PDF path) instead of `downloadBlob` (export.ts:339) so both formats share consistently.

### 3.2 `src/components/ExportProgressModal.tsx`

**(a) Preset active state + reset + default-to-preset (P8).**
```ts
const [activePreset, setActivePreset] = useState<'internal'|'owner'|'exception'|'custom'>('internal')
const applyPreset = (p) => { setOpts(exportPreset(p, project)); setActivePreset(p) }
const set = (patch) => { setOpts(o=>({...o,...patch})); setActivePreset('custom') } // any edit → 自訂
```
- `loadPrefs` (modal:16-27): **default to the named preset**, not silent raw opts. If keeping stickiness, render a dismissible line: `已套用上次設定（${presetName}）— 還原預設`.
- `<Preset>` gets an `active` prop (filled when selected); label shows `自訂（改自 業主版）` after an edit. Add a `還原範本` button.

**(b) Live scope counter (P9).** `useMemo(() => buildReportModel(project, items, opts).summary, [opts])` → render `將匯出 約 ${total} 項，其中落後 ${behind} 項` above the action buttons. Catches wrong-zone / onlyBehind-still-on **before** the render.

**(c) Audience-shaped primary buttons.** Make `業主版（一頁紙）` and `內部版（詳細）` the two big primary buttons that set `opts.audience` and fire export; demote zones/depth/status into a `進階` disclosure (addresses exporter's '12 controls' overwhelm + frontline's 'too many decisions'). Columns are decided by `audience`, not a new picker (per the design-vs-exporter conflict call).

---

## 4. Sequencing (do P1+P2+P3 first — biggest credibility + readability wins)
1. **Quick wins (S):** P2 preset edits (export.ts:128,133) · P3 headline banner + verdict in `buildReportModel` · P7 surface notes · P4 tracking string fix.
2. **Structural (L):** P1 rebuild appendix on `autoTable` (deletes slice loop) · P5/§2 owner one-pager render path.
3. **Flow (S–M):** P8 preset state + default-to-preset · P9 scope counter · P10 unify delivery.
4. **Later (needs migration):** period-over-period Δ via a weekly `actual_progress` snapshot table (PM blocker, backlog #12).

All changes preserve the existing `ExportProgressOptions`/`buildReportModel` contract (additive fields only) and reuse `ensureChineseFont` + `autoTable` already proven in `exportVOToPDF` — no new dependencies.

---

## 5. Prioritized backlog (from synthesis)

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 1 | Paginate PDF at row boundaries — rebuild detailed table on jspdf-autotable | high | L |
| 2 | Exception-first defaults: drop not-started from owner/internal presets | high | S |
| 3 | Two-audience output: 業主一頁紙 + 內部詳細附錄 | high | L |
| 4 | Plain-language headline banner (人話總結) | high | S |
| 5 | Phone-shaped narrow output + plain-text share message | high | M |
| 6 | Cut column overload + jargon (層級, 追蹤 '樓層(0/19)', codes) | med | M |
| 7 | Surface notes in PDF + 負責 column on behind rows | med | M |
| 8 | Preset visibility + active state + reset, default-to-preset | med | S |
| 9 | Pre-export live scope counter + estimated page count | med | M |
| 10 | Audit header/footer: 資料截止日, 製表人+角色, 期數, 第X/Y頁 | med | M |
| 11 | Unify delivery: Excel through shareOrDownloadBlob; confirmable filename | med | M |
| 12 | Period-over-period Δ (本期 +X%) via weekly actual% snapshot (new migration) | high | L |
| 13 | Collapse status chips + onlyBehind into one intent selector; 進階 disclosure | low | M |
| 14 | Distinguishable success/failure toasts instead of generic alert | low | S |
