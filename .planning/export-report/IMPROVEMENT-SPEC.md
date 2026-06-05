# 進度報告匯出 — 改善實作 Spec

> Owner: Product Lead · Target files: `src/lib/export.ts`,
> `src/pages/ProjectDetail.tsx`, new `src/components/ExportProgressModal.tsx`
> Scope: Progress（進度）匯出。Issues / Projects 匯出沿用，唔喺呢個 milestone 改。

---

## 0. 背景 / 現況（事實）

- 資料 = `progress_items` tree：大項(level 1) → 中項(level 2) → 細項(level 3 leaf)。
  每項有 `zone_id`、`code`、`title`、`level`、`tracking_mode`、`planned_progress`、
  `actual_progress`、`status`(未開始/進行中/已完成/延誤/阻塞)、`planned_start/end`、
  `notes`、`last_updated_at`、`assigned_to[]`、`delegated_to[]`。
- 中/大項嘅 planned/actual/status 由 `computeRollup(getDescendantLeaves(...))` 算出 —
  **分區小計同總進度唔使新計，重用呢條 helper 就得。**
- 歷史紀錄表已存在：`progress_history` → `ProgressHistoryEntry`
  (`actual_progress`, `notes`, `updated_by`, `created_at`)。**Dispute 附錄唔使新 schema。**
- Excel：一張 flat sheet，tree order，名稱用全形空格縮排，Excel outline 可摺。
- PDF：A4 landscape，橙色 header band，狀態色 pill，html2canvas 影圖（矇、唔可 select）。
- 分區只係一個 column，**冇 group**。**冇層級色**。**冇 picker**。

5 個角色嘅共識（去重後）：
1. **分區 group + 每區小計** 係所有人第一需求（5/5 useful，且都要求「冇小計 = 價值減半」）。
2. **Picker 要有，但唔可以複雜** — 老總/業主/判頭/管工趕住交數，要有 default + preset，
   一撳就出。最值錢嘅唔係「揀欄位」而係「揀範圍」（分區 / 狀態 / 層級深度 / 只我負責）。
3. **層級色 priority 最低**，而且 4/5 角色警告：紅色喺工程報告 = 出事語意，
   唔好攞嚟分層級。→ **層級用中性深淺，紅黃留返俾狀態。**
4. 跨切共識：頂部 summary（總進度 + 落後件數）、PDF 改真向量文字、狀態跳色、
   分區小計、記住上次選擇、檔名帶週次/分區。

---

## 1. 匯出前對話框（ExportProgressModal）

### 1.1 行為 / UX 規則（hard requirements）

- 撳「匯出」→ 開 modal（取代而家直接 dump）。Modal **mobile-first**：390px 闊單欄、
  44px 觸控 target、大粒 toggle；BlueStacks 1600×900 兩欄。
- **必有合理 default**：第一次開 = 「內部完整版」preset 全選；之後 **記住上次選擇**
  （`localStorage` key `ck.exportProgress.prefs.<projectId>`）。
- 頂部三粒 **preset 大掣**，撳一下即填好下面所有選項（仍可微調再匯出）：
  - **內部版**（PM/管工）= 全分區、全狀態、到細項、全欄、Excel 預設。
  - **業主版** = 全分區 group、隱藏判頭欄（編號/追蹤模式/計劃開始完成/備注/最後更新）、
    只到中項、含頂部 summary、PDF 預設、含分區小計。
  - **例外版（只睇出事）** = 只 `延誤 + 阻塞 + 落後計劃>10%`、到中項、含 summary、PDF 預設。
- Modal 尾兩粒 action：**[匯出 Excel]** / **[匯出 PDF]**（格式喺呢度先二選一，唔做 radio）。
- 趕時間路徑：preset 撳完即見兩粒匯出掣，**最少 2 下完成**。

### 1.2 最終 Option List（modal 內容）

