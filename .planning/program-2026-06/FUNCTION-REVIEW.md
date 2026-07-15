# CK工程 — 全功能審查報告（2026-06-17）

> 由 14-區多 agent workflow 產出：14 個功能區 mapped、68 個候選問題 → **對抗式逐個 verify**（試refute）。
> 結果：**12 個確認真問題** · 29 個假陽性已剔走 · 1 個待確認 · **~27 個後段候選問題未驗證**（撞正 session limit，4:30pm reset 後可 resume 補完）。
> 重點：**冇 critical／high 真問題**。3 個 medium 值得修，其餘 low／打磨。

---

## Part 1 — 每個功能點運作（白話流程）

1. **登入／申請帳戶** — 手機號＋密碼登入（系統內部轉 `<手機>@phone.local` 合成 email）。新用戶撳「申請帳戶」填手機/姓名/工作email/密碼 → 建 auth 帳戶＋user_profiles。Profile 頁改資料、刪帳戶（有未完成簽核會暫時 block）。
2. **項目／成員／角色／審批** — admin 開項目、派 PM。用戶申請加入某項目某角色 → PM/admin 審批 → 成已批成員。8 種角色，權限按每個項目獨立。
3. **進度表** — 開大/中/細項樹；有權角色喺細項更新（5 模式：%/樓層/清單/量度/單位狀態）；改動入 append-only 歷史；上層自動加總。
4. **問題追蹤** — 任何成員報問題（影相）；按角色自動定處理人 → 判頭→總承建商→PM 升級鏈；留言、解決、重開；全程記錄。
5. **工地指令 SI → 變更指令 VO** — PM 出 SI；衍生 VO（伺服器計港幣）；經審批鏈逐步簽核；批後鎖定。
6. **工作許可證 PTW** — 開證（動火/高空/吊運/棚架/電力/升降機）填 checklist＋工人＋相 → 提交 → 審批鏈電子簽核（高危要安全主任＋二步驗證）→ active → 地盤掃 QR 核實 → 火警看守計時 → 完工/到期。
7. **圖則／文件** — 上載 → 版本化 → 送審 → 批准/拒絕/重新送審/撤回；連住進度項目。
8. **機械／表格** — 機械登記冊（有效/到期 KPI）＋法定表格；簽核要先驗證資格證書＋電子簽名。
9. **物料／施工日誌** — 落物料單、改狀態；每日施工日誌（出勤/機械/上下晝天氣/天文台警告），有權角色填。
10. **行事曆／聯絡人** — 加事件（會議/檢查）；聯絡人通訊錄。
11. **天氣／EOT** — 實時天文台警告 banner；惡劣天氣記錄＋工期延長（EOT）申索佐證。
12. **AI 站長** — 廣東話問工地狀況，AI 喺你權限範圍內讀真數據作答＋天氣/記憶工具。
13. **模組開關／簽名認證／審計帳本／二步驗證** — admin 按項目開關模組；高風險操作密碼重認證＋簽名證書；所有關鍵改動入防篡改 hash 鏈帳本，一鍵 verify。
14. **匯出／離線／推送／首頁** — PM 匯出 Excel/PDF 報告；離線可讀唔可寫；OneSignal 推送審批/簽核通知；首頁/儀表板睇待辦＋KPI。

---

## Part 2 — 發現嘅問題（已 adversarially 驗證，按嚴重度）

### 🟠 Medium（值得修，無 critical/high）

| # | 功能 | 問題 | 喺邊 | 建議修正 |
|---|------|------|------|---------|
| 1 | **PTW 安全** | **admin_override 可以頂走「安全主任」必簽步驟** — schema 註明 PTW 要拒絕但實際冇做。Admin 可推動火/密閉空間許可證過咗安全主任簽核（audit 有記但控制冇實施）| `v10-submit-approval-add-ptw.sql:78`, `v10-split/3-trg-approval-ptw-branch.sql:111-151`, `PtwApproverBar.tsx:200` | submit_approval/dispatch 入面：`p_action_type='admin_override' AND p_doc_type='ptw' AND 步驟 required_role='safety_officer'` → raise exception；同時 PtwApproverBar 嗰步 disable「管理員指派」 |
| 2 | **機械／表格** | **安全主任被 DB 擋住** — canManage 畀佢見到「新增機械/表格」UI，但 `can_edit_project_progress` 唔包 safety_officer → 佢填完彈「沒有權限」。呢個功能正正係為安全主任而設 | `v3-progress-schema.sql:69`, `v55:142/157/228`, `EquipmentContext.tsx:81-90` | `can_edit_project_progress` 加返 `safety_officer`（或開個包佢嘅 helper 俾 equipment/forms 寫入路徑用）；**唔好**反過來收窄 client |
| 3 | **圖則** | **withdrawVersion 非原子** — 撤回版本 + 重設 current_version_id 分開兩步，撞正另一個 client 上載新版會 race，令「現行版」指返舊版（自癒，無數據遺失）| `DrawingsContext.tsx:390-442` | 開個 `withdraw_drawing_version(p_version_id)` RPC 一個 transaction 搞掂（照 documents 嘅 `withdraw_document_version`），client 改 call RPC |

### 🟡 Low（打磨 / 邊緣 case）

