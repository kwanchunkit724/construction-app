# CK工程 — 真實性模擬測試 workflow (設計,待過目)

> 目標:逐功能模擬**日常運作**,每功能 **≥30 條真 data transaction**(混合角色 + 權限 allow/deny + 輸出),**每條記低**(預期 vs 實際 + pass),全部存成 output file。最後用儲落嘅 data **問 AI 站長**,記低**預期 vs 實際 AI 回覆**,有出入查因。
>
> 狀態:**設計草擬。OK / 改完先執行(逐功能跑 + 逐功能匯報)。** 出貨(#1)等全部 debug+sim 完先一次過。

---

## 0. 同之前(權限測試)分別
- 之前 = 驗「邊個角色做唔做到」(allow/deny 正確性,逐項 rollback,**唔留 data**)。
- 今次 = **真‧落 data 模擬一日地盤運作**(persist),每功能堆 ≥30 條真 transaction,令 [TEST] 變成有血有肉嘅 dataset → **再畀 AI 答得到嘢**。權限測試**包含喺內**(每功能都有 deny 案確認角色擋到)。

## 1. 環境
- **重用 [TEST] 測試大廈項目**(21 帳號,`CKtest2026`,4 區,32 進度項目)。喺上面堆模擬 data。
- ⚠ 真‧寫入**生產 Supabase**(同 App Store 同一 instance,但 [TEST] sandbox,事後可一鍵清)。
- **補設定**:SI/VO/PTW 要 [TEST] 有 `approval_chain_steps`(而家冇)→ harness setup 會 seed 預設審批鏈(總承→PM 等),否則 submit 會「未配置審批鏈」。

## 2. Harness(點跑)
- **Node script** `supabase/sim/run-sim.cjs`:讀 `.env`(VITE_SUPABASE_URL + ANON_KEY)→ 逐帳號 gotrue password grant 攞 JWT → 以該用戶身分打 PostgREST / RPC(**真 RLS**,真 persist)。純後端、可重跑、寫 file。唔使瀏覽器。
- 每條 transaction 記錄 schema:
```json
{ "feature":"進度", "seq":7, "ts":"...", "actor":"一座工人(62010004)",
  "action":"update progress_items.actual_progress=60 (A1.1.2)",
  "expected":{"outcome":"allow","detail":"被派 leaf 可改"},
  "actual":{"http":204,"ok":true,"detail":"1 row"},
  "pass":true }
```

## 3. 每功能 ≥30 transaction(日常運作 + 權限覆蓋)
每功能混 **(a) 日常 allow**(主流程)+ **(b) 權限 deny**(角色擋)+ **(c) 輸出**。舉例:

| 功能 | ~30 tx 內容(例) |
|---|---|
| **進度** | 4 區工人/判頭打 actual_progress + 樓層 + 數量(allow);MC/PM 加中項/改派(allow);判頭加大項(deny);工人改未派 leaf(deny);寫 progress_history |
| **問題** | 各角色報問題 + 即時問題(allow);判頭→總承→PM 升級鏈;留言;解決/重開;工人改非自己(deny);偽造 reporter(無效) |
| **工地指令 SI** | 判頭/總承開單→提交→步0 總承批→步1 PM 批→鎖;業主開單(deny);非提交人 submit(deny);鎖後 protest |
| **變更指令 VO** | 開單→提交→總承→PM→業主批;client 改金額(deny);獨立 vs SI-linked |
| **工作許可證 PTW** | 開單→提交→**安全主任簽步0**→總承步1→active;關單(火警監察≥30min);admin override 安全步(deny);掃 QR 核實 |
| **機械/表格** | 加機械(MC/安全 allow,判頭 deny);開表格項;**持牌人簽表格**(allow)/ 無牌簽(deny);核實證書(PM/安全 allow);印 QR |
| **每日日誌** | PM/老總/總承寫今日(allow);判頭/工人寫(deny);補尋日(deny);改自己今日 |
| **物料** | 判頭/總承落料單;改自己/別人(deny=R1);收貨記 qty_arrived;工人落單(deny) |
| **行事曆** | PM/老總/總承加事件(allow);判頭加(deny);改自己 |
| **聯絡人** | PM 加/改/刪(allow);判頭加(deny);成員睇 |
| **文件/圖則** | 判頭/MC/老總上載文件;判頭/老總上載圖則(deny);提交審批→MC/PM/老總批;自審自(deny);撤回 |

> 每功能實際清單會喺 harness 列明(seq 1..30+),你逐功能匯報時見到全部。

## 4. Output 儲存(實現 export output)
位置:**`.planning/sim-runs/<run-id>/`**
- `<feature>.json` — 該功能全部 transaction 記錄(逐條 expected/actual/pass)
- `master.csv` — 全部 transaction 一行一條(Excel 開到)
- `summary.md` — 逐功能 pass/fail 統計 + 失敗詳情 + 樣本
- `ai-queries.json` — AI 查詢階段(見 §5)
> 「export output」= harness 將每條 transaction **匯出成 file**(JSON+CSV+MD)。app 本身嘅 PDF/Excel 匯出(client 產生)係另一回事 —— Stage D 已驗 + 你手動下載核中文;如果你**要埋 app 真‧匯出檔**入 sim,我會喺 preview 跑指定匯出再收圖/檔(講明邊幾個)。

## 5. AI 站長 查詢階段(最後)
data 堆好後,以 PM 身分問 AI 站長(經 ai-assistant edge function)。每條記 **問題 / 預期答 / 實際答 / 一致? / 出入原因**:

| 問題(例) | 預期(由 data 推) |
|---|---|
| 今日工地概況 | 列開放問題數 / 即將到期 PTW / 遲料 / 待批 |
| 邊個分區進度最落後? | data 入面 % 最低嗰區 |
| 而家有幾多個未解決問題? | = open issues count |
| 邊張工作許可證即將到期 / 過期? | = expiring/expired PTW |
| 邊啲工序未有方法聲明文件? | = 冇 MS doc 嘅工序 |
| 邊個判頭最多未完成項目? | = data 統計 |

> 出入 → 查係 (a) data 問題 (b) RPC/get_daily_brief 邏輯 (c) prompt (d) model。逐條記低 + 結論。

## 6. 執行 cadence
逐功能:harness 跑該功能 → 寫 file → **匯報**(pass/fail 統計 + 失敗 + output 路徑)→ 你睇冇問題 → 落下一功能。11 功能完 → AI 階段 → 總結。發現 bug 即修(同之前)。

## 7. 待你拍板(過目重點)
1. **環境**:重用 [TEST] 堆 data,OK?定開一個全新 `[SIM]` 項目(唔撈亂 [TEST] 權限基準)?
2. **每功能 30 條夠?** 定要更多(如 50)?
3. **「export output」**:= harness 嘅 JSON/CSV/MD(我推薦,乾淨)?定你**仲要** app 真‧PDF/Excel 匯出檔(我喺 preview 逐個跑收檔)?
4. **AI 查詢**:用上面嗰批問題?有冇你特別想試嘅問法?
5. **日期模擬**:transaction 全部當「今日」,定要散落幾日扮一星期(影響日誌/EOT/到期邏輯)?
6. **跑法**:逐功能停低匯報(慢、細緻),定一次過跑晒 11 功能再一份大報告(快)?

冇改 → 我建 harness + seed 審批鏈,由「進度」開始逐功能跑。
