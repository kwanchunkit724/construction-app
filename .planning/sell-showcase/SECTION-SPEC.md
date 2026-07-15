# SECTION-SPEC.md — /sell 產品實況截圖區（Section 10：Screenshots）

> Lead decision summary (conflicts resolved):
> 1. **One project, one name.** The DATA lens project「將軍澳日出康城第十一期住宅項目 — L1座」is the single source of truth for every screenshot. The existing `PhoneMock` in the hero uses a different placeholder header (`DC2026 油塘住宅`) — that is the *hero* mock and stays as-is. This new section uses a **short, consistent header label「日出康城 L1座」** on every framed shot so all 11 captures read as the same live site (完整性). The SALES intro copy is updated to match this project (it previously said「DC2026 油塘住宅」).
> 2. **Order = lifecycle (kickoff→completion).** Follows the SALES `orderedFeatures` order, lightly reconciled with real routes/roles from the code. Progress → Dashboard → Issues → SI → VO → PTW → Daily → Materials → Export. Timetable + Contacts demoted to the chip strip (they are "tools", lower sales priority) per the DESIGN `layoutConcept`.
> 3. **DESIGN `layoutConcept` had a duplicate/sacrificial injection** ("DUPLICATE-SACRIFICIAL-IGNORE") — ignored. Clean alternating phone+text concept used.
> 4. Reuse `Sell.tsx`'s existing `Section`, `GRID_LIGHT`, `HAZARD`, and the `PhoneMock` bezel verbatim. New section is **light tone** so orange chrome pops, slotted **between `<Trust />` and `<LeadCapture />`** in `Sell.tsx`'s component list.

---

## 1. Section narrative

This is the proof section. Every other section *tells* (pain, ROI, compare); this one *shows*. The promise: **"一個真實運作緊嘅地盤，由開工睇到完工，全部喺一個 app 入面。"** A prospect scrolls a coherent case study of ONE 45-storey HK residential site — 判頭叫料、工程師寫日誌、工地主任追進度、PM 出報告畀業主 — and every frame is visibly the same project. Each function gets a 3-line story: **what it is / how it works / why it matters in a dispute**, with the device frame proving it's a live system, not slideware.

### Heading + intro (zh-HK)

- **Kicker (mono):** `睇真啲 · 同一個地盤`
- **Section number:** `10`
- **Title (font-heading):** `一個 demo 地盤，由開工睇到完工`
- **Intro paragraph:**
  > 以下每一張截圖，全部嚟自同一個真實地盤「將軍澳日出康城第十一期 L1座」。由判頭叫料、工程師寫日誌、工地主任追進度、到 PM 出報告畀業主 —— 你會見到成個地盤點樣喺一個系統入面運作，每一個動作都有時間戳同簽名，出 dispute 嗰時唔使再靠記性同翻 WhatsApp。
- **Same-project pill (under intro):** `📍 同一個項目：將軍澳日出康城第十一期 L1座 · 總承建商 俊建工程 · 整體進度 51%`

---

## 2. Ordered feature list with final caption copy

Captions are tightened from the SALES lens and aligned to what each REAL screen actually shows (verified against `ProjectDetail.tsx`, `Dashboard.tsx`, `SiList.tsx`, `VoList.tsx`, `PtwList.tsx`). Each entry: drawing-no `n`, lucide `icon`, what (heading) / how (body) / why (orange callout).

