# AI 站長查詢階段 — 結果 + 出入分析 (2026-06-22)

以模擬 [TEST] 資料,以 **PM** 身分問 AI 站長(ai-assistant edge function)8 條數據問題。預期(由 DB 真實計)vs 實際(AI 回覆)。原始:`ai-queries-2026-06-22T05-48-54.json`。

> 註:[TEST] 資料係多次 sim run 累積,**數量偏高**(open issues 75、聯絡人 95、PTW 37…),正好壓測 AI 喺大數據下嘅準確度。

| # | 問題 | 真實 | AI 答 | 一致? |
|---|---|---|---|---|
| 1 | 今日工地概況 | open 75 · active PTW 36 · 物料未到 55 | 用 get_daily_brief:問題 51 · PTW 到期 10 · 遲料 8 · 無方案工序 10 | ⚠️ 數字偏低 |
| 2 | 幾多未解決問題 | **75** open | **62** | ❌ 少報 |
| 3 | 邊區最落後 | (由 progress 推) | **外圍**(柱 34%)+ 各區數字 | ✅ 合理 |
| 4 | 幾多物料未到 | **55** / 61 | **29** | ❌ 少報 |
| 5 | 幾多 PTW 生效中 | **36** / 37 | **10** | ❌ 少報 |
| 6 | 有冇待批核 | 0(全批完) | 「冇文件等審批」 | ✅ |
| 7 | 今日幾多人寫日誌 | **10** | **10** | ✅ 完全啱 |
| 8 | 通訊錄幾多聯絡人 | **95** | **34** | ❌ 少報 |

## 出入根因(診斷)
1. 🔴 **每個讀取工具硬上限 `CAP = 60` 行**(`supabase/functions/ai-assistant/tools.ts:19`)。list_open_issues / list_materials / list_contacts / get_dailies 全部 `.limit(60)`。資料 >60 時 AI 只見到 60 行,「點數都唔會多過真實」。
2. 🔴 **冇「淨計總數」路徑**。AI 答「幾多個」係**自己數返工具回傳嗰批行**(LLM 數長 list 本身唔準 —— 例:聯絡人見到 60 行都只數到 34;物料 60 行只數到 29)。冇 `count(*)` 工具。
3. 🔴 **PTW 冇專用 list/count 工具**。問「幾多 PTW 生效中」→ AI 唯有用 `get_daily_brief`(只列**即將到期**嗰批,封頂 10)→ 答 10,唔係 active 總數 36。
4. ✅ **數量細(≤60 + 啱數)時準**:今日日誌 10=10、待批核 0=0、分區判斷合理 —— 證明邏輯啱,問題純粹係 **數量規模 + 無真‧count**。

> 真實工地一個 project 好少 >60 open issues / 95 聯絡人;呢個出入主要係 sim 累積數據谷大暴露出嚟。但**一旦某類記錄過 60,AI 報數就會偏低兼誤導 PM**。

## 建議修(edge function,要重新 deploy)
- **A.** 「幾多/總數」類問題:工具回傳真‧`count`(`head:true` count)+ 頭 N 條樣本,唔好靠 AI 數行。
- **B.** 加 **list/count_ptw** 工具(PTW 而家冇),唔好靠 get_daily_brief 充當總數。
- **C.** CAP 回傳時明確標註「只顯示頭 60 條,可能仲有」,等 AI 唔會當係全部。
- (低風險、唔郁 schema;但要 redeploy ai-assistant edge function。)

## ✅ 已修 + 已部署 + 已驗證 (2026-06-22)
改 `supabase/functions/ai-assistant/tools.ts` + `index.ts`,CLI deploy 咗 ai-assistant:
- 每個 list 工具加真‧`total_count`(head exact count,RLS-bounded)+ `showing`/`truncated`;物料加 `not_arrived_count`。
- 新增 **`list_ptw`** 工具(PTW 總數/狀態)。
- system prompt 加規則 9:答「幾多」一定用 total_count,唔好自己數 items(最多 60)。

**重問同樣 8 條(同一份 [TEST] data)→ 報數全部啱返:**
| 問題 | 真實 | 修前 | 修後 |
|---|---|---|---|
| 未解決問題 | 75 | 62 | **75 ✅** |
| 物料未到 | 55 | 29 | **55 ✅** |
| PTW 生效 | 36 | 10 | **36 ✅**(用 list_ptw)|
| 聯絡人 | 95 | 34 | **95 ✅** |
| 今日日誌 | 10 | 10 | 10 ✅ |
| 待批核 | 0 | 0 | 0 ✅ |
AI 仲會主動講「列表截斷,只顯示頭 60,實際總數 95」。出入清零。