| # | 功能 | 問題 | 建議 |
|---|------|------|------|
| 4 | 登入 | 申請帳戶時 auth 建咗但 profile insert 失敗（罕有 race）→ 留低 orphan，嗰個手機號自助註冊會被鎖死，要 admin 喺 Dashboard 清 | 加 `delete_orphan_auth_by_email()` RPC，signUp 失敗時自動清 |
| 5 | 登入 | 刪帳戶被 block 時「通知管理員」掣寫去 `demo_feedback`（冇 admin UI 睇）→ 顯示「已通知」但其實石沉大海（**注**：AdminUsers 已有「查看待處理簽核」可重新分派，admin 有得救）| 改寫去 admin 會見到嘅 channel／或拿走誤導嘅「已通知」字 |
| 6 | 登入 | 合成 email 帳戶**冇忘記密碼/恢復路徑**；換手機號就登入唔到（要 admin 介入）| 加 admin 改手機+email 嘅 RPC；長遠加 reset 流程 |
| 7 | 項目 | 自我審批成員申請（RLS 冇查申請人≠審批人）→ 只係 audit `approved_by=自己`（提權已被 v50 擋；只有 admin 指派嘅 PM 做到，佢本身已有權）| enforce_member_write_gate 加：非 admin 改 status 時 `new.user_id=auth.uid()` → reject |
| 8 | SI/VO | SiApproverBar 委派提示 stale（delegations 冇 realtime）→ 撳完先彈錯（伺服器有 re-check，安全）；VoApproverBar 同樣 | delegations 加 realtime sub，或 hoist DelegationsProvider |
| 9 | 圖則 | drawing_versions realtime 冇 project filter → 多餘 refetch（**唔係**洩漏；table 冇 project_id 欄無得 filter）| onChange 用 drawing_id set 過濾，或 denormalize project_id |
| 10 | 機械 | 簽署資格 gate 用 mount 時嘅 credential → manager 中途驗證咗都唔即時 enable（RPC 伺服器有 re-check，唔會錯簽）| focus 時 refetch / user_credentials realtime |
| 11 | 機械 | get_forms_dashboard RPC 失敗 → KPI 格靜靜消失冇提示 | 格位置顯示「統計暫時無法載入」 |
| 12 | 問題 | 留言不可改/刪（**設計如此**，保 tamper-evident）→ 打錯字無得改 | 加「留言發送後不可修改」提示 |

### ❓ 待確認（1）
- **SI/VO optional_user 步驟**：若 pin 咗某用戶、佢離開項目，非 admin 嘅項目會卡住（admin_override 可救，**唔係**死鎖；報告原本講嘅 FK-cascade orphan 係錯）。建議：optional_user 唔再係成員時 fallback 去 role holders，或加非 admin 提示。

---

## Part 3 — 總評
**App 整體健康良好。** 對抗式審查冇揾到 critical/high 真問題；29 個候選被證實係假陽性（即係防護其實做咗）。安全骨幹（RLS、column guard v50/v69、防篡改帳本、二步驗證）大致紮實。

**最該先修 3 樣（全部圍繞「安全主任」+ 圖則）：**
1. **#1 PTW admin_override 頂走安全主任簽核** — 安全合規關鍵，應堵。
2. **#2 安全主任用唔到機械/表格** — 該角色嘅核心功能壞咗，一行 SQL 修到。
3. **#3 圖則 withdraw race** — 開個 atomic RPC。

---

## Part 4 — 後段 5 區（已補完 review）
AI 站長、模組/簽名/帳本/MFA、行事曆/聯絡人、物料/日誌、匯出/離線/推送 已全部 map + 驗證。
**🟢 模組/簽名/帳本/MFA = 0 問題**（前端隱藏同後端 RLS 一致、密碼唔 log、簽名證書有即時防篡改證據 — 安全骨幹乾淨）。發現：

| Severity | 功能 | 問題 | 喺邊 |
|---|---|---|---|
| **Medium** | 行事曆/事件 | 老總/總承建商成員見到「編輯/刪除」掣但改唔到非自己開嘅事件（撞 RLS）。RLS = 建立人 OR 全域 admin/pm | TimetablePage:258 · EventForm:127 vs v11-events:73-84 |
| Low | AI 站長 | 用戶唔確認嘅 `proposed` 動作永遠殘留（無 TTL/cron；取消唔寫 `declined`）| ai-assistant/index.ts · v56:55 |
| Low | 聯絡人 | `contacts_insert` 三重 gate vs 前端 `canManage`（只睇 global role）唔一致 | v11-contacts:55-68 · ContactsContext:79 |
| Low | 每日日誌 | 日期靠裝置時鐘；時鐘漂移時錯誤訊息誤導 | DailyEdit:206,244-249 |

---

## Part 5 — 修正狀態（已套用 + 驗證）
| Fix | 嚴重度 | 狀態 |
|---|---|---|
| **#1 PTW 安全主任 admin_override guard** | Medium | ✅ **v76 LIVE**（submit_approval guard，執行驗證 has_guard=1）+ PtwApproverBar 隱掣 |
| **#2 安全主任用得返機械/表格** | Medium | ✅ **v77 LIVE**（can_manage_equipment_forms helper，4 policies + next_equipment_ref；safety_officer 實測 can_manage=1）|
| **#3 圖則 withdraw atomic** | Medium | ✅ **v78 LIVE**（withdraw_drawing_version RPC，fn_exists=1）+ DrawingsContext 改 call RPC |
| **#4 行事曆事件 edit/delete gate** | Medium | ✅ TimetablePage `canMutateEvent`（對齊 RLS）|
| 其餘 9+3 low | Low | 未修（打磨級；可日後處理）|

**伺服器修正（v76/v77/v78）已 live 套落 prod，對所有 app 版本即時生效。** 客戶端修正（3 個檔）tsc 通過，需 web deploy + 下個 native build 先到用戶。所有 medium 已清；剩低全部係 low/打磨。