| n | icon | featureKey | what (heading) | how (body) | why (orange callout) |
|---|------|-----------|----------------|------------|----------------------|
| `10.1` | `ListChecks` | progress-tree | 成個地盤進度，一眼睇晒 | 大項／中項／細項三層分管每一區工程，最底層一打勾，上面自動匯總百分比同狀態。落後幾多、邊區紅咗，一打開就知。 | 工地主任唔使再逐個 foreman 問「做到邊」；planned vs actual 嘅差距，未變 dispute 之前就睇得到。 |
| `10.2` | `LayoutDashboard` | dashboard | PM 唔使落地盤都知盤數 | 儀表板即時顯示每個地盤嘅整體進度、落後工地、處理中問題，仲有實時動態 feed。 | 老總同 PM 一眼掃晒幾個盤嘅健康狀況，唔使等開會先發現甩漏。 |
| `10.3` | `AlertCircle` | issues | 問題唔會再沉底，一層一層有人接 | 報問題影相即傳，跟住固定上呈鏈：判頭工人→判頭→總承建商→PM，每一步邊個接、邊個解決全部記低。 | 冇人「睇漏咗」，每個問題都有完整活動記錄；爭拗嗰時保護到工地主任。 |
| `10.4` | `FileText` | si | 工地指令版本鎖死，改過咩一目了然 | SI 工地指令逐版簽核、版本對比，附圖則版本、現場相、GPS。指令鎖定後可一鍵轉做變更指令。 | 判頭憑紀錄證明主判幾時叫佢做咩 —— 出 dispute 時唔使翻舊 WhatsApp，呢個就係講數嘅底。 |
| `10.5` | `Receipt` | vo | 變更指令金額，系統幫你計到一蚊都唔差 | VO 逐項填數量、單價、類別，總額由系統核算（HKD），唔靠人手 Excel 加數。批核完一鍵出 PDF。 | 唔會再為加數嗌交；業主簽咗嘅 PDF，就係令判頭收到額外工程錢嘅文件。 |
| `10.6` | `Shield` | ptw | 動火高空吊運，安全主任電子簽核 | PTW 涵蓋動火、高空、吊運等高風險工序，附安全核對清單同工人名單，由安全主任逐步簽。生效時出 QR 俾人巡查掃描。 | 動火仲有 30 分鐘火警監察計時 —— 出事或勞工處巡查時，呢張簽咗名嘅許可證保護到每一個人。 |
| `10.7` | `BookOpen` | daily-log | 30 秒填好今日日誌，過咗今日就鎖 | 管工／工程師揀天氣、剔返今日做咗嘅進度項目、寫低備註就交。日誌按香港時間鎖定，尋日改唔到。 | 呢份每日記錄就係撐起 delay claim / EOT 嘅同期證據 —— 紙簿會濕會跌，呢個唔會。 |
| `10.8` | `Package` | materials | 叫料即通知老總，逾期自動標紅 | 判頭喺手機落單叫料，撳「急件」即時推送。系統追預計到貨同入貨進度，過咗期未到自動標逾期，仲可連結返對應進度項目。 | 判頭知道咩叫咗、咩逾期、阻住邊項工 —— 唔使等到最後一刻先發現啲鐵冇到。 |
| `10.9` | `FileDown` | export-progress | 一鍵出報告，業主版／內部版自動分流 | 揀「業主版一頁紙」、「內部版詳細」或「例外版（只睇落後）」，出 PDF 或 Excel 前有即時範圍預覽，再一鍵分享去 WhatsApp／email。 | 同一份團隊日日用嘅資料，一撳就變成交上去嘅文件 —— 唔使再人手砌報告。 |

### Chip strip (leftover functions, below the 9 rows)

> 仲有更多：`每日日誌已展示` → 改為 chip strip 顯示未出現的 4 個：
**`行事曆（統一時間表）` · `聯絡人（行頭通訊錄）` · `圖則 PDF 版本管理` · `進度更新歷史`**

Caption above chips: `同一個地盤，仲有成套工具喺度`

> Note: daily-log IS shown as 10.7, so it is NOT in the chip strip. The chip strip carries timetable, contacts, drawings, progress-history — features that still have full capture entries (timetable + contacts are captured so the chips can deep-link to real shots in a future expansion, but in THIS section they render as static chips only).

---

## 3. Visual / layout design (consistent with Sell.tsx)

### Placement
Insert a new `<Screenshots />` component into `SellPage()` between `<Trust />` and `<LeadCapture />`:

```
<Trust />
<Screenshots />      {/* NEW — Section n="10" */}
<LeadCapture />
```

