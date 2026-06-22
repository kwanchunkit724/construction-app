# CK工程 — 功能逐項測試大綱 (Master Test Program)

> 目的:**一個功能一個功能**驗證「每個角色喺每個功能嘅權限」係咪同設計(RLS)一致。
> 用一個**全新 [TEST] 專用地盤** + 一套 sandbox 測試帳號,先測「**看**」(可見性),後測「**用**」(動作),最後測 4 個已知 regression。
>
> **Oracle(對與錯嘅標準)= 已完成嘅權限矩陣**(11 功能 × 8 角色,RLS source-level)。本大綱每一步都寫明「預期」。
>
> 狀態:**草擬,待你過目。冇更改先開始 build。**

---

## 0. 測試原則

1. **隔離 (sandbox):** 所有測試帳號**只屬 [TEST] 地盤**,同 demo(CKdemo)/live 完全隔開。測試 admin 直接登入,**唔入任何公開切換頁**(沿用 /demo-roles 安全教訓)。
2. **兩層測試 — 缺一不可:**
   - **UI 層:** 撳掣,睇到/做到乜。驗證 client gate + 體驗。
   - **REST 層:** 攞該用戶 JWT 直接打 Supabase API(PATCH/POST/SELECT)。**呢層先係驗 RLS 真‧權限**——因為 client gate 只係方便,RLS 先係 fail-closed 嘅閘。**好多 bug 只喺 REST 層先見到**(client 永遠唔會發嗰個 request)。
3. **每步記三格:** 預期(allow/deny + 內容) / 實際 / **Pass·Fail**。Fail → 即場開 debug。
4. **次序:** 階段 A「看」→ 階段 B「用」(逐功能)→ 階段 C regression。
5. **每個功能 module 都開住**(全 on),除非該功能要測 module gate。

---

## 1. 測試帳號名冊

> 共享密碼 **`CKtest2026`**(所有測試成員)。Admin 用**獨立強密碼**,唔共享、唔入切換頁。
> 電話用 **62** 段(同 demo 60 段唔撞;6 字頭 = 合法 HK 手機)。

### 全地盤角色(唔分區)
| 電話 | 角色 (global_role) | 中文 | 用途 |
|---|---|---|---|
| 62000099 | admin | 測試管理員 | 建地盤、approve PM、跑 REST 測試。**獨立密碼,不入切換頁** |
| 62000001 | pm | 項目經理 | approve 各角色、建進度樹、批 SI/VO/PTW |
| 62000002 | general_foreman | 老總 | 測「睇全部」+ 問題全權 + 寫日誌 |
| 62000003 | owner | 業主 | 測唯讀 + VO 最後一步批核 |
| 62000004 | safety_officer | 安全主任 | 測 PTW 簽核 + 問題全權 + 機械(v77) |

### 分區角色(每區 4 個)
> 工程師·管工 都係 `main_contractor`(sub_role engineer / foreman);判頭 = `subcontractor`;工人 = `subcontractor_worker`。

| 區 | 工程師 (MC) | 管工 (MC) | 判頭 (SC) | 工人 (worker) |
|---|---|---|---|---|
| 一座 | 62010001 | 62010002 | 62010003 | 62010004 |
| 二座 | 62020001 | 62020002 | 62020003 | 62020004 |
| 三座 | 62030001 | 62030002 | 62030003 | 62030004 |
| 外圍 | 62040001 | 62040002 | 62040003 | 62040004 |

**合計:5 全地盤 + 16 分區 = 21 帳號**(admin 另計)。

> 選項:建一個 **`/test-roles`** 一鍵切換頁(複製 `RoleSwitch.tsx`,改名冊+密碼,**admin 排除**)。方便逐角色測 UI。預設建議建,可關。

---

## 2. 環境建立流程(Setup)

> 呢段係「申請→批核」流程本身嘅測試,亦係之後測試嘅前置。**按次序**做,每步驗證。

### T0 — Admin 建地盤
- Admin 登入 → 建 project **`[TEST] 測試大廈項目`**。
- 開齊 13 個 module(確認 `get_project_modules` 全 true)。
- ✅ 驗:admin 喺項目列表見到 [TEST]。