| # | 區段 | 控件 | 選項 / 預設 | 對應角色需求 |
|---|------|------|------------|------------|
| 1 | 範圍·分區 | 多選 chips + 「全部」 | 列出 `project.zones` + 一個 **「未分區/共用」** bucket（`zone_id` 空）。預設全選 | PM/判頭/管工/業主/老總 |
| 2 | 範圍·層級深度 | 三段 segmented | **只大項 roll-up** / **到中項** / **到細項**（預設到細項；業主+例外版=到中項） | 全部 |
| 3 | 範圍·狀態 | 多選 chips | 未開始/進行中/已完成/延誤/阻塞，+ 快捷「**只延誤+阻塞**」「**剔走已完成**」「全部」 | 全部 |
| 4 | 範圍·只我負責 | toggle | 只出 `assigned_to`/`delegated_to` 含 current user 嘅項（連祖先 chain 一齊出以保 tree）。預設關 | 判頭/管工 |
| 5 | 範圍·日期 | toggle + date | 「**只今日/某日後有 update**」(`last_updated_at >=`)。預設關 | 管工 daily / 判頭 |
| 6 | 內容·欄位 | checkbox 群（**摺埋，預設跟 preset**） | 編號 / 追蹤模式 / 計劃開始 / 計劃完成 / 備注 / 最後更新 / 負責人 / 差距(實際−計劃)。名稱/計劃%/實際%/狀態 = 必出鎖死 | PM/業主 |
| 7 | 版面·分區 group | toggle | 「按分區分段 + 每區小計」。預設 **開** | 全部 |
| 8 | 版面·summary | toggle | 頂部工程總覽（總進度/各狀態件數/落後件數）。預設開 | 老總/業主/PM |
| 9 | 版面·只列摘要例外頁 | toggle | PDF 第一頁加「需要關注」清單（延誤+阻塞+落後>10%）。預設：例外版開 | 老總/業主 |
| 10 | 內容·dispute 附錄 | toggle | 附 `progress_history`（邊個/幾時/由X%改到Y%）做附錄。預設關 | 老總/判頭 audit |
| 11 | 內容·相 | toggle（**v2，先 disabled 標「即將推出」**） | 附 daily 進度相 | 管工 |
| 12 | 抬頭 | text + select | 報告週次/期間（如 `2026-W23`）、產生人（auto = current user）。寫入 header + 檔名 | PM/老總/業主 |
| 13 | 對比上份 | toggle（**v2，先 disabled**） | 顯示本期 △% vs 上次匯出 | 全部 |

> 決定：欄位 checkbox（#6）**預設摺埋**，因為老總/業主明言見到一堆 checkbox 即關。
> 範圍類（#1–#5）擺面，欄位類擺摺疊「進階」。

---

## 2. 分區 Group 實作

公用 builder（重構 `buildProgressRows`）先按 option filter，再 group。
**分區排序**：預設跟 `project.zones` 次序，未分區擺最尾；提供 option「最落後分區排最前」
（按該區 rollup `actual − planned` 升序）。**分區內仍保大→中→細 tree + code 排序。**

### 2.1 Excel

- **單一 sheet（預設）**：每個分區一條 **分區標題 band 行**（合併、粗體、深藍底白字），
  下一行為 **分區小計行**（該區 rollup：計劃% / 實際% / 差距 / 件數 / 落後件數），
  再落該區 tree rows。區與區之間留一空行。
- 維持 Excel **outline level**：分區 band = level 0，tree 按 depth +1，可摺。
- 頂部 summary block（option 8）= sheet 最頂幾行（總進度/各狀態件數）。
- **數字用真數值**：`計劃進度`/`實際進度`/`差距` 寫 `number`（85 而唔係 "85%"），
  用 cell number format `0"%"`，咁先可以 SUM/AVG。
- **凍結首行 + autofilter**：`ws['!freeze']` / `ws['!autofilter']`（header 那行）。
- 替代版面（option）：**每分區一張 sheet** — 判頭/管工想淨係 send 一座時用。

### 2.2 PDF

- 改用 **autoTable + Noto Sans HK 向量字體**（重用 `ensureChineseFont`，VO 已驗證可行），
  **棄用 html2canvas**。中文用 `font: 'NotoHK'`。
  > 注意：現有 `noto-sans-hk-subset.ttf` 係 VO 固定詞彙 subset，缺任意 zone/title 字會變豆腐。
  > **必須換成涵蓋常用中文嘅 subset 字體**（GB2312/Big5 常用字級，約 1–2 MB；
  > lazy fetch，唔入 entry chunk，守住 CI <800KB entry guard）。此為 PDF 真向量化嘅前置。
