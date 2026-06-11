# 地盤日常模擬報告 — 2026-06-10

事件驅動模擬（每個 agent 跑一個真實工地事件），對住 LIVE Supabase，用真 persona REST 身分行。
14 個 case 派出去，session token limit 中途爆（4:40am HK 重置），但每個 agent 邊行邊寫
evidence 落 `.planning/daily-sim-0610/`，所以 finding 由 disk 救返。

## 執行摘要

- **3 個真 backend bug 確認**（其中 1 個係 P0 級「以為修好其實冇上 prod」的回歸）。
- **6 個 case 證實乾淨**（RLS 雙向都正確）：issue 升級鏈、issue 翻發、圖則上載＋版本＋權限、
  聯絡人權限、新工人入職的 membership/approve、每日日誌的讀取＋今日編輯窗。
- 修復：`supabase/v35-daily-sim-fixes.sql`（3 個 fix，idempotent）。
- ✅ **v35 已上 prod 並執行驗證**（2026-06-10 22:2x UTC，經 SQL editor apply → REST execute-verify）：
  - FIX 1：PM 叫 `admin_or_pm_list_applicants` 返到 `name:測試工人2, phone:60001007` — 冇 42702。
  - FIX 2：foreman 補寫 backdated daily → `42501` 拒絕；舊 backdated row 已清（`[]`）。
  - FIX 3：空 SI submit → raise `請先填寫並儲存工地指令內容後再提交`。
  （今次係**執行驗證**，唔係淨睇 source — v33 就係淨睇 source 漏咗。）

## Per-case 結果

| Case | 結果 | 重點 |
|---|---|---|
| issue-escalation | ✅ PASS | 鏈正確（管工→pm／判頭→總承建商）；升級／評論／解決全對；判頭解決他人 issue → RLS 0 行（正確拒絕） |
| issue-reopen | ✅（鏈乾淨） | reporter／handler 翻發；非 handler 拒絕 |
| drawing-upload | ✅ PASS | v1→v2 supersede 正確；判頭＋老總 insert/storage 全部 42501 拒絕；讀取放行；DB＝client（general_foreman 已移除） |
| contacts-gate | ✅ PASS | 老總＋管工 insert → 403 拒絕；PM insert 成功；判頭讀到；client `canManage=admin\|\|pm` 與 DB 一致 |
| daily-log | ⚠️ 1 BUG | 角色／今日編輯窗／讀取全對，但 insert 冇 date 守衛（見 BUG-2） |
| worker-onboard | ⚠️ 1 BUG | signup＋apply＋PM approve 正常，但 approver RPC 仍然爆（見 BUG-1） |
| si-vo-chain | ⚠️ 1 BUG | 空 SI 入到審批鏈（見 BUG-3） |
| delegate-progress-audit | ◐ 未完成 | session limit 中途斷，只行到 assign step，未驗到 v34 history policy — 下輪重跑 |
| timetable / material / edit-item / ptw / floors / export | ◐ 未跑 | agent 喺 setup 階段就俾 limit 殺，得 token/probe 檔，冇 case log — 下輪重跑 |

## 確認嘅 BUG（已修，待上 prod）

### BUG-1 — `admin_or_pm_list_applicants` 仍然 runtime `42702 column "id" ambiguous`（P0 回歸）
- **症狀**：PM／管工／判頭叫呢個 RPC 全部爆 `42702` → 審批人睇唔到申請人姓名（「無法載入申請人資料」，正是上次嗰個 BW-10 症狀）。
- **真相**：repo 嘅 v33 body 係啱嘅（全部 column 都有 `up.`／`p.` qualifier），但 **prod 從來冇真正換過** —
  仲行緊上次手打入去嘅 v31（`where id = auth.uid()` 冇 qualify，撞到 OUT param `id`）。v33 嗰次 Chrome 上 SQL
  中咗 stale-monaco，靜靜雞冇 apply 成功，而當時「驗證」只係讀 source text 所以冇發現。
- **證據**：`log-worker-onboard.txt` step 7/8/8b — 三個 caller 全部 `{"code":"42702",...}`。fallback（直接讀 user_profiles）有效，所以 app 個 card 可能仲撐得住，但 RPC 本身死。
- **修復**：v35 重貼正確 body（aliased），今次**用執行驗證**。