### T1 — PM 申請 + admin 批
- PM(62000001)登入 → 申請加入 [TEST](role = pm)→ 狀態 pending。
- Admin → 審批列表見到 PM 申請 → approve + 將 PM 加入 `assigned_pm_ids`。
- ✅ 驗:PM 再入,[TEST] 由「申請中」變「已加入」;PM 見到項目。
- ✅ 驗(REST):未批前 PM `select * from progress_items where project_id=TEST` → 0 行;批後流程繼續。

### T2 — 其餘 20 角色逐一申請,PM 批
- 每個帳號登入 → 申請加入 [TEST],揀對應 role(分區角色亦只係 global_role;「邊一區」靠之後嘅**指派**,唔係申請時揀)。
- **PM**(唔係 admin)逐一 approve。
- ✅ 驗:PM 嘅審批列表見到 20 個 pending,逐個批。
- ✅ 驗:approve 前該用戶 `can_view_project` = false(REST select 0 行);approve 後 = true。
- ✅ 驗(權限):確認**判頭/工人**呢類 approve 後,SI/VO/PTW/日誌/聯絡人 嘅**寫**仍然 deny(membership 唔等於有寫權)。

### T3 — PM 建進度樹 + 指派(「看」測試嘅佈置)
PM 登入,喺 [TEST] 建以下樹。**4 區結構對稱**(方便跨區比對)。`{N}` = 一座/二座/三座/外圍。

```
{N}                                  ← 區(頂層大項, parent=null)
├─ {N}-上層結構 (大項)
│  └─ {N}-結構-3樓 (中項)
│     ├─ {N}-3樓柱   〔指派: {N}工程師, {N}管工〕      ← leaf 細項
│     └─ {N}-3樓樓板 〔指派: {N}判頭, {N}工人〕        ← leaf
└─ {N}-機電 (大項)
   └─ {N}-機電-喉電 (中項)
      ├─ {N}-喉管 〔指派: {N}判頭〕                    ← leaf
      └─ {N}-電線 〔指派: {N}工程師〕                  ← leaf
```

- 每區 = 1 頂層 + 2 大項 + 2 中項 + 4 細項。指派只落 leaf(細項)。
- **leaf 命名自帶預期可見者**(照你嘅例),令登入後可即場 eyeball。
- 指派:PM 用每個 leaf 嘅「指派」UI 設 `assigned_to`。
- ✅ 驗:PM 自己睇 → 4 區齊全(PM 睇晒)。

> ⚠ 設計提醒(oracle):指派**只落 leaf**,可見性會**向上 bubble 到祖先**,但**唔會 bubble 去兄弟 leaf**。即:被指派 `3樓柱` 嘅人,睇到 `3樓柱`+中項+大項+區,但**睇唔到同一中項下嘅 `3樓樓板`**(除非都指派俾佢)。呢個係最精準嘅收窄測試。

---

## 3. 階段 A — 「看」測試 (可見性矩陣)

逐個帳號登入 [TEST] → 入進度表 → 對照「預期見到」。

### 預期可見性(進度表)
| 帳號 | 預期見到 | 預期**見唔到** |
|---|---|---|
| admin | 4 區全部 | — |
| PM (62000001) | **4 區全部**(global pm 睇晒) | — |
| 老總 (62000002) | **4 區全部**(global gf 睇晒) | — |
| 業主 (62000003) | **空白**(冇被指派) | 全部 |
| 安全主任 (62000004) | **空白**(冇被指派) | 全部 |
| 一座工程師 62010001 | 一座: 3樓柱·電線 + 祖先(一座/上層結構/3樓/機電/喉電) | 3樓樓板·喉管(同區未派);**二/三/外圍全部** |
| 一座管工 62010002 | 一座: 3樓柱 + 祖先(一座/上層結構/3樓) | 電線·喉管·3樓樓板;機電大項;其他區 |
| 一座判頭 62010003 | 一座: 3樓樓板·喉管 + 祖先 | 3樓柱·電線;其他區 |
| 一座工人 62010004 | 一座: 3樓樓板 + 祖先(一座/上層結構/3樓) | 其餘一座 leaf;其他區 |
| 二/三/外圍 對應角色 | 各自區嘅對應 leaf(同上 pattern) | 其他區 |