- 每個分區 = 一個 autoTable section：
  - section 標題行：`A座 — 整體 62%（計劃 70%，落後 8%，延誤 2 項）`，落後>0 標紅字。
  - 用 autoTable `didDrawPage` / 每區獨立 table 確保 **分區唔爆頁爆一半**（區頭近頁尾就 addPage）。
- 第一頁（option 8/9）：**工程總覽 KPI block** + **「需要關注」exception 表**。
- **正式抬頭 + 頁尾**：每頁 header = 盤名/報告期數/產生日期；footer = 頁碼 +
  「由 CK工程系統產生」+（option）logo。
- dispute 附錄（option 10）= 尾頁 autoTable：項目 / 時間 / 處理者 / 由X%→Y% / 備注。

---

## 3. 大項/中項/細項 顏色方案

**核心決定（4/5 角色一致）：層級用中性藍灰，狀態先用紅黃。兩者唔可以撞色。**
黑白打印仍要分得到 → 大項靠**底色 band + 粗體**，狀態靠**左側色條 + 文字**，唔淨靠色相。

### 3.1 層級（結構）— 中性深淺

| 層級 | 底色 (bg) | 文字 | 字重 | 縮排 |
|------|-----------|------|------|------|
| 分區標題 band | `#1e3a5f`（深藍灰） | `#ffffff` | 700 | — |
| 大項 (level 1) | `#dbe3ec`（淺藍灰） | `#0f172a` | 700 | 0 |
| 中項 (level 2) | `#eef2f6` | `#0f172a` | 600 | 1 級 |
| 細項 (level 3) | `#ffffff` / 斑馬 `#f8fafc` | `#334155` | 400 | 2 級 |

### 3.2 狀態 — 紅黃綠（蓋過層級，用喺狀態欄 pill + 整行左色條）

| 狀態 | pill 底 | pill 字 | 行左色條 (4px) | 黑白備援 |
|------|---------|---------|---------------|----------|
| 延誤 | `#fee2e2` | `#b91c1c` | `#dc2626`（紅） | 「⚠ 延誤」粗體 |
| 阻塞 | `#fef3c7` | `#92400e` | `#d97706`（橙） | 「■ 阻塞」粗體 |
| 進行中 | `#dbeafe` | `#1d4ed8` | `#3b82f6`（藍） | — |
| 已完成 | `#dcfce7` | `#15803d` | `#22c55e`（綠） | 「✓」 |
| 未開始 | `#f1f5f9` | `#64748b` | `#cbd5e1`（灰） | — |

### 3.3 差距欄（option 6）

`實際 − 計劃`：**負（落後）紅字 `#b91c1c`**、正（超前）綠字 `#15803d`、0 灰。
分區小計 / summary 嘅落後數字同樣套呢個規則。

> 決定：層級色係「**nice**」級。狀態色 + 差距色係「**must**」（呢個先係 5 角色真正要嘅「一眼睇到邊度紅」）。

---

## 4. Prioritized 改善清單

格式：`[priority] (effort) 項目` — effort S<½日 / M≈1–2日 / L>2日。

### MUST
- `[must] (M)` 匯出前 picker modal（preset + 分區/層級深度/狀態 三大範圍 + 記住上次）。三個明確 ask 之一。
- `[must] (M)` 分區 group + 每區小計（Excel band+小計行；PDF section+標題小計）。三個 ask 之一，5/5 第一需求。
- `[must] (S)` 頂部工程總覽 summary（總進度 計劃% vs 實際%、各狀態件數、落後件數）。
- `[must] (S)` 狀態跳色：延誤/阻塞整行左色條 + pill，差距欄落後紅超前綠。
- `[must] (S)` 層級色（中性藍灰 band + 粗體/縮排），紅黃留俾狀態。三個 ask 之一（用中性色落地）。
- `[must] (S)` 狀態 filter「只延誤+阻塞」/「剔走已完成」+ 層級深度 filter（只大項/到中項/到細項）。
- `[must] (S)` 檔名帶 盤名_進度_週次/日期_版本（例 `XX_進度_2026-W23_v1`）；可改名。