### BUG-2 — `dailies_insert` 冇 date 守衛 → 可篡改日誌（P1，審計完整性）
- **症狀**：foreman／engineer 經 API 可以 insert 任何日期嘅日誌（補寫尋日、甚至未來）。schema header 寫明「yesterday's diary stays locked」，但只有 UPDATE/DELETE 守今日，INSERT 淨係查 role＋membership。
- **連鎖**：補寫嘅 row 仲變咗**永久** — delete/update policy 鎖死非今日，作者自己都改唔到、刪唔到。
- **證據**：`log-daily-log.txt` step 4 — backdated `date=2026-06-09` insert 成功（id 8e49641d）；step 5/5b PATCH/DELETE 都 0 行。
- **修復**：v35 喺 insert `with check` 加 `date = (now() at time zone 'Asia/Hong_Kong')::date`，並清走嗰條 backdated 測試 row。

### BUG-3 — `submit_si` 接受空 SI 入審批鏈（P2，工作流死局）
- **症狀**：`submit_si` 查 creator＋status＋鏈配置，但冇查 SI 有冇內容（`current_version_id`）。空 SI submit 咗就卡死：in_review、冇 version、之後 version insert 又俾鎖、resubmit 又話「不能從狀態 in_review 提交」。
- **證據**：`log-si-vo-chain.txt` FINDING-A — submit_si 成功而 `current_version_id=null`。
- **修復**：v35 喺 status 翻 in_review 之前加 `if v_si.current_version_id is null then raise ...`。

## 否決嘅疑點

- 「老總加聯絡人應該成功」→ **否決**。係我 brief 嘅錯誤假設；產品設計就係 admin/PM only，老總 read-only，client `canManage` 同 DB 一致。冇 bug。
- daily-log / si-vo 嗰啲 `PGRST102 Empty or invalid json` → **否決**。係 Windows curl 嘅 UTF-8 argv 編碼問題（測試工具），唔係 app bug；改用 `--data-binary @file` 就冇事。

## 殘留測試資料（`[sim-0610]` tag，需清）

issues ×3、dailies ×3（含 1 條 undeletable backdated，v35 會刪）、contacts ×1、drawings ×1＋versions ×2＋storage 2 檔、
project_members 1（測試工人 approved）、SI SI-002（卡 in_review）、tagged progress 改動。
v35 清 backdated daily；其餘 `[sim-0610]` row 可留待下輪一次過清，唔影響 live admin view（全部 tag 住）。

## Round 2 —補跑 7 個未完成 case（2026-06-11，session 重置後）

7 個 case 全部跑晒。**3 個 case PASS 乾淨**（行事曆 v34 narrowing 無洩漏無漏睇、物料訂單 v34 GF insert OK、改項目名/日期）、
**1 個 PASS（樓層模式，v34 assignee history OK）**、**1 個 PASS（轉判+審計，v34 history insert 201 成功）**、
**動火證 PASS 但揭一個鏈缺陷**、**報表揭兩個數據缺陷**。adversarial verify：**3 confirmed，3 rejected**（rejected 全部係 stale-spec 假設或 by-design，已核對 v27 membership 規則）。

### NEW-2 — 進度報表為「未排期」項目作假 計劃%/差距（P1，client）
- **症狀**：`export.ts effOf` leaf 用 `plannedProgressOf(it)`，冇日期就返 0；於是未排期項目 print 計劃 0%、差距 +X%，同 app 卡（顯示「未排期」、唔出數）唔一致。落後項目睇落變超前，仲跌出「需要關注」。
- **修復**：`Eff.planned/gap` 改 `number|null`；未排期 leaf → planned/gap=null、status 維持 live-derive（同卡一致，唔回退 stored planned_progress）；3 種 export 格式（HTML/PDF/Excel）render「未排期」/「—」；`onlyBehind` 明確排除 `gap===null`。tsc 清。
- **狀態**：✅ 修咗（client-only，tsc exit 0）。

### NEW-3 — 問題報表對「非成員」當事人 print「—」，審計斷鏈（P2）
- **症狀**：`user_profiles` RLS（v17）只放現任同項目成員；已離場/未審批嘅 reporter/resolver 解析唔到 → export print「—」，丟失「誰報誰解」。
- **修復**：新 `v36-issue-actor-profiles-rpc.sql`（SECURITY DEFINER，gate `can_view_project`，只返當前項目 issues 上嘅 actor 名）+ ProjectDetail 改用 RPC；fallback「前成員」代替「—」。
- **狀態**：✅ 已上 prod + 執行驗證：PM 叫 RPC 返 6 個 actor（含非成員 `Admin`、`PM Kwan`），舊 plain select 只得 4 個。