**重點 Pass 準則:**
- ✅ 工程師 vs 管工(同係 MC)**權限一樣,只係指派唔同 → 見到唔同**。證明收窄係**靠指派**唔係靠角色。
- ✅ **跨區零洩漏**:一座任何角色 100% 見唔到二/三/外圍。
- ✅ PM / 老總 睇晒;業主 / 安全主任 空白。
- ✅ 兄弟 leaf 唔互見(3樓柱 ≠ 3樓樓板)。

### REST 層(可見性硬驗)
- 攞「一座判頭」JWT → `GET /rest/v1/progress_items?project_id=eq.{TEST}` → 應只回佢 RPC 範圍?
  ⚠ **注意 oracle gap:** `get_visible_progress_items` 嘅收窄係 **RPC-only**;`progress_items` 表嘅**底層 SELECT policy 闊得多**(任何已批准成員可 raw-select 全部行)。
  → **測試項 V-RAW:** 一座判頭直接 raw REST select `progress_items`(唔經 RPC)**會唔會見到二座行?** 預期(source):**會**(底層 policy 冇收窄)。**呢個係要 flag 嘅可見性洩漏**(UI 安全,API 唔安全)。記錄結果,決定使唔使補。

---

## 4. 階段 B — 「用」測試 (逐功能 × 逐角色)

> 每個功能:先 UI(撳到/撳唔到),後 REST(allow/deny)。預期 = 權限矩陣。
> 標記:✓=應成功 · ✗=應被拒(UI 隱藏 + REST 403/0 行)。

### B1. 進度表
| 測試 | 角色 | 預期 |
|---|---|---|
| 打格仔/改進度 — **自己被派**嘅 leaf | 一座工人 改 3樓樓板 | ✓ |
| 打格仔 — **冇派**俾自己嘅 leaf | 一座工人 改 3樓柱 | ✗(REST 0 行) |
| 改別區 leaf | 一座判頭 改 二座-喉管 | ✗ |
| 新增大項/中項(結構) | PM | ✓ |
| 新增大項 | 一座判頭 | ✗(SC 唔係 manager) |
| 新增大項 | 一座工程師(MC) | ✓(MC 係 manager,即使佢只睇到部分)|
| 刪項目 | 一座工人 | ✗ |
| 寫進度歷史 | 任何可改該 leaf 嘅人 | ✓;改唔到/刪唔到歷史(append-only)|

### B2. 問題(含即時問題)
| 測試 | 角色 | 預期 |
|---|---|---|
| 報問題 / 即時問題(影相)| 全部 8 角色(已成員)| ✓ |
| 升級鏈 | 工人報→handler=判頭;判頭報→總承;總承/業主/PM 報→PM | ✓ 按 oracle |
| 處理「handler=自己」嘅問題 | 對應 handler 角色 | ✓ |
| 處理「handler≠自己」嘅問題 | 例:一座判頭 改 handler=PM 嘅問題 | ✗(除非佢係 reporter)|
| 安全主任 / 老總 處理**任何**問題 | 62000004 / 62000002 | ✓(全權, v66)|
| 工人處理「非自己報」問題 | 一座工人 | ✗ |
| 升級跳級(判頭直接 set handler=pm)| REST | ✗(v69 階梯,raise)|
| 偽造 reporter_id / issue_no | REST(非 admin)| ✗(column guard 釘住)|
| 刪問題 | admin | ✓ |
| 刪問題 | PM / 任何非 admin | ✗ |
| 改/刪留言 | 任何人 | ✗(append-only)|