This shifts `LeadCapture`'s hard-coded `09` number visually, but `LeadCapture` keeps its own `09` literal — **lead decision: renumber LeadCapture's inline `09`→`11` and CloseCta stays unnumbered**, OR keep Screenshots as `10` and leave LeadCapture `09`. Recommended: keep LeadCapture at `09` (it's the conversion section, deserves a low memorable number) and number Screenshots `10`. Section numbers are decorative, not strictly sequential — Pain=01…Trust=08, LeadCapture=09, Screenshots=10. Acceptable.

### Tone & reused primitives
- Light section: `<Section n="10" tone="light" kicker="睇真啲 · 同一個地盤" title="一個 demo 地盤，由開工睇到完工">`. Inherits `GRID_LIGHT`, `max-w-6xl`, `py-16 md:py-24`, mono kicker, `font-heading` title — all from the existing `Section` component. **No new Section variant needed.**
- **Bezel verbatim from `PhoneMock`:** `rounded-[2.4rem] border-[10px] border-site-800 bg-site-800 shadow-2xl ring-1 ring-white/10`, with the orange glow `bg-safety-500/20 blur-2xl` behind it.
- **Orange header is JSX, not part of the image** — identical on every frame, proving same project:
  `bg-gradient-to-r from-safety-500 to-safety-600` + white `CK` chip + `日出康城 L1座` label. (Matches the hero PhoneMock header pattern exactly, only the label text differs.)
- **Screenshot goes inside** a `bg-white aspect-[9/19] overflow-hidden` box, `<img object-cover object-top>` so portrait phone shots crop cleanly to the bezel.

### Caption block (beside phone, never overlaid)
- `DrawingNo`: mono `{n}` `text-xs font-bold text-safety-500 tracking-widest` + `h-px w-8 bg-safety-500` rule + the lucide `{icon}` in safety-500.
- Heading: `font-heading font-bold text-xl md:text-2xl text-site-900`.
- How line: `mt-3 text-sm text-site-600 leading-relaxed`.
- Why callout: `mt-3 rounded-lg bg-safety-50 ring-1 ring-safety-100 px-3 py-2 text-sm font-medium text-safety-700`.

### Responsive
- **Desktop md+:** `grid md:grid-cols-2 gap-10 md:gap-12 items-center`. Alternate sides on odd rows via `md:[&>div:first-child]:order-2`. Phone ~260–280px (matches hero `w-[264px]`), justified to the inner edge. Text `max-w-md`.
- **Mobile 390px:** single column, **phone on top then text** (flip is md-only). Phone ~240px centered, text full width. `space-y-16` rhythm, `px-5` gutters (Section already provides). Phones width-capped + fixed-aspect box ⇒ no horizontal scroll.

### JSX structure sketch

```tsx
// Insert in Sell.tsx, between Trust and LeadCapture.
// Icons to add to the existing lucide-react import:
//   ListChecks, AlertCircle, FileText, Receipt, Shield, BookOpen, Package, FileDown
//   (LayoutDashboard, ShieldCheck already imported)

const SHOTS = [
  { n: '10.1', icon: ListChecks,     img: '/marketing/shot-progress-tree.png', what: '成個地盤進度，一眼睇晒',          how: '大項／中項／細項三層分管每一區工程…', why: '工地主任唔使逐個 foreman 問「做到邊」…' },
  { n: '10.2', icon: LayoutDashboard, img: '/marketing/shot-dashboard.png',     what: 'PM 唔使落地盤都知盤數',          how: '儀表板即時顯示每個地盤嘅整體進度…',     why: '老總同 PM 一眼掃晒幾個盤嘅健康狀況…' },
  { n: '10.3', icon: AlertCircle,    img: '/marketing/shot-issues.png',        what: '問題唔會再沉底，一層一層有人接', how: '報問題影相即傳，跟住固定上呈鏈…',       why: '冇人「睇漏咗」，每個問題都有完整記錄…' },
  { n: '10.4', icon: FileText,       img: '/marketing/shot-si.png',            what: '工地指令版本鎖死，改過咩一目了然', how: 'SI 逐版簽核、版本對比…',               why: '判頭憑紀錄證明主判幾時叫佢做咩…' },
  { n: '10.5', icon: Receipt,        img: '/marketing/shot-vo.png',            what: '變更指令金額，系統幫你計到一蚊都唔差', how: 'VO 逐項填數量、單價…總額由系統核算…', why: '唔會再為加數嗌交；業主簽咗嘅 PDF…' },
  { n: '10.6', icon: Shield,         img: '/marketing/shot-ptw.png',           what: '動火高空吊運，安全主任電子簽核', how: 'PTW 附安全核對清單同工人名單…',         why: '動火有 30 分鐘火警監察計時…' },
  { n: '10.7', icon: BookOpen,       img: '/marketing/shot-daily.png',         what: '30 秒填好今日日誌，過咗今日就鎖', how: '揀天氣、剔返今日做咗嘅進度項目…',       why: '撐起 delay claim / EOT 嘅同期證據…' },
  { n: '10.8', icon: Package,        img: '/marketing/shot-materials.png',     what: '叫料即通知老總，逾期自動標紅',   how: '判頭喺手機落單，撳「急件」即時推送…',   why: '判頭知咩叫咗、咩逾期、阻住邊項工…' },
  { n: '10.9', icon: FileDown,       img: '/marketing/shot-export.png',        what: '一鍵出報告，業主版／內部版自動分流', how: '揀業主版／內部版／例外版，出前有預覽…', why: '同一份資料一撳就變交上去嘅文件…' },
]

function Screenshots() {
  return (
    <Section n="10" kicker="睇真啲 · 同一個地盤" title={<>一個 demo 地盤，由開工睇到完工</>}>
      <p className="-mt-6 mb-8 text-base text-site-600 leading-relaxed max-w-2xl">
        以下每一張截圖，全部嚟自同一個真實地盤「將軍澳日出康城第十一期 L1座」。由判頭叫料、工程師寫日誌、工地主任追進度、到 PM 出報告畀業主 —— 你會見到成個地盤點樣喺一個系統入面運作，每一個動作都有時間戳同簽名。
      </p>
      <div className="inline-flex items-center gap-2 mb-12 rounded-full bg-safety-50 ring-1 ring-safety-100 px-4 py-2 text-sm font-medium text-safety-700">
        <span className="w-1.5 h-1.5 rounded-full bg-safety-500" />
        同一個項目：將軍澳日出康城第十一期 L1座 · 總承建商 俊建工程 · 整體進度 51%
      </div>

      <div className="space-y-16 md:space-y-24">
        {SHOTS.map((s, i) => (
          <div key={s.n}
               className={'grid md:grid-cols-2 gap-10 md:gap-12 items-center ' + (i % 2 ? 'md:[&>div:first-child]:order-2' : '')}>
            <div className="flex justify-center md:justify-end">
              <ShotPhone img={s.img} />
            </div>
            <div className="max-w-md mx-auto md:mx-0">
              <DrawingNo n={s.n} icon={s.icon} />
              <h3 className="mt-2 font-heading font-bold text-xl md:text-2xl text-site-900">{s.what}</h3>
              <p className="mt-3 text-sm text-site-600 leading-relaxed">{s.how}</p>
              <div className="mt-3 rounded-lg bg-safety-50 ring-1 ring-safety-100 px-3 py-2 text-sm font-medium text-safety-700">{s.why}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-site-400 mb-4">同一個地盤，仲有成套工具喺度</p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {['行事曆（統一時間表）','聯絡人（行頭通訊錄）','圖則 PDF 版本管理','進度更新歷史'].map(c => (
            <span key={c} className="rounded-full bg-site-50 ring-1 ring-site-200 px-4 py-2 text-sm font-medium text-site-700">{c}</span>
          ))}
        </div>
      </div>
    </Section>
  )
}

// Phone frame: bezel verbatim from PhoneMock + orange JSX header (identical every shot) + portrait shot.
function ShotPhone({ img }: { img: string }) {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-safety-500/20 blur-2xl rounded-[3rem] pointer-events-none" />
      <div className="relative w-[240px] md:w-[268px] rounded-[2.4rem] border-[10px] border-site-800 bg-site-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="bg-white">
          <div className="bg-gradient-to-r from-safety-500 to-safety-600 text-white px-4 py-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/25 grid place-items-center text-xs font-heading font-bold">CK</div>
            <div className="text-sm font-semibold">日出康城 L1座</div>
          </div>
          <div className="bg-white aspect-[9/19] overflow-hidden">
            <img src={img} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DrawingNo({ n, icon: Icon }: { n: string; icon: typeof ListChecks }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs font-bold text-safety-500 tracking-widest">{n}</span>
      <span className="h-px w-8 bg-safety-500" />
      <Icon size={16} className="text-safety-500" />
    </div>
  )
}
```

> Asset path note: `Sell.tsx` (web-only route) and Vite `base: './'` — put images under `public/marketing/`; reference as `/marketing/shot-*.png`. Confirm against any subpath hosting; on Vercel root deploy `/marketing/...` resolves correctly.

---

## 4. DATA-PLAN — the single demo project + every record to seed

> Seed ALL of this into ONE project so every capture is the same site. Realistic HK data, no "test/demo" strings. Use HK time (`Asia/Hong_Kong`), report date **2026-06-08 (星期一)**.

### Project profile
- **Name:** `將軍澳日出康城第十一期住宅項目 — L1座`  (phone header short label: `日出康城 L1座`)
- **Main contractor:** 俊建工程 · **Owner rep:** 發展商代表 · 45-storey private residential.
- **Zones (分區):**
  1. `L1座 地庫及平台 (B2-平台層)`
  2. `L1座 低層 (1-15樓)`
  3. `L1座 中層 (16-30樓)`
  4. `L1座 高層 (31-45樓)`
  5. `會所及園境平台`
- **Overall roll-up:** 整體 **51%** vs 計劃 **54%**（落後 3%）。落後 3 項 with real reasons: 外牆防水(黑雨)、會所鋪磚(判頭人手)、12樓鋁窗(待料).

### Per-feature seed (exactly what must exist so each shot looks live)

**進度表 (progress_items, 大項→中項→細項):**
- 【A 結構工程】 roll-up ~71%
  - A1 地庫結構 100% 已完成 (A1-1 B2樓板落石屎 100%, A1-2 B1剪力牆紮鐵 100%)
  - A2 低層結構(1-15樓) 88% (A2-1 結構柱紮鐵 floors 1F-15F=100%; A2-2 樓板落石屎 1F-14F done,15F進行中=93%)
  - A3 中層結構(16-30樓) 52% (planned 45 → **略為超前**); A3-1 結構柱紮鐵 16F-24F=60%, A3-2 樓板落石屎 16F-22F=47%
  - A4 高層結構(31-45樓) 5% (A4-1 搭棚 15% 進行中)
- 【B 外牆工程】 ~33% — B1 外牆批盪 40%；**B2 外牆防水 25% (planned 50, status=delayed, note「3-5樓外牆防水因黑雨停工兩日,已通知判頭趕回」)** ← required red row in shot-progress-tree
- 【C 室內裝修】 ~35% — C1 砌磚 65%, C2 批盪/天花 45%, C3 鋪磚 30%, C4 油漆 0%
- 【D 機電工程】 ~52% — D1 水喉鋪設 55%, D2 電線槽 48%
- 【E 會所及園境】 ~18% — **E1 會所平台鋪磚 35% (planned 60, delayed, note「判頭人手不足,落後約一週,已要求加派」)**, E2 園境綠化 0%
- Each leaf: planned_progress, actual_progress, assigned_to, last-update stamp (e.g.「陳師傅 更新於 今日 14:32」).

**問題 (issues, 3 open + 1 resolved):**
1. 「12樓鋁窗未到貨,安裝停工」 reporter 管工(陳師傅) → handler 主承建商 (已上呈) · 處理中 · 2 photos · 判頭留言「已催供應商,週四晨早到」
2. 「3樓外牆防水位置滲水」 reporter 判頭 → handler 總承建商 · 處理中 · 留言「拍片記錄,安排明日重做防水」
3. 「中層紮鐵鋼筋擺位與圖則不符」 reporter 總承建商 → handler PM(終點) · 處理中 · 留言「轉介結構工程師,暫停該柱落石屎」(links drawing S-204 Rev C)
4. 「地庫B2積水未有排走」 reporter 管工 → 判頭 · **已解決** · 「已開臨時水泵,加裝防水閘門」

**工地指令 (SI):** `SI-2026-014`「地庫B2機房開口尺寸修改」 1200x800→1500x1000mm, 附圖 S-118 Rev D, 2 photos, GPS(日出康城) · status **已批准/locked** · chain 工程師→總承建商→PM (all signed) · creator 工程師(李工) · v1草稿→v2批准(PM加註「須於兩週內完成」). (Also seed `SI-2026-009` locked as the VO parent.)

**變更指令 (VO):** `VO-2026-007` parent SI-2026-009「會所平台加建無障礙混凝土斜道及不鏽鋼扶手」 · status **submitted/審批中** · chain 總承建商→PM→業主 · creator 總承建商(黃經理) · line items (server-computed):
- 人工 紮鐵+落石屎斜道 8工日 × 2,800 = 22,400
- 物料 混凝土 6m³ × 1,150 = 6,900
- 物料 不鏽鋼扶手 24米 × 880 = 21,120
- 物料 防滑磚 45m² × 320 = 14,400
- 人工 防水+鋪磚 6工日 × 2,500 = 15,000
- 前期費用 搭棚+臨時通道 = 8,500
- 暫定 不可預見 10% = 16,180
- (現場雜項+管理費湊成) **總額 HK$184,500**

**工作許可證 (PTW, v1 types only):**
- `PTW-2026-031` 動火(hot_work)「38樓高空鋼構燒焊接駁」 **生效中/active** · checklist 滅火筒✓/防火布✓/火險監察員✓(看火人 周師傅)/易燃物已移除✓ · workers 阿明、阿強 · expiry 今日18:00 · 安全主任已簽 · QR active · 30-min 火警監察 timer
- `PTW-2026-033` 吊運(lifting)「塔吊吊運28樓預製樓梯組件(2.1噸)」 **已批准/approved 待生效** · checklist 操作員證✓/吊索具✓/起重區圍封✓/風速✓ · workers 林師傅、蔡師傅
- `PTW-2026-029` 高空(work_at_height) **已完工/closed_out** (history)

**每日日誌 (daily logs):**
- 2026-06-08(一) 天氣 雨 · items: 24樓結構柱紮鐵, 15樓樓板落石屎, 5樓砌磚, 會所平台鋪磚 · freeform「黑雨警告 09:15-11:40 停戶外工兩小時」「鋁窗供應商未到貨,12樓停工」 · notes「下午雨勢轉緩恢復吊運。出勤:紮鐵18、泥水12、機電8」
- 2026-06-05(五) 晴 · 23樓紮鐵/14樓落石屎/4樓批盪 · notes「SI-2026-014機房開口已開始施工」
- 2026-06-04(四) 暴雨 · notes「黑雨全日停戶外,只室內砌磚批盪。B2積水已開水泵」(locked)

**物料 (materials):**
1. 鋁窗(12樓) 0/48樘 · **已申請 · 急件⚠ · planned 06-08 逾期(紅)** · 「物流延誤,改期06-11」 · 申請人 管工陳師傅
2. 螺紋鋼筋 T16 25/25噸 · 已齊料 · arrived 06-06
3. 混凝土 C45 80/120 m³ · 部分到貨 · 餘40m³ planned 06-09
4. 防水塗料(雙組份) 60/60桶 · 已齊料 · arrived 06-03
5. 牆磚 300x600 500/800 m² · 部分到貨 · planned 06-10
6. 不鏽鋼扶手(會所斜道) 0/24米 · 已申請 · 「待VO-2026-007批准後落單」

**行事曆 (timetable events):**
1. 會議「每週地盤協調會」06-09(二)09:00-10:00 · 地盤辦公室
2. 巡查「屋宇署消防裝置中期巡查」06-11(四)14:00 · B2機房及低層
3. 里程碑「中層結構(30樓)封頂」06-20
4. 巡查「獨立安全審核(吊運作業)」06-10 11:00 · 塔吊區
5. 會議「VO-2026-007業主審批會」06-12 15:00 · 發展商辦公室
   (+ auto-merged: 物料到貨 06-09 混凝土 / 06-10 牆磚 blue; 進度完工 green.)

**聯絡人 (contacts):**
1. 陳國強 紮鐵 9123 4567「中高層結構紮鐵判頭,16-45樓」
2. 黃志明 泥水 9876 5432「砌磚批盪鋪磚,1-10樓」
3. 李家輝 防水 6234 7890「外牆及天台防水,正處理3樓滲水」
4. 周文彬 機電 9555 8888「水喉電線槽機電判頭」
5. 蔡偉雄 吊運 6111 2233「塔吊及吊運,持牌操作」
6. 林志偉 鋁窗 9700 3344「鋁窗玻璃供應安裝(待料中)」
7. 何美玲 工程顧問 2890 1122「結構工程師,核對紮鐵圖則」
8. 羅永生 棚架 9333 6677「棚架判頭,高層搭棚」
9. 麥成業 消防 6788 9900「消防裝置,配合屋宇署巡查」

**圖則 (drawings, attached to leaves):**
- S-204「中層結構柱配筋詳圖」 Rev C 現行 (Rev B 已取代) → A3-1; linked to issue#4(24樓主筋)
- S-118「B2機房通風開口及過樑」 Rev D 現行 (Rev C 已取代) → SI-2026-014
- A-501「會所平台無障礙斜道」 Rev A 現行 → VO-2026-007
- M-302「低層水喉佈置(1-12樓)」 Rev B 現行
- F-110「外牆防水大樣」 Rev A 現行 (3樓滲水參照)

**儀表板 + 匯出 (dashboard / export):**
- Dashboard: 整體 51% (planned 54). 大項條: 結構71% 外牆33% 室內35% 機電52% 會所18%. 統計: 進行中14 / 已完成9 / 落後3 / 未開始5. 問題: 處理中3 已解決1. 文件: SI 1已批 / VO 1待批 / PTW 1生效+1待生效. Activity feed: 3 recent (進度更新 陳師傅 · 問題 鋁窗未到 · 加入審批).
- Export modal: cover「將軍澳日出康城第十一期 L1座 — 進度報告」報告日期 2026-06-08 · 總承建商 俊建工程 · 整體 51% · audience options 業主版一頁紙 / 內部版詳細 / 例外版(只睇落後) · scope preview「整體 51% · 落後 3 項」 · PDF/Excel + WhatsApp/email share row · owner one-pager highlights 進度51% / 落後3項及原因 / 待業主批 VO HK$184,500.

---

## 5. Capture list

See the structured `captureList` field. 11 screenshots, all from the same seeded project, captured at **390x844 phone** viewport, saved under `public/marketing/`:

1. `shot-progress-tree.png` — 進度 tab, 4-stat header + red 落後 row (工地主任)
2. `shot-dashboard.png` — 儀表板 hero counts + activity feed (PM/admin)
3. `shot-issues.png` — 問題 tab, 3 處理中 with handler pills (工地主任)
4. `shot-si.png` — SI-2026-014 detail, locked + signed chain (PM)
5. `shot-vo.png` — VO-2026-007 line items + HK$184,500 total (main_contractor)
6. `shot-ptw.png` — PTW-2026-031 active, checklist + QR + fire-watch (safety_officer)
7. `shot-daily.png` — DailyEdit 06-08, weather 雨 + checked items (工地主任)
8. `shot-materials.png` — 鋁窗 urgent + overdue red (判頭)
9. `shot-export.png` — ExportProgressModal audience split + preview (PM)
10. `shot-timetable.png` — week view 3-colour merged sources (工地主任) [chip-strip support]
11. `shot-contacts.png` — directory with one-tap 致電 (判頭) [chip-strip support]

Shots 10–11 back the chip strip and are captured for completeness/future use; the 9-row alternating layout renders shots 1–9.

### Capture how-to (grounded in routes)
- Log in as the role noted per shot (role gating is real: Dashboard requires admin/assigned-PM; progress edit requires admin/assigned-PM/main_contractor/subcontractor; PTW requires `app_config.ptw_enabled=true` or admin).
- Navigate to the hash route with the seeded `:projectId` substituted.
- Set browser/emulator to 390px width, capture the visible viewport (portrait), crop to the app content area below the OS status bar so `object-cover object-top` framing looks native in the bezel.