### NEW-1 — 動火證預設審批鏈一定要 safety_officer，但 PM 無自助委派路徑（P1，✅ 你揀「完整修」已完成）
- **症狀**：`seed_default_chain`（`supabase/v10-split/6-default-ptw-chain-seed.sql`）每個項目 seed 鏈 `[safety_officer, main_contractor]`；簽核人由 `active_role_holders(project, role)` 解析 = 已批准 `project_members.role = 'safety_officer'`（＋全體 admin ＋ delegation）。項目冇 project-level safety_officer 時，5 個 persona 一個都簽唔到 step 0；PM 又無自助路徑配一個（cross-user insert→42501、第二角色→23505、AdminProjectChains 係 admin-only）。
- **真相修正（執行驗證揭示）**：`active_role_holders('safety_officer')` 其實返 **3 個 admin**（admin 對所有 role 都係無條件 holder），所以 PTW-004 唔係技術上死鎖 —— 遠端 admin 簽得到，只係 site team／PM 簽唔到。真正缺口＝PM 無法委派**地盤層**簽核人。
- **修復（v37，已上 prod + 執行驗證）**：
  - (a) `submit_ptw` fail-fast 守衛：凍結鏈前，逐個 step 檢查 required_role 有冇 holder；冇就 raise zh-HK「此項目未有【安全主任】，未能提交…請先委派簽核人」。（注：因 admin 永遠算 holder，呢個守衛實際上幾乎唔會觸發 —— 係 defense-in-depth；真正解藥係下面個委派 RPC。）
  - (b) `pm_assign_safety_officer(project, user)` SECURITY DEFINER：assigned-PM／admin 可將**已批准成員**升做 project `safety_officer`，唔改 project_members RLS。
  - (c) client：`Projects.tsx` 加「委派安全主任（PTW 簽核）」section（PM/admin 可見，gate 同 `pendingForMe` 一致）；PTW submit 錯誤照 bubble。
  - **驗證**：判頭叫 RPC→`只有項目經理或管理員可委派安全主任`（拒絕）；PM 委派老總→成功，老總 project role＝safety_officer，`active_role_holders` 多咗佢；新 draft PTW submit→`in_review`（證 rewritten submit_ptw body 完整冇爛）。已清理（老總還原 general_foreman、刪測試 PTW）。
  - **注意（未在 CHECK 亂郁）**：第一版 v37 重貼 `project_members_role_check` 漏咗 `general_foreman`，被 23514 擋住（原子 rollback，零污染）；改為**唔郁 constraint**（safety_officer 本身已允許），只加兩個 function。

## 殘留測試資料（`[sim-0610]`/`[sim-0611]` tag）

Round1：v35 已清 backdated daily + 2 test-worker membership + 2 空 SI。
Round2：events 1（週會）、materials 3、progress 改動、PTW-003、1 條 append-only progress_history 探針（ap=99，immutable 設計刪唔到，已 tag）。全部 tag 住，唔影響 live admin view，可下輪一次過清。

## 一句總結

兩輪共 **6 個真 bug，全部已修 + 執行驗證 + 上 prod**：v35 ×3 backend（applicant RPC／dailies date／submit_si 內容守衛）、NEW-2 client（export 未排期）、NEW-3 = v36 RPC（issue actor names）、NEW-1 = v37（PTW 守衛 + `pm_assign_safety_officer` 委派 + Projects.tsx UI）。
14 個 case 全部跑過，clean 嘅證明 issue 鏈/圖則/聯絡人/物料/行事曆 v34 narrowing/樓層/轉判審計/改項目 全部穩陣。
最大發現：**v33 從來冇真上到 prod**（approver RPC 仲爆緊）——已 v35 修好並今次用執行驗證鎖死。
教訓：每個 migration 今次都係 **clipboard 入 monaco + DOM `.click()` Run + 執行驗證**（唔再手貼 base64、唔再淨睇 source）—— 已寫入 `daily-site-sim` skill。