### B3. 工地指令 SI
| 測試 | 角色 | 預期 |
|---|---|---|
| 開單(draft)| admin/PM/總承/判頭 | ✓ |
| 開單 | 工人/業主/安全主任/**老總** | ✗ |
| 提交 submit | 只開單人 | ✓;非開單人 ✗ |
| 批步0(總承)| 一座總承(MC 成員)/admin | ✓ |
| 批步0 | 判頭/工人 | ✗ |
| 批步1(PM)| PM/admin | ✓ |
| admin_override | admin | ✓(SI 無安全限制)|
| 鎖後加異議 protest | 任何可睇者 | ✓ |
| 刪 SI | 任何人(含 admin)| ✗(append-only)|

### B4. 變更指令 VO
| 測試 | 角色 | 預期 |
|---|---|---|
| 開單 / 提交 | 同 SI(開單人限定提交)| ✓/✗ |
| 批步0 總承 → 步1 PM → **步2 業主** | 對應角色 | ✓ |
| **業主批最後一步** | 62000003 | ✓(VO 設計上業主係批核人)|
| client 改金額 total | REST 改 total_amount_cents | ✗(3 層服務器鎖)|
| 刪 VO | 任何人 | ✗ |

### B5. 工作許可證 PTW
| 測試 | 角色 | 預期 |
|---|---|---|
| 開單 | admin/PM/總承/判頭 | ✓ |
| 開單 | 安全主任 | ✗(安全主任只簽唔開)|
| 提交 / 開火警監察 / 關單 | 只開單人 | ✓;其他 ✗ |
| 簽步0(安全主任)| 62000004(地盤 role=safety_officer)| ✓ |
| 簽步0 | 普通成員 / 只 global_role=safety_officer 但地盤 role 唔係 | ✗ |
| 🔒 **admin_override 安全主任步驟** | admin | **✗**(v76 raise『必須由安全主任親自簽核』)|
| admin_override 非安全步驟(總承步)| admin | ✓ |
| QR 掃描核實 | 任何該地盤可睇者 | ✓ |

### B6. 機械 / 表格
| 測試 | 角色 | 預期 |
|---|---|---|
| 加機械 / 開表格項 | admin/PM/總承/**安全主任**(v77)| ✓ |
| 加機械 | 判頭 / 工人 / 老總 | ✗ |
| **印 QR (mint)** | 判頭 | **✓**(仍用舊 gate)|
| **印 QR (mint)** | 安全主任 | **✗** ⚠ regression #4(加得機械卻 mint 唔到)|
| **簽法定表格** — 持**已核實對應牌**者 | 例:俾一座判頭一張已核實「合資格人士」牌 → 簽 | ✓(按牌唔按角色)|
| 簽表格 — **無牌** | PM(無牌)| ✗(『你未有有效的合資格人士證明』)|
| 核實證書 | admin/PM/安全主任 | ✓ |
| 核實證書 | 總承(UI 見到掣)| ✗(RST raise『只有管理員/PM/安全主任可核實』)|
| 自己上載未核實證書 | 全部 | ✓ |
| 自我核實自己證書 | REST | ✗(guard 釘 verified_by/at)|
| 改表格範本 | admin | ✓;其他 ✗ |

### B7. 每日日誌
| 測試 | 角色 | 預期 |
|---|---|---|
| 寫日誌 | admin/PM/總承/老總 | ✓ |
| 寫日誌 | 判頭 / 工人 / 業主 / 安全主任 | ✗ |
| 改/刪**自己今日**日誌 | 作者 | ✓ |
| 改**尋日**日誌 | 作者 | ✗(鎖死)|
| 改任何日任何人日誌 | admin | ✓ |
| 睇日誌 | 任何已批准成員 | ✓ |
| 睇日誌 | **唔係成員嘅 admin** | ✗ ⚠ regression #3(v59 甩咗 admin 分支)|

### B8. 物料
| 測試 | 角色 | 預期 |
|---|---|---|
| 落料單 | admin/PM/總承/判頭 | ✓ |
| 落料單 | 工人 / 業主 / 安全主任 / 老總 | ✗ |
| 改**自己**料單 | 落單人 | ✓ |
| 改**別人**料單 | 一座判頭 改別人料單(REST PATCH)| **應 ✗,但 source 顯示 ✓** ⚠ **regression #1(最嚴重)** |
| 刪料單 | 落單人 / admin / PM / 老總 | ✓;其他 ✗ |

### B9. 行事曆
| 測試 | 角色 | 預期 |
|---|---|---|
| 加事件 | admin/PM/總承/**老總**(v72)| ✓ |
| 加事件 | 判頭 / 工人 / 業主 / 安全主任 | ✗ |
| 改/刪 | 自己加嘅 OR global admin/pm | ✓;其他 ✗ |
| 睇 | 任何成員 | ✓ |

### B10. 聯絡人
| 測試 | 角色 | 預期 |
|---|---|---|
| 加/改/刪 | admin / PM | ✓ |
| 加/改/刪 | 其餘全部(總承/判頭/工人/業主/安全/老總)| ✗ |
| 睇(tap-to-call)| 任何成員 | ✓ |

### B11. 文件 / 圖則
| 測試 | 角色 | 預期 |
|---|---|---|
| 上載文件(MAT/MS/INS)| admin/PM/總承/判頭/老總 | ✓ |
| 上載 | 工人 / 業主 / 安全主任 | ✗ |
| 上載**圖則 (drawing)** | admin/PM/總承 | ✓ |
| 上載圖則 | **判頭 / 老總** | ✗(D-25 carve-out)|
| 提交審批 | 同上載權 | ✓ |
| 審批/批/退 | admin/PM/總承/老總 | ✓ |
| 審批 | 判頭/工人/業主/安全主任 | ✗ |
| 自己審自己交嘅版本 | 非 admin | ✗(no self-review)|
| 撤回版本 | 上載人 OR admin | ✓;其他 ✗ |
| 刪文件 | 任何人(含 admin)| ✗(證據永存)|

---

## 5. 階段 C — Regression 測試(REST 層,4 個已知問題)

> 呢 4 個係我喺權限審查搵到嘅 source-level 問題。**必須喺 live DB EXECUTION 核實**(memory:RLS 要 by execution)。

| # | 測試 | 步驟(REST,用對應 JWT)| 預期(現況)| 修後預期 |
|---|---|---|---|---|
| R1 | 物料跨行 PATCH | 一座判頭 PATCH 另一人嘅 material row | **200(漏洞)** | 403 / 0 行 |
| R2 | 日誌補報 | PM POST daily,`date` = 尋日 | **成功(漏洞)** | 拒 |
| R3 | 非成員 admin 讀日誌 | 唔係 [TEST] 成員嘅 admin GET dailies | **空白(退步)** | 見到 |
| R4 | 安全主任 mint 機械 QR | 安全主任 call `mint_equipment_jwt` | **拒(不一致)** | 應允 |

每個 = 跑 → 記 HTTP code/結果 → 確認係咪同 source 推斷一致 → 列入修復清單。

---

## 5b. 階段 D — 按鈕 + 輸出逐個驗證(每個掣都唔漏)

> 全 app **567 個控件**已由 codebase 自動清點(workflow inventory)→ 完整清單見
> **[TEST-PROGRAM-CONTROLS.md](TEST-PROGRAM-CONTROLS.md)**。每一行 = 一個要驗證嘅掣/輸出。
> 分組:進度97 · 問題35 · 即時問題11 · SI 53 · VO 49 · PTW 47 · 機械47 · 日誌18 · 物料14 · 行事曆12 · 聯絡人15 · 文件圖則88 · dashboard14 · home7 · admin28 · 助理7 · 導航25。

### D1. 輸出物(40 項)— 撳 → 產生 → 開檔對內容 → 中文檢查 → capture

| 類型 | 數 | 例 |
|---|---|---|
| **PDF** | 9 | 進度報告 · VO · PTW合規證明 · 表格簽核 · 簽名證明 · 天氣EOT · 機械QR列印 |
| **Excel** | 6 | 進度 · 問題 · 工地清單(admin) · 機械登記冊 · 天氣EOT |
| **QR** | 4 | PTW QR · 機械QR(列印全部/詳情/單張)|
| **相片** | 14 | 問題/SI/PTW 影相+選相、信封縮圖、證書圖 |
| **signed-url** | 7 | 文件/圖則 viewer + 版本記錄開檔 |

每項驗法 = **開檔睇「預期內容」**(欄位/頁面/QR payload,companion 逐項寫晒)+ **中文唔亂碼** + **截圖 capture**。

**🔴 D1 重點 — 中文亂碼高危 PDF(仲用 jsPDF NotoHK 子集字體):**
| PDF | 風險 | 要點驗 |
|---|---|---|
| **變更指令 VO** (`exportVOToPDF`) | 子集 → 生僻字亂碼 | 開 VO PDF,睇 line item + 簽核紀錄中文 |
| **表格簽核** (`generateFormSignoffPdf`) | 子集 | 簽署後開 PDF,睇檢查項目中文 |
| **天氣 EOT** (`exportWeatherEotToPDF`) | 子集 | 開 EOT PDF,睇天氣事件中文 |

**🟢 已轉 html2canvas(系統中文字體,應 OK):** 進度報告 body · **合規證明(#6)** · **簽名證明(#10)** · 機械QR(系統字)。 → 呢 4 個今次重點確認真係好返。

> 即:#6/#10 已修嘅,呢度 capture 確認;**VO / 表格簽核 / 天氣EOT 3 個 PDF 仲未轉**,測到亂碼就用同一個 `htmlToPdfBlob` helper 一拼修。

### D2. 非輸出控件(527 項)— 逐個撳,核對預期
navigation(84)/ modal(80)/ mutation(72)/ none-視覺(291)。逐個:撳 → 對 companion「預期結果」(導航去邊/開咩 modal/改咩 state/toast/badge)。companion 每行有 `點驗` + `source`。

### D3. Capture 協定(俾你最後過目)
1. 每個**輸出物**:渲染後截圖(`preview_screenshot` 開 PDF/Excel/QR;native 用 share sheet 截)。
2. 命名 `{功能}-{控件}.png`,收落 `.planning/captures/`。
3. 關鍵互動掣(提交/批/簽/升級/指派)亦截「撳前 → 撳後」對比圖。
4. 全部收齊 → 我整一份 **capture 索引(縮圖牆 + 預期/實際)** 一次過俾你 review。

---

## 6. 執行方式 / 工具

1. **建資料:** 經 Supabase(Chrome SQL API,memory 記載)seed —
   - 21+1 auth users(raw insert,注意 GoTrue token 欄位要 `''` NOT NULL;identity_data 要 `{sub,email,email_verified,phone_verified}`;set `email_confirmed_at`;手動建 user_profiles)。
   - [TEST] project + 21 membership(approved)+ assigned_pm_ids。
   - 進度樹(16 leaf)+ 指派。
2. **UI 測試:** `/test-roles` 一鍵切角色(建議建)+ 逐表打勾。亦可用 `simulate` skill 嘅 Playwright harness 自動行 UI 層。
3. **REST 測試:** 細 node/curl harness — 對每個測試用戶用 password grant 攞 JWT → 用 bearer 打 `/rest/v1/...` PATCH/POST/GET,assert HTTP code。呢個係階段 C + 各 B 表「REST」行嘅執行器。
4. **記錄:** 一張結果表(下方 template),逐項 Pass/Fail;Fail 即開 debug。

---

## 7. 結果記錄表(template)

| 階段 | 測試項 | 角色 | 預期 | 實際 | Pass/Fail | 備註/debug |
|---|---|---|---|---|---|---|
| A | 一座判頭可見性 | 62010003 | 只一座 2 leaf+祖先 | | | |
| B1 | 工人改未派 leaf | 62010004 | ✗ | | | |
| … | | | | | | |
| C-R1 | 物料跨行 PATCH | 62010003 | 漏洞 200 | | | |

---

## 8. 待你決定(過目重點)

1. **區 model** = 進度樹頂層節點(一座/二座/三座/外圍),指派落 leaf。OK?
2. **帳號數** = 21(5 全地盤 + 16 分區)。要唔要加/減(例:每區唔要工人?或加多區?)
3. **每區 2 大項 / 2 中項 / 4 細項** 嘅樹深度 OK?定要更貼真實工程?
4. **`/test-roles` 切換頁** — 建定唔建?
5. **Regression(R1–R4)**:測完即修,定淨係記錄?(R1 物料係真漏洞,建議即修)
6. **測試 admin** 用新 62000099(獨立密碼),OK?定用返現有 admin 直接登入?
7. **亂碼高危 PDF(VO / 表格簽核 / 天氣EOT)**:測到亂碼即用 `htmlToPdfBlob` 一拼修,定先記錄?(建議即修——同 #6/#10 同源)
8. **Capture 範圍**:40 個輸出全部截?定淨係截 PDF/Excel/QR(33 個,跳過純相片上載)?**邊個環境截**——我喺 Vercel preview 用 `preview_screenshot` 截(我做到);native(iOS/Android)要你親手截。

冇更改 → 我即刻開始 build(seed [TEST] 地盤 + 帳號 + 進度樹 + 指派),行階段 A → B → C → D,逐項 capture。