### SHOULD
- `[should] (M)` PDF 改 autoTable 向量字體（換涵蓋常用中文嘅 Noto subset），棄 html2canvas。
- `[should] (S)` PDF 正式抬頭 + 頁碼 + 頁尾「CK工程系統產生」(+ logo 位)。
- `[should] (S)` 「只我負責」filter（`assigned_to`/`delegated_to`，連祖先 chain）。
- `[should] (M)` PDF 第一頁「需要關注」exception 清單（延誤+阻塞+落後>10%，連原因）。
- `[should] (S)` Excel：真數值 % + 凍結首行 + autofilter。
- `[should] (M)` Dispute 附錄（`progress_history`：邊個/幾時/由X→Y%）。app 賣點，export 出唔到 = 等於冇。
- `[should] (S)` 一鍵 share PDF（native 用 `@capacitor/share` 直接彈 WhatsApp/email，唔好淨係寫 Documents）。

### NICE
- `[nice] (S)` 日期 filter「只今日/某日後有 update」（daily 報告）。
- `[nice] (M)` 對比上一份（本期 △%，趨勢箭嘴）— 需存上次 snapshot。
- `[nice] (M)` 進度 bar 視覺化（業主版每行/每區橫向 bar，實際 fill + 計劃虛線）。
- `[nice] (M)` 每分區一張 Excel sheet 選項。
- `[nice] (L)` daily 進度相附入 PDF（option 11，需先有 daily 相資料來源）。
- `[nice] (S)` 「最落後分區排最前」排序選項。
- `[nice] (S)` 手機 portrait 友好 PDF（分區一頁、大字）。

---

## 5. 其他值得做嘅 Extra Feature（3 個 ask 以外）

1. **工程總覽 KPI block**（已升做 must）— 老總/業主開會第一句必問「成個盤幾多%、落後幾多」。
2. **「需要關注」exception 報告頁**（延誤+阻塞+落後>10%，排最前 + 原因）— 週會 90% 時間傾呢啲。
3. **Dispute 附錄（修改紀錄）**— 直接兌現 app「共享審計紀錄」賣點；judatou 拗數要白紙黑字。
4. **一鍵 share（Capacitor Share）**— 全行靠 WhatsApp；老總非技術用戶搵唔到 Documents 會嬲。
5. **「只我負責」過濾 + 顯示負責判頭名**— judatou/管工只得幾項，全盤 report 似越權又難搵。
6. **差距欄 + 落後紅綠燈**— 判頭對數要一眼睇得出嘅數字保護自己；老總要紅燈唔要兩串數。
7. **進度+問題合併報告**（judatou：一份講「做到幾多 + 有咩卡住」，唔使匯出兩次）。
8. **preset（內部版/業主版/例外版）**— 解決「picker 太複雜」嘅核心反對；趕時間一撳即出。

---

## 6. 實作落點（給 plan-phase 用）

- 新 `src/components/ExportProgressModal.tsx`：UI + option state + `localStorage` 記憶。
- `src/lib/export.ts`：
  - 抽 `buildProgressRows(project, items, opts)` 接受 `ExportOptions`（filter + group + 欄位）。
  - 新 `buildSummary(items, opts)`（重用 `computeRollup`/`getDescendantLeaves`）。
  - 新 `buildZoneSections(...)`（分區 + 每區 rollup + 未分區 bucket）。
  - 改 `exportProgressToExcel` / `exportProgressToPDF` 收 `ExportOptions`。
  - PDF 換 autoTable path + 寬中文 subset 字體。
- `src/pages/ProjectDetail.tsx`：`匯出 Excel/PDF` MenuItem → 改開 modal，modal 回傳 opts + format。
- `src/types.ts`：新 `ExportOptions` interface（純前端，**唔使新 DB schema / migration**）。
- 約束守則：Supabase free tier（相 v2 再做，先 disabled）；無破壞性 migration；zh-HK；
  保持 native 下載相容（`downloadBlob` 已分 web/native）。
