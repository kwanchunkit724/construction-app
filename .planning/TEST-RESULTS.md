# CK工程 — 權限測試結果 (2026-06-22)

測試環境:**[TEST] 測試大廈項目**(prod Supabase,4 區 一座/二座/三座/外圍,21 帳號,32 進度項目)。
方法:REST harness(真‧登入 / `set role` + jwt claims,RLS 真執行)+ preview UI 視覺核對。
詳見 [TEST-PROGRAM.md](TEST-PROGRAM.md) / [TEST-PROGRAM-CONTROLS.md](TEST-PROGRAM-CONTROLS.md)。

## 修補(測試前)
| # | 問題 | 修 |
|---|---|---|
| R1 🔴 | 物料 update 冇 per-row 擁有權(v59 冚返 v16)| v101:requester OR supervisor + module gate |
| R2 | 日誌可補/前報(冇日期鎖)| v101:HKT 當日鎖(admin 可補)|
| R3 | 非成員 admin 讀唔到日誌(v59 甩 admin 分支)| v101:補返 admin 分支 |
| R4 | 安全主任加得機械但 mint 唔到 QR | v101:mint gate → can_manage_equipment_forms |
| 亂碼 | VO/表格簽核/天氣EOT PDF 用子集字體 | export.ts → htmlToPdfBlob(html2canvas 系統字)|

## Stage A — 可見性(全 ✅,搵到 2 個問題並修)
- PM/老總 睇晒 32;業主/安全主任 0;判頭/工人 只本區(0 跨區洩漏)。
- **A1**(修 v102):工程師/管工(main_contractor)原本睇晒全 4 區(live RPC 用 can_manage 做 see-all)→ 收窄到只睇被指派+祖先(同判頭)。
- **A2**(修 v102):收窄原本只喺 RPC,raw API 漏全部(判頭 raw select=32)→ 落 table SELECT policy server-side enforce(判頭 raw=6)。
- 重測:工程師 6 / 管工 3 / 判頭 6 / 工人 3(0 跨區);PM/老總 32;業主/安全 0。✅

## Stage B — 逐角色「用」權限(全 ✅,搵到 1 個 bug 並修)
- Gate matrix(9 角色 × 6 RLS 閘 = 54):全對。
- 實際寫入(16 案):全對(含 R1/R2 寫入層)。
- 問題(8 案):**B-bug** — 當前 handler 升級被 RLS 拒(issues UPDATE 冇明確 WITH CHECK → PG 用 USING 做新行檢查,handler 改咗就唔 match)。
- **修 v103**:issues UPDATE 加 `WITH CHECK (true)`,合法性由 v69 BEFORE-UPDATE guard 把關。重測:handler 升級✅、非法跳級 deny✅、偽造 reporter_id 無效(guard coerce)✅。

## Stage C — R1–R4 REST 重測(全 ✅)
判頭改別人料單 deny · PM 寫尋日 deny · 非成員 admin 讀日誌 ✅ · 安全主任 mint allow / 判頭 mint deny。

## Stage D — UI / 視覺(我可做嗰部分 ✅)
- `/test-roles` 20 帳號切換頁正常。
- 判頭登入 → 進度表只見一座(二/三/外圍「尚未有進度項目」),**冇「+加入大項」**(非 manager)。
- PM 登入 → 32 項、4 區齊、有「+加入大項」+ ⋮ 選單(manager 控制)。
- 全程 console 零 error。
- **未覆蓋(交你):** 下載出嚟嘅 PDF/Excel 內容(中文亂碼確認)+ 40 個輸出 + 567 控件逐個手動過(用 CONTROLS 清單)。preview 開唔到下載檔,要你喺裝置下載核對。

## 套用嘅 migration
v101(R1–R4)· v102(進度可見性收窄+server enforce)· v103(問題升級 WITH CHECK)。全部 live 套用 + 執行核實。export.ts 3 個 PDF 轉 html2canvas。

## [TEST] 殘留樣本資料(俾你手動測用,可隨時刪)
1 張料單(管工)· 2 個問題 · 1 份今日日誌(PM)· 1 部機械(挖掘機,可測 QR)。
